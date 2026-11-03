# Kaki Kita AI — mobile frontend and Android project

Open website/ in your code editor, or website/android/ in Android Studio.
This contains the current mobile UI, images/icons, mascot, animations, languages,
guided Vision/Watch flows, Kita Clear, and complete Android source.
The test APK is website/public/downloads/kaki-kita-android-test.apk.

## Edit the interface

- Home: website/app/caregiver-home.tsx
- Vision/Watch steps: website/app/capture-guide.tsx
- Live camera page: website/app/watch/
- Kita Clear: website/app/checklist/removal-app.tsx
- Mascot: website/app/kita-buddy.tsx
- Motion: website/app/playful-experience.tsx and playful.css
- Theme/layout: website/app/tricolor-theme.css and mobile-app.css
- Languages: website/lib/languages.ts and website/app/language-provider.tsx
- Android screens and camera relay: website/android/app/src/main/

## Run locally

Install Node.js 22.13 or newer. In website/ run npm ci, then npm run dev.
For the local Worker build run npm run build. Apply each SQL file in drizzle/
in filename order, once, using this command (replace FILE.sql for each file):

    node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/FILE.sql

Then run npm run start -- --port 8787 and open http://127.0.0.1:8787/.
Local data starts empty. npm run dev is for frontend editing; saved-data features
also need the configured D1/R2 bindings. Required web API routes, schema and
deployment configuration are included because the UI depends on them.

For AI analysis, run your separately supplied YOLO-primary Colab notebook and
set KITA_API_BASE in website/.dev.vars to its printed HTTPS API URL:

    KITA_API_BASE="https://YOUR-TUNNEL.ngrok-free.dev"

Restart the local server after changing this value. Colab notebooks/model weights
are in the separate backend download. Existing analysis allowances still apply.
Extra automatic translations require a backend /translate endpoint; bundled
core-control translations work without it.

## Build Android

Read website/android/README.md. Open website/android/ in Android Studio, sync
Gradle, then generate APKs. On Windows use gradlew.bat assembleDebug.
The Android app loads the published website and requires internet. Set APP_ORIGIN
in website/android/app/build.gradle when hosting your own copy. Frontend edits
must be hosted at that origin to appear in the app.

No API keys, signing keys, local database, uploaded photos or user data are
included. Dependencies/build caches are excluded; install them before building.
The original hosting project ID is removed. A separate deployment needs its own
hosting project and D1/R2 bindings. The ZIP has been checked for integrity and
file hashes; this export does not rebuild or change the app.
