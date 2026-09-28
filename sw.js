// จดหน่อย — Service Worker (offline + รับรูปที่แชร์เข้ามาบน Android)
const CACHE = 'mininote-v2';
const SHARE = 'jodnoi-share';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== SHARE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const r = e.request;
  const u = new URL(r.url);

  // รับไฟล์ที่แชร์เข้ามา (Android: แชร์สลิปจากแอปธนาคาร → จดหน่อย)
  if (r.method === 'POST' && u.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const fd = await r.formData();
      const files = fd.getAll('images').filter(f => f && f.size);
      const c = await caches.open(SHARE);
      for (const k of await c.keys()) await c.delete(k);
      let i = 0;
      for (const f of files) {
        await c.put('./shared/' + i, new Response(f, { headers: { 'content-type': f.type || 'image/jpeg' } }));
        i++;
      }
      const text = [fd.get('title'), fd.get('text')].filter(Boolean).join(' ');
      return Response.redirect('./?shared=' + i + (text ? '&text=' + encodeURIComponent(text) : ''), 303);
    })());
    return;
  }

  if (r.method !== 'GET') return;
  const sameOrigin = u.origin === location.origin;
  const cdn = /(^|\.)fonts\.(googleapis|gstatic)\.com$|(^|\.)cdn\.jsdelivr\.net$/.test(u.hostname);
  if (!sameOrigin && !cdn) return; // ไม่แตะ API ของ AI

  // หน้า HTML: network-first → อัปเดตไฟล์ใหม่ได้ทันทีโดยไม่ต้องทำ cache-busting
  if (r.mode === 'navigate' || u.pathname.endsWith('.html') || u.pathname.endsWith('/')) {
    e.respondWith(
      fetch(r).then(res => {
        const cp = res.clone();
        caches.open(CACHE).then(c => c.put(r, cp));
        return res;
      }).catch(() => caches.match(r).then(m => m || caches.match('./index.html')))
    );
    return;
  }

  // ไฟล์อื่น (ฟอนต์, ไลบรารี QR, ไอคอน): cache-first
  e.respondWith(
    caches.match(r).then(m => m || fetch(r).then(res => {
      if (res.ok || res.type === 'opaque') {
        const cp = res.clone();
        caches.open(CACHE).then(c => c.put(r, cp));
      }
      return res;
    }))
  );
});
