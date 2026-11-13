(function () {
  'use strict';

  // ---------- Yardımcılar ----------
  var KEY = 'klavuz.v1';
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }
  function fmt(n) { return (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('tr-TR') + ' TL'; }
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
  function empty() {
    return { items: {}, offers: {}, history: [], docs: [], cart: [], cartDiscount: 0,
      settings: { company: '', phone: '', note: 'Fiyatlar KDV hariçtir.' } };
  }
  var db;
  function load() { try { return Object.assign(empty(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { return empty(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('Kayıt alanı doldu. Yedek alıp eski belgeleri silin.'); } }

  // Ürün resimleri çok yer kapladığı için ayrı bir veritabanında (IndexedDB) tutulur
  var idb = null, imgCache = {};
  function openImgDb() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no indexeddb'));
      var r = indexedDB.open('klavuz-img', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('img'); };
      r.onsuccess = function () { idb = r.result; res(idb); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function putImg(id, url) {
    imgCache[id] = url;
    if (!idb) return;
    try { var tx = idb.transaction('img', 'readwrite'); tx.objectStore('img').put(url, id); } catch (e) {}
  }
  function getImg(id) {
    if (imgCache[id] !== undefined) return Promise.resolve(imgCache[id]);
    if (!idb) return Promise.resolve(null);
    return new Promise(function (res) {
      try {
        var rq = idb.transaction('img').objectStore('img').get(id);
        rq.onsuccess = function () { imgCache[id] = rq.result || null; res(imgCache[id]); };
        rq.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
  }
  function hydrateImages(root) {
    (root || document).querySelectorAll('[data-img]').forEach(function (el) {
      var id = el.dataset.img;
      getImg(id).then(function (url) {
        if (url && el.isConnected && el.dataset.img === id) el.innerHTML = '<img alt="" src="' + url + '">';
      });
    });
  }

  function offersOf(itemId) { return Object.values(db.offers).filter(function (o) { return o.itemId === itemId; }); }
  function buyOf(o) { return o.listPrice == null ? null : Math.round(o.listPrice * (1 - (o.supDisc || 0) / 100)); }
  function sizeSort(a, b) { return String(a.size || '').localeCompare(String(b.size || ''), 'tr', { numeric: true }); }
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
    if (db.items[fromId] && db.items[fromId].hasImg && !db.items[toId].hasImg) { putImg(toId, imgCache[fromId] || null); db.items[toId].hasImg = true; }
    delete db.items[fromId]; save();
  }

  // ---------- Belge okuma ----------
  var CODE_RE = /^[A-Za-z0-9][A-Za-z0-9\-\/\.]{4,}$/;
  var MONEY_RE = /\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?\s?(?:TL|₺)?|\d+,\d{1,2}\s?(?:TL|₺)?|\d+\s?(?:TL|₺)/gi;
  var MONEY_EXACT = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?\s?(?:TL|₺)?$/i;
  var SIZE_RE = /\d+\/\d+\s?"?|DN\s?\d+|M\d+(?:x\d+(?:[.,]\d+)?)?\b|\d+(?:[.,]\d+)?\s?(?:mm|cm|bar|kg|lt|inç|")/i;
  function isCode(t) {
    return CODE_RE.test(t) && /\d/.test(t) && !/^\d{1,3}(\.\d{3})+$/.test(t) && !/,/.test(t) && !/(TL|₺)$/i.test(t);
  }
  function toNum(s) {
    var t = String(s).replace(/TL|₺/gi, '').trim();
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/\./g, '');
    var n = parseFloat(t); return isNaN(n) ? null : n;
  }
  function parseLine(line) {
    var raw = String(line || '').replace(/\s+/g, ' ').trim();
    if (raw.length < 4) return null;
    var toks = raw.split(' '), code = null, idx = -1;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i].replace(/[,;:|()]+$/, '');
      if (isCode(t)) { code = t; idx = i; break; }
    }
    var rest = toks.filter(function (t, j) { return j !== idx; }).join(' ');
    var price = null, ms = rest.match(MONEY_RE);
    if (ms) {
      var last = ms[ms.length - 1]; price = toNum(last);
      var p = rest.lastIndexOf(last); rest = rest.slice(0, p) + ' ' + rest.slice(p + last.length);
    }
    var size = '', sm = rest.match(SIZE_RE);
    if (sm) { size = sm[0].trim(); rest = rest.replace(sm[0], ' '); }
    var name = rest.replace(/\s+/g, ' ').replace(/^[\s\-–|:,;]+|[\s\-–|:,;]+$/g, '').trim();
    if (!code && price == null) return null;
    var warn = null;
    if (!code) warn = 'kod yok';
    else if (price == null) warn = 'fiyat yok';
    else if (/[ILO]/.test(code.toUpperCase())) warn = 'kodu kontrol edin (I/L/1, O/0 karışabilir)';
    return { code: code || '', name: name, size: size, price: price, warn: warn };
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
    var code = null, price = null, size = '', names = [];
    cells.forEach(function (c) {
      if (c === '' || c == null) return;
      if (typeof c === 'number') {
        if (!code && Number.isInteger(c) && String(c).length >= 6) { code = String(c); return; }
        price = c; return;
      }
      var s = String(c).trim(); if (!s) return;
      if (!code && isCode(s)) { code = s; return; }
      if (MONEY_EXACT.test(s)) { price = toNum(s); return; }
      if (!size && SIZE_RE.test(s) && s.length <= 14) { size = s; return; }
      names.push(s);
    });
    if (!code && price == null) return null;
    names.sort(function (a, b) { return b.length - a.length; });
    var warn = !code ? 'kod yok' : (price == null ? 'fiyat yok' : null);
    return { code: code || '', name: names[0] || '', size: size, price: price, warn: warn };
  }

  // PDF: metin satırları + sayfadaki resimler (her resim, sayfa üzerindeki yerine göre kırpılır)
  async function readPdf(file, prog) {
    if (typeof pdfjsLib === 'undefined') throw new Error('PDF okuyucu yüklenemedi. İnternet bağlantısını kontrol edin.');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    var pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    var OPS = pdfjsLib.OPS, lines = [], images = [];
    for (var p = 1; p <= pdf.numPages; p++) {
      var page = await pdf.getPage(p);
      var tc = await page.getTextContent(), byY = new Map();
      tc.items.forEach(function (it) {
        if (!it.str) return;
        var y = Math.round(it.transform[5] / 3) * 3;
        if (!byY.has(y)) byY.set(y, []);
        byY.get(y).push(it);
      });
      Array.from(byY.keys()).sort(function (a, b) { return b - a; }).forEach(function (y) {
        var items = byY.get(y).sort(function (a, b) { return a.transform[4] - b.transform[4]; });
        // Aynı satırdaki farklı sütunları (aralarında boşluk varsa) ayrı satır say
        var segs = [], cur = null, prevEnd = 0;
        items.forEach(function (it) {
          var x = it.transform[4];
          if (!cur || x - prevEnd > 8) { cur = { parts: [], x: x }; segs.push(cur); }
          cur.parts.push(it.str); prevEnd = x + (it.width || 0);
        });
        segs.forEach(function (sg) { lines.push({ text: sg.parts.join(' '), page: p, y: y, x: sg.x }); });
      });

      // Sayfadaki resim yerleri
      var ops = await page.getOperatorList(), boxes = [], ctm = [1, 0, 0, 1, 0, 0], stack = [];
      for (var k = 0; k < ops.fnArray.length; k++) {
        var fn = ops.fnArray[k], a = ops.argsArray[k];
        if (fn === OPS.save) stack.push(ctm.slice());
        else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
        else if (fn === OPS.transform) ctm = mulM(a, ctm);
        else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
          var w = Math.abs(ctm[0]) + Math.abs(ctm[2]), h = Math.abs(ctm[1]) + Math.abs(ctm[3]);
          if (w >= 30 && h >= 30) boxes.push({ x: ctm[4], y: ctm[5], w: w, h: h });
        }
      }
      if (boxes.length) {
        var vp = page.getViewport({ scale: 2 });
        var cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        boxes.forEach(function (b) {
          var r = vp.convertToViewportRectangle([b.x, b.y, b.x + b.w, b.y + b.h]);
          var sx = Math.min(r[0], r[2]), sy = Math.min(r[1], r[3]), sw = Math.abs(r[2] - r[0]), sh = Math.abs(r[3] - r[1]);
          if (sw < 60 || sh < 60) return;
          if (sw * sh > 0.5 * cv.width * cv.height) return; // sayfa arka planı ya da büyük banner
          var s = Math.min(1, 240 / Math.max(sw, sh)), t = document.createElement('canvas');
          t.width = Math.max(1, Math.round(sw * s)); t.height = Math.max(1, Math.round(sh * s));
          t.getContext('2d').drawImage(cv, sx, sy, sw, sh, 0, 0, t.width, t.height);
          images.push({ page: p, cy: b.y + b.h / 2, cx: b.x + b.w / 2, url: t.toDataURL('image/jpeg', 0.8) });
        });
      }
      if (prog) prog(p, pdf.numPages);
    }
    return { lines: lines, images: images };
  }
  // PDF matris çarpımı: yeni CTM = m × eski CTM
  function mulM(m, c) {
    return [m[0] * c[0] + m[1] * c[2], m[0] * c[1] + m[1] * c[3],
      m[2] * c[0] + m[3] * c[2], m[2] * c[1] + m[3] * c[3],
      m[4] * c[0] + m[5] * c[2] + c[4], m[4] * c[1] + m[5] * c[3] + c[5]];
  }
  // Her resmi, aynı sayfadaki en yakın ürün satırına bağla
  function attachImages(rows, images) {
    images.forEach(function (im) {
      var best = null, bd = Infinity;
      rows.forEach(function (r) {
        if (r.page !== im.page || r.img || r.y == null) return;
        var d = Math.abs(r.y - im.cy) + 0.5 * Math.abs((r.x || 0) - im.cx);
        if (d < bd) { bd = d; best = r; }
      });
      if (best && bd < 220) best.img = im.url;
    });
    return rows;
  }
  async function readFile(file, prog) {
    var n = file.name.toLowerCase();
    if (/\.pdf$/.test(n)) {
      var res = await readPdf(file, prog);
      var rows = attachImages(parseLines(res.lines), res.images);
      return { rows: rows, textLength: res.lines.reduce(function (s, l) { return s + l.text.length; }, 0) };
    }
    if (/\.(xlsx|xls|csv|ods)$/.test(n)) {
      if (typeof XLSX === 'undefined') throw new Error('Excel okuyucu yüklenemedi. İnternet bağlantısını kontrol edin.');
      var wb = XLSX.read(await file.arrayBuffer(), { type: 'array' }), out = [];
      wb.SheetNames.forEach(function (sn) {
        XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: '' }).forEach(function (r) {
          var pr = parseCells(r); if (pr) out.push(pr);
        });
      });
      return { rows: out, textLength: 1 };
    }
    return { rows: parseLines((await file.text()).split(/\r?\n/)), textLength: 1 };
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
  // Belgeyi veritabanına işle
  // - Aynı tedarikçi + aynı kod: teklifi günceller, fiyat değiştiyse geçmişe yazar
  // - Aynı tedarikçi + aynı ürün adı: aynı ürün kartına yeni varyant (ölçü/kod) olarak ekler
  // - Yeni ürün: yeni kart oluşturur
  function commit(rows, supplier, kind, docName) {
    var docId = uid(), res = { created: 0, updated: 0, changed: 0, pending: 0 };
    rows.forEach(function (r) {
      var key = codeKey(r.code);
      var off = key ? Object.values(db.offers).find(function (o) { return o.supplier === supplier && o.key === key; }) : null;
      if (off) {
        if (r.price != null && r.price !== off.listPrice) {
          db.history.push({ offerId: off.id, old: off.listPrice, price: r.price, date: today(), doc: docName });
          var wasSell = off.sellPrice === off.listPrice;
          off.lastDir = (off.listPrice != null && r.price > off.listPrice) ? 'up' : 'down';
          off.listPrice = r.price;
          if (wasSell) off.sellPrice = r.price;
          res.changed++;
        }
        if (r.size) off.size = r.size;
        off.status = r.warn ? 'check' : 'ok';
        off.updated = today(); off.docId = docId; res.updated++;
        if (r.img) attachImg(db.items[off.itemId], r.img);
        return;
      }
      var pendingFlag = kind === 'fiyat';
      var nm = fold(r.name);
      var item = nm ? Object.values(db.items).find(function (it) { return fold(it.name) === nm && it.brand === supplier; }) : null;
      if (!item) {
        item = { id: uid(), name: r.name || r.code || 'İsimsiz ürün', brand: supplier, category: '', note: '', verified: !pendingFlag && !r.warn, hasImg: false };
        db.items[item.id] = item;
      } else if (!pendingFlag && !r.warn) item.verified = true;
      if (r.img) attachImg(item, r.img);
      var o = { id: uid(), itemId: item.id, supplier: supplier, code: r.code || '', key: key, size: r.size || '',
        listPrice: r.price, supDisc: 0, sellPrice: r.price, lastDir: null,
        status: r.warn ? 'check' : (pendingFlag ? 'pending' : 'ok'), updated: today(), docId: docId };
      db.offers[o.id] = o; res.created++;
      if (pendingFlag) res.pending++;
    });
    db.docs.push({ id: docId, name: docName, supplier: supplier, kind: kind, date: today(), count: rows.length });
    save();
    return res;
  }
  function attachImg(item, url) {
    if (!item || item.hasImg) return;
    item.hasImg = true; putImg(item.id, url);
  }

  // ---------- Arama ----------
  function matchItem(it, q) {
    if (!q) return true;
    var offs = offersOf(it.id);
    if (fold(it.name + ' ' + it.brand + ' ' + it.category).indexOf(fold(q)) >= 0) return true;
    var qk = codeKey(q), qc = confKey(q);
    return offs.some(function (o) {
      return (qk && codeKey(o.code).indexOf(qk) >= 0) || (qc && confKey(o.code).indexOf(qc) >= 0) || fold(o.supplier).indexOf(fold(q)) >= 0;
    });
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
    if (offs.some(function (o) { return o.status === 'check'; })) b += '<span class="badge b-warn">Kontrol gerekli</span>';
    if (offs.some(function (o) { return o.status === 'pending'; })) b += '<span class="badge b-pend">Ana katalogda yok, bekliyor</span>';
    return b;
  }
  function thumb(it, cls) {
    return '<div class="thumb ' + (cls || '') + '" data-img="' + it.id + '"><span>' + esc((it.name || '?').charAt(0).toUpperCase()) + '</span></div>';
  }
  function card(it) {
    var offs = offersOf(it.id).sort(sizeSort);
    var best = offs.filter(function (o) { return o.sellPrice != null; }).sort(function (a, b) { return a.sellPrice - b.sellPrice; })[0];
    var codes = offs.map(function (o) { return o.code; }).filter(Boolean).join(', ');
    var sup = Array.from(new Set(offs.map(function (o) { return o.supplier; }))).join(', ');
    var sizes = offs.map(function (o) { return o.size; }).filter(Boolean).join(' · ');
    return '<div class="card pcard" data-item="' + it.id + '">' + thumb(it) +
      '<div class="ptxt"><b>' + esc(it.name) + '</b>' +
      '<div class="muted">' + esc(sup) + (codes ? ' · ' + esc(codes) : '') + '</div>' +
      (sizes ? '<div class="muted">Ölçü: ' + esc(sizes) + '</div>' : '') +
      '<div class="price">' + (best ? (offs.length > 1 ? 'Başlangıç ' : '') + fmt(best.sellPrice) : 'Fiyat yok') + '</div>' +
      '<div>' + badgesOf(it, offs) + '</div></div></div>';
  }
  function drawResults() {
    var q = st.q.trim();
    var items = Object.values(db.items).filter(function (it) { return matchItem(it, q); })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'tr'); });
    $('#sugg').innerHTML = q ? suggestions(q) : '';
    $('#results').innerHTML = items.length ? items.slice(0, 200).map(card).join('') :
      '<p class="muted">' + (Object.keys(db.items).length ? 'Sonuç yok.' : 'Henüz ürün yok. Belge sekmesinden bir katalog yükleyin.') + '</p>';
    hydrateImages($('#results'));
  }

  // ---------- Ekranlar ----------
  var st = { tab: 'ara', q: '', item: null, variant: null, draft: null, catSupplier: '', catKind: 'katalog', histOffer: null };

  function viewSearch() {
    return '<div class="card"><input type="search" id="q" placeholder="Ürün adı, kod veya marka" value="' + esc(st.q) + '"></div>' +
      '<div id="sugg"></div><div id="results" style="display:flex;flex-direction:column;gap:10px"></div>';
  }
  function statusBadge(o) {
    var s = '';
    if (o.status === 'check') s += '<span class="badge b-warn">Kontrol gerekli</span>';
    if (o.status === 'pending') s += '<span class="badge b-pend">Ana katalogda yok, bekliyor</span>';
    if (o.lastDir === 'up') s += '<span class="badge b-warn">Fiyat yükseldi</span>';
    if (o.lastDir === 'down') s += '<span class="badge b-ok">Fiyat düştü</span>';
    return s;
  }
  function histHtml(oid) {
    var h = db.history.filter(function (x) { return x.offerId === oid; }).reverse();
    if (!h.length) return '<div class="muted">Fiyat değişikliği yok.</div>';
    return '<table><tr><th>Tarih</th><th>Eski</th><th>Yeni</th><th>Belge</th></tr>' + h.map(function (x) {
      return '<tr><td>' + esc(x.date) + '</td><td>' + fmt(x.old) + '</td><td>' + fmt(x.price) + '</td><td>' + esc(x.doc) + '</td></tr>';
    }).join('') + '</table>';
  }
  function offerRow(o) {
    return '<div class="offer">' +
      '<div><b>' + esc(o.supplier) + '</b> · kod <code>' + esc(o.code || '—') + '</code>' + (o.size ? ' · ' + esc(o.size) : '') + ' ' + statusBadge(o) + '</div>' +
      '<div class="muted">Liste ' + fmt(o.listPrice) + ' · Tedarikçi indirimi <input class="sm" type="number" data-disc="' + o.id + '" value="' + (o.supDisc || 0) + '">% · Alış ' + fmt(buyOf(o)) + '</div>' +
      '<div class="row"><span>Satış <input class="sm" type="number" data-sell="' + o.id + '" value="' + (o.sellPrice == null ? '' : o.sellPrice) + '"> TL</span>' +
      '<span><button data-act="addcart" data-id="' + o.id + '">Sepete ekle</button> ' +
      '<button class="link" data-act="hist" data-id="' + o.id + '">Fiyat geçmişi</button>' +
      (o.lastDir ? ' <button class="link" data-act="ack" data-id="' + o.id + '">Gördüm</button>' : '') + '</span></div>' +
      (st.histOffer === o.id ? histHtml(o.id) : '') + '</div>';
  }
  function viewItem(id) {
    var it = db.items[id];
    if (!it) return '<div class="card"><p>Ürün bulunamadı.</p></div>';
    var offs = offersOf(id).sort(sizeSort), sim = similarItems(it);
    if (!offs.length) return '<div class="card"><p class="muted">Bu üründe teklif yok.</p></div>';
    var sel = offs.filter(function (o) { return o.id === st.variant; })[0] || offs[0];
    st.variant = sel.id;
    var variants = offs.length > 1 ? '<div class="variants">' + offs.map(function (o) {
      return '<button class="chip' + (o.id === sel.id ? ' on' : '') + '" data-act="variant" data-id="' + o.id + '">' +
        esc(o.size || o.code || '—') + '<small>' + fmt(o.sellPrice) + '</small></button>';
    }).join('') + '</div>' : '';
    return '<button class="link" data-act="back">← Geri</button>' +
      '<div class="card detail">' + thumb(it, 'hero') +
      '<div><h2>' + esc(it.name) + '</h2><div class="muted">' + esc(it.brand) + (sel.code ? ' · kod ' + esc(sel.code) : '') + '</div></div>' +
      '<div>' + badgesOf(it, offs) + '</div>' + variants +
      '<div class="bigprice">' + fmt(sel.sellPrice) + ' <span class="muted">(öneri satış' + (sel.size ? ', ' + esc(sel.size) : '') + ')</span></div>' +
      '<div class="row"><button class="primary" data-act="addcart" data-id="' + sel.id + '">Sepete ekle</button>' +
      '<button class="ghost" data-act="hist" data-id="' + sel.id + '">Fiyat geçmişi</button></div>' +
      (st.histOffer === sel.id ? histHtml(sel.id) : '') +
      '<div class="internal">Alış ' + fmt(buyOf(sel)) + ' · Kâr ' + fmt((sel.sellPrice || 0) - (buyOf(sel) || 0)) + '</div>' +
      '</div>' +
      '<div class="card"><h3>Tedarikçi teklifleri</h3>' + offs.map(offerRow).join('') + '</div>' +
      '<div class="card"><label>Not <input data-note="' + id + '" value="' + esc(it.note || '') + '"></label>' +
      '<div class="row"><button class="danger" data-act="delitem" data-id="' + id + '">Ürünü sil</button></div></div>' +
      (sim.length ? '<div class="card"><h3>Benzer ürünler (karar sizin)</h3>' + sim.map(function (x) {
        return '<div class="row"><span>' + esc(x.name) + ' · ' + esc(offersOf(x.id).map(function (o) { return o.code; }).join(', ')) +
          '</span><button class="ghost" data-act="merge" data-id="' + x.id + '">Aynı ürün, birleştir</button></div>';
      }).join('') + '</div>' : '');
  }
  function viewCatalog() {
    var docs = db.docs.slice().reverse().map(function (d) {
      return '<div class="row"><span><b>' + esc(d.name) + '</b><div class="muted">' + esc(d.supplier) + ' · ' + esc(d.date) + ' · ' + d.count + ' satır · ' + (d.kind === 'fiyat' ? 'fiyat listesi' : 'ana katalog') + '</div></span></div>';
    }).join('');
    var h = '<div class="card"><h2>Belge yükle</h2>' +
      '<div class="muted">PDF, Excel (xlsx/xls), CSV veya TXT dosyası seçin. Okunan ürünleri kaydetmeden önce kontrol edersiniz.</div>' +
      '<label>Tedarikçi / marka adı <input id="supName" value="' + esc(st.catSupplier) + '"></label>' +
      '<label>Belge türü <select id="kind">' +
      '<option value="katalog"' + (st.catKind === 'katalog' ? ' selected' : '') + '>Ana katalog (resimli, detaylı)</option>' +
      '<option value="fiyat"' + (st.catKind === 'fiyat' ? ' selected' : '') + '>Fiyat listesi (kod ve fiyat)</option></select></label>' +
      '<input type="file" id="docFile" accept=".pdf,.xlsx,.xls,.csv,.txt">' +
      '<div class="row"><button class="primary" data-act="read">Belgeyi oku</button><span class="muted" id="readMsg"></span></div></div>';
    if (st.draft) {
      var d = st.draft, warn = d.rows.filter(function (r) { return r.warn; }).length, withImg = d.rows.filter(function (r) { return r.img; }).length;
      h += '<div class="card"><h3>Kontrol: ' + esc(d.name) + '</h3>' +
        '<div class="muted">' + d.rows.length + ' ürün okundu, ' + warn + ' tanesi kontrol gerektiriyor, ' + withImg + ' tanesine resim eşleşti.</div>' +
        '<div class="scroll"><table><tr><th>Kod</th><th>Ürün</th><th>Ölçü</th><th>Fiyat</th><th>Not</th></tr>' +
        d.rows.slice(0, 300).map(function (r) {
          return '<tr><td>' + esc(r.code || '—') + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.size) + '</td><td>' + fmt(r.price) + '</td><td>' + (r.warn ? '<span class="badge b-warn">' + esc(r.warn) + '</span>' : '') + '</td></tr>';
        }).join('') + '</table></div>' +
        (d.rows.length > 300 ? '<div class="muted">İlk 300 satır gösteriliyor, hepsi kaydedilecek.</div>' : '') +
        '<div class="row"><button class="primary" data-act="save">Kaydet</button><button class="ghost" data-act="cancel">İptal</button></div></div>';
    }
    return h + '<div class="card"><h3>Yüklenen belgeler</h3>' + (docs || '<p class="muted">Henüz belge yok.</p>') + '</div>';
  }
  function viewCart() {
    var lines = db.cart.filter(function (l) { return db.offers[l.offerId]; });
    if (!lines.length) return '<div class="card"><p class="muted">Sepet boş. Ara sekmesinden ürün ekleyin.</p></div>';
    var sellBefore = 0, buyTotal = 0, cust = [];
    var rows = lines.map(function (l) {
      var o = db.offers[l.offerId], it = db.items[o.itemId] || { name: '?' };
      var amount = (o.sellPrice || 0) * l.qty * (1 - (l.disc || 0) / 100);
      var buy = (buyOf(o) || 0) * l.qty;
      sellBefore += amount; buyTotal += buy;
      cust.push({ name: it.name, code: o.code, size: o.size, qty: l.qty, amount: amount });
      return '<div class="card pcard">' + thumb(it) + '<div class="ptxt"><b>' + esc(it.name) + '</b>' +
        '<div class="muted">' + esc(o.supplier) + ' · kod ' + esc(o.code || '—') + (o.size ? ' · ' + esc(o.size) : '') + '</div>' +
        '<div class="row"><span>Adet <input class="sm" type="number" min="1" data-qty="' + o.id + '" value="' + l.qty + '"></span>' +
        '<span>Kalem iskontosu <input class="sm" type="number" data-ldisc="' + o.id + '" value="' + (l.disc || 0) + '">%</span></div>' +
        '<div class="row"><span>Satış ' + fmt(amount) + '</span><span class="internal">Alış ' + fmt(buy) + '</span>' +
        '<button class="link" data-act="cartdel" data-id="' + o.id + '">Kaldır</button></div></div></div>';
    }).join('');
    var cd = db.cartDiscount || 0, net = sellBefore * (1 - cd / 100), profit = net - buyTotal;
    var custText = customerText(cust, cd, net);
    return rows +
      '<div class="card"><h3>Dahili özet</h3><div class="internal">Bu bölüm yalnızca sizde görünür.</div>' +
      '<div class="row"><span>Toplam alış</span><b>' + fmt(buyTotal) + '</b></div>' +
      '<div class="row"><span>Satış (iskonto öncesi)</span><b>' + fmt(sellBefore) + '</b></div>' +
      '<div class="row"><span>Sepet iskontosu %</span><input class="sm" type="number" id="cartDisc" value="' + cd + '"></div>' +
      '<div class="row"><span>Net satış</span><b>' + fmt(net) + '</b></div>' +
      '<div class="row"><span>Kâr</span><b style="color:' + (profit < 0 ? '#B91C1C' : '#065F46') + '">' + fmt(profit) + '</b></div>' +
      (net < buyTotal ? '<div class="badge b-warn">Uyarı: net satış toplam alış fiyatının altında</div>' : '') +
      '<div class="row"><button class="ghost" data-act="cartclear">Sepeti boşalt</button></div></div>' +
      '<div class="card"><h3>Müşteri çıktısı</h3><div class="muted">Yalnızca satış fiyatları yer alır. Alış ve kâr görünmez.</div>' +
      '<pre id="cust">' + esc(custText) + '</pre>' +
      '<div class="row"><button data-act="print">Yazdır / PDF</button><button class="ghost" data-act="copy">Metni kopyala</button></div></div>';
  }
  function customerText(cust, cd, net) {
    var s = db.settings, out = [];
    if (s.company) out.push(s.company);
    if (s.phone) out.push('Tel: ' + s.phone);
    out.push('Tarih: ' + today(), '');
    cust.forEach(function (c, i) {
      out.push((i + 1) + '. ' + c.name + (c.code ? ' (' + c.code + ')' : '') + (c.size ? ' ' + c.size : '') + ' — ' + c.qty + ' adet — ' + fmt(c.amount));
    });
    if (cd) out.push('', 'İskonto: %' + cd);
    out.push('Toplam (KDV hariç): ' + fmt(net));
    if (s.note) out.push('', s.note);
    return out.join('\n');
  }
  function alerts() {
    var out = [];
    Object.values(db.offers).forEach(function (o) {
      var it = db.items[o.itemId]; if (!it) return;
      var name = it.name + ' · ' + o.supplier + (o.code ? ' ' + o.code : '');
      var b = buyOf(o);
      if (o.lastDir === 'up') out.push({ t: 'Fiyat yükseldi', d: name + ' — ' + fmt(o.listPrice), oid: o.id });
      if (o.lastDir === 'down') out.push({ t: 'Fiyat düştü', d: name + ' — ' + fmt(o.listPrice), oid: o.id });
      if (o.sellPrice != null && b != null && o.sellPrice < b) out.push({ t: 'Satış alış fiyatının altında', d: name + ' — satış ' + fmt(o.sellPrice) + ', alış ' + fmt(b) });
      if (o.status === 'pending') out.push({ t: 'Ana katalogda yok, bekliyor', d: name });
      if (o.status === 'check') out.push({ t: 'Kontrol gerekli', d: name });
    });
    return out;
  }
  function viewAlerts() {
    var a = alerts();
    if (!a.length) return '<div class="card"><p class="muted">Şu an uyarı yok.</p></div>';
    return a.map(function (x) {
      return '<div class="card"><b>' + esc(x.t) + '</b><div class="muted">' + esc(x.d) + '</div>' +
        (x.oid ? '<div><button class="ghost" data-act="ack" data-id="' + x.oid + '">Gördüm</button></div>' : '') + '</div>';
    }).join('');
  }
  function viewSettings() {
    var s = db.settings;
    return '<div class="card"><h3>Firma bilgileri (müşteri çıktısında görünür)</h3>' +
      '<label>Firma adı <input data-set="company" value="' + esc(s.company) + '"></label>' +
      '<label>Telefon <input data-set="phone" value="' + esc(s.phone) + '"></label>' +
      '<label>Teklif notu <input data-set="note" value="' + esc(s.note) + '"></label></div>' +
      '<div class="card"><h3>Yedek</h3><div class="muted">Veriler bu cihazın tarayıcısında saklanır. Düzenli yedek alın. Ürün resimleri yedeğe dahil değildir.</div>' +
      '<div class="row"><button data-act="export">Yedek indir</button>' +
      '<label style="flex-direction:row;align-items:center;gap:6px">Yedekten yükle <input type="file" id="importFile" accept=".json"></label></div></div>' +
      '<div class="card"><button class="danger" data-act="wipe">Tüm verileri sil</button></div>';
  }

  // ---------- Çizim ve olaylar ----------
  function render() {
    document.querySelectorAll('nav.tabs button[data-tab]').forEach(function (b) {
      b.classList.toggle('on', b.dataset.tab === st.tab && !st.item);
    });
    $('#cartBadge').textContent = db.cart.length;
    $('#alertBadge').textContent = alerts().length;
    var v = $('#view');
    if (st.item) v.innerHTML = viewItem(st.item);
    else if (st.tab === 'ara') { v.innerHTML = viewSearch(); drawResults(); }
    else if (st.tab === 'katalog') v.innerHTML = viewCatalog();
    else if (st.tab === 'sepet') v.innerHTML = viewCart();
    else if (st.tab === 'uyari') v.innerHTML = viewAlerts();
    else if (st.tab === 'ayar') v.innerHTML = viewSettings();
    hydrateImages(v);
    window.scrollTo(0, 0);
  }
  function go(tab) { st.tab = tab; st.item = null; render(); }
  function openItem(id) { st.item = id; st.variant = null; render(); }
  function addCart(oid) {
    var l = db.cart.find(function (x) { return x.offerId === oid; });
    if (l) l.qty++; else db.cart.push({ offerId: oid, qty: 1, disc: 0 });
    save(); toast('Sepete eklendi');
  }
  async function readDraft() {
    var supplier = ($('#supName').value || '').trim(), kind = $('#kind').value, f = $('#docFile').files[0];
    if (!supplier) return toast('Önce tedarikçi adını yazın.');
    if (!f) return toast('Önce bir belge seçin.');
    st.catSupplier = supplier; st.catKind = kind;
    var msg = $('#readMsg'); msg.textContent = 'Okunuyor...';
    try {
      var res = await readFile(f, function (p, n) { msg.textContent = 'Sayfa ' + p + ' / ' + n + ' okunuyor...'; });
      st.draft = { rows: prepDraft(res.rows), supplier: supplier, kind: kind, name: f.name };
      if (!res.rows.length) toast(res.textLength < 20 ? 'Belgede metin bulunamadı. Taranmış (resim) PDF olabilir.' : 'Belgede ürün satırı bulunamadı.');
    } catch (err) { st.draft = null; msg.textContent = 'Okunamadı: ' + err.message; return; }
    render();
  }
  function saveDraft() {
    var d = st.draft; if (!d) return;
    var r = commit(d.rows, d.supplier, d.kind, d.name);
    st.draft = null;
    toast('Kaydedildi: ' + r.created + ' yeni, ' + r.updated + ' güncellendi, ' + r.changed + ' fiyat değişti' + (r.pending ? ', ' + r.pending + ' ana katalog bekliyor' : ''));
    render();
  }
  function exportData() {
    var blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'klavuz-yedek-' + today() + '.json'; a.click();
  }
  function copyText() {
    var t = $('#cust').textContent;
    if (!navigator.clipboard) return toast('Kopyalama bu cihazda desteklenmiyor.');
    navigator.clipboard.writeText(t).then(function () { toast('Kopyalandı'); }, function () { toast('Kopyalanamadı'); });
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act],[data-tab],[data-item]');
    if (!el) return;
    if (el.dataset.tab) return go(el.dataset.tab);
    if (el.dataset.item && !el.dataset.act) return openItem(el.dataset.item);
    var id = el.dataset.id;
    switch (el.dataset.act) {
      case 'back': st.item = null; render(); break;
      case 'variant': st.variant = id; render(); break;
      case 'addcart': addCart(id); break;
      case 'hist': st.histOffer = st.histOffer === id ? null : id; render(); break;
      case 'ack': if (db.offers[id]) { db.offers[id].lastDir = null; save(); } render(); break;
      case 'merge': mergeItems(id, st.item); render(); toast('Ürünler birleştirildi'); break;
      case 'delitem':
        if (!confirm('Bu ürün ve tüm teklifleri silinsin mi?')) break;
        offersOf(id).forEach(function (o) { delete db.offers[o.id]; });
        delete db.items[id]; delete imgCache[id];
        if (idb) try { idb.transaction('img', 'readwrite').objectStore('img').delete(id); } catch (e2) {}
        db.cart = db.cart.filter(function (l) { return db.offers[l.offerId]; });
        st.item = null; save(); render(); break;
      case 'cartdel': db.cart = db.cart.filter(function (l) { return l.offerId !== id; }); save(); render(); break;
      case 'cartclear': if (confirm('Sepet boşaltılsın mı?')) { db.cart = []; save(); render(); } break;
      case 'read': readDraft(); break;
      case 'save': saveDraft(); break;
      case 'cancel': st.draft = null; render(); break;
      case 'export': exportData(); break;
      case 'wipe': if (confirm('Tüm veriler silinsin mi? Bu işlem geri alınamaz.')) { db = empty(); imgCache = {}; if (idb) try { idb.transaction('img', 'readwrite').objectStore('img').clear(); } catch (e3) {} save(); render(); } break;
      case 'print': window.print(); break;
      case 'copy': copyText(); break;
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'q') { st.q = e.target.value; drawResults(); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target, d = t.dataset;
    if (d.sell) { var o = db.offers[d.sell]; if (o) o.sellPrice = t.value === '' ? null : num(t.value); save(); if (st.item) render(); }
    else if (d.disc) { var o2 = db.offers[d.disc]; if (o2) o2.supDisc = num(t.value); save(); if (st.item) render(); }
    else if (d.note) { if (db.items[d.note]) db.items[d.note].note = t.value; save(); }
    else if (d.qty) { var l = db.cart.find(function (x) { return x.offerId === d.qty; }); if (l) l.qty = Math.max(1, Math.round(num(t.value)) || 1); save(); render(); }
    else if (d.ldisc) { var l2 = db.cart.find(function (x) { return x.offerId === d.ldisc; }); if (l2) l2.disc = num(t.value); save(); render(); }
    else if (t.id === 'cartDisc') { db.cartDiscount = num(t.value); save(); render(); }
    else if (d.set) { db.settings[d.set] = t.value; save(); }
    else if (t.id === 'importFile' && t.files[0]) {
      t.files[0].text().then(function (txt) {
        try { db = Object.assign(empty(), JSON.parse(txt)); save(); toast('Yedek yüklendi'); render(); }
        catch (err) { toast('Yedek dosyası okunamadı.'); }
      });
    }
  });

  db = load();
  openImgDb().catch(function () {}).then(function () { render(); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
