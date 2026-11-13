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
      var idx = [i], j = i, coreX = firstDigitX(rows[i]), n0 = i + 1, floats = [];
      while (n0 < rows.length) {
        var nr = rows[n0], lastD = rows[idx[idx.length - 1]];
        if (lastD.y - nr.y > 40) break;
        if (isDataRow(nr)) { idx.push(n0); j = n0; coreX = Math.min(coreX, firstDigitX(nr)); n0++; continue; }
        // Birleşik hücrenin ortasına yazılmış kısa etiket (SERİ, TİP değeri) satırların arasına düşer
        if (nr.cells.length <= 2 && nr.cells.every(function (c) { return c.text.length <= 10; }) && n0 + 1 < rows.length && isDataRow(rows[n0 + 1]) && lastD.y - rows[n0 + 1].y < 40) {
          nr.cells.forEach(function (c) { floats.push({ text: c.text, x0: c.x0, x1: c.x1, y: nr.y }); }); used[n0] = true; n0++; continue;
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
        var cs0 = inRange(rows[s]);
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
      if (!codeCols.length) for (var n1 = 0; n1 < cols.length; n1++) {
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
      var pairs = [];
      if (codeCols.length >= 2 && priceCols.length >= 2) {
        codeCols.forEach(function (cc, i) {
          var next = i + 1 < codeCols.length ? codeCols[i + 1] : cols.length;
          var pc = priceCols.filter(function (x) { return x > cc && x < next; })[0];
          var lab = cols[cc].label.replace(/\b(KOD|CODE|KODU)\b/gi, ' ').replace(/\s+/g, ' ').trim();
          pairs.push({ code: cc, price: pc == null ? -1 : pc, variant: lab.split('/')[0].trim() });
        });
      }
      codeCols.forEach(function (n) { role[n] = 'code'; });
      priceCols.forEach(function (n) { role[n] = 'price'; });
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
      var name = '', sub = '', topY = (head[0] || rows[i]).y, titleRow = null, looked = 0, far = false;
      for (var t = k; t >= 0 && looked < 3; t--) {
        var tr = rows[t], tt = textIn(tr);
        if (!tt) continue;
        if (tr.y - topY > 75 || isDataRow(tr)) break;
        looked++;
        if (!isTitle(tt)) continue;
        // Başlığın üst satırına taşmış tek kelimelik sütun adı (örn. PRODUCT / CODE) ürün adı değildir
        var ci = inRange(tr);
        if (head.length && ci.length === 1 && tt.length <= 14 && !/\s/.test(tt) && tr.y - topY < tr.h * 2.2) { ci.forEach(function (c) { var n = colOf(c); if (n >= 0) { cols[n].label = (c.text + ' ' + cols[n].label).trim(); cols[n].f = fold(cols[n].label); } }); used[t] = true; continue; }
        titleRow = t; break;
      }
      if (titleRow == null) {
        for (var t3 = k; t3 >= 0; t3--) {
          if (isDataRow(rows[t3])) break;
          if (used[t3] || !isTitle(rows[t3].text) || rows[t3].text.length > 90) continue;
          titleRow = t3; far = true; break;
        }
      }
      var tText = far ? function (r) { return r.text; } : textIn;
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
        var specText = specs.map(function (x) { return (x.label ? x.label + ' ' : '') + x.val; }).join(' · ');
        function mk(code, p, variant, pv) {
          return { code: code || '', size: size, variant: variant || '', price: p ? toNum(p) : null, cur: p && curOf(p) !== 'TL' ? curOf(p) : cur,
            priceVat: pv ? toNum(pv) : null, specs: specText, y: data[n].y };
        }
        if (pairs.length) {
          pairs.forEach(function (pr) { if (g[pr.code]) out.push(mk(g[pr.code], pr.price >= 0 ? g[pr.price] : '', pr.variant, '')); });
        } else {
          var p = priceC >= 0 ? g[priceC] : (vatC >= 0 ? g[vatC] : '');
          out.push(mk(codeC >= 0 ? g[codeC] : '', p, '', vatC >= 0 && priceC >= 0 ? g[vatC] : ''));
        }
      });
      out = out.filter(function (r) { return r.code || r.size || r.price != null; });

      idx.forEach(function (n) { used[n] = true; });
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

  // ---- Bir sayfayı oku ----
  // items: yazılar, images: [{id, x, y, w, h}] (PDF koordinatı, sol alt köşe)
  function parsePage(items, images, pageNo) {
    var rows = buildRows(items), parts = [], rest = items.slice();
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
    // Adı bulunamayan tablo: sayfadaki en büyük yazılı başlığı kullan
    var bigs = loose.filter(function (r) { return r.text.length >= 4 && r.text.length <= 70 && /[A-Za-zÇĞİÖŞÜçğıöşü]{3}/.test(r.text) && !/www\.|@|https?:|e-?mail|web:/i.test(r.text) && !isDataRow(r); })
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
