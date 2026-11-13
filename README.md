# KLAVUZ

Tedarikçi kataloglarını ürün kartlarına çeviren, arama ve teklif hazırlayan uygulama. Telefon ve tablet için.

## Ne yapar

- **Belge:** PDF, Excel (xlsx/xls), CSV veya TXT dosyasını yükler, ürünleri okur. Kaydetmeden önce listeyi kontrol edersiniz.
- **Ara:** Ürün adı, kod veya marka ile arar. Kod yazımı benzer olursa "Bunu mu aradınız?" önerir. Otomatik seçim yapmaz.
- **Ürün kartı:** Aynı ürünün tedarikçi teklifleri, ölçü ölçü kod ve fiyatlar. Benzer ürünleri siz birleştirirsiniz.
- **Fiyat geçmişi:** Fiyat değişikliklerini arşivler. Yükselen ve düşen fiyatları işaretler.
- **Sepet ve teklif:** Kalem ve sepet iskontosu. Dahili özette alış ve kâr görünür. Müşteri çıktısında yalnızca satış fiyatı yer alır.
- **Uyarılar:** Fiyat değişiklikleri, satış fiyatının alış fiyatının altına düşmesi, ana katalogda olmayan kodlar.

## Kullanım

- Veriler cihazın tarayıcısında saklanır. Ayarlar > Yedek ile düzenli yedek alın.
- Ana katalog ve fiyat listesi ayrı belge olarak yüklenebilir. Fiyat listesindeki kod ana katalogda yoksa "bekliyor" olarak işaretlenir.

## Bilinen sınırlar

- Taranmış PDF'ler ve tabloları resim olarak duran kataloglar okunamaz (OCR gerekir). Uygulama bunu açıkça bildirir.
- Tablosu olmayan, serbest yazılı belgelerde yalnızca kodu ve fiyatı aynı satırda olan ürünler okunur.
- Web sitesinden ürün ekleme, Google Drive ile eşitleme ve TeklifX entegrasyonu sonraki aşamalardadır.

## Dosyalar

- `index.html` — ekran iskeleti
- `app.js` — ekranlar ve veri
- `okuyucu.js` — belge okuyucu (PDF tablolarını ürüne çevirir)
- `vendor/` — PDF ve Excel kütüphaneleri (uygulamanın içinde, internet gerekmez)
- `sw.js`, `manifest.json`, `icon.svg` — uygulamayı telefona kurma ve çevrimdışı açma
