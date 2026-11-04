# Kaki Kita AI

**Your AI Kaki. Looking Out for All of Us.** · PROJECT KITA hackathon prototype

Developed by : Adie Fazil(Team Leader), Arya, Niko, Jonathan , Asami

Kaki Kita AI helps people, caregivers and volunteers check rooms and walkways for things that
could get in the way: clutter, cables, bags, steps and other possible obstacles. Take a photo,
record a short video, or point a live camera at a space. The AI marks what it sees and suggests
simple, cautious next steps you can tick off.

- **Live prototype:** https://kita-vision-room-library.subtleberet2.chatgpt.site/
- **Android test app:** [`kaki-kita-android-test.apk`](Kaki-Kita-AI-Mobile-Frontend/website/public/downloads/kaki-kita-android-test.apk)

> ⚠️ AI results can be incomplete or wrong. Kaki Kita AI is not a certified accessibility
> audit and does not guarantee safety. Always check the space yourself.

---

## Contents

1. [What's in this repository](#1-whats-in-this-repository)
2. [How it works](#2-how-it-works)
3. [Before you start](#3-before-you-start)
4. [Start the AI backend (Google Colab)](#4-start-the-ai-backend-google-colab)
5. [Connect the website](#5-connect-the-website)
6. [Install the Android app](#6-install-the-android-app)
7. [Using Kaki Kita AI](#7-using-kaki-kita-ai)
8. [Understanding the results](#8-understanding-the-results)
9. [Running the website on your own computer](#9-running-the-website-on-your-own-computer)
10. [Troubleshooting](#10-troubleshooting)
11. [Working on the project as a team](#11-working-on-the-project-as-a-team)
12. [Security and responsible use](#12-security-and-responsible-use)

---

## 1. What's in this repository

| Item | What it is |
|---|---|
| `KakiKitaAI_Final_Colab.ipynb` | **The AI backend. Start here.** Runs in Google Colab: YOLO object detection, RT-DETR confidence support, 61 custom labels, Claude reports, live camera and the API the app talks to. |
| `KakiKitaAI-YOLO-Primary-Ready/models/` | The custom YOLO-World model (`yoloworld_custom.safetensors`) and its 61 labels. The notebook needs these. |
| `KakiKitaAI-YOLO-Primary-Ready/downloads/` | Other notebooks: Tapo C200 camera, model comparator, and the earlier combined webcam backend. |
| `KakiKitaAI-YOLO-Primary-Ready/notebook-tools/` | Python source, tests and scripts used to build the notebook (for developers). |
| `Kaki-Kita-AI-Mobile-Frontend/website/` | The Kaki Kita website (Next.js): Home, Vision, Watch, Kita Clear, My rooms, Community help, languages. |
| `Kaki-Kita-AI-Mobile-Frontend/website/android/` | The Android app project, plus a ready test APK in `website/public/downloads/`. |

`KakiKitaAI_Final_Colab.ipynb` is the same file as `KakiKitaAI_YOLO_Primary_Colab.ipynb` in the
YOLO folder; it is copied to the top so it's easy to find.

## 2. How it works

```
 Phone / browser                     Website server                   Google Colab (AI backend)
 ───────────────                     ──────────────                   ─────────────────────────
 Take photo / video  ───────────▶    Kaki Kita website  ──HTTPS──▶    YOLOv8n  (main detector)
 Live camera / Tapo  ──frames──▶                         (ngrok)      RT-DETR  (confidence support)
                                                                      YOLO-World (61 custom labels)
 Results, boxes,     ◀───────────    saves rooms,        ◀──────────  Claude   (written report)
 checklist                           reports, tasks
```

- The **AI backend** runs in a Colab notebook. **ngrok** gives it a public HTTPS address.
- The **website** (and the Android app, which opens the website) sends photos to that address.
- Your Anthropic and ngrok keys stay inside Colab. The website and app only need the address.

## 3. Before you start

You need:

| What | Where to get it |
|---|---|
| Google account | For Google Colab (colab.research.google.com) |
| Anthropic API key, with credits | console.anthropic.com → API Keys. Used for the written reports. |
| ngrok authtoken (free) | dashboard.ngrok.com → Your Authtoken |
| Chrome or Edge | For Colab and the camera features |
| Android phone (optional) | For the Android app and the Tapo camera feature |

## 4. Start the AI backend (Google Colab)

Do this every time you want the app's AI to work. It takes about 5–10 minutes the first time.

### 4.1 Prepare the model ZIP (one time)

The notebook asks you to upload a ZIP containing the custom model. The ZIP must have the
`models` folder **at its top level**:

1. Open `KakiKitaAI-YOLO-Primary-Ready` in File Explorer.
2. Right-click the **`models`** folder (not the whole `KakiKitaAI-YOLO-Primary-Ready` folder)
   → **Send to → Compressed (zipped) folder**. On Windows 11 choose **Show more options** first.
3. You get `models.zip`. You can rename it to `KakiKitaAI-YOLO-Primary-Ready.zip`.

Inside, it must look like `models/yoloworld_custom.safetensors` and `models/custom_labels.json`.
If you zip the outer folder instead, the upload fails with a "There is no item named
models/…" error.

### 4.2 Open the notebook and add your keys

1. Go to colab.research.google.com → **File → Upload notebook** → choose
   `KakiKitaAI_Final_Colab.ipynb`.
2. **Runtime → Change runtime type → T4 GPU** (strongly recommended; three detectors are slow on CPU).
3. Click the 🔑 **Secrets** icon on the left and add:
   - `ANTHROPIC_API_KEY`: your Anthropic key
   - `NGROK_AUTH_TOKEN`: your ngrok token

   Turn on **Notebook access** for both.

### 4.3 Run it

1. Close any other Colab notebook that uses the same ngrok account. Only one can use the
   address at a time (otherwise you get `ERR_NGROK_334`).
2. Click **Runtime → Run all**.
3. At section **4b**, a **Choose Files** button appears. Upload the ZIP from 4.1.
   Later runs in the same session reuse it.
4. Wait for the run to finish. Red "dependency" warnings during installation are normal.

### 4.4 Check it worked and copy the address

- Section **8** should print `Verified health` with `custom_ready: True` and
  `custom_label_count: 61`.
- Section **11** prints **Mobile app API base URL**, for example
  `https://xxxx.ngrok-free.app`. **Copy this.** You'll paste it into the website.
- Test it: open `<that address>/health` in a browser (click **Visit Site** if ngrok shows a
  warning). You should see `"status": "ok"`. `<that address>/docs` lets you try a photo.

### 4.5 Get the private live token (only for the Android live camera)

In the last cell, **Private phone connection**, set `SHOW_PHONE_TOKEN = True` and run only that
cell. Copy the URL and token into the Android app. Then set it back to `False`, run the cell
again, and never post the token anywhere.

### 4.6 Keep it running

- Keep the Colab tab open. If Colab disconnects, the AI stops; run everything again.
- The address usually **changes each time**. Update the website (section 5) after every restart.
- To stop: in cell **W7**, set `STOP_BACKEND = True` and run that cell, or use
  **Runtime → Disconnect and delete runtime**.

### 4.7 Optional switches in the notebook

These are in section **2** and are off by default, so **Run all** never opens a camera or makes
a paid test call:

| Switch | Turn on to… |
|---|---|
| `ENABLE_CLAUDE` | `False` = object detection only, no written reports, no Anthropic cost |
| `RUN_IMAGE_TESTS` | Upload a test photo during setup (costs one Claude report) |
| `UPLOAD_SERVICE_FILES` | Upload Singapore community-service GeoJSON files for `/services` |
| `RUN_COMPARISON_PHOTO` | Compare all three detectors on one photo (no Claude call) |
| `RUN_COMPARATOR_BENCHMARK` | Measure accuracy on your own labelled test images |

## 5. Connect the website

**Using the published prototype:** open the website, go to **Settings → Kita Vision AI engine**,
paste the address from step 4.4 into **API base URL**, and click **Test & save connection**.
Visitors' screens show "Shared AI engine configured" when it is working.

**Running your own copy:** see [section 9](#9-running-the-website-on-your-own-computer) and set
`KITA_API_BASE` instead.

## 6. Install the Android app

### Quick install (test APK)

1. Copy `Kaki-Kita-AI-Mobile-Frontend/website/public/downloads/kaki-kita-android-test.apk` to
   your phone, or download it from GitHub on the phone.
2. Open it. Allow **Install unknown apps** for your browser or file manager when Android asks.
3. Open **Kaki Kita AI**. It needs internet.

### Build it yourself

1. Install Android Studio and open the `Kaki-Kita-AI-Mobile-Frontend/website/android/` folder.
2. Let Gradle sync, install **SDK 36** if prompted, then **Build → Generate APKs**
   (or run `gradlew.bat assembleDebug` in that folder on Windows).
3. The APK appears in `app/build/outputs/apk/debug/app-debug.apk`.

The app loads the published website. If you host your own copy, change `APP_ORIGIN` in
`website/android/app/build.gradle`. Create your own signing key before sharing a release build.
More detail: `website/android/README.md`.

### Android on your phone's home screen (no install)

Open the website in Chrome on your phone → menu **⋮ → Add to Home screen**.

## 7. Using Kaki Kita AI

On the **Home** screen, Kiki the mascot greets you and asks what you'd like to do. Choose one tile.

### Check a room (Vision)

Every check goes through four steps and **pauses at each one**. Nothing is analysed until you
tap **Check**.

1. **Choose:** take a photo or pick one from your gallery (JPG, PNG or WebP, up to 12 MB).
2. **Review:** make sure the photo shows the area clearly. Retake it if it's dark or blurry.
3. **Check:** tap **Check**. The AI looks at the photo (usually 10–30 seconds).
4. **Results:** see the photo with boxes, short room points, and suggested actions.

Tips for good photos: good light, hold the phone steady, stand back so the whole floor area is
in view, and take more than one angle for large rooms.

### Watch (video or live camera)

- **Video:** choose a short clip (MP4, WebM, MOV or AVI, up to 25 MB). The AI checks three frames
  from it. Sound is not analysed.
- **Live camera:** in the Android app, **Watch → Live camera**. The app sends frames to the
  backend about twice per second and shows boxes as they arrive. Live sessions stop after
  10 minutes. Paid Claude summaries during live view are optional and limited.
- **Tapo C200 camera:** in the Tapo app, create a **Camera Account** under
  *Device Settings → Advanced Settings*, and note the camera's IP under *Device Info*. In the
  Kaki Kita Android app choose **Watch → Live camera → Open Tapo camera**, enter those details,
  the backend URL and the live token (section 4.5). Keep the phone on the same Wi-Fi as the
  camera and keep the app open. Full guide: the first cell of
  `downloads/KakiKitaAI_Tapo_C200_Colab.ipynb`.
- **USB webcam on a laptop (e.g. Logitech C270):** in the Colab notebook, scroll to **W3. Colab
  live dashboard**, click **Allow / refresh camera list**, choose the camera, then **Start live
  analysis**.

### My tasks (Kita Clear)

Suggested actions from a check become a checklist. Tick items off as you clear them. Progress is
saved with the room. The AI does not confirm that items were actually moved: check yourself, or
take a new photo.

### My rooms and Reports

Every photo, video and result is saved under a room so you can come back to it. Reports can be
saved as a file or printed.

### Community help

Search nearby Singapore support services (for example eldercare). Results come from public
data included with the website.

### Settings, languages and Calm mode

- **Language:** choose from the language list at the top. Main controls are translated into
  eight languages.
- **Calm mode:** fewer animations and a quieter screen.
- **Guided tour:** turn on to see tips on each screen again.

Your rooms are private to the browser or app you use. A different browser or phone starts a
separate workspace. Daily analysis limits apply on the shared prototype.

## 8. Understanding the results

| You see | It means |
|---|---|
| Box with a label | An object the AI found, with its confidence score. |
| **Orange** box / `needs_review` | Found only by the custom-label model. Check it yourself. |
| Room points / summary | Claude's plain-language description of the space. |
| Possible obstacles, concerns | Things that *may* get in the way. They are possibilities, not facts. |
| Recommendations | Simple suggested actions; these become checklist items. |
| Limitations | What one photo can't show (depth, measurements, areas out of frame). |
| "Custom labels OFF" | The custom model failed to load; the main detector still works. Rerun section 4b. |

**How detection works:**

- **YOLOv8n is the main detector.** Everything it finds at 25% confidence or more is kept, with
  its own label and box.
- **RT-DETR only supports confidence.** If it agrees on the same object, the displayed score can
  go up. It can never remove, move, rename or add objects.
- **YOLO-World adds 61 custom labels**, such as cable, charging cable, laundry, trash, stairs,
  curb, ramp, wheelchair, walker, white cane, tactile paving, pothole, door and elevator. These
  are marked for review.
- Scores are a guide, not a guarantee. Labels like "hazard", "obstacle" or "tripping hazard" are
  visual guesses; they don't prove something is dangerous, or anything about a person.

The full label list and technical details are in `KakiKitaAI-YOLO-Primary-Ready/START-HERE.md`.

### API (for developers)

| Route | What it does |
|---|---|
| `GET /health` | Backend status, model readiness, custom label count |
| `POST /detect` | Analyse one photo: form field `file`, JPG/PNG/WebP up to 12 MB |
| `GET /services?q=eldercare` | Search the community-service directory |
| `/phone/start`, `/phone/{id}/frame`, `/phone/{id}/stop` | Android live-camera sessions (token needed) |
| `/live/status`, `/live/frame.jpg`, `/live/events`, `/live/results.jsonl` | Live results (token needed) |
| `/webcam/snapshot`, `/webcam/analyze` | Notebook webcam (token needed) |

Browser requests need the header `ngrok-skip-browser-warning: true`. Token routes need
`Authorization: Bearer <live token>`. The interactive reference is at `<address>/docs`.

## 9. Running the website on your own computer

Needs **Node.js 22.13 or newer**. In PowerShell:

```powershell
cd Kaki-Kita-AI-Mobile-Frontend\website
npm ci
npm run build
```

Create the local database once: apply each `.sql` file in `website\drizzle\` in filename order,
replacing `FILE.sql` each time:

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/FILE.sql
```

Create a file `website\.dev.vars` (it is never uploaded to GitHub) containing the backend address:

```
KITA_API_BASE="https://YOUR-TUNNEL.ngrok-free.app"
```

Start the site and open http://127.0.0.1:8787/:

```powershell
npm run start -- --port 8787
```

Use `npm run dev` while editing the interface. Restart after changing `.dev.vars`.

**Where to edit things:**

| What | File |
|---|---|
| Home screen | `website/app/caregiver-home.tsx` |
| Vision and Watch steps | `website/app/capture-guide.tsx` |
| Live camera page | `website/app/live-camera-guide.tsx`, `website/app/watch.css` |
| Kita Clear checklist | `website/app/checklist/removal-app.tsx` |
| Kiki mascot | `website/app/kita-buddy.tsx` |
| Colours and mobile layout | `website/app/tricolor-theme.css`, `website/app/mobile-app.css` |
| Languages | `website/lib/languages.ts`, `website/app/language-provider.tsx` |
| Android screens and camera relay | `website/android/app/src/main/` |
| AI backend logic | `KakiKitaAI-YOLO-Primary-Ready/notebook-tools/` (rebuild the notebook with `python notebook-tools/create_custom_world_notebook.py`) |

Hosting your own public copy needs a new hosting project with D1 (database) and R2 (file
storage). See `website/README.md`.

## 10. Troubleshooting

| Problem | What to do |
|---|---|
| "Add ANTHROPIC_API_KEY in Colab Secrets" | Check the secret's exact name and that **Notebook access** is on. |
| "Choose an available … MODEL_NAME" | Set `MODEL_NAME` in section 2 to one of the model IDs it printed. |
| Errors after installing packages | **Runtime → Restart session**, then **Run all** again. |
| "There is no item named models/…" | Your ZIP has the wrong layout. Zip the `models` folder itself (section 4.1). |
| "checksum mismatch" | The model files were changed. Use the original `models` folder from this repository. |
| `custom_ready: False` | Rerun section 4b and upload the ZIP again. Main detection still works meanwhile. |
| `ERR_NGROK_334` | Another notebook is using your ngrok address. Stop it (dashboard.ngrok.com/agents), rerun section 11. |
| Website says AI not connected | Colab stopped or the address changed. Run all, then paste the new address in Settings. |
| `/detect` returns 502 | Read the `Dual-AI analysis error:` line in Colab. Usually key, credits or rate limit. |
| Very slow | Switch Colab to a **T4 GPU** runtime. |
| Live camera stops | Sessions end after 10 minutes, or when frames stop for 30 seconds. Start again. |
| Tapo camera won't connect | Check the Camera Account (not your Tapo login), the IP, and that the phone is on the camera's Wi-Fi. |
| APK won't install | Allow **Install unknown apps** for the app you opened it from. |

## 11. Working on the project as a team

Get a copy (first time):

```powershell
git clone https://github.com/nkggkn/Project_Kita.git
cd Project_Kita
```

Every time you work on it:

```powershell
git pull                          # get teammates' latest changes first
# ...edit files...
git add -A
git commit -m "Say what you changed"
git push
```

If `git push` is rejected, run `git pull`, then `git push` again. The repository owner adds
teammates under **Settings → Collaborators → Add people**.

## 12. Security and responsible use

- **Never commit keys or passwords:** no Anthropic key, ngrok token, live token, camera password
  or `.dev.vars` file. If one is ever pushed by mistake, revoke it immediately and make a new one.
- Clear notebook outputs (**Edit → Clear all outputs**) before sharing or committing a notebook.
- Anyone with the backend address can send photos and use your Anthropic credits. Share it only
  with your team, and stop Colab when you're done.
- Ask permission before photographing people or other people's homes. Don't upload sensitive or
  identifiable images.
- Kaki Kita AI gives preliminary AI observations to support awareness and discussion. It does not
  certify accessibility, replace an on-site assessment, or guarantee route safety. Confirm
  important decisions with people and reliable local information.

---

**PROJECT KITA** · One Team. One Community. One Future.
Built with Next.js, Ultralytics YOLOv8 / RT-DETR / YOLO-World, the Claude API, FastAPI and ngrok.
