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

  // Yan yana iki tablo: başlık satırı kendini tekrar ediyorsa (DN CODE ... DN CODE ...) sayfayı ikiye böl
  function findSplit(rows) {
    for (var i = 0; i < rows.length; i++) {
      var c = rows[i].cells, n = c.length;
      if (n < 6 || n % 2) continue;
      var half = n / 2, same = true;
      for (var k = 0; k < half; k++) if (fold(c[k].text) !== fold(c[k + half].text)) { same = false; break; }
      if (same && !hasDigit(c[0].text)) return (c[half - 1].x1 + c[half].x0) / 2;
    }
    return null;
  }

  function isDataRow(r) {
    if (r.cells.length < 3) return false;
    var d = r.cells.filter(function (c) { return hasDigit(c.text); }).length;
    return d / r.cells.length >= 0.5;
  }

  // ---- Sütun rolleri ----
  var RE_CODE = /(^|[^a-z])(code|kod|kodu|art|part ?no|ref|stok|siparis|item ?no|urun no|model)([^a-z]|$)/;
  var RE_PRICE = /fiyat|price|tutar|bedel/;
  var RE_VAT = /kdv ?li|kdv dahil|kdvli|incl/;
  var RE_SIZE = /(^|[^a-z])(dn|size|olcu|ebat|cap|litre|hacim|nps|boyut|anma|nominal)([^a-z]|$)/;
  var RE_UNIT = /(^|\s)(mm|cm|inch|inc|bar|lt|kg|m)$/;
  function looksCode(v) { return /^[A-Za-z0-9][A-Za-z0-9\-\/\.]{4,}$/.test(v) && hasDigit(v) && !/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(v) && !/,/.test(v); }
  function looksMoney(v) { return /^\d{1,3}(\.\d{3})*,\d{2}$/.test(v) || /^\d+,\d{2}$/.test(v); }
  function toNum(s) {
    var t = String(s).replace(/TL|₺|€|EUR|USD|\$/gi, '').trim();
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/\./g, '');
    var n = parseFloat(t); return isNaN(n) ? null : n;
  }
  function curOf(s) { return /€|EUR/i.test(s) ? 'EUR' : (/\$|USD/i.test(s) ? 'USD' : 'TL'); }
  function cleanTitle(s) {
    return String(s || '').replace(/f[iİı]yat\s+l[iİı]stes[iİı]/gi, ' ').replace(/price\s+list/gi, ' ')
      .replace(/\s+/g, ' ').replace(/^[\s\-–:,.\/]+|[\s\-–:,.\/]+$/g, '').trim();
  }

  // ---- Bir sayfa parçasındaki tabloları bul ----
  var RE_LET = /[A-Za-zÇĞİÖŞÜçğıöşü]{3}/;
  function firstDigitX(r) { for (var n = 0; n < r.cells.length; n++) if (hasDigit(r.cells[n].text)) return r.cells[n].x0; return r.x0; }
  function tablesIn(rows, pageNo) {
    var tables = [], used = {};
    var i = 0;
    while (i < rows.length) {
      if (!isDataRow(rows[i])) { i++; continue; }
      // Veri satırlarını topla. Tablonun solunda/sağında kalan açıklama yazıları araya girerse atla.
      var idx = [i], j = i, coreX = firstDigitX(rows[i]), n0 = i + 1;
      while (n0 < rows.length) {
        var nr = rows[n0], lastD = rows[idx[idx.length - 1]];
        if (lastD.y - nr.y > 40) break;
        if (isDataRow(nr)) { idx.push(n0); j = n0; coreX = Math.min(coreX, firstDigitX(nr)); n0++; continue; }
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
        var cs0 = inRange(rows[s]);
        if (!cs0.length) continue;
        if (rows[s].y - lastY > 60) break;
        seen++;
        var dg = cs0.filter(function (c) { return hasDigit(c.text); }).length;
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

      // Roller
      var role = cols.map(function () { return 'spec'; }), codeC = -1, priceC = -1, vatC = -1, sizeC = -1;
      cols.forEach(function (col, n) { if (codeC < 0 && RE_CODE.test(col.f) && share(n, hasDigit) >= 0.5) codeC = n; });
      if (codeC < 0) for (var n1 = 0; n1 < cols.length; n1++) {
        if (share(n1, looksCode) >= 0.8 && fill(n1) >= 0.8 && share(n1, function (v) { return /[A-Za-z]/.test(v) || v.length >= 6; }) >= 0.8) { codeC = n1; break; }
      }
      cols.forEach(function (col, n) {
        if (n === codeC) return;
        if (RE_VAT.test(col.f)) { if (vatC < 0) vatC = n; }
        else if (RE_PRICE.test(col.f)) { if (priceC < 0) priceC = n; }
      });
      if (priceC < 0 && vatC < 0) {
        var money = []; cols.forEach(function (col, n) { if (n !== codeC && share(n, looksMoney) >= 0.9 && fill(n) >= 0.8) money.push(n); });
        if (money.length) { priceC = money[0]; if (money.length > 1) vatC = money[money.length - 1]; }
      }
      cols.forEach(function (col, n) {
        if (n === codeC || n === priceC || n === vatC) return;
        if (sizeC < 0 && RE_SIZE.test(col.f)) sizeC = n;
      });
      if (sizeC < 0) for (var n2 = 0; n2 < cols.length; n2++) {
        if (n2 === codeC || n2 === priceC || n2 === vatC) continue;
        if (fill(n2) >= 0.9) { sizeC = n2; break; }
      }
      if (codeC >= 0) role[codeC] = 'code';
      if (priceC >= 0) role[priceC] = 'price';
      if (vatC >= 0) role[vatC] = 'vat';
      if (sizeC >= 0) role[sizeC] = 'size';

      // Ürün adı: tablonun üstündeki başlık (bir ya da iki satır)
      var name = '', sub = '', topY = (head[0] || rows[i]).y, titleRow = null, looked = 0;
      for (var t = k; t >= 0 && looked < 3; t--) {
        var tr = rows[t], tt = textIn(tr);
        if (!tt) continue;
        if (tr.y - topY > 75 || isDataRow(tr)) break;
        looked++;
        if (tt.length < 4 || !RE_LET.test(tt)) continue;
        // Başlığın üst satırına taşmış tek kelimelik sütun adı (örn. PRODUCT / CODE) ürün adı değildir
        var ci = inRange(tr);
        if (head.length && ci.length === 1 && tt.length <= 14 && !/\s/.test(tt) && tr.y - topY < tr.h * 2.2) { ci.forEach(function (c) { var n = colOf(c); if (n >= 0) { cols[n].label = (c.text + ' ' + cols[n].label).trim(); cols[n].f = fold(cols[n].label); } }); used[t] = true; continue; }
        titleRow = t; break;
      }
      if (titleRow != null) {
        var t1 = rows[titleRow]; name = textIn(t1); used[titleRow] = true; topY = t1.y;
        for (var u0 = titleRow - 1; u0 >= 0; u0--) {
          var up = rows[u0], ut = textIn(up);
          if (!ut) continue;
          if (!isDataRow(up) && (up.y - t1.y) < Math.max(t1.h, up.h) * 2.2 && RE_LET.test(ut) && ut.length >= 4) { sub = name; name = ut; used[u0] = true; topY = up.y; }
          break;
        }
      }
      var cur = curOf(head.map(function (h) { return h.text; }).join(' ') + ' ' + name);

      var out = grid.map(function (g, n) {
        var specs = [], prev = null;
        cols.forEach(function (col, c) {
          if (role[c] !== 'spec' || !g[c]) return;
          // Aynı başlığın altındaki yan yana sütunlar tek özelliktir (örn. "Holes x Dia": 4 x 12)
          if (prev && prev.label && prev.label === col.label && prev.c === c - 1) { prev.val += (/\sx\s/i.test(col.label) ? ' x ' : ' ') + g[c]; prev.c = c; }
          else { prev = { label: col.label, val: g[c], c: c }; specs.push(prev); }
        });
        var size = sizeC >= 0 ? g[sizeC] : '';
        if (size) { var um = cols[sizeC].f.match(RE_UNIT); if (um && /^[\d.,\/ ]+$/.test(size)) size += ' ' + um[2]; else if (/^dn$/.test(cols[sizeC].f) && /^\d+$/.test(size)) size = 'DN' + size; }
        var p = priceC >= 0 ? g[priceC] : (vatC >= 0 ? g[vatC] : '');
        return {
          code: codeC >= 0 ? g[codeC] : '', size: size, price: p ? toNum(p) : null, cur: p && curOf(p) !== 'TL' ? curOf(p) : cur,
          priceVat: vatC >= 0 && priceC >= 0 && g[vatC] ? toNum(g[vatC]) : null,
          specs: specs.map(function (x) { return (x.label ? x.label + ' ' : '') + x.val; }).join(' · '), y: data[n].y
        };
      }).filter(function (r) { return r.code || r.size || r.price != null; });

      idx.forEach(function (n) { used[n] = true; });
      if (out.length >= 2) {
        tables.push({
          page: pageNo, name: cleanTitle(name), sub: cleanTitle(sub), rows: out,
          hasCode: codeC >= 0, hasPrice: priceC >= 0 || vatC >= 0,
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
      if (best && bd <= 170) {
        var score = m.w * m.h / (1 + bd / 40);
        if (!best._img || score > best._score) { best._img = m; best._score = score; }
      }
    });
    if (tables.length === 1 && !tables[0]._img && good.length) {
      tables[0]._img = good.slice().sort(function (a, b) { return b.w * b.h - a.w * a.h; })[0];
    }
    tables.forEach(function (t) { t.img = t._img ? t._img.id : null; delete t._img; delete t._score; });
  }

  // ---- Bir sayfayı oku ----
  // items: yazılar, images: [{id, x, y, w, h}] (PDF koordinatı, sol alt köşe)
  function parsePage(items, images, pageNo) {
    var rows = buildRows(items), split = findSplit(rows), parts;
    if (split != null) {
      parts = [items.filter(function (i) { return i.x + i.w / 2 < split; }), items.filter(function (i) { return i.x + i.w / 2 >= split; })];
    } else parts = [items];
    var tables = [], loose = [];
    parts.forEach(function (p) {
      var r = tablesIn(buildRows(p), pageNo);
      tables = tables.concat(r.tables); loose = loose.concat(r.loose);
    });
    // Adı bulunamayan tablo: sayfadaki en büyük yazılı başlığı kullan
    var bigs = loose.filter(function (r) { return r.text.length >= 4 && r.text.length <= 70 && /[A-Za-zÇĞİÖŞÜçğıöşü]{3}/.test(r.text) && !isDataRow(r); })
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

  return { parsePage: parsePage, buildRows: buildRows, looksLikeCertificate: looksLikeCertificate, toNum: toNum, fold: fold };
});
