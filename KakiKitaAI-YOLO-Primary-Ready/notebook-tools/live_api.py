# Read-only live output is private even when the existing API is exposed by ngrok.
import asyncio
import secrets
from fastapi import Depends, Header, Request
from fastapi.responses import Response, StreamingResponse

LIVE_API_TOKEN = globals().get("LIVE_API_TOKEN") or secrets.token_urlsafe(32)

def require_live_token(authorization: str = Header(default="")):
    expected = "Bearer " + LIVE_API_TOKEN
    if not secrets.compare_digest(authorization.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=401, detail="A live-output Bearer token is required.")

@app.get("/live/status", dependencies=[Depends(require_live_token)])
def live_status():
    return live_engine.snapshot()

@app.get("/live/frame.jpg", dependencies=[Depends(require_live_token)])
def live_frame():
    jpeg = live_engine.frame_jpeg()
    if jpeg is None:
        raise HTTPException(status_code=409, detail="No analysed frame is available yet.")
    return Response(jpeg, media_type="image/jpeg", headers={"Cache-Control": "no-store"})

@app.get("/live/events", dependencies=[Depends(require_live_token)])
async def live_events(request: Request):
    async def events():
        previous = None
        while not await request.is_disconnected():
            status = live_engine.snapshot()
            # Elapsed time changes even when no new frame arrives: keeps the connection alive.
            encoded = json.dumps(status, ensure_ascii=False)
            if encoded != previous:
                yield "event: result\ndata: " + encoded + "\n\n"
                previous = encoded
            if status.get("session_id") and not status["active"]:
                break
            await asyncio.sleep(0.7)
    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})

@app.get("/live/results.jsonl", dependencies=[Depends(require_live_token)])
def live_log():
    try:
        text = live_engine.log_text()
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    return Response(text, media_type="application/x-ndjson",
                    headers={"Content-Disposition": 'attachment; filename="kakikita-live-results.jsonl"',
                             "Cache-Control": "no-store"})

print("Protected live output routes registered; the webcam is still closed.")
