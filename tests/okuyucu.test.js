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

console.log('Sertifika tanıma');
const c = load('sertifika.json');
ok(O.looksLikeCertificate(c.text, c.pageCount) === true, 'sertifika belgesi tanındı');
ok(O.looksLikeCertificate('GLOBE VALVES WITH CLASS CERTIFICATE type approval certificate of', 32) === false, 'uzun katalog sertifika sayılmadı');
ok(O.looksLikeCertificate('YATAY PLASTİK SU DEPOLARI FİYAT LİSTESİ', 1) === false, 'fiyat listesi sertifika sayılmadı');

console.log(fail ? fail + ' test BAŞARISIZ' : 'Tüm testler geçti');
process.exit(fail ? 1 : 0);
