"""Authenticated Android-to-Colab frame input. No camera URL/password is accepted."""
from fastapi import Request
from pydantic import BaseModel, Field


class PhoneSessionSettings(BaseModel):
    use_claude: bool = False
    interval: int = Field(default=30, ge=30, le=600)
    max_calls: int = Field(default=5, ge=1, le=10)


@app.post("/phone/start", dependencies=[Depends(require_live_token)], status_code=201)
def phone_start(settings: PhoneSessionSettings):
    try:
        return live_engine.start("webcam", use_claude=settings.use_claude,
                                 interval=settings.interval, max_calls=settings.max_calls)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@app.post("/phone/{session_id}/frame", dependencies=[Depends(require_live_token)], status_code=202)
async def phone_frame(session_id: str, request: Request):
    state = live_engine.session
    if not state or state["id"] != session_id or state["source"] != "webcam" or state["stop"].is_set():
        raise HTTPException(status_code=409, detail="This live session ended. Start again in the Android app.")
    if request.headers.get("content-type", "").split(";", 1)[0] != "image/jpeg":
        raise HTTPException(status_code=415, detail="Send a JPEG frame.")
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 1_400_000:
            raise HTTPException(status_code=413, detail="Send a smaller camera frame.")
    if not raw or raw[:3] != b"\xff\xd8\xff":
        raise HTTPException(status_code=400, detail="Camera frame is not a JPEG.")
    try:
        frame = "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")
        return await run_in_threadpool(live_engine.push_frame, session_id, frame)
    except Exception:
        raise HTTPException(status_code=400, detail="Frame could not be read, or the session ended. Restart the live view.") from None


@app.post("/phone/{session_id}/stop", dependencies=[Depends(require_live_token)])
def phone_stop(session_id: str):
    if not live_engine.session or live_engine.session["id"] != session_id:
        raise HTTPException(status_code=409, detail="This is not the current live session.")
    return live_engine.stop(session_id)


print("Android phone relay ready. Camera credentials stay on the phone; only sampled JPEG frames reach Colab.")
