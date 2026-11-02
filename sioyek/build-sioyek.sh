#!/usr/bin/env bash
set -euo pipefail
D="/private/tmp/claude-501/-Users-zap/884888f8-3817-4889-8e6d-71a36c1e9d59/scratchpad/sioyek-src"
J=$(sysctl -n hw.ncpu)

echo "=== [1/5] Qt6 ==="
# The README says qt@5, but main now uses Qt6-only APIs: QVariant::typeId,
# QResizeEvent::clone, QPointingDevice, QIODeviceBase, QQuickWindow::setGraphicsApi.
# The .pro already branches on greaterThan(QT_MAJOR_VERSION, 5).
/opt/homebrew/bin/brew list --versions qt >/dev/null 2>&1 || /opt/homebrew/bin/brew install qt
export PATH="/opt/homebrew/opt/qt/bin:/opt/homebrew/bin:$PATH"
qmake -v

cd "$D"

echo "=== [2/5] mupdf libs (no-op if current) ==="
# `all` pulls in extra-libs -> bundled freeglut -> #include <GL/glx.h>, which
# is X11-only and cannot build on macOS. sioyek links only these three.
make -C mupdf -j"$J" libs libmupdf-threads

echo "=== [3/5] drop Qt5-compiled objects ==="
rm -f ./*.o moc_*.cpp moc_*.h qrc_*.cpp Makefile 2>/dev/null || true

echo "=== [4/5] qmake + make (j=$J) ==="
qmake "CONFIG+=non_portable" pdf_viewer_build_config.pro
make -j"$J"

echo "=== [5/5] assemble bundle ==="
rm -rf build
mkdir build
mv sioyek.app build/
# upstream's build_mac.sh puts these in Contents/MacOS, but main.cpp:236-240
# resolves them from Contents/Resources - the script is stale against the
# source, and the app renders nothing but its clear colour without them.
mkdir -p build/sioyek.app/Contents/Resources
cp -r pdf_viewer/shaders build/sioyek.app/Contents/Resources/shaders
for f in prefs.config keys.config; do
  cp "pdf_viewer/$f" "build/sioyek.app/Contents/Resources/$f"
done
cp tutorial.pdf build/sioyek.app/Contents/Resources/tutorial.pdf
macdeployqt build/sioyek.app

echo "=== DONE ==="
file build/sioyek.app/Contents/MacOS/sioyek
du -sh build/sioyek.app
