/* Rose Pine palette and the colour mapper.
 *
 * The whole extension turns on one question: given an arbitrary colour from
 * some website, which Rose Pine colour should it become? Doing that in sRGB
 * gives muddy results, because sRGB's channels do not line up with how light
 * or how saturated something looks. Everything here works in OKLCH, where
 * L is perceived lightness, C is chroma and H is hue, so "same lightness,
 * different hue" actually looks that way.
 */

/* Rose Pine ships three variants. Moon is the default here because it is
 * what reads best over arbitrary web content: its base is #232136 against
 * the main variant's #191724, and that extra lightness keeps a page of body
 * text from sitting in a hole. Dawn is deliberately absent - it is a light
 * theme, and every band below is built to darken. */
const VARIANTS = {
  moon: {
    base: '#232136', surface: '#2a273f', overlay: '#393552',
    highlightLow: '#2a283e', highlightMed: '#44415a', highlightHigh: '#56526e',
    muted: '#6e6a86', subtle: '#908caa', text: '#e0def4',
    love: '#eb6f92', gold: '#f6c177', rose: '#ea9a97',
    pine: '#3e8fb0', foam: '#9ccfd8', iris: '#c4a7e7',
  },
  /* Matches the rest of the rice: iTerm, VS Code, Spotify and sketchybar all
   * sit on #26233a, which is the main variant's OVERLAY rather than its base.
   * Page background is pinned there so a Safari window is the same colour as
   * every other window on the desktop. The two surfaces above it come from
   * Moon, which is where the main palette's ladder would have to go next -
   * main's own highlight_med (#403d52) is too big a jump from #26233a for a
   * raised card. Everything else is main's. */
  rice: {
    base: '#26233a', surface: '#2a273f', overlay: '#393552',
    highlightLow: '#2a283e', highlightMed: '#44415a', highlightHigh: '#56526e',
    muted: '#6e6a86', subtle: '#908caa', text: '#e0def4',
    love: '#eb6f92', gold: '#f6c177', rose: '#ebbcba',
    pine: '#31748f', foam: '#9ccfd8', iris: '#c4a7e7',
  },
  main: {
    base: '#191724', surface: '#1f1d2e', overlay: '#26233a',
    highlightLow: '#21202e', highlightMed: '#403d52', highlightHigh: '#524f67',
    muted: '#6e6a86', subtle: '#908caa', text: '#e0def4',
    love: '#eb6f92', gold: '#f6c177', rose: '#ebbcba',
    pine: '#31748f', foam: '#9ccfd8', iris: '#c4a7e7',
  },
};

let RP = VARIANTS.rice;
let ACCENTS = [];
let BANDS = {};
/* Every colour the active variant can emit, as "r,g,b". A value already in
 * the palette must map to itself: base.css paints the canvas from the
 * palette before the engine runs, so the first pass reads our own colour
 * back out, and #26233a carries slightly more chroma than the neutral
 * threshold - it was being classified as an accent and pushed lighter, then
 * pushed again by every settling sweep. Moon's base sits just under the
 * line, which is why only one variant showed it. */
let PALETTE_RGB = new Set();


/* ---- colour space ---------------------------------------------------- */

function srgbToLinear(v) {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function linearToSrgb(v) {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function rgbToOklch(r, g, b) {
  const lr = srgbToLinear(r / 255), lg = srgbToLinear(g / 255), lb = srgbToLinear(b / 255);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return [L, Math.hypot(a, bb), (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360];
}

function oklchToRgb(L, C, H) {
  const h = H * Math.PI / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  const r =  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(linearToSrgb(v) * 255)));
  return [clamp(r), clamp(g), clamp(bl)];
}

function hexToOklch(hex) {
  const n = parseInt(hex.slice(1), 16);
  return rgbToOklch((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

/* ---- classification --------------------------------------------------
 * Neutrals (greys, white, black) carry no hue worth keeping, so they are
 * placed by lightness alone, against the band tables below.
 * Accents are placed by hue instead, against the six coloured entries.
 */

/* Chroma below this reads as grey rather than as a colour. Picked so that
 * Rose Pine's own least saturated accents (rose and foam, C 0.054) stay on
 * the accent side of the line while a tinted grey does not. */
const NEUTRAL_CHROMA = 0.040;

function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/* Neutrals cannot be handled by one inverted ladder. Three roles pull in
 * different directions and a single mapping gets at least one of them wrong:
 *
 *   backgrounds  must all land in the dark end. A plain 1-L inversion sent
 *                a #cccccc page background to highlight_high, which is a
 *                divider colour - the page came out light grey.
 *   text         must invert, so black becomes text and mid grey becomes
 *                subtle; it is the only role that genuinely flips.
 *   borders      must stay in the middle. Inverted they either vanish into
 *                the background or turn into bright lines.
 *
 * Each band is [source lightness at or above which it applies, target].
 * The thresholds come from where web neutrals actually sit: page whites at
 * 0.97-1.0, raised panels 0.95-0.97, dividers 0.84-0.92, secondary text
 * 0.51-0.68, body text below 0.40.
 */

function mapNeutral(L, role) {
  const table = BANDS[role] || BANDS.fg;
  for (const [min, hex] of table) if (L >= min) return hex;
  return table[table.length - 1][1];
}

/* Accents keep their identity: the hue snaps to whichever Rose Pine accent
 * is closest on the wheel, so a site's blue stays blue rather than becoming
 * whatever happens to be nearest in RGB.
 *
 * Lightness is NOT simply inverted. An accent's lightness on a light page
 * says nothing reliable about its role, and inverting it produced colours
 * that could not be read at all - #ff9900 came out as rgb(56,13,0), which is
 * effectively black on a dark page. What does matter is the role, and that
 * is known from the property name: a value behind `background-color` has to
 * stay dark enough for light text to sit on it, and a value behind `color`
 * has to stay light enough to be read. So the two are banded separately.
 *
 * Strict mode ignores the role and returns the palette entry itself, which
 * is the point of asking for exactly these fifteen colours - the cost is
 * that an accent-coloured background becomes a bright one.
 */
function mapAccent(L, C, H, strict, role) {
  let best = ACCENTS[0], bestD = Infinity;
  for (const a of ACCENTS) {
    const d = hueDistance(a.lch[2], H);
    if (d < bestD) { bestD = d; best = a; }
  }
  if (strict) return best.hex;

  if (role !== 'bg') {
    /* Keep the source hue; normalise only lightness and chroma.
     *
     * Snapping to the nearest palette accent was wrong. Measured off a
     * reference that looks right, its links sit at L 0.65, C 0.07, hue
     * 255-266 - and the source, #3366cc, is hue 262. The hue is carried
     * straight through. Nothing is snapped: foam is hue 210, iris 305,
     * pine 228, and the result is none of them.
     *
     * This is also what gives a page variety. A site's blue stays blue, its
     * red stays red, its green stays green; what changes is that they are
     * all brought to one lightness and one chroma ceiling, which is what
     * makes them look like a set rather than a pile of brand colours. The
     * palette's own restraint is in the numbers, not in snapping to its
     * fifteen values. */
    const L2 = 0.66;
    const C2 = Math.min(C, 0.08);
    const [r2, g2, b2] = oklchToRgb(L2, C2, H);
    return `rgb(${r2}, ${g2}, ${b2})`;
  }

  let L2, C2;
  if (role === 'bg') {
    L2 = Math.max(0.26, Math.min(0.44, 0.44 - (L - 0.45) * 0.25));
    C2 = Math.min(C, 0.065);          // a tinted surface, not a slab of colour
  } else {
    /* Anchor on the matched entry's own lightness and chroma rather than
     * carrying the source's across. Spreading lightness over a wide band
     * produced colours that were the right hue but never actually any of
     * the palette's - a page of links came out as an arbitrary light blue
     * instead of foam, which is what made a themed page look like it had no
     * theme. The nudge keeps two different source blues distinguishable
     * without either drifting far enough to stop reading as foam. */
    const nudge = Math.max(-0.05, Math.min(0.05, (0.55 - L) * 0.12));
    /* Floor at 0.70 because pine is the one dark entry (L 0.528) and a blue
     * link anchored on it came out at 4.0:1 against the page. Lifted, it is
     * still unmistakably pine's hue and reads at roughly 6:1. */
    L2 = Math.max(0.70, Math.min(0.90, best.lch[0] + nudge));
    C2 = best.lch[1];
  }
  const [r, g, b] = oklchToRgb(L2, C2, best.lch[2]);
  return `rgb(${r}, ${g}, ${b})`;
}


/* Rebuilds everything derived from the palette. Called once at load and
 * again whenever the variant setting changes. */
function setVariant(name) {
  RP = VARIANTS[name] || VARIANTS.rice;

  ACCENTS = [RP.love, RP.rose, RP.gold, RP.pine, RP.foam, RP.iris]
    .map((hex) => ({ hex, lch: hexToOklch(hex) }));

  PALETTE_RGB = new Set(Object.values(RP).map((hex) => {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }));

  BANDS = {
    /* Lighter sources sit slightly higher in the dark range, so a white card
     * on a grey page stays the raised one of the two. Sites that do it the
     * other way round - grey cards on a white page - end up with the pair
     * swapped, which is a one-step difference and the ambiguity any
     * colour-only transform has: nothing in the value says "page" or "card". */
    bg: [
      [0.970, RP.base],
      [0.900, RP.surface],
      [0.800, RP.highlightLow],
      [0.600, RP.overlay],
      [0.350, RP.highlightMed],
      [0.000, RP.base],          // source was already dark
    ],
    /* Both ends go to text, which is not a mistake: a dark source is text on
     * a light site and has to be flipped, while a light source is already
     * text on a dark site and has to be left light. Sending the light end
     * down the ladder instead turned every already-dark site's body copy to
     * near-invisible. Only the greys in between carry a hierarchy worth
     * keeping, and they map to the two secondary tones. */
    fg: [
      [0.750, RP.text],
      [0.620, RP.muted],
      [0.400, RP.subtle],
      [0.000, RP.text],
    ],
    border: [
      [0.900, RP.highlightMed],
      [0.750, RP.highlightHigh],
      [0.000, RP.muted],
    ],
  };

}

/* Public entry point. Returns a CSS colour string, preserving alpha. */
function mapColor(r, g, b, alpha, strict, role) {
  if (PALETTE_RGB.has(`${r},${g},${b}`)) {
    return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const [L, C, H] = rgbToOklch(r, g, b);
  const hex = C < NEUTRAL_CHROMA
    ? mapNeutral(L, role)
    : mapAccent(L, C, H, strict, role === 'border' ? 'fg' : role);
  if (alpha >= 1) return hex;
  if (hex.startsWith('#')) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  return hex.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
}

/* ---- parsing any CSS colour ------------------------------------------
 * Computed styles do NOT normalise to rgb(). Measured in WebKit:
 *
 *   #fff                            -> rgb(255, 255, 255)
 *   hsl(210 50% 50%)                -> rgb(64, 128, 191)
 *   color-mix(in oklab, #fff, #000) -> oklab(0.499997 ...)
 *   oklch(0.7 0.1 250)              -> oklch(0.7 0.1 250)
 *   color(display-p3 1 0 0)         -> color(display-p3 1 0 0)
 *
 * An rgb()-only regex therefore skips every modern colour a site uses, and
 * the page comes out half-mapped - some values themed, the rest left as the
 * site had them. That was the "colour is off".
 *
 * Canvas fillStyle does not normalise these either (it echoes the modern
 * syntax straight back), but *painting* one pixel and reading it does, and
 * it does so for any syntax the engine understands including ones added
 * later. One 1x1 canvas, memoised, is the whole parser.
 */

const _cv = document.createElement('canvas');
_cv.width = _cv.height = 1;
const _ctx = _cv.getContext('2d', { willReadFrequently: true });
/* 'copy' so the fill replaces the pixel outright; over a transparent canvas
 * a normal source-over composite would hand back premultiplied values. */
if (_ctx) _ctx.globalCompositeOperation = 'copy';
const _colorCache = new Map();

const RGB_ONE = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.%]+))?\s*\)$/i;

function parseColor(str) {
  if (!str) return null;
  if (_colorCache.has(str)) return _colorCache.get(str);

  let out = null;
  const m = RGB_ONE.exec(str.trim());
  if (m) {
    const a = m[4] === undefined ? 1
      : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    out = [+m[1], +m[2], +m[3], a];
  } else if (_ctx) {
    try {
      /* An unparseable value leaves fillStyle at whatever it already was, so
       * probe from two different sentinels: only a colour the engine
       * understands lands on the same answer from both. */
      _ctx.fillStyle = '#000000';
      _ctx.fillStyle = str;
      const a1 = _ctx.fillStyle;
      _ctx.fillStyle = '#ffffff';
      _ctx.fillStyle = str;
      if (_ctx.fillStyle === a1) {
        _ctx.fillRect(0, 0, 1, 1);
        const d = _ctx.getImageData(0, 0, 1, 1).data;
        out = [d[0], d[1], d[2], d[3] / 255];
      }
    } catch { out = null; }
  }

  _colorCache.set(str, out);
  return out;
}

/* Every colour-function token, so compound values (gradients, shadows) can
 * be rewritten whatever syntax their stops are written in. Allows one level
 * of nesting, which covers color-mix() of two plain colours. */
const COLOR_TOKEN =
  /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\((?:[^()]|\([^()]*\))*\)/gi;

setVariant("rice");
