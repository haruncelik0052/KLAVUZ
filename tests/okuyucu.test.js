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

console.log('Ters tablo (modeller sütunda, özellikler satırda)');
t = tables('ters-tablo.json');
ok(t.length === 1 && t[0].kind === 'ters' && t[0].rows.length === 15, 'tek ürün, 15 model');
ok(t[0].name === 'RSS Serisi', 'ad başlıktan, "Teknik Özellikler" eki atıldı: ' + t[0].name);
ok(t[0].rows[0].size === '65 lt' && t[0].rows[14].size === '3000 lt', 'her model ayrı ölçü: 65 lt ... 3000 lt');
ok(/İç Çap 380 mm · Dış Çap 480 mm · Yükseklik \(± 30mm\) 800 mm/.test(t[0].rows[0].specs), 'özellikler birimiyle alındı');
ok(/Soğuk Su Girişi 1” /.test(t[0].rows[7].specs) && /Soğuk Su Girişi 1¼” /.test(t[0].rows[8].specs), 'birleşik hücre doğru modellere yayıldı (600 lt: 1”, 800 lt: 1¼”)');
ok(/Sirkülasyon Bağlantısı 3\/4”/.test(t[0].rows[0].specs) && /Sirkülasyon Bağlantısı 1” /.test(t[0].rows[10].specs) && /Sirkülasyon Bağlantısı 1¼”/.test(t[0].rows[14].specs), 'üç parçalı birleşik hücre doğru');
ok(!/Temizlik Flanşı/.test(t[0].rows[0].specs) && /Temizlik Flanşı OP - 4”/.test(t[0].rows[3].specs) && /Temizlik Flanşı 5”/.test(t[0].rows[12].specs), 'boş (-) değer atlandı');
ok(/Serpantin Yüzey Alanı 0,32 m2/.test(t[0].rows[0].specs) && /Sensör Bağlantısı OP - 100 mm/.test(t[0].rows[0].specs), 'değeri alt satıra kaymış özellikler alındı');

console.log('Izgara fiyat listesi (birleşik hücre, bölüm başlıkları, iki fiyat sütunu)');
t = tables('izgara-fiyat.json');
ok(t.length === 3 && t.map((x) => x.name).join('|') === 'SANTRİFÜJ POMPA|JET POMPA|KADEMELİ POMPA', 'üç bölüm üç ürün: ' + t.map((x) => x.name).join(', '));
ok(t.every((x) => x.hasPrice && !x.hasCode && x.img != null), 'fiyatlı, kodsuz, resimli');
ok(t[0].rows.length === 32 && t[1].rows.length === 4 && t[2].rows.length === 10, 'satır sayıları 32, 4, 10');
let r0 = t[0].rows;
ok(r0[0].size === '1 HP · 1"' && r0[0].variant === '220 VOLT' && r0[0].price === 2500 && r0[1].variant === '380 VOLT' && r0[1].price === 2400, 'motor gücü ölçüye eklendi; 220 V ve 380 V ayrı teklif');
ok(r0[4].size === '1 HP · 2"' && r0[4].price === 2500 && r0[6].size === '1,5 HP · 1,5"' && r0[6].price === 2750, 'birleşik hücredeki güç ve fiyat doğru satırlara yayıldı');
ok(r0[10].size === '1,5 HP · 3*2,5"' && r0[10].price === 2900 && r0[22].size === '3 HP · 2"' && r0[22].price === 3600, 'ara fiyat grupları doğru');
ok(!r0.some((r) => /^0,5 HP/.test(r.size)) && r0[28].size === '4 HP · 2"' && r0[28].variant === '380 VOLT' && r0[28].price === 4200, 'fiyatı yıldızlı (*****) seçenekler alınmadı');
ok(r0[0].specs === 'AL.VER YÜKSEKLİK 28 · TON SAAT 7', 'diğer sütunlar özellik: ' + r0[0].specs);

console.log('Özellik kartı (kodsuz, fiyatsız tanıtım sayfası)');
t = tables('ozellik-karti.json');
ok(t.length === 2 && t.every((x) => x.kind === 'kart' && x.rows.length === 1), 'iki kart');
ok(t[0].name === 'INDUSTRIAL VALVES (Endüstriyel Vanalar)' && t[1].name === 'FASTENERS (Bağlantı Elemanları)', 'adlar: ' + t.map((x) => x.name).join(' | '));
ok(t[0].rows[0].size === 'Ø 1/2" - Ø 52"', 'ebat ölçü olarak alındı');
ok(/^Açıklama: Gate .*Vanaları\) · Standart: ASTM , DIN , ISO , EN , BS · Malzeme: Carbon Steel/.test(t[0].rows[0].specs), 'etiketler ve çok satırlı değerler eşlendi');
ok(/^Studbolts/.test(t[1].sub) && /Kalite: A193 B7 \/ A194 2H$/.test(t[1].rows[0].specs), 'etiketsiz giriş yazısı alt başlık oldu; son etiket doğru');
ok(t[0].img != null && t[1].img != null && t[0].img !== t[1].img, 'her karta kendi resmi bağlandı');

console.log('Para birimi ayrı sütunda (€)');
t = tables('para-birimi-sutunu.json');
ok(t.length === 1 && t[0].rows.length === 6 && t[0].name === 'MARİN BOYLER', 'tek tablo, 6 satır');
ok(t[0].rows[0].code === 'RMB 30' && t[0].rows[0].cur === 'EUR' && t[0].rows[0].price === 224, 'kod, fiyat ve para birimi (EUR) doğru');
ok(t[0].rows[0].specs === '', 'para birimi ve tekrar eden ADET sütunu özellik sayılmadı');

console.log('Birleşik hücre yayma');
ok(O.spanAssign([10, 20, 30, 40, 50], [15, 40], 3).join() === '0,0,1,1,1', 'iki değer beş satıra ortalanarak yayıldı');
ok(O.spanAssign([10, 20, 30, 40], [25, 40], 3).join() === '-1,0,0,1' || O.spanAssign([10, 20, 30, 40], [25, 40], 3).join() === '0,0,0,1', 'boş hücre atlanabilir');

console.log('Sertifika tanıma');
const c = load('sertifika.json');
ok(O.looksLikeCertificate(c.text, c.pageCount) === true, 'sertifika belgesi tanındı');
ok(O.looksLikeCertificate('GLOBE VALVES WITH CLASS CERTIFICATE type approval certificate of', 32) === false, 'uzun katalog sertifika sayılmadı');
ok(O.looksLikeCertificate('YATAY PLASTİK SU DEPOLARI FİYAT LİSTESİ', 1) === false, 'fiyat listesi sertifika sayılmadı');

console.log('OCR çıktısı (yazıları çizgiye çevrilmiş sayfa, renkli başlık, gri satırlar)');
t = tables('ocr-cizgi-yazi.json');
ok(t.length === 4, 'dört tablo bulundu: ' + t.length);
ok(t[0].name === 'GLOBE VALVES,BRONZE BODY & TRIM, JIS 5K', 'ürün adı: ' + t[0].name);
ok(t[0].rows.length === 14 && t[1].rows.length === 14 && t[2].rows.length === 12 && t[3].rows.length === 12, 'bütün satırlar, iki kod sütunu ayrı seçenek (7×2, 6×2)');
ok(t[0].rows[0].code === '750121' && t[0].rows[0].variant === 'STOP' && t[0].rows[1].code === '751051' && t[0].rows[1].variant === 'SDNR', 'STOP ve SDNR kodları ayrı');
ok(t[0].rows[0].size === '15A' && /PCD 60/.test(t[0].rows[0].specs) && /HOLES 4X12/.test(t[0].rows[0].specs), 'ölçü ve özellikler: ' + t[0].rows[0].size + ' · ' + t[0].rows[0].specs);
ok(t[2].rows.every((r) => /^\d{6}$/.test(r.code)), 'gri satırlardaki kodlar da okundu');

console.log('OCR çıktısı: ürün bloğu (büyük başlık, açıklama, resim, ara yazı, tablo)');
t = tables('ocr-urun-blogu.json');
ok(t.length === 3, 'üç ürün tablosu: ' + t.length);
ok(t.every((x) => /^Non-automatic Bilge Pumps 01 Series/.test(x.name)), 'adlar büyük yazılı başlıktan alındı, "Blister" gibi ara yazılardan değil: ' + t.map((x) => x.name).join(' | '));
ok(t[0].rows[0].code === 'SFBP1-G350-01' && t[1].rows[0].code === 'SFBP1-G1500-01', 'model kodları doğru: ' + t[0].rows[0].code + ', ' + t[1].rows[0].code);
ok(!t[1].rows.some((r) => /Non-automatic/.test(r.code + r.size + r.specs)), 'sonraki ürünün başlığı önceki tabloya satır olarak karışmadı');

console.log(fail ? fail + ' test BAŞARISIZ' : 'Tüm testler geçti');
process.exit(fail ? 1 : 0);
