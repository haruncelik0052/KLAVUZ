// Klavuz OCR: yazısı resim ya da çizgi olan PDF sayfalarını telefonda, internetsiz okur.
// Motor: Tesseract.js (Apache 2.0). Bütün dosyalar uygulamanın içinde (vendor/), internetten hiçbir şey indirilmez.
// Okunan sözcükler PDF yazılarıyla aynı biçime çevrilir: { str, x, y, w, h } (PDF koordinatı, y yukarı doğru artar);
// böylece aynı tablo okuyucusu (Okuyucu.parsePage) çalışır, ayrı bir tablo mantığı yoktur.
(function () {
  'use strict';
  var SCALE = 3;          // yaklaşık 216 dpi: küçük tablo yazıları da seçilir
  var MIN_CONF = 35;      // bundan düşük güvenli sözcükler atılır
  var worker = null, starting = null, info = { engine: '', err: '' };

  // Sayfa OCR gerektiriyor mu? Yazı yok (taranmış sayfa) ya da yazılar çizgiye çevrilmiş (çok sayıda eğri, az yazı).
  function need(textCount, curves) {
    if (textCount < 5) return true;
    return curves > 3000 && curves > 50 * textCount;
  }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src;
      s.onload = function () { res(); }; s.onerror = function () { rej(new Error(src + ' yüklenemedi')); };
      document.head.appendChild(s);
    });
  }
  // file:// altında fetch çalışmaz; XMLHttpRequest çalışır
  function loadBin(url) {
    return new Promise(function (res, rej) {
      var x = new XMLHttpRequest(); x.open('GET', url); x.responseType = 'arraybuffer';
      x.onload = function () { if (x.response && x.response.byteLength > 1000) res(new Uint8Array(x.response)); else rej(new Error(url + ' okunamadı')); };
      x.onerror = function () { rej(new Error(url + ' okunamadı')); };
      x.send();
    });
  }
  function simd() {
    try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch (e) { return false; }
  }
  // Motor takılırsa okuma sonsuza dek beklemesin
  function limit(pr, ms, what) {
    var t; return Promise.race([pr, new Promise(function (_, rej) { t = setTimeout(function () { rej(new Error(what + ' zaman aşımı')); }, ms); })]).finally(function () { clearTimeout(t); });
  }
  function abs(u) { return new URL(u, location.href).href; }

  async function start() {
    if (worker) return worker;
    if (starting) return starting;
    starting = (async function () {
      if (typeof Tesseract === 'undefined') await loadScript('vendor/tesseract.min.js');
      var langs = await Promise.all([loadBin('vendor/tur.traineddata.gz'), loadBin('vendor/eng.traineddata.gz')]);
      var core = simd() ? 'vendor/tesseract-core-simd-lstm.wasm.js' : 'vendor/tesseract-core-lstm.wasm.js';
      var w = await limit(Tesseract.createWorker([{ code: 'tur', data: langs[0] }, { code: 'eng', data: langs[1] }], 1, {
        workerPath: abs('vendor/worker.min.js'), corePath: abs(core), workerBlobURL: false, cacheMethod: 'none', gzip: true,
        errorHandler: function (e) { info.err = String(e); }
      }), 90000, 'OCR motoru açılırken');
      await w.setParameters({ tessedit_pageseg_mode: (window.KLAVUZ_TEST || {}).ocrPsm || '11', preserve_interword_spaces: '1', user_defined_dpi: String(Math.round(72 * SCALE)) });
      info.engine = 'Tesseract ' + (/simd/.test(core) ? 'SIMD' : 'temel');
      worker = w; return w;
    })();
    try { return await starting; } catch (e) { info.err = (e && e.message) || String(e); throw e; } finally { starting = null; }
  }
  async function stop() {
    var w = worker; worker = null;
    if (w) { try { await w.terminate(); } catch (e) {} }
  }

  // Bir satırdaki sözcükler, aralarındaki boşluk dar ise tek yazı parçası olur (PDF'teki gibi); geniş boşluk sütun ayırır.
  function lineItems(words, vp) {
    var out = [], cur = null;
    words.sort(function (a, b) { return a.bbox.x0 - b.bbox.x0; });
    words.forEach(function (wd) {
      // Yazı çizgisi (baseline): virgül, ç, ş gibi aşağı sarkan harfler satırı kaydırmasın
      var b = wd.bbox, bl = wd.baseline, base = bl && isFinite(bl.y0) && isFinite(bl.y1) && bl.y0 > b.y0 ? Math.min(b.y1, (bl.y0 + bl.y1) / 2) : b.y1, hgt = base - b.y0;
      if (cur && b.x0 - cur.x1 < Math.max(6, 0.55 * Math.max(hgt, cur.h))) { cur.str += ' ' + wd.text; cur.x1 = b.x1; cur.y0 = Math.min(cur.y0, b.y0); cur.y1 = Math.max(cur.y1, base); cur.h = Math.max(cur.h, hgt); }
      else { if (cur) out.push(cur); cur = { str: wd.text, x0: b.x0, x1: b.x1, y0: b.y0, y1: base, h: hgt }; }
    });
    if (cur) out.push(cur);
    return out.map(function (c) {
      var p0 = vp.convertToPdfPoint(c.x0, c.y1), p1 = vp.convertToPdfPoint(c.x1, c.y0);
      return { str: c.str, x: Math.min(p0[0], p1[0]), y: Math.min(p0[1], p1[1]), w: Math.abs(p1[0] - p0[0]), h: Math.abs(p1[1] - p0[1]), ocr: true };
    });
  }
  // Resmi OCR için temizle: renkli zemin (kırmızı başlık, mavi şerit) beyaz olur, üstündeki beyaz yazı siyaha döner;
  // açık gri satır zemini beyaz olur. Böylece bütün yazılar beyaz zeminde koyu kalır.
  function prep(cv) {
    var w = cv.width, h = cv.height, g = cv.getContext('2d'), im = g.getImageData(0, 0, w, h), d = im.data, n = w * h, i;
    var lum = new Uint8Array(n), col = new Uint8Array(n);
    for (i = 0; i < n; i++) {
      var r = d[4 * i], gg = d[4 * i + 1], b = d[4 * i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      lum[i] = (r * 299 + gg * 587 + b * 114) / 1000;
      col[i] = (mx - mn > 60 && mx > 60) || lum[i] < 110 && mx - mn > 40 ? 1 : 0; // renkli (doygun) piksel
    }
    // Renkli piksel oranı, her pikselin çevresinde (toplam tablosu ile hızlı)
    var R = Math.max(6, Math.round(w / 160)), W1 = w + 1, sum = new Int32Array(W1 * (h + 1));
    for (var y = 0; y < h; y++) { var acc = 0; for (var x = 0; x < w; x++) { acc += col[y * w + x]; sum[(y + 1) * W1 + x + 1] = sum[y * W1 + x + 1] + acc; } }
    for (y = 0; y < h; y++) {
      var y0 = Math.max(0, y - R), y1 = Math.min(h, y + R + 1);
      for (x = 0; x < w; x++) {
        i = y * w + x;
        var v, x0, x1, c;
        if (col[i] || lum[i] > 185) {
          x0 = Math.max(0, x - R); x1 = Math.min(w, x + R + 1);
          c = sum[y1 * W1 + x1] - sum[y0 * W1 + x1] - sum[y1 * W1 + x0] + sum[y0 * W1 + x0];
          var bg = c > 0.45 * (y1 - y0) * (x1 - x0);
          // renkli zemin beyaz, renkli zemin üstündeki açık yazı siyah; beyaz zemindeki renkli yazı siyah
          v = col[i] ? (bg ? 255 : 0) : (bg ? 0 : 255);
        } else v = lum[i] < 140 ? 0 : Math.round((lum[i] - 140) * 255 / 45);
        d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = v; d[4 * i + 3] = 255;
      }
    }
    // Tablo çizgilerini sil: uzun yatay ve dikey koyu çizgiler yazı değildir, OCR'ın satırları bölmesini bozar
    var dark = function (k) { return d[4 * k] < 128; }, kill = new Uint8Array(n), L = Math.round(w / 25), H = Math.round(h / 30), run, s0;
    for (y = 0; y < h; y++) {
      run = 0;
      for (x = 0; x <= w; x++) {
        if (x < w && dark(y * w + x)) { if (!run) s0 = x; run++; }
        else { if (run >= L) for (var k = s0; k < x; k++) kill[y * w + k] = 1; run = 0; }
      }
    }
    for (x = 0; x < w; x++) {
      run = 0;
      for (y = 0; y <= h; y++) {
        if (y < h && dark(y * w + x)) { if (!run) s0 = y; run++; }
        else { if (run >= H) for (var k2 = s0; k2 < y; k2++) kill[k2 * w + x] = 1; run = 0; }
      }
    }
    for (i = 0; i < n; i++) if (kill[i]) d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = 255;
    g.putImageData(im, 0, 0);
  }
  // Sayıların içindeki harf karışmaları (O→0, I/l/T→1, S→5): yalnız sayı gibi duran sözcüklerde düzeltilir.
  // Örnek: "ISA" → "15A", "SOA" → "50A", "DN5O" → "DN50", "7s" → "75". Düz yazıya dokunulmaz.
  function fixNum(t) {
    var m = /^(DN|NPS)?([0-9OoIl|TSs]+)(A|K|MM|mm|")?$/.exec(t);
    if (!m) return t;
    var core = m[2], digits = (core.match(/[0-9]/g) || []).length;
    if (!(m[1] || m[3] === 'A' || m[3] === 'K' || digits >= 1)) return t;
    if (!digits && core.length < 2) return t;
    if (!m[1] && !m[3] && digits < core.length - 1) return t; // çoğu harf olan sözcük sayı değildir
    return (m[1] || '') + core.replace(/[Oo]/g, '0').replace(/[Il|T]/g, '1').replace(/[Ss]/g, '5') + (m[3] || '');
  }
  // Aynı satırdaki parçaları aynı yüksekliğe hizala (PDF'te bir satırın yazıları aynı çizgidedir)
  function snap(list) {
    list.sort(function (a, b) { return b.y - a.y; });
    var grp = [], out = [];
    function flush() {
      if (!grp.length) return;
      var ys = grp.map(function (i) { return i.y; }).sort(function (a, b) { return a - b; }), m = ys[Math.floor(ys.length / 2)];
      grp.forEach(function (i) { i.y = m; }); grp = [];
    }
    list.forEach(function (i) {
      if (grp.length && Math.abs(grp[0].y - i.y) > 0.45 * Math.min(grp[0].h, i.h)) flush();
      grp.push(i);
    });
    flush();
    return list;
  }
  function clean(t) { return String(t || '').replace(/[|—_]+/g, ' ').replace(/\s+/g, ' ').trim(); }

  // Sayfayı çiz, OCR ile oku. items: sayfanın gerçek yazıları; onlarla çakışan OCR sözcükleri atılır.
  async function readPage(page, items) {
    var w = await start(), vp = page.getViewport({ scale: SCALE }), cv = document.createElement('canvas');
    cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    try {
      await page.render({ canvasContext: g, viewport: vp }).promise;
      prep(cv);
      if ((window.KLAVUZ_TEST || {}).ocrDump) window.KLAVUZ_TEST.ocrDump = cv.toDataURL('image/png'); // yalnız testlerde
      var r;
      try { r = await limit(w.recognize(cv, {}, { blocks: true, text: false }), 180000, 'OCR sayfa okuması'); }
      catch (e) { await stop(); throw e; }
      var out = [];
      ((r.data && r.data.blocks) || []).forEach(function (bl) {
        (bl.paragraphs || []).forEach(function (pa) {
          (pa.lines || []).forEach(function (ln) {
            var ws = (ln.words || []).filter(function (x) {
              x.text = fixNum(clean(x.text));
              if (x.text.length <= 2 && !/^[0-9]+["']?$/.test(x.text) && x.confidence < 75) return false; // resim üstünde çıkan kırıntılar
              return x.text && x.confidence >= ((window.KLAVUZ_TEST || {}).ocrConf != null ? KLAVUZ_TEST.ocrConf : MIN_CONF) && /[0-9A-Za-zÇĞİÖŞÜçğıöşü]/.test(x.text);
            });
            if (ws.length) out = out.concat(lineItems(ws, vp));
          });
        });
      });
      snap(out);
      // Gerçek yazı her zaman OCR'dan üstündür: üst üste binen OCR parçası atılır
      var real = items || [];
      out = out.filter(function (o) {
        var cx = o.x + o.w / 2, cy = o.y + o.h / 2;
        return !real.some(function (i) { return cx >= i.x - 2 && cx <= i.x + i.w + 2 && cy >= i.y - 3 && cy <= i.y + i.h + 3; });
      });
      return out;
    } finally { cv.width = cv.height = 0; }
  }

  window.KlavuzOcr = { fixNum: fixNum, need: need, readPage: readPage, start: start, stop: stop, info: info };
})();
