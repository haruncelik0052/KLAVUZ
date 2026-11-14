# Klavuz — devir notu

> **Sonraki sürüm için istek listesi, bilinen eksikler ve devralan oturumun ilk görevi: `SONRAKI_SURUM.md`.** Önce bu dosyayı, sonra onu okuyun.

Bu dosya, Klavuz uygulamasının başka bir Claude oturumuna devrinde kullanılmak üzere hazırlandı.

## Depo ve dal

- Depo: github.com/haruncelik0052/KLAVUZ
- Çalışma dalı: `ilk-surum` (`main` dalında sadece README var; birleştirme yapılmadı)
- Güncel çalışma: `ccr-9862a3e5-483rrf` dalı (sürüm 0.6.0; `ccr-2f65d271-hbxt5y` üzerine kuruldu)

## Dosyalar

- `index.html`, `app.js`, `manifest.json`, `icon.svg`, `sw.js`: web uygulaması (düz JavaScript, sunucu yok)
- Veriler `IndexedDB` içinde (`klavuz-img` veritabanı, sürüm 2): `data` deposu ürün / teklif / belge / ayar, `img` deposu resimler, `draft` deposu okunmuş ama kaydedilmemiş belgeler. Eski `localStorage` kaydı (`klavuz.v1`) ilk açılışta taşınır ve silinmez
- `android/`: WebView kabuğu. Yerel Android SDK yok; APK GitHub Actions'ta derlenir (`.github/workflows/build-apk.yml`)
- `tests/e2e.js`: Playwright ile uçtan uca test. `tests/katalog.pdf` örnek belge
- `README.md`: kullanım ve bilinen sınırlar

Not: Workflow `index.html app.js okuyucu.js manifest.json icon.svg` dosyalarını ve `vendor/` klasörünü APK'ya kopyalar. Yeni bir web dosyası eklenirse workflow'a da eklenmeli.

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

## Mevcut durum (sürüm 0.2.0 ve 0.3.0)

Bu sürümde yapılanlar:
- Belge okuyucu tablo mantığıyla yeniden yazıldı (`okuyucu.js`): tablo başlığı ürün adı olur, sütun adları kod / ölçü / fiyat / özellik olarak eşlenir, bir resim yanındaki tablonun tüm satırlarına bağlanır. Yan yana tablolar ve tablonun yanındaki açıklama yazıları ayrılır.
- Resimler PDF'in içinden temiz alınır (üstüne yazı binmez), kenar boşlukları kırpılır.
- Sertifika / onay yazıları ürün olarak okunmaz; sayfa görüntüsü olarak saklanır ve Belgeler'den açılır. Otomatik tanınır, kullanıcı "Ürün olarak oku" diyebilir.
- PDF ve Excel kütüphaneleri uygulamanın içinde (`vendor/`); internet gerekmez.
- Alt bar: seçili sekme yukarı kalkar ve kendi renginde ışık yakar; her sayfada görünür.
- Ayarlar: "Deneyim ve öneri" (1-9 puan, deneyim, öneri, WhatsApp ile paylaş) ve "Sürüm testi" (✓ / ✗ listesi). Sürüm testi listesi `app.js` içindeki `VTEST` dizisidir; her sürümde güncellenmeli.
- Yedek artık resimleri ve saklanan belgeleri de içerir. APK'da yedek dosyası Android'in "kaydet" penceresiyle yazılır.
- Android: dış bağlantılar (WhatsApp, tarayıcı) uygulamanın dışında açılır. Test APK'ları sabit bir test anahtarıyla imzalanır (`android/app/klavuz-test.keystore`); böylece yeni sürüm eskisinin üstüne kurulur. Bu anahtar yalnızca test içindir, mağaza yayını için ayrı anahtar gerekir.
- Kodsuz fiyat listelerinde (örn. depo listesi) aynı ürün + aynı ölçü aynı teklif sayılır; "ana katalogda yok" uyarısı yalnızca kodlu satırlara verilir.

Testler:
- `node tests/okuyucu.test.js` — okuyucu testleri (`tests/ornek/` altındaki gerçek sayfa örnekleriyle).
- `python3 -m http.server 8080` sonra `node tests/e2e.js` — uçtan uca test (internetsiz).

Dal notu: 0.2.0 çalışması `ccr-2f65d271-hbxt5y` dalında yapıldı (`ilk-surum` üzerine). APK iş akışı bu dalda da çalışır.

## Sürüm 0.3.0 ekleri

- Okuyucu: sayfa başlığını ürün adı olarak alma (tablodan uzakta olsa da), iki dilli ve çok satırlı sütun başlıkları, birleşik hücreler (SERİ, TİP) bütün satırlara yayılır, aynı tabloda çift kod + fiyat (TAKIM / GÖVDE) ayrı teklif olur, sayfaya sütun sütun dizilmiş küçük tablolar ayrılır, kodu ve fiyatı olmayan bilgi tabloları ürün sayılmaz, web adresi / e-posta ürün adı olmaz.
- Resim: adaylar içinden fotoğraf, teknik çizime tercih edilir.
- Okuma raporu: her belge için ürün / satır / resim sayıları, uyarı nedenleri ve örnekleri. Belge sekmesinde "Rapor" düğmesi; WhatsApp ile paylaşılır. Uyarı nedeni teklifte saklanır (`offer.why`) ve ürün sayfasında görünür.
- Ada firma profili (JSON) yükleme: Ayarlar > Firma bilgileri.
- Sürüm testi maddeleri markaya değil sisteme yönelik (kullanıcı isteği).
- Kullanıcının katalogları Google Drive'da: KATALOG klasörü (kullanıcı bağlantıyı sohbette verir). Okuyucu hataları oradaki gerçek PDF'lerle tekrarlanıp düzeltilir.

Ölçülen sonuç (0.2.0 -> 0.3.0): Boss kataloğunda "kontrol gerekli" 2.067 -> 6 satır (3.048 kod, 135 ürün); Asel'de 241 -> 14 satır (1.124 kod, 129 ürün).

## Kullanıcıyla konuşulan, henüz yapılmayan tasarım kararları

- Marka ve satıcı ayrı olacak: marka = ürünler, resimler, teknik bilgiler, sertifikalar; satıcı = fiyat, iskonto, iletişim, sipariş. Şu an ikisi `supplier` / `brand` alanında karışık.
- Kategori ağacı (Rakor, Vana, Hortum, Flanş, Depo...), süzgeçler (marka, malzeme, bağlantı tipi, ölçü) ve tarifle arama (Türkçe-İngilizce eş anlamlılar).
- Marka paketi: ana katalog burada okunup doğrulanır, uygulamaya tek dosya olarak yüklenir.
- Veri büyüdükçe `localStorage` sınırı (yaklaşık 5 MB) dolabilir; üç katalogla 1,6 MB. Veriyi IndexedDB'ye taşımak gerekecek.

## Açık işler (öncelik sırasıyla)

1. Kullanıcının 0.3.0 telefon geri bildirimini bekle (Ayarlar > Sürüm testi). Doğrulanmadı: WebView'da resimlerin kalıcılığı, paylaşım ve yedek kaydetme pencereleri.
2. OCR: taranmış PDF'ler ve tabloları resim olan kataloglar (örn. Flowmaster) okunamıyor.
3. Karşılaştırma ekranı: aynı ürünün teklif ve varyantlarını yan yana gösterme.
4. "Kontrole başla" akışını iyileştirme.
5. Arama arayüzünü Ada tarzına yaklaştırma.
6. Telefondan galeri resmi ekleme; web'den görsel indirme.
7. Ayarlarda yazı boyutu gibi küçük arayüz ayarları.
8. `main` dalına birleştirme ve GitHub Pages: sorulmadı, yapılmadı.

## Sürüm 0.4.0 ekleri (sağlam temel)

- **Veri saklama:** `localStorage` yerine IndexedDB. `boot()` eski kaydı bir kez taşır; veritabanı açılamazsa eski yöntemle çalışır. `save()` gecikmeli toplu yazar (`flush()`).
- **Belge sırası (`jobs`):** çoklu dosya seçimi, sırayla ve arka planda okuma, her sayfada görünen durum şeridi (`#strip`). Okunan belge "Kontrol" kartı olarak bekler; tek tek ya da toplu kaydedilir.
- **Parça parça okuma:** `readPdf` sayfaları tek tek işler ve bırakır; her 20 sayfada (`CHUNK`) ara kayıt yapar. 8 MB üstü dosyanın tamamı belleğe alınmaz (`openPdf`, `PDFDataRangeTransport`). Uygulama kapanırsa okuma "yarım kaldı" olarak saklanır; aynı dosya (parmak izi: `fingerprint`) yeniden seçilince kaldığı sayfadan devam eder.
- **Hız:** PDF motoru artık ayrı iş parçacığında çalışabilir (`index.html` içinden `pdf.worker.min.js` etiketi kaldırıldı; çalışamazsa pdf.js kendiliğinden ana iş parçacığına döner). Hazır olmayan resim için 1,5 sn bekleme kaldırıldı. `commit` dizinle eşleştirir. Okuma raporunda süre ve motor yazar.
- **Yedek:** parça parça yazılır (Android köprüsü `saveBegin / saveChunk / saveEnd`). Yedekten yükleme önce onay sorar; Klavuz yedeği olmayan dosyayı reddeder.
- **Aynı belge uyarısı:** belge parmak izi `db.docs[].fp` içinde saklanır.
- **Android:** çoklu belge seçici (`OpenMultipleDocuments`; Drive görünür), geri tuşu (`KlavuzBack`), uygulama kapanmak yerine arka plana alınır.
- **Testler:** `tests/e2e.js` yeniden yazıldı (taşıma, çoklu okuma, taslak kalıcılığı, yarım kalan okuma, aynı belge, yedek). `window.KLAVUZ_TEST` yalnız testlerde kullanılır.
- **Simge:** üç seçenek `simge/` klasöründe; kullanıcı seçince `icon.svg` ve Android başlatıcı simgesi yapılacak.

Telefonda doğrulanmadı (0.4.0): WebView'da arka plan iş parçacığı (Ayarlar > Uygulama bilgileri'nde "okuma motoru" yazar), Drive'dan seçilen büyük dosyanın parça parça okunması, parçalı yedek yazma, geri tuşu.

## Sürüm 0.5.0 ekleri (marka, satıcı, kategori)

Kullanıcı kararı (14.11.2026): **seçim sorulmasın; gerekli seçim ve kararları Claude versin, ince ayar kullandıkça yapılır, öncelik verimli uygulama.** Bu yüzden simge de Claude tarafından seçildi (seçenek 2: katalog + büyüteç).

- **Marka ve satıcı ayrı:** `item.brand` = marka, `offer.supplier` = satıcı. Belge yüklerken iki ayrı alan; satıcı boşsa marka ile aynı sayılır. Kartlar `db.brands[ad]` ve `db.sellers[ad]` içinde (web, telefon, e-posta, not; satıcıda iskonto). Kart ilk belgede kendiliğinden oluşur; site / telefon / e-posta belgeden bulunup boş alanlara yazılır (`scanContacts`, `profileFill`).
- **Tek kart, çok satıcı:** `commit` aynı marka + aynı kodu başka satıcıdan görürse yeni ürün açmaz, mevcut karta teklif ekler. Fiyat listesinde marka bilinmiyorsa kod bütün markalarda aranır; tek ürüne denk gelirse ona bağlanır.
- **Kategori:** `CATS` (22 grup, anahtar sözcüklerle). `classify` ürünü adından ayırır; ayıramadığı "Kategorisiz" kalır. Elle atama `setCategory` ile öğrenilir (`db.learn`) ve elle atanmamış benzer ürünlere uygulanır. Eski ürünler açılışta bir kez ayrılır.
- **Arama:** Kategori / Marka / Satıcı / Belge grupları (sayılarıyla), marka ve satıcı kartı, karttan belge yükleme. Tarifle arama: her sözcük ayrı aranır, Türkçe–İngilizce eş anlamlılar (`SYN`) sayılır.
- **Simge:** `icon.svg` ve Android başlatıcı simgesi (`res/drawable/ic_klavuz*.xml`).

Sıradaki iş (0.6.0): okunamayan düzenler — ters tablo (Rushwarm), kodsuz özellik kartı (Asmarine), çift fiyat sütunlu kodsuz liste (Eser Pompa), sonra OCR. Ardından 0.7.0: karşılaştırma ekranı, ekran düzeni, isteğe bağlı Drive bağlantısı.

## Sürüm 0.6.0 ekleri (yeniden okuma, otomatik kontrol, teklife aktarma, internetten ürün)

Kullanıcının 0.5.0 telefon sonucu: 17 / 22 işaretlendi, 16 ✓. Kurulum, veri taşıma, çoklu ve arka planda okuma, yarım kalan okumaya devam, yedek (31 MB) ve geri tuşu telefonda çalıştı. 10 MB üstü katalog ve okuma hızı henüz denenmedi.

- **Yeniden okuma:** `recommit` eski okumanın kayıtlarını yenisiyle değiştirir; elle doğrulanan ürün, özel satış fiyatı, iskonto, sepet, fiyat geçmişi, not ve elle atanan kategori korunur. Daha önce yüklenmiş dosya yeniden seçilince soru sorulmaz, kendiliğinden kaydedilir. 25 MB altı belgelerin aslı `file` deposunda saklanır (`doc.hasFile`); "Yeniden oku" ve "Aslı saklı belgeleri yeniden oku" düğmeleri. Veritabanı sürümü 3.
- **Otomatik kontrol (`autoCheck`):** çözülebilen uyarıları kapatır, uyarısı kalmayan ürünü "otomatik doğrulandı" yapar (`item.autoVer`). Her kayıttan sonra, her yeni sürümün ilk açılışında ve Uyarılar ekranındaki düğmeyle çalışır. Ad bulunamadı / kod okunamadı / fiyat okunamadı elle kontrole kalır.
- **Fiyatsız ve kodsuz tablo:** adı, resmi ve ölçüleri varsa ürün kartı olur (`readPage` içinde `plain`).
- **İkinci kategori (`item.cat2`)** ve ürün sayfasında **benzer / alternatif ürünler** (`altItems`).
- **Teklife aktarma:** sepet `cartCsv` ile noktalı virgüllü tablo dosyası olur. TeklifX'in içe aktarma biçimi henüz tanımlı değil; tanımlanınca sütunlar ona uydurulacak.
- **Elle ürün ve internetten paylaşım:** Android `SEND` (text/plain) alıcısı; `KlavuzShared` bağlantı ve adı ayırır. İnternet varsa `fetchText` / `fetchImage` sayfadan ad, fiyat, resim almayı dener (yalnız https, yalnız paylaşılan adres). Site izin vermezse form elle doldurulur.
- **Durum özeti:** Ayarlar > Uygulama bilgileri. Belge bazında sayı ve uyarı nedenlerini metin olarak paylaşır; yedek dosyası (onlarca MB) bu ortamda açılamadığı için uzaktan teşhiste bu kullanılır.

Sıradaki iş: okunamayan düzenler (ters tablo, kodsuz özellik kartı, çift fiyat sütunlu liste, OCR). Bunun için gerçek sayfa örneği gerekir; kullanıcıdan durum özeti ve okuma raporları istenecek.
