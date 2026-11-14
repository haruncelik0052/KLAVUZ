const CACHE = 'klavuz-v13';
const SHELL = ['./', './index.html', './app.js', './okuyucu.js', './ocr.js', './vendor/tesseract.min.js', './vendor/worker.min.js', './vendor/tesseract-core-simd-lstm.wasm.js', './vendor/tesseract-core-lstm.wasm.js', './vendor/tur.traineddata.gz', './vendor/eng.traineddata.gz', './vendor/pdf.min.js', './vendor/pdf.worker.min.js', './vendor/xlsx.full.min.js', './manifest.json', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});
