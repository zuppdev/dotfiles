#!/bin/bash
# Rebuilds the Safari app from extension/ and installs it to /Applications.
# Safe to re-run: the Xcode project is regenerated from scratch each time, so
# extension/ is the only source of truth.
set -euo pipefail
cd "$(dirname "$0")"

APP_NAME="Rose Pine Web"
BUNDLE_ID="dev.zap.rosepineweb"

rm -rf build
xcrun safari-web-extension-converter extension \
  --project-location build \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --macos-only --no-open --no-prompt --force

# The converter derives the app target's bundle id from the product name and
# the extension target's from --bundle-identifier, so they disagree and the
# embedded-binary check fails: "bundle identifier is not prefixed with the
# parent app's". Put the app back on the id we asked for.
sed -i '' "s/PRODUCT_BUNDLE_IDENTIFIER = \"dev.zap.Rose-Pine-Web\";/PRODUCT_BUNDLE_IDENTIFIER = $BUNDLE_ID;/" \
  "build/$APP_NAME/$APP_NAME.xcodeproj/project.pbxproj"

xcodebuild -project "build/$APP_NAME/$APP_NAME.xcodeproj" -scheme "$APP_NAME" \
  -configuration Release -derivedDataPath build/dd \
  CODE_SIGN_IDENTITY="-" CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM="" \
  build

rm -rf "/Applications/$APP_NAME.app"
cp -R "build/dd/Build/Products/Release/$APP_NAME.app" /Applications/

# Both copies otherwise end up registered and LaunchServices can pick the one
# in derived data - which is the stale, ad-hoc signed one. Safari then reads
# that instead of the installed app and shows nothing. Remove the build copy
# and re-register so exactly one path is known.
LSR=/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister
"$LSR" -u "build/dd/Build/Products/Release/$APP_NAME.app" 2>/dev/null || true
rm -rf "build/dd/Build/Products/Release/$APP_NAME.app" \
       "build/dd/Build/Products/Release/$APP_NAME Extension.appex"
"$LSR" -f "/Applications/$APP_NAME.app"
pluginkit -a "/Applications/$APP_NAME.app/Contents/PlugIns/$APP_NAME Extension.appex" 2>/dev/null || true

echo
echo "Installed /Applications/$APP_NAME.app"
echo
echo "The build is ad-hoc signed. To sign it with a real identity instead"
echo "(which is what finally made Safari list it), run:"
echo
echo "  ./sign.sh \"Apple Development: Your Name (XXXXXXXXXX)\""
echo
echo "Then open the app once and enable it in Safari > Settings > Extensions."
