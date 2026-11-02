# Rosé Pine rice

Every surface is Rosé Pine **overlay `#26233a`**, so the windows read as one
surface. Two apps are deliberately different numbers for the *same* colour:

| app | configured | on screen |
|---|---|---|
| iTerm2 | `#26233a` | `#252338` |
| VS Code | `#26233a` | `#262339` |
| Spotify | `#26233a` | `#262339` |
| Chrome | `#26233A` (policy) | `#252338` |
| sioyek | `#252338` | `#252338` |

iTerm, VS Code, Spotify and Chrome are colour-managed, so macOS converts their
sRGB value for the display. sioyek draws through OpenGL, which bypasses colour
management, so it is given the already-converted value. Do not "fix" that.

## What lives where

- `.config/` — mirrors `$HOME/.config` (sketchybar, borders, nvim, sioyek,
  spicetify, fastfetch, starship)
- `vscode/settings.json` → `~/Library/Application Support/Code/User/`
- `chrome/com.google.Chrome.plist` → `/Library/Managed Preferences/` (needs
  root; Chrome reads policy from there, **not** from `defaults write`, and only
  at startup)
- `sioyek/local-patches.diff` — see below

## sioyek

Built from source: upstream's README is stale on four counts — it says `qt@5`
(main needs Qt6), and its `build_mac.sh` builds mupdf's bundled freeglut
(`GL/glx.h`, X11-only, cannot build on macOS) and installs resources into
`Contents/MacOS` while `main.cpp` reads them from `Contents/Resources`.
`sioyek/build-sioyek.sh` and `install-sioyek.sh` handle all of that.

`local-patches.diff` adds two options that do not exist upstream:
- `status_bar_alpha` — the status bar is stacked above the GL widget, so below
  1.0 the page shows through it
- `custom_blue_color` — remaps the blue basis of the custom-colour transform,
  which is what keeps LaTeX hyperref links blue

Apply with `git apply` inside a fresh clone before building.

## Spotify

Spicetify, `Default` theme (colour-only; it ships no `user.css` of its own, so
Spotify keeps its font, icons and layout) plus a `user.css` here.

Spotify **hashes its class names per build**, so `.main-*` / `.encore-*`
selectors silently stop matching. Everything in `user.css` was verified against
the live DOM over the Chrome DevTools Protocol. The stable hooks are real tags
(`nav`), `data-testid`, structural `:has()`, and inline-style attribute
selectors. Re-verify after a Spotify update — the patch is also reverted by
updates, so rerun `spicetify apply`.

## Known deviations

- sketchybar `green` is foam `#9ccfd8`; Rosé Pine ships no green
- sioyek links render `#8366e6`, not iris — iris is unreachable through the
  affine colour transform for this source blue (it would need `R=1.486`)
- Spotify's accent is rose `#ebbcba`; window borders and the VS Code active tab
  are iris `#c4a7e7`
- Safari cannot be themed at all; it uses the system accent instead
