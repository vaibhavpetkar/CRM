# Inveon One CRM for Android

A small Android app that opens the CRM (https://crm.shreemahalaxmirealty.in)
full screen in a WebView. Everything the website does works the same, plus:

- the phone's back button goes back a page;
- file uploads use the phone's file picker;
- exports, backups and recordings save to Downloads;
- WhatsApp, phone, email and map links open in their own apps;
- CRM links can open in the app;
- an offline screen with "Try again".

The app adds `InveonOneCRM-Android/<version>` to the browser user agent, so the
web app can tell when it runs inside it.

## Releasing

Push a tag that starts with `crm-v` (not `v`, which deploys master):

```
git tag crm-v2.0.1 origin/real-estate
git push origin crm-v2.0.1
```

`.github/workflows/android-release.yml` builds the APK and publishes the
release "Inveon One CRM 2.0.1" with `InveonOneCRM-2.0.1.apk` and its
`.sha256` attached. Write the notes first in `docs/releases/crm-v2.0.1.md`;
without that file GitHub lists the merged pull requests instead. You can also
run the workflow by hand from the Actions tab and type the tag.

The version code comes from the tag (2.0.1 becomes 20001), so every new
release installs over the last one.

## Signing key

Android only installs an update over an app signed with the same key. Make
one key once and keep it safe (losing it means everyone reinstalls):

```
keytool -genkeypair -v -keystore inveon-crm.jks -alias inveon-crm \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 inveon-crm.jks
```

Add these repository secrets (Settings > Secrets and variables > Actions):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the base64 output above |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `inveon-crm` |
| `ANDROID_KEY_PASSWORD` | the key password |

Without them the workflow signs with a temporary debug key and prints a
warning. Such an APK installs fine, but the first APK signed with the real key
needs the old app uninstalled first.

## Building locally

Needs JDK 17 and the Android SDK (Android Studio installs both).

```
cd android
./gradlew assembleRelease            # app/build/outputs/apk/release/
./gradlew assembleRelease -PcrmUrl=https://crm.example.com
```

`-PcrmUrl` points the app at another CRM server; only pages on that host stay
inside the app.
