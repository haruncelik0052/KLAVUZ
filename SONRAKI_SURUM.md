# Klavuz — sonraki sürüm için devir ve istek listesi

## GÜNCEL DEVİR (0.12.2, 14.11.2026) — önce burayı okuyun

- **0.12.2 (dal `ccr-89c21dfb-884wcz`):** "4. Drive'daki öbür kataloglar" işine başlandı; Alarko türü bayi fiyat listesi düzeltildi (ayrıntı DEVIR.md sonunda). Sıradaki aday: LMC kelepçe kataloğu (birleşik hücreli ölçü bloğu, ürün başına ayrı kod sütunu). Telefon sonuçları hâlâ bekleniyor (OCR motoru, Seaflo, kategori ağacı, 0.9.0).

## Önceki devir (0.12.1)

- **Dal:** `claude/klavuz-app-handover-mtewnk` (son sürüm 0.12.1, commit `fc22fbc`; `ccr-1df92bb6-t62pv1` üzerine kuruldu). Yeni oturum kendi dalını bundan başlatsın ve `.github/workflows/build-apk.yml` içindeki dal listesine eklesin. `main` dalına dokunulmaz.
- **Çalışma kuralı:** Kullanıcı seçim yapmak istemiyor. Bütün teknik ve tasarım kararlarını Claude verir, sormadan uygular; kullanıcı yalnız telefonda dener. Yanıtlar kısa, sade Türkçe. Uygulamadaki her iş internetsiz çalışmalı (internet isteyen her şey ektir).
- **APK teslimi:** Her sürümde APK sohbetin içinde dosya olarak verilir: push sonrası derleme bitince (yaklaşık 1,5–2 dk)
  `curl -sSL -o apk/Klavuz-<sürüm>.apk https://github.com/haruncelik0052/KLAVUZ/releases/download/test-<commit7>/Klavuz-<commit7>.apk`
  ile indirilir (200 dönene kadar 10 sn arayla) ve SendUserFile ile verilir. `apk/` depoya girmez (.gitignore). Derleme 200 döndüyse Java da derlenmiştir.
- **Sürüm:** her işlevsel değişiklikte `APP_VERSION` (app.js), `versionName` + `versionCode` (android/app/build.gradle), `sw.js` CACHE birlikte artar. Şu an 0.12.1 / versionCode 16 / klavuz-v16. Sürüm testi listesi `VTEST` (app.js) her sürümde güncellenir.
- **Test:** `node tests/okuyucu.test.js`; `python3 -m http.server 8080` (KLAVUZ klasöründe) sonra `node tests/e2e.js` (16 adım; 15 OCR, 16 kategori ağacı). İkisi de geçmeden gönderme. Playwright: `NODE_PATH=$(npm root -g)`.
- **Gerçek kataloglarla deneme:** Drive `download_file_content` 10 MB altı PDF'i indirir. Uygulamanın kendi okuması Playwright'ta: sayfa `window.KLAVUZ_TEST = {...}` ile açılınca `KLAVUZ_TEST.api = { readPdf, newStat, classify, catName }`; `KLAVUZ_TEST.chunk = 1` her sayfadan sonra satır verir; `ocrPsm`, `ocrConf`, `ocrMode` ('blob' / 'dosya'), `ocrDump` denemeler için. Her okuyucu değişikliğinden önce / sonra Boss, Asel, Elif Depo, GS Marine Valve çıktısı karşılaştırılır (OCR / okuyucu değişikliğinden sonra hepsi aynı kaldı; GS'de çift kod sütunu yüzünden +43 satır). Gerçek PDF depoya konmaz.
- **Bu oturumda yapılanlar (ayrıntı DEVIR.md sonunda):** 0.10.0–0.10.1 telefonda internetsiz OCR (Tesseract.js); 0.11.0 iki kademeli kategori ağacı (23 ana grup, ~125 alt grup, Ayarlar'da düzenleme, sitenin kırıntı yolu ipucu); 0.11.1 büyük katalogda OCR donması (piksel sınırı, parça parça temizleme, kalan süre); 0.11.2 seçilen dosya önce uygulamanın alanına kopyalanır (Drive'daki 93 MB dosyada "could not be found" hatası); 0.12.0 çift sayfa ve ürün bloğu düzeni (Seaflo), "OCR motorunu dene" düğmesi; 0.12.1 OCR motoru blob: adresinden başlatılır.
- **EN ÖNEMLİ AÇIK KONU — OCR telefonda çalışıyor mu?** Telefondan gelen Boss okuma raporu (0.11.2): "Motor: ana" ve "OCR çalışmadı: undefined". Neden: Android WebView `file://` dosyadan Worker açmıyor. 0.12.1 Tesseract'ı XMLHttpRequest + `blob:` ile başlatıyor (Chromium'da `file://` taklidinde çalıştı; telefonda doğrulanmadı). Kullanıcıdan beklenen: Ayarlar > Uygulama bilgileri > "OCR motorunu dene" sonucu. Çalışmazsa sıradaki seçenek: Android'de `WebViewAssetLoader` ile `https://appassets.androidplatform.net/` altından sunmak — **ama IndexedDB kökeni değişir, kullanıcı verisi kaybolmaz şekilde taşıma (eski kökten yedek → yeni köke yükleme) yapılmadan uygulanmaz.** pdf.js de aynı nedenle ana iş parçacığında çalışıyor; OCR blob yolu telefonda çalışırsa pdf.js için de `GlobalWorkerOptions.workerPort = new Worker(blob)` denenebilir (çalışmayan worker okumayı kilitlememeli, önce sınama).
- **Seaflo:** Kullanıcı 93 MB "2026 SEAFLO Marine Equipment Catalog" (yazılar çizime çevrilmiş, çift sayfa, ürün bloğu: büyük başlık, madde işaretli açıklama, resim, "Standard Pump Configurations" ara yazısı, model tablosu, fiyat yok) yükledi; ürün çıkmadı (OCR telefonda çalışmadı). Burada parça 02 (8 sayfa): 90 satır / 73 kod, adlar çoğunlukla doğru. Drive'da 10 MB altı parçalar: `SEAFLO_2026_SEAFLO_Marine_Equipment_Catalog_01 … 12.pdf`; ürün listesi `seaflo-com-2026-10-28.xlsx` / `.csv`. Zayıf kalanlar: sayfa 1–2'deki iç içe düzen, aksesuar tabloları (13F001 gibi kodlar kod sütunu sayılmıyor), bazı adlar ("Fal After", "Blister" sayfa 8).
- **Telefonda bekleyenler:** 0.12.1 "OCR motorunu dene" ve Seaflo sonucu; 0.11.2 Drive'dan büyük dosya kopyalama; 0.11.0 kategori ağacı; 0.9.0'ın tamamı (kendini güncelleme, uygulama içi tarayıcı, ZIP, CSV). Sürüm testi listesi bunları içeriyor.
- **Görünüm kararı:** Alışveriş uygulaması düzeni; Amazon'un adı, logosu, birebir görünümü ve kategori ağacı kopyalanmaz.
- **Sınır:** 10 MB üstü Drive dosyaları ve yedek dosyası bu ortama indirilemiyor. Android burada derlenemez; hata GitHub Actions çıktısından okunur.
- Ayrıntılı teknik geçmiş `DEVIR.md` içindedir.

## YAPILACAK İŞLER (0.12.1 sonrası, sırasıyla)

Her iş ayrı sürüm numarasıyla çıkar. Kullanıcıya seçim sorulmaz.

### 1. Telefon sonuçları (önce bu)
- **OCR motoru:** "OCR motorunu dene" sonucu. "çalışıyor ✓ · bellekten" ise Seaflo parça 02 ile ürün kartı sonucu, süre ve bellek. Çalışmıyorsa yukarıdaki "EN ÖNEMLİ AÇIK KONU".
- **Seaflo tam katalog:** kaç ürün, süre, kalan süre gösterimi doğru mu, uygulama dondu mu.
- **Kategori ağacı:** yanlış gruba düşen ürün örnekleri (kullanıcı "ad → olması gereken" yazacak); `TREE` sözcükleri buna göre ayarlanır, `KLAVUZ_TEST.api.classify` ile 476 gerçek ad üzerinde önce / sonra karşılaştırılır.
- **0.9.0'dan bekleyenler:** kendini güncelleme (`checkUpdate`, `installUpdate`, `downloadTo`), uygulama içi tarayıcıdan alma (Amazon / Hepsiburada), ZIP, CSV.

### 2. OCR — YAPILDI (0.10.0–0.12.1). Aşağısı ilk plan; uygulanan hali DEVIR.md "Sürüm 0.10.0" ve sonrası. Açık kalanlar: telefonda çalışması (yukarıda), Seaflo türü katalogda ad / aksesuar tablosu iyileştirmeleri.
Karar verildi (kullanıcıya sorulmaz): **telefonda, internetsiz, Tesseract.js (Apache 2.0)**. Yavaş olabilir; arka planda, parça parça.
- **Örnek belgeler (Drive):** Vamates (tamamı taranmış PDF), Flowmaster (tabloları resim). Drive'da adla aranıp `download_file_content` ile indirilir (10 MB altıysa). Önce burada node ile denenir.
- **Ne zaman devreye girer:** sayfada yazı yok ya da çok az (`items.length < 5`; şu an `stat.emptyPages` sayılıyor) ve sayfada büyük resim varsa. Yazısı olan sayfaya OCR yapılmaz. Belge raporunda "OCR ile okunan sayfa: N" yazsın.
- **Nasıl:** sayfa `page.render` ile tuvale çizilir (ölçek 2–3, yaklaşık 200–300 dpi), Tesseract `tur+eng` ile okunur. Tesseract sözcükleri kutularıyla verir (`words[].bbox`); bunlar okuyucunun beklediği biçime çevrilir: `{str, x, y, w, h}` (PDF koordinatı: y yukarı doğru artar, yani `y = sayfaYüksekliği - bbox.y1 / ölçek`). Sonra **aynı `Okuyucu.parsePage` çalışır**; ayrı bir tablo mantığı yazılmaz.
- **Dosyalar (hepsi uygulamanın içine konur, internetten indirilmez):** `vendor/tesseract.min.js`, `vendor/worker.min.js`, `vendor/tesseract-core*.wasm.js` (SIMD'li ve SIMD'siz), `vendor/tur.traineddata.gz`, `vendor/eng.traineddata.gz` ("fast" modelleri: toplam yaklaşık 5–8 MB; "best" modelleri çok büyük, kullanılmaz). `createWorker` çağrısında `workerPath`, `corePath`, `langPath` yerel yollar verilir, `gzip: true`. `.github/workflows/build-apk.yml` zaten `vendor/` klasörünü kopyalıyor. APK yaklaşık 4 MB'tan 12–15 MB'a çıkar; kullanıcıya söylenir.
- **Dikkat:** (a) WebView `file://` altında Worker ve wasm yüklemesi: pdf.js worker'ı çalışıyor (`setAllowFileAccessFromFileURLs(true)`), Tesseract'ın `fetch` ile wasm / traineddata okuması `file://` altında takılabilir; takılırsa dosyalar `XMLHttpRequest` / `blob:` adresiyle verilir ya da Android'de `WebViewAssetLoader` ile `https://appassets.androidplatform.net/` altından sunulur (bu durumda IndexedDB kökeni değişir; **veri kaybı olmaması için köken değiştirilmeden çözülmeli**, önce blob yolu denenir). (b) Bellek: sayfa sayfa işlenir, tuval ve sonuç her sayfadan sonra bırakılır; tek worker. (c) Hız: sayfa başına 5–20 sn beklenir; ilerleme durum şeridinde "OCR sayfa 3 / 40" diye görünür; yarım kalırsa mevcut "kaldığı yerden devam" düzeni kullanılır (`CHUNK`, `o.chunk`). (d) Doğruluk: OCR'dan gelen her satır `warn: 'OCR ile okundu, kontrol edin'` ile işaretlenir ve `autoCheck` bunu kendiliğinden kapatmaz; fiyat ve kodda O/0, I/1, virgül / nokta karışabilir. (e) Tablonun yalnız bir bölümü resimse (Flowmaster): sayfadaki büyük resim kutuları ayrı ayrı OCR'lanıp sözcükler sayfa koordinatına taşınır, sayfanın gerçek yazılarıyla birleştirilir.
- **Test:** `tests/ornek/` altına OCR çıktısından üretilmiş bir sayfa konumu örneği (fiyatlar değiştirilerek); `tests/e2e.js` içinde tarayıcıda yazısı resim olan küçük bir PDF üretilip OCR ile okunduğu denenir (Playwright Chromium'da Tesseract.js çalışır).
- Sürüm testi maddeleri: taranmış katalog okundu mu, süre, yanlış okunan fiyat / kod örnekleri.

### 3. İki kademeli kategori ağacı — YAPILDI (0.11.0) (kullanıcı isteği: "Amazon'un kategori sistemi gibi")
- Şu an tek kademe: `CATS` (22 grup, anahtar sözcüklerle), `classify`, `autoCat`, `item.category`, `item.cat2`, öğrenme `db.learn`.
- Yapılacak: ana grup > alt grup (örn. Vana > Küresel vana / Çek valf / Kelebek vana; Pompa > Sintine / Tatlı su / Santrifüj; Rakor ve bağlantı > Nipel / Dirsek / Manşon). Ana sayfada ana gruplar kutu olarak, içine girince alt gruplar. `item.category` alt grubun kimliğini tutar, ana grup ondan türetilir; eski 22 kimlik ana grup olarak geçerli kalır (**veri taşıma gerekmeden**).
- İnternetten alınan üründe sitenin kırıntı yolu (JSON-LD `BreadcrumbList`, Amazon `#wayfinding-breadcrumbs_feature_div`) kategori ipucu olarak kullanılır.
- Amazon'un ağacı birebir kopyalanmaz; tekne teknik malzemesine uygun ağaç kurulur. Kullanıcı ağacı uygulamada düzeltebilmeli (ad değiştir, alt grup ekle).

### 4. Drive'daki öbür kataloglar (telefon sonuçlarından sonra SIRADAKİ İŞ)
`05_MARKA_PROFILLERI` altında yaklaşık 50 marka klasörü var. Katalogları tek tek indirip (10 MB altı) okuyucudan geçir, okunamayan düzenleri çıkar, en çok ürün kazandıranı önce düzelt. Her değişiklikte Boss, Asel, Elif Depo, GS Marine Valve, Rushwarm, Asmarine, Eser Pompa, Flowmaster ve Seaflo parça 02 çıktısı öncekiyle karşılaştırılır.

### 4b. Klavuz'dan PDF katalog / fiyat listesi üretme (kullanıcının getirdiği Gemini önerisinden alınan fikir)
- Seçilen ürünlerden (marka, kategori, sepet ya da arama sonucu) HC MARIN WORKS başlıklı, resimli PDF katalog veya fiyat listesi. Müşteri çıktısında yalnız satış fiyatı (alış ve kâr görünmez). Telefonda, internetsiz: HTML sayfa düzeni + Android yazdırma (`WebView.createPrintDocumentAdapter`, "PDF olarak kaydet"); web'de `window.print()`.
- Logo yalnız kullanıcının verdiği firma logosu (Ada profilindeki JPEG); yeni logo çizilmez.
- Gemini'nin önerdiği bilgisayarda Python + Claude API ile okuma **uygulamaya alınmadı**: internet ve ücretli API anahtarı ister, temel ilkeye (her iş internetsiz) aykırı. İleride yalnız isteğe bağlı ek olabilir: OCR'ın da okuyamadığı tek bir sayfayı, kullanıcı düğmeye basınca yapay zekâya gönderip sonucu yine "kontrol edin" uyarısıyla almak.

### 5. Daha sonra
- TeklifX içe aktarma biçimi öğrenilince teklif dosyasını (`cartCsv`) ona uydurma.
- Tablette iki bölmeli düzen (solda liste, sağda ürün).
- Ürün karşılaştırma ekranı (iki üç ürün yan yana).
- İsteğe bağlı Google Drive bağlantısı ve Drive'a yedek (Google tarafında kurulum ister; kullanıcı isterse, adım adım).
- Yayın sayısı 100'e yaklaşınca eski test yayınlarını silme (güncelleme denetimi ilk 100 yayına bakıyor).
- Arama hızı: ürün sayısı on binleri geçerse MiniSearch (MIT) ile dizin.

### Yapılmayacak (karar)
- Bir sitenin kategorisini sayfa sayfa kendiliğinden gezip toplu indiren tarama. Uygulama yalnız ekranda açık olan sayfayı, kullanıcı düğmeye basınca okur.
- Amazon'un adını, logosunu, birebir görünümünü ya da kategori ağacını kopyalama.
- İnternet olmadan çalışmayan zorunlu özellik. İnternet isteyen her iş (tarayıcı, güncelleme, paylaşım) ektir.

> **Güncel durum (0.4.0):** İnceleme yapıldı, plan kullanıcıca onaylandı. 0.4.0 ile şu istekler karşılandı: 1 (çoklu belge), 2 (arka planda okuma), 3 (kendiliğinden parçalama), 4 (hız, kısmen), IndexedDB'ye taşıma, geri tuşu, 5'in ilk adımı (dosya seçicide Drive). Ayrıntı `DEVIR.md` sonunda.
> **Onaylanan sıra:** 0.5.0 marka / satıcı / kategori (Drive'daki `05_MARKA_PROFILLERI` altında 50 marka klasörü var; marka listesi bu adlarla başlatılabilir) → 0.6.0 okunamayan düzenler (ters tablo, kodsuz özellik kartı, çift fiyat sütunlu kodsuz liste örn. Eser Pompa, OCR) → 0.7.0 görünüm, karşılaştırma, tarifle arama, isteğe bağlı Drive bağlantısı.
> **0.5.0 ile karşılanan istekler:** 7, 9, 10, 11 (marka / satıcı kartları, karttan yükleme, tek kartta çok satıcı), 8'in elle giriş kısmı, 12–15 (kategorili arama, otomatik kategori, öğrenme, tarifle arama), 16 (simge).
> **Çalışma kuralı değişti:** kullanıcı seçim yapmak istemiyor; kararları Claude verir, kullanıcı yalnız telefonda dener. Bekleyen: 0.5.0 telefon denemesi.

Bu dosya, 0.3.0 sonrasında işi devralan oturum içindir. Teknik geçmiş `DEVIR.md` dosyasındadır; önce onu, sonra bunu okuyun.

## Devralan oturumun ilk görevi: inceleme, kod değil

Kullanıcı açıkça istedi: **devralan oturum önce inceleme yapar, bu sırada yeni kod üretmez.** Kullanıcı aynı anda telefonda kendi incelemesini yapacak. Sırayla:

1. `DEVIR.md` ve bu dosyayı oku. Depoyu ve `tests/` klasörünü incele; testleri çalıştır.
2. Uygulamadaki eksikleri ve hataları tespit et (aşağıdaki "bilinen eksikler" başlangıç noktasıdır, tam liste değildir).
3. Kullanıcının Google Drive'ındaki KATALOG klasörüne bağlan, katalogları okuyucudan geçir, hangi düzenlerin okunamadığını çıkar. Klasör bağlantısını kullanıcı sohbette verir; alt klasörler de var (`01_HC_KODLU_URUN_KATALOGLARI`, `02_URETICI_URUN_KATALOG_VE_TANITIMLARI`, `03_FIYAT_LISTELERI_VE_URUN_VERILERI`, `04_KATALOG_KAYNAK_PAKETLERI`).
4. Aşağıdaki istek listesini, kendi bulgularını ve **bizim gözden kaçırdıklarımızı** birleştirip öncelikli bir plan ve öneri listesi hazırla.
5. Planı kullanıcıya kısa ve sade sun. **Onay gelmeden kod yazma.**

## Temel ilke: her şey internetsiz çalışır

Kullanıcının açık isteği: **uygulamadaki her iş internet olmadan yapılabilmeli.** Plan buna göre kurulur:

- Belge okuma, OCR, kategori ayırma, marka ve satıcı kartları, arama, teklif, yedek: hepsi telefonda, internetsiz çalışır. Gereken her kütüphane ve veri uygulamanın içine konur.
- İnternet gerektiren işler (Drive'a bağlanma, Drive'a kayıt, markanın sitesinden bilgi ya da resim alma) **isteğe bağlı ek** olur. İnternet yokken uygulama eksiksiz çalışır; bu işler sıraya alınır ve internet gelince yapılır ya da hiç yapılmaz.
- Hiçbir özellik "internet yoksa çalışmaz" durumda bırakılmaz. İnternetsiz karşılığı olmayan bir istek varsa bu kullanıcıya açıkça söylenir.
- Kayıt ve yedek için internetsiz yol her zaman vardır: telefona dosya olarak kaydetme. Drive kaydı bunun üstüne eklenir, yerine geçmez.

Kullanıcı yazılımcı değildir; teknik seçimler ona sorulmaz. Aşağıdaki kararları Claude verir.

## Çalışma kuralları (değişmedi)

- Kullanıcı Harun Çelik (HC MARIN WORKS), yazılımcı değil. Yanıtlar kısa, sade Türkçe, adım adım.
- Teknik kararları Claude verir, sonucu sade bildirir. Yalnızca iş kararı, onay ve cihaz testi için soru sorulur.
- Her değişiklikte APK verilir; kullanıcı telefonda dener ve Ayarlar > Sürüm testi ile geri bildirir.
- Sürüm testi maddeleri markaya değil sisteme yönelik olur.
- `main` dalına dokunma. Çalışma dalı: `ccr-2f65d271-hbxt5y` (`ilk-surum` üzerine kuruldu). Yeni oturumun kendi dalı farklıysa bu dalı temel alsın ve APK iş akışına kendi dalını eklesin.
- APK indirme: `gh release download` hata verir; `gh api repos/haruncelik0052/KLAVUZ/releases/assets/<id> -H "Accept: application/octet-stream"` kullanılır.
- Test: `node tests/okuyucu.test.js`; `python3 -m http.server 8080` sonra `node tests/e2e.js`.
- Gerçek kataloglar depoya konmaz. `tests/ornek/` altında yalnızca sayfa yazı konumları durur, fiyatlar örnek değerlerle değiştirilmiştir.

## Şu anki durum (0.3.0, commit c2ac67f)

Çalışan: tablo mantıklı PDF okuyucu, resim eşleştirme, sertifika / tanıtım belgelerini sayfa görüntüsü olarak saklama, okuma raporu ve uyarı nedenleri, Ada firma profili yükleme, resimli yedek, yeni alt bar, deneyim ve öneri, sürüm testi, internetsiz çalışma.

Ölçülen: Boss 3.048 kod / 135 ürün / 6 uyarı; Asel 1.125 kod / 129 ürün / 14 uyarı; Valve Catalog 117 ürün; Elif Depo 2 ürün / 23 ölçü.

Telefonda henüz doğrulanmadı: 0.3.0'ın 0.2.0 üstüne kurulması (sabit imza), yedek kaydetme penceresi, Ada profil yükleme, okuma raporu paylaşımı.

## Bilinen eksikler

- **Okunamayan düzenler:** ters tablo (modeller sütunda, özellikler satırda; örn. Rushwarm), kodsuz özellik kartı (örn. Asmarine), tabloları resim olan kataloglar (Flowmaster) ve taranmış PDF'ler (Vamates) için OCR.
- **10 MB üstü dosyalar** Drive bağlantısıyla bu ortama indirilemiyor (Hisar 2026, ECA, Boss Fiyat Listesi incelenemedi).
- **Veri saklama:** ürünler `localStorage` içinde; üç katalogla 1,6 MB, sınır yaklaşık 5 MB. IndexedDB'ye taşınmalı. Bu, aşağıdaki pek çok isteğin ön koşuludur.
- **Marka ve satıcı tek alanda karışık** (`supplier` / `brand`).
- **Okuma ana iş parçacığında** yapılıyor; okurken arayüz kilitleniyor.
- **Uygulama simgesi** basit bir SVG; Android başlatıcı simgesi tanımlı değil.
- Android geri tuşu uygulamadan çıkıyor (sayfa geçmişi yok).
- Karşılaştırma ekranı, galeri resmi ekleme, yazı boyutu ayarı henüz yok.

## Kullanıcının istekleri (yeni)

### Belge yükleme ve okuma
1. **Çoklu belge seçimi:** birden çok belge seçilsin, sırayla işlensin.
2. **Arka planda okuma:** belge okunurken kullanıcı diğer ekranları kullanabilsin.
3. **Büyük belgeleri kendiliğinden parçalama:** çok sayfalı ya da büyük dosyayı (örn. 50 MB) uygulama kendisi parçalara (örn. 20 sayfa) bölüp parça parça okusun ve kaydetsin; tek seferde hepsini çevirmeye çalışmasın. **Bunun için kullanıcıdan emir beklemesin.**
4. **Hız:** okuma çok yavaş bulunuyor, hızlansın; ancak doğruluktan ödün verilmesin. Doğru olacaksa yavaş da olabilir.

### Google Drive
5. **Uygulama Drive'a doğrudan bağlansın**, kataloglar oradan seçilebilsin. (Not: 0.2.0'da Android dosya seçicisi Drive klasörünü boş gösterdi.)
6. **Drive kayıt yolu:** sunucu olmadan, yapılan işlemler ve veriler Drive'a kaydedilebilsin.

### Marka ve satıcı
7. **Marka profili:** uygulama PDF'i okuyup marka profilini kendisi oluştursun.
8. Marka için internet sitesi ve marka bilgileri girilebilsin; gerekirse markanın sitesinden bilgi ve resim alınabilsin.
9. **Marka kartının altından belge yükleme:** yüklenen belge ve ürünleri doğrudan o markaya atansın.
10. **Satıcı profili:** uygulama satıcı kartını kendisi oluştursun. Satıcı profilinden de ürün ve belge yüklenebilsin, satıcıya bağlı grup oluşsun.
11. Aynı markanın ürünü farklı satıcılarda tek kartta listelensin. Marka: ürün, resim, teknik bilgi, sertifika. Satıcı: fiyat, stok, iskonto, sipariş.

### Arama ve kategori
12. **Arama sayfası kategorili olsun:** kataloglara, markalara ve ürün gruplarına göre.
13. **Otomatik kategori:** uygulama ürünleri kendisi ayırsın; ayıramadıklarını "kategorisiz" olarak göstersin.
14. **Öğrenme:** kullanıcının elle atadığı kategoriler hatırlansın; yeni kataloglar eklendikçe bu atamalardan yararlanıp daha isabetli ayırsın.
15. Ürün adı hatırlanmadığında **tarifle bulma** (özellik, ölçü, bağlantı tipi; Türkçe–İngilizce eş anlamlılar).

### Görünüm
16. **Yeni logo ve simgeler:** şu anki iyi görünmüyor. Uygulama simgesi ve arayüz simgeleri yeniden yapılsın. (HC MARIN WORKS logosu Ada profil dosyasında JPEG olarak var; firma logosu yeniden çizilmez, kullanıcıdan gelen kullanılır. Klavuz'un kendi uygulama simgesi ayrıdır; kullanıcıya iki üç seçenek sunulmalı.)
17. Sayfa ve ekran düzeni konusunda Claude öneri getirsin.

## Öncelik için ön görüş (devralan oturum kendi incelemesiyle düzeltsin)

1. Veriyi IndexedDB'ye taşıma ve marka / satıcı / kategori veri modeli. Diğer isteklerin temeli.
2. Okumayı arka plana alma, parça parça okuma, çoklu belge kuyruğu, hız.
3. Kategori, otomatik ayırma, elle atama ve öğrenme; kategorili arama ekranı.
4. Marka ve satıcı kartları, karttan belge yükleme.
5. Drive bağlantısı ve Drive'a kayıt. Kullanıcı kararı gerekir: Google hesabıyla oturum açma için bir Google Cloud istemci kimliği kurulmalı; sunucusuz yapılabilir ama kurulum adımı kullanıcıya düşer.
6. Yeni düzenler (ters tablo, özellik kartı) ve OCR.
7. Logo, simgeler, ekran düzeni.

## Verilmiş kararlar (kullanıcıya teknik soru sorulmaz)

- **OCR telefonda, internetsiz çalışır.** Yavaş olabilir; arka planda ve parça parça yapılır. Burada okunup hazır "marka paketi" olarak yükleme yalnızca ek bir kolaylıktır.
- **Belgeler önce telefondan seçilir** (indirilenler, dosya seçici). Drive'a doğrudan bağlanma sonraki, isteğe bağlı adımdır; Google tarafında kurulum gerektirdiği için ancak kullanıcı isterse ve adımları tek tek verilerek yapılır.
- **Kategori ağacının ilk halini Claude önerir**, uygulamanın içine koyar; kullanıcı uygulamada düzeltir.
- **Uygulama simgesi için Claude iki üç seçenek hazırlar**, kullanıcı birini seçer. Bu, sorulacak tek görünüm kararıdır.

Kullanıcıya yalnızca şunlar sorulur: planın onayı, simge seçimi, telefonda deneme sonuçları.
