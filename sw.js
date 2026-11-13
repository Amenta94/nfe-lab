/* NF-e Lab — service worker: funciona sem internet e recebe arquivos do "Compartilhar" */
const V = 'nfelab-abc5b65b';
const SHARE = 'nfelab-share';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './maskable-512.png', './apple-touch-icon.png', './favicon-32.png'];
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await c.addAll(CORE);
    await Promise.all(CDN.map(u => fetch(u, { mode: 'no-cors' }).then(r => c.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V && k !== SHARE) await caches.delete(k);
    await self.clients.claim();
  })());
});
async function receberCompartilhado(req) {
  try {
    const fd = await req.formData();
    const c = await caches.open(SHARE);
    let i = 0;
    for (const f of fd.getAll('files')) {
      if (!f || typeof f === 'string') continue;
      await c.put(new Request('./shared/' + Date.now() + '-' + (i++)), new Response(f, { headers: { 'X-Name': encodeURIComponent(f.name || 'arquivo.xml'), 'Content-Type': f.type || 'application/octet-stream' } }));
    }
    const txt = [fd.get('text'), fd.get('title')].filter(x => typeof x === 'string' && x.includes('<')).join('\n');
    if (txt) await c.put(new Request('./shared/' + Date.now() + '-t'), new Response(txt, { headers: { 'X-Name': 'texto-compartilhado.xml', 'Content-Type': 'text/xml' } }));
  } catch (err) {}
  return Response.redirect('./?shared=1', 303);
}
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/share-target')) { e.respondWith(receberCompartilhado(req)); return; }
  if (req.method !== 'GET') return;
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;           // Baixador XML (Windows)
  if (url.origin === location.origin && url.pathname.endsWith('/share-target')) { e.respondWith(Response.redirect('./', 303)); return; }
  if (req.mode === 'navigate' || (url.origin === location.origin && /\.(webmanifest|js|html|json)$/.test(url.pathname))) {                                                        // página: rede primeiro, cópia local se offline
    e.respondWith((async () => {
      try { const r = await fetch(req); if (r.ok) { const c = await caches.open(V); c.put(req.mode === 'navigate' ? './index.html' : req, r.clone()); } return r; }
      catch (err) { return (await caches.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? ((await caches.match('./index.html')) || (await caches.match('./'))) : null) || Response.error(); }
    })());
    return;
  }
  const cdn = /(^|\.)cdnjs\.cloudflare\.com$|(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (cdn || url.origin === location.origin) {                                          // bibliotecas, fontes, ícones: cópia local primeiro
    e.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: url.origin === location.origin });
      if (hit) return hit;
      try { const r = await fetch(req); if (r && (r.ok || r.type === 'opaque')) { const c = await caches.open(V); c.put(req, r.clone()); } return r; }
      catch (err) { return Response.error(); }
    })());
  }
});
