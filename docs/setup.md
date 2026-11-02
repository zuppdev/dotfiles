# Setup notes

Install steps and the measured constants this configuration is tuned against.

## Install

```sh
brew install sketchybar starship
brew install --cask amethyst font-jetbrains-mono-nerd-font
(cd .config/sketchybar/helpers && make)   # build the C event providers
brew services start sketchybar
```

Hide the native menu bar: System Settings → Control Center → Menu Bar →
"Automatically hide and show the menu bar" → Always. If it appears set but
doesn't take effect, toggle it to Never and back.

Stop the title bar double-click from fighting the tiler:

```sh
defaults write NSGlobalDomain AppleActionOnDoubleClick -string "None"
```

Applies per app on next launch.

## Machine-specific values

Tuned for a MacBook Pro `Mac16,8` (M4 Pro, 1512x982pt) with an external
2560x1440 display. The measured constants:

| Value | Measurement | Where |
|---|---|---|
| Menu bar strip | 32pt | `safeAreaInsets.top`, built-in only |
| Notch | 185pt wide, x=663..848 | `auxiliaryTopLeftArea`/`RightArea` |
| Bar | height 32, `y_offset` 16 | `sketchybarrc` |

## Bar flags that matter

- `topmost=on` — without it the bar renders at window layer -20, behind the
  menu bar and behind windows.
- `display=all` — default is the main display only, leaving the external blank.
- `notch_width=185` — keeps centre items clear of the camera housing.
- `show_in_fullscreen=off` — otherwise the bar covers fullscreen windows and
  blocks their controls.
- Do **not** set `notch_display_height`. It is not a display selector; setting
  it to the display height makes the bar that many points tall.

## Gaps

`window-margin-size` applies **between and around** windows, so it stacks with
`screen-padding`. Effective edge gap = padding + margin.

```yaml
window-margin-size: 8
screen-padding-top: 40     # 40 + 8 = 48, clears the 32pt bar by 16
screen-padding-left: 8     # 8 + 8 = 16
```

Amethyst has **no per-monitor padding**. The built-in already reserves 32pt
for the notch strip, so it sits 32pt lower than strictly needed. The external
reserves nothing and lands exactly on 48.

## Mouse and modifiers

```yaml
mouse-swaps-windows: true    # drag a window onto another to swap
mouse-resizes-windows: true  # drag an edge, layout follows
```

Mods are `mod1` = opt+shift and `mod2` = opt+shift+ctrl — deliberately not
bare opt, which macOS uses for special characters.

## Media widget

sketchybar's `media_change` event comes from MediaRemote, which macOS 15.4
closed to unentitled processes. The widget polls `nowplaying-cli` instead:

```sh
brew install nowplaying-cli
```

`helpers/nowplaying.sh` reports the bundle identifier, play state, title,
artist and an artwork path; `items/media.lua` drives the items from that.

## The iTerm2 prompt marker

oh-my-zsh's `omz_termsupport_cwd` emits OSC 7 on every prompt and every `cd`.
iTerm2 reads OSC 7 as a prompt-start marker and draws a blue triangle in the
left margin for it. `ShowMarkIndicators` governs shell-integration marks only
and does not cover this path, so `.zshrc` unhooks the function.

The cost: iTerm2 no longer tracks the working directory, so a new tab or split
opens in `$HOME` rather than the current directory.

## Wallpaper-aware theming (unused)

`helpers/wallpaper_theme.py` samples the wallpaper strip behind the bar and
generates a palette whose contrast is verified: pill ≥ 3:1 against the
wallpaper, text ≥ 4.5:1 against the pill. Refresh with
`plugins/wallpaper_theme.sh`. Not used by the current bar config, kept for
reuse.
