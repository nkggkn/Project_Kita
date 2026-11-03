# Kaki Kita AI — Android APK project

This Android Studio project opens the complete Kaki Kita AI mobile website in
one WebView: Vision, Watch, Kita Clear tasks, rooms, safety checks, community
services, reports, settings and languages. It needs an internet connection and
the published website. The AI features also need the Colab API running.

## Install the test APK

Download version 1.1.2 on your Android phone:
https://kita-vision-room-library.subtleberet2.chatgpt.site/downloads/kaki-kita-android-test.apk?v=1.1.2

Open the downloaded APK and follow Android's installation prompts. Open the
installed **Kaki Kita AI** app, then **Watch > Open Tapo camera**. This is a
debug-signed test build for Android 8 or newer, not a Play Store release.
Install it as an update to 1.1.1. The package and signing certificate are the same;
there is no need to uninstall or clear your app data.

## Build an APK

1. Open this `android` folder in Android Studio. Use a version supporting
   Android Gradle Plugin 8.13.2, Gradle 8.14.4, JDK 17+ and Android SDK 36.
2. Allow Gradle sync and install missing SDK components when Android Studio asks.
3. Choose **Build > Generate App Bundles or APKs > Generate APKs**, or use:

   Windows: `gradlew.bat assembleDebug`

   macOS/Linux: `sh gradlew assembleDebug`

4. The test APK is `app/build/outputs/apk/debug/app-debug.apk`.
5. For distribution, use **Generate Signed App Bundle / APK**, create your own
   signing key, and keep it private. No signing key is included.

The website origin is `APP_ORIGIN` in `app/build.gradle`. It currently points
to the existing public Kaki Kita website. Change it only when hosting your own
copy. Publishing website updates updates what this app displays.

## Included native support

- Photo/video camera capture and gallery selection using system apps.
- Persistent app cookies connect the main website and Kita Clear in this app.
- Back navigation, loading indicator and an offline retry screen.
- Safety review print/PDF and JSON report saving using the system save picker.
- System font scaling and safe insets for status bars, keyboards and gestures.
- Website/API connections use HTTPS; the C200 uses RTSP only on its private Wi-Fi IP. Other websites open externally. No unrestricted JavaScript bridge.
  Native print/save messages are limited to the exact app origin and main frame.
- No camera, microphone or broad storage permission. The user selects media or
  opens their camera; the website/server still validates upload type and size.

Android app storage is separate from Chrome/Safari. Existing browser photos do
not automatically move into the Android app. All views *inside this app* share
one workspace. Clearing app data or uninstalling loses its guest cookie.

The project includes official, checksum-verified Gradle wrapper files.
Version 1.1.2 compiled successfully; all six connection and stream-lifecycle tests passed,
and Android apksigner verified the APK signature. C200 playback and the complete
real-phone relay still need a device test. Signing keys are not included.

## Tapo C200 live view (Android 1.1)

The native Android activity relays camera frames to Colab. No laptop relay or
camera port forwarding is required. The phone must stay on the camera's Wi-Fi
and have internet access. This is a foreground feature: leaving the live screen
stops the stream and releases the player. A home-screen browser shortcut cannot
open the RTSP feed; install the updated APK linked above.

1. In Tapo, create a **Camera Account** under Device Settings > Advanced Settings.
   Find the C200's private IP under Device Info. Use that account, not the Tapo
   cloud login. Do not send these credentials in chat.
2. Run `KakiKitaAI_Tapo_C200_Colab.ipynb`. Copy its Mobile app API base URL and,
   from the final Private phone connection cell, its private live token.
3. In the installed Android app select **Watch > Live camera > Open Tapo camera**.
4. Follow one screen at a time: **Wi-Fi → Camera IP → Camera account → Preview
   → AI connection → Live results**. Each screen waits for your tap.
5. On Preview, tap Connect camera; Next stays unavailable until a picture arrives.
6. On AI connection, enter the HTTPS Colab URL and private live token. The screen
   explains how to show the token in the notebook. Tap Start live AI.
7. View object boxes and item names. Tap Stop when finished.

## Leaving and reconnecting (1.1.2)

Home, switching apps, screen lock, Back from the preview/AI/live screens, and
Close camera all release the RTSP player and cancel frame/result requests. The
Colab stop request runs separately from frame uploads so a slow upload cannot
hold it up. If you leave during Start, a session returned later is stopped too.
Returning never starts a stream automatically; tap Connect camera to reconnect.
Setup fields remain only in the activity's memory, for as long as it exists.

The existing Tapo notebook works with this update. It stops this live session;
the Colab runtime stays available for the app's other AI features. If the phone
loses internet or Android kills the process, remote cleanup is best effort;
the notebook's 30-second no-frame timeout remains the fallback. An already
running inference/provider call may finish before its worker exits.

Camera credentials and the live token remain in activity memory, without saved
preferences. The RTSP address/password are never sent to Colab or the website.
Screenshots and RTSP debug logs are disabled for this activity. The WebView origin
allowlist and HTTPS protections remain in place. Camera streams stay muted and
audio is not uploaded. Only sampled JPEGs (up to one per second) are uploaded for
YOLO; optional Claude summaries use API credits, five maximum per session.
Sessions stop after ten minutes or 30 seconds with no frames. Raw video is not
recorded by this feature. The original photo/video/checklist flow is preserved.

`TapoConnectionTest` checks private camera addresses, the HTTPS API address, and
token header boundaries. `StreamLeaseTest` checks cancellation, stop-once behavior,
late session creation, and independence of a new run. Run
`gradlew.bat testDebugUnitTest assembleDebug` after
installing SDK 36 and JDK 17. APK compilation, these Gradle tests, and mocked
backend tests passed here. Device network permissions and camera stream limits
still need a real-phone check. Translated primary controls follow the website's
selected common language; longer native setup/error text falls back to English.

References: [Tapo C200 RTSP setup](https://www.tapo.com/us/faq/34/?app=web),
[Android Media3 RTSP](https://developer.android.com/media/media3/exoplayer/rtsp).

References: [Android Gradle compatibility](https://developer.android.com/build/releases/agp-8-13-0-release-notes),
[WebView file selection](https://developer.android.com/reference/android/webkit/WebChromeClient#onShowFileChooser(android.webkit.WebView,android.webkit.ValueCallback%3Candroid.net.Uri[]%3E,android.webkit.WebChromeClient.FileChooserParams)),
[Gradle wrapper verification](https://docs.gradle.org/current/userguide/gradle_wrapper.html#sec:verification).
