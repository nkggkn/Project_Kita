"""Offline checks: no camera, real YouTube stream, API keys or paid calls."""
import base64
import importlib.util
import io
import json
import sys
import threading
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / ".notebook-test-deps"))
sys.path.insert(0, str(HERE))
import live_streaming as live


def jpeg(value=20):
    buffer = io.BytesIO()
    Image.new("RGB", (80, 60), (value, 40, 60)).save(buffer, format="JPEG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def wait_until(predicate, timeout=4):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError("Timed out waiting for worker")


def push(engine, session_id, value=20):
    return engine.push_frame(session_id, "data:image/jpeg;base64," + jpeg(value))


def finish(engine):
    engine.stop()
    if engine.session:
        for thread in engine.session["threads"]:
            thread.join(timeout=3)
            assert not thread.is_alive()


@pytest.mark.parametrize("url", [
    "https://www.youtube.com/watch?v=test123", "https://youtu.be/test123",
    "https://youtube.com/live/test123", "https://youtube.com/@ourchannel/live",
])
def test_public_youtube_url_forms(url):
    assert live.youtube_url(url) == url


@pytest.mark.parametrize("url", [
    "http://youtube.com/watch?v=x", "https://youtube.com.evil.test/watch?v=x",
    "https://localhost/watch?v=x", "file:///tmp/video.mp4", "https://youtube.com/playlist?list=x",
    "https://user:password@youtube.com/watch?v=x", "https://youtu.be:8080/x",
    "https://youtube.com/watch", "", None,
])
def test_untrusted_urls_are_rejected(url):
    with pytest.raises(ValueError):
        live.youtube_url(url)


def test_newest_frame_replaces_backlog_and_stale_controls_are_rejected(tmp_path):
    entered, release = threading.Event(), threading.Event()
    seen = []
    def detect(image):
        seen.append(image.size)
        if len(seen) == 1:
            entered.set()
            assert release.wait(3)
        return [{"label": "chair", "bbox_xyxy": [1, 2, 30, 40]}], jpeg()
    engine = live.LiveEngine(detect, None, tmp_path)
    session_id = engine.start("webcam")["session_id"]
    try:
        push(engine, session_id)
        assert entered.wait(2)
        for value in range(10):
            push(engine, session_id, value)
        assert engine.session["pending"][1] == 11
        release.set()
        wait_until(lambda: engine.snapshot()["latest"] and engine.snapshot()["latest"]["seq"] == 2)
        snapshot = engine.snapshot(include_image=True)
        assert snapshot["latest"]["captured_frame"] == 11
        assert snapshot["latest"]["width"] == 80
        assert "jpeg_base64" in snapshot
        engine.stop("stale-session")
        assert engine.snapshot()["active"]
        assert len([json.loads(line) for line in engine.log_text().splitlines()]) == 2
        with pytest.raises(ValueError):
            engine.start("webcam")
    finally:
        release.set()
        finish(engine)
    with pytest.raises(ValueError):
        push(engine, session_id)
    new_id = engine.start("webcam")["session_id"]
    try:
        assert new_id != session_id
        with pytest.raises(ValueError):
            push(engine, session_id)
    finally:
        finish(engine)


def test_bad_camera_frames_are_rejected(tmp_path):
    engine = live.LiveEngine(lambda image: ([], jpeg()), None, tmp_path)
    session_id = engine.start("webcam")["session_id"]
    try:
        for data in (None, "data:image/png;base64,abc", "data:image/jpeg;base64," + "x" * 2_000_000):
            with pytest.raises(ValueError):
                engine.push_frame(session_id, data)
        big = io.BytesIO()
        Image.new("RGB", (1921, 1080)).save(big, format="JPEG")
        with pytest.raises(ValueError):
            engine.push_frame(session_id, "data:image/jpeg;base64," + base64.b64encode(big.getvalue()).decode())
    finally:
        finish(engine)


def test_claude_does_not_block_detection_and_obeys_call_limit(tmp_path):
    entered, release = threading.Event(), threading.Event()
    calls = []
    def describe(image, detections):
        calls.append(1)
        entered.set()
        assert release.wait(3)
        return {"overall_summary": "Test report"}
    engine = live.LiveEngine(lambda image: ([], jpeg()), describe, tmp_path)
    session_id = engine.start("webcam", use_claude=True, max_calls=1)["session_id"]
    try:
        push(engine, session_id)
        assert entered.wait(2)
        push(engine, session_id)
        wait_until(lambda: engine.snapshot()["latest"]["seq"] == 2)
        assert len(calls) == 1
        release.set()
        wait_until(lambda: engine.snapshot()["claude"] is not None)
        assert engine.snapshot()["claude"]["frame_seq"] == 1
        engine.session["next_claude"] = 0
        push(engine, session_id)
        wait_until(lambda: engine.snapshot()["latest"]["seq"] == 3)
        assert engine.snapshot()["claude_calls"] == 1
        assert [json.loads(line)["type"] for line in engine.log_text().splitlines()].count("claude") == 1
    finally:
        release.set()
        finish(engine)


def test_claude_error_leaves_yolo_running(tmp_path):
    def describe(image, detections):
        raise RuntimeError("private provider error must not leak")
    engine = live.LiveEngine(lambda image: ([], jpeg()), describe, tmp_path)
    session_id = engine.start("webcam", use_claude=True)["session_id"]
    try:
        push(engine, session_id)
        wait_until(lambda: "Claude failed" in engine.snapshot()["claude_status"])
        assert "private provider" not in json.dumps(engine.snapshot())
        assert engine.snapshot()["active"]
        push(engine, session_id)
        wait_until(lambda: engine.snapshot()["latest"]["seq"] == 2)
        assert engine.snapshot()["claude_calls"] == 1
    finally:
        finish(engine)


def test_idle_and_duration_limits(tmp_path):
    for field, age in (("started", 601), ("last_input", 31)):
        engine = live.LiveEngine(lambda image: ([], jpeg()), None, tmp_path)
        engine.start("webcam")
        engine.session[field] -= age
        try:
            wait_until(lambda: not engine.snapshot()["active"])
        finally:
            finish(engine)


def test_youtube_reader_releases_decoder_and_hides_signed_url(tmp_path, monkeypatch):
    import numpy as np
    released, read_started = threading.Event(), threading.Event()
    class Capture:
        def __init__(self, url, backend, params):
            assert url == "https://media.example/signed-private-url"
            assert params[1] == 10000 and params[3] == 10000
        def isOpened(self):
            return True
        def read(self):
            read_started.set()
            time.sleep(0.02)
            return True, np.zeros((60, 80, 3), dtype=np.uint8)
        def release(self):
            released.set()
    monkeypatch.setattr(live, "resolve_youtube", lambda value: "https://media.example/signed-private-url")
    monkeypatch.setattr(live.cv2, "VideoCapture", Capture)
    engine = live.LiveEngine(lambda image: ([], jpeg()), None, tmp_path)
    engine.start("youtube", "https://youtube.com/watch?v=public")
    try:
        assert read_started.wait(2)
        wait_until(lambda: engine.snapshot()["latest"] is not None)
        assert "signed-private" not in json.dumps(engine.snapshot())
    finally:
        finish(engine)
    assert released.is_set()


def test_youtube_resolver_requires_active_broadcast(monkeypatch):
    info = {"is_live": True, "url": "https://media.example/live.m3u8"}
    class YDL:
        def __init__(self, options):
            assert options["noplaylist"] is True
            assert options["js_runtimes"]["deno"]["path"] == "/mock/deno"
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def extract_info(self, url, download):
            assert download is False
            return info
    monkeypatch.setitem(sys.modules, "deno", SimpleNamespace(find_deno_bin=lambda: "/mock/deno"))
    monkeypatch.setitem(sys.modules, "yt_dlp", SimpleNamespace(YoutubeDL=YDL))
    assert live.resolve_youtube("https://youtube.com/watch?v=test") == info["url"]
    info["is_live"] = False
    with pytest.raises(ValueError, match="not an active"):
        live.resolve_youtube("https://youtube.com/watch?v=test")


def test_protected_api_routes(tmp_path):
    fastapi = pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    engine = live.LiveEngine(lambda image: ([], jpeg()), None, tmp_path)
    namespace = {"live_engine": engine, "json": json, "client": None,
                 "YOLO_MODEL_NAME": "test-yolo", "YOLO_DEVICE": "cpu",
                 "MODEL_NAME": "test-claude", "service_records": []}
    notebook = json.loads((HERE.parent / "downloads/KakiKitaAI_Claude_Live_Colab.ipynb").read_text(encoding="utf-8"))
    backend = next("".join(cell["source"]) for cell in notebook["cells"]
                   if "".join(cell["source"]).startswith("from fastapi import FastAPI"))
    exec(compile(backend, "notebook_backend.py", "exec"), namespace)
    exec(compile((HERE / "live_api.py").read_text(encoding="utf-8"), "live_api.py", "exec"), namespace)
    client = TestClient(namespace["app"])
    assert client.get("/health").json()["claude_enabled"] is False
    assert client.get("/services").json()["services"] == []
    disabled = client.post("/detect", files={"file": ("frame.jpg", base64.b64decode(jpeg()), "image/jpeg")})
    assert disabled.status_code == 503 and "ENABLE_CLAUDE" in disabled.json()["detail"]
    headers = {"Authorization": "Bearer " + namespace["LIVE_API_TOKEN"]}
    for path in ("/live/status", "/live/frame.jpg", "/live/events", "/live/results.jsonl"):
        assert client.get(path).status_code == 401
        assert client.get(path, headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/live/status", headers=headers).json()["status"] == "Ready"
    assert client.get("/live/frame.jpg", headers=headers).status_code == 409
    assert client.get("/live/results.jsonl", headers=headers).status_code == 409
    session_id = engine.start("webcam")["session_id"]
    push(engine, session_id)
    wait_until(lambda: engine.snapshot()["latest"] is not None)
    finish(engine)
    response = client.get("/live/frame.jpg", headers=headers)
    assert response.status_code == 200 and response.headers["content-type"] == "image/jpeg"
    assert Image.open(io.BytesIO(response.content)).size == (80, 60)
    events = client.get("/live/events", headers=headers)
    assert events.status_code == 200 and "event: result\n" in events.text
    data = json.loads(events.text.split("data: ", 1)[1].strip())
    assert data["active"] is False and data["latest"]["seq"] == 1
    assert "jpeg_base64" not in data
    log = client.get("/live/results.jsonl", headers=headers)
    assert log.status_code == 200 and json.loads(log.text.splitlines()[0])["type"] == "frame"
