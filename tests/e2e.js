// Uçtan uca test (internetsiz). Çalıştırma: `python3 -m http.server 8080` sonra `node tests/e2e.js`
const fs = require('fs');
const path = require('path');
const os = require('os');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }

const URL0 = 'http://localhost:8080/index.html';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'klavuz-'));
let failed = 0;
function ok(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) failed++; }

// Kayıtlı veriyi doğrudan veritabanından oku (uygulamanın belleğinden değil)
const stats = (page) => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('klavuz-img');
  r.onsuccess = () => {
    const d = r.result, out = {}, tx = d.transaction(['data', 'img', 'draft']);
    const get = (store, key, name) => { const q = tx.objectStore(store).get(key); q.onsuccess = () => { out[name] = q.result; }; };
    get('data', 'items', 'items'); get('data', 'offers', 'offers'); get('data', 'docs', 'docs'); get('data', 'rest', 'rest'); get('data', 'meta', 'meta');
    const k1 = tx.objectStore('img').getAllKeys(); k1.onsuccess = () => { out.imgKeys = k1.result; };
    const k2 = tx.objectStore('draft').getAllKeys(); k2.onsuccess = () => { out.draftKeys = k2.result; };
    tx.oncomplete = () => { d.close(); res({ items: Object.keys(out.items || {}).length, offers: Object.keys(out.offers || {}).length, docs: (out.docs || []).length,
      rest: out.rest, meta: out.meta, imgKeys: out.imgKeys, draftKeys: out.draftKeys, names: Object.values(out.items || {}).map(i => i.name) }); };
  };
}));
const ready = (page) => page.waitForFunction(() => window.KlavuzHazir === true);
const settle = (page) => page.waitForTimeout(450); // gecikmeli kaydın yazılması

// Çok sayfalı örnek katalog (tarayıcının kendi PDF çıktısı; gerçek yazı içerir)
async function makeCatalog(browser, file, pages) {
  const pg = await browser.newPage();
  let html = '<style>body{font-family:Arial;font-size:12pt}h2{margin:0 0 12px}table{border-collapse:collapse}td,th{border:1px solid #333;padding:4px 14px}.p{page-break-after:always}</style>';
  for (let p = 1; p <= pages; p++) {
    html += '<div class="p"><h2>KÜRESEL VANA SERİ ' + p + '</h2><table><tr><th>KOD</th><th>ÖLÇÜ</th><th>FİYAT</th></tr>';
    for (let r = 1; r <= 6; r++) html += '<tr><td>KV' + p + '-' + (1000 + r) + '</td><td>' + r + '/2"</td><td>' + (100 * p + r) + ',00 TL</td></tr>';
    html += '</table></div>';
  }
  await pg.setContent(html);
  await pg.pdf({ path: file, format: 'A4' });
  await pg.close();
}

(async () => {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, acceptDownloads: true });
  // Uygulama internetsiz çalışmalı: dış adreslere giden her istek engellenir.
  await ctx.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [], dialogs = [];
  let dialogAnswer = true;
  page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  page.on('dialog', d => { dialogs.push(d.message()); dialogAnswer ? d.accept() : d.dismiss(); });

  const multi = path.join(tmp, 'cok-sayfa.pdf');
  await makeCatalog(browser, multi, 6);
  const csv = path.join(tmp, 'fiyat.csv');
  fs.writeFileSync(csv, 'ABC-12345,Test çekvalf,1250\nABC-12346,Test filtre,980\n');

  console.log('1. Eski sürümün verisi kendiliğinden taşınır');
  await page.goto(URL0);
  await page.evaluate(() => {
    localStorage.setItem('klavuz.v1', JSON.stringify({
      items: { e1: { id: 'e1', name: 'Eski sürüm ürünü', sub: '', brand: 'ESKI', category: '', note: '', verified: true, hasImg: false } },
      offers: { o1: { id: 'o1', itemId: 'e1', supplier: 'ESKI', code: 'ESK-00001', key: 'ESK00001', size: '1"', listPrice: 100, sellPrice: 120, cur: 'TL', supDisc: 0, status: 'ok', docId: 'd0' } },
      history: [], docs: [{ id: 'd0', name: 'eski.pdf', supplier: 'ESKI', kind: 'katalog', date: '2026-11-01', count: 1 }], cart: [], cartDiscount: 0, feedback: {}, vtest: {},
      settings: { company: 'HC MARIN WORKS', phone: '', note: 'x' } }));
    return new Promise(r => { const q = indexedDB.deleteDatabase('klavuz-img'); q.onsuccess = q.onerror = q.onblocked = () => r(); });
  });
  await page.reload(); await ready(page); await settle(page);
  let s = await stats(page);
  ok(s.items === 1 && s.offers === 1 && s.docs === 1 && s.meta, 'eski kayıt yeni veritabanına taşındı');
  ok(s.rest.settings.company === 'HC MARIN WORKS', 'ayarlar taşındı');
  ok(await page.evaluate(() => !!localStorage.getItem('klavuz.v1')), 'eski kayıt silinmedi (yedek olarak duruyor)');
  ok(await page.isVisible('text=Eski sürüm ürünü'), 'taşınan ürün aramada görünüyor');

  console.log('2. Çoklu belge, arka planda okuma');
  await page.click('button[data-tab="katalog"]');
  await page.fill('#supName', 'ECA');
  await page.setInputFiles('#docFile', [path.join(__dirname, 'katalog.pdf'), csv, multi]);
  await page.click('button[data-act="read"]');
  await page.click('nav button[data-tab="ayar"]'); // okuma sürerken başka ekran
  ok(await page.isVisible('h1:has-text("Ayarlar")'), 'okuma sürerken Ayarlar açıldı');
  await page.waitForFunction(() => /3 belge okundu/.test(document.querySelector('#strip').textContent), null, { timeout: 120000 });
  ok(true, 'durum şeridi: 3 belge okundu');
  await page.click('#strip');
  ok((await page.$$('.job h3')).length === 3, 'üç belge kontrol kartı olarak bekliyor');
  s = await stats(page);
  ok(s.items === 1 && s.draftKeys.length >= 6, 'kaydetmeden önce ürünlere eklenmedi; taslaklar cihazda saklı');

  console.log('3. Taslaklar uygulama kapanıp açılınca kaybolmaz');
  await page.reload(); await ready(page);
  await page.click('button[data-tab="katalog"]');
  ok((await page.$$('.job h3')).length === 3, 'yeniden açınca üç kontrol kartı duruyor');
  await page.click('.job:has-text("katalog.pdf") button[data-act="jobopen"]');
  ok((await page.$$('.job img.mini')).length > 0, 'taslaktaki resimler geri geldi');
  await page.click('button[data-act="saveall"]'); await settle(page);
  s = await stats(page);
  ok(s.docs === 4 && s.offers === 1 + 2 + 36 + 3, 'hepsi kaydedildi (' + s.items + ' ürün, ' + s.offers + ' teklif, ' + s.docs + ' belge)');
  ok(s.draftKeys.length === 0, 'kaydedilen taslaklar temizlendi');
  const total = { items: s.items, offers: s.offers };

  console.log('4. Kalıcılık ve arama');
  await page.reload(); await ready(page);
  const cards = await page.$$eval('.pcard', els => els.map(e => ({ name: e.querySelector('b').textContent, price: (e.querySelector('.price') || {}).textContent })));
  ok(cards.length === total.items, 'yeniden açınca ürünler duruyor (' + cards.length + ')');
  await page.waitForSelector('.pcard .thumb img', { timeout: 5000 }).then(() => ok(true, 'ürün resmi duruyor'), () => ok(false, 'ürün resmi duruyor'));
  await page.fill('#q', 'KV3-1002');
  ok((await page.$$('.pcard')).length === 1, 'kodla arama tek ürünü buldu');
  await page.click('.pcard >> nth=0');
  ok((await page.$$eval('.chip', els => els.length)) >= 6, 'ürün sayfasında ölçüler listelendi');
  ok(await page.evaluate(() => window.KlavuzBack()) === true && !(await page.$('.chip[data-act="variant"]')), 'geri tuşu ürünü kapattı');
  ok(await page.evaluate(() => window.KlavuzBack()) === false, 'Ara sekmesinde geri tuşu çıkışa bırakıldı');
  ok(await page.$eval('nav.tabs button.on', e => e.dataset.tab) === 'ara' && await page.isVisible('nav.tabs'), 'alt bar görünür, Ara seçili');

  console.log('4b. Kategori, tarifle arama, marka ve satıcı');
  await page.fill('#q', '');
  const idbGet = (key) => page.evaluate((k) => new Promise((res) => { const r = indexedDB.open('klavuz-img'); r.onsuccess = () => { const q = r.result.transaction('data').objectStore('data').get(k); q.onsuccess = () => { r.result.close(); res(Object.values(q.result)); }; }; }), key);
  const cats = (await idbGet('items')).map(i => i.name + '=' + i.category);
  ok(cats.filter(c => /VANA/.test(c)).every(c => /=vana$/.test(c)) && cats.some(c => c === 'Test filtre=filtre'), 'ürünler kendiliğinden kategorilere ayrıldı');
  ok(cats.some(c => c === 'Eski sürüm ürünü='), 'ayrılamayan ürün kategorisiz kaldı');
  await page.fill('#q', 'ball valve');
  ok((await page.$$('.pcard')).length >= 6, 'İngilizce tarif Türkçe ürünleri buldu (ball valve -> küresel vana)');
  await page.fill('#q', 'vana 3/2');
  ok((await page.$$('.pcard')).length >= 1, 'tarif + ölçü ile arama sonuç verdi');
  await page.fill('#q', '');
  ok(/Vana\s*\d+/.test(await page.textContent('#home')) && /Kategorisiz/.test(await page.textContent('#home')) && (await page.$$('#home .tile')).length >= 3, 'kategori grupları sayılarıyla listelendi');
  await page.click('[data-act="grp"]:has-text("Filtre")');
  ok((await page.$$('.pcard')).length === 1, 'kategori grubu süzdü');
  await page.click('[data-act="grp"]:has-text("Kategorisiz")');
  await page.click('.pcard >> nth=0');
  await page.selectOption('select[data-cat]', 'pompa'); await settle(page);
  ok((await stats(page)).rest.learn.name['eski surum urunu'] === 'pompa', 'elle atanan kategori öğrenildi');
  await page.evaluate(() => window.KlavuzBack());
  await page.click('button[data-act="dim"][data-id="marka"]');
  await page.click('[data-act="grp"]:has-text("ECA")');
  ok(await page.isVisible('#gcard h2:has-text("ECA")'), 'marka kartı açıldı');
  await page.click('button[data-act="upfor"]');
  ok(await page.inputValue('#brandName') === 'ECA', 'karttan belge yüklemede marka hazır geldi');
  const depo = path.join(tmp, 'depo-fiyat.csv');
  fs.writeFileSync(depo, 'KV1-1001,Vana,95\nKV1-1002,Vana,96\n');
  await page.fill('#supName', 'DEPO A');
  await page.selectOption('#kind', 'fiyat');
  await page.setInputFiles('#docFile', depo);
  await page.click('button[data-act="read"]');
  await page.waitForSelector('.job h3', { timeout: 30000 });
  await page.click('.job button[data-act="save"]'); await settle(page);
  s = await stats(page);
  ok(s.items === total.items && s.offers === total.offers + 2, 'ikinci satıcının fiyatı yeni ürün açmadan aynı karta eklendi');
  ok(s.rest.brands.ECA && s.rest.sellers['DEPO A'], 'marka ve satıcı kartları kendiliğinden oluştu');
  await page.click('button[data-tab="ara"]');
  await page.click('button[data-act="dim"][data-id="satici"]');
  await page.click('[data-act="grp"]:has-text("DEPO A")');
  await page.click('#gcard summary');
  await page.fill('#gcard input[data-prof="satici|disc"]', '10');
  await page.dispatchEvent('#gcard input[data-prof="satici|disc"]', 'change'); await settle(page);
  ok((await idbGet('offers')).filter(o => o.supplier === 'DEPO A').every(o => o.supDisc === 10), 'satıcı iskontosu tekliflerine uygulandı');
  total.offers += 2;
  await page.click('button[data-act="dim"][data-id="kat"]');

  console.log('5. Yeniden okuma: elle yapılanlar korunur, soru sorulmaz');
  // elle: bir ürünün satış fiyatını değiştir ve sepete ekle
  await page.click('button[data-tab="ara"]');
  await page.fill('#q', 'KV2-1003'); await page.waitForTimeout(100);
  await page.click('.pcard >> nth=0');
  await page.click('.chip:has-text("3/2")');
  const selId = await page.$eval('.chip.on[data-act="variant"]', e => e.dataset.id);
  await page.fill('input[data-sell="' + selId + '"]', '999'); await page.dispatchEvent('input[data-sell="' + selId + '"]', 'change');
  await page.click('button[data-act="addcart"]'); await settle(page);
  await page.evaluate(() => window.KlavuzBack()); await page.fill('#q', '');
  const before = await stats(page);
  ok(before.rest.cart.length === 1, 'sepete eklendi');
  await page.click('button[data-tab="katalog"]');
  ok((await page.$$('button[data-act="reread"]')).length >= 1, 'belgelerin aslı saklandı, "Yeniden oku" düğmesi var');
  dialogs.length = 0;
  await page.fill('#brandName', 'BASKA');
  await page.setInputFiles('#docFile', multi); // aynı dosya yeniden seçildi
  await page.click('button[data-act="read"]');
  await page.waitForFunction(() => !document.querySelector('#strip').textContent && !document.querySelector('.job'), null, { timeout: 60000 });
  await settle(page);
  s = await stats(page);
  ok(dialogs.length === 0 && s.docs === before.docs && s.items === before.items && s.offers === before.offers, 'aynı dosya soru sormadan yeniden okundu; çift kayıt oluşmadı');
  let offs = await idbGet('offers');
  const kv = offs.filter(o => o.code === 'KV2-1003')[0];
  ok(kv && kv.sellPrice === 999 && kv.supplier === 'ECA', 'özel satış fiyatı ve marka korundu');
  ok(s.rest.cart.length === 1 && offs.some(o => o.id === s.rest.cart[0].offerId), 'sepetteki kalem yeni kayda bağlandı');
  await page.click('button[data-act="rereadall"]');
  await page.waitForTimeout(300);
  await page.waitForFunction(() => !document.querySelector('#strip').textContent && !document.querySelector('.job'), null, { timeout: 90000 });
  await settle(page);
  s = await stats(page);
  ok(s.docs === before.docs && s.items === before.items && s.offers === before.offers, 'toplu yeniden okuma sonrası sayılar aynı (' + s.items + ' ürün, ' + s.offers + ' teklif)');
  offs = await idbGet('offers');
  ok(offs.filter(o => o.supplier === 'DEPO A').length === 2 && offs.filter(o => o.supplier === 'DEPO A').every(o => o.supDisc === 10), 'ikinci satıcının teklifleri ve iskontosu durdu');

  console.log('5b. Otomatik kontrol, elle ürün, internetten paylaşım, teklife aktarma');
  const its = await idbGet('items');
  ok(its.filter(i => /VANA SERİ/.test(i.name)).every(i => i.verified && i.autoVer), 'uyarısız ürünler otomatik doğrulandı');
  await page.click('nav button[data-tab="uyari"]');
  await page.click('button[data-act="autocheck"]');
  ok(/uyarı|kalmadı/.test(await page.textContent('#toast')), 'otomatik kontrol düğmesi çalıştı');
  await page.evaluate(() => window.KlavuzShared('Marin Sintine Pompası 12V 1100 GPH https://www.hepsiburada.com/ornek-urun-p-HB0001'));
  ok(await page.inputValue('[data-np="name"]') === 'Marin Sintine Pompası 12V 1100 GPH' && await page.inputValue('[data-np="seller"]') === 'Hepsiburada', 'paylaşılan bağlantıdan ad ve satıcı ayrıldı');
  await page.evaluate(() => window.KlavuzPage('<html><head><meta property="og:title" content="x"><meta property="product:price:amount" content="1.249,90"></head></html>'));
  ok(await page.inputValue('[data-np="price"]') === '1249.9', 'sayfadaki fiyat forma geldi');
  await page.click('button[data-act="npsave"]'); await settle(page);
  ok(await page.isVisible('h2:has-text("Marin Sintine Pompası")') && await page.isVisible('button[data-act="openlink"]:has-text("internet sayfasını aç")'), 'ürün kartı bağlantısıyla eklendi');
  ok((await idbGet('items')).some(i => /Sintine/.test(i.name) && i.category === 'pompa'), 'eklenen ürün kategoriye ayrıldı');
  total.items += 1; total.offers += 1;
  await page.evaluate(() => window.KlavuzBack());
  await page.click('nav button[data-tab="sepet"]');
  const [dlc] = await Promise.all([page.waitForEvent('download'), page.click('button[data-act="cartfile"]')]);
  const cf = path.join(tmp, 'teklif.csv'); await dlc.saveAs(cf);
  const csvText = fs.readFileSync(cf, 'utf8');
  ok(/Sıra;Ürün;Kod/.test(csvText) && /KV2-1003;ECA;ECA;"3\/2""";1;999;0;999;TL/.test(csvText), 'teklif dosyası: ' + csvText.split('\r\n')[1]);
  await page.click('button[data-act="cartclear"]'); await settle(page);

  console.log('6. Büyük belge: parça parça okuma, yarıda kalınca devam');
  const big = path.join(tmp, 'buyuk.pdf');
  await makeCatalog(browser, big, 9);
  await page.evaluate(() => { localStorage.setItem('klavuz.test', JSON.stringify({ chunk: 2, delay: 250, big: 1 })); });
  await page.addInitScript(() => { try { window.KLAVUZ_TEST = JSON.parse(localStorage.getItem('klavuz.test') || 'null'); } catch (e) {} });
  await page.reload(); await ready(page);
  await page.click('button[data-tab="katalog"]');
  await page.fill('#supName', 'BUYUK');
  await page.setInputFiles('#docFile', big);
  await page.click('button[data-act="read"]');
  await page.waitForFunction(() => /Sayfa [5-7] \/ 9/.test(document.querySelector('#strip').textContent), null, { timeout: 60000 });
  await page.reload(); await ready(page); // okuma yarıdayken uygulama kapandı
  await page.click('button[data-tab="katalog"]');
  const partial = await page.textContent('.job');
  ok(/Yarım kaldı: [46] \/ 9 sayfa/.test(partial), 'yarım kalan okuma saklandı: ' + (partial.match(/Yarım kaldı[^.]*/) || [''])[0]);
  await page.evaluate(() => { localStorage.setItem('klavuz.test', JSON.stringify({ chunk: 2, big: 1 })); });
  await page.reload(); await ready(page);
  await page.click('button[data-tab="katalog"]');
  await page.fill('#supName', 'BUYUK');
  await page.setInputFiles('#docFile', big);
  await page.click('button[data-act="read"]');
  await page.waitForSelector('.job h3', { timeout: 60000 });
  const sum = await page.textContent('.job .muted');
  ok(/9 ürün, 54 satır/.test(sum), 'kaldığı yerden devam etti, eksik ya da çift satır yok: ' + sum.trim());
  await page.click('.job button[data-act="jobopen"]');
  ok(/Sayfa<\/span><b>9/.test(await page.innerHTML('.job .report')), 'rapor 9 sayfa gösteriyor');
  await page.click('.job button[data-act="save"]'); await settle(page);
  s = await stats(page);
  ok(s.offers === total.offers + 54, 'büyük belge kaydedildi');
  await page.evaluate(() => localStorage.removeItem('klavuz.test'));

  console.log('7. Yedek al, sil, yedekten yükle');
  await page.reload(); await ready(page);
  await page.click('nav button[data-tab="ayar"]');
  await page.click('[data-act="toggle"][data-id="bk"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[data-act="export"]')]);
  const bk = path.join(tmp, 'yedek.json'); await dl.saveAs(bk);
  const bj = JSON.parse(fs.readFileSync(bk, 'utf8'));
  ok(Object.keys(bj.items).length === s.items && Object.keys(bj._images).length === s.imgKeys.length && s.imgKeys.length > 0, 'yedek dosyası geçerli; ' + Object.keys(bj._images).length + ' resim kaydı içeriyor');
  const junk = path.join(tmp, 'baska.json'); fs.writeFileSync(junk, JSON.stringify({ firma_ad: 'x' }));
  await page.setInputFiles('#importFile', junk); await settle(page);
  ok((await stats(page)).items === s.items, 'yedek olmayan dosya veriyi silmedi');
  dialogAnswer = false; dialogs.length = 0;
  await page.setInputFiles('#importFile', bk); await settle(page);
  ok(dialogs.length === 1 && /silinir/.test(dialogs[0]) && (await stats(page)).items === s.items, 'yedek yükleme önce onay sordu');
  dialogAnswer = true;
  await page.click('button[data-act="wipe"]'); await settle(page);
  ok((await stats(page)).items === 0 && (await stats(page)).imgKeys.length === 0, 'tüm veriler silindi');
  await page.click('[data-act="toggle"][data-id="bk"]').catch(() => {});
  if (!(await page.$('#importFile'))) await page.click('[data-act="toggle"][data-id="bk"]');
  await page.setInputFiles('#importFile', bk); await settle(page);
  const after = await stats(page);
  ok(after.items === s.items && after.offers === s.offers && after.imgKeys.length === s.imgKeys.length, 'yedekten yükleyince ürünler ve resimler geri geldi');

  console.log('8. Sürüm testi işareti kaydedilir');
  await page.click('[data-act="toggle"][data-id="vt"]');
  await page.click('[data-act="vmark"][data-id="k1:ok"]'); await settle(page);
  ok((await stats(page)).rest.vtest.marks.k1 === 'ok', 'işaret veritabanına yazıldı');

  console.log('9. Yeni düzenler: ters tablo, birleşik hücreli fiyat listesi, özellik kartı');
  const duzen = path.join(tmp, 'duzenler.pdf');
  {
    const pg = await browser.newPage();
    await pg.setContent('<style>body{font-family:Arial;font-size:11pt}table{border-collapse:collapse}td,th{border:1px solid #333;padding:5px 16px;text-align:center}td.l{text-align:left}.p{page-break-after:always}.k td{border:0;padding:6px 30px}</style>' +
      '<div class="p"><h1>RSS Serisi</h1><div>TEK SERPANTİNLİ BOYLER</div><p>Sıcak su hazırlamaya yarayan basınçlı kaplardır.</p><img id="im" width="220" height="220"></div>' +
      '<div class="p"><h3>RSS Serisi Teknik Özellikler</h3><table>' +
      '<tr><td class="l">HACİM</td><td>lt</td><td>100</td><td>200</td><td>300</td><td>500</td></tr>' +
      '<tr><td class="l">İç Çap</td><td>mm</td><td>380</td><td>480</td><td>480</td><td>640</td></tr>' +
      '<tr><td class="l">Dış Çap</td><td>mm</td><td>480</td><td>580</td><td>580</td><td>740</td></tr>' +
      '<tr><td class="l">Yükseklik</td><td>mm</td><td>1050</td><td>1290</td><td>1840</td><td>1820</td></tr>' +
      '<tr><td class="l">Soğuk Su Girişi</td><td>inch</td><td colspan="2">1”</td><td colspan="2">1¼”</td></tr>' +
      '<tr><td class="l">Tasarım Basıncı</td><td>bar</td><td colspan="4">11</td></tr></table></div>' +
      '<div class="p"><table><tr><td style="border:0;width:90px"></td><td style="border:0" colspan="5"></td></tr>' +
      '<tr><td class="l" colspan="6" style="border:0;font-size:14pt"><b>SANTRİFÜJ POMPA</b></td></tr>' +
      '<tr><th></th><th>GÜÇ<br>( HP )</th><th>AĞIZ ÖLÇÜSÜ<br>( İNÇ )</th><th>BASMA</th><th>220 VOLT</th><th>380 VOLT</th></tr>' +
      '<tr><td rowspan="4"></td><td rowspan="2">1</td><td>1"</td><td>28</td><td rowspan="2">2.500,00</td><td rowspan="2">2.400,00</td></tr><tr><td>1,5"</td><td>25</td></tr>' +
      '<tr><td rowspan="2">2</td><td>1,5"</td><td>30</td><td rowspan="2">3.000,00</td><td rowspan="2">2.900,00</td></tr><tr><td>2"</td><td>30</td></tr>' +
      '<tr><td></td><td>4</td><td>2"</td><td>45</td><td>****</td><td>4.200,00</td></tr></table></div>' +
      '<div><h2 style="text-align:center">FORGED FLANGES</h2><div style="text-align:center">(Dövme Flanşlar)</div><table class="k" style="margin:10px auto">' +
      '<tr><td>Size<br>(Ebat)</td><td>Ø 1/2" - Ø 52"</td></tr><tr><td>Standard<br>(Standart)</td><td>ASTM , DIN , ISO</td></tr>' +
      '<tr><td>Material<br>(Malzeme)</td><td>Carbon Steel / Stainless Steel<br>(Karbon Çelik / Paslanmaz Çelik)<br>A105 , A182 F5 / F11</td></tr></table></div>');
    await pg.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 220; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 220, 220); g.fillStyle = '#36c'; g.fillRect(40, 40, 140, 140);
      const im = document.getElementById('im'); return new Promise(r => { im.onload = r; im.src = c.toDataURL('image/png'); }); });
    await pg.pdf({ path: duzen, format: 'A4' });
    await pg.close();
  }
  await page.click('button[data-tab="katalog"]');
  await page.fill('#brandName', 'DUZEN'); await page.fill('#supName', 'DUZEN');
  await page.selectOption('#kind', 'katalog');
  await page.setInputFiles('#docFile', duzen);
  await page.click('button[data-act="read"]');
  await page.waitForSelector('.job h3', { timeout: 30000 });
  await page.click('.job button[data-act="save"]'); await settle(page);
  {
    const items = (await idbGet('items')), offers = await idbGet('offers');
    const of = (re) => { const it = Object.values(items).find(i => i.brand === 'DUZEN' && re.test(i.name)); return it ? { it, offs: Object.values(offers).filter(o => o.itemId === it.id) } : null; };
    const rss = of(/^RSS Serisi$/), pompa = of(/^SANTRİFÜJ POMPA$/), kart = of(/^FORGED FLANGES/);
    ok(rss && rss.offs.length === 4 && rss.offs.map(o => o.size).join() === '100 lt,200 lt,300 lt,500 lt', 'ters tablo: her model ayrı ölçü ' + (rss ? rss.offs.map(o => o.size).join() : 'yok'));
    ok(rss && /İç Çap 380 mm · Dış Çap 480 mm · Yükseklik 1050 mm · Soğuk Su Girişi 1” · Tasarım Basıncı 11 bar/.test(rss.offs[0].specs) && /Soğuk Su Girişi 1¼”/.test(rss.offs[2].specs), 'ters tablo: özellikler ve birleşik hücre doğru');
    ok(rss && rss.it.sub === 'TEK SERPANTİNLİ BOYLER' && rss.it.hasImg, 'ters tablo: alt başlık ve resim önceki sayfadan alındı');
    ok(pompa && pompa.offs.length === 9, 'ızgara: 4 satır x 2 fiyat + yalnız 380 V olan 1 satır = 9 teklif ' + (pompa ? pompa.offs.length : 'yok'));
    const p1 = pompa && pompa.offs.find(o => o.size === '1 HP · 1,5" · 220 VOLT'), p2 = pompa && pompa.offs.find(o => o.size === '2 HP · 2" · 380 VOLT'), p3 = pompa && pompa.offs.filter(o => /^4 HP/.test(o.size));
    ok(p1 && p1.listPrice === 2500 && p2 && p2.listPrice === 2900 && p3.length === 1 && p3[0].listPrice === 4200, 'ızgara: birleşik hücredeki fiyatlar doğru satırlarda');
    ok(kart && kart.offs.length === 1 && kart.offs[0].size === 'Ø 1/2" - Ø 52"' && /Standart: ASTM , DIN , ISO · Malzeme: Carbon Steel/.test(kart.offs[0].specs), 'özellik kartı ürün oldu: ' + (kart ? kart.it.name + ' | ' + kart.offs[0].specs : 'yok'));
  }

  console.log('10. İnternetten ürün: sayfadan ad, fiyat, marka, kod');
  await page.evaluate(() => window.KlavuzShared('Şuna bir göz atın: Jabsco Pompa https://a.co/d/abc123'));
  ok(await page.inputValue('[data-np="name"]') === 'Jabsco Pompa' && await page.inputValue('[data-np="seller"]') === 'Amazon', 'paylaşım yazısındaki giriş sözü atıldı, kısa bağlantı Amazon olarak tanındı');
  await page.evaluate(() => window.KlavuzPage('<html><head><title>Amazon.com.tr</title><link rel="canonical" href="https://www.amazon.com.tr/dp/B000TEST01"></head><body>' +
    '<span id="productTitle">  Jabsco 31395-0292 Par-Max 2.9 Tatlı Su Basınç Pompası 12V  </span><a id="bylineInfo">Marka: Jabsco</a>' +
    '<div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">7.234,56 TL</span></span></div>' +
    '<img id="landingImage" src="data:image/gif;base64,R0lGOD" data-old-hires="https://m.media-amazon.com/images/I/test.jpg"></body></html>', 'https://www.amazon.com.tr/dp/B000TEST01?ref=x'));
  ok(await page.inputValue('[data-np="name"]') === 'Jabsco 31395-0292 Par-Max 2.9 Tatlı Su Basınç Pompası 12V', 'Amazon sayfasından tam ürün adı alındı');
  ok(await page.inputValue('[data-np="price"]') === '7234.56' && await page.inputValue('[data-np="brand"]') === 'Jabsco', 'fiyat ve marka alındı');
  ok(/amazon\.com\.tr\/dp\/B000TEST01$/.test(await page.textContent('#newprod .muted >> nth=-1')), 'kısa bağlantı yerine ürünün asıl adresi saklandı');
  await page.evaluate(() => window.KlavuzBack());
  await page.evaluate(() => window.KlavuzShared('https://www.hepsiburada.com/urun-p-HB1'));
  await page.evaluate(() => window.KlavuzPage('<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BreadcrumbList"},{"@type":"Product","name":"Rule 1100 GPH Sintine Pompası","sku":"RL-27D","brand":{"@type":"Brand","name":"Rule"},"image":["https://img.example.com/a.jpg"],"offers":{"@type":"Offer","price":"2899.90","priceCurrency":"TRY"}}]}<\/script></head><body></body></html>', 'https://www.hepsiburada.com/urun-p-HB1'));
  ok(await page.inputValue('[data-np="name"]') === 'Rule 1100 GPH Sintine Pompası' && await page.inputValue('[data-np="price"]') === '2899.9' && await page.inputValue('[data-np="brand"]') === 'Rule' && await page.inputValue('[data-np="code"]') === 'RL-27D', 'sitenin yapısal verisinden ad, fiyat, marka, kod alındı');
  await page.evaluate(() => window.KlavuzBack());
  await page.evaluate(() => window.KlavuzShared('https://www.amazon.com.tr/dp/B0'));
  await page.evaluate(() => window.KlavuzPage('<html><head><title>Robot Check</title></head><body></body></html>', ''));
  ok(/robot/.test(await page.textContent('#toast')), 'site bilgi vermeyince kullanıcıya söylendi');
  await page.evaluate(() => window.KlavuzBack());

  console.log('11. Fiyat değişikliği karşılaştırması');
  const zam = path.join(tmp, 'depo-zam.csv');
  fs.writeFileSync(zam, 'KV1-1001,Vana,150\n');
  await page.click('button[data-tab="katalog"]');
  await page.fill('#brandName', 'ECA'); await page.fill('#supName', 'DEPO A'); await page.selectOption('#kind', 'fiyat');
  await page.setInputFiles('#docFile', zam);
  await page.click('button[data-act="read"]');
  await page.waitForSelector('.job button[data-act="save"]', { timeout: 30000 });
  await page.click('.job button[data-act="save"]'); await settle(page);
  await page.click('nav button[data-tab="uyari"]');
  const cmpText = ((await page.textContent('.cmp').catch(() => '')) || '').replace(/\s+/g, ' ');
  ok(/Eski.*95.*Yeni.*150/.test(cmpText) && /%/.test(cmpText), 'uyarıda eski ve yeni fiyat yan yana: ' + cmpText);
  await page.click('button[data-act="ackall"]'); await settle(page);
  ok(!(await page.$('.cmp')), '"Hepsini gördüm" fiyat uyarılarını kapattı');

  console.log('13. ZIP dosyası kendiliğinden açılır');
  {
    const zlib = require('zlib');
    const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
    const crc = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
    const mkZip = (entries) => {
      const parts = [], cds = []; let off = 0;
      for (const e of entries) {
        const name = Buffer.from(e.name, 'utf8'), data = e.store ? e.data : zlib.deflateRawSync(e.data), lh = Buffer.alloc(30), cd = Buffer.alloc(46);
        lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(e.store ? 0 : 8, 8); lh.writeUInt32LE(crc(e.data), 14);
        lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(e.data.length, 22); lh.writeUInt16LE(name.length, 26);
        cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x800, 8); cd.writeUInt16LE(e.store ? 0 : 8, 10); cd.writeUInt32LE(crc(e.data), 16);
        cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(e.data.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(off, 42);
        parts.push(lh, name, data); cds.push(cd, name); off += 30 + name.length + data.length;
      }
      const cdBuf = Buffer.concat(cds), end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(off, 16);
      return Buffer.concat(parts.concat([cdBuf, end]));
    };
    const zipPdf = path.join(tmp, 'zip-katalog.pdf');
    await makeCatalog(browser, zipPdf, 2);
    const pdfBuf = Buffer.from(fs.readFileSync(zipPdf).toString('latin1').replace(/KÜRESEL/g, 'KÜRESEL'), 'latin1');
    const inner = mkZip([{ name: 'iç/liste.csv', data: Buffer.from('ZP-90002,Zip iç içe ürün,222\n') }]);
    const zf = path.join(tmp, 'kataloglar.zip');
    fs.writeFileSync(zf, mkZip([{ name: 'katalog/zip-katalog.pdf', data: pdfBuf }, { name: 'fiyat/zip-liste.csv', data: Buffer.from('ZP-90001,Zip içinden ürün,111\n'), store: true },
      { name: '__MACOSX/._x.pdf', data: Buffer.from('x') }, { name: 'resim.jpg', data: Buffer.from('x') }, { name: 'ic.zip', data: inner }]));
    const before = await stats(page);
    await page.click('button[data-tab="katalog"]');
    await page.fill('#brandName', 'ZIPMARKA'); await page.fill('#supName', ''); await page.selectOption('#kind', 'katalog');
    await page.setInputFiles('#docFile', zf);
    await page.click('button[data-act="read"]');
    await page.waitForFunction(() => document.querySelectorAll('.job button[data-act="save"]').length === 3, null, { timeout: 60000 });
    const names = await page.$$eval('.job h3', (els) => els.map((e) => e.textContent).join(' | '));
    ok(/zip-katalog\.pdf/.test(names) && /zip-liste\.csv/.test(names) && /liste\.csv/.test(names) && !/resim|MACOSX/.test(names), 'zip içindeki üç belge sıraya alındı, öbür dosyalar atlandı: ' + names);
    await page.click('button[data-act="saveall"]'); await settle(page);
    const after = await stats(page);
    ok(after.docs === before.docs + 3 && after.names.includes('Zip içinden ürün') && after.names.includes('Zip iç içe ürün'), 'zip içindeki belgeler (iç içe zip dahil) okunup kaydedildi ' + before.docs + '>' + after.docs + ' ' + after.names.filter((n) => /Zip|VANA SERİ [12]$/.test(n)).join(','));
  }

  console.log('14. Uygulama içi tarayıcıdan ürün alma');
  await page.evaluate(() => { window._open = []; window._imgs = []; window.KlavuzAndroid = { openBrowser(u) { window._open.push(u); }, fetchImage() {}, fetchImageFor(id, u) { window._imgs.push(u); setTimeout(() => window.KlavuzImageFor(id, ''), 0); } }; });
  await page.click('button[data-tab="katalog"]');
  await page.click('button[data-act="shop"][data-id="0"]');
  ok(await page.evaluate(() => window._open[0] === 'https://www.amazon.com.tr/'), 'Amazon uygulama içi tarayıcıda açılmak üzere istendi');
  await page.fill('#q', 'sintine pompası'); await page.waitForTimeout(150);
  await page.click('#webfind button[data-act="shop"][data-id="1"]');
  ok(await page.evaluate(() => /hepsiburada\.com\/ara\?q=sintine%20pompas%C4%B1$/.test(window._open[1])), '"Bunu internette bul" aramayı sitede açtı');
  await page.fill('#q', '');
  const amazonList = '<html><body>' + [1, 2, 3].map((n) => '<div data-component-type="s-search-result" data-asin="B00000000' + n + '"><img class="s-image" src="https://m.media-amazon.com/images/I/a' + n + '.jpg">' +
    '<h2><a href="/Seaflo-Pompa-' + n + '/dp/B00000000' + n + '/ref=sr_1_' + n + '?k=x"><span>Seaflo Sintine Pompası Model ' + n + '</span></a></h2><span class="a-price"><span class="a-offscreen">' + n + '.250,00 TL</span></span></div>').join('') + '</body></html>';
  await page.evaluate((h) => window.KlavuzGrab(h, 'https://www.amazon.com.tr/s?k=sintine'), amazonList);
  ok(/Sayfada 3 ürün bulundu/.test(await page.textContent('#grabbox')) && await page.inputValue('[data-gb="seller"]') === 'Amazon', 'arama sayfasındaki üç ürün liste olarak geldi');
  await page.uncheck('[data-gsel="2"]');
  ok(/\(2\)/.test(await page.textContent('#grabsave')), 'işareti kaldırılan ürün sayıdan düştü');
  await page.click('#grabsave'); await settle(page);
  let aoffs = (await idbGet('offers')).filter((o) => o.supplier === 'Amazon' && /\/dp\/B00000000\d$/.test(o.link || ''));
  ok(aoffs.length === 2 && aoffs.some((o) => o.listPrice === 1250 && o.link === 'https://www.amazon.com.tr/Seaflo-Pompa-1/dp/B000000001'), 'seçilen iki ürün fiyatı ve sade bağlantısıyla eklendi');
  ok(await page.evaluate(() => window._imgs.length === 2), 'resimler sırayla indirilmek üzere istendi');
  await page.evaluate((h) => window.KlavuzGrab(h.replace('1.250,00', '1.400,00'), 'https://www.amazon.com.tr/s?k=sintine'), amazonList);
  await page.click('#grabsave'); await settle(page);
  aoffs = (await idbGet('offers')).filter((o) => o.supplier === 'Amazon' && /\/dp\/B00000000\d$/.test(o.link || ''));
  ok(aoffs.length === 3 && aoffs.some((o) => o.listPrice === 1400 && o.lastDir === 'up'), 'aynı sayfa yeniden alınınca ürün çoğalmadı; fiyat güncellendi, eksik olan eklendi');
  const ldList = '<html><head><script type="application/ld+json">{"@type":"ItemList","itemListElement":[' + [1, 2].map((n) => '{"@type":"ListItem","position":' + n + ',"item":{"@type":"Product","name":"Rule Pompa ' + n + '00 GPH","url":"https://www.hepsiburada.com/rule-' + n + '-p-HB' + n + '","image":"https://img.example.com/' + n + '.jpg","offers":{"price":"' + n + '999.50","priceCurrency":"TRY"}}}').join(',') + ']}<\/script></head><body></body></html>';
  await page.evaluate((h) => window.KlavuzGrab(h, 'https://www.hepsiburada.com/ara?q=rule'), ldList);
  ok(/Sayfada 2 ürün bulundu/.test(await page.textContent('#grabbox')) && /1\.999,5/.test(await page.textContent('#grabbox')), 'sitenin yapısal listesinden ürünler ve fiyatlar alındı ' + (await page.textContent('#grabbox').catch(() => 'kutu yok')).slice(0, 300));
  await page.click('button[data-act="grabcancel"]');
  const generic = '<html><body><ul>' + [1, 2, 3].map((n) => '<li><a href="/urun/vana-' + n + '"><img alt="Pirinç Küresel Vana ' + n + '/2 inç" data-src="/img/v' + n + '.jpg"></a><div class="fiyat">' + n + '45,90 TL</div></li>').join('') + '</ul></body></html>';
  await page.evaluate((h) => window.KlavuzGrab(h, 'https://www.ornekmarin.com/kategori/vanalar'), generic);
  ok(/Sayfada 3 ürün bulundu/.test(await page.textContent('#grabbox')) && /245,9/.test(await page.textContent('#grabbox')) && await page.inputValue('[data-gb="seller"]') === 'ornekmarin.com', 'tanınmayan sitede de ürün bağlantısı + resim + fiyat kalıbıyla liste çıktı ' + (await page.textContent('#grabbox').catch(() => 'kutu yok')).slice(0, 300));
  await page.click('button[data-act="grabcancel"]');
  await page.evaluate(() => window.KlavuzGrab('<html><head><meta property="og:type" content="product"><meta property="og:title" content="Whale Gulper 220 Pompa 12V"><meta property="product:price:amount" content="6450.00"></head><body></body></html>', 'https://www.ornekmarin.com/urun/whale-gulper'));
  ok(await page.inputValue('[data-np="name"]') === 'Whale Gulper 220 Pompa 12V' && await page.inputValue('[data-np="price"]') === '6450', 'ürün sayfasında tek ürün formu açıldı');
  await page.evaluate(() => window.KlavuzBack());
  await page.evaluate(() => window.KlavuzGrab('<html><body><p>Hakkımızda</p></body></html>', 'https://www.ornekmarin.com/hakkimizda'));
  ok(/ürün bulunamadı/.test(await page.textContent('#toast')), 'ürün olmayan sayfada açıklayıcı uyarı verildi');
  await page.evaluate(() => { delete window.KlavuzAndroid; });

  console.log('12. Güncelleme: yeni sürüm bulunur, indirme istenir');
  await page.evaluate(() => { window._upd = ''; window.KlavuzAndroid = { checkUpdate() { window._chk = true; }, installUpdate(u) { window._upd = u; } }; });
  const rel = (v, sha) => ({ name: 'Klavuz ' + v + ' test-' + sha, created_at: '2026-11-15T10:00:00Z', assets: [{ name: 'Klavuz-' + sha + '.apk', size: 4100000, browser_download_url: 'https://github.com/haruncelik0052/KLAVUZ/releases/download/test-' + sha + '/Klavuz-' + sha + '.apk' }] });
  await page.evaluate((j) => window.KlavuzUpdate(j), JSON.stringify([rel('0.1.0', 'aaa1111')]));
  ok(!(await page.$('#updbox')), 'eski sürüm için güncelleme önerilmedi');
  await page.click('nav button[data-tab="ayar"]');
  await page.click('[data-act="toggle"][data-id="ab"]');
  await page.click('button[data-act="updcheck"]');
  ok(await page.evaluate(() => window._chk === true), '"Güncellemeyi denetle" denetimi başlattı');
  await page.evaluate((j) => window.KlavuzUpdate(j), JSON.stringify([rel('0.1.0', 'aaa1111'), rel('9.9.9', 'bbb2222'), { name: 'Klavuz test eski', assets: [] }]));
  ok(/Klavuz 9\.9\.9/.test(await page.textContent('#updbox')), 'yeni sürüm kutusu çıktı');
  await page.click('button[data-act="updinstall"]');
  ok(await page.evaluate(() => /releases\/download\/test-bbb2222\/Klavuz-bbb2222\.apk$/.test(window._upd)), 'doğru APK indirilmek üzere istendi');
  await page.evaluate(() => window.KlavuzUpdateProgress(40));
  ok(/%40/.test(await page.textContent('#updbox')), 'indirme ilerlemesi görünüyor');
  await page.evaluate(() => window.KlavuzUpdateProgress(100));
  ok(/Yükle/.test(await page.textContent('#updbox')), 'indirme bitince ne yapılacağı yazıyor');
  await page.evaluate(() => { delete window.KlavuzAndroid; });

  ok(errors.length === 0, 'sayfada hata yok ' + JSON.stringify(errors));
  await browser.close();
  if (process.env.KLAVUZ_KEEP) fs.copyFileSync(duzen, process.env.KLAVUZ_KEEP);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (failed) { console.error('FAIL: ' + failed + ' madde başarısız'); process.exit(1); }
  console.log('Tüm uçtan uca testler geçti');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
