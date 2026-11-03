"""Synthetic phone input only; no CCTV, Android hardware, or paid AI calls."""
import base64
import hashlib
import io
import json
import sys
import time
from pathlib import Path

import nbformat
import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / ".notebook-test-deps"))
sys.path.insert(0, str(TOOLS))
from live_streaming import LiveEngine


def jpeg(size=(64, 48)):
    buffer = io.BytesIO();Image.new("RGB", size, "white").save(buffer, format="JPEG");return buffer.getvalue()


@pytest.fixture
def api(tmp_path):
    from fastapi import FastAPI, HTTPException
    from fastapi.testclient import TestClient
    from starlette.concurrency import run_in_threadpool
    engine = LiveEngine(lambda image: ([{"label": "chair", "confidence": .8}], base64.b64encode(jpeg()).decode()), None, tmp_path)
    ns = {"app": FastAPI(), "HTTPException": HTTPException, "live_engine": engine,
          "json": json, "base64": base64, "run_in_threadpool": run_in_threadpool}
    exec((TOOLS / "live_api.py").read_text(encoding="utf-8"), ns)
    exec((TOOLS / "phone_relay_api.py").read_text(encoding="utf-8"), ns)
    client = TestClient(ns["app"])
    yield client, engine, {"Authorization": "Bearer " + ns["LIVE_API_TOKEN"]}
    engine.stop()
    if engine.session:
        for worker in engine.session["threads"]:worker.join(timeout=3)


def test_private_phone_routes_reject_missing_and_wrong_tokens(api):
    client, engine, headers = api
    for path in ["/phone/start", "/phone/test/frame", "/phone/test/stop"]:
        assert client.post(path, json={}).status_code == 401
        assert client.post(path, json={}, headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert engine.session is None
    assert client.post("/phone/start", json={"max_calls": 11}, headers=headers).status_code == 422
    assert client.post("/phone/start", json={"use_claude": True}, headers=headers).status_code == 409


def test_phone_frame_to_detections_and_session_isolation(api):
    client, engine, headers = api
    started = client.post("/phone/start", json={}, headers=headers)
    assert started.status_code == 201
    id = started.json()["session_id"]
    assert client.post("/phone/start", json={}, headers=headers).status_code == 409
    assert client.post("/phone/stale/stop", headers=headers).status_code == 409
    image_headers = {**headers, "Content-Type": "image/jpeg"}
    response = client.post(f"/phone/{id}/frame", content=jpeg(), headers=image_headers)
    assert response.status_code == 202
    deadline = time.monotonic() + 3
    while engine.snapshot()["latest"] is None and time.monotonic() < deadline:time.sleep(.01)
    result = client.get("/live/status", headers=headers).json()
    assert result["latest"]["detections"][0]["label"] == "chair"
    assert result["claude_calls"] == 0
    assert client.get("/live/frame.jpg", headers=headers).status_code == 200
    assert client.post(f"/phone/{id}/stop", headers=headers).json()["active"] is False
    assert client.post(f"/phone/{id}/frame", content=jpeg(), headers=image_headers).status_code == 409


def test_bad_and_oversized_frames_do_not_reach_detection(api):
    client, engine, headers = api
    id = client.post("/phone/start", json={}, headers=headers).json()["session_id"]
    path = f"/phone/{id}/frame"
    assert client.post(path, content=b"bad", headers={**headers, "Content-Type": "text/plain"}).status_code == 415
    headers = {**headers, "Content-Type": "image/jpeg"}
    for raw, expected in [(b"", 400), (b"not jpeg", 400), (b"\xff\xd8\xffinvalid", 400), (b"x" * 1_400_001, 413), (jpeg((1921, 1080)), 400)]:
        assert client.post(path, content=raw, headers=headers).status_code == expected
    assert engine.snapshot()["latest"] is None


def test_tapo_notebook_preserves_combined_source_and_defaults():
    nb = nbformat.read(ROOT / "downloads/KakiKitaAI_Tapo_C200_Colab.ipynb", as_version=4)
    nbformat.validate(nb)
    assert nb.metadata.kakikita_phone_relay_source.sha256 == hashlib.sha256((ROOT / "downloads/KakiKitaAI_Combined_Mobile_Webcam.ipynb").read_bytes()).hexdigest()
    code = "\n".join(cell.source for cell in nb.cells if cell.cell_type == "code")
    assert '"phone_relay_available": True' in code
    assert 'SHOW_PHONE_TOKEN = False' in code and 'CAPTURE_WEBCAM_PHOTO = False' in code
    assert 'diffusers' not in code and 'sk-ant-' not in code
    assert all(not cell.outputs and cell.execution_count is None for cell in nb.cells if cell.cell_type == "code")
