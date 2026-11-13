# Klavuz — devir notu

Bu dosya, Klavuz uygulamasının başka bir Claude oturumuna devrinde kullanılmak üzere hazırlandı.

## Depo ve dal

- Depo: github.com/haruncelik0052/KLAVUZ
- Çalışma dalı: `ilk-surum` (`main` dalında sadece README var; birleştirme yapılmadı)
- Son commit: `37b8c88` (telefon geri bildirimi sürümü)

## Dosyalar

- `index.html`, `app.js`, `manifest.json`, `icon.svg`, `sw.js`: web uygulaması (düz JavaScript, sunucu yok)
- Veriler tarayıcıda `localStorage` (anahtar `klavuz.v1`) içinde; ürün resimleri `IndexedDB` (`klavuz-img`) içinde
- `android/`: WebView kabuğu. Yerel Android SDK yok; APK GitHub Actions'ta derlenir (`.github/workflows/build-apk.yml`)
- `tests/e2e.js`: Playwright ile uçtan uca test. `tests/katalog.pdf` örnek belge
- `README.md`: kullanım ve bilinen sınırlar

Not: Workflow sadece `index.html app.js manifest.json icon.svg` dosyalarını APK'ya kopyalar. Yeni bir web dosyası eklenirse workflow'a da eklenmeli.

## Test ve APK yayını

1. Yerel test: klasörde `python3 -m http.server 8080` çalıştırın, sonra `node tests/e2e.js`. Playwright'ın chromium'u hazır olmalı; yoksa `PW_MODULES` ortam değişkeniyle modül yolunu verin.
2. Her push `ilk-surum` dalında APK üretir. Yayın etiketi: `test-<commit 7 karakter>`.
3. APK'yı indirirken `gh release download` GraphQL hatası verir. Bunun yerine REST kullanın: `gh api repos/haruncelik0052/KLAVUZ/releases/tags/<etiket>` ile asset id alın, sonra `gh api repos/haruncelik0052/KLAVUZ/releases/assets/<id> -H "Accept: application/octet-stream"`.

## Kullanıcı hakkında

- Kullanıcı: Harun Çelik (HC MARIN WORKS). Yazılımcı değil. Yanıtlar kısa, sade Türkçe ve adım adım olmalı.
- Teknik kararları Claude kendisi versin, sonucu sade bir dille bildirsin. Kullanıcıya sadece iş kararı, onay ve cihaz testi için soru sorulsun.
- Her değişiklikte kullanıcıya APK verilsin; testi telefonunda kendisi yapar.
- Cihaz testi istenirse adımlar tek tek, sırayla verilsin.

## Ürün kuralları (kararlar)

- Ana katalog ve fiyat listesi ayrı belge türleridir.
- Fiyat listesinde ana katalogda olmayan kod: "Ana katalogda yok, bekliyor".
- Aynı ürün farklı marka/kodla geliyorsa manuel birleştirilir; kodlar korunur, alternatif satıcı olarak eklenir.
- Fiyat değişiklikleri arşivde tutulur. Yükseldi/düştü uyarısı verilir. Satış fiyatı alış fiyatının altına düşerse kırmızı uyarı.
- Okuma hatalarına karşı uyuşmazlıklar kullanıcıya gösterilir. İkinci bir okuma motoru henüz yok.
- Büyük PDF'ler kullanıcı tarafından sayfa sayfa bölünerek yüklenebilir.
- Ürünün resmi tektir; fiyat ve kod ölçüye göre değişebilir (varyant).
- Dahili görünümde alış ve kâr görünür. Müşteri çıktısında sadece satış fiyatı yer alır.
- Arama: yazım hatasına karşı "Bunu mu aradınız?" önerisi gösterilir, otomatik seçim yapılmaz.
- Her teklif kendi para biriminde (TL varsayılan, € ve $ tespit edilir). Sepet toplamları para birimine göre ayrı toplanır.
- Bildirim zili: şeffaf, yuvarlak, durum renkli (yeşil yok, sarı diğer uyarılar, kırmızı satış alış altı). Bu ve tırnak menü kararları Ada uygulama ailesinden alınmıştır (bkz. kullanıcı belleğindeki ada notları).
- Hedef cihazlar: telefon ve tablet (Redmi Pad SE). Masaüstü sonra.
- TeklifX ve Google Drive entegrasyonu ilk sürüme alınmadı; sonraki aşama.
- Web'den ürün ekleme ve resim çekme sonraki aşama.

## Mevcut durum (37b8c88)

Var olanlar:
- PDF, Excel, CSV, TXT okuma; PDF'lerden ürün satırı ve resim çıkarma
- Ürün kartı, ölçü chip'leri, varyant gruplama
- Ara: filtre çipleri (Tümü, Kontrol gerekli, Doğrulanmamış, Resimsiz, Bekleyen)
- Ürün sayfası: Doğrula, Düzelt, Sonraki kontrol, Belgeden resim seç, Web'de görsel ara bağlantısı
- Fiyat geçmişi, sepet, müşteri çıktısı, yazdır/kopyala
- Uyarılar ve bildirim ayarları (Ayarlar'dan açıp kapatma)
- Belge silme (ilgili teklifler ve boşalan ürünler birlikte silinir)
- Yedek indirme ve yükleme (resimler yedeğe dahil değil)

## Açık işler (öncelik sırasıyla)

1. Kullanıcının telefondan geri bildirimini bekle (37b8c88 APK). Doğrulanmadı: WebView'da IndexedDB'nin `file://` altında kalıcılığı.
2. Karşılaştırma ekranı: Ada boru ustası uygulamasındaki gibi, aynı ürünün iki veya daha fazla teklifini/varyantını yan yana gösterme. Kaynak sayfa görüntüsü de eklenebilir.
3. Doğrulama akışı: Uyarılar'dan "Kontrole başla" ile sırayla kontrol.
4. Arama arayüzünü Ada tarzına yaklaştırma.
5. Telefondan galeri resmi ekleme; web'den görsel indirme.
6. Resimleri yedeğe dahil etme.
7. Tablo biçimindeki kataloglarda ürün adı ve ölçü sütunlarının bozuk okunması (kullanıcı ekran görüntüsü paylaştı; kısmen düzeltildi, doğrulanmadı).
8. Standart satırları (ISO, EN, ASTM, UNS, DIN, JIS vb.) filtreleme listesini genişletme.
9. Taranmış (resim) PDF'ler okunmuyor. OCR gerekir.
10. Ayarlar'da uygulama arayüzünü kolayca değiştirebilecek küçük ayarlar (kullanıcı istedi, henüz yok).
11. Kullanıcının telefonundaki eski bozuk veriyi temizleme: Belgeler listesinden silme ya da Ayarlar'dan tüm verileri silme.
12. `main` dalına birleştirme ve GitHub Pages: sorulmadı, yapılmadı.
