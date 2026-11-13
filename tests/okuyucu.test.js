// Belge okuyucu testi: node tests/okuyucu.test.js
// tests/ornek/ altındaki dosyalar, gerçek PDF sayfalarından çıkarılmış yazı ve resim konumlarıdır.
const O = require('../okuyucu.js');
const fs = require('fs'), path = require('path');
const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'ornek', f), 'utf8'));
let fail = 0;
function ok(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); fail++; } }
function tables(f) { const p = load(f)[0]; return O.parsePage(p.items, p.images.filter((m) => Math.min(m.w, m.h) >= 38 && m.w * m.h < 0.5 * p.w * p.h), p.page).tables; }

console.log('Fiyat listesi (kodsuz, iki tablo)');
let t = tables('fiyat-listesi.json');
ok(t.length === 2, 'iki tablo bulundu');
ok(t[0].name === 'YATAY PLASTİK SU DEPOLARI', 'ilk ürün adı başlıktan alındı: ' + t[0].name);
ok(t[1].name === 'ÖRNEK TANK / DİKEY PLASTİK SU DEPOLARI', 'ikinci ürün adı: ' + t[1].name);
ok(t[0].rows.length === 10 && t[1].rows.length === 13, 'satır sayıları 10 ve 13');
ok(t[0].rows[0].size === '100 LT' && t[0].rows[0].price === 1000 && t[0].rows[0].priceVat === 1200, 'ölçü, KDV hariç ve KDV dahil fiyat doğru');
ok(t[0].rows[0].specs === 'GENİŞLİK 43 · YÜKSEKLİK 50 · UZUNLUK 80', 'diğer sütunlar özellik olarak alındı');
ok(t[1].rows[12].size === '25.000 LT' && t[1].rows[12].price === 23000, 'son satır (küçük yazılı) doğru');

console.log('Hortum kataloğu (yanında açıklama yazısı olan tablo)');
t = tables('hortum-katalog.json');
ok(t.length === 1 && t[0].rows.length === 30, 'tek tablo, 30 satır');
ok(t[0].name === 'ANATOLİA Telli Şeffaf Hortum', 'ürün adı: ' + t[0].name);
ok(t[0].rows[0].code === 'HCT008' && t[0].rows[0].size === '8 mm', 'kod ve ölçü doğru');
ok(t[0].rows[29].code === 'HCT152' && t[0].rows[29].size === '152 mm', 'son satır doğru');
ok(t[0].img != null, 'tabloya resim bağlandı');
ok(!/Maksimum|sahip|Features/.test(JSON.stringify(t[0].rows)), 'yandaki açıklama yazısı tabloya karışmadı');

console.log('Vana kataloğu (yan yana tablolar)');
t = tables('vana-katalog.json');
ok(t.length === 8, 'sekiz tablo bulundu');
ok(t.every((x) => x.name && x.hasCode), 'her tabloda ürün adı ve kod sütunu var');
ok(t[0].rows[0].code === '750121DNV' && t[0].rows[0].size === 'DN15', 'kod ve DN ölçüsü doğru');
ok(/Holes x Dia 4 x 12/.test(t[0].rows[0].specs), 'iki parçalı sütun birleştirildi');
ok(new Set(t.map((x) => x.img)).size === 8 && t.every((x) => x.img != null), 'her tabloya ayrı bir resim bağlandı');

console.log('Sayfa başlığı ürün adı olan katalog (iki dilli başlık, € fiyat)');
t = tables('rakor-tek-tablo.json');
ok(t.length === 1 && t[0].rows.length === 13, 'tek tablo, 13 satır');
ok(t[0].name === 'PASLANMAZ R1-ST/R2-SN HORTUM SOKETLERİ' && t[0].sub === 'STAINLESS R1-ST/R2-SN HOSE FERRULES', 'ad Türkçe başlık, alt başlık İngilizce');
ok(t[0].rows[0].code === 'BPHS105' && t[0].rows[0].size === '3/16"', 'kod ve ölçü doğru');
ok(t[0].rows[0].price === 1 && t[0].rows[0].cur === 'EUR', 'fiyat ve para birimi (EUR) doğru');
ok(t[0].rows.every((r) => /SERİ SERIE BPHS1/.test(r.specs)), 'birleşik hücredeki seri bütün satırlara yayıldı');
ok(!/www\./.test(t[0].name), 'sayfa altındaki web adresi ürün adı olmadı');

console.log('Çift fiyatlı tablo (TAKIM ve GÖVDE)');
t = tables('rakor-cift-fiyat.json');
ok(t.length === 1 && t[0].rows.length === 40, 'tek tablo, 20 satır x 2 teklif = 40');
ok(t[0].rows[0].code === 'BPNM10606' && t[0].rows[0].variant === 'TAKIM' && t[0].rows[1].code === 'BPNMG10606' && t[0].rows[1].variant === 'GÖVDE', 'takım ve gövde ayrı teklif');
ok(t[0].rows[0].price != null && t[0].rows[1].price != null, 'iki teklifin de fiyatı var');
ok(t[0].rows[0].size === '6 L' && t[0].rows[39].size === '38 S', 'birleşik hücredeki tip (L / S) ölçüye eklendi');

console.log('Üç tablo yan yana');
t = tables('uc-tablo-yan-yana.json');
ok(t.length === 6, 'altı tablo bulundu');
ok(t.map((x) => x.name).join('|') === ['MANŞON', 'KONİK REKOR', 'NİPEL', 'KÖR TAPA', 'DİRSEK 90°', 'KUYRUKLU DİRSEK'].join('|'), 'her tablonun adı kendi başlığından: ' + t.map((x) => x.name).join(', '));
ok(t[0].rows[0].code === 'AS11701' && t[0].rows[0].size === '1/8' && t[0].rows[0].price != null, 'kod, ölçü, fiyat doğru');
ok(t.every((x) => x.columns.length === 3), 'komşu tablonun sütunları karışmadı');

console.log('Farklı yükseklikte başlayan sütunlu tablolar');
t = tables('sutunlu-sayfa.json');
ok(t.length === 4, 'dört tablo bulundu');
ok(t.some((x) => x.name === 'REDÜKSİYON' && x.rows.length === 42), 'soldaki uzun tablo tek başına: 42 satır');
ok(t.some((x) => x.name === 'HORTUM REKORU AĞIR TİP' && x.rows[0].code === 'AS10101'), 'ortadaki tablo kendi adıyla');
ok(t.every((x) => x.columns.length === 3), 'komşu tablonun sütunları karışmadı');

console.log('Sertifika tanıma');
const c = load('sertifika.json');
ok(O.looksLikeCertificate(c.text, c.pageCount) === true, 'sertifika belgesi tanındı');
ok(O.looksLikeCertificate('GLOBE VALVES WITH CLASS CERTIFICATE type approval certificate of', 32) === false, 'uzun katalog sertifika sayılmadı');
ok(O.looksLikeCertificate('YATAY PLASTİK SU DEPOLARI FİYAT LİSTESİ', 1) === false, 'fiyat listesi sertifika sayılmadı');

console.log(fail ? fail + ' test BAŞARISIZ' : 'Tüm testler geçti');
process.exit(fail ? 1 : 0);
