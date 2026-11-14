/* Klavuz belge okuyucu: PDF sayfasındaki yazıları tablo mantığıyla ürüne çevirir.
   Tarayıcıda window.Okuyucu, testte require('./okuyucu.js') olarak kullanılır. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Okuyucu = factory();
})(this, function () {
  'use strict';

  function fold(s) {
    return String(s || '').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
      .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/i̇/g, 'i').replace(/\s+/g, ' ').trim();
  }
  function hasDigit(s) { return /\d/.test(s); }
  function median(a) { if (!a.length) return 0; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.floor(b.length / 2)]; }

  // ---- Yazı parçalarını satırlara ve hücrelere topla ----
  // items: [{str, x, y, w, h}]  (y: PDF koordinatı, yukarı doğru artar)
  function buildRows(items) {
    var its = items.filter(function (i) { return i.str && i.str.trim(); }).sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var rows = [];
    its.forEach(function (it) {
      var r = rows[rows.length - 1];
      var tol = Math.max(2.5, (it.h || 8) * 0.35);
      if (r && Math.abs(r.y - it.y) <= tol) r.items.push(it);
      else rows.push({ y: it.y, items: [it] });
    });
    rows.forEach(function (r) {
      r.items.sort(function (a, b) { return a.x - b.x; });
      var cells = [], cur = null;
      r.items.forEach(function (it) {
        var gap = cur ? it.x - cur.x1 : Infinity;
        var thr = Math.max(3, (it.h || 8) * 0.55);
        if (cur && gap < thr) {
          cur.text += (gap > 0.8 ? ' ' : '') + it.str.trim(); cur.x1 = Math.max(cur.x1, it.x + it.w);
        } else {
          cur = { text: it.str.trim(), x0: it.x, x1: it.x + it.w, h: it.h || 8 }; cells.push(cur);
        }
      });
      r.cells = cells;
      r.h = Math.max.apply(null, cells.map(function (c) { return c.h; }));
      r.x0 = cells[0].x0; r.x1 = cells[cells.length - 1].x1;
      r.text = cells.map(function (c) { return c.text; }).join(' ');
    });
    return rows;
  }

  // Yan yana tablolar: başlık satırı kendini tekrar ediyorsa (KOD BOYUT TL | KOD BOYUT TL | ...) bölme yerlerini bul
  function repeatSplits(r) {
    var c = r.cells, n = c.length;
    if (n < 4) return null;
    for (var p = 2; p <= n / 2; p++) {
      if (n % p) continue;
      var same = true;
      for (var k = p; k < n && same; k++) if (fold(c[k].text) !== fold(c[k - p].text)) same = false;
      if (!same) continue;
      var numeric = false;
      for (var q = 0; q < p; q++) if (isNum(c[q].text)) numeric = true;
      if (numeric) continue;
      var xs = [];
      for (var g = p; g < n; g += p) xs.push((c[g - 1].x1 + c[g].x0) / 2);
      return xs;
    }
    return null;
  }
  // Sayısal hücre: rakamla başlar (ölçü, fiyat, adet). "D1", "SW3" gibi sütun adları sayısal değildir.
  function isNum(t) { return /^[\d(+\-ØøO]?\s?\d/.test(t); }
  function isDataRow(r) {
    var n = r.cells.length;
    if (n < 3) return false;
    var d = r.cells.filter(function (c) { return isNum(c.text); }).length;
    return d >= Math.max(2, Math.ceil(n * 0.4));
  }

  // ---- Sütun rolleri ----
  var RE_CODE = /(^|[^a-z])(code|kod|kodu|art|part ?no|ref|stok|siparis|item ?no|urun no|model)([^a-z]|$)/;
  var RE_PRICE = /fiyat|price|tutar|bedel/;
  var RE_VAT = /kdv ?li|kdv dahil|kdvli|incl/;
  var RE_SIZE = /(^|[^a-z])(dn|size|olcu[a-z]*|ebat|cap|capi|litre|hacim|nps|boyut[a-z]*|anma|nominal)([^a-z]|$)/;
  var RE_MODEL = /(^|[^a-z])(urun tipi|model|modeli|tip|tipi|type)([^a-z]|$)/;
  // Firma / adres / tarih yazısı ürün adı değildir (fiyat listelerinin üst bilgisi)
  var RE_FIRM = /(^|[^a-z])(a\.s|ltd|sti|san\.|tic\.|sanayi ve ticaret|mak\.|muh\.|ins\.|tarih|kdv|telefon|tel ?:|tel\.|fax|faks|adres|hazirlanmistir|bayi ve servisi|fiyatlara|tarihli liste|yerine gecer|gecer|bu liste)([^a-z]|$)|\(?\d{3}\)? ?\d{3} ?\d{2} ?\d{2}/;
  function isFirm(t) { return RE_FIRM.test(fold(t)); }
  // Başlıktaki belge sözleri atılır: "MARİN BOYLER FİYAT LİSTESİ" → "MARİN BOYLER"; geriye bir şey kalmazsa başlık değildir
  var RE_DOCW = /((ö|o)ner[iİı]len\s+|tavs[iİı]ye\s+ed[iİı]len\s+)?(bay[iİı]\s+)?(sat[ıiİ][şs]\s+)?(f[iİı]yat\s+l[iİı]stes[iİı]|pr[iİı]ce\s+l[iİı]st|f[iİı]yat\s+tekl[iİı]f[iİı])\s*|(ö|o)ner[iİı]len\s+bay[iİı]\s+sat[ıiİ][şs]\s*/gi;
  function titleText(t) { return String(t).replace(RE_DOCW, ' ').replace(/\s+/g, ' ').trim(); }
  var RE_UNIT = /(^|\s)(mm|cm|inch|inc|bar|lt|kg|m)$/;
  // Ürün adı olamayacak genel ara yazılar (katalogda tablonun hemen üstünde durur)
  var RE_GENERIC = /^(standard|technical|teknik|specification|spesifikasyon|ozellik|configuration|included|blister|color box|colour box|ordering|order info|model|accessor|aksesuar|dimension|olcu)|configuration/;
  // Ad gibi duran yazı: en az iki harfli sözcük, çoğu harf (OCR kırıntısı ya da ölçü yazısı değil)
  function looksName(t) {
    var w = String(t).split(/\s+/).filter(function (x) { return /[A-Za-zÇĞİÖŞÜçğıöşü]{3,}/.test(x); });
    var letters = (String(t).match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g) || []).length;
    return w.length >= 2 && t.length >= 8 && t.length <= 80 && letters >= 0.5 * String(t).replace(/\s/g, '').length;
  }
  function looksCode(v) { return /^[A-Za-z0-9][A-Za-z0-9\-\/\.]{4,}$/.test(v) && hasDigit(v) && !/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(v) && !/,/.test(v); }
  function looksMoney(v) { return /^\d{1,3}(\.\d{3})*,\d{2}$/.test(v) || /^\d+,\d{2}$/.test(v); }
  function toNum(s) {
    var t = String(s).replace(/TL|₺|€|EUR|USD|\$/gi, '').trim();
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) t = t.replace(/,/g, ''); // 86,996 / 1,250.50: virgül binlik ayırıcı
    else t = t.replace(/\./g, '');
    var n = parseFloat(t); return isNaN(n) ? null : n;
  }
  function isCurSym(v) { return /^(€|\$|₺|tl|try|eur|euro|usd)$/i.test(String(v).trim()); }
  function curOf(s) { return /€|EUR/i.test(s) ? 'EUR' : (/\$|USD/i.test(s) ? 'USD' : 'TL'); }
  function cleanTitle(s) {
    return String(s || '').replace(/f[iİı]yat\s+l[iİı]stes[iİı]/gi, ' ').replace(/price\s+list/gi, ' ')
      .replace(/\s+/g, ' ').replace(/^[\s\-–:,.\/]+|[\s\-–:,.\/]+$/g, '').trim();
  }

  // ---- Bir sayfa parçasındaki tabloları bul ----
  var RE_LET = /[A-Za-zÇĞİÖŞÜçğıöşü]{3}/;
  function firstDigitX(r) { for (var n = 0; n < r.cells.length; n++) if (hasDigit(r.cells[n].text)) return r.cells[n].x0; return r.x0; }
  var lastTable = null; // önceki sayfadaki son başlıklı tablo (sayfa başında başlıksız devam eden tablo için)
  function tablesIn(rows, pageNo) {
    var tables = [], used = {};
    var i = 0;
    while (i < rows.length) {
      if (!isDataRow(rows[i])) { i++; continue; }
      // Veri satırlarını topla. Tablonun solunda/sağında kalan açıklama yazıları araya girerse atla.
      var idx = [i], j = i, coreX = firstDigitX(rows[i]), n0 = i + 1, floats = [], groups = [];
      while (n0 < rows.length) {
        var nr = rows[n0], lastD = rows[idx[idx.length - 1]];
        if (lastD.y - nr.y > 40) break;
        // OCR'lı sayfada büyük yazılı, adla başlayan satır bir sonraki ürünün başlığıdır, bu tabloya katılmaz
        if (OCRP && nr.h >= lastD.h * 1.3 && looksName(nr.cells[0].text)) break;
        if (isDataRow(nr)) { idx.push(n0); j = n0; coreX = Math.min(coreX, firstDigitX(nr)); n0++; continue; }
        // Birleşik hücrenin ortasına yazılmış kısa etiket (SERİ, TİP değeri) satırların arasına düşer
        if (nr.cells.length <= 2 && nr.cells.every(function (c) { return c.text.length <= 10; }) && n0 + 1 < rows.length && isDataRow(rows[n0 + 1]) && lastD.y - rows[n0 + 1].y < 40) {
          nr.cells.forEach(function (c) { floats.push({ text: c.text, x0: c.x0, x1: c.x1, y: nr.y }); }); used[n0] = true; n0++; continue;
        }
        // Tablonun ortasındaki tek hücreli grup başlığı (örn. "ALK 7\" Serisi"): tablo bölünmez, alttaki satırlara özellik olarak yazılır
        if (!OCRP && nr.cells.length === 1 && nr.text.length <= 40 && RE_LET.test(nr.text) && !isFirm(nr.text) && n0 + 1 < rows.length && isDataRow(rows[n0 + 1]) &&
          lastD.y - rows[n0 + 1].y < 45 && nr.x0 > coreX + 3 && nr.x1 < rows[idx[0]].x1) {
          groups.push({ y: nr.y, text: nr.text }); used[n0] = true; n0++; continue;
        }
        if (nr.x1 < coreX - 3) { n0++; continue; }
        break;
      }
      if (idx.length < 2) { i = j + 1; continue; }
      var data = idx.map(function (n) { return rows[n]; });
      var rx0 = Math.min.apply(null, data.map(function (r) { return r.x0; }));
      var rx1 = Math.max.apply(null, data.map(function (r) { return r.x1; }));

      // Sütunlar: veri hücrelerinin yatay aralıkları üst üste biniyorsa aynı sütun
      var width = rx1 - rx0, iv = [];
      data.forEach(function (r) { r.cells.forEach(function (c) { if (c.x1 - c.x0 < width * 0.4) iv.push([c.x0, c.x1]); }); });
      floats.forEach(function (c) { iv.push([c.x0, c.x1]); });
      iv.sort(function (a, b) { return a[0] - b[0]; });
      var cols = [];
      iv.forEach(function (v) {
        var last = cols[cols.length - 1];
        if (last && v[0] < last.x1 - 0.5) last.x1 = Math.max(last.x1, v[1]);
        else cols.push({ x0: v[0], x1: v[1], labels: [] });
      });
      function colOf(c, list) {
        var best = -1, bo = 0, bd = Infinity, near = -1;
        (list || cols).forEach(function (col, n) {
          var o = Math.min(c.x1, col.x1) - Math.max(c.x0, col.x0);
          if (o > bo) { bo = o; best = n; }
          var d = Math.max(0, col.x0 - c.x1, c.x0 - col.x1); if (d < bd) { bd = d; near = n; }
        });
        return best >= 0 ? best : near;
      }
      function gridOf() {
        return data.map(function (r) {
          var vals = cols.map(function () { return ''; });
          r.cells.forEach(function (c) { var n = colOf(c); if (n >= 0) vals[n] = (vals[n] ? vals[n] + ' ' : '') + c.text; });
          return vals;
        });
      }
      var grid = gridOf();
      function fill(n) { return grid.filter(function (g) { return g[n]; }).length / grid.length; }
      function share(n, fn) { var v = grid.map(function (g) { return g[n]; }).filter(Boolean); return v.length ? v.filter(fn).length / v.length : 0; }
      // Tablonun kenarında kalan, az dolu ve sayısız sütunlar tabloya ait değildir (yandaki açıklama yazısı)
      var lo = 0, hi = cols.length - 1;
      while (lo < hi && fill(lo) < 0.4 && share(lo, hasDigit) < 0.3) lo++;
      while (hi > lo && fill(hi) < 0.4 && share(hi, hasDigit) < 0.3) hi--;
      if (lo > 0 || hi < cols.length - 1) {
        var keep = cols.slice(lo, hi + 1), kx0 = keep[0].x0 - 2, kx1 = keep[keep.length - 1].x1 + 2;
        data = data.map(function (r) {
          var cs = r.cells.filter(function (c) { return c.x1 > kx0 && c.x0 < kx1; });
          return { y: r.y, h: r.h, cells: cs, x0: cs.length ? cs[0].x0 : r.x0, x1: cs.length ? cs[cs.length - 1].x1 : r.x1 };
        }).filter(function (r) { return r.cells.length; });
        cols = keep; grid = gridOf();
      }
      var tx0 = cols[0].x0, tx1 = cols[cols.length - 1].x1;
      function inRange(r) { return r.cells.filter(function (c) { return c.x1 > tx0 - 4 && c.x0 < tx1 + 4; }); }
      function textIn(r) { return inRange(r).map(function (c) { return c.text; }).join(' '); }

      // Başlık satırları: tablonun hemen üstünde, sayı içermeyen sütun adları
      var head = [], k = i - 1, lastY = rows[i].y, topHead = -1, seen = 0;
      for (var s = i - 1; s >= 0 && seen < 4; s--) {
        var cs0 = inRange(rows[s]).filter(function (c) { return !isFirm(c.text); });
        if (!cs0.length) continue;
        if (rows[s].y - lastY > 60) break;
        seen++;
        var dg = cs0.filter(function (c) { return isNum(c.text); }).length;
        if (cs0.length >= 2 && dg / cs0.length < 0.5) topHead = s;
        else if (!(cs0.length === 1 && cs0[0].text.length <= 14 && cs0[0].x1 - cs0[0].x0 < width * 0.3)) break;
        lastY = rows[s].y;
      }
      if (topHead >= 0) {
        for (var s2 = i - 1; s2 >= topHead; s2--) { var c2 = inRange(rows[s2]); if (c2.length) { head.unshift({ cells: c2, y: rows[s2].y, text: textIn(rows[s2]) }); used[s2] = true; } }
        k = topHead - 1;
      }
      // Sütun adları: başlık hücresi hangi sütunların üstündeyse onlara yazılır
      head.forEach(function (hr) {
        hr.cells.forEach(function (c) {
          var hit = false;
          cols.forEach(function (col) {
            var o = Math.min(c.x1, col.x1) - Math.max(c.x0, col.x0);
            if (o > 1) { col.labels.push(c.text); hit = true; }
          });
          if (!hit) { var n = colOf(c); if (n >= 0) cols[n].labels.push(c.text); }
        });
      });
      cols.forEach(function (col) { col.label = col.labels.join(' ').replace(/\s+/g, ' ').trim(); col.f = fold(col.label); });
      // Başlıksız tablo bir önceki sayfanın son tablosunun devamıysa (aynı sütunlar), sütun adları ve ürün adı oradan alınır
      var carried = null;
      if (!head.length && lastTable && lastTable.page === pageNo - 1 && lastTable.cols.length === cols.length &&
        cols.every(function (c, n) { return Math.abs(c.x0 - lastTable.cols[n].x0) < 15 || Math.abs(c.x1 - lastTable.cols[n].x1) < 15; })) {
        carried = lastTable; cols.forEach(function (col, n) { col.label = lastTable.cols[n].label; col.f = fold(col.label); });
      }

      // Birleşik hücreli sütunlar (SERİ, TİP): değer birkaç satırda yazılıdır, en yakın satırlara yayılır
      cols.forEach(function (col, n) {
        if (!/(^|[^a-z])(seri|serie|series|tip|type|grup|group)([^a-z]|$)/.test(col.f) || RE_CODE.test(col.f)) return;
        var f = fill(n); if (f > 0.5) return;
        var marks = []; grid.forEach(function (g, i) { if (g[n]) marks.push({ y: data[i].y, v: g[n] }); });
        floats.forEach(function (c) { if (colOf(c) === n) marks.push({ y: c.y, v: c.text }); });
        if (!marks.length) return;
        grid.forEach(function (g, i) {
          var best = marks[0];
          marks.forEach(function (m) { if (Math.abs(m.y - data[i].y) < Math.abs(best.y - data[i].y)) best = m; });
          g[n] = best.v;
        });
        col.spread = /(tip|type)/.test(col.f) ? 'tip' : 'seri';
      });

      // Roller
      var role = cols.map(function () { return 'spec'; }), codeC = -1, priceC = -1, vatC = -1, sizeC = -1;
      var codeCols = [], priceCols = [];
      cols.forEach(function (col, n) { if (RE_CODE.test(col.f) && share(n, hasDigit) >= 0.5) codeCols.push(n); });
      // Kod sütunu yoksa: ÜRÜN TİPİ / MODEL sütunundaki, her satırda farklı, harf ve rakam içeren ad ("4 SD 2/8") koddur
      if (!codeCols.length) for (var n1b = 0; n1b < cols.length; n1b++) {
        if (!RE_MODEL.test(cols[n1b].f) || /seri|serie|series|grup|group/.test(cols[n1b].f) || fill(n1b) < 0.9) continue;
        var mv = grid.map(function (g) { return g[n1b]; }).filter(Boolean), uq = {};
        mv.forEach(function (v) { uq[v] = 1; });
        if (Object.keys(uq).length >= mv.length * 0.9 && mv.every(function (v) { return v.length <= 30 && hasDigit(v) && (/[A-Za-z]/.test(v) ? !/^[\d.,\/\s"'x×-]+(mm|cm|inch|bar|lt|kg)$/i.test(v) : /\d{3,}.*[\/-]|[\/-].*\d{3,}/.test(v)); })) { codeCols.push(n1b); break; }
      }
      if (!codeCols.length) for (var n1 = 0; n1 < cols.length; n1++) {
        if (/(^|[^a-z])(basinc|debi|mss|bar|kw|hp|guc|gucu|kademe|pressure|flow)([^a-z]|$)/.test(cols[n1].f)) continue; // ölçü sütunu kod değildir (61-35-23 basınç)
        if (share(n1, looksCode) >= 0.8 && fill(n1) >= 0.8 && share(n1, function (v) { return /[A-Za-z]/.test(v) || v.length >= 6; }) >= 0.8) { codeCols.push(n1); break; }
      }
      codeC = codeCols.length ? codeCols[0] : -1;
      cols.forEach(function (col, n) {
        if (codeCols.indexOf(n) >= 0) return;
        if (RE_VAT.test(col.f)) { if (vatC < 0) vatC = n; }
        else if (RE_PRICE.test(col.f) || (/^(tl|eur|usd|euro|€|\$)$/.test(col.f) && share(n, isNum) >= 0.8)) priceCols.push(n);
      });
      if (!priceCols.length && vatC < 0) {
        cols.forEach(function (col, n) { if (codeCols.indexOf(n) < 0 && share(n, looksMoney) >= 0.9 && fill(n) >= 0.8) priceCols.push(n); });
        if (priceCols.length > 1) { vatC = priceCols[priceCols.length - 1]; priceCols = [priceCols[0]]; }
      }
      priceC = priceCols.length ? priceCols[0] : -1;
      // Aynı tabloda birden çok kod + fiyat çifti (örn. TAKIM ve GÖVDE): her çift ayrı tekliftir
      var pairs = [], priceVars = null;
      // Tek kodlu satırda birden çok fiyat sütunu (örn. TAKIM / MOTOR / POMPA FİYATI): her fiyat ayrı seçenektir
      if (codeCols.length <= 1 && priceCols.length >= 2) {
        var pl = priceCols.map(function (n) { return cols[n].label.replace(/[()\/:]/g, ' ').split(/\s+/).filter(function (w) { return w && !isFirm(w) && !/^\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}$/.test(w) && !/^(fiyat|fiyati|fiyatlari|price|prices|liste|list|tl|eur|euro|usd|€|\$)$/.test(fold(w)); }).join(' '); });
        if (pl.every(Boolean) && pl.filter(function (v, i) { return pl.indexOf(v) === i; }).length === pl.length) priceVars = pl;
      }
      // Fiyatsız tabloda iki kod sütunu (örn. CODE STOP / CODE SDNR): her kod ayrı seçenektir
      if (codeCols.length >= 2 && (priceCols.length >= 2 || (!priceCols.length && vatC < 0))) {
        codeCols.forEach(function (cc, i) {
          var next = i + 1 < codeCols.length ? codeCols[i + 1] : cols.length;
          var pc = priceCols.filter(function (x) { return x > cc && x < next; })[0];
          var lab = cols[cc].label.replace(/\b(KOD|CODE|KODU)\b/gi, ' ').replace(/\s+/g, ' ').trim();
          pairs.push({ code: cc, price: pc == null ? -1 : pc, variant: lab.split('/')[0].trim() });
        });
      }
      codeCols.forEach(function (n) { role[n] = 'code'; });
      priceCols.forEach(function (n) { role[n] = 'price'; });
      // Yalnız para birimi yazan sütun (€ / $ / TL) fiyatın birimidir; her satırda başlığını tekrar eden sütun (ADET / ADET) bilgi taşımaz
      var curC = -1;
      cols.forEach(function (col, n) {
        if (role[n] !== 'spec' || n === vatC || col.spread) return;
        if (share(n, isCurSym) >= 0.9 && fill(n) >= 0.5) { role[n] = 'cur'; curC = n; }
        else if (col.f && share(n, function (v) { return fold(v) === col.f; }) >= 0.9) role[n] = 'skip';
      });
      if (curC >= 0) cols.forEach(function (col) { if (isCurSym(col.label)) { col.label = ''; col.f = ''; } });
      cols.forEach(function (col, n) {
        if (role[n] !== 'spec' || n === vatC || col.spread) return;
        if (sizeC < 0 && RE_SIZE.test(col.f)) sizeC = n;
      });
      if (sizeC < 0) for (var n2 = 0; n2 < cols.length; n2++) {
        if (role[n2] !== 'spec' || n2 === vatC || cols[n2].spread) continue;
        if (fill(n2) >= 0.9) { sizeC = n2; break; }
      }
      if (vatC >= 0) role[vatC] = 'vat';
      if (sizeC >= 0) role[sizeC] = 'size';

      // Ürün adı: tablonun üstündeki başlık (bir ya da iki satır). Yakında yoksa sayfanın üst başlığı.
      function isTitle(tt) { return tt.length >= 4 && RE_LET.test(tt) && !/www\.|@|https?:|e-?mail|web:/i.test(tt); }
      // Başlık yazısı: firma / adres / tarih hücreleri atılır (fiyat listesinin üst bilgisi ürün adı olmasın)
      function titleOf(r, all) { return (all ? r.cells : inRange(r)).filter(function (c) { return !isFirm(c.text); }).map(function (c) { return titleText(c.text); }).filter(Boolean).join(' '); }
      var name = '', sub = '', topY = (head[0] || rows[i]).y, titleRow = null, looked = 0, far = false;
      for (var t = k; t >= 0 && looked < 3; t--) {
        var tr = rows[t], tt = textIn(tr);
        if (!tt) continue;
        if (tr.y - topY > 75 || isDataRow(tr)) break;
        looked++;
        if (!isTitle(titleOf(tr))) continue;
        // Başlığın üst satırına taşmış tek kelimelik sütun adı (örn. PRODUCT / CODE) ürün adı değildir
        var ci = inRange(tr);
        if (head.length && ci.length === 1 && tt.length <= 14 && !/\s/.test(tt) && tr.y - topY < tr.h * 2.2) { ci.forEach(function (c) { var n = colOf(c); if (n >= 0) { cols[n].label = (c.text + ' ' + cols[n].label).trim(); cols[n].f = fold(cols[n].label); } }); used[t] = true; continue; }
        titleRow = t; break;
      }
      if (titleRow == null) {
        for (var t3 = k; t3 >= 0; t3--) {
          if (isDataRow(rows[t3])) break;
          if (used[t3] || !isTitle(titleOf(rows[t3], true)) || titleOf(rows[t3], true).length > 90) continue;
          titleRow = t3; far = true; break;
        }
      }
      // Büyük yazılı başlık: tablonun hemen üstünde genel bir ara yazı varsa (örn. "Standard Pump Configurations", "Blister")
      // ya da yakında başlık yoksa, ürünün asıl adı aynı sütunda daha yukarıdaki büyük yazılı başlıktır (açıklama ve resim arada kalır).
      var dh = median(data.map(function (r) { return r.h; }));
      var nearT = titleRow != null ? titleOf(rows[titleRow], far) : '';
      if (OCRP && dh > 0 && (titleRow == null || far || RE_GENERIC.test(fold(nearT)) || !looksName(nearT))) {
        var bigT = null, bigH = 0;
        for (var t4 = k; t4 >= 0; t4--) {
          var r4 = rows[t4];
          // Üstteki başka ürünün tablosuna gelince durulur; henüz tablo sayılmamış küçük ara tablolar (aksesuar listesi) atlanır
          if ((isDataRow(r4) && used[t4]) || r4.y - topY > 520) break;
          var c4 = r4.cells.filter(function (c) { return c.x1 > rx0 - 20 && c.x0 < rx1 + 4; }); if (!c4.length) continue;
          var hh = Math.max.apply(null, c4.map(function (c) { return c.h; })), tx4 = c4.map(function (c) { return c.text; }).join(' ');
          // Sayı içeren başlık ("... 01 Series (350 500 750 GPH)") veri satırı gibi görünür; büyük yazılıysa yine aday sayılır
          if (isDataRow(r4) && !(hh >= dh * 1.3 && looksName(tx4))) continue;
          // Ürün bloğunun en üstündeki büyük yazı seçilir (başlık üstte, açıklama maddeleri altında)
          if (hh >= dh * 1.3 && hh <= dh * 3.2 && looksName(tx4) && isTitle(tx4) && !RE_GENERIC.test(fold(tx4)) && !used[t4]) { bigT = t4; bigH = hh; }
        }
        if (bigT != null) { titleRow = bigT; far = false; }
      }
      var tText = function (r) { return titleOf(r, far); };
      if (titleRow != null) {
        var t1 = rows[titleRow]; name = tText(t1); used[titleRow] = true; if (!far) topY = t1.y;
        for (var u0 = titleRow - 1; u0 >= 0; u0--) {
          var up = rows[u0], ut = tText(up);
          if (!ut) continue;
          if (!isDataRow(up) && (up.y - t1.y) < Math.max(t1.h, up.h) * 2.2 && isTitle(ut)) {
            sub = name; name = ut; used[u0] = true; if (!far) topY = up.y;
            // Üç satırlı başlık (örn. "PN 16 KÜRESEL VANA" / "TAM GEÇİŞLİ" / "Full Bore Ball Valve"): ilk iki satır addır
            for (var u1 = u0 - 1; u1 >= 0 && !far; u1--) {
              var up2 = rows[u1], ut2 = tText(up2);
              if (!ut2) continue;
              if (!isDataRow(up2) && (up2.y - up.y) < Math.max(up.h, up2.h) * 1.6 && isTitle(ut2) && Math.abs(up2.h - up.h) < 1.5) { name = ut2 + ' ' + name; used[u1] = true; topY = up2.y; }
              break;
            }
          }
          break;
        }
      }
      var cur = curOf(head.map(function (h) { return h.text; }).join(' ') + ' ' + name);

      var out = [];
      grid.forEach(function (g, n) {
        var specs = [], prev = null, tip = '';
        cols.forEach(function (col, c) {
          if (role[c] !== 'spec' || !g[c]) return;
          if (col.spread === 'tip') { tip = g[c]; return; }
          // Aynı başlığın altındaki yan yana sütunlar tek özelliktir (örn. "Holes x Dia": 4 x 12)
          if (prev && prev.label && prev.label === col.label && prev.c === c - 1) { prev.val += (/\sx\s/i.test(col.label) ? ' x ' : ' ') + g[c]; prev.c = c; }
          else { prev = { label: col.label, val: g[c], c: c }; specs.push(prev); }
        });
        var size = sizeC >= 0 ? g[sizeC] : '';
        if (size) { var um = cols[sizeC].f.match(RE_UNIT); if (um && /^[\d.,\/ ]+$/.test(size)) size += ' ' + um[2]; else if (/^dn$/.test(cols[sizeC].f) && /^\d+$/.test(size)) size = 'DN' + size; }
        if (tip) size = (size + ' ' + tip).trim();
        var grp = groups.filter(function (gr) { return gr.y > data[n].y; }).pop();
        if (grp) specs.unshift({ label: '', val: grp.text });
        var specText = specs.map(function (x) { return (x.label ? x.label + ' ' : '') + x.val; }).join(' · ');
        function mk(code, p, variant, pv) {
          return { code: code || '', size: size, variant: variant || '', price: p ? toNum(p) : null, cur: p && curOf(p) !== 'TL' ? curOf(p) : (curC >= 0 && g[curC] ? curOf(g[curC]) : cur),
            priceVat: pv ? toNum(pv) : null, specs: specText, y: data[n].y };
        }
        if (priceVars) {
          priceCols.forEach(function (pc, i) { if (g[pc]) out.push(mk(codeC >= 0 ? g[codeC] : '', g[pc], priceVars[i], '')); });
        } else if (pairs.length) {
          pairs.forEach(function (pr) { if (g[pr.code]) out.push(mk(g[pr.code], pr.price >= 0 ? g[pr.price] : '', pr.variant, '')); });
        } else {
          var p = priceC >= 0 ? g[priceC] : (vatC >= 0 ? g[vatC] : '');
          out.push(mk(codeC >= 0 ? g[codeC] : '', p, '', vatC >= 0 && priceC >= 0 ? g[vatC] : ''));
        }
      });
      out = out.filter(function (r) { return r.code || r.size || r.price != null; });

      idx.forEach(function (n) { used[n] = true; });
      if (carried && !name) { name = carried.name; sub = carried.sub; }
      if (head.length && out.length >= 2) lastTable = { page: pageNo, cols: cols.map(function (c) { return { x0: c.x0, x1: c.x1, label: c.label }; }), name: name, sub: sub };
      else if (carried && out.length >= 2) lastTable.page = pageNo;
      if (out.length >= 2) {
        tables.push({
          page: pageNo, name: cleanTitle(name), sub: cleanTitle(sub), rows: out,
          hasCode: codeC >= 0, hasPrice: priceC >= 0 || vatC >= 0, far: far,
          columns: cols.map(function (c, n) { return { label: c.label, role: role[n] }; }),
          box: { x0: tx0, x1: tx1, y0: rows[j].y - rows[j].h, y1: topY + 10 }
        });
      }
      i = j + 1;
    }
    var loose = rows.filter(function (r, n) { return !used[n]; });
    return { tables: tables, loose: loose };
  }

  // ---- Resimleri tablolara bağla: bir resim, yanındaki tablonun bütün satırlarına aittir ----
  function gapDist(b, img) {
    var dx = Math.max(0, b.x0 - (img.x + img.w), img.x - b.x1);
    var dy = Math.max(0, b.y0 - (img.y + img.h), img.y - b.y1);
    return Math.sqrt(dx * dx + dy * dy);
  }
  function attach(tables, images) {
    var good = images.filter(function (m) {
      var a = m.w / m.h; return Math.min(m.w, m.h) >= 38 && a > 0.2 && a < 5;
    });
    good.forEach(function (m, n) {
      var best = null, bd = Infinity;
      tables.forEach(function (t) { var d = gapDist(t.box, m); if (d < bd) { bd = d; best = t; } });
      if (best && bd <= (best.far ? 420 : 170)) {
        var score = m.w * m.h / (1 + bd / 40);
        (best._c = best._c || []).push({ id: m.id, score: score });
        if (!best._img || score > best._score) { best._img = m; best._score = score; }
      }
    });
    if (tables.length === 1 && !tables[0]._img && good.length) {
      tables[0]._img = good.slice().sort(function (a, b) { return b.w * b.h - a.w * a.h; })[0];
    }
    // img: en uygun resim; imgs: adaylar (uygulama teknik çizim yerine fotoğrafı seçebilsin)
    tables.forEach(function (t) {
      t.img = t._img ? t._img.id : null;
      t.imgs = (t._c || []).sort(function (a, b) { return b.score - a.score; }).map(function (c) { return c.id; });
      if (t.img != null && t.imgs.indexOf(t.img) < 0) t.imgs.unshift(t.img);
      delete t._img; delete t._score; delete t._c;
    });
  }

  // ---- Birleşik hücreler: değer, kapsadığı satırların (ya da sütunların) tam ortasına yazılır ----
  // pos: sıralı konumlar; centers: aynı yönde sıralı değer konumları. Her değere ardışık bir grup verilir;
  // grubun ortası değerin konumuna en yakın olacak biçimde bölünür. Boş hücreler atlanabilir (skip bedeli).
  // Dönen dizi: her konum için değer sırası ya da -1.
  function spanAssign(pos, centers, skip) {
    var n = pos.length, k = centers.length, INF = 1e9, i, j, c;
    var out = pos.map(function () { return -1; });
    if (!n || !k) return out;
    var cost = [], back = [];
    for (i = 0; i <= n; i++) { cost.push([]); back.push([]); for (c = 0; c <= k; c++) { cost[i].push(INF); back[i].push(null); } }
    cost[0][0] = 0;
    for (i = 0; i <= n; i++) for (c = 0; c <= k; c++) {
      var v = cost[i][c]; if (v >= INF) continue;
      if (i < n && v + skip < cost[i + 1][c]) { cost[i + 1][c] = v + skip; back[i + 1][c] = [i, c, false]; }
      if (c < k) for (j = i + 1; j <= n; j++) {
        var lo = Math.min(pos[i], pos[j - 1]), hi = Math.max(pos[i], pos[j - 1]);
        var e = Math.abs((lo + hi) / 2 - centers[c]);
        if (v + e < cost[j][c + 1]) { cost[j][c + 1] = v + e; back[j][c + 1] = [i, c, true]; }
      }
    }
    if (cost[n][k] >= INF) return out;
    i = n; c = k;
    while (i > 0 || c > 0) {
      var b = back[i][c]; if (!b) break;
      if (b[2]) for (j = b[0]; j < i; j++) out[j] = b[1];
      i = b[0]; c = b[1];
    }
    return out;
  }
  function ctr(c) { return (c.x0 + c.x1) / 2; }
  // Tamamı büyük harf yazılıp yalnız "i" küçük bırakılmış başlıklar (HACiM, SERPANTiNLi) düzeltilir
  function fixI(t) { return /[a-hj-zçğıöşü]/.test(t) ? t : t.replace(/i/g, 'İ'); }
  function pureNum(v) { return /^[\d.,]+(\s?[-–]\s?[\d.,]+)?$/.test(v); }

  // ---- Ters tablo: modeller sütunda, özellikler satırda (örn. HACİM lt 65 80 100 ... altında İç Çap, Dış Çap ...) ----
  var RE_AXIS = /(^|[^a-z])(hacim|hacmi|model|tip|type|kapasite|capacity|volume|boyut|size|olcu|dn|litre|guc|power|kw|hp)([^a-z]|$)/;
  function tersTablo(rows, pageNo) {
    var tables = [], bands = [];
    for (var i = 0; i < rows.length; i++) {
      var hr = rows[i], hc = hr.cells;
      if (hc.length < 4 || isNum(hc[0].text) || !RE_AXIS.test(fold(hc[0].text))) continue;
      var models = [], unit = '', bad = false;
      hc.slice(1).forEach(function (c) {
        if (hasDigit(c.text)) models.push(c);
        else if (!models.length && !unit && c.text.length <= 6) unit = c.text;
        else bad = true;
      });
      var n = models.length;
      if (bad || n < 3) continue;
      var lx = hc[0].x0, mc = models.map(ctr), pitch = (mc[n - 1] - mc[0]) / (n - 1), left = mc[0] - pitch / 2;
      var ents = [], orph = [], last = hr.y, j = i + 1;
      for (; j < rows.length; j++) {
        var r = rows[j];
        if (last - r.y > 60) break;
        var lab = r.cells.filter(function (c) { return Math.abs(c.x0 - lx) <= 3 && RE_LET.test(c.text) && c.x1 < left + pitch; })[0];
        var vals = r.cells.filter(function (c) { return c !== lab && c.x0 > lx + 3 && ctr(c) > left; });
        if (lab) {
          var un = r.cells.filter(function (c) { return c !== lab && c.x0 > lab.x1 && ctr(c) <= left && c.text.length <= 6; })[0];
          ents.push({ label: lab.text, unit: un ? un.text : '', vals: vals, y: r.y, extra: [] }); last = r.y;
        } else if (r.cells.every(function (c) { return c.x1 <= lx + 1; })) continue;   // yalnız simge (T2, S2)
        else if (vals.length && r.cells.every(function (c) { return c.x1 <= lx + 1 || vals.indexOf(c) >= 0 || (c.x0 > lx + 3 && ctr(c) <= left && c.text.length <= 6); })) {
          var ou = r.cells.filter(function (c) { return c.x1 > lx + 1 && vals.indexOf(c) < 0; })[0];
          orph.push({ y: r.y, vals: vals, unit: ou ? ou.text : '' }); last = r.y;
        }
        else break;
      }
      var aligned = ents.filter(function (e) { return e.vals.length === n && e.vals.every(function (c, q) { return Math.abs(ctr(c) - mc[q]) < pitch / 2; }); }).length;
      if (ents.length < 4 || aligned < 2) continue;
      var ys = ents.map(function (e) { return e.y; }), gaps = [];
      for (var g = 1; g < ys.length; g++) gaps.push(ys[g - 1] - ys[g]);
      var rp = median(gaps) || 20;
      // İki satıra bölünmüş etiket (değeri iki satırın ortasında) tek özelliktir
      for (var e1 = ents.length - 1; e1 > 0; e1--) {
        var ea = ents[e1 - 1], eb = ents[e1];
        if (ea.y - eb.y < rp * 0.6 && (!ea.vals.length || !eb.vals.length)) {
          ea.label += ' ' + eb.label; ea.vals = ea.vals.concat(eb.vals); ea.unit = ea.unit || eb.unit; ea.y = (ea.y + eb.y) / 2; ents.splice(e1, 1);
        }
      }
      orph.forEach(function (o) {
        var best = null;
        ents.forEach(function (e) { if (!best || Math.abs(e.y - o.y) < Math.abs(best.y - o.y)) best = e; });
        if (best && Math.abs(best.y - o.y) < rp * 0.95) { best.extra.push(o); if (!best.unit && o.unit) best.unit = o.unit; }
      });
      var bottom = Math.min.apply(null, ents.map(function (e) { return e.y; }).concat(orph.map(function (o) { return o.y; })));
      // Her özelliğin her modeldeki değeri
      ents.forEach(function (e) {
        var multi = e.extra.length >= 2 || (e.extra.length === 1 && e.vals.length);
        if (multi) {
          var all = e.vals.map(function (c) { return { y: e.y, c: c }; });
          e.extra.forEach(function (o) { o.vals.forEach(function (c) { all.push({ y: o.y, c: c }); }); });
          all.sort(function (a, b) { return b.y - a.y || a.c.x0 - b.c.x0; });
          var txt = all.map(function (a) { return a.c.text; }).join(' / ');
          e.per = mc.map(function () { return txt; });
        } else {
          var vs = e.vals.length ? e.vals : (e.extra[0] ? e.extra[0].vals : []);
          if (vs.length === 1) e.per = mc.map(function () { return vs[0].text; });
          else { var as = spanAssign(mc, vs.map(ctr), pitch * 0.3); e.per = as.map(function (q) { return q >= 0 ? vs[q].text : ''; }); }
        }
      });
      // Ad: tablonun üstündeki başlık ("... Teknik Özellikler" eki atılır)
      var name = '', topY = hr.y, looked = 0;
      for (var t = i - 1; t >= 0 && looked < 2; t--) {
        if (rows[t].y - hr.y > 70) break;
        looked++;
        if (RE_LET.test(rows[t].text) && rows[t].text.length <= 90 && !isDataRow(rows[t])) { name = rows[t].text; topY = rows[t].y; break; }
      }
      name = cleanTitle(name.replace(/tekn[iİı]k\s+[öÖoO]zell[iİı]kler[iİı]?/gi, ' ').replace(/technical\s+(data|specifications?|features)/gi, ' '));
      var out = models.map(function (m, q) {
        var sp = [];
        ents.forEach(function (e) {
          var v = e.per[q]; if (!v || /^[-–—]+$/.test(v)) return;
          sp.push(fixI(e.label) + ' ' + v + (e.unit && pureNum(v) ? ' ' + e.unit : ''));
        });
        return { code: '', size: m.text + (unit && pureNum(m.text) ? ' ' + unit : ''), variant: '', price: null, cur: 'TL', priceVat: null, specs: sp.join(' · '), y: hr.y };
      });
      tables.push({ page: pageNo, name: name, sub: '', rows: out, hasCode: false, hasPrice: false, far: false, kind: 'ters',
        columns: [{ label: fixI(hc[0].text), role: 'size' }].concat(ents.map(function (e) { return { label: e.label, role: 'spec' }; })),
        box: { x0: lx, x1: models[n - 1].x1, y0: bottom - 8, y1: topY + 10 } });
      bands.push([bottom - 2, topY + 2]);
      i = j - 1;
    }
    return { tables: tables, bands: bands };
  }

  // ---- Izgara tablo: birleşik hücreli fiyat listesi (örn. motor gücü ve fiyat birkaç satırı kapsar; 220 V / 380 V iki fiyat) ----
  function isBodyCell(t) { return !RE_LET.test(t) && (hasDigit(t) || /^\*+$/.test(t) || /^[-–—]$/.test(t)); }
  function izgara(rows, pageNo) {
    var n;
    function numericRow(r) { return r.cells.every(function (c) { return isBodyCell(c.text); }); }
    function sectionRow(r) { return r.cells.length <= 2 && RE_LET.test(r.text) && !r.cells.some(function (c) { return isBodyCell(c.text); }); }
    // Gövde: ardışık sayısal satırlar (aralarında bölüm başlıkları olabilir). En uzun dizi alınır.
    var top = -1, bot = -1, bestN = 0, a = -1, cnt = 0, lastNum = -1, secRun = 0;
    function close() { if (a >= 0 && cnt > bestN) { bestN = cnt; top = a; bot = lastNum; } a = -1; cnt = 0; secRun = 0; }
    rows.forEach(function (r, q) {
      var num = numericRow(r), gapOk = lastNum >= 0 && a >= 0 && rows[q - 1].y - r.y <= 40;
      if (num && r.cells.length >= 2 && (a < 0 || !gapOk)) { close(); a = q; cnt = 1; lastNum = q; }
      else if (num && a >= 0 && gapOk) { cnt++; lastNum = q; secRun = 0; }
      else if (a >= 0 && gapOk && sectionRow(r) && secRun < 2) secRun++;   // bölüm başlığı: dizi sürer
      else close();
    });
    close();
    if (bestN < 4) return null;
    // Kodlu tablolar (AS20401 gibi) olağan yolla okunur; yan yana dizilmiş kodlu tablolar bu düzenle karışmasın
    for (n = top; n <= bot; n++) if (numericRow(rows[n]) && rows[n].cells.some(function (c) { return /[A-Za-z]{2}/.test(c.text) && hasDigit(c.text) && c.text.length >= 5; })) return null;
    // Gövde satırları ve aradaki bölüm başlıkları
    var sections = [{ title: '', rows: [] }], body = [];
    for (n = top; n <= bot; n++) {
      var r = rows[n];
      if (sectionRow(r)) sections.push({ title: r.text, rows: [], y: r.y });
      else { sections[sections.length - 1].rows.push(r); body.push(r); }
    }
    // Sütunlar
    var iv = [];
    body.forEach(function (r) { r.cells.forEach(function (c) { iv.push([c.x0, c.x1]); }); });
    iv.sort(function (a, b) { return a[0] - b[0]; });
    var cols = [];
    iv.forEach(function (v) {
      var last = cols[cols.length - 1];
      if (last && v[0] < last.x1 - 0.5) last.x1 = Math.max(last.x1, v[1]);
      else cols.push({ x0: v[0], x1: v[1], labels: [] });
    });
    if (cols.length < 3) return null;
    function colOf(c) {
      var best = -1, bo = 0, bd = Infinity, near = -1;
      cols.forEach(function (col, q) {
        var o = Math.min(c.x1, col.x1) - Math.max(c.x0, col.x0);
        if (o > bo) { bo = o; best = q; }
        var d = Math.max(0, col.x0 - c.x1, c.x0 - col.x1); if (d < bd) { bd = d; near = q; }
      });
      return best >= 0 ? best : near;
    }
    function overlaps(c) { return cols.some(function (col) { return Math.min(c.x1, col.x1) - Math.max(c.x0, col.x0) > 1; }); }
    // Bu düzen yalnız birleşik hücre varsa kullanılır: en dolu sütunlarda hücresi olmayan, fiyat taşıyan en az iki satır
    var gc = cols.map(function () { return 0; });
    body.forEach(function (r) { var seen = {}; r.cells.forEach(function (c) { var q = colOf(c); if (!seen[q]) { seen[q] = 1; gc[q]++; } }); });
    var gmx = Math.max.apply(null, gc), orphans = 0;
    body.forEach(function (r) {
      if (!r.cells.some(function (c) { return gc[colOf(c)] >= gmx * 0.9; }) && r.cells.some(function (c) { return looksMoney(c.text); })) orphans++;
    });
    if (orphans < 2) return null;
    // Başlık satırları: her hücresi bir sütunun üstünde duran, sayısız satırlar. Onun üstündeki satır ilk bölümün adıdır.
    var headTop = rows[top].y, lastY = rows[top].y, s = top - 1, headText = '';
    for (; s >= 0; s--) {
      var h = rows[s];
      if (h.y - lastY > 30 || numericRow(h) || !h.cells.every(overlaps)) break;
      // Tek hücreli uzun ya da büyük yazılı satır sütun adı değil, bölüm başlığıdır
      if (h.cells.length === 1 && (h.text.length > 14 || h.h > rows[top].h * 1.15)) break;
      h.cells.forEach(function (c) { var hit = false; cols.forEach(function (col) { if (Math.min(c.x1, col.x1) - Math.max(c.x0, col.x0) > 1) { col.labels.unshift(c.text); hit = true; } }); if (!hit) cols[colOf(c)].labels.unshift(c.text); });
      headText += ' ' + h.text; headTop = h.y; lastY = h.y;
    }
    var topY = headTop;
    if (s >= 0 && rows[s].y - headTop < 40 && RE_LET.test(rows[s].text) && !numericRow(rows[s])) { sections[0].title = rows[s].text; topY = rows[s].y; }
    cols.forEach(function (col) { col.label = col.labels.join(' ').replace(/\s+/g, ' ').trim(); col.f = fold(col.label); col.sparse = false; });
    // Her bölümde mantıksal satırlar: en dolu sütunların satırları. Seyrek sütunların değerleri birleşik hücredir.
    sections = sections.filter(function (sc) { return sc.rows.length; });
    sections.forEach(function (sc) {
      var cnt = cols.map(function () { return 0; });
      sc.rows.forEach(function (r) { var seen = {}; r.cells.forEach(function (c) { var q = colOf(c); if (!seen[q]) { seen[q] = 1; cnt[q]++; } }); });
      var mx = Math.max.apply(null, cnt), dense = cnt.map(function (v) { return v >= mx * 0.9; });
      var dn = dense.filter(Boolean).length;
      var logical = sc.rows.filter(function (r) { var k = {}; r.cells.forEach(function (c) { var q = colOf(c); if (dense[q]) k[q] = 1; }); return Object.keys(k).length >= Math.ceil(dn / 2); });
      var ys = logical.map(function (r) { return r.y; }), gaps = [];
      for (var g = 1; g < ys.length; g++) gaps.push(ys[g - 1] - ys[g]);
      var pitch = median(gaps) || 14;
      sc.grid = logical.map(function () { return cols.map(function () { return ''; }); });
      sc.ys = ys;
      cols.forEach(function (col, q) {
        var vals = [];
        sc.rows.forEach(function (r) { r.cells.forEach(function (c) { if (colOf(c) === q) vals.push({ y: r.y, text: c.text }); }); });
        if (dense[q]) {
          vals.forEach(function (v) { var k = ys.indexOf(v.y); if (k >= 0) sc.grid[k][q] = (sc.grid[k][q] ? sc.grid[k][q] + ' ' : '') + v.text; });
        } else {
          col.sparse = true;
          var as = spanAssign(ys, vals.map(function (v) { return v.y; }), pitch * 0.3);
          as.forEach(function (a, k) { if (a >= 0) sc.grid[k][q] = vals[a].text; });
        }
      });
    });
    var all = []; sections.forEach(function (sc) { all = all.concat(sc.grid); });
    function colVals(q) { return all.map(function (g) { return g[q]; }).filter(function (v) { return v && !/^[*\-–—]+$/.test(v); }); }
    function share(q, fn) { var v = colVals(q); return v.length ? v.filter(fn).length / v.length : 0; }
    var role = cols.map(function () { return 'spec'; }), priceCols = [], codeC = -1, sizeC = -1, vatC = -1;
    cols.forEach(function (col, q) {
      if (RE_CODE.test(col.f) && share(q, hasDigit) >= 0.5 && codeC < 0) { codeC = q; role[q] = 'code'; }
      else if ((share(q, looksMoney) >= 0.8 && colVals(q).length >= 2) || RE_PRICE.test(col.f)) { priceCols.push(q); role[q] = 'price'; }
    });
    if (!priceCols.length) return null;
    if (priceCols.length === 2) priceCols.forEach(function (q) { if (RE_VAT.test(cols[q].f)) vatC = q; });
    if (vatC >= 0) { priceCols = priceCols.filter(function (q) { return q !== vatC; }); role[vatC] = 'vat'; }
    cols.forEach(function (col, q) { if (role[q] === 'spec' && sizeC < 0 && RE_SIZE.test(col.f)) sizeC = q; });
    if (sizeC < 0) for (n = 0; n < cols.length; n++) if (role[n] === 'spec' && !cols[n].sparse) { sizeC = n; break; }
    if (sizeC >= 0) role[sizeC] = 'size';
    // Ölçü sütununun solundaki birleşik hücreli sütunlar (motor gücü, seri) ölçünün parçasıdır
    cols.forEach(function (col, q) { if (role[q] === 'spec' && col.sparse && (sizeC < 0 || q < sizeC)) role[q] = 'group'; });
    function unitOf(col) { var m = col.label.match(/\(\s*([^)]+?)\s*\)/); return m ? m[1] : ''; }
    function plainLabel(col) { return col.label.replace(/\(\s*[^)]*\)/g, ' ').replace(/\s+/g, ' ').trim(); }
    var cur = curOf(headText + ' ' + sections.map(function (sc) { return sc.title; }).join(' '));
    var tables = [], multi = priceCols.length > 1 && codeC < 0;
    var tx0 = cols[0].x0, tx1 = cols[cols.length - 1].x1;
    sections.forEach(function (sc, si) {
      var out = [];
      sc.grid.forEach(function (g, k) {
        var parts = [], specs = [];
        cols.forEach(function (col, q) {
          var v = g[q]; if (!v || /^[*\-–—]+$/.test(v)) return;
          if (role[q] === 'group' || role[q] === 'size') { var u = unitOf(col); parts.push(v + (u && pureNum(v) && !/^(in[cç]h?|"|”)$/i.test(u) ? ' ' + u : '')); }
          else if (role[q] === 'spec') specs.push((plainLabel(col) ? plainLabel(col) + ' ' : '') + v + (unitOf(col) && pureNum(v) ? ' ' + unitOf(col) : ''));
        });
        var size = parts.join(' · '), specText = specs.join(' · ');
        var code = codeC >= 0 ? g[codeC] : '';
        var pv = vatC >= 0 && looksMoney(g[vatC]) ? toNum(g[vatC]) : null;
        (multi ? priceCols : [priceCols[0]]).forEach(function (q) {
          var p = g[q]; if (!p || !hasDigit(p)) return;
          out.push({ code: code, size: size, variant: multi ? cols[q].label : '', price: toNum(p), cur: curOf(p) !== 'TL' ? curOf(p) : cur, priceVat: pv, specs: specText, y: sc.ys[k] });
        });
      });
      if (!out.length) return;
      var y1 = si === 0 ? topY : (sc.y || sc.ys[0]);
      tables.push({ page: pageNo, name: cleanTitle(sc.title), sub: '', rows: out, hasCode: codeC >= 0, hasPrice: true, far: false, kind: 'izgara',
        columns: cols.map(function (c, q) { return { label: c.label, role: role[q] }; }),
        box: { x0: tx0, x1: tx1, y0: sc.ys[sc.ys.length - 1] - 8, y1: y1 + 10 } });
    });
    if (!tables.length) return null;
    return { tables: tables, bands: [[rows[bot].y - 2, topY + 2]] };
  }

  // ---- Özellik kartı: kodsuz, fiyatsız ürün tanıtımı. Başlık + solda etiketler (Size / Standard / Material), sağda değerler ----
  var RE_CARD = /^(size|sizes|ebat|olcu|olculer|standard|standards|standart|standartlar|material|materials|malzeme|description|aciklama|grade|kalite|type|types|tip|pressure|basinc|connection|baglanti|class|sinif|temperature|sicaklik|capacity|kapasite|model|finish|surface|yuzey|range|aralik|application|kullanim alani|weight|agirlik|voltage|voltaj|power|guc|color|colour|renk|dimensions|boyutlar|thickness|kalinlik|length|uzunluk|diameter|cap)$/;
  function cardKey(t) { return fold(t).replace(/[():]/g, '').trim(); }
  function kartlar(rows, pageNo) {
    var tables = [], blocks = [], cur = null;
    rows.forEach(function (r) {
      if (cur && cur[cur.length - 1].y - r.y <= Math.max(55, r.h * 4.5)) cur.push(r); else { cur = [r]; blocks.push(cur); }
    });
    blocks.forEach(function (bl) {
      if (bl.length < 4) return;
      var labs = [];
      bl.forEach(function (r, q) {
        if (!q) return;
        var c0 = r.cells[0], pl = labs[labs.length - 1];
        // Etiketin hemen altındaki parantezli satır onun Türkçesidir (sözlükte olmasa da)
        var cont = pl && pl.y - r.y <= r.h * 2.2 && /^\(.*\)$/.test(c0.text.trim()) && Math.abs(ctr(c0) - ctr(pl.c)) < 30 && !/^\(.*\)$/.test(pl.c.text.trim());
        if (RE_CARD.test(cardKey(c0.text)) || cont) labs.push({ y: r.y, c: c0, h: r.h });
      });
      if (labs.length < 2) return;
      var lcx = median(labs.map(function (l) { return ctr(l.c); }));
      if (labs.some(function (l) { return Math.abs(ctr(l.c) - lcx) > 30; })) return;
      // Etiket grupları: alt alta iki dilli etiket (Size / (Ebat)) tek etikettir; parantez içindeki Türkçesi kullanılır
      var groups = [];
      labs.forEach(function (l) {
        var g = groups[groups.length - 1];
        if (g && g.lastY - l.y <= l.h * 2.2 && /^\(.*\)$/.test(l.c.text.trim())) { g.name = l.c.text.trim().replace(/^\(\s*|\s*\)$/g, ''); g.y = (g.topY + l.y) / 2; g.lastY = l.y; }
        else groups.push({ name: l.c.text.trim().replace(/^\(\s*|\s*\)$/g, ''), key: cardKey(l.c.text), y: l.y, topY: l.y, lastY: l.y });
      });
      if (groups.length < 2) return;
      var labCells = labs.map(function (l) { return l.c; });
      var name = bl[0].text, startRow = 1;
      if (!RE_LET.test(name) || name.length > 80 || isDataRow(bl[0])) return;
      if (/^\(.*\)$/.test(bl[1].text.trim()) && labCells.indexOf(bl[1].cells[0]) < 0) { name += ' ' + bl[1].text.trim(); startRow = 2; }
      var lines = [];
      for (var q = startRow; q < bl.length; q++) {
        var cs = bl[q].cells.filter(function (c) { return labCells.indexOf(c) < 0; });
        if (!cs.length) continue;
        if (cs.some(function (c) { return c.x0 < lcx; })) return;   // değerler etiket sütununun sağında olmalı
        lines.push({ y: bl[q].y, text: cs.map(function (c) { return c.text; }).join(' ') });
      }
      if (lines.length < groups.length) return;
      var as = spanAssign(lines.map(function (l) { return l.y; }), groups.map(function (g) { return g.y; }), Math.max(2.5, bl[0].h * 0.25));
      var lead = [], started = false;
      groups.forEach(function (g) { g.vals = []; });
      as.forEach(function (a, k) { if (a >= 0) { started = true; groups[a].vals.push(lines[k].text); } else if (!started) lead.push(lines[k].text); });
      var filled = groups.filter(function (g) { return g.vals.length; });
      if (filled.length < 2) return;
      var size = '', specs = [];
      filled.forEach(function (g) {
        var v = g.vals.join(' ');
        if (!size && /^(size|sizes|ebat|olcu|olculer)$/.test(g.key)) size = v; else specs.push(g.name + ': ' + v);
      });
      var xs0 = Math.min.apply(null, bl.map(function (r) { return r.x0; })), xs1 = Math.max.apply(null, bl.map(function (r) { return r.x1; }));
      var sub = lead.join(' '); if (sub.length > 140) sub = sub.slice(0, 140).replace(/\s+\S*$/, '') + '…';
      tables.push({ page: pageNo, name: cleanTitle(name), sub: sub, rows: [{ code: '', size: size, variant: '', price: null, cur: 'TL', priceVat: null, specs: specs.join(' · '), y: bl[0].y }],
        hasCode: false, hasPrice: false, far: false, kind: 'kart', columns: filled.map(function (g) { return { label: g.name, role: 'spec' }; }),
        box: { x0: xs0, x1: xs1, y0: bl[bl.length - 1].y - 8, y1: bl[0].y + 10 }, _top: bl[0].y + 3, _bot: bl[bl.length - 1].y - 3 });
    });
    return tables;
  }

  // ---- Bir sayfayı oku ----
  // items: yazılar, images: [{id, x, y, w, h}] (PDF koordinatı, sol alt köşe)
  var OCRP = false; // sayfa OCR ile okundu mu (yazı parçalarında ocr işareti)
  function parsePage(items, images, pageNo) {
    OCRP = items.some(function (i) { return i.ocr; });
    if (pageNo <= 1 || (lastTable && lastTable.page !== pageNo - 1)) lastTable = null;
    var rows = buildRows(items), parts = [], pre = [];
    // Önce özel düzenler: ters tablo ve birleşik hücreli ızgara. Bulunan bölge sayfadan çıkarılır, kalan olağan yolla okunur.
    var sp = tersTablo(rows, pageNo);
    if (!sp.tables.length) sp = izgara(rows, pageNo) || sp;
    if (sp.tables.length) {
      pre = sp.tables;
      items = items.filter(function (i) { return !sp.bands.some(function (b) { return i.y >= b[0] && i.y <= b[1]; }); });
      rows = buildRows(items);
    }
    var rest = items.slice();
    // Sayfa birkaç sütuna dizilmiş küçük tablolardan oluşuyorsa (her tablonun başlığı KOD ile başlar),
    // sayfayı o sütunlara böl. Tablolar farklı yüksekliklerde başlasa da doğru ayrılır.
    var anchors = [];
    rows.forEach(function (r, ri) {
      var ks = r.cells.filter(function (c) { return /^(kod|code|kodu|urun kodu|stok kodu)$/.test(fold(c.text)); });
      if (!ks.length) return;
      var dr = null;
      for (var q = ri + 1; q < rows.length && q <= ri + 3; q++) if (rows[q].cells.length >= 2 && rows[q].cells.some(function (c) { return isNum(c.text); })) { dr = rows[q]; break; }
      if (!dr) return;
      // KOD sütunu bir tablonun başıdır, eğer altındaki satırda solunda hiç hücre yoksa
      // ya da solundaki hücreler başka bir tablonun satırıysa (içinde ürün kodu varsa).
      // Solunda yalnızca ölçü değerleri varsa KOD aynı tablonun ortasındaki bir sütundur.
      ks.forEach(function (k) {
        var left = dr.cells.filter(function (c) { return c.x1 < k.x0 - 2 && hasDigit(c.text); });
        var other = left.some(function (c) { return looksCode(c.text) && /[A-Za-z]/.test(c.text); }) && left.some(function (c) { return looksMoney(c.text); });
        if (!left.length || other) anchors.push(k.x0);
      });
    });
    anchors.sort(function (a, b) { return a - b; });
    var strips = [];
    anchors.forEach(function (x) { if (!strips.length || x - strips[strips.length - 1] > 25) strips.push(x); });
    if (strips.length >= 2) {
      // Kesme yeri: sütun başlığının hemen solundaki, yazıların en az kestiği boşluk
      var cut = strips.slice(1).map(function (x) {
        var best = x - 6, bc = Infinity, run = 0, runStart = 0, bestRun = -1;
        for (var c = x - 40; c <= x - 2; c += 2) {
          var cost = 0; items.forEach(function (i) { if (i.x < c && i.x + i.w > c) cost++; });
          if (cost < bc) { bc = cost; run = 1; runStart = c; bestRun = 1; best = c; }
          else if (cost === bc && c - 2 === runStart + (run - 1) * 2) { run++; if (run >= bestRun) { bestRun = run; best = runStart + (run - 1); } }
          else if (cost === bc) { run = 1; runStart = c; }
        }
        return best;
      }), bounds = [-Infinity].concat(cut, [Infinity]);
      for (var sg = 0; sg < bounds.length - 1; sg++) parts.push(items.filter(function (i) { var m = i.x + i.w / 2; return m >= bounds[sg] && m < bounds[sg + 1]; }));
      rest = [];
    }
    if (strips.length < 2) rows.forEach(function (r, hi) {
      var xs = repeatSplits(r); if (!xs) return;
      var below = rows[hi + 1];
      if (!below || !isDataRow(below) || Math.abs(below.x0 - r.x0) > 0.12 * (below.x1 - below.x0)) return;
      // Bölge: başlığın üstündeki ad satırlarından, altındaki son veri satırına kadar
      var top = r.y + r.h, bot = r.y - r.h, steps = 0;
      for (var u = hi - 1; u >= 0 && steps < 3; u--) { if (rows[u].y - r.y > 75 || isDataRow(rows[u]) || repeatSplits(rows[u])) break; top = rows[u].y + rows[u].h; steps++; }
      for (var d = hi + 1; d < rows.length; d++) { if (!isDataRow(rows[d])) break; bot = rows[d].y - rows[d].h; }
      var zone = rest.filter(function (i) { return i.y <= top && i.y >= bot; });
      if (!zone.length) return;
      rest = rest.filter(function (i) { return !(i.y <= top && i.y >= bot); });
      var edges = [-Infinity].concat(xs, [Infinity]);
      for (var g = 0; g < edges.length - 1; g++) parts.push(zone.filter(function (i) { var m = i.x + i.w / 2; return m >= edges[g] && m < edges[g + 1]; }));
    });
    parts.unshift(rest);
    var tables = [], loose = [];
    parts.forEach(function (p) {
      var r = tablesIn(buildRows(p), pageNo);
      tables = tables.concat(r.tables); loose = loose.concat(r.loose);
    });
    tables = pre.concat(tables);
    // Hiç tablo yoksa: özellik kartları (kodsuz, fiyatsız tanıtım sayfası)
    if (!tables.length) {
      tables = kartlar(rows, pageNo);
      tables.forEach(function (t) { loose = loose.filter(function (r) { return r.y > t._top || r.y < t._bot; }); delete t._top; delete t._bot; });
    }
    // Adı bulunamayan tablo: sayfadaki en büyük yazılı başlığı kullan
    // Aynı sayfada adlı bir tablonun hemen altında, aynı sütunda duran adsız tablo onun devamıdır (fiyat listesinde aynı ürünün sonraki grubu)
    tables.slice().sort(function (a, b) { return b.box.y1 - a.box.y1; }).forEach(function (t, n, arr) {
      if (t.name || t.kind) return;
      for (var q = n - 1; q >= 0; q--) {
        var a = arr[q]; if (a.kind || Math.min(a.box.x1, t.box.x1) - Math.max(a.box.x0, t.box.x0) < 0.6 * (t.box.x1 - t.box.x0)) continue;
        if (a.name && !a.guess && a.columns && t.columns && a.columns.length === t.columns.length && a.box.y0 >= t.box.y1 - 20 && a.box.y0 - t.box.y1 < 12) { t.name = a.name; t.sub = a.sub; }
        break;
      }
    });
    var bigs = loose.map(function (r) { var cs = r.cells.filter(function (c) { return !isFirm(c.text); }); return cs.length ? { text: cs.map(function (c) { return c.text; }).join(' '), h: r.h, y: r.y, cells: cs } : null; }).filter(Boolean).filter(function (r) { return r.text.length >= 4 && r.text.length <= 70 && /[A-Za-zÇĞİÖŞÜçğıöşü]{3}/.test(r.text) && !/www\.|@|https?:|e-?mail|web:/i.test(r.text) && !isDataRow(r); })
      .sort(function (a, b) { return b.h - a.h || b.y - a.y; });
    var guess = '';
    if (bigs.length) {
      guess = bigs[0].text;
      // Büyük başlıkla başlayan daha açıklayıcı bir satır varsa onu kullan (örn. "ANATOLİA Telli Şeffaf Hortum")
      var fb = fold(guess), longer = loose.filter(function (r) { var f = fold(r.text); return f.length > fb.length + 3 && f.length <= 70 && f.indexOf(fb) === 0; })
        .sort(function (a, b) { return b.y - a.y; })[0];
      if (longer) guess = longer.text;
    }
    tables.forEach(function (t) {
      if (!t.name && guess) { t.name = cleanTitle(guess); t.guess = true; }
    });
    attach(tables, images || []);
    // Tablo dışı satırlar: aynı hizada yan yana duran ayrı yazı blokları ayrı satır sayılır
    var lines = [];
    loose.forEach(function (r) {
      var seg = null;
      r.cells.forEach(function (c) {
        if (seg && c.x0 - seg.x1 <= 12) { seg.text += ' ' + c.text; seg.x1 = c.x1; }
        else { seg = { text: c.text, y: r.y, x: c.x0, x1: c.x1 }; lines.push(seg); }
      });
    });
    return { tables: tables, loose: lines };
  }

  // Belge sertifika / onay yazısı mı? Yalnızca ilk sayfaya ve sayfa sayısına bakılır;
  // katalogların içinde geçen "class certificate" gibi ifadeler belgeyi sertifika yapmaz.
  function looksLikeCertificate(firstPageText, pageCount) {
    if (pageCount > 12) return false;
    var f = fold(firstPageText), n = 0;
    ['certificate of', 'type approval', 'this is to certify', 'sertifikasi', 'uygunluk belgesi', 'notified body', 'certificate no', 'tip onay', 'renewal of', 'is found to comply', 'onay belgesi']
      .forEach(function (w) { if (f.indexOf(w) >= 0) n++; });
    return n >= 2;
  }

  return { parsePage: parsePage, buildRows: buildRows, spanAssign: spanAssign, fixI: fixI, looksLikeCertificate: looksLikeCertificate, toNum: toNum, fold: fold };
});
