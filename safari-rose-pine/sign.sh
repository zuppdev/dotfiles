#!/bin/bash
# Signs the installed app so Safari will list the extension.
#
#   ./sign.sh                 # auto-pick the best identity in the keychain
#   ./sign.sh "Developer ID Application: Name (TEAMID)"
#   ./sign.sh --notarize      # sign, then notarize and staple
#
# Safari ranks signatures, and the rank decides whether the extension shows
# up at all:
#
#   ad-hoc                 never listed, not even with Allow Unsigned ticked
#   Apple Development      listed only while Develop > Allow Unsigned
#                          Extensions is on, and that resets every launch
#   Developer ID           listed permanently
#
# Developer ID is the only one that sticks. Create it once in
# Xcode > Settings > Accounts > Manage Certificates > + > Developer ID
# Application, then re-run this.
set -euo pipefail
cd "$(dirname "$0")"

APP="/Applications/Rose Pine Web.app"
APPEX="$APP/Contents/PlugIns/Rose Pine Web Extension.appex"
NOTARIZE=0
ID="${1:-}"

[ "${1:-}" = "--notarize" ] && { NOTARIZE=1; ID=""; }

if [ -z "$ID" ]; then
  ID=$(security find-identity -v -p codesigning \
       | sed -n 's/.*"\(Developer ID Application:[^"]*\)".*/\1/p' | head -1)
  if [ -n "$ID" ]; then
    echo "Using Developer ID: $ID"
  else
    ID=$(security find-identity -v -p codesigning \
         | sed -n 's/.*"\(Apple Development:[^"]*\)".*/\1/p' | head -1)
    [ -z "$ID" ] && { echo "No usable signing identity in the keychain." >&2; exit 1; }
    echo "No Developer ID certificate found; falling back to: $ID"
    echo "The extension will only be listed while Develop > Allow Unsigned"
    echo "Extensions is ticked, and that resets on every Safari launch."
  fi
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Carry the existing entitlements over, minus get-task-allow: that is a debug
# entitlement and has no business in a copy Safari loads.
codesign -d --entitlements :- "$APPEX" > "$TMP/ext.plist" 2>/dev/null
codesign -d --entitlements :- "$APP"   > "$TMP/app.plist" 2>/dev/null
for f in "$TMP/ext.plist" "$TMP/app.plist"; do
  /usr/libexec/PlistBuddy -c "Delete :com.apple.security.get-task-allow" "$f" 2>/dev/null || true
done

# Nested code first, then the container, or the outer signature seals a stale
# inner one and verification fails.
codesign --force --sign "$ID" --entitlements "$TMP/ext.plist" --options runtime --timestamp "$APPEX"
codesign --force --sign "$ID" --entitlements "$TMP/app.plist" --options runtime --timestamp "$APP"
codesign --verify --deep --strict "$APP"
codesign -dv "$APP" 2>&1 | grep -E 'Authority=|TeamIdentifier'

if [ "$NOTARIZE" = "1" ]; then
  # Needs credentials stored once:
  #   xcrun notarytool store-credentials notary --apple-id you@example.com \
  #     --team-id TEAMID --password <app-specific-password>
  echo "Notarizing (uploads the app to Apple)..."
  ditto -c -k --keepParent "$APP" "$TMP/app.zip"
  xcrun notarytool submit "$TMP/app.zip" --keychain-profile notary --wait
  xcrun stapler staple "$APP"
  xcrun stapler validate "$APP"
fi

LSR=/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister
"$LSR" -f "$APP"
pluginkit -a "$APPEX" 2>/dev/null || true
open "$APP"
echo
echo "Done. Quit Safari completely, reopen, then Settings > Extensions."
