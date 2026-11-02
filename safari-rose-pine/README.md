# Rosé Pine for the Web

A Safari extension that repaints any website in the Rosé Pine palette, the
way Noir adds dark mode — each page is analysed as it loads rather than put
through a blanket invert.

## Install

```sh
./build.sh
```

That regenerates the Xcode project from `extension/`, builds, and copies the
app to `/Applications`. Then:

1. Open **Rose Pine Web.app** once. It does nothing but register the
   extension with Safari.
2. Safari → Settings → Extensions → tick **Rosé Pine for the Web**.
3. Give it permission on **All Websites** when asked. It cannot theme a page
   it is not allowed to read.

**Signing decides whether Safari lists it at all.** Safari ranks the
signature on the containing app, and the rank is the whole story:

| signature | result |
|---|---|
| ad-hoc (what `build.sh` produces) | never listed, not even with *Allow Unsigned Extensions* ticked |
| Apple Development | listed only while Develop → *Allow Unsigned Extensions* is on, and that resets on every Safari launch |
| Developer ID Application | listed permanently |

So the one-time setup is a Developer ID certificate. Xcode → Settings →
Accounts → pick the team → **Manage Certificates…** → **+** → **Developer ID
Application**. Then:

```sh
./sign.sh                 # picks the Developer ID automatically
./sign.sh --notarize      # only if Gatekeeper complains; uploads to Apple
```

`sign.sh` falls back to an Apple Development certificate and says so if no
Developer ID exists. Notarization is generally not needed for an app built
on the machine it runs on — nothing quarantines it — so try without first.

**One registration only.** The app exists twice after a build — in
`/Applications` and in `build/dd/...` — and LaunchServices will happily pick
the derived-data one, which is the stale ad-hoc copy. Safari then reads that
instead of the installed app and shows nothing. `build.sh` now removes and
unregisters the build copy. To check which one is live:

```sh
pluginkit -mAvvv -p com.apple.Safari.web-extension | grep -A2 rosepine
```

It should print a `+` and a path under `/Applications`.

## Rebuilding: Safari caches the old copy

Safari does not pick up new extension resources just because the app was
rebuilt. A running Safari keeps serving what it already has, and so can a
restarted one. The symptom is confusing, because the extension is plainly
loaded and plainly out of date.

The manifest carries a version for exactly this reason — check
Settings → Extensions and confirm the number matches `extension/manifest.json`
before debugging anything else.

To force a reload, in order of effort:

1. Settings → Extensions → untick the extension, re-tick it.
2. Quit Safari completely, reopen.
3. Develop → **Add Temporary Extension…** → pick the `extension/` folder.
   This loads the source directly, with no app, no signing and no cache in
   the way, so it is always the current code. It lasts until Safari quits,
   which makes it the right choice while iterating.

## Palette variant

The popup offers **Rice** (default), **Moon** and **Main**.

Rice pins the page background to `#26233a` — the main variant's *overlay*,
which is what iTerm, VS Code, Spotify and sketchybar all sit on, so a Safari
window is the same colour as every other window on the desktop. Its two
surfaces above that come from Moon, because main's own `highlight_med`
(`#403d52`) is too big a jump from `#26233a` for a raised card.

Moon is the stock Moon variant (`#232136`); Main is stock main (`#191724`).
Dawn is deliberately absent: it is a light theme, and every band in the
mapper is built to darken.

The page background is also published as `<meta name="theme-color">`, which
is what Safari tints its toolbar and tab bar from — without it the window
chrome stays a different colour from the page inside it.

Palette colours are fixed points: a colour already in the active variant
maps to itself. Without that, `base.css` paints the canvas from the palette,
the first pass reads it back, and `#26233a` — which carries slightly more
chroma than the neutral threshold — is classified as an accent and pushed
lighter, then pushed again by every settling sweep.

## Appearance modes

The popup's **Apply** control is three-way, the way Noir does it:

| mode | behaviour |
|---|---|
| **Auto** (default) | themes a page only while the system is in Dark Mode, so a light-mode desktop is left alone |
| **Always** | themes regardless of the system setting |
| **Never** | off |

A per-site switch overrides whichever is chosen. In Auto the engine also
watches `prefers-color-scheme` and re-evaluates when the system flips, since
no storage event fires for that.

## How it decides a colour

Everything happens in OKLCH, where L is perceived lightness and H is hue, so
"same lightness, different hue" actually looks that way — sRGB's channels do
not line up with how light or how saturated something looks, and mapping in
it gives muddy results.

A colour is first split into **neutral** or **accent** at chroma 0.040,
chosen so Rosé Pine's own flattest accents (rose and foam, C 0.054) stay on
the accent side while a tinted grey does not.

**Neutrals** are placed by lightness, into one of three band tables, because
a single ladder gets at least one role wrong:

| role | why it needs its own table |
|---|---|
| background | must land in the dark end. A plain `1 - L` inversion sent a `#cccccc` page background to `highlight_high`, a divider colour, and the page came out light grey. |
| text | the only role that genuinely flips. Both ends map to `text`: a dark source is text on a light site and must invert, a light source is already text on a dark site and must stay light. |
| border | stays in the middle. Inverted, borders either vanish into the background or turn into bright lines. |

The thresholds come from where web neutrals actually sit — page whites at
L 0.97–1.0, raised panels 0.95–0.97, dividers 0.84–0.92, secondary text
0.51–0.68, body text below 0.40.

**Accents** keep their identity: the hue snaps to whichever of the six Rosé
Pine accents is nearest on the wheel, so a site's blue stays blue instead of
becoming whatever is closest in RGB. Lightness is *not* inverted — an
accent's lightness on a light page says nothing reliable about its role, and
inverting it produced colours that could not be read at all (`#ff9900` came
out as `rgb(56,13,0)`, effectively black). Instead the role decides the
band, and the role is known from the property name.

Measured against the page background, accent text lands at 7.7–10.8:1 and
light text on an accent background at 6.3–8.4:1.

**Strict palette** (in the popup) ignores the role and returns the palette
entry itself. That is the point of asking for exactly fifteen colours; the
cost is that an accent-coloured background becomes a bright one.

## Pseudo-elements

::before and ::after have no node, so they cannot be given an inline style,
and they are not rare decoration - Wikipedia fades the bottom of its pinned
contents list with `linear-gradient(transparent, #fff)` on a ::after, which
stays a white smear over a dark page.

They are reached by generating a rule instead: the host gets a `data-rp-p`
attribute and a matching rule goes into our own stylesheet, which is the
only way to address a pseudo-element from script. Only hosts whose pseudo
actually paints are tagged, and the count is capped so a pathological page
cannot grow an unbounded stylesheet.

## How it reads the page

It reads *computed* styles per element and writes the mapped value back as an
important inline style. Parsing the site's own stylesheets would be the
other option, but cross-origin sheets throw on `.cssRules`, and refetching
every one of them to parse by hand is both slow and a second source of truth
that can disagree with what is on screen. Computed values are already
resolved, so custom properties, `@media`, cascade layers and specificity are
somebody else's problem by the time the engine sees them.

The cost is that pseudo-elements have no element to read from. `base.css`
covers those by setting inheritable defaults, and it also paints the canvas
before the first element has been walked.

Work is chunked through `requestIdleCallback` so a large DOM cannot block
interaction, and a `MutationObserver` catches anything added later.
`img`, `video`, `canvas` and `iframe` are never recoloured.

## Known limits

- **Grey page, white cards.** Sites built that way (GitHub, Google) come out
  with the pair swapped by one step, because nothing in a colour value says
  "page" or "card". Sites with white pages and grey cards are correct.
- **Images are not analysed**, only dimmed, by the popup's brightness slider.
  A logo that assumes a white page behind it will still assume one.
- **No per-page caching.** Every load re-walks the DOM. Hidden elements are
  painted too, so that a hover preview or a modal is already themed the
  moment it appears rather than flashing its own colours first.
- Settings live in `browser.storage.local`, so they do not sync.

## Layout

```
extension/      the web extension — the only source of truth
  manifest.json
  palette.js    colour space maths and the mapper
  content.js    the page engine
  base.css      canvas and pseudo-element defaults
  popup.*       the toolbar popup
build.sh        regenerate, build, install
build/          generated; not tracked
```
