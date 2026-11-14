# Klavuz — devir notu

> **Sonraki sürüm için istek listesi, bilinen eksikler ve devralan oturumun ilk görevi: `SONRAKI_SURUM.md`.** Önce bu dosyayı, sonra onu okuyun.

Bu dosya, Klavuz uygulamasının başka bir Claude oturumuna devrinde kullanılmak üzere hazırlandı.

## Depo ve dal

- Depo: github.com/haruncelik0052/KLAVUZ
- Çalışma dalı: `ilk-surum` (`main` dalında sadece README var; birleştirme yapılmadı)
- Güncel çalışma: `claude/klavuz-app-handover-mtewnk` dalı (sürüm 0.12.1; `ccr-1df92bb6-t62pv1` üzerine kuruldu)

## Dosyalar

- `index.html`, `app.js`, `manifest.json`, `icon.svg`, `sw.js`: web uygulaması (düz JavaScript, sunucu yok)
- Veriler `IndexedDB` içinde (`klavuz-img` veritabanı, sürüm 2): `data` deposu ürün / teklif / belge / ayar, `img` deposu resimler, `draft` deposu okunmuş ama kaydedilmemiş belgeler. Eski `localStorage` kaydı (`klavuz.v1`) ilk açılışta taşınır ve silinmez
- `android/`: WebView kabuğu. Yerel Android SDK yok; APK GitHub Actions'ta derlenir (`.github/workflows/build-apk.yml`)
- `tests/e2e.js`: Playwright ile uçtan uca test. `tests/katalog.pdf` örnek belge
- `README.md`: kullanım ve bilinen sınırlar

Not: Workflow `index.html app.js okuyucu.js ocr.js manifest.json icon.svg` dosyalarını ve `vendor/` klasörünü APK'ya kopyalar. Yeni bir web dosyası eklenirse workflow'a da eklenmeli.

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

## Sürüm 0.7.0 ekleri (okunamayan düzenler)

Gerçek Rushwarm, Asmarine ve Eser Pompa dosyaları Drive'dan indirilip çözüldü. Üç yeni okuyucu `okuyucu.js` içinde, `parsePage` başında çalışır; bulduğu bölgeyi sayfadan çıkarır, kalan olağan yolla okunur.

- **Ters tablo (`tersTablo`, `kind: 'ters'`):** ilk satır "HACİM lt 65 80 100 ..." gibi model ekseni, alt satırlar özellik. Her model bir ölçü ("65 lt"), özellikler `specs` içinde birimiyle. Birkaç modeli kapsayan birleşik hücre doğru modellere yayılır. Uygulama (`readPage`) bu ürünün fotoğrafını ve alt başlığını bir önceki sayfadan alır (`prevPage`, `prevSub`).
- **Izgara fiyat listesi (`izgara`, `kind: 'izgara'`):** birleşik hücreli, kodsuz liste. Bölüm başlıkları ayrı ürün; birleşik sütunlar (motor gücü) ölçüye eklenir ("1 HP · 1,5\""); birden çok fiyat sütunu (220 VOLT / 380 VOLT) ayrı teklif olur; yıldızlı / boş fiyat alınmaz. Yalnız birleşik hücre varsa devreye girer; kodlu tablolar olağan yolla okunur.
- **Özellik kartı (`kartlar`, `kind: 'kart'`):** sayfada tablo yoksa denenir. Başlık + solda etiketler (Size / Standard / Material, altında Türkçesi), sağda değerler. Ebat ölçü olur, diğerleri özellik.
- **`spanAssign`:** üçünün ortak yardımcısı. Birleşik hücredeki değer, kapsadığı satırların (ya da sütunların) ortasına yazılır; satırlar bu kurala göre değerlere bölünür, boş hücre atlanabilir.
- **Para birimi ayrı sütunda** (€) olan listeler doğru para birimiyle okunur; her satırda başlığını tekrar eden sütun (ADET) özellik sayılmaz.
- Testler: `tests/ornek/` altında dört yeni örnek (ters-tablo, izgara-fiyat, ozellik-karti, para-birimi-sutunu), `tests/e2e.js` 9. adım.

Ölçülen: Rushwarm 12 seri / 112 model; Asmarine 11 kart; Eser Pompa 3 ürün / 46 teklif. Boss, Asel, Elif Depo, GS Marine Valve çıktısı 0.6.0 ile birebir aynı.

Sıradaki iş: telefon sonucu, sonra OCR.

## Sürüm 0.8.0 ekleri (mağaza görünümü, kendini güncelleme, internetten ürün, uyarılar)

- **Görünüm:** arama kutusu (`#q`) artık üst çubukta, her ekranda. `viewSearch` ana sayfası: gruplar resimli kutular (`.tiles`), "Son eklenenler" şeridi (`.strip`, `miniCard`), ürünler kart ızgarası (`.grid`). Ürün sayfası: resim + bilgi (`.dgrid`, tablette yan yana), tam genişlik "Sepete ekle", "Teknik özellikler" listesi, benzer ürünler şeridi; yönetim kutuları (kontrol, teklifler, kategori, not) altta. Belgeler kapak resimli kartlar (`.docgrid`; kapak `cover:<docId>` anahtarında, ilk gösterimde belgenin ilk resminden üretilir); "Ürünler" düğmesi o belgenin ürünlerini açar.
- **Güncelleme:** `checkUpdate` / `KlavuzUpdate` / `installUpdate` / `KlavuzUpdateProgress` (app.js); Android köprüsü `checkUpdate`, `installUpdate` (yalnız `github.com/haruncelik0052/KLAVUZ/releases/download/` adresi, paket adı denetimi, FileProvider `com.hcmarinworks.klavuz.files`, `REQUEST_INSTALL_PACKAGES`). Açılışta en çok 12 saatte bir, internet varsa sessizce denetlenir. İnternet yoksa hiçbir şey olmaz.
- **İnternetten ürün:** Android `fetchText` sayfayı görünmeyen bir WebView'da açar (`probePage`), yüklenince HTML'i `KlavuzPage(html, sonAdres)` işlevine verir; olmazsa düz indirir. `extractProduct`: önce JSON-LD (Product), sonra Amazon alanları (`#productTitle`, `.a-offscreen`, `#landingImage`, `#bylineInfo`), sonra og / itemprop etiketleri; robot denetimi sayfası tanınır. Paylaşım yazısının baş sözleri (`shareName`) atılır; kısa bağlantı yerine asıl adres saklanır. Bağlantılar `openLink` köprüsüyle açılır (WebView içindeki `<a target=_blank>` telefonda açılmıyordu).
- **Uyarılar:** fiyatı değişen teklifte son `db.history` kaydından eski → yeni fiyat ve yüzde; "Hepsini gördüm". `autoCheck`: fiyatlı listede fiyatı boş satır ve kodlu tabloda kodu boş satır artık okuma hatası sayılmaz.
- Testler: `tests/e2e.js` 10–12. adımlar (internetten ürün, fiyat karşılaştırma, güncelleme).

Telefonda doğrulanmadı: görünmeyen WebView ile Amazon sayfası okuma, APK indirme ve kurulum ekranı. Bunlar bu ortamda denenemez.

## Sürüm 0.9.0 ekleri (uygulama içi tarayıcı, sayfadan ürün alma, ZIP)

- **Uygulama içi tarayıcı (Android):** `openBrowser(adres)` ana WebView'ın üstünde ikinci bir WebView açar (`buildBrowser`, `showBrowser`): üstte "Kapat", "←", site adı, "Klavuz'a al". "Klavuz'a al" (`grabShop`) açık sayfanın HTML'ini ve adresini `KlavuzGrab(html, adres)` işlevine verir. Geri tuşu önce tarayıcıda geri gider. Boş adresle çağrı tarayıcıyı kaldığı sayfayla yeniden gösterir.
- **`KlavuzGrab`:** ürün sayfasıysa (`extractProduct().strong`: JSON-LD Product, Amazon `#productTitle` ya da `og:type=product`) tek ürün formu; değilse `extractList` ile liste: JSON-LD ItemList → Amazon arama kutuları (`[data-component-type="s-search-result"]`) → genel kalıp (ürün adresine benzeyen bağlantı + resim + yakınında fiyat). Liste `st.grab` içinde seçmeli gösterilir (`grabHtml`), `saveGrab` kaydeder: aynı bağlantı daha önce alınmışsa yeni ürün açmaz, fiyatı günceller (fiyat geçmişi ve uyarı oluşur). Resimler `imgQueue` ile tek tek indirilir (`fetchImageFor` / `KlavuzImageFor`).
- **Girişler:** Belge sekmesinde "İnternetten ürün al" kutusu (Amazon, Hepsiburada, Trendyol, n11, Google, serbest adres); arama ekranında "Bunu internette bul" (yazılan söz sitede aranır); paylaşımla gelen üründe bilgi alınamazsa "Sayfayı uygulama içinde aç, oradan al".
- **ZIP:** `unzipFiles` zip'i kütüphanesiz okur (merkezi dizin + `DecompressionStream('deflate-raw')`); içindeki PDF / Excel / CSV / TXT ve bir kademe iç içe zip sıraya alınır. Şifreli ve 4 GB üstü (zip64) dosyalar desteklenmez.
- **CSV düzeltmesi:** CSV artık UTF-8 (olmazsa Windows-1254) olarak çözülüp okunuyor; önceden Türkçe harfler bozuluyordu.
- Testler: `tests/e2e.js` 13 (ZIP) ve 14 (tarayıcıdan alma).

Toplu tarama yok: uygulama yalnız kullanıcının ekranında açık olan sayfayı, kullanıcı düğmeye basınca okur; sayfaları kendiliğinden gezmez.

## Sürüm 0.10.0 ekleri (OCR: taranmış ve yazısı çizgiye çevrilmiş kataloglar)

- **Motor:** Tesseract.js 7.0.0 (Apache 2.0), tamamen uygulamanın içinde: `vendor/tesseract.min.js`, `vendor/worker.min.js`, `vendor/tesseract-core-simd-lstm.wasm.js` (SIMD yoksa `tesseract-core-lstm.wasm.js`), `vendor/tur.traineddata.gz`, `vendor/eng.traineddata.gz` (4.0.0_best_int, LSTM). Toplam yaklaşık 13 MB; APK büyüdü. İnternetten hiçbir şey indirilmez (e2e testi dış adresleri engelleyerek çalışır).
- **`worker.min.js` yaması:** tesseract.js 7.0.0'da dil verisi `{ code, data }` olarak verilince `initialize` dil adı yerine veriyi kullanıyordu; `t.data` → `t.code` (bkz. `vendor/TESSERACT-LICENSE.txt` sonu). Kütüphane güncellenirse bu yama yeniden yapılmalı ya da hatanın düzelip düzelmediği denetlenmeli.
- **Yükleme (`ocr.js`):** Tesseract betiği ilk gerektiğinde yüklenir. Dil dosyaları `XMLHttpRequest` ile okunur (`file://` altında `fetch` çalışmaz), worker `workerBlobURL: false` ile doğrudan dosyadan açılır, `cacheMethod: 'none'`. Açılış 90 sn, sayfa okuması 180 sn zaman sınırlı; aşılırsa OCR o belge için kapanır, raporda "OCR çalışmadı: <neden>" yazar, okuma kalan sayfalarla sürer. Belge bitince worker kapatılır (bellek).
- **Ne zaman:** `KlavuzOcr.need(yazıSayısı, eğriSayısı)`: sayfada 5'ten az yazı varsa (taranmış) ya da yazılar çizgiye çevrilmişse (eğri > 3000 ve eğri > 50 × yazı; Flowmaster ve Vamates böyle: tablo yazıları seçilemeyen çizim). Normal kataloglarda yalnız boş / kapak sayfaları OCR'lanır (Boss 7, Asel 5, GS 5 sayfa; çıktı değişmez).
- **Nasıl:** sayfa ölçek 3 (216 dpi) çizilir; `prep` resmi temizler: renkli zemin beyaz, renkli zemindeki beyaz yazı siyah, beyaz zemindeki renkli yazı siyah, açık gri satır zemini beyaz; uzun yatay / dikey tablo çizgileri silinir (çizgiler OCR'ın gri satırlardaki hücreleri kaçırmasına yol açıyordu). PSM 11 (dağınık yazı) en iyi sonucu verdi (Flowmaster 6–21: 311 / 336 kod; PSM 6: 267, PSM 3: 286). Sözcükler yazı çizgisinden (baseline) konumlanır, aynı satırdakiler aynı yüksekliğe hizalanır (`snap`), yakın sözcükler tek yazı parçası olur, sonra **aynı `Okuyucu.parsePage`** çalışır. Sayılardaki harf karışmaları (`fixNum`: ISA→15A, SOA→50A, DN5O→DN50) yalnız sayı gibi duran sözcüklerde düzeltilir. Gerçek PDF yazısıyla çakışan OCR sözcüğü atılır.
- **Doğruluk:** OCR'lı sayfadan gelen her satır `OCR ile okundu, kontrol edin` uyarısıyla gelir; `autoCheck` bunları kendiliğinden kapatmaz.
- **Rapor / şerit:** durum şeridinde "Sayfa 3 / 40 (OCR ile okunuyor)"; okuma raporunda "OCR ile okunan sayfa: N (Tesseract SIMD)"; belge kartı notu.
- **Okuyucu:** fiyatsız tabloda iki kod sütunu (CODE STOP / CODE SDNR) artık iki ayrı seçenek (`variant`); önceden ikinci kod kayboluyordu.
- Testler: `tests/ornek/ocr-cizgi-yazi.json` (Flowmaster sayfa 6'nın gerçek + OCR yazı konumları; fiyat yok), `tests/e2e.js` 15. adım (tablo resme çevrilip yalnız resim içeren PDF yapılır, OCR ile okunur).
- Test kancası: `window.KLAVUZ_TEST.api = { readPdf, newStat }`; `KLAVUZ_TEST.ocrPsm`, `ocrConf`, `ocrDump` (temizlenmiş sayfa resmi) yalnız denemelerde.
- **0.10.1:** Android paketleyicisi (aapt) `vendor/*.gz` dosyalarını açıp uzantısını siler (APK'da `tur.traineddata`). `ocr.js` önce `.gz`, olmazsa uzantısız dosyayı okur. APK'nın `assets/` klasörü `file://` adresiyle ve `--allow-file-access-from-files` ile Chromium'da açılarak OCR denendi, çalıştı. 0.10.0 derlemesi telefonda OCR yapamazdı; kullanıcıya verilmedi.

## Sürüm 0.11.0 ekleri (iki kademeli kategori ağacı)

- **Ağaç (`TREE`, app.js):** 23 ana grup (eski 22 kimlik aynen + yeni `hidrolik` "Hidrolik ve pnömatik"), her birinde 3–14 alt grup (toplam ~125). Alt grup kimliği `ana.alt` (örn. `vana.kuresel`, `rakor.hortum`, `pompa.sintine`). `item.category` / `item.cat2` ana ya da alt grup kimliği tutar; ana grup `mainOf(id)` ile türetilir. Eski kayıtlar ana grup olarak geçerli, **veri taşıma yok**. Ağaç tekne teknik malzemesine göre kuruldu (Flowmaster, Boss, Asel, GS ürün adları incelenerek: glob / köşe, fırtına, hızlı kapama, SDNR, hortum soketi, SAE flanş vb.); mağaza ağacı kopyalanmadı.
- **Ayırma (`classify(ad, altBaşlık, kırıntı)`):** önce ana grup (ana grubun sözcükleri + alt grupların 4 harf ve üstü / söz öbeği sözcükleri), sonra o ana grubun içinde en çok puan alan alt grup; hiçbiri tutmazsa ana grup ("Diğer ..."). `=` ile başlayan sözcük yalnız alt grubu seçer (örn. `=sintine`: "sintine depo rekoru" pompa sayılmasın). Eşit puanda listede önce gelen alt grup kazanır; genel alt grup ("Rakor ve rekor") bu yüzden sonda. İkinci kategori de alt gruba kadar iner.
- **Ölçülen (476 gerçek ürün adı):** 91 ürünün ana grubu değişti, hepsi bakıldı: SDNR vanaları cıvatadan vanaya, hortum kelepçeleri hortumdan kelepçeye, hortum rakor / soketleri hortum ve cıvatadan rakora, hava başlıkları / pislik kutusu / kondenstop flanştan doğru gruba; 12 kategorisiz ürün gruba girdi (kruva, kollektör, miçoz, yüksük, hava firarı, pislik tutucu, O-ring). Kategorisiz 53 → 41.
- **Açılışta:** `db.treeVer !== TREE_VER` ise elle atanmamış bütün ürünler yeniden ayrılır (`reCat`); elle atananlara (`catBy: 'user'`) dokunulmaz.
- **Görünüm:** Ara > Kategori ana grupları kutu olarak gösterir; ana gruba girince "alt gruplar" kutuları (`#gcard`, `st.sub`), dokununca süzer. Ürün sayfasında kategori yolu (`.crumbs`, `gocat`). Kategori seçme kutusu ana grup başlıklı (`catOptions`).
- **Kullanıcı düzeltmesi:** Ayarlar > Kategori ağacı: ana / alt grup adı değiştir (`db.catEdit.names`), alt grup ekle / sil (`db.catEdit.subs`, kimlik `ana.uXXXXXX`). Eklenen alt grubun tam adı ana grubu bulmaya katılır, tek sözcükleri yalnız alt grubu seçer; ekleyince elle atanmamış ürünler yeniden ayrılır. Silinen alt gruptaki ürün ve öğrenilmiş atamalar ana gruba geçer.
- **İnternetten alınan üründe kırıntı yolu:** `crumbOf` (JSON-LD BreadcrumbList, Amazon `#wayfinding-breadcrumbs_feature_div`, genel breadcrumb) → `item.crumb`; ayırmada alt başlık ağırlığında ipucu. Liste sayfasında sayfanın yolu bütün ürünlere uygulanır.
- Testler: `tests/e2e.js` 16. adım (kırıntıdan alt grup, ürün sayfası yolu, alt grup kutuları ve süzme, alt grup ekle / ad değiştir / sil).
- Deneme kancası: `KLAVUZ_TEST.api.classify(ad, alt, kırıntı)` → `[kategori, ikinci]`.

## Sürüm 0.11.1 (büyük katalogda donma düzeltmesi)

- Kullanıcı 93 MB "2026 SEAFLO Marine Equipment Catalog" yükleyince uygulama dondu. Neden: Seaflo'nun bütün yazıları çizime çevrilmiş, sayfalar çift sayfa (1207 × 825 pt). OCR her sayfayı ölçek 3'te ~9 milyon piksele çiziyor, `prep` bunu ana iş parçacığında tek seferde işliyordu (masaüstünde 0,4 sn kilit, telefonda birkaç saniye) ve sayfa başına ~150 MB bellek kullanıyordu.
- Düzeltme: `MAX_PX = 4.6e6` (A4 ölçek 3'e sığar, çift sayfada ölçek ~2,15'e düşer; `user_defined_dpi` sayfaya göre). `prep` artık `async`; her ~25 ms'de ana iş parçacığını bırakır (en uzun kilit 418 → 45 ms). Flowmaster sonucu değişmedi.
- Durum şeridinde kalan süre: "Sayfa 12 / 208 (OCR ile okunuyor) · yaklaşık 1 sa 40 dk kaldı" (bu oturumda okunan sayfaların ortalamasından).
- Seaflo içeriği: her ürünün altında tek satırlık, çok küçük yazılı, fiyatsız model tablosu (SFH03-08-01 vb.); OCR'dan az ve kusurlu satır çıkıyor (parça 12: 7 sayfa, 8 satır). Bu katalog için asıl kaynak Drive'daki `seaflo-com-2026-10-28.xlsx` / `.csv` ürün listesidir. Drive'da 10 MB altına bölünmüş parçalar var (`SEAFLO_2026_SEAFLO_Marine_Equipment_Catalog_NN.pdf`).

## Sürüm 0.11.2 (Drive'dan seçilen büyük dosya)

- Kullanıcı 0.11.1'de Seaflo (93 MB, Drive'dan seçildi) için "Okunamadı: A requested file or directory could not be found..." aldı (DOMException NotFoundError). Neden: 8 MB üstü PDF parça parça okunur (`PDFDataRangeTransport` + `file.slice`); Drive'ın `content://` adresi okuma sürerken erişimi kesebiliyor.
- Düzeltme (MainActivity `deliverFiles`): seçilen her dosya arka planda `cacheDir/secilen/<zaman>/<i>/<asıl ad>` altına kopyalanır, WebView'e `file://` adresi verilir; kopyalanamazsa asıl adres. Kopyalama başlarken "Dosya hazırlanıyor..." (`window.KlavuzToast`). 2 günden eski kopyalar açılışta silinir (`cleanPicked`). Bu hata yine çıkarsa iş kartında sade açıklama yazar.
- Bu ortamda Android derlenip denenemez; telefonda doğrulanmalı.

## Sürüm 0.12.0 (Seaflo gibi yazısı çizime çevrilmiş, çift sayfa ürün kataloğu)

- Kullanıcı Seaflo'nun kendi sitesinden indirdiği 93 MB kataloğu yükledi; ürün çıkmadı, belge yalnız sayfa görüntüsü olarak saklandı. Burada aynı sayfalar (Drive'daki `SEAFLO_2026_..._02.pdf`, 8 sayfa) OCR ile okununca 65 satır çıkıyordu; telefonda OCR büyük olasılıkla hiç çalışmadı (neden metni görünmüyordu). Telefondan "OCR motorunu dene" sonucu beklenir.
- **Teşhis:** Ayarlar > Uygulama bilgileri > "OCR motorunu dene" (`KlavuzOcr.selfTest`: bilinen yazılı küçük resim okunur, açılış / okuma süresi ve motor yazılır). Ürün çıkmayan belgenin nedenine OCR hatası ya da "N sayfa OCR ile okundu ama tablo çıkmadı" eklenir. Motor açılış süresi sınırı 90 → 180 sn.
- **Çift sayfa (`parseSpread`, app.js):** OCR'lı yatay sayfa (genişlik > 1,25 × yükseklik) ortadaki boşluktan ikiye bölünüp her yarı ayrı okunur (ortayı kesen yazı %3'ten azsa). Önceden sol ve sağ sayfanın aynı hizadaki tabloları birleşiyordu. Yazılı kataloglara uygulanmaz.
- **Ürün adı (okuyucu, yalnız OCR'lı sayfada `OCRP`):** tablonun hemen üstündeki yazı genel bir ara yazıysa (`RE_GENERIC`: Standard Pump Configurations, Blister, Color Box, Technical...) ya da ad gibi değilse (`looksName`), aynı sütunda yukarıdaki, önceki ürünün tablosuna kadar olan bölgede en üstteki büyük yazılı (veri satırının ≥ 1,3 katı) satır ad olur. Sayı içeren başlık ("... 01 Series (350 500 GPH)") veri satırı gibi görünse de aday sayılır; böyle bir satır önceki tabloya satır olarak eklenmez.
- **Ölçülen (Seaflo parça 02, 8 sayfa):** önce 65 satır / 48 kod / adların çoğu "Standard Pump Configurations", "Blister", "Ei mpm"; şimdi 90 satır / 73 kod (SFBP1-G350-01 ...), debi ölçü olarak, volt / akım / basma yüksekliği / çıkış çapı / ağırlık teknik özellik olarak; adlar çoğunlukla doğru ("Dual Port Livewell Pump", "Non-automatic Bilge Pumps 01 Series (1500 2000 GPH)", "Mechanical Auto Bilge Pumps"). Kalan zayıf yerler: sayfa 1–2'deki iç içe düzen, aksesuar tabloları (13F001 gibi kodlar kod sütunu sayılmıyor). Boss, Asel, Elif, GS değişmedi.
- Testler: `tests/ornek/ocr-urun-blogu.json` (Seaflo sağ yarı sayfa OCR çıktısı).

## Sürüm 0.12.1 (OCR telefonda çalışsın)

- Telefondan gelen Boss okuma raporu (0.11.2): "Motor: ana" ve "OCR çalışmadı: undefined". İkisi aynı nedene işaret ediyor: Android WebView, uygulamanın içindeki `file://` dosyadan iş parçacığı (Worker) başlatmıyor; pdf.js bu yüzden ana iş parçacığında çalışıyor (sessizce), Tesseract ise hiç açılamıyordu (Worker hatası boş geldiği için "undefined").
- Düzeltme (`ocr.js` `startWith`): `file:` altında Tesseract'ın worker ve motor dosyaları XMLHttpRequest ile okunup `blob:` adresinden başlatılır (motor adresine `#.js` eklenir, tesseract.js adresin ".js" ile bitmesini bekliyor). Olmazsa doğrudan dosyadan denenir; ikisi de olmazsa hata metni iki yolun hatasını yazar. Motor adı "Tesseract SIMD · bellekten / dosyadan".
- pdf.js için aynı yol denenmedi (çalışmayan worker okumayı kilitleyebilir); şimdilik ana iş parçacığında kalıyor.
- Telefonda doğrulanmalı: Ayarlar > Uygulama bilgileri > "OCR motorunu dene".
