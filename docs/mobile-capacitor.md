# Mobile Packaging (Capacitor)

Source: [`capacitor.config.json`](../capacitor.config.json), [`package.json`](../package.json), `android/`, `ios/`

The game ships as a native app shell on Android and iOS via [Capacitor](https://capacitorjs.com/), which wraps the same Vite web build (`dist/`) in a native WebView rather than requiring a separate native codebase.

## Configuration

`capacitor.config.json`:
- `appId: com.toneboom.billiards`, `appName: Tone Boom`
- `webDir: dist` — Capacitor copies the Vite production build into each native project from here.
- `server.androidScheme: https` — serves the WebView content over `https://` instead of `file://` on Android, which several web APIs (and stricter CSP/mixed-content rules) expect.
- Plugin config: `SplashScreen` (1500ms launch splash, `#120726` background) and `StatusBar` (dark style, `#120726` background) — both colors match the app's dark glassmorphic theme in `index.css`.

## Native Dependencies (`package.json`)

`@capacitor/core`, `@capacitor/android`, `@capacitor/ios` (platform runtimes) plus three plugins actually used by the app:
- `@capacitor/haptics` — impact feedback on bond/break/burst events (see [audio-engine.md](./audio-engine.md#haptics-bridge)); this is the only plugin referenced from game code (`SynthEngine.triggerHaptic`).
- `@capacitor/status-bar`, `@capacitor/screen-orientation` — configured for native look-and-feel and are otherwise managed by Capacitor/native project settings rather than called directly from `src/`.

## Native Projects

`android/` and `ios/` are the generated native project trees (created via `npx cap add android` / `npx cap add ios`) — they contain a real Gradle/Android Studio project and a real Xcode project/workspace respectively, each with a thin bridge that loads the bundled web build. They are committed to the repo like any other native app project, not build output to be regenerated from scratch each time (regenerating would lose any native-side customization such as icons, entitlements, or permissions added directly in Android Studio/Xcode).

## Build & Release Flow

1. `npm run build` — type-checks and bundles the web app into `dist/`.
2. `npm run cap:sync` (`cap sync`) — copies `dist/` into `android/app/src/main/assets/public` and `ios/App/App/public`, and updates native plugin registrations if dependencies changed.
3. `npm run cap:android` / `npm run cap:ios` — opens the native project in Android Studio / Xcode for building, signing, running on a device/simulator, or submitting to a store.

There is no CI/CD or store-submission automation in this repo currently — native builds/signing/publishing are a manual step performed from Android Studio/Xcode.

## Implications for Web-Only Development

Day-to-day gameplay/physics/UI work only needs `npm run dev` / `npm test` — the native projects don't need to be touched unless verifying mobile-specific behavior (haptics, safe-area/status-bar layout, orientation locking, or an actual on-device build). Anything gated behind a Capacitor plugin (currently just haptics) is wrapped in a try/catch so it degrades silently to a no-op when running in a plain browser.
