const api = typeof browser !== 'undefined' ? browser : chrome;

const el = {
  site: document.getElementById('site'),
  siteToggle: document.getElementById('site-toggle'),
  seg: document.querySelectorAll('#mode-seg button'),
  variantSeg: document.querySelectorAll('#variant-seg button'),
  strictToggle: document.getElementById('strict-toggle'),
  dim: document.getElementById('dim'),
  diag: document.getElementById('diag'),
  dimValue: document.getElementById('dim-value'),
};

let host = '';

function get(keys) {
  return new Promise((res) => api.storage.local.get(keys, res));
}
function set(obj) {
  return new Promise((res) => api.storage.local.set(obj, res));
}

async function init() {
  const tabs = await new Promise((res) =>
    api.tabs.query({ active: true, currentWindow: true }, res));
  const url = tabs && tabs[0] && tabs[0].url;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { host = ''; }

  const store = await get(['mode', 'variant', 'strict', 'imageDim', 'sites', 'diag']);
  const sites = store.sites || {};
  const mode = store.mode || 'auto';
  const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
  /* What the site will actually do, which is what the per-site switch has
     to show - "auto" plus a light desktop means off. */
  const globalOn = mode === 'always' || (mode === 'auto' && systemDark);
  el.seg.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  const variant = store.variant || 'rice';
  el.variantSeg.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.variant === variant)));

  el.site.textContent = host || 'this page';
  /* An unset per-site value means "follow the global default", so the switch
   * shows what the site will actually do rather than an empty state. */
  el.siteToggle.checked = sites[host] === undefined ? globalOn : sites[host];
  el.siteToggle.disabled = !host;
  el.strictToggle.checked = store.strict === true;

  /* The content script has no console in Safari, so whatever it last managed
     to record is the only window into why a page did not get themed. */
  const d = store.diag;
  el.diag.textContent = d
    ? `${d.status} — ${d.detail} (${d.host})`
    : 'no report yet — reload a page';

  const dim = typeof store.imageDim === 'number' ? store.imageDim : 0.9;
  el.dim.value = Math.round(dim * 100);
  el.dimValue.textContent = `${Math.round(dim * 100)}%`;
}

el.siteToggle.addEventListener('change', async () => {
  if (!host) return;
  const store = await get(['sites']);
  const sites = store.sites || {};
  sites[host] = el.siteToggle.checked;
  await set({ sites });
});

el.variantSeg.forEach((b) => b.addEventListener('click', async () => {
  el.variantSeg.forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  await set({ variant: b.dataset.variant });
}));

el.seg.forEach((b) => b.addEventListener('click', async () => {
  el.seg.forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  await set({ mode: b.dataset.mode });
  init();
}));

el.strictToggle.addEventListener('change', async () => {
  await set({ strict: el.strictToggle.checked });
});

el.dim.addEventListener('input', () => {
  el.dimValue.textContent = `${el.dim.value}%`;
});
el.dim.addEventListener('change', async () => {
  await set({ imageDim: Number(el.dim.value) / 100 });
});

init();
