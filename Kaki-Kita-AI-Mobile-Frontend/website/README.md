# Kaki Kita AI — PROJECT KITA

An integrated private workspace based on the user’s Lovable website at https://kakikitaai.lovable.app and the selected `KakiKitaAI_Claude.ipynb` notebook. Existing room records, uploads, and reports remain in their original D1/R2 storage.

## Features

### Mobile app and caregiver flows

Kiki is an inline SVG room mascot with gentle blinking, waving and a tap greeting.
The garden background and tap sparkles use CSS; no new asset library or image API
is needed. The language picker keeps its native accessible select, with a custom
visual treatment. Calm mode is available on Home, in the desktop sidebar and in
the mobile More menu. It persists in this browser, stops UI animation/tilt, and
honours the device's reduced-motion preference. Motion stays off until the saved
preference has loaded; background animation pauses when the tab is hidden. Tap
effects are capped at six and never intercept clicks or keyboard focus.

The full site is an installable mobile web app, with Home, Vision, Watch, Tasks
and More in a bottom navigation bar. More opens every remaining feature.
The root app manifest starts at `/`; the original Kita Clear shortcut remains
available at `/checklist`. No private room data is cached by the service worker.

Vision and Watch use four real steps: choose one photo/video, review it and
choose a room, explicitly start the AI check, then view results. Selecting a
file stays on step 1; saving happens only after the review step. Analysis only
starts on Check, and retrying after analysis failure reuses the saved file.
Results link to the same report and Kita Clear checklist. Existing library
uploads and full reports remain available. Touch targets and body text are
larger on mobile; languages and the guided introduction remain available.

Room results now show at most three short Quick points. New caregiver notebook
reports request three plain-language `key_points` of at most eight words each.
Old reports use whole short observations and neutral checks based on the report's
topics. Long cautions are never cut into reassuring fragments. Full AI notes and
JSON remain available under More information.

`android/` is a complete Android Studio WebView project with an official
checksum-verified Gradle wrapper. It supports camera/gallery, persistent app
cookies, report saving and safety print/PDF. See `android/README.md` to build
an APK. It uses the public website and requires internet. App storage is
separate from the phone browser, so an existing browser guest workspace is
not automatically copied into the Android app. No compiled/device-tested APK
is included in this source repository.

Core controls are bundled in eight common caregiver languages. Other text and
150+ selectable languages use the configured notebook's Haiku `/translate`
endpoint, with owner-scoped caching and daily forwarding quotas. Choosing a
language never changes canonical room types, saved labels or status values.

The AI-generated After-photo feature has been removed. Vision results, the room
library, and Kita Clear show the uploaded photo or its YOLO object annotations.
Uploading or analyzing a photo no longer starts an image-generation job, and the
old generation routes return 404. No image-generation API or GPU image model is
required. Use `KakiKitaAI_Claude_Mobile_Backend.ipynb`, based on the selected
`KakiKitaAI_Claude.ipynb`, for the mobile analysis API. Core room analysis still
uses the model selected in that notebook.

Additional checks: `node scripts/check-mobile.mjs`,
`node scripts/check-caregiver.mjs` and, against the built local Worker,
`node scripts/check-caregiver-integration.mjs`. The integration check covers
translation isolation, original-photo access, disabled generation routes, and
cleanup of legacy generated files when their original media is deleted.
Historical database tables remain for compatibility; this update does not purge
saved uploads, reports, checklists, or legacy image records.

- First-visit guided tour: eight steps spotlight the real controls, with Back/Next, Skip, keyboard arrows/Escape, and replay from the header/sidebar. Completion or skipping is remembered in this browser's `kaki-kita-tour-v1` preference. The tour does not upload files, change records, or call AI. Finishing can open the first-room form or the community directory.
- Getting-started milestones use actual room, upload, API-configuration, and report counts. Feature, room, and team cards support subtle mouse-driven 3D tilt and highlights; touch and reduced-motion preferences disable the effect.

- `/`: Project KITA home, four feature introductions, and the original community illustration.
- `/vision`: room selection, photo upload, mobile camera picker, connection checks, and links into saved room analysis.
- `/watch`: uploaded video playback and analysis of frames at 10%, 50%, and 90%. Audio and other moments are not analyzed. No live CCTV connection.
- `/safety`: six human-review items, three statuses, notes, optional room association, cloud persistence, and browser print/PDF output. Unsaved changes trigger a navigation warning.
- `/kopi`: combined name/address, postal-code and category search; provider and map links; source attribution; and pagination. Choose the official data snapshot or the notebook’s uploaded GeoJSON directory.
- `/about`: team members, project purpose, and responsible-use context from the Lovable website.
- `/library` and `/reports`: saved room information, original media, manual room notes, separate YOLO and Claude findings, annotated images, and JSON export.
- `/settings`: test/save the notebook connection, switch to the shared Lovable API address, or explicitly disconnect.
- `/checklist`: Kita Clear, a mobile-focused companion app linked from the main navigation and saved reports. A photo/video upload or saved report becomes a persistent, owner-scoped removal checklist. Check and undo individual objects, filter remaining/cleared/all items, add missed items manually, and reopen previous lists. New inputs use the existing notebook analysis API; cached reports avoid another AI call. Video uses the analysed frame with the most non-person/non-animal detections rather than adding repeated objects across frames. Checks record a person's actions, not verified removal or safety. Concurrent stale edits return a conflict instead of overwriting newer work. Deleting original media also removes its checklist.

Uploads accept JPEG/PNG/WebP (12 MB each) and MP4/WebM/MOV/AVI (25 MB each). Playback and frame capture depend on browser codecs; H.264 MP4 or WebM is most portable. A successful `/health` verifies configuration, not successful AI inference.

## API contract and access

The main website and `/checklist` both open publicly without a ChatGPT account and use one shared browser workspace. Both establish the same opaque 256-bit HttpOnly, SameSite=Lax guest cookie (Secure on HTTPS, 180-day lifetime), hash it into a separate `guest:` record owner, and authorize every data request against that owner. A Kita Clear upload appears in the main room library with the same file ID, saved analysis, and checklist progress. Kita Clear links directly to that file in `/library?room=...&media=...`; the library shows checklist progress and a link back. Lists and files refresh when returning to the tab. The home-screen app manifest covers the full site so its main-site links stay within the same installed web-app workspace. Guest settings show whether the shared engine is configured, without exposing its URL or offering configuration changes.

This is a shared browser workspace, not an email/password account. As requested, the same browser connects both views. Keep its cookie: clearing browser data loses access, and opening another browser or phone creates a separate workspace. Existing signed-in Sites accounts continue using their original user ID and records; no guest/account merging is performed.

Public usage has atomic daily UTC allowances: 100 AI frame requests across the site, 25 per workspace, and 50 per network; a video consumes three requests. All three scan budgets are reserved together: blocked attempts consume none, while forwarded failures still count. Budgets reset at 00:00 UTC (8:00 AM Singapore time), and scan errors identify the workspace, network or site cap. Uploads are capped at 200 MB/day across the site and 50 MB/day per workspace; room creation at 100/day site-wide and ten rooms per guest browser. Saved checklists and checking/undo remain available after a scan allowance is reached. Quota records expire after 31 days and are cleaned in batches. Upstream notebook/ngrok authentication is managed separately; these limits cover this website's forwarding, not direct calls to a separately exposed notebook.

`KakiKitaAI_Claude.ipynb` provides `/health`, `/detect`, and `/services`. Reports use `analysis`, `analysis_provider`, and `models.vision_reasoning`; old `claude`/`gemini` report fields remain readable. Visible report headings use the saved model metadata, so historical reports keep the correct provider name.

The server uses `KITA_API_BASE` as the shared default, configured through Sites environment variables. Per-user settings override it, including an explicit empty value to disconnect. The shared URL came from the published Lovable configuration and can change when ngrok restarts. The Anthropic key stays in Colab Secrets and is never needed by this website.

Sites supplies optional signed-in identity; anonymous main-site and checklist visitors use the isolated guest owner described above. All records and file requests are authorized server-side. The legacy `/api/connection-check` diagnostic now requires signed-in identity because the outer Site audience is public. Both `/` and `/checklist` open without signing in; existing account records are not published.

## Directory data

`data/community-services.json` contains an attributed snapshot fetched from:

- MSF Social Service Agencies: https://data.gov.sg/datasets/d_736e30b5a0111242dfde98d7b32cfda2/view
- MOH Eldercare Services: https://data.gov.sg/datasets/d_f0fd1b3643ed8bd34bd403dedd7c1533/view

Run `node scripts/refresh-community.mjs` to regenerate it from the official download APIs. The snapshot records its retrieval timestamp and per-source counts. HTML table attributes in older GeoJSON are read as plain text; source HTML is never rendered. Missing contact details and locations are not guessed. Listings are not a live availability or eligibility feed. Notebook searches disclose when its 500-record endpoint limit truncates the uploaded directory.

The homepage illustration was imported from the user’s published Lovable site. Team credits remain Arya, Jonathan, Niko, Adie, and Asami.

## Development and verification

### Tapo C200 through Android and Colab

Watch opens **Live camera** by default, with **Choose a video** beside it. Live camera opens a private
native screen in the updated Android project (1.1); browser users see setup
instructions. The phone reads C200 RTSP on the same Wi-Fi, relays sampled JPEG
frames directly to Colab over HTTPS, and displays live boxes/items. Use the new
`KakiKitaAI_Tapo_C200_Colab.ipynb`; the earlier combined notebook lacks `/phone/*`.
No camera password, RTSP URL, or live token is stored in the website database.
Camera credentials and the token stay in Android activity memory. Closing the
native view stops its session. The app keeps no raw-video recording; Colab keeps
temporary detections/logs under its existing bounded session behavior. The native
APK requires a new build/install; a website deployment alone cannot add RTSP to
an existing Android build. See `android/README.md` for setup and test limits.

Requires Node 22.13+. `npm run dev` starts the local preview. Visit `/signin-with-chatgpt?return_to=/` for the loopback-only development identity. Production sign-in remains owned by Sites.

- `node scripts/check-scan-quota.mjs`: real SQLite checks for atomic scan reservations, all three caps, blocked retries and video costs.
- `node scripts/check-scan-quota-integration.mjs`: built local Worker/D1 check; uses a synthetic image and an `example.com` test subdomain, never an AI provider.
- `node scripts/check-app.mjs`: focused validation, provider compatibility, safe data parsing, URL and media boundaries.
- `npx tsc --noEmit`: TypeScript check.
- `npm run db:generate`: append a migration after schema edits.
- `npm run build`: build the Worker.
- `npm start`: start the built local Worker on port 8787.
- `node scripts/check-integration.mjs`: local auth, storage, isolation, safety and directory checks.
- `node scripts/check-live-integration.mjs <HTTPS notebook URL>`: optional local Worker test using a synthetic image. This makes one real Claude request and uses API credits.

After building, apply each unapplied local SQL migration using the command below, replacing the filename in migration order. Do not replay applied migrations.

```
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_massive_scorpion.sql
```

`0000_overrated_colonel_america.sql` creates the original room tables. `0001_massive_scorpion.sql` adds safety reviews. Local and hosted data are separate; Sites applies committed migrations during publication. Keep the existing `.openai/hosting.json` project identity and DB/BUCKET bindings.

AI observations and checklists support awareness, not certified accessibility or safety decisions. The Colab API remains a demonstration service; this website does not add authentication to that separate public ngrok service.
