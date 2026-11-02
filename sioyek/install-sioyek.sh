#!/usr/bin/env bash
set -euo pipefail
D="/private/tmp/claude-501/-Users-zap/884888f8-3817-4889-8e6d-71a36c1e9d59/scratchpad/sioyek-src"
export PATH="/opt/homebrew/opt/qt/bin:/opt/homebrew/bin:$PATH"
J=$(sysctl -n hw.ncpu)
cd "$D"

echo "=== incremental build (j=$J) ==="
make -j"$J"

echo "=== assemble ==="
rm -rf build && mkdir build && mv sioyek.app build/
# main.cpp:236-240 resolves these from Contents/Resources, not Contents/MacOS
mkdir -p build/sioyek.app/Contents/Resources
cp -r pdf_viewer/shaders build/sioyek.app/Contents/Resources/shaders
cp pdf_viewer/prefs.config build/sioyek.app/Contents/Resources/prefs.config
cp pdf_viewer/keys.config  build/sioyek.app/Contents/Resources/keys.config
cp tutorial.pdf            build/sioyek.app/Contents/Resources/tutorial.pdf
macdeployqt build/sioyek.app 2>/dev/null || true

echo "=== install ==="
pkill -x sioyek-bin 2>/dev/null || true
pkill -x sioyek 2>/dev/null || true
sleep 1
rm -rf /Applications/sioyek.app
cp -R build/sioyek.app /Applications/sioyek.app

# Qt paints the FullSizeContentView titlebar strip from its own palette,
# covering macos_titlebar_color; -stylesheet repaints it. Wrapping the real
# binary means Finder and `open -a` launches get it too, not just the shim.
M=/Applications/sioyek.app/Contents/MacOS
mv "$M/sioyek" "$M/sioyek-bin"
cat > "$M/sioyek" <<'WRAP'
#!/bin/sh
DIR=$(dirname "$0")
QSS="$HOME/.config/sioyek/sioyek.qss"
if [ -f "$QSS" ]; then
  exec "$DIR/sioyek-bin" -stylesheet "$QSS" "$@"
fi
exec "$DIR/sioyek-bin" "$@"
WRAP
chmod +x "$M/sioyek"

codesign --force --deep --sign - /Applications/sioyek.app
codesign --verify /Applications/sioyek.app
echo "=== INSTALLED ==="
