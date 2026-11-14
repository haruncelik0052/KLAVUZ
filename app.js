(function () {
  'use strict';

  // ---------- Yardımcılar ----------
  var KEY = 'klavuz.v1';
  var APP_VERSION = '0.11.2';
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
    return { items: {}, offers: {}, history: [], docs: [], cart: [], cartDiscount: 0, feedback: {}, vtest: {}, brands: {}, sellers: {}, learn: { name: {}, tok: {} }, catEdit: { names: {}, subs: {} },
      settings: { company: '', phone: '', note: 'Fiyatlar KDV hariçtir.', notify: Object.assign({}, DEFAULT_NOTIFY) } };
  }
  var db;
  function normalize(d) {
    d = Object.assign(empty(), d || {});
    d.settings = Object.assign(empty().settings, d.settings || {});
    d.settings.notify = Object.assign({}, DEFAULT_NOTIFY, d.settings.notify || {});
    d.learn = { name: (d.learn && d.learn.name) || {}, tok: (d.learn && d.learn.tok) || {} };
    d.catEdit = { names: (d.catEdit && d.catEdit.names) || {}, subs: (d.catEdit && d.catEdit.subs) || {} };
    return d;
  }
  function loadLs() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }

  // Veriler cihazdaki geniş veritabanında (IndexedDB) tutulur; eski sürümün dar kayıt alanından (localStorage)
  // ilk açılışta kendiliğinden taşınır. Eski kayıt silinmez, yedek olarak yerinde kalır.
  // Depolar: "data" -> ürünler, teklifler, belgeler, ayarlar; "img" -> resimler ve sayfa görüntüleri;
  // "draft" -> okunmuş ama henüz kaydedilmemiş belgeler (parça parça).
  var idb = null, kvCache = {}, storeMode = 'ls', saveTimer = null, saveBad = false;
  var PARTS = ['items', 'offers', 'history', 'docs'];
  function openDb() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no indexeddb'));
      var r = indexedDB.open('klavuz-img', 3);
      r.onupgradeneeded = function () {
        var d = r.result;
        ['img', 'data', 'draft', 'file'].forEach(function (n) { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); });
      };
      r.onsuccess = function () { idb = r.result; res(idb); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function storeAll(store) {
    return new Promise(function (res, rej) {
      var out = {}, rq = idb.transaction(store).objectStore(store).openCursor();
      rq.onsuccess = function () { var c = rq.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
      rq.onerror = function () { rej(rq.error); };
    });
  }
  function storePut(store, k, v) {
    return new Promise(function (res) {
      if (!idb) return res(false);
      try {
        var tx = idb.transaction(store, 'readwrite'); tx.objectStore(store).put(v, k);
        tx.oncomplete = function () { res(true); }; tx.onerror = tx.onabort = function () { res(false); };
      } catch (e) { res(false); }
    });
  }
  function storeGet(store, k) {
    return new Promise(function (res) {
      if (!idb) return res(null);
      try {
        var rq = idb.transaction(store).objectStore(store).get(k);
        rq.onsuccess = function () { res(rq.result === undefined ? null : rq.result); };
        rq.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
  }
  function storeDel(store, k) { if (idb) try { idb.transaction(store, 'readwrite').objectStore(store).delete(k); } catch (e) {} }
  function saveFail() {
    saveBad = true; drawStrip();
    toast('Kayıt yapılamadı. Ayarlar > Yedek ve veri bölümünden yedek alın.');
  }
  // Belleği kalıcı kayda yazar. Söz döner: true = yazıldı.
  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    if (storeMode !== 'idb') {
      try { localStorage.setItem(KEY, JSON.stringify(db)); saveBad = false; return Promise.resolve(true); }
      catch (e) { saveFail(); return Promise.resolve(false); }
    }
    return new Promise(function (res) {
      try {
        var tx = idb.transaction('data', 'readwrite'), s = tx.objectStore('data'), rest = {};
        Object.keys(db).forEach(function (k) { if (PARTS.indexOf(k) < 0) rest[k] = db[k]; });
        PARTS.forEach(function (k) { s.put(db[k], k); });
        s.put(rest, 'rest'); s.put({ ver: APP_VERSION, date: today() }, 'meta');
        tx.oncomplete = function () { if (saveBad) { saveBad = false; drawStrip(); } res(true); };
        tx.onerror = tx.onabort = function () { saveFail(); res(false); };
      } catch (e) { saveFail(); res(false); }
    });
  }
  // Her değişiklikten sonra çağrılır; yazma kısa bir gecikmeyle toplu yapılır.
  function save() { touch(); if (!saveTimer) saveTimer = setTimeout(flush, 200); }

  // Resimler: anahtarlar "item:<ürünId>" -> resim, "doc:<belgeId>" -> belgedeki tüm resimler, "pages:<belgeId>" -> sayfa görüntüleri
  function kvPut(k, v) {
    if (!idb || k in kvCache) kvCache[k] = v;
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
  function kvDel(k) { delete kvCache[k]; storeDel('img', k); }
  function kvClear() {
    kvCache = {};
    if (idb) try { idb.transaction('img', 'readwrite').objectStore('img').clear(); } catch (e) {}
  }
  // Yedek için: resim veritabanındaki anahtarlar ve tek tek değerler (hepsi birden belleğe alınmaz)
  function kvKeys() {
    return new Promise(function (res) {
      var mem = Object.keys(kvCache).filter(function (k) { return kvCache[k] != null; });
      if (!idb) return res(mem);
      try {
        var rq = idb.transaction('img').objectStore('img').getAllKeys();
        rq.onsuccess = function () { res(rq.result.map(String)); };
        rq.onerror = function () { res(mem); };
      } catch (e) { res(mem); }
    });
  }
  function kvRead(k) {
    if (!idb) return Promise.resolve(kvCache[k] == null ? null : kvCache[k]);
    return new Promise(function (res) {
      try {
        var rq = idb.transaction('img').objectStore('img').get(k);
        rq.onsuccess = function () { res(rq.result === undefined ? null : rq.result); };
        rq.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
  }
  function hydrateImages(root) {
    (root || document).querySelectorAll('[data-kv]').forEach(function (el) {
      kvGet(el.dataset.kv).then(function (url) { if (url && el.isConnected) el.innerHTML = '<img alt="" src="' + url + '">'; });
    });
    (root || document).querySelectorAll('[data-cover]').forEach(function (el) {
      var id = el.dataset.cover, kind = el.dataset.kind;
      kvGet('cover:' + id).then(function (url) {
        if (url) return url;
        return kvGet(kind + ':' + id).then(function (arr) {
          var f = arr && arr.length ? arr[0] : null, u = f && typeof f === 'object' ? f.url : f;
          if (u) kvPut('cover:' + id, u);
          return u;
        });
      }).then(function (url) { if (url && el.isConnected) el.innerHTML = '<img alt="" src="' + url + '">'; });
    });
    (root || document).querySelectorAll('[data-img]').forEach(function (el) {
      var id = el.dataset.img;
      kvGet('item:' + id).then(function (url) {
        if (url && el.isConnected && el.dataset.img === id) el.innerHTML = '<img alt="" src="' + url + '">';
      });
    });
  }

  // Ürünün teklifleri: her seferinde bütün teklifleri taramamak için dizin tutulur; her değişiklikte yenilenir.
  var offIdx = null;
  function touch() { offIdx = null; sIdx = {}; }
  function offersOf(itemId) {
    if (!offIdx) { offIdx = {}; Object.values(db.offers).forEach(function (o) { (offIdx[o.itemId] = offIdx[o.itemId] || []).push(o); }); }
    return (offIdx[itemId] || []).slice();
  }
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

  // ---------- Kategori ağacı, eş anlamlılar, marka ve satıcı ----------
  // İki kademe: ana grup > alt grup. Anahtar sözcükler küçük harf ve Türkçe harfsiz (fold) yazılır; boşluklu olanlar söz öbeğidir.
  // Ana grup kimlikleri 0.5.0'dan beri aynıdır (eski kayıtlar ana grup olarak geçerli kalır). Alt grup kimliği "ana.alt" biçimindedir.
  // Alt grubun anahtar sözcükleri ana grubu bulmaya da katılır (4 harften kısa tek sözcükler ve "=" ile başlayanlar hariç).
  // Eşit puanda listede önce gelen alt grup seçilir; genel alt grup (örn. "Rakor ve rekor") bu yüzden sondadır.
  // Kullanıcı adları değiştirebilir, alt grup ekleyebilir (db.catEdit); ağacın kendisi kopyalanmış bir mağaza ağacı değildir.
  var TREE = [
    ['vana', 'Vana', ['vana', 'valf', 'valve', 'cekvalf', 'kuresel', 'kelebek', 'surgulu', 'klape', 'musluk vana'], [
      ['kuresel', 'Küresel vana', ['kuresel', 'ball valve', 'ball valves', 'top vana']],
      ['kelebek', 'Kelebek vana', ['kelebek', 'butterfly']],
      ['cek', 'Çek valf ve klape', ['cekvalf', 'cek valf', 'check', 'klape', 'non return', 'swing check', 'dual plate', 'duo check', 'calpara']],
      ['surgulu', 'Sürgülü (gate) vana', ['surgulu', 'gate valve', 'gate valves', 'siber']],
      ['globe', 'Glob ve köşe vana', ['globe', 'glob vana', 'angle valve', 'angle valves', 'kosegen', 'kose vana', 'screw down', 'stop valve']],
      ['hizli', 'Hızlı kapama vanası', ['quick closing', 'hizli kapama']],
      ['firtina', 'Fırtına (storm) valfi', ['storm valve', 'storm valves', 'firtina']],
      ['yangin', 'Yangın / hortum vanası', ['hose valve', 'hose valves', 'yangin vana', 'itfaiye']],
      ['emniyet', 'Emniyet ve tahliye valfi', ['emniyet valf', 'emniyet ventil', 'safety valve', 'relief', 'tahliye valf', 'pressure safety']],
      ['igne', 'İğne vana', ['igne vana', 'needle']],
      ['solenoid', 'Solenoid (elektrikli) valf', ['solenoid', 'selenoid', 'magnet valf', 'motorlu vana', 'actuator', 'aktuator']],
      ['hava', 'Hava firarı ve havalık', ['hava firar', 'air vent', 'air release', 'havalik']],
      ['kondenstop', 'Kondenstop (buhar kapanı)', ['kondenstop', 'steam trap', 'steam traps']],
      ['deniz', 'Deniz suyu alış vanası', ['kingston', 'sea cock', 'seacock', 'deniz alis', 'gemi musluk']]]],
    ['rakor', 'Rakor ve bağlantı', ['rakor', 'fitting', 'nipel', 'nipple', 'manson', 'dirsek', 'elbow', 'reduksiyon', 'reducer', 'tapa', 'rekor', 'union', 'adaptor', 'adapter', 'kaplin', 'coupling', 'te', 'tee', 'istavroz', 'ek parca'], [
      ['nipel', 'Nipel', ['nipel', 'nipple', 'ara nipel']],
      ['dirsek', 'Dirsek', ['dirsek', 'elbow', 'lule']],
      ['te', 'Te ve kruva', ['te', 'tee', 'kruva', 'dortyol', 'istavroz', 'cross']],
      ['manson', 'Manşon ve kaplin', ['manson', 'kaplin', 'coupling', 'muff']],
      ['reduksiyon', 'Redüksiyon', ['reduksiyon', 'reducer', 'orantili']],
      ['tapa', 'Tapa ve kep', ['tapa', 'plug', 'kep']],
      ['hortum', 'Hortum rakoru ve soketi', ['hortum rakor', 'hortum rekor', 'hortum soket', 'hortum ek', 'hortum uc', 'hose fitting', 'hose connector', 'hose tail', 'doner somun', 'interlok']],
      ['adaptor', 'Adaptör', ['adaptor', 'adapter']],
      ['kollektor', 'Kollektör ve dağıtıcı', ['kollektor', 'manifold', 'dagitici']],
      ['pnomatik', 'Pnömatik ve hızlı bağlantı', ['pnomatik', 'pneumatic', 'otomatik rakor', 'quick coupling', 'hizli baglanti', 'hiz ayar', 'pu nipel']],
      ['yuksuk', 'Yüksük ve miçoz', ['yuksuk', 'yuksuklu', 'micoz', 'sleeve']],
      ['perde', 'Perde geçiş', ['perde gecis', 'bulkhead']],
      ['rakor', 'Rakor ve rekor', ['rakor', 'rekor', 'union', 'konik']]]],
    ['hortum', 'Hortum', ['hortum', 'hose'], [
      ['su', 'Su hortumu', ['su hortum', 'water hose', 'seffaf hortum', 'bahce hortum']],
      ['spiral', 'Spiral ve telli hortum', ['spiral', 'telli', 'suction hose', 'emme hortum']],
      ['yakit', 'Yakıt hortumu', ['yakit hortum', 'fuel hose', 'benzin hortum', 'mazot hortum']],
      ['egzoz', 'Egzoz hortumu', ['egzoz hortum', 'exhaust hose', 'wet exhaust']],
      ['hidrolik', 'Hidrolik hortum', ['hidrolik hortum', 'hydraulic hose', 'r1', 'r2', 'teflon hortum', 'ptfe hose']],
      ['sanitasyon', 'Pis su (sanitasyon) hortumu', ['sanitasyon', 'sanitation', 'pis su hortum']],
      ['pnomatik', 'Hava ve pnömatik hortum', ['poliuretan', 'polyamid', 'polyemid', 'pu hortum', 'hava hortum', 'air hose']]]],
    ['kelepce', 'Kelepçe', ['kelepce', 'clamp'], [
      ['hortum', 'Hortum kelepçesi', ['hortum kelepce', 'hose clamp', 'sonsuz', 'ayarli hortum']],
      ['boru', 'Boru kelepçesi', ['boru kelepce', 'pipe clamp', 'u civata']],
      ['agir', 'Ağır hizmet kelepçesi', ['agir hizmet', 't civata', 't bolt']],
      ['kablo', 'Plastik kelepçe (kablo bağı)', ['kablo bag', 'cable tie', 'plastik kelepce']]]],
    ['boru', 'Boru', ['boru', 'pipe', 'tube'], [
      ['paslanmaz', 'Paslanmaz boru', ['paslanmaz boru', 'stainless pipe', 'stainless tube', 'inox boru']],
      ['celik', 'Çelik ve galvaniz boru', ['celik boru', 'galvaniz boru', 'siyah boru', 'steel pipe']],
      ['plastik', 'Plastik boru (PVC, PPR, PE)', ['pvc', 'ppr', 'pe boru', 'polietilen', 'plastik boru']],
      ['bakir', 'Bakır ve pirinç boru', ['bakir boru', 'copper', 'pirinc boru']]]],
    ['flans', 'Flanş', ['flans', 'flange'], [
      ['kor', 'Kör flanş', ['kor flans', 'blind flange', 'blind', 'kep flans']],
      ['duz', 'Düz (slip on) flanş', ['slip on', 'duz flans', 'plate flange']],
      ['boyunlu', 'Kaynak boyunlu flanş', ['kaynak boyunlu', 'weld neck', 'alin kaynakli']],
      ['sae', 'Hidrolik (SAE / CETOP) flanş', ['sae', 'cetop', 'sae flans', 'oringli flans', 'kare flans']],
      ['disli', 'Dişli flanş', ['disli flans', 'threaded flange']]]],
    ['pompa', 'Pompa', ['pompa', 'pump', 'hidrofor', 'impeller', 'santrifuj'], [
      ['sintine', 'Sintine pompası', ['=sintine', '=bilge', 'sintine pompa', 'bilge pump']],
      ['tatli', 'Tatlı su ve hidrofor', ['hidrofor', 'tatli su pompa', 'fresh water pump', 'pressure pump', 'basinc pompa']],
      ['santrifuj', 'Santrifüj ve sirkülasyon', ['santrifuj', 'centrifugal', 'sirkulasyon', 'circulation']],
      ['dalgic', 'Dalgıç pompa', ['dalgic', 'submersible']],
      ['el', 'El ve ayak pompası', ['el pompa', 'hand pump', 'ayak pompa', 'foot pump']],
      ['yakit', 'Yakıt ve yağ pompası', ['yakit pompa', 'fuel pump', 'yag pompa', 'transfer pompa']],
      ['hidrolik', 'Hidrolik pompa', ['hidrolik pompa', 'hydraulic pump', 'disli pompa', 'gear pump']],
      ['impeller', 'İmpeller ve pompa parçası', ['impeller', 'pompa tamir', 'pump kit', 'mekanik salmastra']]]],
    ['filtre', 'Filtre ve süzgeç', ['filtre', 'filitre', 'filter', 'suzgec', 'strainer', 'separator', 'membran'], [
      ['yakit', 'Yakıt filtresi ve separatör', ['yakit filtre', 'fuel filter', 'separator', 'separatorlu', 'racor']],
      ['deniz', 'Deniz suyu süzgeci', ['deniz suyu suzgec', 'sea water strainer', 'suzgec', 'strainer', 'y strainer', 'mud box', 'mud boxes', 'pislik tutucu']],
      ['yag', 'Yağ filtresi', ['yag filtre', 'oil filter']],
      ['hava', 'Hava filtresi', ['hava filtre', 'air filter']],
      ['su', 'Su arıtma', ['membran', 'aritma', 'sediment', 'karbon filtre', 'watermaker']]]],
    ['depo', 'Depo ve tank', ['depo', 'tank', 'bidon'], [
      ['su', 'Su deposu', ['su depo', 'water tank', 'plastik su']],
      ['yakit', 'Yakıt deposu', ['yakit depo', 'yakit tank', 'fuel tank']],
      ['atik', 'Pis su ve atık tankı', ['pis su', 'atik', 'waste', 'holding tank', 'siyah su']],
      ['parca', 'Depo parçası (kapak, gösterge)', ['depo kapag', 'depo rekor', 'tank kapag']]]],
    ['conta', 'Conta ve keçe', ['conta', 'gasket', 'oring', 'o-ring', 'o ring', 'kece', 'seal', 'salmastra'], [
      ['oring', 'O-ring', ['oring', 'o ring']],
      ['conta', 'Flanş ve düz conta', ['conta', 'gasket']],
      ['kece', 'Keçe ve simering', ['kece', 'seal', 'simering']],
      ['salmastra', 'Salmastra', ['salmastra', 'packing']]]],
    ['civata', 'Cıvata ve bağlantı elemanı', ['civata', 'somun', 'pul', 'vida', 'bolt', 'nut', 'screw', 'saplama', 'percin', 'dubel'], [
      ['civata', 'Cıvata', ['civata', 'bolt', 'banjo']],
      ['somun', 'Somun', ['somun', 'nut', 'nuts']],
      ['pul', 'Pul', ['pul', 'washer']],
      ['vida', 'Vida', ['vida', 'screw']],
      ['saplama', 'Saplama, perçin, dübel', ['saplama', 'percin', 'dubel', 'rivet']]]],
    ['elektrik', 'Elektrik', ['kablo', 'sigorta', 'salter', 'aku', 'battery', 'soket', 'switch', 'role', 'pano', 'invertor', 'redresor', 'fis', 'priz'], [
      ['kablo', 'Kablo', ['kablo', 'cable']],
      ['sigorta', 'Sigorta ve şalter', ['sigorta', 'salter', 'fuse', 'breaker', 'switch', 'anahtar']],
      ['aku', 'Akü', ['aku', 'battery']],
      ['sarj', 'Şarj, redresör, invertör', ['sarj', 'charger', 'redresor', 'invertor', 'inverter']],
      ['priz', 'Fiş, priz ve soket', ['fis', 'priz', 'soket']],
      ['pano', 'Pano ve röle', ['pano', 'role', 'relay']]]],
    ['aydinlatma', 'Aydınlatma', ['lamba', 'led', 'aydinlatma', 'light', 'fener', 'projektor', 'ampul', 'spot'], [
      ['seyir', 'Seyir feneri', ['seyir', 'navigation light', 'borda', 'pupa', 'silyon', 'fener']],
      ['sualti', 'Sualtı aydınlatma', ['sualti', 'underwater']],
      ['projektor', 'Projektör ve spot', ['projektor', 'spot', 'searchlight']],
      ['ic', 'İç aydınlatma ve ampul', ['ampul', 'tavan', 'led serit', 'bulb']]]],
    ['guverte', 'Güverte donanımı', ['mapa', 'koc boynuzu', 'cleat', 'baba', 'mentese', 'hinge', 'kilit', 'tutamak', 'puntel', 'vardavela', 'kapak', 'lumbuz', 'havalandirma', 'makara'], [
      ['baglama', 'Mapa, koç boynuzu, baba', ['mapa', 'koc boynuzu', 'cleat', 'baba']],
      ['kapak', 'Kapak ve lumbuz', ['kapak', 'lumbuz', 'hatch', 'porthole']],
      ['mentese', 'Menteşe, kilit, tutamak', ['mentese', 'hinge', 'kilit', 'tutamak', 'handle']],
      ['korkuluk', 'Vardavela ve puntel', ['vardavela', 'puntel', 'korkuluk', 'rail']],
      ['havalandirma', 'Havalandırma', ['havalandirma', 'vent', 'ventilator', 'air vent']],
      ['makara', 'Makara', ['makara', 'block', 'pulley']]]],
    ['demir', 'Demirleme ve halat', ['capa', 'anchor', 'zincir', 'chain', 'irgat', 'windlass', 'halat', 'rope', 'kilitli', 'firdondu'], [
      ['capa', 'Çapa', ['capa', 'anchor']],
      ['zincir', 'Zincir', ['zincir', 'chain']],
      ['irgat', 'Irgat', ['irgat', 'windlass']],
      ['halat', 'Halat', ['halat', 'rope']],
      ['kilit', 'Kilit ve fırdöndü', ['kilitli', 'firdondu', 'shackle', 'swivel']]]],
    ['sihhi', 'Banyo ve mutfak', ['batarya', 'musluk', 'lavabo', 'tuvalet', 'wc', 'dus', 'armatur', 'eviye', 'sifon', 'klozet'], [
      ['tuvalet', 'Tuvalet (WC)', ['tuvalet', 'wc', 'klozet', 'toilet']],
      ['batarya', 'Batarya ve musluk', ['batarya', 'musluk', 'armatur', 'faucet']],
      ['dus', 'Duş', ['dus', 'shower']],
      ['lavabo', 'Lavabo, eviye, sifon', ['lavabo', 'eviye', 'sifon', 'sink']]]],
    ['usturmaca', 'Usturmaca ve branda', ['usturmaca', 'fender', 'branda', 'tente', 'samandira'], [
      ['usturmaca', 'Usturmaca', ['usturmaca', 'fender']],
      ['branda', 'Branda ve tente', ['branda', 'tente', 'bimini']],
      ['samandira', 'Şamandıra', ['samandira', 'buoy']]]],
    ['emniyet', 'Can güvenliği', ['can yelegi', 'can simidi', 'yangin', 'sondurucu', 'isaret fiseg', 'ilk yardim', 'emniyet'], [
      ['yelek', 'Can yeleği ve simidi', ['can yelegi', 'can simidi', 'life jacket', 'lifebuoy']],
      ['yangin', 'Yangın söndürme', ['yangin', 'sondurucu', 'extinguisher']],
      ['isaret', 'İşaret fişeği', ['isaret fiseg', 'flare']],
      ['ilkyardim', 'İlk yardım', ['ilk yardim', 'first aid']]]],
    ['kimya', 'Boya ve kimyasal', ['boya', 'macun', 'silikon', 'yapistirici', 'yag', 'temizleyici', 'vernik', 'astar', 'zehirli', 'antifouling', 'gres'], [
      ['boya', 'Boya, astar, vernik', ['boya', 'astar', 'vernik', 'antifouling', 'zehirli']],
      ['yapistirici', 'Silikon, macun, yapıştırıcı', ['silikon', 'macun', 'yapistirici', 'sealant']],
      ['yag', 'Yağ ve gres', ['yag', 'gres', 'grease']],
      ['temizlik', 'Temizlik', ['temizleyici', 'cleaner', 'sampuan']]]],
    ['motor', 'Motor ve yürütme', ['motor', 'pervane', 'saft', 'anot', 'tutya', 'kayis', 'termostat', 'egzoz', 'buji', 'dumen', 'kumanda'], [
      ['pervane', 'Pervane ve şaft', ['pervane', 'saft', 'propeller']],
      ['anot', 'Anot (tutya)', ['anot', 'tutya', 'anode']],
      ['dumen', 'Dümen ve kumanda', ['dumen', 'kumanda', 'steering']],
      ['egzoz', 'Egzoz', ['egzoz', 'exhaust', 'susturucu']],
      ['bakim', 'Kayış, termostat, buji', ['kayis', 'termostat', 'buji', 'belt']]]],
    ['olcu', 'Ölçü ve gösterge', ['manometre', 'gosterge', 'sensor', 'termometre', 'saat', 'debimetre', 'seviye'], [
      ['manometre', 'Manometre', ['manometre', 'pressure gauge']],
      ['termometre', 'Termometre', ['termometre', 'thermometer']],
      ['seviye', 'Seviye göstergesi', ['seviye', 'level']],
      ['sensor', 'Sensör ve debimetre', ['sensor', 'debimetre', 'flow meter']]]],
    ['iklim', 'Isıtma ve soğutma', ['isitici', 'kalorifer', 'klima', 'esanjor', 'boyler', 'boiler', 'sofben', 'buzdolabi'], [
      ['isitma', 'Isıtıcı ve boyler', ['isitici', 'kalorifer', 'boyler', 'boiler', 'sofben', 'heater']],
      ['klima', 'Klima', ['klima', 'air condition']],
      ['esanjor', 'Eşanjör', ['esanjor', 'heat exchanger']],
      ['buzdolabi', 'Buzdolabı', ['buzdolabi', 'fridge', 'refrigerator']]]],
    ['hidrolik', 'Hidrolik ve pnömatik', ['hidrolik', 'hydraulic', 'pnomatik', 'pneumatic', 'silindir', 'cylinder'], [
      ['silindir', 'Silindir', ['silindir', 'cylinder', 'piston']],
      ['valf', 'Hidrolik valf ve blok', ['yon valf', 'directional', 'valf blok', 'kontrol valf']],
      ['unite', 'Hidrolik ünite ve motor', ['hidrolik unite', 'power pack', 'hidrolik motor']],
      ['pnomatik', 'Pnömatik eleman', ['pnomatik', 'pneumatic', 'susturucu', 'silencer', 'sartlandirici']]]]
  ];
  var catV = 0, treeC = null;
  function tree() {
    var ed = db.catEdit;
    if (treeC && treeC.ed === ed && treeC.v === catV) return treeC.t;
    var t = TREE.map(function (m) {
      // "=" ile başlayan sözcük yalnız alt grubu seçer, ana grubu bulmaya katılmaz (örn. "sintine" tek başına pompa demek değildir)
      var subs = m[3].map(function (s) { var id = m[0] + '.' + s[0]; return { id: id, name: ed.names[id] || s[1], kw: s[2].map(function (k) { return k.replace(/^=/, ''); }), own: s[2].filter(function (k) { return k[0] === '='; }).map(function (k) { return k.slice(1); }) }; });
      // Kullanıcının alt grubu: tam adı ana grubu bulmaya katılır, tek tek sözcükleri yalnız alt grubu seçer
      (ed.subs[m[0]] || []).forEach(function (u) { var kw = u.kw || []; subs.push({ id: u.id, name: ed.names[u.id] || u.name, kw: kw, own: kw.filter(function (k) { return k.indexOf(' ') < 0; }), user: true }); });
      var all = m[2].slice();
      subs.forEach(function (s) { s.kw.forEach(function (k) { if ((k.length >= 4 || k.indexOf(' ') >= 0) && all.indexOf(k) < 0 && (s.own || []).indexOf(k) < 0) all.push(k); }); });
      return { id: m[0], name: ed.names[m[0]] || m[1], kw: m[2], all: all, subs: subs };
    });
    treeC = { ed: ed, v: catV, t: t };
    return t;
  }
  function mainOf(id) { return String(id || '').split('.')[0]; }
  function mainNode(id) { var m = mainOf(id), t = tree(); for (var i = 0; i < t.length; i++) if (t[i].id === m) return t[i]; return null; }
  function subNode(id) { var m = mainNode(id); if (!m || id === m.id) return null; for (var i = 0; i < m.subs.length; i++) if (m.subs[i].id === id) return m.subs[i]; return null; }
  function catName(id) {
    if (!id) return 'Kategorisiz';
    var m = mainNode(id); if (!m) return id;
    var s = subNode(id); return s ? m.name + ' › ' + s.name : m.name;
  }
  function subLabel(id) { var s = subNode(id); return s ? s.name : 'Diğer ' + (mainNode(id) ? mainNode(id).name.toLocaleLowerCase('tr-TR') : ''); }
  // Sözcüklerin bir anahtar listesine puanı. Ad sözcükleri 2 kat sayılır; ek almış sözcük (kelepçesi) önek eşleşmesiyle daha çok puan alır.
  function kwScore(tk, kws) {
    var s = 0, f = Infinity;
    tk.toks.forEach(function (t, i) {
      var w = i < tk.nameN ? 2 : 1;
      kws.forEach(function (k) {
        if (k.indexOf(' ') >= 0) return;
        if (t === k) { s += 2 * w; if (i < f) f = i; }
        else if (k.length >= 4 && t.indexOf(k) === 0) { s += 3 * w; if (i < f) f = i; }
      });
    });
    kws.forEach(function (k) { if (k.indexOf(' ') >= 0 && tk.full.indexOf(k) >= 0) { s += 6; f = 0; } });
    return { s: s, f: f };
  }
  function bestSub(m, tk) {
    var best = null, bs = 0;
    m.subs.forEach(function (s) { var r = kwScore(tk, s.kw); if (r.s > bs) { bs = r.s; best = s; } });
    return best ? best.id : m.id;
  }
  // Ürün adından kategori bul. Sıra: elle öğretilen ad -> anahtar sözcükler (ana grup, sonra alt grup) -> elle öğretilen sözcükler.
  // crumb: internetten alınan üründe sitenin kategori yolu (ipucu olarak, alt başlık ağırlığında)
  function classify(name, sub, crumb) {
    var L = db.learn, fn = fold(name);
    classify.second = '';
    if (L.name[fn] && mainNode(L.name[fn])) return L.name[fn];
    var nameToks = fn.split(/[^a-z0-9]+/).filter(Boolean);
    var toks = nameToks.concat(fold(sub).split(/[^a-z0-9]+/).filter(Boolean), fold(crumb).split(/[^a-z0-9]+/).filter(Boolean));
    var tk = { toks: toks, nameN: nameToks.length, full: toks.join(' ') }, score = {}, first = {};
    tree().forEach(function (m) { var r = kwScore(tk, m.all); if (r.s) { score[m.id] = r.s; first[m.id] = r.f; } });
    if (!Object.keys(score).length) {
      // Elle öğretilen sözcükler (alt grup kimliği de olabilir)
      var lv = {};
      nameToks.forEach(function (t) { var x = L.tok[t]; if (x) Object.keys(x).forEach(function (c) { if (mainNode(c)) lv[c] = (lv[c] || 0) + x[c]; }); });
      var lb = ''; Object.keys(lv).forEach(function (c) { if (!lb || lv[c] > lv[lb]) lb = c; });
      return lb;
    }
    var best = '', second = '';
    Object.keys(score).forEach(function (c) { if (!best || score[c] > score[best] || (score[c] === score[best] && first[c] < first[best])) best = c; });
    // İkinci kategori: ürün iki gruba da giriyorsa (örn. "hortum kelepçesi" -> Kelepçe ve Hortum) ikisinde de görünür
    Object.keys(score).forEach(function (c) { if (c !== best && score[c] >= 4 && (!second || score[c] > score[second])) second = c; });
    classify.second = second ? bestSub(mainNode(second), tk) : '';
    return bestSub(mainNode(best), tk);
  }
  function autoCat(it) { it.category = classify(it.name, it.sub, it.crumb); it.cat2 = it.category ? classify.second : ''; it.catBy = 'auto'; }
  // Elle atanan kategoriyi öğren ve henüz elle atanmamış benzer ürünlere uygula.
  function setCategory(it, cat) {
    it.category = cat; it.catBy = 'user';
    var L = db.learn, fn = fold(it.name), n = 0;
    if (cat) {
      L.name[fn] = cat;
      fn.split(/[^a-z0-9]+/).filter(function (t) { return t.length >= 4 && !/\d/.test(t); }).forEach(function (t) {
        L.tok[t] = L.tok[t] || {}; L.tok[t][cat] = (L.tok[t][cat] || 0) + 1;
      });
    } else delete L.name[fn];
    Object.values(db.items).forEach(function (x) {
      if (x === it || x.catBy === 'user') return;
      var c = classify(x.name, x.sub, x.crumb); if (c && c !== x.category) { x.category = c; x.cat2 = classify.second; x.catBy = 'auto'; n++; }
    });
    return n;
  }
  // Kullanıcının ağaç düzeltmeleri: ad değiştirme, alt grup ekleme / silme
  function renameCat(id, name) {
    name = String(name || '').trim(); if (!mainNode(id)) return;
    if (name) db.catEdit.names[id] = name; else delete db.catEdit.names[id];
    catV++;
  }
  function addSubCat(mainId, name) {
    var m = mainNode(mainId); name = String(name || '').trim(); if (!m || !name) return null;
    var f = fold(name), mk = m.kw;
    var kw = [f].concat(f.split(/[^a-z0-9]+/).filter(function (t) { return t.length >= 3 && mk.indexOf(t) < 0; }));
    var u = { id: m.id + '.u' + uid().slice(0, 6), name: name, kw: kw };
    (db.catEdit.subs[m.id] = db.catEdit.subs[m.id] || []).push(u); catV++;
    return u.id;
  }
  function delSubCat(id) {
    var m = mainOf(id), list = db.catEdit.subs[m] || [];
    db.catEdit.subs[m] = list.filter(function (u) { return u.id !== id; }); delete db.catEdit.names[id]; catV++;
    var L = db.learn;
    Object.keys(L.name).forEach(function (k) { if (L.name[k] === id) L.name[k] = m; });
    Object.keys(L.tok).forEach(function (t) { if (L.tok[t][id]) { L.tok[t][m] = (L.tok[t][m] || 0) + L.tok[t][id]; delete L.tok[t][id]; } });
    Object.values(db.items).forEach(function (it) { if (it.category === id) it.category = m; if (it.cat2 === id) it.cat2 = m; });
  }
  // Elle atanmamış bütün ürünleri ağaca göre yeniden ayır (yeni sürüm, yeni alt grup)
  var TREE_VER = 2;
  function reCat() {
    var n = 0;
    Object.values(db.items).forEach(function (it) { if (it.catBy === 'user') return; var c0 = it.category, c1 = it.cat2; autoCat(it); if (it.category !== c0 || it.cat2 !== c1) n++; });
    return n;
  }
  // Kategori seçme kutusu: ana gruplar başlık, altında "genel" ve alt gruplar
  function catOptions(sel) {
    return tree().map(function (m) {
      return '<optgroup label="' + esc(m.name) + '"><option value="' + m.id + '"' + (sel === m.id ? ' selected' : '') + '>' + esc(m.name) + ' (genel)</option>' +
        m.subs.map(function (s) { return '<option value="' + s.id + '"' + (sel === s.id ? ' selected' : '') + '>' + esc(m.name + ' › ' + s.name) + '</option>'; }).join('') + '</optgroup>';
    }).join('');
  }
  // Tarifle arama için Türkçe - İngilizce eş anlamlılar (fold edilmiş)
  var SYN = [['vana', 'valf', 'valve'], ['hortum', 'hose'], ['rakor', 'fitting', 'baglanti'], ['kelepce', 'clamp'], ['pompa', 'pump'], ['flans', 'flange'],
    ['dirsek', 'elbow'], ['paslanmaz', 'inox', 'stainless', 'aisi', '316', '304'], ['pirinc', 'brass'], ['bronz', 'bronze'], ['kuresel', 'ball'], ['cekvalf', 'check', 'geri donussuz'],
    ['filtre', 'filter', 'suzgec', 'strainer'], ['conta', 'gasket', 'seal'], ['boru', 'pipe', 'tube'], ['depo', 'tank'], ['civata', 'bolt'], ['somun', 'nut'], ['vida', 'screw'],
    ['kablo', 'cable'], ['lamba', 'light', 'aydinlatma'], ['capa', 'anchor', 'demir'], ['zincir', 'chain'], ['halat', 'rope'], ['mentese', 'hinge'], ['kelebek', 'butterfly'],
    ['disli', 'threaded', 'vidali'], ['erkek', 'male'], ['disi', 'female'], ['reduksiyon', 'reducer'], ['manson', 'coupling', 'kaplin'], ['nipel', 'nipple'], ['tapa', 'plug'],
    ['plastik', 'plastic', 'pvc'], ['bakir', 'copper'], ['aluminyum', 'aluminium', 'aluminum'], ['celik', 'steel'], ['su', 'water'], ['yakit', 'fuel', 'mazot', 'dizel'], ['yag', 'oil'],
    ['hava', 'air'], ['sintine', 'bilge'], ['tuvalet', 'toilet', 'wc'], ['dus', 'shower'], ['musluk', 'batarya', 'faucet', 'tap'], ['inc', 'inch']];
  function synOf(t) {
    var out = [t];
    SYN.forEach(function (g) {
      if (g.some(function (w) { return w === t || (t.length >= 4 && (t.indexOf(w) === 0 || w.indexOf(t) === 0)); })) g.forEach(function (w) { if (out.indexOf(w) < 0) out.push(w); });
    });
    return out;
  }
  // Marka adı önerileri (kullanıcının katalog arşivindeki markalar); yalnızca yazarken öneri olarak çıkar.
  var SEED_BRANDS = ['AKT Vanalar', 'Akyüz Sulama', 'Alarko', 'AS-EL Metal', 'ASMARINE', 'Boran Krom', 'Boss Paslanmaz', 'Deniztoptan', 'Doyuk Promosyon', 'DuPont FilmTec',
    'E.C.A.', 'Elif Depo', 'Emir Metal', 'Eser Pompa', 'Fırat', 'Flowmaster Valves', 'FLOWX', 'GMORS', 'GS Marine', 'Gürgenler', 'HANSA-FLEX', 'Hisar Yapı', 'İdromar', 'Jetplas', 'Jets',
    'LMC Makina', 'Marin İstanbul', 'Marineparts.fi', 'Matromarine', 'Oceo Marine', 'Oğuz Marine', 'Opacmare', 'Ormanlar Hortum', 'Pimplast', 'Pimtaş', 'Plastherm', 'Polyhose', 'RIPPA',
    'Rushwarm', 'SEAFLO', 'Semler Industries', 'T-ISS', 'Tubend', 'Tubi Thor', 'Tuğra', 'Türlek', 'Twin Disc BCS', 'UKRA', 'Vamates', 'Waternet', 'Würth'];
  function brandNames() { var o = {}; Object.values(db.items).forEach(function (it) { if (it.brand) o[it.brand] = 1; }); return Object.keys(o).sort(function (a, b) { return a.localeCompare(b, 'tr'); }); }
  function sellerNames() { var o = {}; Object.values(db.offers).forEach(function (x) { if (x.supplier) o[x.supplier] = 1; }); return Object.keys(o).sort(function (a, b) { return a.localeCompare(b, 'tr'); }); }
  // Belgedeki iletişim bilgileri (marka / satıcı kartını kendiliğinden doldurmak için)
  var WEB_RE = /(?:https?:\/\/|www\.)[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi, MAIL_RE = /[a-z0-9._-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi,
    TEL_RE = /(?:\+90|0)[\s.(-]*\d{3}[\s.)-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/g;
  function scanContacts(text, stat) {
    var c = stat.contact = stat.contact || { web: {}, email: {}, phone: {} };
    function cnt(o, v) { o[v] = (o[v] || 0) + 1; }
    (text.match(WEB_RE) || []).forEach(function (v) { cnt(c.web, v.toLowerCase().replace(/^https?:\/\//, '')); });
    (text.match(MAIL_RE) || []).forEach(function (v) { cnt(c.email, v.toLowerCase()); });
    (text.match(TEL_RE) || []).forEach(function (v) { cnt(c.phone, v.replace(/[^\d+]/g, '')); });
  }
  function topOf(o) { var b = ''; Object.keys(o || {}).forEach(function (k) { if (!b || o[k] > o[b]) b = k; }); return b; }

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
  // Arayüz kilitlenmesin diye uzun işler arasında sıra verilir (arka planda da yavaşlamayan yöntem).
  var pauseQ = [], pauseCh = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
  if (pauseCh) pauseCh.port1.onmessage = function () { var f = pauseQ.shift(); if (f) f(); };
  function pause() {
    return new Promise(function (r) { if (pauseCh) { pauseQ.push(r); pauseCh.port2.postMessage(0); } else setTimeout(r, 0); });
  }
  // Belge parmak izi: aynı dosyanın yeniden seçildiğini tanımak için (boyut + baştan ve sondan birer parça)
  async function fingerprint(file) {
    var n = 65536, h = 2166136261, i;
    var a = new Uint8Array(await file.slice(0, n).arrayBuffer());
    var b = file.size > n ? new Uint8Array(await file.slice(Math.max(n, file.size - n)).arrayBuffer()) : [];
    for (i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 16777619); }
    for (i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 16777619); }
    return file.size + '-' + (h >>> 0).toString(36);
  }
  // PDF'i aç. Büyük dosyanın tamamı belleğe alınmaz; yalnız gereken bölümleri dosyadan parça parça okunur.
  var BIG_FILE = 8 * 1024 * 1024, pdfEngine = '';
  async function openPdf(file) {
    if (typeof pdfjsLib === 'undefined' || typeof Okuyucu === 'undefined') throw new Error('PDF okuyucu yüklenemedi.');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    var task = null;
    if (file.size > ((window.KLAVUZ_TEST || {}).big || BIG_FILE) && pdfjsLib.PDFDataRangeTransport) {
      var ranged = false;
      try { ranged = (await file.slice(file.size - 1024, file.size).arrayBuffer()).byteLength === 1024; } catch (e) { ranged = false; }
      if (ranged) {
        var tr = new pdfjsLib.PDFDataRangeTransport(file.size, null);
        tr.requestDataRange = function (begin, end) {
          file.slice(begin, end).arrayBuffer().then(function (buf) { tr.onDataRange(begin, new Uint8Array(buf)); });
        };
        task = pdfjsLib.getDocument({ range: tr, disableAutoFetch: true, disableStream: true, rangeChunkSize: 1 << 20 });
      }
    }
    if (!task) task = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
    var pdf = await task.promise;
    try { pdfEngine = task._worker && task._worker._webWorker ? 'arka plan' : 'ana'; } catch (e) { pdfEngine = ''; }
    return pdf;
  }
  // Belgenin sayfa görüntüleri (sertifika, tanıtım dosyası, tablosu çıkmayan belge)
  async function pageShots(pdf, prog) {
    var shots = [], max = Math.min(pdf.numPages, 15);
    for (var p = 1; p <= max; p++) {
      var pg = await pdf.getPage(p), vp0 = pg.getViewport({ scale: 1.4 }), c0 = document.createElement('canvas');
      c0.width = vp0.width; c0.height = vp0.height;
      await pg.render({ canvasContext: c0.getContext('2d'), viewport: vp0 }).promise;
      shots.push(c0.toDataURL('image/jpeg', 0.72));
      c0.width = c0.height = 0; pg.cleanup();
      if (prog) prog(p, max, 'sayfa görüntüsü');
      await pause();
    }
    return shots;
  }
  // PDF: her sayfadaki tablolar ürüne çevrilir; resim, yanındaki tablonun bütün satırlarına bağlanır.
  // Sertifika / onay yazıları ürün olarak okunmaz, sayfa görüntüsü olarak saklanır.
  // Sayfalar tek tek işlenir ve bırakılır; her CHUNK sayfada bir o.chunk ile ara kayıt yapılır.
  // o: { kind, force, start, stat, prog(p, n, ne), chunk(parça, sonrakiSayfa), stop() }
  var CHUNK = 20, prevPage = null; // prevPage: bir önceki sayfanın başlıkları ve resmi (teknik tablo sayfasının tanıtım sayfası)
  async function readPdf(file, o) {
    var pdf = await openPdf(file), OPS = pdfjsLib.OPS, n = pdf.numPages, stat = o.stat, p;
    prevPage = null;
    stat.pageCount = n;
    try {
      if (o.kind === 'sertifika') return { cert: true, pages: await pageShots(pdf, o.prog) };
      var cur = { rows: [], images: [] };
      var T = window.KLAVUZ_TEST || {}, CH = T.chunk || CHUNK; // KLAVUZ_TEST yalnız otomatik testlerde kullanılır
      for (p = o.start || 1; p <= n; p++) {
        if (o.stop && o.stop()) throw new Error('durduruldu');
        var page = await pdf.getPage(p), tc = await page.getTextContent();
        var items = tc.items.filter(function (i) { return i.str && i.str.trim(); }).map(function (i) {
          return { str: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, h: i.height || Math.abs(i.transform[3]) || 8 };
        });
        var text = items.map(function (i) { return i.str; }).join(' ');
        if (p === 1 && !o.force && Okuyucu.looksLikeCertificate(text + '\n', n)) return { cert: true, pages: await pageShots(pdf, o.prog) };
        stat.textLength += text.replace(/\s+/g, '').length;
        scanContacts(text, stat);
        await readPage(page, items, p, OPS, cur, stat, o.prog ? (function (pp) { return function (w) { o.prog(pp, n, w); }; })(p) : null);
        page.cleanup();
        if (o.prog) o.prog(p, n, '');
        if (p % CH === 0 || p === n) { await o.chunk(cur, p + 1); cur = { rows: [], images: [] }; }
        if (T.delay) await new Promise(function (r) { setTimeout(r, T.delay); });
        await pause();
      }
      return {};
    } finally {
      try { pdf.destroy(); } catch (e) {}
      if (window.KlavuzOcr) await KlavuzOcr.stop(); // OCR belleği her belgeden sonra bırakılır
    }
  }
  async function readPage(page, items, p, OPS, cur, stat, prog) {
    var rows = cur.rows, images = cur.images;
    var view = page.view, area = (view[2] - view[0]) * (view[3] - view[1]);
    var ops = await page.getOperatorList(), boxes = [], ctm = [1, 0, 0, 1, 0, 0], stack = [], seen = {}, curves = 0;
    for (var k = 0; k < ops.fnArray.length; k++) {
      var fn = ops.fnArray[k], a = ops.argsArray[k];
      if (fn === OPS.constructPath) { (a[0] || []).forEach(function (op) { if (op === OPS.curveTo || op === OPS.curveTo2 || op === OPS.curveTo3) curves++; }); }
      else if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = mulM(a, ctm);
      else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject || fn === OPS.paintImageXObjectRepeat) {
        var w = Math.abs(ctm[0]) + Math.abs(ctm[2]), h = Math.abs(ctm[1]) + Math.abs(ctm[3]);
        var x = Math.min(ctm[4], ctm[4] + ctm[0] + ctm[2]), y = Math.min(ctm[5], ctm[5] + ctm[1] + ctm[3]);
        var sig = [x, y, w, h].map(Math.round).join(',');
        if (Math.min(w, h) >= 38 && w * h < 0.5 * area && !seen[sig]) { seen[sig] = true; boxes.push({ id: boxes.length, x: x, y: y, w: w, h: h, name: a && a[0] }); }
      }
    }
    // Yazısı resim (taranmış) ya da çizgiye çevrilmiş sayfa: OCR ile okunur, sözcükler sayfanın yazılarına eklenir
    var ocrUsed = false;
    if (window.KlavuzOcr && !stat.ocrOff && KlavuzOcr.need(items.length, curves)) {
      try {
        if (prog) prog('OCR ile okunuyor');
        var oi = await KlavuzOcr.readPage(page, items);
        stat.ocrPages = (stat.ocrPages || 0) + 1; stat.ocrEngine = KlavuzOcr.info.engine;
        if (oi.length) {
          ocrUsed = true; items = items.concat(oi);
          var ot = oi.map(function (i) { return i.str; }).join(' ');
          stat.textLength += ot.replace(/\s+/g, '').length; scanContacts(ot, stat);
        }
      } catch (e) { stat.ocrOff = true; stat.ocrErr = (e && e.message) || String(e); }
    }
    if (items.length < 5) stat.emptyPages++;
    var res = Okuyucu.parsePage(items, boxes, p), urls = {}, inks = {}, usedPick = {};
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
      if (cv) cv.width = cv.height = 0;
    }
    res.tables.forEach(function (t) {
      // Kodu da fiyatı da olmayan tablo ürün değil, bilgi tablosudur (malzeme özellikleri, basınç çizelgesi vb.)
      // Ancak adı, resmi ve satırlarının çoğunda ölçüsü varsa ürün sayılır: fiyatsız / kodsuz kataloglar da kart olur.
      var sized = t.rows.filter(function (r) { return r.size; }).length;
      var plain = !t.hasCode && !t.hasPrice;
      // Ters tablo (modeller sütunda) ve özellik kartı kendi düzeniyle tanındığı için adı varsa ürün sayılır.
      var special = t.kind === 'ters' || t.kind === 'kart';
      if (plain && (special ? !t.name : !(t.name && !t.guess && (t.imgs || []).length && sized >= Math.max(1, t.rows.length * 0.6)))) { stat.infoTables.push({ page: p, name: t.name || '(adsız)', rows: t.rows.length }); return; }
      stat.tableCount++;
      // Resim: adaylar içinde fotoğrafı teknik çizime tercih et (çizim çoğunlukla beyazdır)
      var pick = null;
      (t.imgs || []).forEach(function (id) { if (urls[id] && (pick == null || inks[id] > inks[pick] * 1.3)) pick = id; });
      if (pick != null) usedPick[pick] = true;
      var imgUrl = pick != null ? urls[pick] : null;
      // Teknik tablo çoğunlukla ürünün tanıtım sayfasının arkasındadır: fotoğraf ve alt başlık önceki sayfadan alınır
      if (t.kind === 'ters' && prevPage && prevPage.p === p - 1) {
        if (prevPage.img && (!imgUrl || prevPage.ink > (inks[pick] || 0) * 1.3)) imgUrl = prevPage.img;
        if (!t.sub) t.sub = prevSub(t.name);
      }
      t.rows.forEach(function (r) {
        var warn = null;
        if (!t.name) warn = 'ürün adı bulunamadı';
        else if (t.guess) warn = 'ürün adı tahmin edildi';
        else if (t.hasCode && !r.code) warn = 'kod okunamadı';
        else if (t.hasPrice && r.price == null) warn = 'fiyat okunamadı';
        else if (!r.size && !r.code) warn = plain ? null : 'ölçü okunamadı';
        if (plain && !special && !r.size) return;
        // OCR'dan gelen satır her zaman elle kontrole kalır (O/0, I/1, virgül / nokta karışabilir)
        if (ocrUsed) warn = 'OCR ile okundu, kontrol edin' + (warn ? ' · ' + warn : '');
        rows.push({ code: r.code, name: t.name || ('Adsız ürün (sayfa ' + p + ')'), sub: t.sub || '',
          size: (r.size + (r.variant ? ' · ' + r.variant : '')).trim(), price: r.price, cur: r.cur,
          priceVat: r.priceVat, specs: r.specs, img: imgUrl, page: p, warn: warn });
      });
    });
    // Tablo dışında kalan, kodu ve fiyatı aynı satırda olan ürünler
    var lineRows = [], usedImg = {};
    Object.keys(usedPick).forEach(function (id) { usedImg[id] = true; });
    res.tables.forEach(function (t) { if (t.img != null) usedImg[t.img] = true; });
    res.loose.forEach(function (l) {
      var r = parseLine(l.text);
      if (r && r.code && r.price != null && r.name.length >= 3) { if (ocrUsed) r.warn = 'OCR ile okundu, kontrol edin' + (r.warn ? ' · ' + r.warn : ''); r.page = p; r.sub = ''; r.y = l.y; r.x = l.x; lineRows.push(r); rows.push(r); }
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
    var top = null;
    boxes.forEach(function (b) { if (urls[b.id] && (top == null || (inks[b.id] || 0) > (inks[top] || 0))) top = b.id; });
    prevPage = { p: p, lines: res.loose, img: top != null ? urls[top] : null, ink: top != null ? inks[top] || 0 : 0 };
  }
  // Önceki sayfada ürün adının hemen altındaki satır (örn. "RSS Serisi" altında "TEK SERPANTİNLİ BOYLER")
  function prevSub(name) {
    var f = fold(name), ls = (prevPage && prevPage.lines) || [], hit = null, best = null;
    if (!f) return '';
    ls.forEach(function (l) { if (!hit && fold(l.text) === f) hit = l; });
    if (!hit) return '';
    ls.forEach(function (l) {
      if (l.y < hit.y && hit.y - l.y < 60 && l.text.length >= 4 && l.text.length <= 60 && /[A-Za-zÇĞİÖŞÜçğıöşü]{3}/.test(l.text) && (!best || l.y > best.y)) best = l;
    });
    return best ? Okuyucu.fixI(best.text) : '';
  }
  // PDF içindeki resim nesnesini al
  function imgObject(page, name) {
    return new Promise(function (res) {
      if (!name) return res(null);
      var store = String(name).indexOf('g_') === 0 ? page.commonObjs : page.objs, done = false;
      try {
        // Sayfanın çizim listesi alındıktan sonra resim hazır olmalıdır; hazır değilse beklemeden sayfa görüntüsünden kırpılır.
        if (typeof store.has === 'function' && !store.has(name)) return res(null);
        store.get(name, function (o) { done = true; res(o || null); });
      } catch (e) { done = true; res(null); }
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
  // Excel / CSV / TXT
  async function readSheet(file) {
    var n = file.name.toLowerCase();
    if (/\.(xlsx|xls|csv|ods)$/.test(n)) {
      if (typeof XLSX === 'undefined') throw new Error('Excel okuyucu yüklenemedi.');
      var buf = await file.arrayBuffer(), wb, out = [];
      if (/\.csv$/.test(n)) {
        // CSV: Türkçe harfler bozulmasın diye yazı önce UTF-8, olmazsa Türkçe Windows (1254) olarak çözülür
        var txt; try { txt = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { txt = new TextDecoder('windows-1254').decode(buf); }
        wb = XLSX.read(txt.replace(/^\uFEFF/, ''), { type: 'string' });
      } else wb = XLSX.read(buf, { type: 'array' });
      wb.SheetNames.forEach(function (sn) {
        XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: '' }).forEach(function (r) {
          var pr = parseCells(r); if (pr) out.push(pr);
        });
      });
      return out;
    }
    return parseLines((await file.text()).split(/\r?\n/));
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
    return { ver: APP_VERSION, secs: res.secs || 0, engine: res.engine || '', file: name, supplier: supplier, kind: kind, date: today(), pages: res.pageCount || 0, emptyPages: res.emptyPages || 0, ocrPages: res.ocrPages || 0, ocrEngine: res.ocrEngine || '', ocrErr: res.ocrErr || '',
      tables: res.tableCount || 0, products: Object.keys(prod).length, withImg: Object.keys(prodImg).length, rows: rows.length,
      noPrice: noPrice, noCode: noCode, info: (res.infoTables || []).slice(0, 12), infoCount: (res.infoTables || []).length, warns: warns, samples: samples };
  }
  function reportText(rp) {
    if (!rp) return 'Bu belge için okuma raporu yok (eski sürümde yüklenmiş).';
    var out = ['Klavuz ' + rp.ver + ' · Okuma raporu · ' + rp.date, 'Belge: ' + rp.file, 'Tedarikçi: ' + rp.supplier + ' · Tür: ' + (KINDS[rp.kind] || rp.kind), '',
      'Sayfa: ' + rp.pages + (rp.emptyPages ? ' (' + rp.emptyPages + ' sayfada yazı yok)' : '') + (rp.secs ? ' · Süre: ' + rp.secs + ' sn' : '') + (rp.engine ? ' · Motor: ' + rp.engine : ''),
      (rp.ocrPages ? 'OCR ile okunan sayfa: ' + rp.ocrPages + (rp.ocrEngine ? ' (' + rp.ocrEngine + ')' : '') : 'OCR ile okunan sayfa: 0') + (rp.ocrErr ? ' · OCR çalışmadı: ' + rp.ocrErr : ''),
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
    return '<div class="kv"><span>Sayfa</span><b>' + rp.pages + (rp.emptyPages ? ' · ' + rp.emptyPages + ' yazısız' : '') + (rp.secs ? ' · ' + rp.secs + ' sn' : '') + '</b></div>' +
      (rp.ocrPages || rp.ocrErr ? '<div class="kv"><span>OCR</span><b>' + (rp.ocrPages ? rp.ocrPages + ' sayfa okundu' : '') + (rp.ocrErr ? ' çalışmadı: ' + esc(rp.ocrErr) : '') + '</b></div>' : '') +
      '<div class="kv"><span>Ürün / satır</span><b>' + rp.products + ' ürün · ' + rp.rows + ' satır</b></div>' +
      '<div class="kv"><span>Resim bulunan ürün</span><b>' + rp.withImg + ' / ' + rp.products + '</b></div>' +
      '<div class="kv"><span>Fiyatsız / kodsuz satır</span><b>' + rp.noPrice + ' / ' + rp.noCode + '</b></div>' +
      (rp.infoCount ? '<div class="kv"><span>Ürün sayılmayan bilgi tablosu</span><b>' + rp.infoCount + '</b></div>' : '') +
      (keys.length ? '<div><b>Uyarı nedenleri</b></div>' + keys.map(function (k) {
        return '<div class="why"><span class="badge b-warn">' + rp.warns[k] + ' satır</span> ' + esc(k) +
          '<div class="muted">' + rp.samples.filter(function (s) { return s.why === k; }).map(function (s) { return 's' + s.p + ' · ' + esc(s.name) + (s.code ? ' · ' + esc(s.code) : ''); }).join('<br>') + '</div></div>';
      }).join('') : '<div class="badge b-ok">Uyarı yok</div>');
  }
  // ---------- Belge sırası ----------
  // Seçilen belgeler sıraya girer ve arka planda tek tek okunur; bu sırada diğer ekranlar kullanılabilir.
  // Her parça (CHUNK sayfa) okunur okunmaz cihaza yazılır: uygulama kapanırsa okunan kısım kaybolmaz,
  // aynı dosya yeniden seçilince kaldığı sayfadan devam eder.
  // Durumlar: wait (sırada), run (okunuyor), ready (kontrol bekliyor), partial (yarım kaldı), error
  var jobs = [], running = false;
  function newStat() { return { textLength: 0, tableCount: 0, emptyPages: 0, infoTables: [], pageCount: 0, secs: 0, engine: '' }; }
  function jobMeta(j) {
    return { id: j.id, docId: j.docId, name: j.name, fp: j.fp, supplier: j.supplier, brand: j.brand || j.supplier, kind: j.kind, force: !!j.force, status: j.status,
      next: j.next, chunks: j.chunks, stat: j.stat, cert: !!j.cert, reason: j.reason || '', note: j.note || '', report: j.report || null, err: j.err || '', replaces: j.replaces || '', auto: !!j.auto };
  }
  function saveJob(j) { return storePut('draft', 'job:' + j.id, jobMeta(j)); }
  function dropJob(j) {
    for (var k = 0; k < j.chunks; k++) storeDel('draft', 'chunk:' + j.id + ':' + k);
    storeDel('draft', 'job:' + j.id);
    jobs = jobs.filter(function (x) { return x !== j; });
    if (st.jobOpen === j.id) st.jobOpen = null;
  }
  function resetJob(j) {
    for (var k = 0; k < j.chunks; k++) storeDel('draft', 'chunk:' + j.id + ':' + k);
    j.rows = []; j.images = []; j.pages = null; j.chunks = 0; j.next = 1; j.stat = newStat();
    j.cert = false; j.reason = ''; j.note = ''; j.report = null; j.err = ''; j.prog = '';
  }
  // Parçayı belleğe ekle ve cihaza yaz. Aynı resim her satırda yinelenmesin diye satırlar resmin sırasını tutar.
  async function addChunk(j, c, next) {
    var at = {}; (c.images || []).forEach(function (im, i) { if (!(im.url in at)) at[im.url] = i; });
    var packed = (c.rows || []).map(function (r) {
      if (!r.img || !(r.img in at)) return r;
      var q = Object.assign({}, r); q.ii = at[r.img]; delete q.img; return q;
    });
    (c.rows || []).forEach(function (r) { j.rows.push(r); });
    (c.images || []).forEach(function (im) { j.images.push(im); });
    if (c.pages) j.pages = c.pages;
    await storePut('draft', 'chunk:' + j.id + ':' + j.chunks, { rows: packed, images: c.images || [], pages: c.pages || null });
    j.chunks++; j.next = next || j.next;
    await saveJob(j);
  }
  // Açılışta: önceki oturumdan kalan okunmuş belgeleri geri getir
  async function loadJobs() {
    if (!idb) return;
    var all; try { all = await storeAll('draft'); } catch (e) { return; }
    Object.keys(all).forEach(function (k) {
      if (k.indexOf('job:') !== 0) return;
      var j = all[k]; j.rows = []; j.images = []; j.pages = null; j.prog = '';
      for (var i = 0; i < j.chunks; i++) {
        var c = all['chunk:' + j.id + ':' + i]; if (!c) continue;
        c.rows.forEach(function (r) { if (r.ii != null && c.images[r.ii]) { r.img = c.images[r.ii].url; } delete r.ii; j.rows.push(r); });
        c.images.forEach(function (im) { j.images.push(im); });
        if (c.pages) j.pages = c.pages;
      }
      if (j.status === 'error' || (j.status !== 'ready' && !j.chunks)) { jobs.push(j); dropJob(j); return; }
      if (j.status !== 'ready') j.status = 'partial';
      jobs.push(j);
    });
  }
  // Zip dosyası: içindeki belgeler (PDF, Excel, CSV, TXT; iç içe zip dahil) çıkarılır ve tek tek sıraya alınır. İnternet gerekmez.
  var DOC_EXT = /\.(pdf|xlsx|xls|csv|txt)$/i;
  async function unzipFiles(file, depth) {
    var out = [], size = file.size, tailN = Math.min(size, 65557);
    var tail = new Uint8Array(await file.slice(size - tailN).arrayBuffer()), dv = new DataView(tail.buffer), eo = -1;
    for (var i = tail.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break; }
    if (eo < 0) throw new Error('zip okunamadı');
    var n = dv.getUint16(eo + 10, true), cdSize = dv.getUint32(eo + 12, true), cdOff = dv.getUint32(eo + 16, true);
    if (cdOff === 0xFFFFFFFF || n === 0xFFFF) throw new Error('zip çok büyük');
    var cd = new Uint8Array(await file.slice(cdOff, cdOff + cdSize).arrayBuffer()), cv = new DataView(cd.buffer), p = 0;
    for (var k = 0; k < n && p + 46 <= cd.length; k++) {
      if (cv.getUint32(p, true) !== 0x02014b50) break;
      var flags = cv.getUint16(p + 8, true), method = cv.getUint16(p + 10, true), csize = cv.getUint32(p + 20, true), usize = cv.getUint32(p + 24, true);
      var nl = cv.getUint16(p + 28, true), el = cv.getUint16(p + 30, true), cl = cv.getUint16(p + 32, true), lo = cv.getUint32(p + 42, true);
      var nb = cd.subarray(p + 46, p + 46 + nl), name;
      try { name = new TextDecoder('utf-8', { fatal: true }).decode(nb); } catch (e) { try { name = new TextDecoder('windows-1254').decode(nb); } catch (e2) { name = 'belge-' + k; } }
      p += 46 + nl + el + cl;
      var base = name.split('/').pop(), isZip = /\.zip$/i.test(base);
      if (!base || /(^|\/)__MACOSX\//.test(name) || base.charAt(0) === '.' || (flags & 1)) continue;
      if (!(DOC_EXT.test(base) || (isZip && !depth)) || usize > 400 * 1024 * 1024) continue;
      var lh = new DataView(await file.slice(lo, lo + 30).arrayBuffer());
      var ds = lo + 30 + lh.getUint16(26, true) + lh.getUint16(28, true), raw = file.slice(ds, ds + csize), blob = null;
      if (method === 0) blob = raw;
      else if (method === 8 && typeof DecompressionStream !== 'undefined') blob = await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
      if (!blob) continue;
      var f = new File([blob], base, { type: /\.pdf$/i.test(base) ? 'application/pdf' : '', lastModified: file.lastModified });
      if (isZip) { try { out = out.concat(await unzipFiles(f, 1)); } catch (e3) {} } else out.push(f);
    }
    return out;
  }
  async function expandZips(files) {
    var out = [];
    for (var i = 0; i < files.length; i++) {
      if (!/\.zip$/i.test(files[i].name)) { out.push(files[i]); continue; }
      try {
        toast(files[i].name + ' açılıyor...');
        var inner = await unzipFiles(files[i], 0);
        if (!inner.length) toast(files[i].name + ': içinde okunabilir belge yok (PDF, Excel, CSV, TXT).');
        else toast(files[i].name + ': ' + inner.length + ' belge sıraya alındı');
        out = out.concat(inner);
      } catch (e) { toast(files[i].name + ' açılamadı: ' + e.message); }
    }
    return out;
  }
  async function enqueue(files, brand, supplier, kind) {
    files = await expandZips(files);
    for (var i = 0; i < files.length; i++) {
      var file = files[i], fp = '';
      try { fp = await fingerprint(file); } catch (e) { fp = file.name + '-' + file.size; }
      var same = jobs.filter(function (x) { return x.fp === fp; })[0];
      if (same && same.status === 'partial') { same.file = file; same.status = 'wait'; same.prog = 'Kaldığı yerden devam edecek (sayfa ' + same.next + ')'; continue; }
      if (same && same.status === 'error') dropJob(same);
      else if (same) { toast(file.name + ' zaten sırada'); continue; }
      // Daha önce yüklenmiş belge yeniden seçilirse soru sorulmaz: yeni becerilerle baştan okunur ve eski okumanın yerine geçer.
      var dup = db.docs.filter(function (d) { return d.fp ? d.fp === fp : d.name === file.name; })[0];
      jobs.push({ id: uid(), docId: uid(), name: file.name, fp: fp, file: file, supplier: dup ? dup.supplier : supplier, brand: dup ? (dup.brand || dup.supplier) : brand,
        kind: dup && dup.kind !== 'sertifika' ? dup.kind : kind, force: false, status: 'wait',
        next: 1, chunks: 0, stat: newStat(), rows: [], images: [], pages: null, prog: dup ? 'Yeniden okunacak' : '', replaces: dup ? dup.id : '', auto: !!dup });
    }
    drawJobs(); pump();
  }
  async function pump() {
    if (running) return;
    var j = jobs.filter(function (x) { return x.status === 'wait' && x.file; })[0];
    if (!j) return;
    running = true; j.status = 'run'; j.stop = false; drawJobs();
    try { await runJob(j); }
    catch (err) {
      if (j.stop) { dropJob(j); j = null; }
      else {
        j.status = 'error'; j.err = (err && err.message) || String(err);
        // Telefonun dosya izni okuma sırasında kesildi (çoğunlukla Drive'dan seçilen büyük dosya)
        if ((err && (err.name === 'NotFoundError' || err.name === 'NotReadableError')) || /could not be found|could not be read/i.test(j.err)) j.err = 'Dosyaya okuma sırasında ulaşılamadı. Dosyayı yeniden seçin; sorun sürerse önce telefona indirip oradan seçin.';
        await saveJob(j);
      }
    }
    running = false;
    if (j && j.status === 'ready') {
      var oldDoc = j.replaces && db.docs.filter(function (x) { return x.id === j.replaces; })[0];
      // Yeniden okuma kendiliğinden kaydedilir. Tek istisna: eskiden ürün okunan belgeden bu kez ürün çıkmadıysa karar kullanıcıya kalır.
      if (j.auto && !(j.cert && oldDoc && oldDoc.kind !== 'sertifika')) { var rr = saveJobDraft(j); toast('Yeniden okundu: ' + j.name + ' · ' + (rr.cert ? 'belge' : rr.created + ' yeni, ' + rr.updated + ' güncellendi')); if (st.tab === 'katalog' && !st.item) render(true); }
      else toast('Okundu: ' + j.name + '. Belge sekmesinde kontrol edip kaydedin.');
    }
    drawJobs(); pump();
  }
  async function runJob(j) {
    var t0 = Date.now(), f = j.file, isPdf = /\.pdf$/i.test(j.name), r = {};
    // Kalan süre: bu oturumda okunan sayfaların ortalamasından (uzun OCR okumasında uygulama donmuş sanılmasın)
    var pt0 = Date.now(), pp0 = null;
    var prog = function (p, n, what) {
      if (pp0 == null) pp0 = p;
      var done = p - pp0, left = n - p, eta = '';
      if (done >= 2 && left > 0) {
        var m = Math.round((Date.now() - pt0) / done * left / 60000);
        if (m >= 1) eta = ' · yaklaşık ' + (m >= 60 ? Math.floor(m / 60) + ' sa ' + (m % 60) + ' dk' : m + ' dk') + ' kaldı';
      }
      j.prog = 'Sayfa ' + p + ' / ' + n + (what ? ' (' + what + ')' : '') + eta; j.pct = Math.round(100 * p / n); drawJobs(true);
    };
    await saveJob(j);
    if (isPdf) {
      r = await readPdf(f, { kind: j.kind, force: j.force, start: j.next, stat: j.stat, prog: prog,
        chunk: function (c, next) { return addChunk(j, c, next); }, stop: function () { return j.stop; } });
      j.stat.engine = pdfEngine;
    } else {
      j.prog = 'Okunuyor...'; drawJobs(true);
      await addChunk(j, { rows: await readSheet(f), images: [] }, 1);
      j.stat.textLength = 1;
    }
    if (!r.cert && !j.rows.length && isPdf) {
      // Ürün tablosu çıkmayan belge (tanıtım dosyası, taranmış katalog, tabloları resim olan katalog):
      // kaybolmasın diye sayfa görüntüsü olarak saklanabilir.
      j.reason = j.stat.textLength < 20 ? 'Belgede yazı yok: sayfalar taranmış resim. Ürünler okunamadı.' :
        'Ürün tablosu bulunamadı. Bu bir tanıtım dosyası olabilir ya da tabloları resim olarak duruyor olabilir.';
      j.prog = 'Sayfa görüntüleri hazırlanıyor...'; drawJobs(true);
      r = await readPdf(f, { kind: 'sertifika', stat: newStat(), prog: prog });
    }
    j.stat.secs += Math.round((Date.now() - t0) / 1000);
    if (r.cert) { j.cert = true; await addChunk(j, { pages: r.pages }, j.next); }
    else if (!j.rows.length) throw new Error('Belgede ürün satırı bulunamadı.');
    else {
      prepDraft(j.rows);
      j.note = (j.stat.ocrPages ? j.stat.ocrPages + ' sayfa OCR ile okundu; bu satırları kontrol edin. ' : '') +
        (j.stat.emptyPages ? j.stat.emptyPages + ' sayfada yazı bulunamadı; o sayfalar okunamadı.' : '') + (j.stat.ocrErr ? ' OCR çalışmadı: ' + j.stat.ocrErr : '');
      j.report = buildReport(j.name, j.supplier, j.kind, j.stat, j.rows);
    }
    j.status = 'ready'; j.prog = '';
    await saveJob(j);
  }
  function saveJobDraft(j) {
    var r = { rows: j.rows, images: j.images, pages: j.pages, cert: j.cert, supplier: j.supplier, brand: j.brand || j.supplier, contact: j.stat && j.stat.contact, kind: j.cert ? 'sertifika' : j.kind,
      name: j.name, docId: j.docId, report: j.report, fp: j.fp }, old = j.replaces && db.docs.some(function (x) { return x.id === j.replaces; }) ? j.replaces : '';
    r = old ? recommit(r, old) : commit(r);
    // Belgenin aslını sakla: sonraki sürümlerde dosyayı yeniden seçmeden baştan okunabilsin
    var doc = db.docs.filter(function (x) { return x.id === j.docId; })[0];
    if (doc && j.file && j.file.size <= KEEP_MAX && idb) { doc.hasFile = true; storePut('file', j.docId, j.file).then(function (ok) { if (!ok) { doc.hasFile = false; save(); } }); }
    if (!r.cert) { var ac = autoCheck(); r.fixed = ac.fixed; r.ver = ac.ver; }
    save();
    dropJob(j);
    return r;
  }
  function jobsHtml() {
    var ready = jobs.filter(function (j) { return j.status === 'ready'; });
    var h = jobs.map(function (j) {
      var who = esc(j.brand || j.supplier) + (j.brand && j.brand !== j.supplier ? ' · satıcı ' + esc(j.supplier) : '');
      var head = '<b>' + esc(j.name) + '</b><div class="muted">' + who + ' · ' + (KINDS[j.kind] || j.kind) + '</div>';
      if (j.status === 'wait') return '<div class="card job"><div class="row"><span>' + head + '<div class="muted">Sırada' + (j.prog ? ' · ' + esc(j.prog) : '') + '</div></span><button class="link danger-text" data-act="jobdel" data-id="' + j.id + '">Çıkar</button></div></div>';
      if (j.status === 'run') return '<div class="card job"><div class="row"><span>' + head + '<div class="muted">Okunuyor · ' + esc(j.prog || 'başlıyor') + (j.rows.length ? ' · ' + j.rows.length + ' satır' : '') + '</div></span><button class="link danger-text" data-act="jobstop" data-id="' + j.id + '">Durdur</button></div>' +
        '<div class="bar"><i style="width:' + (j.pct || 0) + '%"></i></div><div class="muted">Bu sırada diğer ekranları kullanabilirsiniz.</div></div>';
      if (j.status === 'partial') return '<div class="card job"><div class="row"><span>' + head + '<div class="internal">Yarım kaldı: ' + (j.next - 1) + ' / ' + (j.stat.pageCount || '?') + ' sayfa okundu, okunan kısım saklandı. Devam etmek için aynı dosyayı yeniden seçip "Belgeleri oku" düğmesine basın.</div></span><button class="link danger-text" data-act="jobdel" data-id="' + j.id + '">Sil</button></div></div>';
      if (j.status === 'error') return '<div class="card job"><div class="row"><span>' + head + '<div class="internal">Okunamadı: ' + esc(j.err) + '</div></span><button class="link danger-text" data-act="jobdel" data-id="' + j.id + '">Sil</button></div></div>';
      var open = st.jobOpen === j.id;
      if (j.cert) {
        var pg = j.pages || [];
        return '<div class="card job"><h3>Kontrol: ' + esc(j.name) + '</h3><div class="muted">' + who + '</div>' +
          '<div class="internal">' + (j.reason ? esc(j.reason) + ' İsterseniz ' : 'Bu belge sertifika / onay yazısı olarak tanındı. Ürün okunmadı; ') + pg.length + ' sayfa belge olarak saklanacak ve Belgeler listesinden açılabilecek.</div>' +
          (open && pg[0] ? '<img class="certprev" alt="" src="' + pg[0] + '">' : '') +
          '<div class="row"><button class="primary" data-act="save" data-id="' + j.id + '">Belge olarak kaydet</button>' +
          '<button class="ghost" data-act="jobopen" data-id="' + j.id + '">' + (open ? 'Gizle' : 'Önizle') + '</button>' +
          (j.reason || !j.file ? '' : '<button class="ghost" data-act="readforce" data-id="' + j.id + '">Ürün olarak oku</button>') +
          '<button class="ghost" data-act="jobdel" data-id="' + j.id + '">İptal</button></div></div>';
      }
      var rp = j.report || {}, warn = Object.keys(rp.warns || {}).reduce(function (a, k) { return a + rp.warns[k]; }, 0);
      return '<div class="card job"><h3>Kontrol: ' + esc(j.name) + '</h3>' +
        '<div class="muted">' + who + ' · ' + (rp.products || 0) + ' ürün, ' + j.rows.length + ' satır okundu. ' + (rp.withImg || 0) + ' ürüne resim bulundu, ' + warn + ' satır kontrol gerektiriyor.</div>' +
        (j.note ? '<div class="internal">' + esc(j.note) + '</div>' : '') +
        (open ? '<div class="report">' + reportHtml(j.report) + '<div class="row"><button class="soft" data-act="repshare" data-id="' + j.id + '">Okuma raporunu paylaş</button><button class="soft" data-act="repcopy" data-id="' + j.id + '">Kopyala</button></div></div>' +
          '<div class="scroll"><table><tr><th></th><th>Ürün</th><th>Kod</th><th>Ölçü</th><th>Fiyat</th><th>Not</th></tr>' +
          j.rows.slice(0, 300).map(function (r) {
            return '<tr><td>' + (r.img ? '<img class="mini" alt="" src="' + r.img + '">' : '') + '</td><td>' + esc(r.name) + (r.sub ? '<div class="muted">' + esc(r.sub) + '</div>' : '') + '</td><td>' + esc(r.code || '—') + '</td><td>' + esc(r.size) + '</td><td>' + fmtC(r.price, r.cur) + '</td><td>' + (r.warn ? '<span class="badge b-warn">' + esc(r.warn) + '</span>' : '') + '</td></tr>';
          }).join('') + '</table></div>' +
          (j.rows.length > 300 ? '<div class="muted">İlk 300 satır gösteriliyor, hepsi kaydedilecek.</div>' : '') : '') +
        '<div class="row"><button class="primary" data-act="save" data-id="' + j.id + '">Kaydet</button>' +
        '<button class="ghost" data-act="jobopen" data-id="' + j.id + '">' + (open ? 'Gizle' : 'Ayrıntı') + '</button>' +
        '<button class="ghost" data-act="jobdel" data-id="' + j.id + '">İptal</button></div></div>';
    }).join('');
    if (ready.length > 1) h += '<div class="row"><button class="primary" data-act="saveall">Hazır ' + ready.length + ' belgenin hepsini kaydet</button></div>';
    return h;
  }
  // Okuma durumu şeridi (her sayfada görünür) ve Belge sekmesindeki sıra; ekranın geri kalanına dokunmaz.
  function drawStrip() {
    var el = $('#strip'); if (!el) return;
    var run = jobs.filter(function (j) { return j.status === 'run'; })[0];
    var wait = jobs.filter(function (j) { return j.status === 'wait'; }).length, ready = jobs.filter(function (j) { return j.status === 'ready'; }).length;
    var t = '';
    if (saveBad) t = 'Kayıt yapılamıyor. Yedek alın.';
    else if (run) t = 'Okunuyor: ' + run.name + (run.prog ? ' · ' + run.prog : '') + (wait ? ' · sırada ' + wait : '');
    else if (ready) t = ready + ' belge okundu, kontrol bekliyor';
    el.textContent = t; el.className = t ? (saveBad ? 'show bad' : 'show') : '';
  }
  function drawJobs(light) {
    drawStrip();
    var el = $('#jobs'); if (!el) return;
    // Okuma sürerken yalnız ilerleme satırı değişir; açık ayrıntı tablosu yeniden çizilmez
    if (light && st.jobOpen) { var b = el.querySelector('.bar i'); if (b) { var r = jobs.filter(function (j) { return j.status === 'run'; })[0]; if (r) b.style.width = (r.pct || 0) + '%'; } return; }
    el.innerHTML = jobsHtml();
  }

  // ---------- Otomatik kontrol ----------
  // Kontrol gerektiren kayıtları sistem kendisi ayıklar: nedeni ortadan kalkmış ya da başka bilgiyle
  // doğrulanabilen uyarılar kapatılır; uyarısı kalmayan ürünler "otomatik doğrulandı" olur.
  // Gerçekten belirsiz kalanlar (ad bulunamadı, kod ya da fiyat okunamadı) elle kontrole bırakılır.
  function autoCheck() {
    var docPrice = {}, docCode = {}, keyDocs = {}, fixed = 0, ver = 0;
    Object.values(db.offers).forEach(function (o) {
      if (o.listPrice != null) docPrice[o.docId] = true;
      if (o.key) { docCode[o.docId] = true; (keyDocs[o.key] = keyDocs[o.key] || {})[o.supplier] = 1; }
    });
    Object.values(db.offers).forEach(function (o) {
      if (o.status !== 'check') return;
      var it = db.items[o.itemId]; if (!it) return;
      var w = o.why || '', sib = offersOf(it.id), ok = false;
      if (/OCR/.test(w)) return; // OCR ile okunan satır kendiliğinden doğrulanmaz
      if (/iki kez/.test(w)) ok = true; // aynı kodlu satırlar kaydederken zaten tek teklifte birleşti
      else if (/I\/L\/1/.test(w)) {
        // Kodun başı aynı üründeki diğer kodlarla aynı kalıptaysa ya da kod başka satıcıda da geçiyorsa doğrudur
        var pre = o.key.slice(0, 3);
        ok = sib.filter(function (x) { return x !== o && x.key && x.key.slice(0, 3) === pre; }).length >= 2 || Object.keys(keyDocs[o.key] || {}).length > 1;
      }
      else if (/^fiyat yok/.test(w)) ok = !docPrice[o.docId]; // belgede hiç fiyat yok: fiyatsız katalog
      else if (/^kod yok/.test(w)) ok = !docCode[o.docId] && !!it.name; // belgede hiç kod yok: kodsuz liste
      else if (/tahmin edildi/.test(w)) ok = !!classify(it.name, it.sub); // tahmin edilen ad bilinen bir ürün türü
      else if (/ölçü okunamadı/.test(w)) ok = sib.length === 1 || !!o.key;
      // Fiyatlı listede o satırın fiyatı boş bırakılmış (ya da yıldızlı): okuma hatası değil, fiyatsız seçenek
      else if (/fiyat okunamadı/.test(w)) ok = o.listPrice == null && (!!o.key || !!o.size);
      // Kodlu tabloda kodu boş satır: ölçüsü ve fiyatı okunduysa kodsuz seçenek
      else if (/kod okunamadı/.test(w)) ok = !o.key && !!o.size && o.listPrice != null;
      else if (!w) ok = !!o.key && it.name.length >= 3; // eski sürümden kalan, nedeni yazılmamış uyarı
      if (ok) { o.status = 'ok'; o.autoFix = w || 'eski uyarı'; o.why = ''; fixed++; }
    });
    touch();
    Object.values(db.items).forEach(function (it) {
      if (it.verified) return;
      var offs = offersOf(it.id);
      if (offs.length && it.name && it.name.length >= 3 && !/^Adsız ürün/.test(it.name) && !offs.some(function (o) { return o.status === 'check'; })) { it.verified = true; it.autoVer = true; ver++; }
    });
    return { fixed: fixed, ver: ver };
  }
  // ---------- Belgeyi yeniden okuma ----------
  // Yeni sürümün becerileriyle eski belge baştan okunur. Eski okumadan gelen kayıtlar yenileriyle değiştirilir;
  // elle doğrulanan ürünler, özel satış fiyatı, iskonto, sepet, fiyat geçmişi, not ve elle atanan kategori korunur.
  var KEEP_MAX = 25 * 1024 * 1024; // bundan küçük belgelerin aslı cihazda saklanır (yeniden okuma için)
  function offerSig(o, it) { return o.supplier + '|' + (o.key || (fold(it ? it.name : '') + '|' + fold(o.size))); }
  function recommit(d, oldId) {
    var keep = {}, userItems = {};
    Object.values(db.offers).forEach(function (o) {
      if (o.docId !== oldId) return;
      var it = db.items[o.itemId];
      keep[offerSig(o, it)] = { id: o.id, sell: o.sellPrice !== o.listPrice ? o.sellPrice : undefined, disc: o.supDisc || 0,
        note: it && it.note, cat: it && it.catBy === 'user' ? [it.category, it.cat2] : null, img: it && it.hasImg ? it.id : null };
      if (it && it.verified && !it.autoVer) { userItems[it.id] = true; return; } // elle doğrulanan ürün olduğu gibi kalır, yalnız güncellenir
      delete db.offers[o.id];
    });
    touch();
    Object.keys(db.items).forEach(function (id) { if (!userItems[id] && !offersOf(id).length) { kvDel('item:' + id); delete db.items[id]; } });
    db.docs = db.docs.filter(function (x) { return x.id !== oldId; });
    kvDel('doc:' + oldId); kvDel('pages:' + oldId); storeDel('file', oldId);
    touch();
    var res = commit(d), map = {};
    Object.values(db.offers).forEach(function (o) {
      var it = db.items[o.itemId], k;
      if (o.docId === oldId) { o.docId = d.docId; return; } // korunup yeni okumada bulunamayan teklif
      if (o.docId !== d.docId || !(k = keep[offerSig(o, it)])) return;
      map[k.id] = o.id;
      if (k.sell !== undefined) o.sellPrice = k.sell;
      if (k.disc) o.supDisc = k.disc;
      if (it && k.note && !it.note) it.note = k.note;
      if (it && k.cat) { it.category = k.cat[0]; it.cat2 = k.cat[1] || ''; it.catBy = 'user'; }
    });
    db.history.forEach(function (h) { if (map[h.offerId]) h.offerId = map[h.offerId]; });
    db.cart.forEach(function (l) { if (map[l.offerId]) l.offerId = map[l.offerId]; });
    db.cart = db.cart.filter(function (l) { return db.offers[l.offerId]; });
    save();
    return res;
  }
  // Aslı saklanan belgeleri sıraya koy (hepsi ya da biri)
  async function reread(ids) {
    var n = 0;
    for (var i = 0; i < ids.length; i++) {
      var d = db.docs.filter(function (x) { return x.id === ids[i]; })[0]; if (!d || !d.hasFile) continue;
      if (jobs.some(function (j) { return j.replaces === d.id; })) continue;
      var blob = await storeGet('file', d.id); if (!blob) { d.hasFile = false; continue; }
      var file; try { file = new File([blob], d.name, { type: blob.type }); } catch (e) { file = blob; file.name = d.name; }
      jobs.push({ id: uid(), docId: uid(), name: d.name, fp: d.fp || '', file: file, supplier: d.supplier, brand: d.brand || d.supplier, kind: d.kind === 'sertifika' ? 'katalog' : d.kind,
        force: false, status: 'wait', next: 1, chunks: 0, stat: newStat(), rows: [], images: [], pages: null, prog: 'Yeniden okunacak', replaces: d.id, auto: true });
      n++;
    }
    toast(n ? n + ' belge yeniden okuma sırasına alındı' : 'Yeniden okunacak belge yok (aslı saklanan belge bulunamadı)');
    drawJobs(); pump();
  }

  // Belgeyi veritabanına işle
  // - Aynı tedarikçi + aynı kod: teklifi günceller, fiyat değiştiyse geçmişe yazar
  // - Aynı tedarikçi + aynı ürün adı: aynı ürün kartına yeni varyant (ölçü/kod) olarak ekler
  // - Yeni ürün: yeni kart oluşturur
  function commit(d) {
    var rows = d.rows, supplier = d.supplier, brand = d.brand || d.supplier, kind = d.kind, docName = d.name, docId = d.docId;
    profileFill(brand, supplier, kind, d.contact);
    var res = { created: 0, updated: 0, changed: 0, pending: 0 };
    if (d.cert) {
      kvPut('pages:' + docId, d.pages);
      db.docs.push({ id: docId, name: docName, supplier: supplier, kind: 'sertifika', date: today(), count: d.pages.length, fp: d.fp || '', brand: brand });
      save(); res.cert = true; return res;
    }
    // Hızlı eşleştirme için dizinler (her satırda bütün kayıtları taramamak için)
    var byKey = {}, byName = {}, noKey = {};
    Object.values(db.offers).forEach(function (o) {
      if (o.supplier !== supplier) return;
      if (o.key) { if (!byKey[o.key]) byKey[o.key] = o; }
      else { var nk = o.itemId + '|' + fold(o.size); if (!noKey[nk]) noKey[nk] = o; }
    });
    Object.values(db.items).forEach(function (it) {
      if (it.brand !== brand) return;
      var k = fold(it.name) + '|' + fold(it.sub); if (!byName[k]) byName[k] = it;
    });
    // Aynı markanın ürünü başka satıcıdan gelirse aynı karta eklenir: marka + kod eşleşmesi.
    // Fiyat listesinde marka bilinmiyorsa kod bütün markalarda aranır; tek ürüne denk geliyorsa o karta eklenir.
    var brandKey = {}, anyKey = {};
    Object.values(db.offers).forEach(function (o) {
      var it = db.items[o.itemId]; if (!o.key || !it) return;
      if (it.brand === brand && !brandKey[o.key]) brandKey[o.key] = it;
      if (!(o.key in anyKey)) anyKey[o.key] = it; else if (anyKey[o.key] !== it) anyKey[o.key] = null;
    });
    rows.forEach(function (r) {
      var key = codeKey(r.code);
      var off = key ? (byKey[key] || null) : null;
      var nm = fold(r.name), sb = fold(r.sub);
      var known = !off && key ? (brandKey[key] || (kind === 'fiyat' ? anyKey[key] : null) || null) : null;
      var item = off ? db.items[off.itemId] : (known || (nm ? (byName[nm + '|' + sb] || null) : null));
      // Kodu olmayan fiyat listeleri: aynı ürün + aynı ölçü aynı tekliftir
      if (!off && !key && item) off = noKey[item.id + '|' + fold(r.size)] || null;
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
      var pendingFlag = kind === 'fiyat' && !!key && !known;
      if (!item) {
        item = { id: uid(), name: r.name || r.code || 'İsimsiz ürün', sub: r.sub || '', brand: brand, category: '', catBy: 'auto', note: '', verified: false, hasImg: false };
        autoCat(item);
        db.items[item.id] = item;
        if (nm) byName[nm + '|' + sb] = item;
      }
      if (r.img) attachImg(item, r.img);
      var o = { id: uid(), itemId: item.id, supplier: supplier, code: r.code || '', key: key, size: r.size || '', specs: r.specs || '',
        listPrice: r.price, priceVat: r.priceVat == null ? null : r.priceVat, cur: r.cur || 'TL', supDisc: 0, sellPrice: r.price, lastDir: null,
        status: r.warn ? 'check' : (pendingFlag ? 'pending' : 'ok'), why: r.warn || '', updated: today(), docId: docId };
      db.offers[o.id] = o; res.created++;
      if (key) { byKey[key] = o; if (!brandKey[key]) brandKey[key] = item; } else noKey[item.id + '|' + fold(o.size)] = o;
      if (pendingFlag) res.pending++;
    });
    if (d.images && d.images.length) kvPut('doc:' + docId, d.images.map(function (im) { return { page: im.page, url: im.url }; }));
    db.docs.push({ id: docId, name: docName, supplier: supplier, kind: kind, date: today(), count: rows.length, report: d.report || null, fp: d.fp || '', brand: brand });
    save();
    return res;
  }
  // Marka ve satıcı kartlarını oluştur; belgeden bulunan iletişim bilgileriyle boş alanları doldur.
  // Ana katalogdaki bilgiler markaya, fiyat listesindekiler satıcıya aittir.
  function profileFill(brand, supplier, kind, contact) {
    var bp = db.brands[brand] = db.brands[brand] || {}, sp = db.sellers[supplier] = db.sellers[supplier] || {};
    if (!contact) return;
    var tgt = brand === supplier ? [bp, sp] : (kind === 'fiyat' ? [sp] : [bp]);
    tgt.forEach(function (t) { ['web', 'email', 'phone'].forEach(function (f) { var v = topOf(contact[f]); if (!t[f] && v) { t[f] = v; t.auto = true; } }); });
  }
  function attachImg(item, url) {
    if (!item || item.hasImg) return;
    item.hasImg = true; kvPut('item:' + item.id, url);
  }
  function deleteDoc(docId) {
    Object.values(db.offers).forEach(function (o) { if (o.docId === docId) delete db.offers[o.id]; });
    touch();
    Object.keys(db.items).forEach(function (id) {
      if (!offersOf(id).length) { kvDel('item:' + id); delete db.items[id]; }
    });
    db.docs = db.docs.filter(function (d) { return d.id !== docId; });
    kvDel('doc:' + docId); kvDel('pages:' + docId); kvDel('cover:' + docId); storeDel('file', docId);
    db.cart = db.cart.filter(function (l) { return db.offers[l.offerId]; });
    save();
  }

  // ---------- Arama ----------
  // Ürünün aranabilir metni (ad, açıklama, marka, kategori, kodlar, ölçüler, özellikler, satıcılar)
  var sIdx = {};
  function searchText(it) {
    if (sIdx[it.id] == null) {
      sIdx[it.id] = fold([it.name, it.sub, it.brand, catName(it.category), it.cat2 ? catName(it.cat2) : ''].concat(offersOf(it.id).map(function (o) { return [o.code, o.size, o.specs, o.supplier].join(' '); })).join(' '));
    }
    return sIdx[it.id];
  }
  // Arama: tam ifade, kod (yazım farkına dayanıklı) ya da tarif.
  // Tarifte her sözcük ayrı aranır; Türkçe - İngilizce eş anlamlılar da sayılır ("paslanmaz küresel vana 1/2").
  function matchItem(it, q) {
    if (!q) return true;
    var txt = searchText(it), fq = fold(q);
    if (txt.indexOf(fq) >= 0) return true;
    var qk = codeKey(q), qc = confKey(q);
    if (offersOf(it.id).some(function (o) { return (qk && codeKey(o.code).indexOf(qk) >= 0) || (qc && confKey(o.code).indexOf(qc) >= 0); })) return true;
    var toks = fq.split(' ').filter(Boolean);
    return toks.length > 1 || (toks.length === 1 && synOf(toks[0]).length > 1) ? toks.every(function (t) { return synOf(t).some(function (x) { return txt.indexOf(x) >= 0; }); }) : false;
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
    if (it.verified) b += '<span class="badge b-ok">' + (it.autoVer ? '✓ Otomatik doğrulandı' : '✓ Doğrulandı') + '</span>';
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
      '<div class="ptxt"><b class="pname">' + esc(it.name) + '</b>' +
      (it.sub ? '<div class="muted clamp1">' + esc(it.sub) + '</div>' : '') +
      '<div class="muted clamp1">' + esc(sup) + (codes ? ' · ' + esc(codes) : '') + '</div>' +
      (sizes ? '<div class="muted clamp2">Ölçü: ' + esc(sizes) + '</div>' : '') +
      '<div class="price">' + (best ? (offs.length > 1 ? '<small>Başlangıç</small> ' : '') + fmtC(best.sellPrice, best.cur) : '<span class="nop">Fiyat yok</span>') + '</div>' +
      '<div class="pbadges">' + badgesOf(it, offs) + '</div></div></div>';
  }
  // Küçük kart: yatay kaydırmalı şeritlerde (son eklenenler, benzer ürünler)
  function miniCard(it, o, note) {
    var offs = offersOf(it.id), best = o || offs.filter(function (x) { return x.sellPrice != null; }).sort(function (a, b) { return a.sellPrice - b.sellPrice; })[0];
    return '<button class="mini" data-act="openitem" data-id="' + it.id + '">' + thumb(it) + '<b>' + esc(it.name) + '</b><small>' + esc(note || it.brand || '') + '</small>' +
      '<span class="price">' + (best && best.sellPrice != null ? fmtC(best.sellPrice, best.cur) : '') + '</span></button>';
  }
  // Gruplama: kategori, marka, satıcı ya da belgeye göre. Bir ürün birden çok satıcı / belge grubunda olabilir.
  var DIMS = [['kat', 'Kategori'], ['marka', 'Marka'], ['satici', 'Satıcı'], ['belge', 'Belge']];
  function groupsOf(it) {
    if (st.dim === 'kat') { var m1 = mainOf(it.category), m2 = mainOf(it.cat2); return m2 && m2 !== m1 ? [m1, m2] : [m1]; }
    if (st.dim === 'marka') return [it.brand || ''];
    var o = {}; offersOf(it.id).forEach(function (x) { o[st.dim === 'satici' ? (x.supplier || '') : (x.docId || '')] = 1; });
    return Object.keys(o);
  }
  function groupLabel(g) {
    if (st.dim === 'kat') return catName(g);
    if (st.dim === 'belge') { var d = db.docs.filter(function (x) { return x.id === g; })[0]; return d ? d.name : 'Elle eklenen'; }
    return g || 'Belirsiz';
  }
  function profField(kind, name, f, label, val, type) {
    return '<label>' + label + ' <input data-prof="' + kind + '|' + f + '" data-name="' + esc(name) + '"' + (type ? ' type="' + type + '"' : '') + ' value="' + esc(val == null ? '' : val) + '"></label>';
  }
  // Marka ya da satıcı kartı: bilgiler, belgeler ve karttan belge yükleme
  function profileCard(kind, name) {
    var isB = kind === 'marka', p = (isB ? db.brands[name] : db.sellers[name]) || {};
    var docs = db.docs.filter(function (d) { return isB ? (d.brand || d.supplier) === name : d.supplier === name; });
    var n = isB ? Object.values(db.items).filter(function (it) { return it.brand === name; }).length : Object.values(db.offers).filter(function (o) { return o.supplier === name; }).length;
    return '<div class="card"><h2>' + esc(name) + '</h2><div class="muted">' + (isB ? 'Marka · ' + n + ' ürün' : 'Satıcı · ' + n + ' teklif') + ' · ' + docs.length + ' belge' +
      (p.auto ? ' · iletişim bilgileri belgeden alındı, kontrol edin' : '') + '</div>' +
      '<details class="prof"><summary>Bilgiler' + (p.web || p.phone ? ': ' + esc([p.web, p.phone].filter(Boolean).join(' · ')) : ' (dokunup doldurun)') + '</summary>' +
      profField(kind, name, 'web', 'İnternet sitesi', p.web) + profField(kind, name, 'phone', 'Telefon', p.phone) + profField(kind, name, 'email', 'E-posta', p.email) +
      (isB ? '' : profField(kind, name, 'disc', 'İskonto % (bu satıcının bütün tekliflerine uygulanır)', p.disc, 'number')) +
      profField(kind, name, 'note', 'Not', p.note) + '</details>' +
      (p.web ? '<button class="ghost" data-act="openlink" data-url="' + esc(/^https?:/.test(p.web) ? p.web : 'https://' + p.web) + '">Siteyi aç (internet gerekir)</button>' : '') +
      (docs.length ? '<div class="muted">Belgeler: ' + docs.map(function (d) { return esc(d.name); }).join(' · ') + '</div>' : '') +
      '<div class="row"><button class="primary" data-act="upfor" data-id="' + kind + '">Bu ' + (isB ? 'markaya' : 'satıcıya') + ' belge yükle</button></div></div>';
  }
  function drawResults() {
    var q = st.q.trim();
    var base = Object.values(db.items).filter(function (it) { return matchItem(it, q) && passFilter(it); });
    var counts = {};
    base.forEach(function (it) { groupsOf(it).forEach(function (g) { counts[g] = (counts[g] || 0) + 1; }); });
    if (st.grp != null && !(st.grp in counts)) st.grp = null;
    var keys = Object.keys(counts).sort(function (a, b) { return (a === '') - (b === '') || groupLabel(a).localeCompare(groupLabel(b), 'tr'); });
    // Ana sayfa (arama, grup ve süzgeç yokken): gruplar resimli kutular halinde, ardından son eklenenler
    var home = !q && st.grp == null && st.filter === 'hepsi' && keys.length > 1;
    $('#groups').innerHTML = keys.length && !home ? keys.map(function (g) {
      return '<button class="chip' + (st.grp === g ? ' on' : '') + '" data-act="grp" data-id="' + esc(g) + '">' + esc(groupLabel(g)) + ' <small>' + counts[g] + '</small></button>';
    }).join('') : '';
    var hm = '';
    if (home) {
      var rep = {}; base.forEach(function (it) { groupsOf(it).forEach(function (g) { if (!rep[g] || (!rep[g].hasImg && it.hasImg)) rep[g] = it; }); });
      var dimName = DIMS.filter(function (d) { return d[0] === st.dim; })[0][1];
      hm = '<h3 class="shelf">' + ({ kat: 'Kategoriler', marka: 'Markalar', satici: 'Satıcılar', belge: 'Belgeler' })[st.dim] + '</h3><div class="tiles">' + keys.map(function (g) {
        return '<button class="tile" data-act="grp" data-id="' + esc(g) + '">' + thumb(rep[g]) + '<b>' + esc(groupLabel(g)) + '</b><small>' + counts[g] + ' ürün</small></button>';
      }).join('') + '</div>';
      if (base.length > 6) hm += '<h3 class="shelf">Son eklenenler</h3><div class="strip">' + base.slice(-12).reverse().map(function (it) { return miniCard(it); }).join('') + '</div>';
      hm += '<h3 class="shelf">Tüm ürünler <small>' + base.length + '</small></h3>';
    }
    $('#home').innerHTML = hm; hydrateImages($('#home'));
    var items = st.grp == null ? base : base.filter(function (it) { return groupsOf(it).indexOf(st.grp) >= 0; });
    // Kategori içinde alt gruplar: resimli kutular; dokununca o alt grup süzülür
    var subHtml = '';
    if (st.dim === 'kat' && st.grp) {
      var sc = {}, srep = {};
      var subsOf = function (it) { return [it.category, it.cat2].filter(function (c) { return c && mainOf(c) === st.grp; }).filter(function (c, i, a) { return a.indexOf(c) === i; }); };
      items.forEach(function (it) { subsOf(it).forEach(function (c) { sc[c] = (sc[c] || 0) + 1; if (!srep[c] || (!srep[c].hasImg && it.hasImg)) srep[c] = it; }); });
      if (st.sub && !sc[st.sub]) st.sub = null;
      var sk = Object.keys(sc).sort(function (a, b) { return (a === st.grp) - (b === st.grp) || sc[b] - sc[a]; });
      if (sk.length > 1 || (sk.length === 1 && sk[0] !== st.grp)) {
        subHtml = '<h3 class="shelf">' + esc(catName(st.grp)) + ' · alt gruplar</h3><div class="tiles">' + sk.map(function (c) {
          return '<button class="tile' + (st.sub === c ? ' on' : '') + '" data-act="sub" data-id="' + esc(c) + '">' + thumb(srep[c]) + '<b>' + esc(subLabel(c)) + '</b><small>' + sc[c] + ' ürün</small></button>';
        }).join('') + '</div>';
      }
      if (st.sub) items = items.filter(function (it) { return subsOf(it).indexOf(st.sub) >= 0; });
    }
    items = items.sort(function (a, b) { return a.name.localeCompare(b.name, 'tr') || String(a.sub || '').localeCompare(String(b.sub || ''), 'tr'); });
    $('#gcard').innerHTML = st.grp && (st.dim === 'marka' || st.dim === 'satici') ? profileCard(st.dim, st.grp) : subHtml;
    if (subHtml) hydrateImages($('#gcard'));
    $('#sugg').innerHTML = q ? suggestions(q) : '';
    $('#results').innerHTML = items.length ? items.slice(0, 200).map(card).join('') + (items.length > 200 ? '<p class="muted">' + items.length + ' üründen ilk 200 tanesi gösteriliyor. Daraltmak için arayın ya da bir grup seçin.</p>' : '') :
      '<p class="muted">' + (Object.keys(db.items).length ? 'Sonuç yok.' : 'Henüz ürün yok. Belge sekmesinden bir katalog yükleyin.') + '</p>';
    hydrateImages($('#results'));
    $('#webfind').innerHTML = q.length >= 2 ? '<div class="card"><b>Bunu internette bul</b><div class="muted">"' + esc(q) + '" sitede aranır; oradan "Klavuz\'a al" ile ürünleri çekebilirsiniz. İnternet gerekir.</div><div class="row shops">' + shopButtons(q) + '</div></div>' : '';
  }

  // ---------- Ekranlar ----------
  var st = { tab: 'ara', q: '', filter: 'hepsi', item: null, variant: null, jobOpen: null, newProd: null, dim: 'kat', grp: null, catBrand: '', catSupplier: '', catKind: 'katalog',
    histOffer: null, edit: null, pick: false, pickList: [], docView: null, repDoc: null, open: {}, grab: null };
  var FILTERS = [['hepsi', 'Tümü'], ['kontrol', 'Kontrol gerekli'], ['dogrulanmamis', 'Doğrulanmamış'], ['resimsiz', 'Resimsiz'], ['bekliyor', 'Bekleyen']];

  function viewSearch() {
    return '<div class="subbar"><div class="tabsx">' + DIMS.map(function (d) {
        return '<button class="' + (st.dim === d[0] ? 'on' : '') + '" data-act="dim" data-id="' + d[0] + '">' + d[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="chips">' + FILTERS.map(function (f) {
        return '<button class="chip' + (st.filter === f[0] ? ' on' : '') + '" data-act="filter" data-id="' + f[0] + '">' + f[1] + '</button>';
      }).join('') + '</div><div class="chips" id="groups"></div></div>' +
      '<div id="home"></div><div id="gcard"></div><div id="sugg"></div><div id="results" class="grid"></div><div id="webfind"></div>';
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
      '<label>Marka <input id="e_brand" value="' + esc(it.brand) + '"></label>' +
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
  // Alternatifler: başka marka ya da satıcıdaki aynı tip ürünler (aynı kategori; ad ve ölçü benzerliğine göre sıralı)
  function altItems(it, sel) {
    if (!it.category) return [];
    var tk = tokens(it.name), sz = sizeNum(sel && sel.size), out = [];
    Object.values(db.items).forEach(function (x) {
      var cm = mainOf(it.category);
      if (x.id === it.id || (mainOf(x.category) !== cm && mainOf(x.cat2) !== cm)) return;
      var t2 = tokens(x.name), common = tk.filter(function (t) { return t2.indexOf(t) >= 0; }).length;
      var offs = offersOf(x.id), score = tk.length ? common / Math.max(tk.length, t2.length, 1) : 0;
      var same = sz != null ? offs.filter(function (o) { return sizeNum(o.size) === sz; })[0] : null;
      if (same) score += 0.5;
      if (x.brand !== it.brand) score += 0.1;
      if (score < 0.4) return;
      var show = same || offs.filter(function (o) { return o.sellPrice != null; }).sort(function (a, b) { return a.sellPrice - b.sellPrice; })[0] || offs[0];
      if (show) out.push({ it: x, o: show, score: score, same: !!same });
    });
    return out.sort(function (a, b) { return b.score - a.score || (a.o.sellPrice || 1e12) - (b.o.sellPrice || 1e12); }).slice(0, 8);
  }
  function altHtml(it, sel) {
    var list = altItems(it, sel); if (!list.length) return '';
    return '<div class="card"><h3>Benzer ve alternatif ürünler</h3><div class="muted">Aynı tipte, başka marka ya da satıcıdan. Karşılaştırmak için dokunun.</div><div class="strip">' + list.map(function (a) {
      return miniCard(a.it, a.o, a.it.brand + (a.o.supplier !== a.it.brand ? ' · ' + a.o.supplier : '') + (a.o.size ? ' · ' + a.o.size : '') + (a.same ? ' · aynı ölçü' : ''));
    }).join('') + '</div></div>';
  }
  // Elle ya da internetten paylaşılan ürün: kısa bir formla tek ürün kartı eklenir
  function newProdHtml() {
    var n = st.newProd;
    function f(k, label, type) { return '<label>' + label + ' <input data-np="' + k + '"' + (type ? ' type="' + type + '"' : '') + ' value="' + esc(n[k] == null ? '' : n[k]) + '"></label>'; }
    return '<div class="card editbox" id="newprod"><h3>' + (n.link ? 'İnternetten paylaşılan ürün' : 'Elle ürün ekle') + '</h3>' +
      (n.busy ? '<div class="muted">Sayfadan bilgiler alınıyor (internet varsa)...</div>' : '') +
      (n.img ? '<img class="certprev" alt="" src="' + n.img + '">' : '') +
      f('name', 'Ürün adı') + f('brand', 'Marka') + f('seller', 'Satıcı') + f('code', 'Kod (varsa)') + f('size', 'Ölçü (varsa)') + f('price', 'Fiyat (varsa)', 'number') +
      '<label>Para birimi <select data-np="cur">' + ['TL', 'EUR', 'USD'].map(function (c) { return '<option' + ((n.cur || 'TL') === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></label>' +
      (n.link ? '<div class="muted">Bağlantı: ' + esc(n.link.slice(0, 80)) + '</div>' : '') +
      (n.link && n.got === false ? '<div class="row"><button class="soft" data-act="openweb" data-url="' + esc(n.link) + '">Sayfayı uygulama içinde aç, oradan al</button></div>' : '') +
      '<div class="row"><button class="primary" data-act="npsave">Ürünü ekle</button><button class="ghost" data-act="npcancel">Vazgeç</button></div></div>';
  }
  function saveNewProd() {
    var n = st.newProd, name = (n.name || '').trim(); if (!name) return toast('Ürün adını yazın.');
    var seller = (n.seller || '').trim() || (n.brand || '').trim() || 'Elle eklenen', brand = (n.brand || '').trim() || seller;
    var price = n.price === '' || n.price == null ? null : num(n.price);
    var item = { id: uid(), name: name, sub: '', brand: brand, category: '', note: '', verified: true, hasImg: false, crumb: n.crumb || '' };
    autoCat(item); db.items[item.id] = item;
    if (n.img) attachImg(item, n.img);
    var o = { id: uid(), itemId: item.id, supplier: seller, code: (n.code || '').trim(), key: codeKey(n.code), size: (n.size || '').trim(), specs: '', listPrice: price, priceVat: null,
      cur: n.cur || 'TL', supDisc: 0, sellPrice: price, lastDir: null, status: 'ok', why: '', updated: today(), docId: '', link: n.link || '' };
    db.offers[o.id] = o; profileFill(brand, seller, 'fiyat', null);
    st.newProd = null; save(); toast('Ürün eklendi'); openItem(item.id);
  }
  // İnternet sitesinden (Amazon, Hepsiburada vb.) "paylaş" ile gelen metin: bağlantı ve ürün adı ayrılır.
  // İnternet varsa sayfadan ad, fiyat ve resim alınmaya çalışılır; alınamazsa form elle doldurulur.
  var SHOPS = [['amazon', 'Amazon'], ['hepsiburada', 'Hepsiburada'], ['trendyol', 'Trendyol'], ['n11', 'n11'], ['ciceksepeti', 'Çiçeksepeti'], ['akakce', 'Akakçe'], ['sahibinden', 'Sahibinden'], ['aliexpress', 'AliExpress'], ['ebay', 'eBay']];
  function metaOf(html, names) {
    for (var i = 0; i < names.length; i++) {
      var m = html.match(new RegExp('<meta[^>]+(?:property|name|itemprop)=["\']' + names[i] + '["\'][^>]*content=["\']([^"\']+)["\']', 'i')) ||
        html.match(new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name|itemprop)=["\']' + names[i] + '["\']', 'i'));
      if (m) return m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
    }
    return '';
  }
  function openLink(u) {
    if (!u || !/^https?:\/\//i.test(u)) return;
    try { if (window.KlavuzAndroid && KlavuzAndroid.openLink) return KlavuzAndroid.openLink(u); } catch (e) {}
    window.open(u, '_blank', 'noopener');
  }
  // "1.234,56 TL", "$12.99", "1234.5" gibi yazılardan tutar ve para birimi
  function parseMoney(s) {
    s = String(s == null ? '' : s);
    var cur = /€|EUR/i.test(s) ? 'EUR' : (/\$|USD/i.test(s) ? 'USD' : (/₺|TL|TRY/i.test(s) ? 'TL' : ''));
    var m = s.replace(/\s/g, '').match(/\d[\d.,]*/); if (!m) return null;
    var t = m[0].replace(/[.,]$/, ''), ld = t.lastIndexOf('.'), lc = t.lastIndexOf(',');
    if (ld >= 0 && lc >= 0) t = lc > ld ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    else if (lc >= 0) t = /,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
    else if (ld >= 0 && /\.\d{3}$/.test(t) && (cur === 'TL' || (t.match(/\./g) || []).length > 1)) t = t.replace(/\./g, '');
    var v = parseFloat(t); return isNaN(v) ? null : { v: v, cur: cur };
  }
  function shareName(t) {
    return String(t || '').replace(/^\s*(şuna (bir )?g[öo]z at(ın)?|bunu g[öo]rd[üu]n m[üu]|check this out|look at this|amazon'da (şunu|bunu) (buldum|g[öo]rd[üu]m)|i found this on amazon)\s*[:!?.\-–]*\s*/i, '')
      .replace(/\s*[|:–-]\s*(amazon(\.com(\.tr)?)?|hepsiburada(\.com)?|trendyol(\.com)?|n11(\.com)?)\b.*$/i, '').replace(/^amazon\.com(\.tr)?\s*:\s*/i, '').replace(/\s+/g, ' ').trim();
  }
  // Ürün sayfasından ad, fiyat, resim, marka ve kod. Önce sitenin yapısal verisi (JSON-LD), sonra Amazon'a özgü alanlar, sonra genel etiketler.
  // Sitenin kategori yolu (kırıntı yolu): JSON-LD BreadcrumbList, Amazon üst şeridi ya da genel breadcrumb.
  // Kategori bulmada ipucu olarak kullanılır; mağaza ağacı kopyalanmaz.
  function crumbOf(doc) {
    var parts = [];
    function walk(x) {
      if (!x || parts.length || typeof x !== 'object') return;
      if (Array.isArray(x)) return x.forEach(walk);
      if (x['@type'] === 'BreadcrumbList' && Array.isArray(x.itemListElement)) {
        x.itemListElement.slice().sort(function (a, b) { return (a.position || 0) - (b.position || 0); }).forEach(function (e) {
          var n = e && (e.name || (e.item && typeof e.item === 'object' && e.item.name)); if (n) parts.push(String(n));
        });
        return;
      }
      if (x['@graph']) walk(x['@graph']);
    }
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(function (sc) { try { walk(JSON.parse(sc.textContent)); } catch (e) {} });
    if (!parts.length) {
      var els = doc.querySelectorAll('#wayfinding-breadcrumbs_feature_div li a, nav[aria-label*="readcrumb"] a, .breadcrumb a, .breadcrumbs a, [itemtype*="BreadcrumbList"] [itemprop="name"]');
      Array.prototype.forEach.call(els, function (e) { var t = String(e.textContent || '').replace(/\s+/g, ' ').trim(); if (t && parts.indexOf(t) < 0) parts.push(t); });
    }
    return parts.filter(function (t) { return t.length <= 60 && !/^(ana ?sayfa|home|hepsiburada|trendyol|amazon(\.com)?(\.tr)?|n11|tüm kategoriler)$/i.test(t); }).slice(0, 6).join(' > ');
  }
  function extractProduct(html, url) {
    var out = {}, doc;
    try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (e) { return out; }
    function str(v) { return v == null || typeof v === 'object' ? '' : String(v).replace(/\s+/g, ' ').trim(); }
    function txt(sel) { var e = doc.querySelector(sel); return e ? str(e.textContent) : ''; }
    function attr(sel, a) { var e = doc.querySelector(sel); return e ? str(e.getAttribute(a)) : ''; }
    function meta(names) {
      for (var i = 0; i < names.length; i++) {
        var e = doc.querySelector('meta[property="' + names[i] + '"],meta[name="' + names[i] + '"],meta[itemprop="' + names[i] + '"]');
        if (e && e.getAttribute('content')) return str(e.getAttribute('content'));
      }
      return '';
    }
    var prod = null;
    function walk(x) {
      if (!x || prod || typeof x !== 'object') return;
      if (Array.isArray(x)) return x.forEach(walk);
      var t = x['@type'];
      if (t === 'Product' || (Array.isArray(t) && t.indexOf('Product') >= 0)) { prod = x; return; }
      if (x['@graph']) walk(x['@graph']); if (x.mainEntity) walk(x.mainEntity);
    }
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(function (sc) { try { walk(JSON.parse(sc.textContent)); } catch (e) {} });
    if (prod) {
      out.strong = true;
      out.name = str(prod.name);
      var im = prod.image; if (Array.isArray(im)) im = im[0]; if (im && typeof im === 'object') im = im.url || im.contentUrl;
      out.img = str(im);
      out.brand = str(prod.brand && typeof prod.brand === 'object' ? prod.brand.name : prod.brand);
      out.code = str(prod.mpn || prod.sku);
      var of = prod.offers; if (Array.isArray(of)) of = of[0];
      if (of && typeof of === 'object') {
        var pr = of.price != null ? of.price : (of.lowPrice != null ? of.lowPrice : (of.priceSpecification && of.priceSpecification.price));
        var pm = pr != null ? parseMoney(String(pr)) : null; if (pm) out.price = pm.v;
        out.cur = str(of.priceCurrency || (of.priceSpecification && of.priceSpecification.priceCurrency));
      }
    }
    // Amazon
    var at = txt('#productTitle') || txt('#title');
    if (at) {
      out.strong = true;
      out.name = at;
      var ai = attr('#landingImage', 'data-old-hires') || attr('#landingImage', 'src') || attr('#main-image', 'src') || attr('#imgBlkFront', 'src') || attr('img[data-a-hires]', 'data-a-hires');
      var hm = html.match(/"hiRes":"(https:[^"]+)"/) || html.match(/"large":"(https:[^"]+)"/);
      if (hm && (!ai || /^data:/.test(ai))) ai = hm[1];
      if (ai) out.img = ai;
      var ap = txt('#corePrice_feature_div .a-offscreen') || txt('#corePriceDisplay_desktop_feature_div .a-offscreen') || txt('.a-price .a-offscreen') || txt('#priceblock_ourprice') || txt('#price_inside_buybox');
      var am = ap ? parseMoney(ap) : null; if (am) { out.price = am.v; if (am.cur) out.cur = am.cur; }
      var ab = txt('#bylineInfo').replace(/^(marka|brand)\s*:\s*/i, '').replace(/^visit the\s+(.+?)\s+store$/i, '$1').replace(/\s*(store'?u|mağazasını)\s+ziyaret edin\.?$/i, '').trim();
      if (ab) out.brand = ab;
    }
    if (/product/i.test(meta(['og:type']))) out.strong = true;
    if (!out.name) out.name = meta(['og:title', 'twitter:title']) || txt('h1') || txt('title');
    if (!out.img) out.img = meta(['og:image', 'og:image:secure_url', 'twitter:image']) || attr('[itemprop="image"]', 'src') || attr('link[rel="image_src"]', 'href');
    if (out.price == null) {
      var gp = meta(['product:price:amount', 'og:price:amount', 'price']) || attr('[itemprop="price"]', 'content') || txt('[itemprop="price"]');
      var gm = gp ? parseMoney(gp) : null; if (gm) { out.price = gm.v; if (gm.cur && !out.cur) out.cur = gm.cur; }
    }
    if (!out.cur) out.cur = meta(['product:price:currency', 'og:price:currency', 'priceCurrency']) || attr('[itemprop="priceCurrency"]', 'content');
    if (!out.brand) out.brand = meta(['product:brand', 'og:brand', 'brand']);
    out.name = shareName(out.name);
    out.cur = /EUR|€/i.test(out.cur) ? 'EUR' : (/USD|\$/i.test(out.cur) ? 'USD' : (/TRY|TL|₺/i.test(out.cur) ? 'TL' : ''));
    try { if (out.img) out.img = new URL(out.img, url || undefined).href; } catch (e) {}
    if (!/^https:/.test(out.img || '')) out.img = '';
    out.crumb = crumbOf(doc);
    var canon = attr('link[rel="canonical"]', 'href');
    try { if (canon) canon = new URL(canon, url || undefined).href; } catch (e) { canon = ''; }
    out.link = /^https:/.test(canon || '') ? canon : (/^https:/.test(url || '') ? url : '');
    // Site robot denetimi sayfası verdiyse bilgi yok sayılır
    if (/captcha|robot check|robot kontrol|automated access|bir robot olmadığınızı/i.test(str(doc.title) + ' ' + txt('h4'))) out = { blocked: true };
    return out;
  }
  // Uygulama içi tarayıcı: alışveriş sitesi uygulamanın içinde açılır; "Klavuz'a al" düğmesi o an açık olan sayfayı okur.
  var WEBSHOPS = [['Amazon', 'https://www.amazon.com.tr/', 'https://www.amazon.com.tr/s?k='], ['Hepsiburada', 'https://www.hepsiburada.com/', 'https://www.hepsiburada.com/ara?q='],
    ['Trendyol', 'https://www.trendyol.com/', 'https://www.trendyol.com/sr?q='], ['n11', 'https://www.n11.com/', 'https://www.n11.com/arama?q='], ['Google', 'https://www.google.com/', 'https://www.google.com/search?q=']];
  function openBrowser(u) {
    if (!(window.KlavuzAndroid && KlavuzAndroid.openBrowser)) return toast('Uygulama içi tarayıcı telefondaki uygulamada çalışır.');
    if (navigator.onLine === false) return toast('İnternet yok. Tarayıcı internet ister; uygulamanın geri kalanı internetsiz çalışır.');
    KlavuzAndroid.openBrowser(u || '');
  }
  function shopButtons(q) {
    return WEBSHOPS.map(function (w, i) { return '<button class="ghost" data-act="shop" data-id="' + i + '"' + (q ? ' data-q="' + esc(q) + '"' : '') + '>' + w[0] + '</button>'; }).join('');
  }
  function shopOf(url) {
    var host = ''; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { host = ''; }
    var sh = SHOPS.filter(function (x) { return host.indexOf(x[0]) >= 0; })[0];
    return sh ? sh[1] : host;
  }
  function moneyIn(t) {
    var m = String(t || '').match(/(?:₺|€|\$)\s?\d[\d.,]*|\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?\s?(?:TL|₺|€|\$|EUR|USD)/);
    return m ? parseMoney(m[0]) : null;
  }
  // Liste sayfasındaki (arama sonucu, kategori) ürünler: JSON-LD ItemList, Amazon sonuç kutuları, sonra genel kalıp (ürün bağlantısı + resim + fiyat)
  function extractList(html, url) {
    var doc; try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (e) { return []; }
    var out = [], seen = {};
    function abs(u) { try { return u ? new URL(u, url || undefined).href : ''; } catch (e) { return ''; } }
    function add(o) {
      o.name = shareName(String(o.name || '').replace(/\s+/g, ' ').trim()).slice(0, 200);
      if (o.name.length < 4) return;
      o.link = abs(o.link).split('#')[0]; if (!/^https:/.test(o.link)) o.link = '';
      o.img = abs(o.img); if (!/^https:/.test(o.img)) o.img = '';
      var k = o.link || fold(o.name); if (seen[k]) return; seen[k] = 1;
      out.push(o);
    }
    function imgOf(el) { return el ? (el.getAttribute('data-src') || el.getAttribute('data-original') || el.getAttribute('src') || '') : ''; }
    function ldItem(x, link) {
      if (!x || typeof x !== 'object') return;
      var im = x.image; if (Array.isArray(im)) im = im[0]; if (im && typeof im === 'object') im = im.url || im.contentUrl;
      var of = x.offers; if (Array.isArray(of)) of = of[0];
      var pm = of && typeof of === 'object' && (of.price != null || of.lowPrice != null) ? parseMoney(String(of.price != null ? of.price : of.lowPrice)) : null;
      var c = of && typeof of === 'object' ? String(of.priceCurrency || '') : '';
      add({ name: x.name, link: x.url || link, img: typeof im === 'string' ? im : '', price: pm ? pm.v : null, cur: /EUR/i.test(c) ? 'EUR' : (/USD/i.test(c) ? 'USD' : 'TL'),
        brand: x.brand && typeof x.brand === 'object' ? x.brand.name : (typeof x.brand === 'string' ? x.brand : ''), code: typeof x.sku === 'string' ? x.sku : '' });
    }
    function walk(x) {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) return x.forEach(walk);
      var t = x['@type'];
      if (t === 'ItemList' || (Array.isArray(t) && t.indexOf('ItemList') >= 0)) (x.itemListElement || []).forEach(function (el) { ldItem(el && typeof el.item === 'object' ? el.item : el, el && el.url); });
      if (x['@graph']) walk(x['@graph']); if (x.mainEntity) walk(x.mainEntity);
    }
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(function (sc) { try { walk(JSON.parse(sc.textContent)); } catch (e) {} });
    doc.querySelectorAll('[data-component-type="s-search-result"]').forEach(function (b) {
      var h = b.querySelector('h2'), a = b.querySelector('h2 a[href], a.a-link-normal[href*="/dp/"]'), pr = b.querySelector('.a-price .a-offscreen'), pm = pr ? parseMoney(pr.textContent) : null;
      var link = a ? abs(a.getAttribute('href')) : '', asin = b.getAttribute('data-asin') || '';
      if (asin && /\/dp\//.test(link)) link = link.replace(/(\/dp\/[A-Z0-9]{10}).*$/, '$1');
      if (h) add({ name: h.textContent, link: link, img: imgOf(b.querySelector('img.s-image, img')), price: pm ? pm.v : null, cur: pm && pm.cur ? pm.cur : 'TL', brand: '', code: '' });
    });
    if (out.length < 2) doc.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (!/(-p-|\/dp\/|\/gp\/product\/|-pm-|\/urun\/|\/urunler\/|\/product\/|\/products\/|\/p\/)/i.test(href)) return;
      var box = a, img = a.querySelector('img'), pm = null;
      for (var up = 0; up < 5; up++) {
        if (!img && box.querySelector) img = box.querySelector('img');
        pm = moneyIn(box.textContent);
        if (img && pm) break;
        var par = box.parentElement;
        if (!par || par.tagName === 'BODY' || par.querySelectorAll('a[href]').length > 12) break;
        box = par;
      }
      if (!img) return;
      add({ name: img.getAttribute('alt') || a.getAttribute('title') || a.textContent, link: href, img: imgOf(img), price: pm ? pm.v : null, cur: pm && pm.cur ? pm.cur : 'TL', brand: '', code: '' });
    });
    return out.slice(0, 150);
  }
  // Tarayıcıdaki "Klavuz'a al": ürün sayfasıysa tek ürün formu, liste sayfasıysa seçmeli liste açılır
  window.KlavuzGrab = function (html, url) {
    var one = html ? extractProduct(html, url) : {}, list = html ? extractList(html, url) : [], shop = shopOf(url), crumb = one.crumb || '';
    if (one.blocked) return toast('Site bu sayfayı robot denetimine aldı. Sayfada denetimi geçip yeniden "Klavuz\'a al" deyin.');
    if (one.strong || (list.length < 2 && one.name && (one.price != null || one.img))) {
      st.newProd = { name: (one.name || '').slice(0, 200), link: one.link || url, seller: shop, brand: (one.brand || '').slice(0, 60), code: (one.code || '').slice(0, 40), size: '',
        price: one.price == null ? '' : one.price, cur: one.cur || 'TL', img: '', busy: false, got: true, crumb: crumb };
      st.grab = null;
      if (one.img && window.KlavuzAndroid && KlavuzAndroid.fetchImage) KlavuzAndroid.fetchImage(one.img);
    } else if (list.length >= 2) { st.grab = { items: list, seller: shop, brand: '', off: {}, url: url, crumb: crumb }; st.newProd = null; }
    else return toast('Bu sayfada ürün bulunamadı. Ürünün kendi sayfasını ya da bir arama sonucu sayfasını açıp yeniden deneyin.');
    st.item = null; st.docView = null; st.tab = 'katalog'; render();
    var el = $('#grabbox') || $('#newprod'); if (el) el.scrollIntoView();
  };
  function grabCount() { var g = st.grab; return g ? g.items.filter(function (x, i) { return !g.off[i]; }).length : 0; }
  function grabHtml() {
    var g = st.grab;
    return '<div class="card editbox" id="grabbox"><h3>Sayfada ' + g.items.length + ' ürün bulundu</h3>' +
      '<div class="muted">' + esc(g.seller) + ' · İstemediklerinizin işaretini kaldırın. Daha önce aldığınız ürün yeniden gelirse yalnız fiyatı güncellenir.</div>' +
      '<label>Satıcı <input data-gb="seller" value="' + esc(g.seller) + '"></label>' +
      '<label>Marka (hepsi aynı markaysa yazın; boşsa satıcı adı kullanılır) <input data-gb="brand" value="' + esc(g.brand) + '"></label>' +
      '<div class="grablist">' + g.items.map(function (x, i) {
        return '<label class="grabrow"><input type="checkbox" data-gsel="' + i + '"' + (g.off[i] ? '' : ' checked') + '>' +
          (x.img ? '<img alt="" loading="lazy" src="' + esc(x.img) + '">' : '<span class="noimgbox"></span>') +
          '<span><b>' + esc(x.name) + '</b><small>' + (x.price != null ? fmtC(x.price, x.cur) : 'fiyat yok') + '</small></span></label>';
      }).join('') + '</div>' +
      '<div class="row"><button class="primary" data-act="grabsave" id="grabsave">Seçilenleri ekle (' + grabCount() + ')</button><button class="ghost" data-act="browser">Tarayıcıya dön</button><button class="ghost" data-act="grabcancel">Vazgeç</button></div></div>';
  }
  var imgQueue = [], imgBusy = false;
  function pumpImages() {
    if (imgBusy || !imgQueue.length) return;
    if (!(window.KlavuzAndroid && KlavuzAndroid.fetchImageFor) || navigator.onLine === false) { imgQueue = []; return; }
    imgBusy = true; var q = imgQueue[0];
    setTimeout(function () { if (imgBusy && imgQueue[0] === q) { imgQueue.shift(); imgBusy = false; pumpImages(); } }, 20000);
    KlavuzAndroid.fetchImageFor(q.id, q.url);
  }
  window.KlavuzImageFor = function (id, dataUrl) {
    if (imgQueue[0] && imgQueue[0].id === id) imgQueue.shift();
    imgBusy = false;
    var it = db.items[id];
    if (it && dataUrl) {
      var im = new Image();
      im.onload = function () { var u = thumbUrl(im); if (u && db.items[id]) { it.hasImg = false; attachImg(it, u); save(); document.querySelectorAll('[data-img="' + id + '"]').forEach(function (el) { el.innerHTML = '<img alt="" src="' + u + '">'; }); } };
      im.src = dataUrl;
    }
    pumpImages();
  };
  function saveGrab() {
    var g = st.grab; if (!g) return;
    var seller = (g.seller || '').trim() || 'İnternet', brand = (g.brand || '').trim() || seller, made = 0, upd = 0;
    var byLink = {}; Object.values(db.offers).forEach(function (o) { if (o.link) byLink[o.link] = o; });
    g.items.forEach(function (x, i) {
      if (g.off[i]) return;
      var old = x.link ? byLink[x.link] : null;
      if (old) {
        if (x.price != null && x.price !== old.listPrice) {
          db.history.push({ offerId: old.id, old: old.listPrice, price: x.price, cur: x.cur, date: today(), doc: seller + ' (internet)' });
          var wasSell = old.sellPrice === old.listPrice;
          old.lastDir = old.listPrice != null && x.price > old.listPrice ? 'up' : 'down'; old.listPrice = x.price; old.cur = x.cur; if (wasSell) old.sellPrice = x.price;
        }
        old.updated = today(); upd++; return;
      }
      var item = { id: uid(), name: x.name, sub: '', brand: (x.brand || '').trim() || brand, category: '', catBy: 'auto', note: '', verified: true, hasImg: false, crumb: g.crumb || '' };
      autoCat(item); db.items[item.id] = item;
      var o = { id: uid(), itemId: item.id, supplier: seller, code: x.code || '', key: codeKey(x.code), size: '', specs: '', listPrice: x.price, priceVat: null,
        cur: x.cur || 'TL', supDisc: 0, sellPrice: x.price, lastDir: null, status: 'ok', why: '', updated: today(), docId: '', link: x.link || '' };
      db.offers[o.id] = o; if (o.link) byLink[o.link] = o; made++;
      if (x.img) imgQueue.push({ id: item.id, url: x.img });
    });
    profileFill(brand, seller, 'fiyat', null);
    st.grab = null; touch(); save();
    toast(made + ' ürün eklendi' + (upd ? ', ' + upd + ' ürünün fiyatı güncellendi' : '') + (imgQueue.length ? '. Resimler indiriliyor...' : ''));
    st.tab = 'ara'; st.q = ''; st.filter = 'hepsi'; st.dim = 'satici'; st.grp = seller; render();
    pumpImages();
  }

  window.KlavuzShared = function (text) {
    text = String(text || '').trim(); if (!text) return;
    var m = text.match(/https?:\/\/\S+/), link = m ? m[0] : '', host = '';
    try { host = link ? new URL(link).hostname.replace(/^www\./, '') : ''; } catch (e) { host = ''; }
    if (/^(a\.co|amzn\.)/.test(host)) host = 'amazon';
    var shop = SHOPS.filter(function (x) { return host.indexOf(x[0]) >= 0; })[0];
    st.newProd = { name: shareName(text.replace(link, '')).slice(0, 200), link: link, seller: shop ? shop[1] : host, brand: '', code: '', size: '', price: '', cur: 'TL', img: '', busy: false };
    st.item = null; st.docView = null; st.tab = 'katalog';
    if (link && window.KlavuzAndroid && KlavuzAndroid.fetchText && navigator.onLine !== false) { st.newProd.busy = true; KlavuzAndroid.fetchText(link); }
    render();
    var el = $('#newprod'); if (el) el.scrollIntoView();
  };
  window.KlavuzPage = function (html, url) {
    var n = st.newProd; if (!n) return;
    n.busy = false;
    var p = html ? extractProduct(html, url || n.link) : {};
    if (p.name && (p.name.length >= 8 || !n.name)) n.name = p.name.slice(0, 200);
    if (p.price != null && !n.price) n.price = p.price;
    if (p.cur) n.cur = p.cur;
    if (p.brand && !n.brand) n.brand = p.brand.slice(0, 60);
    if (p.code && !n.code) n.code = p.code.slice(0, 40);
    if (p.link) n.link = p.link;
    if (p.crumb) n.crumb = p.crumb;
    if (p.link && (!n.seller || /^(a\.co|amzn|ty\.gl|hb\.biz|bit\.ly)/.test(n.seller))) { try { n.seller = new URL(p.link).hostname.replace(/^www\./, ''); } catch (e) {} }
    if (p.img && window.KlavuzAndroid && KlavuzAndroid.fetchImage) KlavuzAndroid.fetchImage(p.img);
    n.got = !!(p.name || p.price != null || p.img);
    if (!n.got) toast(p.blocked ? 'Site bilgiyi vermedi (robot denetimi). Formu elle doldurabilirsiniz.' : 'Sayfadan bilgi alınamadı. Formu elle doldurabilirsiniz.');
    if (st.tab === 'katalog' && !st.item) render(true);
  };
  window.KlavuzImage = function (dataUrl) {
    var n = st.newProd; if (!n || !dataUrl) return;
    var im = new Image();
    im.onload = function () { var u = thumbUrl(im); if (u && st.newProd === n) { n.img = u; if (st.tab === 'katalog' && !st.item) render(true); } };
    im.src = dataUrl;
  };
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
      '<button class="ghost" data-act="openlink" data-url="https://www.google.com/search?tbm=isch&q=' + webQ + '">Web\'de görsel ara</button></div>' +
'</div>' : '';
    var verify = '<div class="card"><h3>Kontrol</h3><div class="row">' +
      (!it.verified ? '<button class="primary" data-act="verify" data-id="' + id + '">✓ Doğrula</button>' : '') +
      '<button class="ghost" data-act="edit" data-id="' + sel.id + '">Düzelt</button>' +
      '<button class="ghost" data-act="nextcheck" data-id="' + id + '">Sonraki kontrol →</button></div></div>';
    var cats = '<div class="card"><h3>Kategori</h3>' +
      '<label class="catsel">Kategori <select data-cat="' + id + '"><option value="">Kategorisiz</option>' + catOptions(it.category) + '</select></label>' +
      '<label class="catsel">İkinci kategori <select data-cat2="' + id + '"><option value="">Yok</option>' + catOptions(it.cat2) + '</select></label></div>';
    var specRows = sel.specs ? sel.specs.split(' · ').map(function (x) {
      var k = x.indexOf(': ');
      return k > 0 && k < 40 ? '<div class="kv"><span>' + esc(x.slice(0, k)) + '</span><b>' + esc(x.slice(k + 2)) + '</b></div>' : '<div class="kv one">' + esc(x) + '</div>';
    }).join('') : '';
    var sups = Array.from(new Set(offs.map(function (o) { return o.supplier; })));
    return '<button class="link" data-act="back">← Geri</button>' +
      '<div class="card detail"><div class="dgrid"><div>' + thumb(it, 'hero') + '</div><div class="dinfo">' +
      '<div class="crumbs">' + (it.category ? '<button class="link" data-act="gocat" data-id="' + esc(mainOf(it.category)) + '">' + esc(mainNode(it.category) ? mainNode(it.category).name : 'Kategorisiz') + '</button>' +
        (subNode(it.category) ? ' › <button class="link" data-act="gocat" data-id="' + esc(it.category) + '">' + esc(subNode(it.category).name) + '</button>' : '') : '<span class="muted">Kategorisiz</span>') + '</div>' +
      '<button class="link brandlink" data-act="gobrand" data-id="' + esc(it.brand) + '">' + esc(it.brand) + '</button>' +
      '<h2>' + esc(it.name) + '</h2>' + (it.sub ? '<div class="sub">' + esc(it.sub) + '</div>' : '') +
      '<div class="muted">' + (sel.code ? 'Kod ' + esc(sel.code) + ' · ' : '') + 'Satıcı: ' + esc(sups.join(', ')) + '</div>' +
      (sel.sellPrice != null ? '<div class="bigprice">' + fmtC(sel.sellPrice, sel.cur) + ' <span class="muted">(öneri satış' + (sel.size ? ', ' + esc(sel.size) : '') + ')</span></div>' :
        '<div class="muted">Bu katalogda fiyat yok' + (sel.size ? ' · seçili ölçü ' + esc(sel.size) : '') + '. Fiyat listesi yüklenince ya da "Düzelt" ile eklenir.</div>') +
      (sel.priceVat != null ? '<div class="muted">Listede KDV dahil: ' + fmtC(sel.priceVat, sel.cur) + '</div>' : '') +
      (variants ? '<div class="muted">Ölçü / seçenek: <b>' + esc(sel.size || sel.code || '—') + '</b></div>' + variants : '') +
      '<button class="primary cartbtn" data-act="addcart" data-id="' + sel.id + '">Sepete ekle</button>' +
      '<div class="row"><button class="ghost" data-act="hist" data-id="' + sel.id + '">Fiyat geçmişi</button>' +
      (sel.link ? '<button class="ghost" data-act="openlink" data-url="' + esc(sel.link) + '">Ürünün internet sayfasını aç</button>' : '') + '</div>' +
      (st.histOffer === sel.id ? histHtml(sel.id) : '') +
      (sel.sellPrice != null ? '<div class="internal">Alış ' + fmtC(buyOf(sel), sel.cur) + ' · Kâr ' + fmtC((sel.sellPrice || 0) - (buyOf(sel) || 0), sel.cur) + '</div>' : '') +
      '<div>' + badgesOf(it, offs) + '</div>' +
      '</div></div></div>' +
      (specRows ? '<div class="card"><h3>Teknik özellikler' + (sel.size ? ' · ' + esc(sel.size) : '') + '</h3><div class="speclist">' + specRows + '</div></div>' : '') +
      altHtml(it, sel) +
      noImg +
      verify +
      (st.edit ? editForm(it, db.offers[st.edit] || sel) : '') +
      (st.pick ? pickerHtml() : '') +
      '<div class="card"><h3>Tedarikçi teklifleri</h3>' + offs.map(offerRow).join('') + '</div>' +
      cats +
      '<div class="card"><label>Not <input data-note="' + id + '" value="' + esc(it.note || '') + '"></label>' +
      '<div class="row"><button class="danger" data-act="delitem" data-id="' + id + '">Ürünü sil</button></div></div>' +
      (sim.length ? '<div class="card"><h3>Aynı ürün olabilir (birleştirme kararı sizin)</h3>' + sim.map(function (x) {
        return '<div class="row"><span>' + esc(x.name) + ' · ' + esc(offersOf(x.id).map(function (o) { return o.code; }).join(', ')) +
          '</span><button class="ghost" data-act="merge" data-id="' + x.id + '">Aynı ürün, birleştir</button></div>';
      }).join('') + '</div>' : '');
  }
  var KINDS = { katalog: 'ana katalog', fiyat: 'fiyat listesi', sertifika: 'belge (sertifika, tanıtım)' };
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
      return '<div class="doccard' + (st.repDoc === d.id ? ' wide' : '') + '"><div class="thumb cover" data-cover="' + d.id + '" data-kind="' + (isCert ? 'pages' : 'doc') + '"><span>' + (isCert ? 'BELGE' : 'PDF') + '</span></div>' +
        '<b class="clamp2">' + esc(d.name) + '</b><div class="muted">' + esc(d.supplier) + ' · ' + esc(d.date) + '<br>' + d.count + (isCert ? ' sayfa' : ' satır') + ' · ' + (KINDS[d.kind] || 'ana katalog') + '</div>' +
        '<div class="docbtns">' + (isCert ? '<button class="link" data-act="opendoc" data-id="' + d.id + '">Aç</button>' : '<button class="link" data-act="docitems" data-id="' + d.id + '">Ürünler</button><button class="link" data-act="rep" data-id="' + d.id + '">Rapor</button>') +
        (d.hasFile ? '<button class="link" data-act="reread" data-id="' + d.id + '">Yeniden oku</button>' : '') +
        '<button class="link danger-text" data-act="deldoc" data-id="' + d.id + '">Sil</button></div>' +
        (st.repDoc === d.id ? '<div class="report">' + reportHtml(d.report) + '<div class="row"><button class="soft" data-act="repshare" data-id="' + d.id + '">Okuma raporunu paylaş</button><button class="soft" data-act="repcopy" data-id="' + d.id + '">Kopyala</button></div></div>' : '') + '</div>';
    }).join('');
    var h = '<div class="card"><h2>Belge yükle</h2>' +
      '<div class="muted">PDF, Excel (xlsx/xls), CSV, TXT ya da bunları içeren ZIP dosyası seçin; birden çok dosya seçebilirsiniz. ZIP kendiliğinden açılır. Belgeler sırayla, arka planda okunur. Büyük belgeler kendiliğinden parça parça okunur. Okunan ürünleri kaydetmeden önce kontrol edersiniz. İnternet gerekmez.</div>' +
      '<label>Marka (ürünü üreten) <input id="brandName" list="brandList" value="' + esc(st.catBrand) + '" placeholder="örn. Boss Paslanmaz"></label>' +
      '<label>Satıcı (fiyatı veren) <input id="supName" list="sellerList" value="' + esc(st.catSupplier) + '" placeholder="boş bırakılırsa marka ile aynı"></label>' +
      '<datalist id="brandList">' + Array.from(new Set(brandNames().concat(SEED_BRANDS))).map(function (b) { return '<option value="' + esc(b) + '">'; }).join('') + '</datalist>' +
      '<datalist id="sellerList">' + sellerNames().map(function (b) { return '<option value="' + esc(b) + '">'; }).join('') + '</datalist>' +
      '<label>Belge türü <select id="kind">' +
      '<option value="katalog"' + (st.catKind === 'katalog' ? ' selected' : '') + '>Ana katalog (resimli, detaylı)</option>' +
      '<option value="fiyat"' + (st.catKind === 'fiyat' ? ' selected' : '') + '>Fiyat listesi (kod ve fiyat)</option>' +
      '<option value="sertifika"' + (st.catKind === 'sertifika' ? ' selected' : '') + '>Belge: sertifika, tanıtım dosyası (ürün okunmaz)</option></select></label>' +
      '<input type="file" id="docFile" multiple accept=".pdf,.xlsx,.xls,.csv,.txt,.zip">' +
      '<div class="row"><button class="primary" data-act="read">Belgeleri oku</button></div></div>' +
      '<div id="jobs" class="jobs">' + jobsHtml() + '</div>';
    var kept = db.docs.filter(function (d) { return d.hasFile; }).length;
    var webBox = '<div class="card"><h3>İnternetten ürün al</h3>' +
      '<div class="muted">Site uygulamanın içinde açılır. Ürün sayfasında ya da arama / kategori sayfasında üstteki "Klavuz\'a al" düğmesine basın: tek ürün ya da sayfada görünen ürünlerin hepsi gelir. İnternet gerekir.</div>' +
      '<div class="row shops">' + shopButtons('') + '</div>' +
      '<div class="row"><input id="webAddr" placeholder="başka site adresi (örn. marka sitesi)" style="flex:1"><button class="ghost" data-act="shopgo">Aç</button></div></div>';
    return h + (st.grab ? grabHtml() : '') + (st.newProd ? newProdHtml() : '<div class="row"><button class="soft" data-act="newprod">Elle ürün ekle</button></div>') + webBox +
      '<div class="card"><h3>Yüklenen belgeler</h3>' +
      (db.docs.length ? '<div class="muted">Yeni sürümde okuma geliştikçe eski belgeleri baştan okutabilirsiniz; elle yaptığınız düzeltmeler korunur. ' + kept + ' / ' + db.docs.length + ' belgenin aslı cihazda saklı. Aslı saklı olmayanlar için aynı dosyayı yukarıdan yeniden seçmeniz yeter.</div>' +
        (kept ? '<div class="row"><button class="soft" data-act="rereadall">Aslı saklı ' + kept + ' belgeyi yeniden oku</button></div>' : '') : '') +
      (docs ? '<div class="docgrid">' + docs + '</div>' : '<p class="muted">Henüz belge yok.</p>') + '</div>';
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
      '<div class="row"><button data-act="print">Yazdır / PDF</button><button class="ghost" data-act="copy">Metni kopyala</button></div></div>' +
      '<div class="card"><h3>Teklife aktar</h3><div class="muted">Sepetteki kalemler teklif programında (TeklifX, Excel) açılabilen bir tablo dosyası olarak kaydedilir ya da paylaşılır. Yalnız satış fiyatları yer alır.</div>' +
      '<div class="row"><button class="primary" data-act="cartfile">Teklif dosyası kaydet</button><button class="ghost" data-act="cartshare">Paylaş</button></div></div>';
  }
  // Sepeti teklif tablosuna çevir (noktalı virgülle ayrılmış; Excel ve TeklifX için)
  function cartCsv() {
    var cd = db.cartDiscount || 0, q = function (v) { v = String(v == null ? '' : v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var nf = function (v) { return v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ','); };
    var out = [['Sıra', 'Ürün', 'Kod', 'Marka', 'Satıcı', 'Ölçü', 'Adet', 'Birim fiyat', 'İskonto %', 'Tutar', 'Para birimi'].join(';')];
    db.cart.filter(function (l) { return db.offers[l.offerId]; }).forEach(function (l, i) {
      var o = db.offers[l.offerId], it = db.items[o.itemId] || { name: '?', brand: '' };
      var disc = 100 - (100 - (l.disc || 0)) * (100 - cd) / 100;
      out.push([i + 1, q(it.name + (it.sub ? ' ' + it.sub : '')), q(o.code), q(it.brand), q(o.supplier), q(o.size), l.qty, nf(o.sellPrice), nf(disc), nf((o.sellPrice || 0) * l.qty * (1 - disc / 100)), o.cur || 'TL'].join(';'));
    });
    return '\uFEFF' + out.join('\r\n') + '\r\n';
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
    var out = [], lastH = {};
    db.history.forEach(function (h) { lastH[h.offerId] = h; });
    Object.values(db.offers).forEach(function (o) {
      var it = db.items[o.itemId]; if (!it) return;
      var name = it.name + ' · ' + o.supplier + (o.code ? ' ' + o.code : '') + (o.size ? ' · ' + o.size : '');
      var b = buyOf(o);
      if (o.lastDir === 'up' || o.lastDir === 'down') out.push({ k: o.lastDir, d: name + ' — ' + fmtC(o.listPrice, o.cur), oid: o.id, itemId: o.itemId, h: lastH[o.id] || null, name: name });
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
      '<button class="primary" data-act="nextcheck" data-id="">Elle kontrol et</button></div>' +
      '<div class="row"><button class="soft" data-act="autocheck">Otomatik kontrol et</button><span class="muted">Sistem çözebildiklerini kendisi ayıklar; yalnız gerçekten belirsiz olanlar size kalır.</span></div></div>';
    if (!a.length) return head + '<div class="card"><p class="muted">Seçili bildirim türlerinde uyarı yok. Türleri Ayarlar\'dan açıp kapatabilirsiniz.</p></div>';
    var byWhy = {}; Object.values(db.offers).forEach(function (o) { if (o.status === 'check') { var w = o.why || 'neden kaydedilmemiş (eski sürüm)'; byWhy[w] = (byWhy[w] || 0) + 1; } });
    var whyKeys = Object.keys(byWhy).sort(function (x, y) { return byWhy[y] - byWhy[x]; });
    if (whyKeys.length) head += '<div class="card"><h3>Kontrol nedenleri</h3>' + whyKeys.map(function (w) { return '<div class="why"><span class="badge b-warn">' + byWhy[w] + '</span> ' + esc(w) + '</div>'; }).join('') +
      '<div class="muted">Ayrıntı ve örnekler için Belge sekmesinde belgenin yanındaki "Rapor" düğmesine basın.</div></div>';
    var chg = a.filter(function (x) { return x.oid; }).length;
    if (chg) head += '<div class="card"><div class="row"><b>Fiyatı değişen: ' + chg + '</b><button class="soft" data-act="ackall">Hepsini gördüm</button></div>' +
      '<div class="muted">Aşağıda her biri için eski ve yeni fiyat yan yana. "Ürüne git" ile bütün teklifleri karşılaştırabilirsiniz.</div></div>';
    if (a.length > 150) head += '<div class="card"><div class="muted">' + a.length + ' uyarıdan ilk 150 tanesi gösteriliyor.</div></div>';
    return head + a.slice(0, 150).map(function (x) {
      var label = ALERT_KEYS.filter(function (k) { return k[0] === x.k; })[0][1];
      if (x.oid) {
        var h = x.h, pct = h && h.old ? (h.price - h.old) / h.old * 100 : null;
        return '<div class="card"><b>' + esc(label) + '</b><div class="muted">' + esc(x.name) + '</div>' +
          (h ? '<div class="cmp"><span>Eski<s>' + fmtC(h.old, h.cur) + '</s></span><span class="arr">→</span><span>Yeni<b>' + fmtC(h.price, h.cur) + '</b></span>' +
            (pct != null ? '<span class="badge ' + (pct > 0 ? 'b-warn' : 'b-ok') + '">' + (pct > 0 ? '+' : '−') + ' %' + Math.abs(pct).toFixed(1).replace('.', ',') + '</span>' : '') + '</div>' +
            '<div class="muted">' + esc(h.date) + ' · ' + esc(h.doc || '') + '</div>' : '<div class="muted">' + esc(x.d) + '</div>') +
          '<div class="row"><button class="ghost" data-act="openitem" data-id="' + x.itemId + '">Ürüne git</button><button class="ghost" data-act="ack" data-id="' + x.oid + '">Gördüm</button></div></div>';
      }
      return '<div class="card"><b>' + esc(label) + '</b><div class="muted">' + esc(x.d) + '</div>' +
        (x.itemId ? '<div><button class="ghost" data-act="openitem" data-id="' + x.itemId + '">Ürüne git</button></div>' : '') + '</div>';
    }).join('');
  }
  // ---- Deneyim ve öneri / Sürüm testi ----
  var FB_SECS = [['ara', 'Arama'], ['urun', 'Ürün sayfası'], ['belge', 'Belge okuma'], ['sepet', 'Sepet ve teklif'], ['uyari', 'Uyarılar'], ['genel', 'Genel']];
  // Sürüm testi: markaya değil sistemin kendisine yönelik maddeler. Hangi belgeyle denendiği not kutusuna yazılır.
  var VTEST = [
    ['Kurulum ve güncelleme', [
      ['g3', 'Bu sürümü dosyadan değil, önceki sürümün içinden kurdum: Ayarlar > Uygulama bilgileri > "Güncellemeyi denetle" > "İndir ve kur"; kurulum ekranı açıldı'],
      ['k1', 'Kurulumdan sonra ürünlerim, resimlerim ve ayarlarım duruyor']]],
    ['Kategori ağacı', [
      ['c1', 'Ara > Kategori: ana gruplar kutu olarak geliyor; birine dokununca içinde alt gruplar (örn. Vana > Küresel vana, Çek valf) çıkıyor'],
      ['c2', 'Bir alt gruba dokununca yalnız o alt grubun ürünleri listelendi'],
      ['c3', 'Ürünlerin alt grubu çoğunlukla doğru (yanlış örnekleri nota yazın: ürün adı → olması gereken)'],
      ['c4', 'Ürün sayfasının üstündeki "Vana › Küresel vana" yoluna dokununca o gruba gitti'],
      ['c5', 'Ürün sayfasında kategori kutusundan alt grup seçtim; benzer ürünler de kendiliğinden oraya geçti'],
      ['c6', 'Ayarlar > Kategori ağacı: bir adı değiştirdim ve yeni alt grup ekledim; ürünler yeni gruba geçti'],
      ['c7', 'Elle atadığım eski kategoriler yerinde kaldı']]],
    ['OCR: taranmış katalog', [
      ['o1', 'Taranmış (yazısı seçilemeyen) bir katalog yükledim; durum şeridinde "OCR ile okunuyor" yazdı ve okuma bitti (süreyi nota yazın)'],
      ['o2', 'Okuma raporunda "OCR ile okunan sayfa" sayısı yazıyor; "OCR çalışmadı" yazmıyor'],
      ['o3', 'OCR ile okunan ürünler "OCR ile okundu, kontrol edin" uyarısıyla geldi; kod ve fiyatların çoğu doğru (yanlış örnekleri nota yazın)'],
      ['o4', 'Büyük katalogda (örn. 93 MB Seaflo) "Belge oku" dedikten sonra uygulama donmadı; başka ekranlara geçebildim'],
      ['o7', 'Drive\'dan büyük bir dosya (örn. 93 MB Seaflo) seçtim; "Dosya hazırlanıyor..." yazdı, sonra okuma başladı, "could not be found" hatası çıkmadı'],
      ['o6', 'Uzun okumada durum şeridinde "yaklaşık ... kaldı" yazıyor ve süre gerçeğe yakın'],
      ['o5', 'Yazısı normal olan kataloglar eskisi gibi hızlı okundu']]],
    ['Uygulama içi tarayıcı', [
      ['b1', 'Belge sekmesi > "İnternetten ürün al" > Amazon (ya da Hepsiburada) uygulamanın içinde açıldı'],
      ['b2', 'Bir ürün sayfasında "Klavuz\'a al": ad, fiyat, marka forma geldi; resim de geldi'],
      ['b3', 'Bir arama ya da kategori sayfasında "Klavuz\'a al": sayfadaki ürünler liste halinde geldi (kaç ürün geldiğini nota yazın)'],
      ['b4', 'Listeden seçtiklerim eklendi; resimleri kısa süre sonra kendiliğinden geldi'],
      ['b5', 'Aynı sayfayı ikinci kez alınca ürün çoğalmadı (fiyat değiştiyse güncellendi)'],
      ['b6', 'Arama ekranında bir şey yazınca alttaki "Bunu internette bul" düğmeleri o sitede aramayı açtı'],
      ['b7', 'Geri tuşu tarayıcıda bir önceki sayfaya döndü; "Kapat" uygulamaya döndü']]],
    ['Paylaşımla ürün', [
      ['w1', 'Amazon uygulamasında "Paylaş" > Klavuz: ürün adı, fiyat, resim geldi (gelmeyeni nota yazın)'],
      ['w5', 'Bilgi gelmediğinde çıkan "Sayfayı uygulama içinde aç, oradan al" düğmesi işe yaradı'],
      ['w3', 'Ürün sayfasındaki "Ürünün internet sayfasını aç" siteyi açtı']]],
    ['ZIP', [
      ['z1', 'İçinde birkaç katalog olan bir ZIP dosyası seçtim; kendiliğinden açıldı ve belgeler sırayla okundu']]]
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
  function statusText() {
    var out = ['Klavuz ' + APP_VERSION + ' · Durum özeti · ' + today(),
      Object.keys(db.items).length + ' ürün · ' + Object.keys(db.offers).length + ' teklif · ' + db.docs.length + ' belge · kayıt: ' + storeMode + (pdfEngine ? ' · motor: ' + pdfEngine : ''), ''];
    var byDoc = {}, why = {};
    Object.values(db.offers).forEach(function (o) {
      var b = byDoc[o.docId] = byDoc[o.docId] || { n: 0, chk: 0, noPrice: 0 }; b.n++;
      if (o.listPrice == null) b.noPrice++;
      if (o.status === 'check') { b.chk++; why[o.why || '?'] = (why[o.why || '?'] || 0) + 1; }
    });
    db.docs.forEach(function (d) {
      var b = byDoc[d.id] || { n: 0, chk: 0, noPrice: 0 }, r = d.report || {};
      out.push('- ' + d.name + ' [' + (d.brand || d.supplier) + (d.brand && d.brand !== d.supplier ? ' / ' + d.supplier : '') + ', ' + (KINDS[d.kind] || d.kind) + '] ' +
        (d.kind === 'sertifika' ? d.count + ' sayfa görüntüsü' : b.n + ' teklif, ' + b.chk + ' kontrol, ' + b.noPrice + ' fiyatsız' + (r.pages ? ', ' + r.pages + ' sayfa' : '') + (r.secs ? ', ' + r.secs + ' sn' : '') + (r.infoCount ? ', ' + r.infoCount + ' bilgi tablosu' : '')) + (d.hasFile ? '' : ' (aslı saklı değil)'));
    });
    var cat = {}; Object.values(db.items).forEach(function (it) { var c = catName(it.category); cat[c] = (cat[c] || 0) + 1; });
    out.push('', 'Kategoriler: ' + Object.keys(cat).sort(function (a, b) { return cat[b] - cat[a]; }).map(function (c) { return c + ' ' + cat[c]; }).join(', '));
    out.push('Doğrulanmamış ürün: ' + Object.values(db.items).filter(function (it) { return !it.verified; }).length);
    var wk = Object.keys(why).sort(function (a, b) { return why[b] - why[a]; });
    if (wk.length) out.push('Kontrol nedenleri: ' + wk.map(function (w) { return w + ' ' + why[w]; }).join('; '));
    return out.join('\n');
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
    var cnt = {}; Object.values(db.items).forEach(function (it) { [it.category, it.cat2].forEach(function (c) { if (c) { cnt[c] = (cnt[c] || 0) + 1; var m = mainOf(c); if (m !== c) cnt[m] = (cnt[m] || 0) + 1; } }); });
    var cats = '<div class="muted">Ana grup ve alt grup adlarını değiştirebilir, alt grup ekleyebilirsiniz. Yeni alt grubun adındaki sözcükler ürün adlarında aranır; uyan ürünler kendiliğinden oraya geçer. Elle atadığınız kategorilere dokunulmaz.</div>' +
      tree().map(function (m) {
        return '<details class="cattree"><summary>' + esc(m.name) + ' <small>' + (cnt[m.id] || 0) + ' ürün · ' + m.subs.length + ' alt grup</small></summary>' +
          '<label>Ana grup adı <input data-catname="' + m.id + '" value="' + esc(m.name) + '"></label>' +
          m.subs.map(function (x) {
            return '<div class="row catrow"><input data-catname="' + x.id + '" value="' + esc(x.name) + '" aria-label="Alt grup adı"><small>' + (cnt[x.id] || 0) + '</small>' +
              (x.user ? '<button class="ghost" data-act="delsub" data-id="' + x.id + '">Sil</button>' : '') + '</div>';
          }).join('') +
          '<div class="row catrow"><input id="addsub_' + m.id + '" placeholder="Yeni alt grup adı (örn. Kingston vana)"><button class="soft" data-act="addsub" data-id="' + m.id + '">Ekle</button></div></details>';
      }).join('');
    var backup = '<div class="muted">Veriler bu cihazda saklanır. Düzenli yedek alın. Yedek, ürün resimlerini ve saklanan belgeleri de içerir.</div>' +
      '<div class="row"><button data-act="export">Yedek indir</button>' +
      '<label class="chk">Yedekten yükle <input type="file" id="importFile" accept=".json,application/json"></label></div>' +
      '<div class="row"><button class="danger" data-act="wipe">Tüm verileri sil</button></div>';
    var about = '<div class="kv"><span>Uygulama</span><b>Klavuz ' + APP_VERSION + '</b></div>' +
      '<div class="kv"><span>Kayıt</span><b>' + Object.keys(db.items).length + ' ürün · ' + Object.keys(db.offers).length + ' teklif · ' + db.docs.length + ' belge</b></div>' +
      '<div class="kv"><span>Çalışma</span><b>Türkçe · çevrimdışı</b></div>' +
      '<div class="kv"><span>Kayıt alanı</span><b>' + (storeMode === 'idb' ? 'geniş veritabanı' : 'dar alan (eski yöntem)') + (pdfEngine ? ' · okuma motoru: ' + pdfEngine : '') + '</b></div>' +
      '<div class="kv"><span>Firma</span><b>HC MARIN WORKS</b></div>' +
      '<div class="row"><button class="soft" data-act="updcheck">Güncellemeyi denetle</button><span class="muted">İnternet gerekir. Yeni sürüm varsa uygulama indirir, siz yalnız "Yükle"ye basarsınız.</span></div>' +
      '<div class="row"><button class="soft" data-act="ozet">Durum özetini paylaş</button><span class="muted">Belgeler, sayılar ve uyarı nedenleri (ürün bilgisi içermez)</span></div>' +
      '<div class="muted">Kayıtlar dış sunucuya gönderilmez. Veri yalnız sizin başlattığınız paylaşım ve yedekle cihazdan çıkar.</div>';
    return '<h1 class="ptitle">Ayarlar</h1>' +
      sect('fb', 'Deneyim ve öneri', 'Puan ve notlar', fb) +
      sect('vt', 'Sürüm testi', '<span class="pill">' + c.done + ' / ' + c.tot + '</span>', test) +
      sect('nt', 'Bildirimler', '', notify) +
      sect('kt', 'Kategori ağacı', tree().length + ' ana grup', cats) +
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
    var v = $('#view'), qi = $('#q'), ub = updBanner();
    if (qi && qi.value !== st.q && document.activeElement !== qi) qi.value = st.q;
    if (st.item) v.innerHTML = ub + viewItem(st.item);
    else if (st.tab === 'ara') { v.innerHTML = ub + viewSearch(); drawResults(); }
    else if (st.tab === 'katalog' && st.docView) { v.innerHTML = viewDocPages(st.docView); loadDocPages(); }
    else if (st.tab === 'katalog') v.innerHTML = ub + viewCatalog();
    else if (st.tab === 'sepet') v.innerHTML = ub + viewCart();
    else if (st.tab === 'uyari') v.innerHTML = ub + viewAlerts();
    else if (st.tab === 'ayar') v.innerHTML = ub + viewSettings();
    hydrateImages(v); drawStrip();
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
  function readDraft() {
    var brand = ($('#brandName').value || '').trim(), supplier = ($('#supName').value || '').trim(), kind = $('#kind').value, files = Array.prototype.slice.call($('#docFile').files || []);
    if (!brand && !supplier) return toast('Önce marka ya da satıcı adını yazın.');
    if (!brand) brand = supplier; if (!supplier) supplier = brand;
    if (!files.length) return toast('Önce bir ya da birkaç belge seçin.');
    st.catBrand = brand; st.catSupplier = supplier === brand ? '' : supplier; st.catKind = kind;
    $('#docFile').value = '';
    enqueue(files, brand, supplier, kind);
  }
  function jobById(id) { return jobs.filter(function (j) { return j.id === id; })[0]; }
  function saveMsg(r) {
    return r.cert ? 'Belge kaydedildi' : 'Kaydedildi: ' + r.created + ' yeni, ' + r.updated + ' güncellendi, ' + r.changed + ' fiyat değişti' + (r.pending ? ', ' + r.pending + ' ana katalog bekliyor' : '') + (r.ver ? ' · ' + r.ver + ' ürün otomatik doğrulandı' : '');
  }
  function saveDraft(id) {
    var j = jobById(id); if (!j || j.status !== 'ready') return;
    toast(saveMsg(saveJobDraft(j)));
    render(true);
  }
  function saveAllDrafts() {
    var n = 0;
    jobs.filter(function (j) { return j.status === 'ready'; }).forEach(function (j) { saveJobDraft(j); n++; });
    toast(n + ' belge kaydedildi'); render(true);
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
  // Yedek tek seferde belleğe alınmaz; parça parça üretilir (resimli büyük yedeklerde çökmesin diye).
  async function backupParts(emit) {
    var head = JSON.stringify(Object.assign({ _fmt: 2, _ver: APP_VERSION, _date: today() }, db));
    await emit(head.slice(0, -1) + ',"_images":{');
    var keys = await kvKeys(), first = true;
    for (var i = 0; i < keys.length; i++) {
      var v = await kvRead(keys[i]); if (v == null) continue;
      await emit((first ? '' : ',') + JSON.stringify(keys[i]) + ':' + JSON.stringify(v)); first = false;
    }
    await emit('}}');
  }
  function exportData() {
    var name = 'klavuz-yedek-' + today() + '.json';
    flush();
    // Android: önce kayıt yeri seçilir, sonra KlavuzSaveReady çağrılır ve yedek parça parça yazılır
    if (window.KlavuzAndroid && KlavuzAndroid.saveBegin) { pendingText = null; KlavuzAndroid.saveBegin(name); return; }
    toast('Yedek hazırlanıyor...');
    var parts = [];
    backupParts(function (s) { parts.push(s); }).then(function () {
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(parts, { type: 'application/json' })); a.download = name; a.click();
    }, function () { toast('Yedek hazırlanamadı.'); });
  }
  // Metin dosyası kaydet (teklif tablosu gibi): Android'de kayıt yeri penceresi, tarayıcıda indirme
  var pendingText = null;
  function saveTextFile(name, text) {
    if (window.KlavuzAndroid && KlavuzAndroid.saveBegin) { pendingText = text; KlavuzAndroid.saveBegin(name); return; }
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click();
  }
  window.KlavuzSaveReady = function () {
    var N = 200000, src = pendingText == null ? backupParts : function (emit) { return Promise.resolve(emit(pendingText)); };
    toast(pendingText == null ? 'Yedek yazılıyor...' : 'Dosya yazılıyor...'); pendingText = null;
    src(function (s) {
      for (var i = 0; i < s.length;) {
        var e = Math.min(s.length, i + N), c = s.charCodeAt(e - 1);
        if (e < s.length && c >= 0xD800 && c <= 0xDBFF) e++; // çift parçalı harfi ortasından bölme
        KlavuzAndroid.saveChunk(s.slice(i, e)); i = e;
      }
    }).then(function () { KlavuzAndroid.saveEnd(true); }, function () { KlavuzAndroid.saveEnd(false); });
  };
  function importData(txt) {
    var obj;
    try { obj = JSON.parse(txt); } catch (err) { return toast('Yedek dosyası okunamadı.'); }
    if (!obj || typeof obj.items !== 'object' || typeof obj.offers !== 'object' || !Array.isArray(obj.docs)) return toast('Bu dosya Klavuz yedeği değil.');
    var cur = Object.keys(db.items).length, inc = Object.keys(obj.items).length;
    if ((cur || db.docs.length) && !confirm('Yedekte ' + inc + ' ürün ve ' + obj.docs.length + ' belge var.\nYedek yüklenince şu anki ' + cur + ' ürün ve ' + db.docs.length + ' belge silinir, yerine yedektekiler gelir.\nDevam edilsin mi?')) return;
    var imgs = obj._images; delete obj._images; delete obj._fmt; delete obj._ver; delete obj._date;
    db = normalize(obj);
    if (imgs) { kvClear(); Object.keys(imgs).forEach(function (k) { kvPut(k, imgs[k]); }); }
    save(); toast('Yedek yüklendi' + (imgs ? ' (resimlerle birlikte)' : '')); render();
  }
  function copyText() { copyStr($('#cust').textContent); }
  function repOf(id) {
    var j = jobById(id); if (j) return j.report;
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
      case 'dim': st.dim = id; st.grp = null; st.sub = null; render(true); break;
      case 'grp': st.grp = st.grp === id ? null : id; st.sub = null; drawResults(); break;
      case 'addsub': {
        var inp = $('#addsub_' + id), nm = inp ? inp.value.trim() : '';
        if (!nm) { toast('Alt grup adını yazın.'); break; }
        addSubCat(id, nm); var mv = reCat(); save(); toast('Alt grup eklendi' + (mv ? '; ' + mv + ' ürünün kategorisi güncellendi' : '')); render(true); break;
      }
      case 'delsub': if (!confirm('Bu alt grup silinsin mi? İçindeki ürünler ana gruba geçer.')) break; delSubCat(id); reCat(); save(); toast('Alt grup silindi'); render(true); break;
      case 'sub': st.sub = st.sub === id ? null : id; drawResults(); break;
      case 'gocat': st.item = null; st.tab = 'ara'; st.q = ''; st.filter = 'hepsi'; st.dim = 'kat'; st.grp = mainOf(id); st.sub = id === mainOf(id) ? null : id; render(); window.scrollTo(0, 0); break;
      case 'gobrand': st.item = null; st.tab = 'ara'; st.q = ''; st.filter = 'hepsi'; st.dim = 'marka'; st.grp = id; render(); break;
      case 'upfor': if (id === 'marka') { st.catBrand = st.grp; st.catSupplier = ''; } else { st.catSupplier = st.grp; st.catBrand = ''; st.catKind = 'fiyat'; } go('katalog'); break;
      case 'openitem': openItem(id); break;
      case 'docitems': st.item = null; st.tab = 'ara'; st.q = ''; st.filter = 'hepsi'; st.dim = 'belge'; st.grp = id; render(); break;
      case 'variant': st.variant = id; st.edit = null; render(); break;
      case 'addcart': addCart(id); break;
      case 'hist': st.histOffer = st.histOffer === id ? null : id; render(); break;
      case 'ack': if (db.offers[id]) { db.offers[id].lastDir = null; save(); } render(true); break;
      case 'ackall': Object.values(db.offers).forEach(function (o) { o.lastDir = null; }); save(); render(); toast('Fiyat değişiklikleri görüldü olarak işaretlendi'); break;
      case 'openlink': openLink(el.dataset.url); break;
      case 'shop': { var w = WEBSHOPS[Number(id)]; if (w) openBrowser(el.dataset.q ? w[2] + encodeURIComponent(el.dataset.q) : w[1]); break; }
      case 'shopgo': { var wa = ($('#webAddr').value || '').trim(); if (!wa) { toast('Site adresini yazın.'); break; } openBrowser(/^https?:\/\//i.test(wa) ? wa.replace(/^http:/i, 'https:') : 'https://' + wa); break; }
      case 'openweb': openBrowser(el.dataset.url); break;
      case 'browser': openBrowser(''); break;
      case 'grabsave': saveGrab(); break;
      case 'grabcancel': st.grab = null; render(true); break;
      case 'updcheck': checkUpdate(true); break;
      case 'updinstall': installUpdate(); break;
      case 'updlater': UPD.info = null; render(true); break;
      case 'merge': mergeItems(id, st.item); toast('Ürünler birleştirildi'); render(); break;
      case 'verify': if (db.items[id]) { db.items[id].verified = true; db.items[id].autoVer = false; offersOf(id).forEach(function (o) { if (o.status === 'check') o.status = 'ok'; }); save(); toast('Doğrulandı'); nextCheck(id); } break;
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
      case 'read': readDraft(); break;
      case 'readforce': {
        var jf = jobById(id); if (!jf) break;
        if (!jf.file) { toast('Dosyayı yeniden seçip okutun.'); break; }
        resetJob(jf); jf.force = true; if (jf.kind === 'sertifika') jf.kind = 'katalog'; jf.status = 'wait';
        drawJobs(); pump(); break;
      }
      case 'jobopen': st.jobOpen = st.jobOpen === id ? null : id; drawJobs(); break;
      case 'jobstop': { var js = jobById(id); if (js && confirm('Okuma durdurulsun mu? Bu belgeden okunanlar silinir.')) { js.stop = true; js.prog = 'Durduruluyor...'; drawJobs(); } break; }
      case 'jobdel': { var jd = jobById(id); if (jd) { dropJob(jd); drawJobs(); } break; }
      case 'saveall': saveAllDrafts(); break;
      case 'reread': reread([id]); break;
      case 'rereadall': reread(db.docs.filter(function (d) { return d.hasFile; }).map(function (d) { return d.id; })); break;
      case 'autocheck': { var ac = autoCheck(); save(); toast(ac.fixed || ac.ver ? ac.fixed + ' uyarı giderildi, ' + ac.ver + ' ürün otomatik doğrulandı' : 'Otomatik çözülebilecek uyarı kalmadı'); render(true); break; }
      case 'newprod': st.newProd = { name: '', link: '', seller: '', brand: st.catBrand || '', code: '', size: '', price: '', cur: 'TL', img: '' }; render(true); break;
      case 'npsave': saveNewProd(); break;
      case 'npcancel': st.newProd = null; render(true); break;
      case 'cartfile': saveTextFile('klavuz-teklif-' + today() + '.csv', cartCsv()); break;
      case 'cartshare': shareText($('#cust').textContent); break;
      case 'ozet': shareText(statusText()); break;
      case 'opendoc': st.docView = id; render(); break;
      case 'closedoc': st.docView = null; render(); break;
      case 'save': saveDraft(id); break;
      case 'export': exportData(); break;
      case 'wipe': if (confirm('Tüm veriler silinsin mi? Bu işlem geri alınamaz.')) { jobs.slice().forEach(function (j) { if (j.status === 'run') j.stop = true; else dropJob(j); }); db = empty(); kvClear(); save(); render(); } break;
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
    if (t.id === 'q') { st.q = t.value; if (st.tab !== 'ara' || st.item) { st.tab = 'ara'; st.item = null; st.docView = null; st.edit = null; st.pick = false; render(); } else drawResults(); }
    else if (d.np) { if (st.newProd) st.newProd[d.np] = t.value; }
    else if (d.gb) { if (st.grab) st.grab[d.gb] = t.value; }
    else if (d.gsel != null) { if (st.grab) { st.grab.off[d.gsel] = !t.checked; var gs = $('#grabsave'); if (gs) gs.textContent = 'Seçilenleri ekle (' + grabCount() + ')'; } }
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
    else if (d.cat) {
      var ci = db.items[d.cat]; if (ci) { var cn = setCategory(ci, t.value); save(); toast(cn ? 'Kategori kaydedildi; benzer ' + cn + ' ürün de ayrıldı' : 'Kategori kaydedildi'); }
    }
    else if (d.np) { if (st.newProd) st.newProd[d.np] = t.value; }
    else if (d.gb) { if (st.grab) st.grab[d.gb] = t.value; }
    else if (d.gsel != null) { if (st.grab) { st.grab.off[d.gsel] = !t.checked; var gs = $('#grabsave'); if (gs) gs.textContent = 'Seçilenleri ekle (' + grabCount() + ')'; } }
    else if (d.catname) { renameCat(d.catname, t.value); save(); toast('Ad kaydedildi'); }
    else if (d.cat2) { if (db.items[d.cat2]) { db.items[d.cat2].cat2 = t.value; db.items[d.cat2].catBy = 'user'; save(); toast('İkinci kategori kaydedildi'); } }
    else if (d.prof) {
      var pk = d.prof.split('|'), book = pk[0] === 'marka' ? db.brands : db.sellers, rec = book[d.name] = book[d.name] || {};
      rec[pk[1]] = pk[1] === 'disc' ? num(t.value) : t.value.trim(); rec.auto = false;
      if (pk[0] === 'satici' && pk[1] === 'disc') { Object.values(db.offers).forEach(function (o) { if (o.supplier === d.name) o.supDisc = rec.disc; }); toast('İskonto bu satıcının bütün tekliflerine uygulandı'); }
      save();
    }
    else if (d.qty) { var l = db.cart.find(function (x) { return x.offerId === d.qty; }); if (l) l.qty = Math.max(1, Math.round(num(t.value)) || 1); save(); render(); }
    else if (d.ldisc) { var l2 = db.cart.find(function (x) { return x.offerId === d.ldisc; }); if (l2) l2.disc = num(t.value); save(); render(); }
    else if (t.id === 'cartDisc') { db.cartDiscount = num(t.value); save(); render(); }
    else if (d.set) { db.settings[d.set] = t.value; save(); }
    else if (d.setb) { db.settings[d.setb] = t.checked; save(); }
    else if (d.notify) { db.settings.notify[d.notify] = t.checked; save(); render(); }
    else if (t.id === 'importFile' && t.files[0]) { t.files[0].text().then(importData); }
    else if (t.id === 'profFile' && t.files[0]) { t.files[0].text().then(importProfile); }
  });

  window.KlavuzToast = function (m) { toast(String(m || '')); };
  window.KlavuzSaved = function (ok) { toast(ok ? 'Dosya kaydedildi' : 'Dosya kaydedilemedi'); };
  // Android geri tuşu: önce açık sayfayı kapatır, sonra Ara sekmesine döner. false dönerse uygulama arka plana alınır.
  // ---------- Güncelleme: internet varsa yeni sürüm GitHub'daki yayınlardan bulunur, uygulama indirip kurulum ekranını açar ----------
  var UPD = { info: null, busy: false, pct: null, msg: '', manual: false };
  function cmpVer(a, b) {
    var x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (var i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); }
    return 0;
  }
  function checkUpdate(manual) {
    if (!(window.KlavuzAndroid && KlavuzAndroid.checkUpdate)) { if (manual) toast('Güncelleme denetimi telefondaki uygulamada çalışır.'); return; }
    if (navigator.onLine === false) { if (manual) toast('İnternet yok. Uygulama internetsiz çalışmaya devam eder; güncelleme internet gelince denetlenir.'); return; }
    UPD.manual = !!manual; if (manual) toast('Güncelleme denetleniyor...');
    try { KlavuzAndroid.checkUpdate(); } catch (e) {}
  }
  window.KlavuzUpdate = function (json) {
    var best = null, list = [];
    try { list = JSON.parse(json || '[]'); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    list.forEach(function (r) {
      var m = String((r && r.name) || '').match(/Klavuz (\d+\.\d+\.\d+)/), as = ((r && r.assets) || []).filter(function (a) { return /\.apk$/.test(a.name || ''); })[0];
      if (!m || !as || r.draft) return;
      if (!best || cmpVer(m[1], best.ver) > 0 || (cmpVer(m[1], best.ver) === 0 && String(r.published_at || r.created_at) > best.at)) best = { ver: m[1], url: as.browser_download_url, size: as.size || 0, at: String(r.published_at || r.created_at) };
    });
    try { localStorage.setItem('klavuz.upd', String(Date.now())); } catch (e) {}
    if (best && cmpVer(best.ver, APP_VERSION) > 0) { UPD.info = best; UPD.pct = null; UPD.msg = ''; render(true); }
    else if (UPD.manual) toast(list.length ? 'Uygulama güncel (' + APP_VERSION + ').' : 'Güncelleme bilgisi alınamadı. İnterneti denetleyip yeniden deneyin.');
    UPD.manual = false;
  };
  function installUpdate() {
    if (!UPD.info || UPD.busy) return;
    if (!(window.KlavuzAndroid && KlavuzAndroid.installUpdate)) return toast('Bu cihazda kendiliğinden kurulum yok.');
    UPD.busy = true; UPD.pct = 0; UPD.msg = ''; render(true);
    flush();
    KlavuzAndroid.installUpdate(UPD.info.url);
  }
  // pct: 0-100 indirme; 100 = kurulum ekranı açıldı; -1 = hata
  window.KlavuzUpdateProgress = function (pct, msg) {
    if (pct < 0) { UPD.busy = false; UPD.pct = null; UPD.msg = msg || 'İndirilemedi. İnterneti denetleyip yeniden deneyin.'; }
    else { UPD.pct = pct; if (pct >= 100) { UPD.busy = false; UPD.msg = 'İndirildi. Açılan pencerede "Yükle"ye basın. Android izin sorarsa bir kez izin verin, sonra yeniden "İndir ve kur"a basın.'; } }
    var el = $('#updbox'); if (el) el.outerHTML = updBanner(); else render(true);
  };
  function updBanner() {
    var u = UPD.info; if (!u) return '';
    return '<div class="card upd" id="updbox"><b>Yeni sürüm hazır: Klavuz ' + esc(u.ver) + '</b>' +
      '<div class="muted">Şu an ' + APP_VERSION + (u.size ? ' · ' + (u.size / 1048576).toFixed(1).replace('.', ',') + ' MB' : '') + '. Verileriniz yerinde kalır.</div>' +
      (UPD.busy ? '<div class="bar"><i style="width:' + (UPD.pct || 0) + '%"></i></div><div class="muted">İndiriliyor... %' + (UPD.pct || 0) + '</div>' :
        '<div class="row"><button class="primary" data-act="updinstall">İndir ve kur</button><button class="ghost" data-act="updlater">Sonra</button></div>') +
      (UPD.msg ? '<div class="muted">' + esc(UPD.msg) + '</div>' : '') + '</div>';
  }

  window.KlavuzBack = function () {
    if (st.grab && st.tab === 'katalog' && !st.item) { st.grab = null; render(true); return true; }
    if (st.newProd && st.tab === 'katalog' && !st.item) { st.newProd = null; render(true); return true; }
    if (st.item) { if (st.pick) st.pick = false; else if (st.edit) st.edit = null; else st.item = null; render(); return true; }
    if (st.docView) { st.docView = null; render(); return true; }
    if (st.tab !== 'ara') { go('ara'); return true; }
    return false;
  };
  document.addEventListener('visibilitychange', function () { if (document.hidden && saveTimer) flush(); });
  window.addEventListener('pagehide', function () { if (saveTimer) flush(); });

  // Açılış: veritabanını aç; eski sürümün kaydı varsa bir kez taşı. Veritabanı açılamazsa eski yöntemle çalış.
  async function boot() {
    var old = loadLs();
    db = normalize(old);
    try {
      await openDb();
      var data = await storeAll('data');
      storeMode = 'idb';
      if (data.meta) {
        var d = Object.assign({}, data.rest || {});
        PARTS.forEach(function (k) { if (data[k]) d[k] = data[k]; });
        db = normalize(d);
      } else if (!(await flush())) throw new Error('taşınamadı');
      else if (old) { try { localStorage.setItem('klavuz.tasindi', today()); } catch (e) {} }
    } catch (e) { storeMode = 'ls'; db = normalize(old); saveBad = false; }
    touch();
    var cn = 0;
    // Kategori ağacı değiştiyse (0.11.0: iki kademe) elle atanmamış ürünler yeniden ayrılır; elle atananlara dokunulmaz
    if (db.treeVer !== TREE_VER) { cn += reCat() + 1; db.treeVer = TREE_VER; }
    Object.values(db.items).forEach(function (it) { if (it.catBy !== 'user' && (!it.category || it.cat2 == null)) { var c0 = it.category; autoCat(it); if (it.category !== c0 || it.cat2) cn++; } });
    if (db.autoRun !== APP_VERSION) { autoCheck(); db.autoRun = APP_VERSION; cn++; }
    if (cn) save();
    await loadJobs();
    window.KlavuzHazir = true;
    render();
    // Uygulama başka bir uygulamadan "paylaş" ile açıldıysa gelen metni al
    try { var sh = window.KlavuzAndroid && KlavuzAndroid.takeShared ? KlavuzAndroid.takeShared() : ''; if (sh) window.KlavuzShared(sh); } catch (e) {}
    // Günde en çok iki kez, internet varsa, sessizce yeni sürüm denetlenir
    var lastUpd = 0; try { lastUpd = Number(localStorage.getItem('klavuz.upd')) || 0; } catch (e) {}
    if (Date.now() - lastUpd > 12 * 3600 * 1000) setTimeout(function () { checkUpdate(false); }, 4000);
  }
  if (window.KLAVUZ_TEST) window.KLAVUZ_TEST.api = { readPdf: readPdf, newStat: newStat, classify: function (n, s, c) { var r = classify(n, s, c); return [r, classify.second]; }, catName: catName }; // yalnız otomatik testler
  boot();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
