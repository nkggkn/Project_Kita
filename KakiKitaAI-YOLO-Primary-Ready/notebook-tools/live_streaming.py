"""Embedded in the Colab notebook; no separate files are needed there."""
import base64
import io
import json
import secrets
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import cv2
from PIL import Image


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def youtube_url(value):
    """Accept a public YouTube video/live URL, never an arbitrary network target."""
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError("Enter a public YouTube Live URL.")
    parsed = urlparse(value.strip())
    hosts = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}
    if (parsed.scheme != "https" or parsed.hostname not in hosts
            or parsed.username or parsed.password or parsed.port not in (None, 443)):
        raise ValueError("Use an https://youtube.com or https://youtu.be live URL.")
    parts = parsed.path.strip("/").split("/")
    if parsed.hostname == "youtu.be":
        valid = len(parts) == 1 and bool(parts[0])
    else:
        valid = ((parsed.path == "/watch" and bool(parse_qs(parsed.query).get("v")))
                 or (len(parts) == 2 and parts[0] == "live" and bool(parts[1]))
                 or (len(parts) == 2 and parts[0].startswith("@") and parts[1] == "live"))
    if not valid:
        raise ValueError("Use a watch, youtu.be, /live/VIDEO_ID or /@channel/live link.")
    return value.strip()


def resolve_youtube(value):
    import deno
    import yt_dlp

    class QuietLogger:
        def debug(self, message):
            pass
        def warning(self, message):
            pass
        def error(self, message):
            pass

    options = {
        "format": "best[height<=720][vcodec!=none]/best[vcodec!=none]",
        "noplaylist": True, "quiet": True, "no_warnings": True,
        "socket_timeout": 15, "retries": 1, "extractor_retries": 1,
        "js_runtimes": {"deno": {"path": deno.find_deno_bin()}},
        "logger": QuietLogger(),
    }
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(youtube_url(value), download=False)
    except Exception:
        raise RuntimeError("YouTube could not be opened. Check that the broadcast is live and public. "
                           "YouTube may block Colab/cloud IPs; try the USB webcam instead. "
                           "For extractor changes, rerun the dependency installation cell.") from None
    if not info or not info.get("is_live") or not info.get("url"):
        raise ValueError("This link is not an active public live broadcast. Start the broadcast first.")
    return info["url"]


class LiveEngine:
    def __init__(self, detect, describe, log_dir):
        self.detect = detect
        self.describe = describe
        self.log_dir = Path(log_dir)
        self.session = None
        self.control_lock = threading.RLock()
        self.claude_lock = threading.Lock()

    def start(self, source, url="", use_claude=False, interval=30, max_calls=5):
        if source not in ("webcam", "youtube"):
            raise ValueError("Choose webcam or youtube.")
        if source == "youtube":
            url = youtube_url(url)
        if not 30 <= float(interval) <= 600 or not 1 <= int(max_calls) <= 10:
            raise ValueError("Claude interval must be 30–600 seconds, with 1–10 calls per session.")
        if use_claude and self.describe is None:
            raise ValueError("Set ENABLE_CLAUDE=True and configure ANTHROPIC_API_KEY, then rerun setup.")
        with self.control_lock:
            old = self.session
            if old and any(t.is_alive() for t in old["threads"]):
                raise ValueError("Stop the current session first; allow up to 20 seconds for source cleanup.")
            session_id = secrets.token_hex(8)
            self.log_dir.mkdir(parents=True, exist_ok=True)
            state = {
                "id": session_id, "source": source, "url": url,
                "stop": threading.Event(), "condition": threading.Condition(),
                "threads": [], "pending": None, "captured": 0,
                "started": time.monotonic(), "last_input": time.monotonic(),
                "active": True, "status": "Waiting for webcam frames" if source == "webcam" else "Opening YouTube",
                "error": None, "seq": 0, "latest": None, "jpeg": None,
                "use_claude": bool(use_claude), "interval": float(interval),
                "max_calls": int(max_calls), "calls": 0, "next_claude": 0,
                "claude": None, "claude_status": "Waiting for first frame" if use_claude else "Disabled",
                "log": self.log_dir / f"kakikita-live-{session_id}.jsonl",
            }
            state["log"].touch(exist_ok=False)
            self.session = state
            processor = threading.Thread(target=self._process, args=(state,), daemon=True)
            state["threads"].append(processor)
            if source == "youtube":
                reader = threading.Thread(target=self._read_youtube, args=(state,), daemon=True)
                state["threads"].append(reader)
            for worker in state["threads"]:
                worker.start()
            return {"session_id": session_id, "source": source}

    def _end(self, state, message, error=None):
        with state["condition"]:
            state["stop"].set()
            state["active"] = False
            state["status"] = message
            if error:
                state["error"] = error
            state["condition"].notify_all()

    def stop(self, session_id=None):
        with self.control_lock:
            state = self.session
            if state and (session_id is None or session_id == state["id"]):
                self._end(state, "Stopped")
        return self.snapshot()

    def _offer(self, state, image):
        with state["condition"]:
            if state["stop"].is_set():
                return
            state["captured"] += 1
            state["last_input"] = time.monotonic()
            state["pending"] = (image, state["captured"], utc_now())
            state["condition"].notify()

    def push_frame(self, session_id, data_url):
        state = self.session
        if not state or state["id"] != session_id or state["source"] != "webcam" or state["stop"].is_set():
            raise ValueError("This webcam session has ended. Start a new session.")
        if not isinstance(data_url, str) or len(data_url) > 2_000_000 or not data_url.startswith("data:image/jpeg;base64,"):
            raise ValueError("Expected a JPEG frame below 1.5 MB.")
        raw = base64.b64decode(data_url.split(",", 1)[1], validate=True)
        with Image.open(io.BytesIO(raw)) as source:
            if source.width * source.height > 1920 * 1080:
                raise ValueError("Webcam frames must be at most 1920 × 1080 pixels.")
            image = source.convert("RGB")
        image.thumbnail((960, 720))
        self._offer(state, image)
        return {"accepted": True}

    def _read_youtube(self, state):
        cap = None
        try:
            stream_url = resolve_youtube(state["url"])
            if state["stop"].is_set():
                return
            cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG, [
                cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 10000,
                cv2.CAP_PROP_READ_TIMEOUT_MSEC, 10000,
            ])
            if not cap.isOpened():
                raise RuntimeError("The live video could not be decoded. Check the broadcast and try again.")
            while not state["stop"].is_set():
                ok, bgr = cap.read()
                if not ok:
                    raise RuntimeError("YouTube stopped sending frames. The stream ended or the connection failed.")
                image = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
                image.thumbnail((960, 720))
                self._offer(state, image)
        except Exception as exc:
            if not state["stop"].is_set():
                # Never expose a signed media URL or provider credentials in results.
                message = str(exc) if isinstance(exc, (ValueError, RuntimeError)) else "Video source failed; check the live URL and connection."
                self._end(state, "Source error", message)
        finally:
            if cap is not None:
                cap.release()

    def _append(self, state, event):
        with state["log"].open("a", encoding="utf-8") as output_file:
            output_file.write(json.dumps(event, ensure_ascii=False) + "\n")

    def _process(self, state):
        try:
            while not state["stop"].is_set():
                cycle_start = time.monotonic()
                if cycle_start - state["started"] >= 600:
                    self._end(state, "10-minute session limit reached; start again to continue")
                    break
                if cycle_start - state["last_input"] > (90 if state["source"] == "youtube" else 30):
                    self._end(state, "Source timeout", "No new frames arrived. Restart the source.")
                    break
                with state["condition"]:
                    if state["pending"] is None:
                        state["condition"].wait(timeout=0.5)
                        continue
                    image, frame_id, captured_at = state["pending"]
                    state["pending"] = None
                detections, annotated = self.detect(image)
                jpeg = base64.b64decode(annotated, validate=True)
                with state["condition"]:
                    if state["stop"].is_set():
                        break
                    state["seq"] += 1
                    event = {
                        "type": "frame", "session_id": state["id"], "seq": state["seq"],
                        "source": state["source"], "captured_frame": frame_id,
                        "captured_at": captured_at, "processed_at": utc_now(),
                        "width": image.width, "height": image.height,
                        "detection_count": len(detections), "detections": detections,
                    }
                    self._append(state, event)
                    state["latest"], state["jpeg"] = event, jpeg
                    state["status"] = "Live — processing latest frames"
                if (state["use_claude"] and state["calls"] < state["max_calls"]
                        and cycle_start >= state["next_claude"] and self.claude_lock.acquire(blocking=False)):
                    with state["condition"]:
                        # stop() may have run while inference finished.
                        if state["stop"].is_set():
                            self.claude_lock.release()
                            break
                        state["calls"] += 1
                        state["next_claude"] = time.monotonic() + state["interval"]
                        state["claude_status"] = f"Analysing frame {event['seq']} (call {state['calls']}/{state['max_calls']})"
                    threading.Thread(target=self._describe, args=(state, image, detections, event), daemon=True).start()
                # shortcut: sample at up to 2 FPS; use a dedicated video server for sustained high-FPS inference.
                state["stop"].wait(max(0, 0.5 - (time.monotonic() - cycle_start)))
        except Exception:
            self._end(state, "Analysis error", "Frame processing or log writing failed. Rerun setup and restart the session.")

    def _describe(self, state, image, detections, event):
        try:
            if state["stop"].is_set():
                return
            report = self.describe(image, detections)
            summary = {"type": "claude", "session_id": state["id"], "frame_seq": event["seq"],
                       "captured_at": event["captured_at"], "completed_at": utc_now(), "analysis": report}
            with state["condition"]:
                if not state["stop"].is_set():
                    self._append(state, summary)
                    state["claude"] = summary
                    state["claude_status"] = "Session call limit reached" if state["calls"] >= state["max_calls"] else "Waiting for next interval"
        except Exception:
            with state["condition"]:
                if not state["stop"].is_set():
                    state["claude_status"] = "Claude failed; disabled for this session. Check key, model, credits and connectivity. YOLO continues."
                    state["use_claude"] = False
        finally:
            self.claude_lock.release()

    def snapshot(self, include_image=False):
        state = self.session
        if not state:
            return {"active": False, "status": "Ready", "session_id": None, "latest": None}
        with state["condition"]:
            result = {
                "active": state["active"], "session_id": state["id"], "source": state["source"],
                "status": state["status"], "error": state["error"], "latest": state["latest"],
                "claude": state["claude"], "claude_status": state["claude_status"],
                "claude_calls": state["calls"], "claude_max_calls": state["max_calls"],
                "elapsed_seconds": round(time.monotonic() - state["started"], 1),
            }
            if include_image and state["jpeg"]:
                result["jpeg_base64"] = base64.b64encode(state["jpeg"]).decode("ascii")
            return result

    def frame_jpeg(self):
        state = self.session
        if state:
            with state["condition"]:
                return state["jpeg"]
        return None

    def log_text(self):
        state = self.session
        if not state:
            raise ValueError("Start a live session first.")
        with state["condition"]:
            return state["log"].read_text(encoding="utf-8")
