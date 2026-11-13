(function () {
  'use strict';

  // ---------- Yardımcılar ----------
  var KEY = 'klavuz.v1';
  var APP_VERSION = '0.3.0';
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }
  var SYM = { TL: 'TL', EUR: '€', USD: '$' };
  function fmtC(n, cur) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' ' + (SYM[cur || 'TL'] || 'TL');
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function num(v) { var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; }
  function fold(s) { return String(s || '').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/\s+/g, ' ').trim(); }
  function codeKey(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  // I/L ile 1, O ile 0 karışmasın diye ortak bir anahtar
  function confKey(c) { return codeKey(c).replace(/[IL]/g, '1').replace(/O/g, '0'); }
  function lev(a, b) {
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    var prev = []; for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      var cur = [i];
      for (var k = 1; k <= b.length; k++) cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function tokens(s) { return fold(s).split(/[^a-z0-9]+/).filter(function (t) { return t.length >= 3; }); }
  function toast(m) {
    var t = $('#toast'); t.textContent = m; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // ---------- Veri ----------
  var DEFAULT_NOTIFY = { up: true, down: true, below: true, pending: true, check: true };
  function empty() {
    return { items: {}, offers: {}, history: [], docs: [], cart: [], cartDiscount: 0, feedback: {}, vtest: {},
      settings: { company: '', phone: '', note: 'Fiyatlar KDV hariçtir.', notify: Object.assign({}, DEFAULT_NOTIFY) } };
  }
  var db;
  function load() {
    try {
      var d = Object.assign(empty(), JSON.parse(localStorage.getItem(KEY)) || {});
      d.settings = Object.assign(empty().settings, d.settings || {});
      d.settings.notify = Object.assign({}, DEFAULT_NOTIFY, d.settings.notify || {});
      return d;
    } catch (e) { return empty(); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('Kayıt alanı doldu. Yedek alıp eski belgeleri silin.'); } }

  // Resimler çok yer kapladığı için ayrı veritabanında (IndexedDB) tutulur.
  // Anahtarlar: "item:<ürünId>" -> resim, "doc:<belgeId>" -> belgedeki tüm resimler
  var idb = null, kvCache = {};
  function openImgDb() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no indexeddb'));
      var r = indexedDB.open('klavuz-img', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('img'); };
      r.onsuccess = function () { idb = r.result; res(idb); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function kvPut(k, v) {
    kvCache[k] = v;
    if (!idb) return;
    try { idb.transaction('img', 'readwrite').objectStore('img').put(v, k); } catch (e) {}
  }
  function kvGet(k) {
    if (k in kvCache) return Promise.resolve(kvCache[k]);
    if (!idb) return Promise.resolve(null);
    return new Promise(function (res) {
      try {
        var rq = idb.transaction('img').objectStore('img').get(k);
        rq.onsuccess = function () { kvCache[k] = rq.result === undefined ? null : rq.result; res(kvCache[k]); };
        rq.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
  }
  function kvDel(k) {
    delete kvCache[k];
    if (idb) try { idb.transaction('img', 'readwrite').objectStore('img').delete(k); } catch (e) {}
  }
  function kvClear() {
    kvCache = {};
    if (idb) try { idb.transaction('img', 'readwrite').objectStore('img').clear(); } catch (e) {}
  }
  // Yedek için: resim veritabanındaki her şeyi oku
  function kvAll() {
    return new Promise(function (res) {
      var out = {}; Object.keys(kvCache).forEach(function (k) { if (kvCache[k] != null) out[k] = kvCache[k]; });
      if (!idb) return res(out);
      try {
        var rq = idb.transaction('img').objectStore('img').openCursor();
        rq.onsuccess = function () { var c = rq.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
        rq.onerror = function () { res(out); };
      } catch (e) { res(out); }
    });
  }
  function hydrateImages(root) {
    (root || document).querySelectorAll('[data-kv]').forEach(function (el) {
      kvGet(el.dataset.kv).then(function (url) { if (url && el.isConnected) el.innerHTML = '<img alt="" src="' + url + '">'; });
    });
    (root || document).querySelectorAll('[data-img]').forEach(function (el) {
      var id = el.dataset.img;
      kvGet('item:' + id).then(function (url) {
        if (url && el.isConnected && el.dataset.img === id) el.innerHTML = '<img alt="" src="' + url + '">';
      });
    });
  }

  function offersOf(itemId) { return Object.values(db.offers).filter(function (o) { return o.itemId === itemId; }); }
  function buyOf(o) { return o.listPrice == null ? null : Math.round(o.listPrice * (1 - (o.supDisc || 0) / 100) * 100) / 100; }
  // Ölçüyü sayıya çevir (sıralama için): 1 1/2" -> 1.5, 3/16" -> 0.1875, 1’1/4 -> 1.25, 10.000 LT -> 10000
  function sizeNum(v) {
    var t = String(v || '').trim(), m;
    if ((m = t.match(/^(\d+)\s*[’'\s]\s*(\d+)\/(\d+)/))) return Number(m[1]) + Number(m[2]) / Number(m[3]);
    if ((m = t.match(/^(\d+)\/(\d+)/))) return Number(m[1]) / Number(m[2]);
    m = t.match(/\d[\d.]*(?:,\d+)?/); if (!m) return null;
    var n = parseFloat(m[0].replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return isNaN(n) ? null : n;
  }
  function sizeSort(a, b) {
    var x = sizeNum(a.size), y = sizeNum(b.size);
    if (x != null && y != null && x !== y) return x - y;
    return String(a.size || '').localeCompare(String(b.size || ''), 'tr', { numeric: true });
  }
  function similarItems(item) {
    var tk = tokens(item.name);
    return Object.values(db.items).filter(function (x) {
      if (x.id === item.id || !tk.length) return false;
      var t2 = tokens(x.name); if (!t2.length) return false;
      var common = tk.filter(function (t) { return t2.indexOf(t) >= 0; }).length;
      return common / Math.max(tk.length, t2.length) >= 0.6;
    });
  }
  function mergeItems(fromId, toId) {
    offersOf(fromId).forEach(function (o) { o.itemId = toId; });
    var from = db.items[fromId], to = db.items[toId];
    if (from && to && from.hasImg && !to.hasImg) { kvGet('item:' + fromId).then(function (u) { if (u) { kvPut('item:' + toId, u); to.hasImg = true; save(); render(); } }); }
    delete db.items[fromId]; save();
  }
  function itemCheckNeeded(it) {
    return !it.verified || offersOf(it.id).some(function (o) { return o.status === 'check'; });
  }

  // ---------- Belge okuma ----------
  var CODE_RE = /^[A-Za-z0-9][A-Za-z0-9\-\/\.]{4,}$/;
  var CUR_PART = '(?:TL|₺|€|EUR|USD|\\$)';
  var MONEY_RE = new RegExp('\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?\\s?' + CUR_PART + '?|\\d+,\\d{1,2}\\s?' + CUR_PART + '?|\\d+\\s?' + CUR_PART, 'gi');
  var MONEY_EXACT = new RegExp('^(?:\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,\\d{1,2})?\\s?' + CUR_PART + '?$', 'i');
  var SIZE_RE = /\d+\/\d+\s?"?|DN\s?\d+|M\d+(?:x\d+(?:[.,]\d+)?)?\b|\d+(?:[.,]\d+)?\s?(?:mm|cm|bar|kg|lt|inç|")/i;
  var STD_RE = /^(ISO|EN|ASTM|UNS|DIN|TS|JIS|BS|AISI|ASME|AWS)\b/i;
  function isCode(t) {
    return CODE_RE.test(t) && /\d/.test(t) && !/^\d{1,3}(\.\d{3})+$/.test(t) && !/,/.test(t) && !/(TL|₺|€|EUR|USD|\$)$/i.test(t);
  }
  function curOf(s) { return /€|EUR/i.test(s) ? 'EUR' : (/\$|USD/i.test(s) ? 'USD' : 'TL'); }
  function toNum(s) {
    var t = String(s).replace(/TL|₺|€|EUR|USD|\$/gi, '').trim();
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/\./g, '');
    var n = parseFloat(t); return isNaN(n) ? null : n;
  }
  function parseLine(line) {
    var raw = String(line || '').replace(/\s+/g, ' ').trim();
    if (raw.length < 4) return null;
    // Standart satırları (ISO, EN, ASTM...) ürün değil, bilgi notudur
    if (STD_RE.test(raw)) return null;
    var toks = raw.split(' '), code = null, idx = -1;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i].replace(/[,;:|()]+$/, '');
      if (isCode(t)) { code = t; idx = i; break; }
    }
    var rest = toks.filter(function (t, j) { return j !== idx; }).join(' ');
    var price = null, cur = 'TL', ms = rest.match(MONEY_RE);
    if (ms) {
      var last = ms[ms.length - 1]; price = toNum(last); cur = curOf(last);
      var p = rest.lastIndexOf(last); rest = rest.slice(0, p) + ' ' + rest.slice(p + last.length);
    }
    var size = '', sm = rest.match(SIZE_RE);
    if (sm) { size = sm[0].trim(); rest = rest.replace(sm[0], ' '); }
    var name = rest.replace(/\s+/g, ' ').replace(/^[\s\-–|:,;]+|[\s\-–|:,;]+$/g, '').trim();
    if (!code && price == null) return null;
    if (!code && name.length < 3) return null;
    var warn = null;
    if (!code) warn = 'kod yok';
    else if (price == null) warn = 'fiyat yok';
    else if (/[ILO]/.test(code.toUpperCase())) warn = 'kodu kontrol edin (I/L/1, O/0 karışabilir)';
    return { code: code || '', name: name, size: size, price: price, cur: cur, warn: warn };
  }
  function parseLines(lines) {
    return lines.map(function (l) {
      var text = typeof l === 'string' ? l : l.text;
      var r = parseLine(text);
      if (r && typeof l === 'object') { r.page = l.page; r.y = l.y; r.x = l.x; }
      return r;
    }).filter(Boolean);
  }
  function parseCells(cells) {
    var code = null, price = null, cur = 'TL', size = '', names = [];
    cells.forEach(function (c) {
      if (c === '' || c == null) return;
      if (typeof c === 'number') {
        if (!code && Number.isInteger(c) && String(c).length >= 6) { code = String(c); return; }
        price = c; return;
      }
      var s = String(c).trim(); if (!s) return;
      if (!code && isCode(s)) { code = s; return; }
      if (MONEY_EXACT.test(s)) { price = toNum(s); cur = curOf(s); return; }
      if (!size && SIZE_RE.test(s) && s.length <= 14) { size = s; return; }
      names.push(s);
    });
    if (!code && price == null) return null;
    names.sort(function (a, b) { return b.length - a.length; });
    var warn = !code ? 'kod yok' : (price == null ? 'fiyat yok' : null);
    return { code: code || '', name: names[0] || '', size: size, price: price, cur: cur, warn: warn };
  }

  // PDF: her sayfadaki tablolar ürüne çevrilir; resim, yanındaki tablonun bütün satırlarına bağlanır.
  // Sertifika / onay yazıları ürün olarak okunmaz, sayfa görüntüsü olarak saklanır.
  async function readPdf(file, prog, kind, force) {
    if (typeof pdfjsLib === 'undefined' || typeof Okuyucu === 'undefined') throw new Error('PDF okuyucu yüklenemedi.');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    var pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    var OPS = pdfjsLib.OPS, pages = [], allText = '', firstText = '', n = pdf.numPages, p;
    for (p = 1; p <= n; p++) {
      var pg = await pdf.getPage(p), tc = await pg.getTextContent();
      var items = tc.items.filter(function (i) { return i.str && i.str.trim(); }).map(function (i) {
        return { str: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, h: i.height || Math.abs(i.transform[3]) || 8 };
      });
      allText += items.map(function (i) { return i.str; }).join(' ') + '\n';
      if (p === 1) firstText = allText;
      pages.push({ page: pg, items: items });
      if (prog) prog(p, n, 'yazılar');
    }
    var textLength = allText.replace(/\s+/g, '').length;
    var cert = kind === 'sertifika' || (!force && Okuyucu.looksLikeCertificate(firstText, n));
    if (cert) {
      var shots = [], max = Math.min(n, 15);
      for (p = 1; p <= max; p++) {
        var vp0 = pages[p - 1].page.getViewport({ scale: 1.4 }), c0 = document.createElement('canvas');
        c0.width = vp0.width; c0.height = vp0.height;
        await pages[p - 1].page.render({ canvasContext: c0.getContext('2d'), viewport: vp0 }).promise;
        shots.push(c0.toDataURL('image/jpeg', 0.72));
        if (prog) prog(p, max, 'sayfa görüntüsü');
      }
      return { cert: true, pages: shots, rows: [], images: [], textLength: textLength, pageCount: n, tableCount: 0 };
    }
    var rows = [], images = [], tableCount = 0, emptyPages = 0, infoTables = [];
    for (p = 1; p <= n; p++) {
      var page = pages[p - 1].page, view = page.view, area = (view[2] - view[0]) * (view[3] - view[1]);
      var ops = await page.getOperatorList(), boxes = [], ctm = [1, 0, 0, 1, 0, 0], stack = [], seen = {};
      for (var k = 0; k < ops.fnArray.length; k++) {
        var fn = ops.fnArray[k], a = ops.argsArray[k];
        if (fn === OPS.save) stack.push(ctm.slice());
        else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
        else if (fn === OPS.transform) ctm = mulM(a, ctm);
        else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject || fn === OPS.paintImageXObjectRepeat) {
          var w = Math.abs(ctm[0]) + Math.abs(ctm[2]), h = Math.abs(ctm[1]) + Math.abs(ctm[3]);
          var x = Math.min(ctm[4], ctm[4] + ctm[0] + ctm[2]), y = Math.min(ctm[5], ctm[5] + ctm[1] + ctm[3]);
          var sig = [x, y, w, h].map(Math.round).join(',');
          if (Math.min(w, h) >= 38 && w * h < 0.5 * area && !seen[sig]) { seen[sig] = true; boxes.push({ id: boxes.length, x: x, y: y, w: w, h: h, name: a && a[0] }); }
        }
      }
      if (pages[p - 1].items.length < 5) emptyPages++;
      var res = Okuyucu.parsePage(pages[p - 1].items, boxes, p), urls = {}, inks = {}, usedPick = {};
      if (boxes.length) {
        // Önce resmin kendisini al (üstüne yazı binmez); alınamazsa sayfa görüntüsünden kırp
        var cv = null, vp = null;
        for (var bi = 0; bi < boxes.length; bi++) {
          var b = boxes[bi], url = null;
          try { var obj = await imgObject(page, b.name); if (obj) url = thumbUrl(objCanvas(obj)); } catch (e) { url = null; }
          if (!url) {
            if (!cv) {
              vp = page.getViewport({ scale: 2 });
              cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
              await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
            }
            var r = vp.convertToViewportRectangle([b.x, b.y, b.x + b.w, b.y + b.h]);
            var sx = Math.max(0, Math.min(r[0], r[2])), sy = Math.max(0, Math.min(r[1], r[3])), sw = Math.abs(r[2] - r[0]), sh = Math.abs(r[3] - r[1]);
            sw = Math.min(sw, cv.width - sx); sh = Math.min(sh, cv.height - sy);
            if (sw < 20 || sh < 20) continue;
            var t = document.createElement('canvas'); t.width = Math.round(sw); t.height = Math.round(sh);
            t.getContext('2d').drawImage(cv, sx, sy, sw, sh, 0, 0, t.width, t.height);
            url = thumbUrl(t);
          }
          if (url) { urls[b.id] = url; inks[b.id] = thumbUrl.ink || 0; images.push({ page: p, url: url }); }
        }
      }
      res.tables.forEach(function (t) {
        // Kodu da fiyatı da olmayan tablo ürün değil, bilgi tablosudur (malzeme özellikleri, basınç çizelgesi vb.)
        if (!t.hasCode && !t.hasPrice) { infoTables.push({ page: p, name: t.name || '(adsız)', rows: t.rows.length }); return; }
        tableCount++;
        // Resim: adaylar içinde fotoğrafı teknik çizime tercih et (çizim çoğunlukla beyazdır)
        var pick = null;
        (t.imgs || []).forEach(function (id) { if (urls[id] && (pick == null || inks[id] > inks[pick] * 1.3)) pick = id; });
        if (pick != null) usedPick[pick] = true;
        t.rows.forEach(function (r) {
          var warn = null;
          if (!t.name) warn = 'ürün adı bulunamadı';
          else if (t.guess) warn = 'ürün adı tahmin edildi';
          else if (t.hasCode && !r.code) warn = 'kod okunamadı';
          else if (t.hasPrice && r.price == null) warn = 'fiyat okunamadı';
          else if (!r.size && !r.code) warn = 'ölçü okunamadı';
          rows.push({ code: r.code, name: t.name || ('Adsız ürün (sayfa ' + p + ')'), sub: t.sub || '',
            size: (r.size + (r.variant ? ' · ' + r.variant : '')).trim(), price: r.price, cur: r.cur,
            priceVat: r.priceVat, specs: r.specs, img: pick != null ? urls[pick] : null, page: p, warn: warn });
        });
      });
      // Tablo dışında kalan, kodu ve fiyatı aynı satırda olan ürünler
      var lineRows = [], usedImg = {};
      Object.keys(usedPick).forEach(function (id) { usedImg[id] = true; });
      res.tables.forEach(function (t) { if (t.img != null) usedImg[t.img] = true; });
      res.loose.forEach(function (l) {
        var r = parseLine(l.text);
        if (r && r.code && r.price != null && r.name.length >= 3) { r.page = p; r.sub = ''; r.y = l.y; r.x = l.x; lineRows.push(r); rows.push(r); }
      });
      // Tabloya bağlanmamış resimler, en yakın tablo dışı ürün satırına bağlanır
      boxes.forEach(function (b) {
        if (usedImg[b.id] || !urls[b.id]) return;
        var best = null, bd = Infinity, cy = b.y + b.h / 2, cx = b.x + b.w / 2;
        lineRows.forEach(function (r) {
          if (r.img) return;
          var d = Math.abs(r.y - cy) + 0.5 * Math.abs(r.x - cx);
          if (d < bd) { bd = d; best = r; }
        });
        if (best && bd < 220) best.img = urls[b.id];
      });
      if (prog) prog(p, n, 'tablolar');
    }
    return { rows: rows, images: images, textLength: textLength, pageCount: n, tableCount: tableCount, emptyPages: emptyPages, infoTables: infoTables };
  }
  // PDF içindeki resim nesnesini al
  function imgObject(page, name) {
    return new Promise(function (res) {
      if (!name) return res(null);
      var store = String(name).indexOf('g_') === 0 ? page.commonObjs : page.objs, done = false;
      try { store.get(name, function (o) { done = true; res(o || null); }); } catch (e) { done = true; res(null); }
      setTimeout(function () { if (!done) res(null); }, 1500);
    });
  }
  function objCanvas(o) {
    if (!o || !o.width || !o.height) return null;
    var c = document.createElement('canvas'), g = c.getContext('2d'), w = o.width, h = o.height;
    c.width = w; c.height = h;
    if (o.bitmap) { g.drawImage(o.bitmap, 0, 0); return c; }
    if (!o.data) return null;
    var id = g.createImageData(w, h), d = o.data, px = w * h, i;
    if (o.kind === 3 && d.length >= px * 4) id.data.set(d.subarray(0, px * 4));
    else if (o.kind === 2 && d.length >= px * 3) { for (i = 0; i < px; i++) { id.data[4 * i] = d[3 * i]; id.data[4 * i + 1] = d[3 * i + 1]; id.data[4 * i + 2] = d[3 * i + 2]; id.data[4 * i + 3] = 255; } }
    else return null;
    g.putImageData(id, 0, 0); return c;
  }
  // Küçük resim: beyaz zemin, en fazla 360 piksel, kenardaki boşluklar kırpılır
  function thumbUrl(src) {
    if (!src || src.width < 20 || src.height < 20) return null;
    var sc = Math.min(1, 360 / Math.max(src.width, src.height)), w = Math.max(1, Math.round(src.width * sc)), h = Math.max(1, Math.round(src.height * sc));
    var t = document.createElement('canvas'); t.width = w; t.height = h;
    var g = t.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(src, 0, 0, w, h);
    try {
      var d = g.getImageData(0, 0, w, h).data, x0 = w, y0 = h, x1 = -1, y1 = -1, dark = 0;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var i = 4 * (y * w + x);
        if (d[i] < 242 || d[i + 1] < 242 || d[i + 2] < 242) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; dark++; }
      }
      if (x1 < 0 || dark < w * h * 0.01) return null; // boş ya da neredeyse boş resim
      var bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      thumbUrl.ink = dark / (bw * bh); // doluluk: fotoğrafta yüksek, teknik çizimde düşük
      if (bw >= 20 && bh >= 20 && bw * bh < 0.85 * w * h) {
        var pad = 4, cx = Math.max(0, x0 - pad), cy = Math.max(0, y0 - pad), cw = Math.min(w - cx, bw + 2 * pad), ch = Math.min(h - cy, bh + 2 * pad);
        var c2 = document.createElement('canvas'); c2.width = cw; c2.height = ch;
        var g2 = c2.getContext('2d'); g2.fillStyle = '#fff'; g2.fillRect(0, 0, cw, ch); g2.drawImage(t, cx, cy, cw, ch, 0, 0, cw, ch);
        t = c2;
      }
    } catch (e) {}
    return t.toDataURL('image/jpeg', 0.85);
  }
  // PDF matris çarpımı: yeni CTM = m × eski CTM
  function mulM(m, c) {
    return [m[0] * c[0] + m[1] * c[2], m[0] * c[1] + m[1] * c[3],
      m[2] * c[0] + m[3] * c[2], m[2] * c[1] + m[3] * c[3],
      m[4] * c[0] + m[5] * c[2] + c[4], m[4] * c[1] + m[5] * c[3] + c[5]];
  }
  async function readFile(file, prog, kind, force) {
    var n = file.name.toLowerCase();
    if (/\.pdf$/.test(n)) return await readPdf(file, prog, kind, force);
    if (/\.(xlsx|xls|csv|ods)$/.test(n)) {
      if (typeof XLSX === 'undefined') throw new Error('Excel okuyucu yüklenemedi.');
      var wb = XLSX.read(await file.arrayBuffer(), { type: 'array' }), out = [];
      wb.SheetNames.forEach(function (sn) {
        XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: '' }).forEach(function (r) {
          var pr = parseCells(r); if (pr) out.push(pr);
        });
      });
      return { rows: out, images: [], textLength: 1 };
    }
    return { rows: parseLines((await file.text()).split(/\r?\n/)), images: [], textLength: 1 };
  }
  function prepDraft(rows) {
    var seen = {};
    rows.forEach(function (r) {
      if (!r.code) return;
      var k = codeKey(r.code);
      if (seen[k]) r.warn = r.warn || 'aynı kod belgede iki kez var';
      seen[k] = true;
    });
    return rows;
  }
  // Okuma raporu: belge nasıl okundu, hangi uyarı kaç kez ve nerede çıktı. Paylaşılabilir metne çevrilir.
  function buildReport(name, supplier, kind, res, rows) {
    var prod = {}, prodImg = {}, warns = {}, samples = [], noPrice = 0, noCode = 0;
    rows.forEach(function (r) {
      var k = r.name + '|' + (r.sub || ''); prod[k] = true; if (r.img) prodImg[k] = true;
      if (r.price == null) noPrice++;
      if (!r.code) noCode++;
      if (r.warn) {
        warns[r.warn] = (warns[r.warn] || 0) + 1;
        if (samples.filter(function (s) { return s.why === r.warn; }).length < 4) samples.push({ p: r.page || 0, name: String(r.name).slice(0, 50), code: r.code || '', size: r.size || '', why: r.warn });
      }
    });
    return { ver: APP_VERSION, file: name, supplier: supplier, kind: kind, date: today(), pages: res.pageCount || 0, emptyPages: res.emptyPages || 0,
      tables: res.tableCount || 0, products: Object.keys(prod).length, withImg: Object.keys(prodImg).length, rows: rows.length,
      noPrice: noPrice, noCode: noCode, info: (res.infoTables || []).slice(0, 12), infoCount: (res.infoTables || []).length, warns: warns, samples: samples };
  }
  function reportText(rp) {
    if (!rp) return 'Bu belge için okuma raporu yok (eski sürümde yüklenmiş).';
    var out = ['Klavuz ' + rp.ver + ' · Okuma raporu · ' + rp.date, 'Belge: ' + rp.file, 'Tedarikçi: ' + rp.supplier + ' · Tür: ' + (KINDS[rp.kind] || rp.kind), '',
      'Sayfa: ' + rp.pages + (rp.emptyPages ? ' (' + rp.emptyPages + ' sayfada yazı yok)' : ''),
      'Ürün tablosu: ' + rp.tables + ' · Ürün: ' + rp.products + ' · Satır: ' + rp.rows,
      'Resim bulunan ürün: ' + rp.withImg + ' / ' + rp.products,
      'Fiyatsız satır: ' + rp.noPrice + ' · Kodsuz satır: ' + rp.noCode];
    if (rp.infoCount) {
      out.push('', 'Ürün sayılmayan bilgi tablosu: ' + rp.infoCount);
      rp.info.forEach(function (t) { out.push('  s' + t.page + ' · ' + t.name + ' (' + t.rows + ' satır)'); });
    }
    var keys = Object.keys(rp.warns);
    out.push('', keys.length ? 'Uyarılar:' : 'Uyarı yok.');
    keys.sort(function (a, b) { return rp.warns[b] - rp.warns[a]; }).forEach(function (k) {
      out.push('- ' + k + ': ' + rp.warns[k] + ' satır');
      rp.samples.filter(function (s) { return s.why === k; }).forEach(function (s) {
        out.push('    s' + s.p + ' · ' + s.name + (s.code ? ' · ' + s.code : '') + (s.size ? ' · ' + s.size : ''));
      });
    });
    return out.join('\n');
  }
  function reportHtml(rp) {
    if (!rp) return '<div class="muted">Bu belge için okuma raporu yok (eski sürümde yüklenmiş).</div>';
    var keys = Object.keys(rp.warns).sort(function (a, b) { return rp.warns[b] - rp.warns[a]; });
    return '<div class="kv"><span>Sayfa</span><b>' + rp.pages + (rp.emptyPages ? ' · ' + rp.emptyPages + ' yazısız' : '') + '</b></div>' +
      '<div class="kv"><span>Ürün / satır</span><b>' + rp.products + ' ürün · ' + rp.rows + ' satır</b></div>' +
      '<div class="kv"><span>Resim bulunan ürün</span><b>' + rp.withImg + ' / ' + rp.products + '</b></div>' +
      '<div class="kv"><span>Fiyatsız / kodsuz satır</span><b>' + rp.noPrice + ' / ' + rp.noCode + '</b></div>' +
      (rp.infoCount ? '<div class="kv"><span>Ürün sayılmayan bilgi tablosu</span><b>' + rp.infoCount + '</b></div>' : '') +
      (keys.length ? '<div><b>Uyarı nedenleri</b></div>' + keys.map(function (k) {
        return '<div class="why"><span class="badge b-warn">' + rp.warns[k] + ' satır</span> ' + esc(k) +
          '<div class="muted">' + rp.samples.filter(function (s) { return s.why === k; }).map(function (s) { return 's' + s.p + ' · ' + esc(s.name) + (s.code ? ' · ' + esc(s.code) : ''); }).join('<br>') + '</div></div>';
      }).join('') : '<div class="badge b-ok">Uyarı yok</div>');
  }
  // Belgeyi veritabanına işle
  // - Aynı tedarikçi + aynı kod: teklifi günceller, fiyat değiştiyse geçmişe yazar
  // - Aynı tedarikçi + aynı ürün adı: aynı ürün kartına yeni varyant (ölçü/kod) olarak ekler
  // - Yeni ürün: yeni kart oluşturur
  function commit(d) {
    var rows = d.rows, supplier = d.supplier, kind = d.kind, docName = d.name, docId = d.docId;
    var res = { created: 0, updated: 0, changed: 0, pending: 0 };
    if (d.cert) {
      kvPut('pages:' + docId, d.pages);
      db.docs.push({ id: docId, name: docName, supplier: supplier, kind: 'sertifika', date: today(), count: d.pages.length });
      save(); res.cert = true; return res;
    }
    rows.forEach(function (r) {
      var key = codeKey(r.code);
      var off = key ? Object.values(db.offers).find(function (o) { return o.supplier === supplier && o.key === key; }) : null;
      var nm = fold(r.name), sb = fold(r.sub);
      var item = off ? db.items[off.itemId] : (nm ? Object.values(db.items).find(function (it) { return fold(it.name) === nm && fold(it.sub) === sb && it.brand === supplier; }) : null);
      // Kodu olmayan fiyat listeleri: aynı ürün + aynı ölçü aynı tekliftir
      if (!off && !key && item) off = offersOf(item.id).find(function (o) { return o.supplier === supplier && !o.key && fold(o.size) === fold(r.size); }) || null;
      if (off) {
        if (r.price != null && (r.price !== off.listPrice || r.cur !== off.cur)) {
          db.history.push({ offerId: off.id, old: off.listPrice, price: r.price, cur: r.cur, date: today(), doc: docName });
          var wasSell = off.sellPrice === off.listPrice;
          off.lastDir = (off.listPrice != null && r.price > off.listPrice) ? 'up' : 'down';
          off.listPrice = r.price; off.cur = r.cur;
          if (wasSell) off.sellPrice = r.price;
          res.changed++;
        }
        if (r.size) off.size = r.size;
        if (r.specs) off.specs = r.specs;
        if (r.priceVat != null) off.priceVat = r.priceVat;
        off.status = r.warn ? 'check' : 'ok'; off.why = r.warn || '';
        off.updated = today(); off.docId = docId; res.updated++;
        if (r.img) attachImg(db.items[off.itemId], r.img);
        return;
      }
      var pendingFlag = kind === 'fiyat' && !!key;
      if (!item) {
        item = { id: uid(), name: r.name || r.code || 'İsimsiz ürün', sub: r.sub || '', brand: supplier, category: '', note: '', verified: false, hasImg: false };
        db.items[item.id] = item;
      }
      if (r.img) attachImg(item, r.img);
      var o = { id: uid(), itemId: item.id, supplier: supplier, code: r.code || '', key: key, size: r.size || '', specs: r.specs || '',
        listPrice: r.price, priceVat: r.priceVat == null ? null : r.priceVat, cur: r.cur || 'TL', supDisc: 0, sellPrice: r.price, lastDir: null,
        status: r.warn ? 'check' : (pendingFlag ? 'pending' : 'ok'), why: r.warn || '', updated: today(), docId: docId };
      db.offers[o.id] = o; res.created++;
      if (pendingFlag) res.pending++;
    });
    if (d.images && d.images.length) kvPut('doc:' + docId, d.images.map(function (im) { return { page: im.page, url: im.url }; }));
    db.docs.push({ id: docId, name: docName, supplier: supplier, kind: kind, date: today(), count: rows.length, report: d.report || null });
    save();
    return res;
  }
  function attachImg(item, url) {
    if (!item || item.hasImg) return;
    item.hasImg = true; kvPut('item:' + item.id, url);
  }
  function deleteDoc(docId) {
    Object.values(db.offers).forEach(function (o) { if (o.docId === docId) delete db.offers[o.id]; });
    Object.keys(db.items).forEach(function (id) {
      if (!offersOf(id).length) { kvDel('item:' + id); delete db.items[id]; }
    });
    db.docs = db.docs.filter(function (d) { return d.id !== docId; });
    kvDel('doc:' + docId); kvDel('pages:' + docId);
    db.cart = db.cart.filter(function (l) { return db.offers[l.offerId]; });
    save();
  }

  // ---------- Arama ----------
  function matchItem(it, q) {
    if (!q) return true;
    var offs = offersOf(it.id);
    if (fold(it.name + ' ' + (it.sub || '') + ' ' + it.brand + ' ' + it.category).indexOf(fold(q)) >= 0) return true;
    var qk = codeKey(q), qc = confKey(q);
    return offs.some(function (o) {
      return (qk && codeKey(o.code).indexOf(qk) >= 0) || (qc && confKey(o.code).indexOf(qc) >= 0) || fold(o.supplier).indexOf(fold(q)) >= 0;
    });
  }
  function passFilter(it) {
    var offs = offersOf(it.id);
    switch (st.filter) {
      case 'kontrol': return itemCheckNeeded(it);
      case 'resimsiz': return !it.hasImg;
      case 'bekliyor': return offs.some(function (o) { return o.status === 'pending'; });
      case 'dogrulanmamis': return !it.verified;
      default: return true;
    }
  }
  function suggestions(q) {
    var qc = confKey(q.trim());
    if (qc.length < 4) return '';
    var list = Object.values(db.offers).filter(function (o) {
      var k = confKey(o.code); return k && k !== qc && lev(k, qc) <= 2;
    }).slice(0, 3);
    if (!list.length) return '';
    return '<div class="sugg"><b>Bunu mu aradınız?</b>' + list.map(function (o) {
      var it = db.items[o.itemId] || { name: '?' };
      return '<button data-item="' + o.itemId + '">' + esc(o.code) + ' · ' + esc(it.name) + ' (' + esc(o.supplier) + ')</button>';
    }).join('') + '<span class="muted">Otomatik seçilmedi, siz seçin.</span></div>';
  }
  function badgesOf(it, offs) {
    var b = '';
    if (it.verified) b += '<span class="badge b-ok">✓ Doğrulandı</span>';
    else b += '<span class="badge b-gray">Doğrulanmadı</span>';
    if (offs.some(function (o) { return o.status === 'check'; })) b += '<span class="badge b-warn">Kontrol gerekli</span>';
    if (offs.some(function (o) { return o.status === 'pending'; })) b += '<span class="badge b-pend">Ana katalogda yok, bekliyor</span>';
    if (!it.hasImg) b += '<span class="badge b-gray">Resimsiz</span>';
    return b;
  }
  function thumb(it, cls) {
    return '<div class="thumb ' + (cls || '') + '" data-img="' + it.id + '"><span>' + esc((it.name || '?').charAt(0).toUpperCase()) + '</span></div>';
  }
  function card(it) {
    var offs = offersOf(it.id).sort(sizeSort);
    var best = offs.filter(function (o) { return o.sellPrice != null; }).sort(function (a, b) { return a.sellPrice - b.sellPrice; })[0];
    var codeList = offs.map(function (o) { return o.code; }).filter(Boolean);
    var codes = codeList.slice(0, 3).join(', ') + (codeList.length > 3 ? ' +' + (codeList.length - 3) : '');
    var sup = Array.from(new Set(offs.map(function (o) { return o.supplier; }))).join(', ');
    var sizeList = Array.from(new Set(offs.map(function (o) { return o.size; }).filter(Boolean)));
    var sizes = sizeList.slice(0, 6).join(' · ') + (sizeList.length > 6 ? ' +' + (sizeList.length - 6) : '');
    return '<div class="card pcard" data-item="' + it.id + '">' + thumb(it) +
      '<div class="ptxt"><b>' + esc(it.name) + '</b>' +
      (it.sub ? '<div class="muted">' + esc(it.sub) + '</div>' : '') +
      '<div class="muted">' + esc(sup) + (codes ? ' · ' + esc(codes) : '') + '</div>' +
      (sizes ? '<div class="muted">Ölçü: ' + esc(sizes) + '</div>' : '') +
      '<div class="price">' + (best ? (offs.length > 1 ? 'Başlangıç ' : '') + fmtC(best.sellPrice, best.cur) : 'Fiyat yok') + '</div>' +
      '<div>' + badgesOf(it, offs) + '</div></div></div>';
  }
  function drawResults() {
    var q = st.q.trim();
    var items = Object.values(db.items).filter(function (it) { return matchItem(it, q) && passFilter(it); })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'tr') || String(a.sub || '').localeCompare(String(b.sub || ''), 'tr'); });
    $('#sugg').innerHTML = q ? suggestions(q) : '';
    $('#results').innerHTML = items.length ? items.slice(0, 200).map(card).join('') :
      '<p class="muted">' + (Object.keys(db.items).length ? 'Bu filtrede sonuç yok.' : 'Henüz ürün yok. Belge sekmesinden bir katalog yükleyin.') + '</p>';
    hydrateImages($('#results'));
  }

  // ---------- Ekranlar ----------
  var st = { tab: 'ara', q: '', filter: 'hepsi', item: null, variant: null, draft: null, catSupplier: '', catKind: 'katalog',
    histOffer: null, edit: null, pick: false, pickList: [], docView: null, repDoc: null, readNote: '', lastFile: null, open: {} };
  var FILTERS = [['hepsi', 'Tümü'], ['kontrol', 'Kontrol gerekli'], ['dogrulanmamis', 'Doğrulanmamış'], ['resimsiz', 'Resimsiz'], ['bekliyor', 'Bekleyen']];

  function viewSearch() {
    return '<div class="card"><input type="search" id="q" placeholder="Ürün adı, kod veya marka" value="' + esc(st.q) + '">' +
      '<div class="chips">' + FILTERS.map(function (f) {
        return '<button class="chip' + (st.filter === f[0] ? ' on' : '') + '" data-act="filter" data-id="' + f[0] + '">' + f[1] + '</button>';
      }).join('') + '</div></div>' +
      '<div id="sugg"></div><div id="results" style="display:flex;flex-direction:column;gap:10px"></div>';
  }
  function statusBadge(o) {
    var s = '';
    if (o.status === 'check') s += '<span class="badge b-warn">Kontrol gerekli' + (o.why ? ': ' + esc(o.why) : '') + '</span>';
    if (o.status === 'pending') s += '<span class="badge b-pend">Ana katalogda yok, bekliyor</span>';
    if (o.lastDir === 'up') s += '<span class="badge b-warn">Fiyat yükseldi</span>';
    if (o.lastDir === 'down') s += '<span class="badge b-ok">Fiyat düştü</span>';
    return s;
  }
  function histHtml(oid) {
    var h = db.history.filter(function (x) { return x.offerId === oid; }).reverse();
    if (!h.length) return '<div class="muted">Fiyat değişikliği yok.</div>';
    return '<table><tr><th>Tarih</th><th>Eski</th><th>Yeni</th><th>Belge</th></tr>' + h.map(function (x) {
      return '<tr><td>' + esc(x.date) + '</td><td>' + fmtC(x.old, x.cur) + '</td><td>' + fmtC(x.price, x.cur) + '</td><td>' + esc(x.doc) + '</td></tr>';
    }).join('') + '</table>';
  }
  function offerRow(o) {
    return '<div class="offer">' +
      '<div><b>' + esc(o.supplier) + '</b> · kod <code>' + esc(o.code || '—') + '</code>' + (o.size ? ' · ' + esc(o.size) : '') + ' ' + statusBadge(o) + '</div>' +
      '<div class="muted">Liste ' + fmtC(o.listPrice, o.cur) + ' · Tedarikçi indirimi <input class="sm" type="number" data-disc="' + o.id + '" value="' + (o.supDisc || 0) + '">% · Alış ' + fmtC(buyOf(o), o.cur) + '</div>' +
      '<div class="row"><span>Satış <input class="sm" type="number" data-sell="' + o.id + '" value="' + (o.sellPrice == null ? '' : o.sellPrice) + '"> ' +
      '<select data-cur="' + o.id + '" class="sm">' + ['TL', 'EUR', 'USD'].map(function (c) { return '<option value="' + c + '"' + ((o.cur || 'TL') === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></span>' +
      '<span><button data-act="addcart" data-id="' + o.id + '">Sepete ekle</button> ' +
      '<button class="link" data-act="hist" data-id="' + o.id + '">Fiyat geçmişi</button>' +
      (o.lastDir ? ' <button class="link" data-act="ack" data-id="' + o.id + '">Gördüm</button>' : '') + '</span></div>' +
      (st.histOffer === o.id ? histHtml(o.id) : '') + '</div>';
  }
  function editForm(it, o) {
    return '<div class="card editbox"><h3>Bilgileri düzelt</h3>' +
      '<label>Ürün adı <input id="e_name" value="' + esc(it.name) + '"></label>' +
      '<label>Açıklama (alt başlık) <input id="e_sub" value="' + esc(it.sub || '') + '"></label>' +
      '<label>Marka / tedarikçi <input id="e_brand" value="' + esc(it.brand) + '"></label>' +
      '<label>Kod <input id="e_code" value="' + esc(o.code) + '"></label>' +
      '<label>Ölçü <input id="e_size" value="' + esc(o.size) + '"></label>' +
      '<label>Liste fiyatı <input id="e_price" type="number" value="' + (o.listPrice == null ? '' : o.listPrice) + '"></label>' +
      '<label>Para birimi <select id="e_cur">' + ['TL', 'EUR', 'USD'].map(function (c) { return '<option value="' + c + '"' + ((o.cur || 'TL') === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></label>' +
      '<div class="row"><button class="primary" data-act="saveedit" data-id="' + o.id + '">Kaydet</button><button class="ghost" data-act="canceledit">İptal</button></div></div>';
  }
  function pickerHtml() {
    return '<div class="card"><h3>Belgeden resim seç</h3><div class="muted">Bu ürünün teklif geldiği belgedeki resimler. Doğru resme dokunun.</div>' +
      '<div id="picker" class="pickgrid"><span class="muted">Yükleniyor...</span></div>' +
      '<div class="row"><button class="ghost" data-act="closepick">Kapat</button></div></div>';
  }
  function viewItem(id) {
    var it = db.items[id];
    if (!it) return '<div class="card"><p>Ürün bulunamadı.</p></div>';
    var offs = offersOf(id).sort(sizeSort), sim = similarItems(it);
    if (!offs.length) return '<div class="card"><p class="muted">Bu üründe teklif yok.</p></div>';
    var sel = offs.filter(function (o) { return o.id === st.variant; })[0] || offs[0];
    st.variant = sel.id;
    var sizeCount = {}; offs.forEach(function (o) { sizeCount[o.size] = (sizeCount[o.size] || 0) + 1; });
    var variants = offs.length > 1 ? '<div class="variants">' + offs.map(function (o) {
      return '<button class="chip' + (o.id === sel.id ? ' on' : '') + '" data-act="variant" data-id="' + o.id + '">' +
        esc(o.size || o.code || '—') + (o.sellPrice != null ? '<small>' + fmtC(o.sellPrice, o.cur) + '</small>' : '') +
        (o.size && sizeCount[o.size] > 1 && o.code ? '<small>' + esc(o.code) + '</small>' : '') + '</button>';
    }).join('') + '</div>' : '';
    var webQ = encodeURIComponent((it.brand + ' ' + (sel.code || it.name)).trim());
    var noImg = !it.hasImg ? '<div class="card noimg"><b>Resim yok</b>' +
      '<div class="row"><button class="ghost" data-act="pickimg">Belgeden resim seç</button>' +
      '<a class="btnlike" target="_blank" rel="noopener" href="https://www.google.com/search?tbm=isch&q=' + webQ + '">Web\'de görsel ara</a></div>' +
'</div>' : '';
    var verify = '<div class="card"><h3>Kontrol</h3><div class="row">' +
      (!it.verified ? '<button class="primary" data-act="verify" data-id="' + id + '">✓ Doğrula</button>' : '') +
      '<button class="ghost" data-act="edit" data-id="' + sel.id + '">Düzelt</button>' +
      '<button class="ghost" data-act="nextcheck" data-id="' + id + '">Sonraki kontrol →</button></div></div>';
    return '<button class="link" data-act="back">← Geri</button>' +
      '<div class="card detail">' + thumb(it, 'hero') +
      '<div><h2>' + esc(it.name) + '</h2>' + (it.sub ? '<div class="sub">' + esc(it.sub) + '</div>' : '') +
      '<div class="muted">' + esc(it.brand) + (sel.code ? ' · kod ' + esc(sel.code) : '') + '</div></div>' +
      '<div>' + badgesOf(it, offs) + '</div>' + variants +
      (sel.sellPrice != null ? '<div class="bigprice">' + fmtC(sel.sellPrice, sel.cur) + ' <span class="muted">(öneri satış' + (sel.size ? ', ' + esc(sel.size) : '') + ')</span></div>' :
        '<div class="muted">Bu katalogda fiyat yok' + (sel.size ? ' · seçili ölçü ' + esc(sel.size) : '') + '. Fiyat listesi yüklenince ya da "Düzelt" ile eklenir.</div>') +
      (sel.priceVat != null ? '<div class="muted">Listede KDV dahil: ' + fmtC(sel.priceVat, sel.cur) + '</div>' : '') +
      (sel.specs ? '<div class="specs">' + sel.specs.split(' · ').map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="row"><button class="primary" data-act="addcart" data-id="' + sel.id + '">Sepete ekle</button>' +
      '<button class="ghost" data-act="hist" data-id="' + sel.id + '">Fiyat geçmişi</button></div>' +
      (st.histOffer === sel.id ? histHtml(sel.id) : '') +
      (sel.sellPrice != null ? '<div class="internal">Alış ' + fmtC(buyOf(sel), sel.cur) + ' · Kâr ' + fmtC((sel.sellPrice || 0) - (buyOf(sel) || 0), sel.cur) + '</div>' : '') +
      '</div>' +
      noImg +
      verify +
      (st.edit ? editForm(it, db.offers[st.edit] || sel) : '') +
      (st.pick ? pickerHtml() : '') +
      '<div class="card"><h3>Tedarikçi teklifleri</h3>' + offs.map(offerRow).join('') + '</div>' +
      '<div class="card"><label>Not <input data-note="' + id + '" value="' + esc(it.note || '') + '"></label>' +
      '<div class="row"><button class="danger" data-act="delitem" data-id="' + id + '">Ürünü sil</button></div></div>' +
      (sim.length ? '<div class="card"><h3>Benzer ürünler (karar sizin)</h3>' + sim.map(function (x) {
        return '<div class="row"><span>' + esc(x.name) + ' · ' + esc(offersOf(x.id).map(function (o) { return o.code; }).join(', ')) +
          '</span><button class="ghost" data-act="merge" data-id="' + x.id + '">Aynı ürün, birleştir</button></div>';
      }).join('') + '</div>' : '');
  }
  var KINDS = { katalog: 'ana katalog', fiyat: 'fiyat listesi', sertifika: 'sertifika / belge' };
  function viewDocPages(id) {
    var d = db.docs.find(function (x) { return x.id === id; });
    return '<button class="link" data-act="closedoc">← Belgelere dön</button>' +
      '<div class="card"><h2>' + esc(d ? d.name : 'Belge') + '</h2><div class="muted">' + esc(d ? d.supplier + ' · ' + d.date : '') + '</div></div>' +
      '<div id="docPages" class="docpages"><span class="muted">Yükleniyor...</span></div>';
  }
  function loadDocPages() {
    var el = $('#docPages'); if (!el) return;
    kvGet('pages:' + st.docView).then(function (arr) {
      if (!el.isConnected) return;
      el.innerHTML = (arr && arr.length) ? arr.map(function (u, i) { return '<img alt="Sayfa ' + (i + 1) + '" src="' + u + '">'; }).join('') :
        '<span class="muted">Bu belgenin sayfa görüntüsü bulunamadı.</span>';
    });
  }
  function viewCatalog() {
    var docs = db.docs.slice().reverse().map(function (d) {
      var isCert = d.kind === 'sertifika';
      return '<div class="row"><span><b>' + esc(d.name) + '</b><div class="muted">' + esc(d.supplier) + ' · ' + esc(d.date) + ' · ' + d.count + (isCert ? ' sayfa' : ' satır') + ' · ' + (KINDS[d.kind] || 'ana katalog') + '</div></span>' +
        '<span>' + (isCert ? '<button class="link" data-act="opendoc" data-id="' + d.id + '">Aç</button>' : '<button class="link" data-act="rep" data-id="' + d.id + '">Rapor</button>') +
        '<button class="link danger-text" data-act="deldoc" data-id="' + d.id + '">Sil</button></span></div>' +
        (st.repDoc === d.id ? '<div class="report">' + reportHtml(d.report) + '<div class="row"><button class="soft" data-act="repshare" data-id="' + d.id + '">Okuma raporunu paylaş</button><button class="soft" data-act="repcopy" data-id="' + d.id + '">Kopyala</button></div></div>' : '');
    }).join('');
    var h = '<div class="card"><h2>Belge yükle</h2>' +
      '<div class="muted">PDF, Excel (xlsx/xls), CSV veya TXT dosyası seçin. Okunan ürünleri kaydetmeden önce kontrol edersiniz. İnternet gerekmez.</div>' +
      '<label>Tedarikçi / marka adı <input id="supName" value="' + esc(st.catSupplier) + '"></label>' +
      '<label>Belge türü <select id="kind">' +
      '<option value="katalog"' + (st.catKind === 'katalog' ? ' selected' : '') + '>Ana katalog (resimli, detaylı)</option>' +
      '<option value="fiyat"' + (st.catKind === 'fiyat' ? ' selected' : '') + '>Fiyat listesi (kod ve fiyat)</option>' +
      '<option value="sertifika"' + (st.catKind === 'sertifika' ? ' selected' : '') + '>Sertifika / onay belgesi (ürün okunmaz)</option></select></label>' +
      '<input type="file" id="docFile" accept=".pdf,.xlsx,.xls,.csv,.txt">' +
      '<div class="row"><button class="primary" data-act="read">Belgeyi oku</button><span class="muted" id="readMsg">' + esc(st.readNote || '') + '</span></div></div>';
    if (st.draft && st.draft.cert) {
      var c = st.draft;
      h += '<div class="card"><h3>Kontrol: ' + esc(c.name) + '</h3>' +
        '<div class="internal">Bu belge sertifika / onay yazısı olarak tanındı. Ürün okunmadı; ' + c.pages.length + ' sayfa belge olarak saklanacak ve Belgeler listesinden açılabilecek.</div>' +
        (c.pages[0] ? '<img class="certprev" alt="" src="' + c.pages[0] + '">' : '') +
        '<div class="row"><button class="primary" data-act="save">Belge olarak kaydet</button>' +
        '<button class="ghost" data-act="readforce">Ürün olarak oku</button><button class="ghost" data-act="cancel">İptal</button></div></div>';
    } else if (st.draft) {
      var d = st.draft, warn = d.rows.filter(function (r) { return r.warn; }).length, prod = {}, prodImg = {};
      d.rows.forEach(function (r) { var k = r.name + '|' + (r.sub || ''); prod[k] = true; if (r.img) prodImg[k] = true; });
      h += '<div class="card"><h3>Kontrol: ' + esc(d.name) + '</h3>' +
        '<div class="muted">' + Object.keys(prod).length + ' ürün, ' + d.rows.length + ' satır okundu. ' + Object.keys(prodImg).length + ' ürüne resim bulundu, ' + warn + ' satır kontrol gerektiriyor.</div>' +
        (d.note ? '<div class="internal">' + esc(d.note) + '</div>' : '') +
        '<div class="report">' + reportHtml(d.report) + '<div class="row"><button class="soft" data-act="repshare" data-id="draft">Okuma raporunu paylaş</button><button class="soft" data-act="repcopy" data-id="draft">Kopyala</button></div></div>' +
        '<div class="scroll"><table><tr><th></th><th>Ürün</th><th>Kod</th><th>Ölçü</th><th>Fiyat</th><th>Not</th></tr>' +
        d.rows.slice(0, 300).map(function (r) {
          return '<tr><td>' + (r.img ? '<img class="mini" alt="" src="' + r.img + '">' : '') + '</td><td>' + esc(r.name) + (r.sub ? '<div class="muted">' + esc(r.sub) + '</div>' : '') + '</td><td>' + esc(r.code || '—') + '</td><td>' + esc(r.size) + '</td><td>' + fmtC(r.price, r.cur) + '</td><td>' + (r.warn ? '<span class="badge b-warn">' + esc(r.warn) + '</span>' : '') + '</td></tr>';
        }).join('') + '</table></div>' +
        (d.rows.length > 300 ? '<div class="muted">İlk 300 satır gösteriliyor, hepsi kaydedilecek.</div>' : '') +
        '<div class="row"><button class="primary" data-act="save">Kaydet</button><button class="ghost" data-act="cancel">İptal</button></div></div>';
    }
    return h + '<div class="card"><h3>Yüklenen belgeler</h3>' + (docs || '<p class="muted">Henüz belge yok.</p>') + '</div>';
  }
  function viewCart() {
    var lines = db.cart.filter(function (l) { return db.offers[l.offerId]; });
    if (!lines.length) return '<div class="card"><p class="muted">Sepet boş. Ara sekmesinden ürün ekleyin.</p></div>';
    var sellBy = {}, buyBy = {}, cust = [];
    var rows = lines.map(function (l) {
      var o = db.offers[l.offerId], it = db.items[o.itemId] || { name: '?' };
      var c = o.cur || 'TL';
      var amount = (o.sellPrice || 0) * l.qty * (1 - (l.disc || 0) / 100);
      var buy = (buyOf(o) || 0) * l.qty;
      sellBy[c] = (sellBy[c] || 0) + amount; buyBy[c] = (buyBy[c] || 0) + buy;
      cust.push({ name: it.name, code: o.code, size: o.size, qty: l.qty, amount: amount, cur: c });
      return '<div class="card pcard">' + thumb(it) + '<div class="ptxt"><b>' + esc(it.name) + '</b>' +
        '<div class="muted">' + esc(o.supplier) + ' · kod ' + esc(o.code || '—') + (o.size ? ' · ' + esc(o.size) : '') + '</div>' +
        '<div class="row"><span>Adet <input class="sm" type="number" min="1" data-qty="' + o.id + '" value="' + l.qty + '"></span>' +
        '<span>Kalem iskontosu <input class="sm" type="number" data-ldisc="' + o.id + '" value="' + (l.disc || 0) + '">%</span></div>' +
        '<div class="row"><span>Satış ' + fmtC(amount, c) + '</span><span class="internal">Alış ' + fmtC(buy, c) + '</span>' +
        '<button class="link" data-act="cartdel" data-id="' + o.id + '">Kaldır</button></div></div></div>';
    }).join('');
    var cd = db.cartDiscount || 0, curs = Object.keys(sellBy);
    var totals = curs.map(function (c) {
      var net = sellBy[c] * (1 - cd / 100), profit = net - buyBy[c];
      return { c: c, net: net, profit: profit, buy: buyBy[c], sell: sellBy[c] };
    });
    var sumRows = totals.map(function (t) {
      return '<div class="row"><span>' + t.c + ' · Net satış</span><b>' + fmtC(t.net, t.c) + '</b></div>' +
        '<div class="row"><span>' + t.c + ' · Kâr</span><b style="color:' + (t.profit < 0 ? '#B91C1C' : '#065F46') + '">' + fmtC(t.profit, t.c) + '</b></div>' +
        (t.net < t.buy ? '<div class="badge b-warn">Uyarı: ' + t.c + ' net satış alış fiyatının altında</div>' : '');
    }).join('');
    var custText = customerText(cust, cd, totals);
    return rows +
      '<div class="card"><h3>Dahili özet</h3><div class="internal">Bu bölüm yalnızca sizde görünür. Para birimleri ayrı toplanır, birbiriyle çevrilmez.</div>' +
      '<div class="row"><span>Sepet iskontosu %</span><input class="sm" type="number" id="cartDisc" value="' + cd + '"></div>' +
      sumRows +
      '<div class="row"><button class="ghost" data-act="cartclear">Sepeti boşalt</button></div></div>' +
      '<div class="card"><h3>Müşteri çıktısı</h3><div class="muted">Yalnızca satış fiyatları yer alır. Alış ve kâr görünmez.</div>' +
      '<pre id="cust">' + esc(custText) + '</pre>' +
      '<div class="row"><button data-act="print">Yazdır / PDF</button><button class="ghost" data-act="copy">Metni kopyala</button></div></div>';
  }
  function customerText(cust, cd, totals) {
    var s = db.settings, out = [];
    if (s.company) out.push(s.company);
    if (s.phone) out.push('Tel: ' + s.phone);
    if (s.web || s.email) out.push([s.web, s.email].filter(Boolean).join(' · '));
    out.push('Tarih: ' + today(), '');
    cust.forEach(function (c, i) {
      out.push((i + 1) + '. ' + c.name + (c.code ? ' (' + c.code + ')' : '') + (c.size ? ' ' + c.size : '') + ' — ' + c.qty + ' adet — ' + fmtC(c.amount, c.cur));
    });
    if (cd) out.push('', 'İskonto: %' + cd);
    totals.forEach(function (t) { out.push('Toplam (KDV hariç, ' + t.c + '): ' + fmtC(t.net, t.c)); });
    if (s.note) out.push('', s.note);
    if (s.warranty) out.push(s.warranty);
    if (s.bankOnOffer) {
      var curs = totals.map(function (t) { return t.c; }), ib = [];
      if (curs.indexOf('TL') >= 0 && s.ibanTL) ib.push('IBAN (TL): ' + s.ibanTL);
      if (curs.indexOf('EUR') >= 0 && s.ibanEUR) ib.push('IBAN (EUR): ' + s.ibanEUR);
      if (curs.indexOf('USD') >= 0 && s.ibanUSD) ib.push('IBAN (USD): ' + s.ibanUSD);
      if (ib.length) out.push('', s.bank || '', ib.join('\n'));
    }
    return out.join('\n');
  }
  // Uyarılar: yalnızca ayarlarda açık olan türler gösterilir
  var ALERT_KEYS = [['up', 'Fiyat yükseldi'], ['down', 'Fiyat düştü'], ['below', 'Satış alış fiyatının altında'], ['pending', 'Ana katalogda yok, bekliyor'], ['check', 'Kontrol gerekli']];
  function allAlerts() {
    var out = [];
    Object.values(db.offers).forEach(function (o) {
      var it = db.items[o.itemId]; if (!it) return;
      var name = it.name + ' · ' + o.supplier + (o.code ? ' ' + o.code : '');
      var b = buyOf(o);
      if (o.lastDir === 'up') out.push({ k: 'up', d: name + ' — ' + fmtC(o.listPrice, o.cur), oid: o.id });
      if (o.lastDir === 'down') out.push({ k: 'down', d: name + ' — ' + fmtC(o.listPrice, o.cur), oid: o.id });
      if (o.sellPrice != null && b != null && o.sellPrice < b) out.push({ k: 'below', d: name + ' — satış ' + fmtC(o.sellPrice, o.cur) + ', alış ' + fmtC(b, o.cur) });
      if (o.status === 'pending') out.push({ k: 'pending', d: name, itemId: o.itemId });
      if (o.status === 'check') out.push({ k: 'check', d: name + (o.why ? ' — ' + o.why : ''), itemId: o.itemId });
    });
    return out;
  }
  function alerts() {
    return allAlerts().filter(function (a) { return db.settings.notify[a.k] !== false; });
  }
  function bellLevel(list) {
    if (list.some(function (a) { return a.k === 'below'; })) return 'red';
    if (list.length) return 'yellow';
    return 'green';
  }
  function viewAlerts() {
    var a = alerts(), checkCount = Object.values(db.items).filter(itemCheckNeeded).length;
    var head = '<div class="card"><div class="row"><b>Kontrol bekleyen ürün: ' + checkCount + '</b>' +
      '<button class="primary" data-act="nextcheck" data-id="">Kontrole başla</button></div></div>';
    if (!a.length) return head + '<div class="card"><p class="muted">Seçili bildirim türlerinde uyarı yok. Türleri Ayarlar\'dan açıp kapatabilirsiniz.</p></div>';
    var byWhy = {}; Object.values(db.offers).forEach(function (o) { if (o.status === 'check') { var w = o.why || 'neden kaydedilmemiş (eski sürüm)'; byWhy[w] = (byWhy[w] || 0) + 1; } });
    var whyKeys = Object.keys(byWhy).sort(function (x, y) { return byWhy[y] - byWhy[x]; });
    if (whyKeys.length) head += '<div class="card"><h3>Kontrol nedenleri</h3>' + whyKeys.map(function (w) { return '<div class="why"><span class="badge b-warn">' + byWhy[w] + '</span> ' + esc(w) + '</div>'; }).join('') +
      '<div class="muted">Ayrıntı ve örnekler için Belge sekmesinde belgenin yanındaki "Rapor" düğmesine basın.</div></div>';
    if (a.length > 150) head += '<div class="card"><div class="muted">' + a.length + ' uyarıdan ilk 150 tanesi gösteriliyor.</div></div>';
    return head + a.slice(0, 150).map(function (x) {
      var label = ALERT_KEYS.filter(function (k) { return k[0] === x.k; })[0][1];
      return '<div class="card"><b>' + esc(label) + '</b><div class="muted">' + esc(x.d) + '</div>' +
        (x.oid ? '<div><button class="ghost" data-act="ack" data-id="' + x.oid + '">Gördüm</button></div>' : '') +
        (x.itemId ? '<div><button class="ghost" data-act="openitem" data-id="' + x.itemId + '">Ürüne git</button></div>' : '') + '</div>';
    }).join('');
  }
  // ---- Deneyim ve öneri / Sürüm testi ----
  var FB_SECS = [['ara', 'Arama'], ['urun', 'Ürün sayfası'], ['belge', 'Belge okuma'], ['sepet', 'Sepet ve teklif'], ['uyari', 'Uyarılar'], ['genel', 'Genel']];
  // Sürüm testi: markaya değil sistemin kendisine yönelik maddeler. Hangi belgeyle denendiği not kutusuna yazılır.
  var VTEST = [
    ['Kurulum', [
      ['k1', 'Yeni sürüm eskisinin üstüne kuruldu; ürünlerim ve ayarlarım duruyor'],
      ['k2', 'Uygulama uçak modunda açılıyor ve belge okuyor']]],
    ['Belge okuma', [
      ['b1', 'Yüklediğim belgede ürün adları doğru geldi'],
      ['b2', 'Kodlar ve ölçüler doğru geldi'],
      ['b3', 'Fiyatlar ve para birimi doğru geldi'],
      ['b4', 'Resimler doğru ürüne bağlandı'],
      ['b5', 'Sertifika / onay belgesi ürün olarak okunmadı, belge olarak açılıyor'],
      ['b6', 'Okunamayan belgede uygulama nedenini açıkça söyledi']]],
    ['Okuma raporu', [
      ['o1', 'Belgeyi okuyunca uyarı nedenleri ve sayıları göründü'],
      ['o2', 'Okuma raporunu paylaşabildim ya da kopyalayabildim'],
      ['o3', 'Ürün sayfasında "Kontrol gerekli" uyarısının nedeni yazıyor']]],
    ['Kalıcılık ve yedek', [
      ['r1', 'Uygulamayı tamamen kapatıp açınca ürünler ve resimler duruyor'],
      ['r2', 'Yedek indirildi; yedekten yükleyince resimler de geri geldi'],
      ['r3', 'Ada firma profili yüklendi, firma bilgileri doldu']]],
    ['Arayüz', [
      ['a1', 'Alt bar seçili sekmeyi yukarı kaldırıp ışığını yakıyor ve her sayfada görünüyor'],
      ['a2', 'Çok ürün varken arama ve sayfalar takılmadan çalışıyor']]],
    ['Paylaşım', [
      ['p1', 'Deneyim ve öneri metni WhatsApp ile gönderildi'],
      ['p2', 'Dış bağlantılar tarayıcıda açıldı, uygulamaya geri dönülebildi']]]
  ];
  function vt() {
    if (!db.vtest || db.vtest.ver !== APP_VERSION) db.vtest = { ver: APP_VERSION, marks: {}, notes: {}, gnotes: {} };
    return db.vtest;
  }
  function vtCount() {
    var m = vt().marks, tot = 0, ok = 0, bad = 0;
    VTEST.forEach(function (g) { g[1].forEach(function (x) { tot++; if (m[x[0]] === 'ok') ok++; else if (m[x[0]] === 'bad') bad++; }); });
    return { tot: tot, ok: ok, bad: bad, done: ok + bad };
  }
  function scoreColor(v) {
    // 1 kırmızı, 5 mavi, 9 yeşil
    var stops = [[239, 68, 68], [245, 158, 11], [96, 165, 250], [52, 211, 153], [22, 163, 74]], t = (Math.min(9, Math.max(1, v)) - 1) / 2;
    var i = Math.min(3, Math.floor(t)), f = t - i, a = stops[i], b = stops[i + 1];
    return 'rgb(' + [0, 1, 2].map(function (k) { return Math.round(a[k] + (b[k] - a[k]) * f); }).join(',') + ')';
  }
  function fbText() {
    var out = ['Klavuz ' + APP_VERSION + ' · Deneyim ve öneri · ' + today(), ''];
    FB_SECS.forEach(function (sec) {
      var f = db.feedback[sec[0]] || {};
      if (f.score == null && !f.exp && !f.sug) return;
      out.push(sec[1] + (f.score != null ? ': ' + f.score + ' / 9' : ''));
      if (f.exp) out.push('Deneyim: ' + f.exp);
      if (f.sug) out.push('Öneri: ' + f.sug);
      out.push('');
    });
    if (out.length === 2) out.push('(Henüz puan ya da not girilmedi.)');
    return out.join('\n').trim();
  }
  function vtText() {
    var v = vt(), c = vtCount(), out = ['Klavuz ' + APP_VERSION + ' · Sürüm testi · ' + today(), c.done + ' / ' + c.tot + ' işaretlendi · ✓ ' + c.ok + ' · ✗ ' + c.bad, ''];
    VTEST.forEach(function (g) {
      out.push(g[0]);
      g[1].forEach(function (x, i) {
        var m = v.marks[x[0]];
        out.push((m === 'ok' ? '✓' : (m === 'bad' ? '✗' : '–')) + ' ' + (i + 1) + '. ' + x[1] + (v.notes[x[0]] ? ' — ' + v.notes[x[0]] : ''));
      });
      if (v.gnotes[g[0]]) out.push('Not: ' + v.gnotes[g[0]]);
      out.push('');
    });
    return out.join('\n').trim();
  }
  function shareText(t) {
    try {
      if (window.KlavuzAndroid && KlavuzAndroid.share) { KlavuzAndroid.share(t); return; }
      if (navigator.share) { navigator.share({ text: t }).catch(function () {}); return; }
    } catch (e) {}
    window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank');
  }
  function copyStr(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function () { toast('Kopyalandı'); }, function () { toast('Kopyalanamadı'); });
    var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Kopyalandı'); } catch (e) { toast('Kopyalanamadı'); }
    ta.remove();
  }
  function sect(id, title, right, body) {
    var open = !!st.open[id];
    return '<div class="card sect"><button class="secthead" data-act="toggle" data-id="' + id + '"><b>' + title + '</b><span class="muted">' + (right || '') + ' <i class="chev' + (open ? ' up' : '') + '">›</i></span></button>' + (open ? body : '') + '</div>';
  }
  function viewSettings() {
    var s = db.settings, c = vtCount(), v = vt();
    var fb = '<div class="muted">Her bölüm için puan verin: 1 kötü (kırmızı), 5 nötr (mavi), 9 çok iyi (yeşil). İsterseniz deneyim ve önerinizi yazın. Her şey anında kaydedilir.</div>' +
      FB_SECS.map(function (sec) {
        var f = db.feedback[sec[0]] || {}, sc = f.score == null ? 5 : f.score;
        return '<div class="fbsec"><b>' + sec[1] + '</b>' +
          (sec[0] !== 'genel' ? '<div class="fbrow"><span class="score" id="sc_' + sec[0] + '" style="background:' + scoreColor(sc) + '">' + sc + '</span>' +
            '<input type="range" min="1" max="9" step="1" data-fbscore="' + sec[0] + '" value="' + sc + '" aria-label="' + sec[1] + ' puanı"></div>' : '') +
          '<label>Deneyim<textarea rows="4" data-fb="' + sec[0] + '.exp" placeholder="Deneyiminiz...">' + esc(f.exp || '') + '</textarea></label>' +
          '<label>Öneri<textarea rows="4" data-fb="' + sec[0] + '.sug" placeholder="Öneriniz...">' + esc(f.sug || '') + '</textarea></label></div>';
      }).join('') +
      '<button class="wa" data-act="fbshare">WhatsApp ile gönder / paylaş</button><button class="soft" data-act="fbcopy">Metni kopyala</button>';
    var test = '<div class="muted">Her maddeyi deneyip ✓ (çalışıyor) veya ✗ (sorun var) işaretleyin; isterseniz kısa not yazın. Her işaret anında kaydedilir.</div>' +
      '<div class="muted" id="vtSum">' + c.done + ' / ' + c.tot + ' işaretlendi · ✓ ' + c.ok + ' · ✗ ' + c.bad + '</div>' +
      VTEST.map(function (g) {
        return '<h4>' + g[0] + '</h4>' + g[1].map(function (x, i) {
          var m = v.marks[x[0]];
          return '<div class="vt"><div>' + (i + 1) + '. ' + esc(x[1]) + '</div><div class="vtrow">' +
            '<button class="vb ok' + (m === 'ok' ? ' on' : '') + '" data-act="vmark" data-id="' + x[0] + ':ok" aria-label="Çalışıyor">✓</button>' +
            '<button class="vb bad' + (m === 'bad' ? ' on' : '') + '" data-act="vmark" data-id="' + x[0] + ':bad" aria-label="Sorun var">✗</button>' +
            '<input data-vnote="' + x[0] + '" placeholder="not (isteğe bağlı)" value="' + esc(v.notes[x[0]] || '') + '"></div></div>';
        }).join('') +
          '<label class="muted">Bu başlık için not<textarea rows="2" data-vgnote="' + esc(g[0]) + '">' + esc(v.gnotes[g[0]] || '') + '</textarea></label>';
      }).join('') +
      '<button class="wa" data-act="vtshare">Sonucu WhatsApp ile gönder / paylaş</button><button class="soft" data-act="vtcopy">Sonucu kopyala</button>';
    var notify = '<div class="muted">Hangi uyarıların görüneceğini seçin. Zil rengi: kırmızı = satış alış altında, sarı = diğer uyarılar, yeşil = uyarı yok.</div>' +
      ALERT_KEYS.map(function (k) {
        return '<label class="chk"><input type="checkbox" data-notify="' + k[0] + '"' + (s.notify[k[0]] !== false ? ' checked' : '') + '> ' + k[1] + '</label>';
      }).join('');
    var firm = '<div class="muted">Ada uygulamasındaki firma profil dosyanızı (JSON) yükleyin; alanlar kendiliğinden dolar. Bilgiler müşteri çıktısında kullanılır.</div>' +
      '<div class="row"><button class="primary" data-act="adaprofil">Ada profilini yükle</button><input type="file" id="profFile" accept=".json,application/json" style="display:none"></div>' +
      (s.hasLogo ? '<div class="thumb logo" data-kv="logo"></div>' : '') +
      '<label>Firma adı <input data-set="company" value="' + esc(s.company) + '"></label>' +
      '<label>Telefon <input data-set="phone" value="' + esc(s.phone) + '"></label>' +
      '<label>Web <input data-set="web" value="' + esc(s.web || '') + '"></label>' +
      '<label>E-posta <input data-set="email" value="' + esc(s.email || '') + '"></label>' +
      '<label>Adres <input data-set="address" value="' + esc(s.address || '') + '"></label>' +
      '<label>Banka <input data-set="bank" value="' + esc(s.bank || '') + '"></label>' +
      '<label>IBAN (TL) <input data-set="ibanTL" value="' + esc(s.ibanTL || '') + '"></label>' +
      '<label>IBAN (EUR) <input data-set="ibanEUR" value="' + esc(s.ibanEUR || '') + '"></label>' +
      '<label>IBAN (USD) <input data-set="ibanUSD" value="' + esc(s.ibanUSD || '') + '"></label>' +
      '<label>Garanti metni <input data-set="warranty" value="' + esc(s.warranty || '') + '"></label>' +
      '<label>Teklif notu <input data-set="note" value="' + esc(s.note) + '"></label>' +
      '<label class="chk"><input type="checkbox" data-setb="bankOnOffer"' + (s.bankOnOffer ? ' checked' : '') + '> Banka bilgilerini müşteri çıktısına ekle</label>';
    var backup = '<div class="muted">Veriler bu cihazda saklanır. Düzenli yedek alın. Yedek, ürün resimlerini ve saklanan belgeleri de içerir.</div>' +
      '<div class="row"><button data-act="export">Yedek indir</button>' +
      '<label class="chk">Yedekten yükle <input type="file" id="importFile" accept=".json,application/json"></label></div>' +
      '<div class="row"><button class="danger" data-act="wipe">Tüm verileri sil</button></div>';
    var about = '<div class="kv"><span>Uygulama</span><b>Klavuz ' + APP_VERSION + '</b></div>' +
      '<div class="kv"><span>Kayıt</span><b>' + Object.keys(db.items).length + ' ürün · ' + Object.keys(db.offers).length + ' teklif · ' + db.docs.length + ' belge</b></div>' +
      '<div class="kv"><span>Çalışma</span><b>Türkçe · çevrimdışı</b></div>' +
      '<div class="kv"><span>Firma</span><b>HC MARIN WORKS</b></div>' +
      '<div class="muted">Kayıtlar dış sunucuya gönderilmez. Veri yalnız sizin başlattığınız paylaşım ve yedekle cihazdan çıkar.</div>';
    return '<h1 class="ptitle">Ayarlar</h1>' +
      sect('fb', 'Deneyim ve öneri', 'Puan ve notlar', fb) +
      sect('vt', 'Sürüm testi', '<span class="pill">' + c.done + ' / ' + c.tot + '</span>', test) +
      sect('nt', 'Bildirimler', '', notify) +
      sect('fr', 'Firma bilgileri', esc(s.company || 'müşteri çıktısı'), firm) +
      sect('bk', 'Yedek ve veri', '', backup) +
      sect('ab', 'Uygulama bilgileri', APP_VERSION, about);
  }

  // ---------- Çizim ve olaylar ----------
  function bellClass(level) { return 'bell bell-' + level; }
  function render(keep) {
    document.querySelectorAll('nav.tabs button[data-tab]').forEach(function (b) {
      b.classList.toggle('on', b.dataset.tab === st.tab);
    });
    var al = alerts();
    var cb = $('#cartBadge'), ab = $('#alertBadge');
    cb.textContent = db.cart.length; cb.classList.toggle('zero', !db.cart.length);
    ab.textContent = al.length; ab.classList.toggle('zero', !al.length);
    var bell = $('#bell'); bell.className = bellClass(bellLevel(al)); bell.querySelector('span').textContent = al.length || '';
    var v = $('#view');
    if (st.item) v.innerHTML = viewItem(st.item);
    else if (st.tab === 'ara') { v.innerHTML = viewSearch(); drawResults(); }
    else if (st.tab === 'katalog' && st.docView) { v.innerHTML = viewDocPages(st.docView); loadDocPages(); }
    else if (st.tab === 'katalog') v.innerHTML = viewCatalog();
    else if (st.tab === 'sepet') v.innerHTML = viewCart();
    else if (st.tab === 'uyari') v.innerHTML = viewAlerts();
    else if (st.tab === 'ayar') v.innerHTML = viewSettings();
    hydrateImages(v);
    if (st.item && st.pick) loadPicker();
    if (!keep) window.scrollTo(0, 0);
  }
  function go(tab) { st.tab = tab; st.item = null; st.edit = null; st.pick = false; st.docView = null; render(); }
  function openItem(id) { st.item = id; st.variant = null; st.edit = null; st.pick = false; render(); }
  function addCart(oid) {
    var l = db.cart.find(function (x) { return x.offerId === oid; });
    if (l) l.qty++; else db.cart.push({ offerId: oid, qty: 1, disc: 0 });
    save(); toast('Sepete eklendi');
  }
  function nextCheck(fromId) {
    var list = Object.values(db.items).filter(itemCheckNeeded).sort(function (a, b) { return a.name.localeCompare(b.name, 'tr'); });
    var next = list.filter(function (it) { return it.id !== fromId; })[0];
    if (!next) { toast('Kontrol edilecek ürün kalmadı'); return; }
    openItem(next.id);
  }
  function loadPicker() {
    var el = $('#picker'); if (!el) return;
    var it = db.items[st.item];
    var docIds = Array.from(new Set(offersOf(st.item).map(function (o) { return o.docId; }).filter(Boolean)));
    Promise.all(docIds.map(function (d) {
      return kvGet('doc:' + d).then(function (arr) { return (arr || []).map(function (x) { return { url: x.url, page: x.page, doc: d }; }); });
    })).then(function (groups) {
      var list = [].concat.apply([], groups);
      st.pickList = list;
      if (!list.length) { el.innerHTML = '<span class="muted">Bu belgede resim bulunamadı. Web\'de görsel arayabilirsiniz.</span>'; return; }
      el.innerHTML = list.map(function (x, i) {
        return '<button class="pickbtn" data-act="pickone" data-id="' + i + '"><img alt="" src="' + x.url + '"><small>Sayfa ' + x.page + '</small></button>';
      }).join('');
      if (!it) el.innerHTML = '';
    });
  }
  async function readDraft(force) {
    var supplier = ($('#supName').value || '').trim(), kind = $('#kind').value, f = $('#docFile').files[0] || (force && st.lastFile);
    if (!supplier) return toast('Önce tedarikçi adını yazın.');
    if (!f) return toast('Önce bir belge seçin.');
    if (force && kind === 'sertifika') kind = 'katalog';
    st.catSupplier = supplier; st.catKind = kind; st.lastFile = f; st.readNote = '';
    var msg = $('#readMsg'); msg.textContent = 'Okunuyor...';
    try {
      var res = await readFile(f, function (p, n, what) { msg.textContent = 'Sayfa ' + p + ' / ' + n + ' (' + (what || 'okunuyor') + ')...'; }, kind, force);
      if (res.cert) {
        st.draft = { cert: true, pages: res.pages, rows: [], supplier: supplier, kind: 'sertifika', name: f.name, docId: uid() };
      } else if (!res.rows.length) {
        st.draft = null;
        st.readNote = res.textLength < 20 ? 'Belgede yazı yok: taranmış (resim) PDF. Bu tür belgeler henüz okunamıyor.' :
          (res.images && res.images.length ? 'Tablo bulunamadı. Bu belgede tablolar resim olarak duruyor olabilir; bu tür belgeler henüz okunamıyor.' : 'Belgede ürün tablosu bulunamadı.');
      } else {
        var note = res.emptyPages ? res.emptyPages + ' sayfada yazı yok (taranmış resim); o sayfalar okunamadı.' : '';
        var dr = prepDraft(res.rows);
        st.draft = { rows: dr, images: res.images, supplier: supplier, kind: kind, name: f.name, docId: uid(), note: note, report: buildReport(f.name, supplier, kind, res, dr) };
      }
    } catch (err) { st.draft = null; st.readNote = 'Okunamadı: ' + err.message; }
    render();
  }
  function saveDraft() {
    var d = st.draft; if (!d) return;
    var r = commit(d);
    st.draft = null; st.lastFile = null;
    toast(r.cert ? 'Belge kaydedildi' : 'Kaydedildi: ' + r.created + ' yeni, ' + r.updated + ' güncellendi, ' + r.changed + ' fiyat değişti' + (r.pending ? ', ' + r.pending + ' ana katalog bekliyor' : ''));
    render();
  }
  function saveEdit(oid) {
    var o = db.offers[oid], it = db.items[o && o.itemId];
    if (!o || !it) return;
    it.name = ($('#e_name').value || '').trim() || it.name;
    it.sub = ($('#e_sub').value || '').trim();
    it.brand = ($('#e_brand').value || '').trim() || it.brand;
    o.code = ($('#e_code').value || '').trim(); o.key = codeKey(o.code);
    o.size = ($('#e_size').value || '').trim();
    var p = $('#e_price').value; if (p !== '') { var np = num(p); if (np !== o.listPrice) { o.listPrice = np; o.sellPrice = np; } }
    o.cur = $('#e_cur').value;
    if (o.status === 'check' && o.code) o.status = 'ok';
    st.edit = null; save(); toast('Kaydedildi'); render();
  }
  function exportData() {
    toast('Yedek hazırlanıyor...');
    kvAll().then(function (imgs) {
      var txt = JSON.stringify(Object.assign({}, db, { _images: imgs })), name = 'klavuz-yedek-' + today() + '.json';
      if (window.KlavuzAndroid && KlavuzAndroid.saveFile) { KlavuzAndroid.saveFile(name, txt); return; }
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = name; a.click();
    });
  }
  function importData(txt) {
    try {
      var obj = JSON.parse(txt), imgs = obj._images; delete obj._images;
      db = Object.assign(empty(), obj);
      db.settings = Object.assign(empty().settings, db.settings || {});
      db.settings.notify = Object.assign({}, DEFAULT_NOTIFY, db.settings.notify || {});
      if (imgs) { kvClear(); Object.keys(imgs).forEach(function (k) { kvPut(k, imgs[k]); }); }
      save(); toast('Yedek yüklendi' + (imgs ? ' (resimlerle birlikte)' : '')); render();
    } catch (err) { toast('Yedek dosyası okunamadı.'); }
  }
  function copyText() { copyStr($('#cust').textContent); }
  function repOf(id) {
    if (id === 'draft') return st.draft && st.draft.report;
    var d = db.docs.find(function (x) { return x.id === id; }); return d && d.report;
  }
  // Ada uygulamasından alınan firma profil dosyası (JSON): firma bilgileri tek seferde doldurulur
  function importProfile(txt) {
    try {
      var p = JSON.parse(txt);
      if (!p || (!p.firma_ad && !p.firma_telefon)) return toast('Bu dosya firma profili değil.');
      var s = db.settings;
      s.company = p.firma_ad || s.company; s.phone = p.firma_telefon || s.phone;
      s.web = p.firma_web || s.web || ''; s.email = p.firma_eposta || s.email || ''; s.address = p.firma_adres || s.address || '';
      s.slogan = p.firma_slogan || s.slogan || ''; s.taxOffice = p.vergi_daire || s.taxOffice || ''; s.taxNo = p.vergi_no || s.taxNo || '';
      s.bank = [p.banka_ad, p.banka_sube, p.banka_sahip].filter(Boolean).join(' · ') || s.bank || '';
      s.ibanTL = p.iban_tl || s.ibanTL || ''; s.ibanEUR = p.iban_eur || s.ibanEUR || ''; s.ibanUSD = p.iban_usd || s.ibanUSD || '';
      if (p.garanti_metni && p.garanti_metni.tr) s.warranty = p.garanti_metni.tr;
      if (p.logo_jpeg) { kvPut('logo', 'data:image/jpeg;base64,' + p.logo_jpeg); s.hasLogo = true; }
      save(); toast('Firma profili yüklendi'); render(true);
    } catch (e) { toast('Profil dosyası okunamadı.'); }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act],[data-tab],[data-item]');
    if (!el) return;
    if (el.tagName === 'A') return;
    if (el.dataset.tab) return go(el.dataset.tab);
    if (el.dataset.item && !el.dataset.act) return openItem(el.dataset.item);
    var id = el.dataset.id;
    switch (el.dataset.act) {
      case 'back': st.item = null; st.edit = null; st.pick = false; render(); break;
      case 'filter': st.filter = id; render(); break;
      case 'openitem': openItem(id); break;
      case 'variant': st.variant = id; st.edit = null; render(); break;
      case 'addcart': addCart(id); break;
      case 'hist': st.histOffer = st.histOffer === id ? null : id; render(); break;
      case 'ack': if (db.offers[id]) { db.offers[id].lastDir = null; save(); } render(); break;
      case 'merge': mergeItems(id, st.item); toast('Ürünler birleştirildi'); render(); break;
      case 'verify': if (db.items[id]) { db.items[id].verified = true; offersOf(id).forEach(function (o) { if (o.status === 'check') o.status = 'ok'; }); save(); toast('Doğrulandı'); nextCheck(id); } break;
      case 'nextcheck': nextCheck(id || st.item); break;
      case 'edit': st.edit = id; render(); break;
      case 'canceledit': st.edit = null; render(); break;
      case 'saveedit': saveEdit(id); break;
      case 'pickimg': st.pick = true; render(); break;
      case 'closepick': st.pick = false; render(); break;
      case 'pickone': {
        var pick = st.pickList[Number(id)];
        if (pick && st.item) { kvPut('item:' + st.item, pick.url); db.items[st.item].hasImg = true; save(); st.pick = false; toast('Resim seçildi'); render(); }
        break;
      }
      case 'delitem':
        if (!confirm('Bu ürün ve tüm teklifleri silinsin mi?')) break;
        offersOf(id).forEach(function (o) { delete db.offers[o.id]; });
        delete db.items[id]; kvDel('item:' + id);
        db.cart = db.cart.filter(function (l) { return db.offers[l.offerId]; });
        st.item = null; save(); render(); break;
      case 'deldoc':
        if (!confirm('Bu belge ve belgeden gelen ürünler silinsin mi? (Başka belgeden gelen teklifler kalır)')) break;
        deleteDoc(id); toast('Belge silindi'); render(); break;
      case 'cartdel': db.cart = db.cart.filter(function (l) { return l.offerId !== id; }); save(); render(); break;
      case 'cartclear': if (confirm('Sepet boşaltılsın mı?')) { db.cart = []; save(); render(); } break;
      case 'read': readDraft(false); break;
      case 'readforce': readDraft(true); break;
      case 'opendoc': st.docView = id; render(); break;
      case 'closedoc': st.docView = null; render(); break;
      case 'save': saveDraft(); break;
      case 'cancel': st.draft = null; st.readNote = ''; render(); break;
      case 'export': exportData(); break;
      case 'wipe': if (confirm('Tüm veriler silinsin mi? Bu işlem geri alınamaz.')) { db = empty(); kvClear(); save(); render(); } break;
      case 'print': window.print(); break;
      case 'copy': copyText(); break;
      case 'toggle': st.open[id] = !st.open[id]; render(true); break;
      case 'rep': st.repDoc = st.repDoc === id ? null : id; render(true); break;
      case 'repshare': shareText(reportText(repOf(id))); break;
      case 'repcopy': copyStr(reportText(repOf(id))); break;
      case 'adaprofil': { var pf = $('#profFile'); if (pf) pf.click(); break; }
      case 'fbshare': shareText(fbText()); break;
      case 'fbcopy': copyStr(fbText()); break;
      case 'vtshare': shareText(vtText()); break;
      case 'vtcopy': copyStr(vtText()); break;
      case 'vmark': {
        var pr = id.split(':'), vv = vt();
        if (vv.marks[pr[0]] === pr[1]) delete vv.marks[pr[0]]; else vv.marks[pr[0]] = pr[1];
        save(); render(true); break;
      }
    }
  });
  document.addEventListener('input', function (e) {
    var t = e.target, d = t.dataset;
    if (t.id === 'q') { st.q = t.value; drawResults(); }
    else if (d.fbscore) {
      var f0 = db.feedback[d.fbscore] = db.feedback[d.fbscore] || {}; f0.score = Number(t.value); save();
      var bd = $('#sc_' + d.fbscore); if (bd) { bd.textContent = t.value; bd.style.background = scoreColor(f0.score); }
    }
    else if (d.fb) { var pp = d.fb.split('.'), f1 = db.feedback[pp[0]] = db.feedback[pp[0]] || {}; f1[pp[1]] = t.value; save(); }
    else if (d.vnote) { vt().notes[d.vnote] = t.value; save(); }
    else if (d.vgnote) { vt().gnotes[d.vgnote] = t.value; save(); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target, d = t.dataset;
    if (d.sell) { var o = db.offers[d.sell]; if (o) o.sellPrice = t.value === '' ? null : num(t.value); save(); if (st.item) render(); }
    else if (d.disc) { var o2 = db.offers[d.disc]; if (o2) o2.supDisc = num(t.value); save(); if (st.item) render(); }
    else if (d.cur) { var o3 = db.offers[d.cur]; if (o3) o3.cur = t.value; save(); render(); }
    else if (d.note) { if (db.items[d.note]) db.items[d.note].note = t.value; save(); }
    else if (d.qty) { var l = db.cart.find(function (x) { return x.offerId === d.qty; }); if (l) l.qty = Math.max(1, Math.round(num(t.value)) || 1); save(); render(); }
    else if (d.ldisc) { var l2 = db.cart.find(function (x) { return x.offerId === d.ldisc; }); if (l2) l2.disc = num(t.value); save(); render(); }
    else if (t.id === 'cartDisc') { db.cartDiscount = num(t.value); save(); render(); }
    else if (d.set) { db.settings[d.set] = t.value; save(); }
    else if (d.setb) { db.settings[d.setb] = t.checked; save(); }
    else if (d.notify) { db.settings.notify[d.notify] = t.checked; save(); render(); }
    else if (t.id === 'importFile' && t.files[0]) { t.files[0].text().then(importData); }
    else if (t.id === 'profFile' && t.files[0]) { t.files[0].text().then(importProfile); }
  });

  window.KlavuzSaved = function (ok) { toast(ok ? 'Yedek kaydedildi' : 'Yedek kaydedilemedi'); };
  db = load();
  openImgDb().catch(function () {}).then(function () { render(); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
