#!/usr/bin/env bash
# Resample the wallpaper and regenerate the palette, then reload the bar.
set -euo pipefail
CFG="$HOME/.config/sketchybar"
WP=$(osascript -e 'tell application "Finder" to get POSIX path of (get desktop picture as alias)' 2>/dev/null) || exit 0
[ -f "$WP" ] || exit 0
read -r HEXV LUMV <<< "$(swift "$CFG/helpers/wallpaper_color.swift" "$WP" 0.033 2>/dev/null)"
[ -n "${HEXV:-}" ] || exit 0
python3 -I "$CFG/helpers/wallpaper_theme.py" "$HEXV" "$LUMV" "$CFG/wallpaper_colors.lua" >/dev/null
/opt/homebrew/bin/sketchybar --reload
