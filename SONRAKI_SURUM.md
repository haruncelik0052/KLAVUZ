# Klavuz — sonraki sürüm için devir ve istek listesi

> **Güncel durum (0.4.0):** İnceleme yapıldı, plan kullanıcıca onaylandı. 0.4.0 ile şu istekler karşılandı: 1 (çoklu belge), 2 (arka planda okuma), 3 (kendiliğinden parçalama), 4 (hız, kısmen), IndexedDB'ye taşıma, geri tuşu, 5'in ilk adımı (dosya seçicide Drive). Ayrıntı `DEVIR.md` sonunda.
> **Onaylanan sıra:** 0.5.0 marka / satıcı / kategori (Drive'daki `05_MARKA_PROFILLERI` altında 50 marka klasörü var; marka listesi bu adlarla başlatılabilir) → 0.6.0 okunamayan düzenler (ters tablo, kodsuz özellik kartı, çift fiyat sütunlu kodsuz liste örn. Eser Pompa, OCR) → 0.7.0 görünüm, karşılaştırma, tarifle arama, isteğe bağlı Drive bağlantısı.
> **Bekleyen kullanıcı kararı:** uygulama simgesi (`simge/` altındaki üç seçenekten biri) ve 0.4.0 telefon denemesi.

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
