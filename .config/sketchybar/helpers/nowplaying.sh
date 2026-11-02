#!/bin/bash
#
# macOS 15.4 closed MediaRemote's notification API to unentitled processes, so
# sketchybar never emits media_change any more and items/media.lua sat blank.
# nowplaying-cli can still read the session, so poll it here and print the
# fields media.lua needs, one per line:
#
#   1  client bundle identifier
#   2  playing | paused
#   3  title
#   4  artist
#   5  artwork file, or empty when there is none
#
# The artwork blob is ~200KB of base64, so it is only decoded when the track
# changes. It alternates between two filenames because sketchybar keys its
# image cache on the path and will not re-read a file it has already loaded.
#
# It is also resized. sketchybar normalises the built-in "media.artwork" source
# to the bar, but an image loaded from a path is drawn at its own size times
# background.image.scale - and MediaRemote hands over a 600x600 cover, which at
# Felix's 0.85 is 510pt tall in a 40pt bar. ART_PX is the source size; media.lua
# scales it back down to the 28pt background, so keep the two in step.

set -u

CACHE="${HOME}/.cache/sketchybar"
ART_PX=56
LAST="${CACHE}/media_track"
SLOT="${CACHE}/media_slot"
mkdir -p "$CACHE"

out=$(nowplaying-cli get clientBundleIdentifier title artist playbackRate 2>/dev/null)

field() { printf '%s\n' "$out" | sed -n "${1}p"; }
nn() { [ "$1" = "null" ] && printf '' || printf '%s' "$1"; }

app=$(nn "$(field 1)")
title=$(nn "$(field 2)")
artist=$(nn "$(field 3)")
rate=$(nn "$(field 4)")

state="paused"
case "$rate" in ''|0|0.0) ;; *) state="playing" ;; esac

track="${app}|${title}|${artist}"
slot=$(cat "$SLOT" 2>/dev/null || printf 'b')
art="${CACHE}/media_artwork_${slot}.jpg"

if [ "$track" != "$(cat "$LAST" 2>/dev/null)" ]; then
  [ "$slot" = "a" ] && slot="b" || slot="a"
  art="${CACHE}/media_artwork_${slot}.jpg"
  if nowplaying-cli get artworkData 2>/dev/null | base64 -D > "${art}.tmp" 2>/dev/null \
     && [ -s "${art}.tmp" ] \
     && sips -s format jpeg -Z "$ART_PX" "${art}.tmp" --out "${art}.tmp" >/dev/null 2>&1; then
    mv "${art}.tmp" "$art"
    printf '%s' "$slot" > "$SLOT"
  else
    rm -f "${art}.tmp"
    art=""
  fi
  printf '%s' "$track" > "$LAST"
fi

[ -s "$art" ] || art=""

printf '%s\n%s\n%s\n%s\n%s\n' "$app" "$state" "$title" "$artist" "$art"
