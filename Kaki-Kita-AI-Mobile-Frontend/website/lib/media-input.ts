const fileUrl = (id: string) => `/api/media/${id}/file`;
export async function videoFrames(id: string) {
  const video = document.createElement("video"); video.preload = "auto"; video.muted = true; video.playsInline = true;
  const wait = (event: string, action: () => void) => new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); video.removeEventListener(event, done); video.removeEventListener("error", fail); };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("This video cannot be decoded. Try MP4 with H.264 video or WebM.")); };
    const timer = window.setTimeout(fail, 20000);
    video.addEventListener(event, done, { once: true }); video.addEventListener("error", fail, { once: true }); action();
  });
  try {
    await wait("loadeddata", () => { video.src = fileUrl(id); video.load(); });
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth) throw new Error("Video duration or picture is unavailable.");
    const canvas = document.createElement("canvas"), scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d"); if (!context) throw new Error("Video frames are unavailable in this browser.");
    const form = new FormData(), times = [];
    // shortcut: three frames sample a clip; use a video model for continuous scene understanding.
    for (const fraction of [0.1, 0.5, 0.9]) {
      const seconds = video.duration * fraction;
      await wait("seeked", () => { video.currentTime = seconds; }); context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Could not capture a frame.")), "image/jpeg", 0.86));
      form.append("frames", blob, `frame-${times.length}.jpg`); times.push(seconds);
    }
    form.append("times", JSON.stringify(times)); return form;
  } finally { video.pause(); video.removeAttribute("src"); video.load(); }
}
