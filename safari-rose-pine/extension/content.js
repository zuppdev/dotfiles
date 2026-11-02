/* Rose Pine for the web - the page engine.
 *
 * Approach: read what the browser actually computed for each element and
 * write a mapped colour back as an important inline style. Reading computed
 * values rather than parsing the site's stylesheets is the deliberate call -
 * cross-origin stylesheets throw on .cssRules, and refetching every one of
 * them to parse by hand is both slow and a second source of truth that can
 * disagree with what is on screen. Computed values are already resolved, so
 * custom properties, @media, cascade layers, :is() and specificity are all
 * somebody else's problem by the time we see them.
 *
 * The cost is that pseudo-elements cannot be read per-element, which is what
 * base.css is for: it sets inheritable defaults so ::before/::after follow
 * their host instead of staying on the site's own colours.
 */

(() => {
  /* First paint happens before storage.local can answer, so the last known
   * state for this tab is cached synchronously in sessionStorage and used to
   * set the attribute immediately. Without it every page shows one frame of
   * its own light theme before turning. The async read below corrects it. */
  try {
    if (sessionStorage.getItem('__rp_off') !== '1' && document.documentElement) {
      document.documentElement.setAttribute('data-rose-pine', 'on');
    }
  } catch { /* storage can be blocked; a frame of flash is the only cost */ }

  const SKIP_TAGS = new Set([
    'IMG', 'VIDEO', 'CANVAS', 'IFRAME', 'EMBED', 'OBJECT', 'PICTURE',
    'SOURCE', 'TRACK', 'AUDIO', 'MAP', 'AREA', 'SCRIPT', 'STYLE', 'LINK',
    'META', 'HEAD', 'TITLE', 'NOSCRIPT',
  ]);

  const COLOR_PROPS = [
    'color', 'background-color', 'border-top-color', 'border-right-color',
    'border-bottom-color', 'border-left-color', 'outline-color',
    'text-decoration-color', 'caret-color', 'column-rule-color',
  ];
  /* -webkit-text-fill-color is deliberately NOT in that list. It inherits,
   * and WebKit paints text with it in preference to `color`. Writing it on
   * every element meant each parent handed its own fill down to its
   * children, so a link whose `color` had been mapped to blue was still
   * painted with the paragraph's white - and once written on the link
   * itself, re-reading it mapped white to text and back to white, so it
   * could never recover. Every test I ran measured `color`, which was
   * correct the whole time, which is why this survived several rounds.
   * Setting `color` alone is enough; sites that use text-fill-color
   * themselves (gradient text, usually with a transparent fill) keep it. */
  const SVG_PROPS = ['fill', 'stroke'];
  /* Properties whose value embeds colours among other things, so they are
   * rewritten by substitution rather than replaced outright. */
  const COMPOUND_PROPS = ['background-image', 'box-shadow', 'text-shadow'];

  let settings = { enabled: true, strict: false, imageDim: 0.9 };
  let observer = null;
  const done = new WeakMap();      // element -> signature of what we wrote
  const queue = new Set();
  let scheduled = false;
  let painted = 0;
  /* A plain Set, not a WeakSet: it has to be cleared wholesale at the end of
   * each observer callback, and a WeakSet cannot be iterated. Entries live
   * for one microtask, so holding strong references briefly is fine. */
  const selfWrites = new Set();

  /* Whether a colour sits BEHIND content or ON it decides which way it is
   * pushed, so the property name is carried through to the mapper. Shadows
   * count as background: a shadow that turned light would read as a glow. */
  const BG_PROPS = new Set(['background-color', 'background-image', 'box-shadow']);
  const BORDER_PROPS = new Set([
    'border-top-color', 'border-right-color', 'border-bottom-color',
    'border-left-color', 'outline-color', 'column-rule-color',
  ]);

  /* An element carrying a mask-image is an icon: the mask is the shape and
   * background-color is the ink that shows through it. Mapping that as a
   * background put Wikipedia's toolbar icons on #44415a - a surface colour,
   * used as ink - so they read as dim grey-purple next to text that is
   * properly light. For a masked element the background IS the foreground. */
  function isMasked(cs) {
    const m = cs.maskImage || cs.webkitMaskImage;
    return !!m && m !== 'none';
  }

  function roleOf(prop, cs) {
    if (prop === 'background-color' && cs && isMasked(cs)) return 'fg';
    if (BG_PROPS.has(prop)) return 'bg';
    if (BORDER_PROPS.has(prop)) return 'border';
    return 'fg';
  }

  /* Simple properties hold exactly one colour, so the whole value goes
   * through the parser and any syntax is handled. Compound ones hold colours
   * mixed with lengths and urls, so each colour token is rewritten in place
   * and everything else is left alone. */
  function convertSimple(value, prop, cs) {
    if (!value || value === 'none' || value === 'transparent') return null;
    const c = parseColor(value);
    if (!c || c[3] === 0) return null;
    return mapColor(c[0], c[1], c[2], c[3], settings.strict, roleOf(prop, cs));
  }

  function convertCompound(value, prop) {
    if (!value || value === 'none') return null;
    COLOR_TOKEN.lastIndex = 0;
    if (!COLOR_TOKEN.test(value)) return null;
    COLOR_TOKEN.lastIndex = 0;
    const role = roleOf(prop);
    let changed = false;
    const out = value.replace(COLOR_TOKEN, (tok) => {
      const c = parseColor(tok);
      if (!c || c[3] === 0) return tok;
      changed = true;
      return mapColor(c[0], c[1], c[2], c[3], settings.strict, role);
    });
    return changed ? out : null;
  }

  /* ---- per-element work ----------------------------------------------- */

  function paint(el) {
    if (!el || el.nodeType !== 1 || SKIP_TAGS.has(el.tagName)) return;
    let cs;
    try { cs = getComputedStyle(el); } catch { return; }
    if (!cs) return;
    /* Hidden elements are painted too, deliberately. Skipping them left
     * anything built up off-screen and revealed later - a hover preview, a
     * menu, a modal - showing its own colours at the moment it appears,
     * which is the worst possible time to notice. getComputedStyle resolves
     * colours for a display:none element perfectly well, so the only cost
     * is work that would have been done on reveal anyway. */

    const isSvg = el.ownerSVGElement !== undefined && el.ownerSVGElement !== null
      || el.tagName === 'svg';
    const props = isSvg ? COLOR_PROPS.concat(SVG_PROPS) : COLOR_PROPS;

    paintPseudo(el);

    /* Re-mapping a value we produced ourselves has to be a no-op, and it is
     * not automatically: #26233a carries slightly more chroma than the
     * neutral threshold, so a second pass classified the page background as
     * an accent and pushed it lighter - and every sweep pushed it again.
     * Moon's base happens to sit just under the line, which is why only one
     * variant showed it. Rather than tune the threshold around the palette,
     * remember what was written for each property and leave it alone while
     * it is still there. */
    const prev = done.get(el);
    const written = prev && prev.written;

    const writes = [];
    for (const p of props) {
      const cur = cs.getPropertyValue(p);
      if (written && written[p] === cur) { writes.push([p, cur]); continue; }
      const out = convertSimple(cur, p, cs);
      if (out) writes.push([p, out]);
    }
    for (const p of COMPOUND_PROPS) {
      const raw = cs.getPropertyValue(p);
      if (written && written[p] === raw) { writes.push([p, raw]); continue; }
      /* A background-image that is only artwork has no colours to map, and
       * rewriting one that mixes a gradient over a url() would be wrong
       * anyway - the url half must survive untouched, which replace() does. */
      const out = convertCompound(raw, p);
      if (out) writes.push([p, out]);
    }
    if (!writes.length) { done.set(el, { sig: '', written: null }); return; }

    const sig = writes.map(([p, v]) => p + v).join('|');
    if (prev && prev.sig === sig) return;
    done.set(el, { sig, written: Object.fromEntries(writes) });
    painted += 1;
    /* Our own write lands on the style attribute, which the observer is
     * watching, which re-queues the element, which paints it again. On a
     * site whose inputs carry `transition: background-color .25s` that loop
     * never settles: a running transition outranks even !important, so each
     * repaint restarts the transition and the element is pinned at its
     * pre-transition colour forever. Wikipedia's search box stayed white
     * for exactly this reason. Mark the element before writing so the
     * observer knows the next mutation on it is ours. */
    selfWrites.add(el);
    for (const [p, v] of writes) el.style.setProperty(p, v, 'important');
  }

  /* ---- pseudo-elements -------------------------------------------------
   * ::before and ::after have no node, so nothing can be given an inline
   * style - and they are not rare decoration: Wikipedia fades the bottom of
   * its pinned contents list with a `linear-gradient(transparent, #fff)` on
   * a ::after, which stays a white smear over a dark page. base.css cannot
   * help either, because it cannot know which pseudo-elements exist or what
   * colours they carry.
   *
   * They can still be reached by generating a rule. The host gets a unique
   * attribute and a matching rule goes into a stylesheet of our own, which
   * is the only way to address a pseudo-element from script. Only hosts
   * whose pseudo actually paints something are tagged, and the total is
   * capped so a pathological page cannot grow an unbounded stylesheet. */
  const PSEUDO_LIMIT = 600;
  let pseudoSheet = null;
  let pseudoCount = 0;

  function pseudoRules() {
    if (pseudoSheet) return pseudoSheet;
    const el = document.createElement('style');
    el.id = '__rp_pseudo';
    (document.head || document.documentElement).appendChild(el);
    pseudoSheet = el;
    return el;
  }

  /* Checked once per element, ever. The early return only covered elements
   * that turned out to HAVE a pseudo-element; everything else was probed
   * again on every sweep, at two getComputedStyle calls apiece. On a long
   * article that is tens of thousands of style resolutions per pass. */
  const pseudoChecked = new WeakSet();

  function paintPseudo(el) {
    if (pseudoCount >= PSEUDO_LIMIT || pseudoChecked.has(el)) return;
    pseudoChecked.add(el);
    const decls = [];
    for (const which of ['::before', '::after']) {
      let cs;
      try { cs = getComputedStyle(el, which); } catch { continue; }
      if (!cs || cs.content === 'none') continue;
      const parts = [];
      const bg = convertSimple(cs.backgroundColor, 'background-color', cs);
      if (bg) parts.push(`background-color: ${bg} !important`);
      const img = convertCompound(cs.backgroundImage, 'background-image');
      if (img) parts.push(`background-image: ${img} !important`);
      const col = convertSimple(cs.color, 'color', cs);
      if (col) parts.push(`color: ${col} !important`);
      if (parts.length) decls.push([which, parts]);
    }
    if (!decls.length) return;
    const id = String(++pseudoCount);
    el.setAttribute('data-rp-p', id);
    const sheet = pseudoRules();
    for (const [which, parts] of decls) {
      sheet.appendChild(document.createTextNode(
        `[data-rp-p="${id}"]${which}{${parts.join(';')}}\n`));
    }
  }

  /* ---- scheduling -----------------------------------------------------
   * Work is chunked so a large DOM cannot block interaction. Each slice
   * stops either when the idle deadline runs out or after a fixed count,
   * whichever comes first, and reschedules itself. */

  /* Budget by time, not by count. 300 elements is cheap on one page and a
   * dropped frame on another, and under the rAF fallback every chunk lands
   * inside a frame - so the cost has to be measured, not assumed. Six
   * milliseconds leaves the rest of a 16ms frame to the page. */
  const CHUNK_MS = 6;

  function flush(deadline) {
    scheduled = false;
    try {
      let n = 0;
      const until = performance.now() + CHUNK_MS;
      for (const el of queue) {
        queue.delete(el);
        paint(el);
        n += 1;
        if (n % 8 !== 0) continue;         // checking the clock is not free
        const outOfTime = hasIdle && deadline
          && typeof deadline.timeRemaining === 'function'
          ? deadline.timeRemaining() < 3
          : performance.now() >= until;
        if (outOfTime) break;
      }
    } catch (e) {
      report('flush-threw', e && e.stack ? e.stack : e);
      return;
    }
    if (queue.size) schedule();
    else report('ok', 'painted ' + painted + ' elements');
  }

  /* `(a || b)(...)` is a plain call, not a method call, so the receiver is
   * lost and Safari throws "Illegal invocation" on requestAnimationFrame.
   * Safari is also where the fallback actually gets taken, so the whole
   * engine died there while Chrome, which has requestIdleCallback, never
   * exercised the branch. Bind it once. */
  /* Safari has no requestIdleCallback, so the fallback is what actually runs
   * there - and requestAnimationFrame hands the callback a timestamp, a
   * plain number, not an idle deadline. The loop below used to call
   * deadline.timeRemaining() on it, which throws TypeError on the very
   * first chunk; flush caught it and returned without rescheduling, so
   * painting stopped dead after 300 elements. A small page is mostly done
   * by then and looks fine - which is exactly why the landing page worked
   * and a long article did not. Chrome has requestIdleCallback, so no
   * harness running there could ever reach this branch. */
  const hasIdle = typeof window.requestIdleCallback === 'function';
  /* The fallback is setTimeout rather than requestAnimationFrame. rAF does
   * not run at all in a background tab, so a page opened in one and left
   * there would never finish painting and would still be the site's own
   * colours when it was brought forward. setTimeout is throttled there but
   * keeps making progress, and since each chunk is time-boxed anyway there
   * is nothing to gain from frame alignment. */
  const idle = hasIdle
    ? window.requestIdleCallback.bind(window)
    : (fn) => setTimeout(fn, 16);

  function schedule() {
    if (!ready || scheduled) return;
    scheduled = true;
    idle(flush, { timeout: 500 });
  }

  function enqueueTree(root) {
    if (root.nodeType === 1) queue.add(root);
    if (!root.querySelectorAll) return;
    for (const el of root.querySelectorAll('*')) queue.add(el);
    schedule();
  }

  /* ---- lifecycle ------------------------------------------------------ */

  /* A logo drawn in black on transparency is invisible once the page behind
   * it is dark - Wikipedia's wordmark is exactly this. Images cannot be
   * recoloured through CSS, but they can be inverted, and inverting is right
   * precisely when the artwork is dark and mostly transparent: that is an
   * icon or wordmark meant to sit on a light page, not a photograph.
   * Sampling is done on a small canvas and only for same-origin or CORS-
   * readable images; a tainted canvas throws on getImageData and the image
   * is left alone. */
  const INVERT_FLAG = '__rpInverted';

  function maybeInvertImage(img) {
    if (img[INVERT_FLAG] !== undefined) return;
    const w = img.naturalWidth, h = img.naturalHeight;
    /* Not decoded yet: leave the flag unset so the load handler can analyse
     * it properly. Marking it here was why the wordmark stayed dark - the
     * first scan ran before the image had decoded, set the flag to false,
     * and the load handler then returned immediately on that same flag. */
    if (!w || !h) return;
    img[INVERT_FLAG] = false;
    if (w > 512 || h > 512) return;               // photographs are left alone
    try {
      const c = document.createElement('canvas');
      const n = 24;                                // a coarse sample is plenty
      c.width = n; c.height = n;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, n, n);
      const d = g.getImageData(0, 0, n, n).data;
      let opaque = 0, lumSum = 0;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3] / 255;
        if (a < 0.4) continue;
        opaque += 1;
        lumSum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      }
      if (!opaque) return;
      const coverage = opaque / (n * n);
      const meanLum = lumSum / opaque;
      /* Dark ink over mostly-empty space: a mark, not a picture. */
      if (coverage < 0.55 && meanLum < 0.45) {
        img[INVERT_FLAG] = true;
        img.style.setProperty('filter', 'invert(1) hue-rotate(180deg)', 'important');
      }
    } catch { /* cross-origin pixels are unreadable; leave it as it is */ }
  }

  function scanImage(img) {
    if (img.complete) maybeInvertImage(img);
    else img.addEventListener('load', () => maybeInvertImage(img), { once: true });
  }

  /* Scoped to a root. It used to walk document.images on every mutation
   * batch, which on a page that mutates steadily while loading is the whole
   * image list over and over - and maybeInvertImage draws to a canvas. */
  function scanImages(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.tagName === 'IMG') scanImage(root);
    if (root.querySelectorAll) for (const img of root.querySelectorAll('img')) scanImage(img);
  }

  function applyImageDim() {
    const id = '__rp_imgdim';
    let s = document.getElementById(id);
    if (settings.imageDim >= 1) { if (s) s.remove(); return; }
    if (!s) {
      s = document.createElement('style');
      s.id = id;
      (document.head || document.documentElement).appendChild(s);
    }
    s.textContent =
      `img,video,canvas,picture{filter:brightness(${settings.imageDim}) !important}`;
  }

  /* Safari gives a content script no reachable console, so a thrown error
   * here is completely silent - the page keeps base.css's text colour and
   * nothing else, which looks like a styling bug rather than a dead engine.
   * Status goes to storage so the popup can show it. */
  let lastReport = '';

  function report(status, detail) {
    const line = status + '|' + String(detail || '');
    if (line === lastReport) return;      // no storage churn on every sweep
    lastReport = line;
    try {
      api.storage.local.set({
        diag: { host: siteKey(), status, detail: String(detail || '').slice(0, 300), at: Date.now() },
      });
    } catch { /* nothing left to do if even this fails */ }
    try {
      document.documentElement.setAttribute('data-rose-pine-status', status);
    } catch {}
  }

  /* base.css reads these, so they have to be on the element before anything
   * is painted. */
  /* Safari tints its toolbar and tab bar from the page's theme-color, which
   * is why a themed page still sat in a window whose chrome was a different
   * colour from every other app. Setting it to the page background makes the
   * window match the rest of the desktop. */
  function publishThemeColor() {
    let m = document.querySelector('meta[name="theme-color"]');
    if (!m) {
      m = document.createElement('meta');
      m.setAttribute('name', 'theme-color');
      (document.head || document.documentElement).appendChild(m);
    }
    m.setAttribute('content', RP.base);
    /* A page may ship several, scoped by media query; ours has to be the one
     * that applies, so the rest are neutralised rather than removed. */
    for (const other of document.querySelectorAll('meta[name="theme-color"]')) {
      if (other !== m) other.setAttribute('content', RP.base);
    }
  }

  function publishVariant() {
    const d = document.documentElement;
    d.style.setProperty('--rp-base', RP.base);
    d.style.setProperty('--rp-surface', RP.surface);
    d.style.setProperty('--rp-text', RP.text);
    d.style.setProperty('--rp-hl-med', RP.highlightMed);
    d.style.setProperty('--rp-hl-high', RP.highlightHigh);
    d.style.setProperty('--rp-muted', RP.muted);
  }

  /* Nothing may be painted until the page's own stylesheets have applied.
   * The content script runs at document_start, so at that moment a link has
   * no colour of its own yet - it inherits, and what it inherits is
   * base.css's text colour. Painting then captured #e0def4 and locked it in
   * with !important, so every link on the page stayed white no matter what
   * Wikipedia's stylesheet said afterwards. Bigger pages have more of their
   * styling arrive late, which is why articles looked untouched while the
   * landing page looked fine. base.css covers the canvas in the meantime,
   * so waiting costs nothing visible. */
  let ready = document.readyState !== 'loading';
  let started = false;

  /* Waiting on DOMContentLoaded alone is too fragile: if that one signal is
   * missed - a different content-script world, a listener attached after it
   * fired, anything host-specific - the gate never opens and the page is
   * never painted at all, which is a far worse failure than painting a
   * little early. So every signal that means "stylesheets are in" opens it,
   * and a timer opens it regardless. */
  function markReady() {
    if (ready) return;
    ready = true;
    if (!started) return;
    publishThemeColor();            // <head> exists now, so the meta lands in it
    if (document.documentElement) enqueueTree(document.documentElement);
  }

  if (!ready) {
    addEventListener('DOMContentLoaded', markReady, { once: true });
    addEventListener('load', markReady, { once: true });
    document.addEventListener('readystatechange', () => {
      if (document.readyState !== 'loading') markReady();
    });
    setTimeout(markReady, 1500);
  }

  /* At document_start the script can run before <html> itself exists, and
   * then document.documentElement is null. start() took that for granted
   * and threw on its first line - on an article page, where more work
   * happens before the parser gets going, that was every single load, so
   * the engine never ran at all. The landing page was smaller and usually
   * lost the race, which is why one worked and the other did not. */
  function whenRoot(fn) {
    if (document.documentElement) { fn(); return; }
    let tries = 0;
    const t = setInterval(() => {
      if (document.documentElement) { clearInterval(t); fn(); }
      else if (++tries > 200) clearInterval(t);   // ~2s; give up rather than spin
    }, 10);
  }

  function start() {
    document.documentElement.setAttribute('data-rose-pine', 'on');
    publishVariant();
    publishThemeColor();
    try { sessionStorage.setItem('__rp_off', '0'); } catch {}

    started = true;
    if (!ready && document.readyState !== 'loading') markReady();
    enqueueTree(document.documentElement);
    applyImageDim();
    scanImages(document.documentElement);
    observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes') {
          /* Deleting on the first match was wrong: setting eight properties
           * produces eight mutation records, so seven still got through and
           * the repaint loop survived. The whole set is cleared once, after
           * the batch has been processed. */
          if (r.attributeName === 'style' && selfWrites.has(r.target)) continue;
          if (r.attributeName === 'data-rp-p') continue;   // our own tag
          /* A class change on an ancestor can reveal a subtree that was
           * hidden when it was last looked at, so it is re-walked - but
           * only for class, and only when the subtree is small. Re-walking
           * on every attribute mutation is O(subtree) per mutation, and a
           * long article mutates attributes on its big containers steadily
           * while it loads; the queue then grows faster than it drains and
           * the page never finishes being painted. */
          if (r.attributeName === 'class' && r.target.childElementCount < 200) {
            enqueueTree(r.target);
          } else {
            queue.add(r.target);
          }
        } else {
          for (const n of r.addedNodes) { enqueueTree(n); scanImages(n); }
        }
      }
      selfWrites.clear();
      schedule();
    });
    observer.observe(document.documentElement, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['style', 'class', 'data-rp-p'],
    });

    /* Component frameworks re-render after we have painted and write their
     * own style attribute over ours - Wikipedia's search box does exactly
     * this, which is why it stayed white while carrying our declaration a
     * moment earlier. The mutation observer races them and can lose, so
     * re-sweep a few times as the page settles. paint() recomputes the
     * signature from the live computed value, so an element the site has
     * since overwritten looks changed and is simply repainted; one it has
     * not touched costs a getComputedStyle and nothing else. */
    /* Two settling passes, not four. Each one re-walks the whole tree, and
     * the mutation observer already covers anything that changes after the
     * page has settled; the extra passes cost a full traversal apiece to
     * catch almost nothing. */
    for (const delay of [800]) {
      setTimeout(() => { if (observer) enqueueTree(document.documentElement); }, delay);
    }
    addEventListener('load', () => { if (observer) enqueueTree(document.documentElement); }, { once: true });
  }

  function stop() {
    document.documentElement.removeAttribute('data-rose-pine');
    try { sessionStorage.setItem('__rp_off', '1'); } catch {}
    if (observer) { observer.disconnect(); observer = null; }
    queue.clear();
    const dim = document.getElementById('__rp_imgdim');
    if (dim) dim.remove();
    /* Clearing is a reload rather than an unwind: the inline properties we
     * wrote are indistinguishable from the site's own by the time they are
     * in the style attribute, so removing them by hand risks taking real
     * ones with it. */
    location.reload();
  }

  function siteKey() { return location.hostname.replace(/^www\./, ''); }

  /* Three-way, the way Noir does it. "auto" is the default and only themes
   * a page while the system is in Dark Mode, so a light-mode desktop is not
   * forced dark; "always" ignores the system; "never" is off. A per-site
   * switch overrides whichever is chosen, because the common case is one
   * site that must be left alone. */
  function resolve(store) {
    const mode = store.mode || 'auto';
    const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const globalOn = mode === 'always' || (mode === 'auto' && systemDark);
    const perSite = (store.sites || {})[siteKey()];
    const variant = store.variant || 'rice';
    setVariant(variant);
    return {
      enabled: perSite === undefined ? globalOn : perSite,
      strict: store.strict === true,
      variant,
      imageDim: typeof store.imageDim === 'number' ? store.imageDim : 0.9,
    };
  }

  const api = typeof browser !== 'undefined' ? browser : chrome;
  const KEYS = ['mode', 'variant', 'strict', 'imageDim', 'sites'];

  /* Chrome's storage API takes a callback, Safari's returns a promise and
   * ignores one. Accept either, so the engine starts on both. */
  function read() {
    return new Promise((done) => {
      let settled = false;
      const finish = (v) => { if (!settled) { settled = true; done(v || {}); } };
      try {
        const maybe = api.storage.local.get(KEYS, finish);
        if (maybe && typeof maybe.then === 'function') maybe.then(finish, () => finish({}));
      } catch { finish({}); }
    });
  }

  /* Reload only for the settings that cannot be applied in place. Reloading
   * on ANY change was a reload loop: report() writes to storage, the storage
   * listener fires, the page reloads, the fresh page reports again. Image
   * brightness is just a stylesheet and needs no reload at all. */
  function apply(store) {
    const prev = settings;
    const next = resolve(store);
    settings = next;

    if (!next.enabled) { if (prev.enabled) stop(); return; }
    if (!prev.enabled
        || next.strict !== prev.strict
        || next.variant !== prev.variant) {
      location.reload();
      return;
    }
    applyImageDim();
  }

  read().then((store) => {
    try {
      settings = resolve(store);
      if (settings.enabled) {
        /* If palette.js threw at load, mapColor is simply absent and every
         * paint would fail later with a bare ReferenceError. Say so up front. */
        report('starting', 'mode=' + (store.mode || 'auto')
          + ' mapColor=' + (typeof mapColor)
          + ' parseColor=' + (typeof parseColor));
        whenRoot(start);
      } else {
        report('disabled', 'mode=' + (store.mode || 'auto')
          + ' systemDark=' + matchMedia('(prefers-color-scheme: dark)').matches);
        whenRoot(() => document.documentElement.removeAttribute('data-rose-pine'));
        try { sessionStorage.setItem('__rp_off', '1'); } catch {}
      }
    } catch (e) {
      report('start-threw', e && e.stack ? e.stack : e);
    }
  }, (e) => report('storage-rejected', e));

  api.storage.onChanged.addListener((changes, area) => {
    if (area && area !== 'local') return;
    /* diag is this script's own bookkeeping. Reacting to it is what closed
     * the loop in the first place, so it is filtered before anything else. */
    const keys = Object.keys(changes || {});
    if (keys.length && keys.every((k) => k === 'diag')) return;
    read().then(apply);
  });

  /* In auto mode the answer changes when the system flips appearance, with
   * no storage event to notice it. */
  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  darkQuery.addEventListener('change', () => read().then(apply));
})();
