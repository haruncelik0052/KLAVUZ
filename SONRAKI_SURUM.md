# Klavuz — sonraki sürüm için devir ve istek listesi

Bu dosya, 0.3.0 sonrasında işi devralan oturum içindir. Teknik geçmiş `DEVIR.md` dosyasındadır; önce onu, sonra bunu okuyun.

## Devralan oturumun ilk görevi: inceleme, kod değil

Kullanıcı açıkça istedi: **devralan oturum önce inceleme yapar, bu sırada yeni kod üretmez.** Kullanıcı aynı anda telefonda kendi incelemesini yapacak. Sırayla:

1. `DEVIR.md` ve bu dosyayı oku. Depoyu ve `tests/` klasörünü incele; testleri çalıştır.
2. Uygulamadaki eksikleri ve hataları tespit et (aşağıdaki "bilinen eksikler" başlangıç noktasıdır, tam liste değildir).
3. Kullanıcının Google Drive'ındaki KATALOG klasörüne bağlan, katalogları okuyucudan geçir, hangi düzenlerin okunamadığını çıkar. Klasör bağlantısını kullanıcı sohbette verir; alt klasörler de var (`01_HC_KODLU_URUN_KATALOGLARI`, `02_URETICI_URUN_KATALOG_VE_TANITIMLARI`, `03_FIYAT_LISTELERI_VE_URUN_VERILERI`, `04_KATALOG_KAYNAK_PAKETLERI`).
4. Aşağıdaki istek listesini, kendi bulgularını ve **bizim gözden kaçırdıklarımızı** birleştirip öncelikli bir plan ve öneri listesi hazırla.
5. Planı kullanıcıya kısa ve sade sun. **Onay gelmeden kod yazma.**

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

## Kullanıcıya sorulacak iş kararları

- Drive bağlantısı için Google hesabı kurulumu yapılacak mı, yoksa önce Android dosya seçicisi üzerinden mi ilerlenecek?
- Kategori ağacının ilk hali: Claude önersin, kullanıcı düzeltsin mi?
- Uygulama simgesi için tercih (renk, biçim).
- OCR telefonda mı çalışsın (yavaş, internetsiz) yoksa katalog burada okunup hazır "marka paketi" olarak mı yüklensin?
