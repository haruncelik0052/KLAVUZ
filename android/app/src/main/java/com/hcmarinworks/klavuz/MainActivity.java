package com.hcmarinworks.klavuz;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Klavuz kabuğu: uygulamanın web sayfasını (assets/index.html) tam ekran bir WebView içinde açar.
 * Veriler cihazda saklanır. Dış bağlantılar (WhatsApp, tarayıcı) uygulamanın dışında açılır.
 */
public class MainActivity extends AppCompatActivity {

    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;
    private OutputStream saveOut;
    private boolean saveOk;
    private final Object saveLock = new Object();
    private long lastBack;
    private String sharedText = "";
    private boolean pageReady;
    // İnternetten paylaşılan ürün sayfasını okumak için görünmeyen ikinci tarayıcı
    private WebView probe;
    private boolean probeDone;
    private int probeSeq;
    private final android.os.Handler ui = new android.os.Handler(android.os.Looper.getMainLooper());
    private static final String UPDATE_PREFIX = "https://github.com/haruncelik0052/KLAVUZ/releases/download/";
    private static final String UPDATE_LIST = "https://api.github.com/repos/haruncelik0052/KLAVUZ/releases?per_page=20";

    private void deliverFiles(Uri[] uris) {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(uris == null || uris.length == 0 ? null : uris);
            filePathCallback = null;
        }
    }

    // Belge seçici: Android'in belge penceresi. Telefondaki dosyalar ve Google Drive gibi kaynaklar görünür;
    // birden çok dosya seçilebilir.
    private final ActivityResultLauncher<String[]> pickMany =
            registerForActivityResult(new ActivityResultContracts.OpenMultipleDocuments(),
                    uris -> deliverFiles(uris == null ? null : uris.toArray(new Uri[0])));

    private final ActivityResultLauncher<String[]> pickOne =
            registerForActivityResult(new ActivityResultContracts.OpenDocument(),
                    uri -> deliverFiles(uri == null ? null : new Uri[]{uri}));

    // Yedek kaydetme: kullanıcı dosyanın yerini seçer; içerik sonra parça parça yazılır
    private final ActivityResultLauncher<String> saver =
            registerForActivityResult(new ActivityResultContracts.CreateDocument("application/json"), uri -> {
                if (uri == null) return;
                boolean opened = false;
                synchronized (saveLock) {
                    try {
                        saveOut = getContentResolver().openOutputStream(uri);
                        saveOk = saveOut != null;
                        opened = saveOk;
                    } catch (Exception e) {
                        saveOut = null;
                    }
                }
                if (web == null) return;
                if (opened) web.evaluateJavascript("window.KlavuzSaveReady && KlavuzSaveReady()", null);
                else web.evaluateJavascript("window.KlavuzSaved && KlavuzSaved(false)", null);
            });

    /** Web sayfasının çağırabildiği Android işlevleri. */
    private class Bridge {
        @JavascriptInterface
        public void share(String text) {
            runOnUiThread(() -> {
                try {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("text/plain");
                    send.putExtra(Intent.EXTRA_TEXT, text);
                    startActivity(Intent.createChooser(send, "Gönder / paylaş"));
                } catch (Exception e) {
                    // Paylaşacak uygulama yoksa sessizce geç
                }
            });
        }

        /** Uygulama başka bir uygulamadan "paylaş" ile açıldıysa gelen metni bir kez verir. */
        @JavascriptInterface
        public String takeShared() {
            pageReady = true;
            String t = sharedText;
            sharedText = "";
            return t;
        }

        /**
         * Paylaşılan ürün sayfasını (internet varsa) görünmeyen bir tarayıcıda açar; sayfa tam yüklenince içeriğini
         * sayfadaki KlavuzPage işlevine verir. Alışveriş siteleri bilgiyi çoğunlukla sayfa açıldıktan sonra doldurduğu
         * ve düz indirmeyi reddettiği için gerçek tarayıcı kullanılır. Yalnız https adresler açılır.
         */
        @JavascriptInterface
        public void fetchText(String link) {
            if (link == null || !link.startsWith("https://")) {
                deliverPage("\"\"", "");
                return;
            }
            runOnUiThread(() -> probePage(link));
        }

        /** Bağlantıyı uygulamanın dışında (tarayıcıda ya da ilgili uygulamada) açar. */
        @JavascriptInterface
        public void openLink(String link) {
            runOnUiThread(() -> {
                try {
                    Uri u = Uri.parse(link);
                    String sc = u.getScheme();
                    if (!"https".equals(sc) && !"http".equals(sc)) return;
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception e) {
                    // Açacak uygulama yok
                }
            });
        }

        /** Yayınlanan sürümlerin listesini indirir (internet varsa) ve sayfadaki KlavuzUpdate işlevine verir. */
        @JavascriptInterface
        public void checkUpdate() {
            new Thread(() -> {
                String json = "";
                try {
                    byte[] b = download(UPDATE_LIST, 2 * 1024 * 1024);
                    if (b != null) json = new String(b, StandardCharsets.UTF_8);
                } catch (Exception e) {
                    json = "";
                }
                final String arg = org.json.JSONObject.quote(json);
                runOnUiThread(() -> {
                    if (web != null) web.evaluateJavascript("window.KlavuzUpdate && KlavuzUpdate(" + arg + ")", null);
                });
            }).start();
        }

        /**
         * Yeni sürümün APK dosyasını indirir ve Android'in kurulum ekranını açar. Yalnız Klavuz'un kendi yayın adresi
         * kabul edilir; inen dosyanın paket adı denetlenir. İmzayı Android kendisi denetler (farklı imzalı dosya kurulmaz).
         */
        @JavascriptInterface
        public void installUpdate(String link) {
            if (link == null || !link.startsWith(UPDATE_PREFIX) || !link.endsWith(".apk")) {
                updateProgress(-1, "Geçersiz güncelleme adresi.");
                return;
            }
            new Thread(() -> {
                try {
                    File dir = new File(getCacheDir(), "update");
                    dir.mkdirs();
                    File apk = new File(dir, "Klavuz.apk");
                    if (!downloadTo(link, apk)) {
                        updateProgress(-1, "");
                        return;
                    }
                    android.content.pm.PackageInfo pi = getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
                    if (pi == null || !getPackageName().equals(pi.packageName)) {
                        apk.delete();
                        updateProgress(-1, "İndirilen dosya Klavuz değil; kurulmadı.");
                        return;
                    }
                    Uri uri = androidx.core.content.FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", apk);
                    Intent in = new Intent(Intent.ACTION_VIEW);
                    in.setDataAndType(uri, "application/vnd.android.package-archive");
                    in.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    updateProgress(100, "");
                    runOnUiThread(() -> {
                        try {
                            startActivity(in);
                        } catch (Exception e) {
                            updateProgress(-1, "Kurulum ekranı açılamadı.");
                        }
                    });
                } catch (Exception e) {
                    updateProgress(-1, "");
                }
            }).start();
        }

        /** Ürün resmini indirir ve sayfadaki KlavuzImage işlevine verir. */
        @JavascriptInterface
        public void fetchImage(String link) {
            new Thread(() -> {
                String data = "";
                try {
                    byte[] b = download(link, 3 * 1024 * 1024);
                    if (b != null) data = "data:image/jpeg;base64," + android.util.Base64.encodeToString(b, android.util.Base64.NO_WRAP);
                } catch (Exception e) {
                    data = "";
                }
                final String arg = org.json.JSONObject.quote(data);
                runOnUiThread(() -> {
                    if (web != null) web.evaluateJavascript("window.KlavuzImage && KlavuzImage(" + arg + ")", null);
                });
            }).start();
        }

        /** Yedek: kayıt yeri penceresini açar. Yer seçilince sayfadaki KlavuzSaveReady çağrılır. */
        @JavascriptInterface
        public void saveBegin(String name) {
            runOnUiThread(() -> {
                try {
                    saver.launch(name);
                } catch (Exception e) {
                    if (web != null) web.evaluateJavascript("window.KlavuzSaved && KlavuzSaved(false)", null);
                }
            });
        }

        /** Yedeğin bir parçasını dosyaya yazar. */
        @JavascriptInterface
        public void saveChunk(String part) {
            synchronized (saveLock) {
                if (saveOut == null || !saveOk) return;
                try {
                    saveOut.write(part.getBytes(StandardCharsets.UTF_8));
                } catch (Exception e) {
                    saveOk = false;
                }
            }
        }

        /** Yedeği kapatır ve sonucu sayfaya bildirir. */
        @JavascriptInterface
        public void saveEnd(boolean complete) {
            final boolean ok;
            synchronized (saveLock) {
                boolean closed = true;
                if (saveOut != null) {
                    try {
                        saveOut.flush();
                        saveOut.close();
                    } catch (Exception e) {
                        closed = false;
                    }
                }
                ok = saveOut != null && saveOk && complete && closed;
                saveOut = null;
            }
            runOnUiThread(() -> {
                if (web != null) web.evaluateJavascript("window.KlavuzSaved && KlavuzSaved(" + ok + ")", null);
            });
        }
    }

    private void updateProgress(int pct, String msg) {
        final String js = "window.KlavuzUpdateProgress && KlavuzUpdateProgress(" + pct + "," + org.json.JSONObject.quote(msg == null ? "" : msg) + ")";
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript(js, null);
        });
    }

    /** htmlLiteral: JavaScript yazı değeri olarak hazır (tırnaklı) sayfa içeriği. */
    private void deliverPage(String htmlLiteral, String finalUrl) {
        final String js = "window.KlavuzPage && KlavuzPage(" + htmlLiteral + "," + org.json.JSONObject.quote(finalUrl == null ? "" : finalUrl) + ")";
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript(js, null);
        });
    }

    private void endProbe() {
        if (probe != null) {
            try {
                probe.stopLoading();
                probe.destroy();
            } catch (Exception e) {
                // zaten kapanmış
            }
            probe = null;
        }
    }

    /** Ürün sayfasını görünmeyen tarayıcıda açar; yüklenince (ya da 20 sn sonra) içeriğini alır. */
    private void probePage(String link) {
        endProbe();
        probeDone = false;
        final int seq = ++probeSeq;
        try {
            probe = new WebView(this);
            WebSettings ps = probe.getSettings();
            ps.setJavaScriptEnabled(true);
            ps.setDomStorageEnabled(true);
            ps.setBlockNetworkImage(true);
            ps.setAllowFileAccess(false);
            ps.setAllowContentAccess(false);
            final Runnable grab = () -> grabProbe(link, seq);
            probe.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    // Yalnız https sayfalar; uygulama açma (intent, market) ve güvensiz adresler engellenir
                    return !"https".equals(request.getUrl().getScheme());
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    ui.removeCallbacks(grab);
                    ui.postDelayed(grab, 1800);
                }
            });
            probe.loadUrl(link);
            ui.postDelayed(() -> grabProbe(link, seq), 20000);
        } catch (Exception e) {
            endProbe();
            fallbackFetch(link);
        }
    }

    private void grabProbe(String link, int seq) {
        if (probe == null || probeDone || seq != probeSeq) return;
        probeDone = true;
        final String finalUrl = probe.getUrl() == null ? link : probe.getUrl();
        try {
            probe.evaluateJavascript("(function(){try{return document.documentElement.outerHTML.slice(0,3000000);}catch(e){return '';}})()", value -> {
                if (seq == probeSeq) endProbe();
                if (value == null || value.length() < 400 || "null".equals(value)) {
                    fallbackFetch(link);
                } else {
                    deliverPage(value, finalUrl);
                }
            });
        } catch (Exception e) {
            endProbe();
            fallbackFetch(link);
        }
    }

    /** Görünmeyen tarayıcı sonuç vermezse sayfa düz indirilir. */
    private void fallbackFetch(String link) {
        new Thread(() -> {
            String html = "";
            try {
                byte[] b = download(link, 3 * 1024 * 1024);
                if (b != null) html = new String(b, StandardCharsets.UTF_8);
            } catch (Exception e) {
                html = "";
            }
            deliverPage(org.json.JSONObject.quote(html), link);
        }).start();
    }

    /** Güncelleme dosyasını diske indirir; ilerlemeyi sayfaya bildirir. Yalnız https; yönlendirmeler izlenir. */
    private boolean downloadTo(String link, File target) throws Exception {
        URL url = new URL(link);
        for (int hop = 0; hop < 6; hop++) {
            if (!"https".equals(url.getProtocol())) return false;
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setConnectTimeout(10000);
            c.setReadTimeout(30000);
            c.setInstanceFollowRedirects(false);
            c.setRequestProperty("User-Agent", "Klavuz-Android");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null) return false;
                url = new URL(url, loc);
                continue;
            }
            if (code != 200) {
                c.disconnect();
                return false;
            }
            long total = c.getContentLength(), done = 0;
            int last = -1;
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(target)) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    done += n;
                    int pct = total > 0 ? (int) Math.min(99, done * 100 / total) : 0;
                    if (pct >= last + 3) {
                        last = pct;
                        updateProgress(pct, "");
                    }
                }
            } finally {
                c.disconnect();
            }
            return done > 100000 && (total <= 0 || done == total);
        }
        return false;
    }

    /** Yalnız kullanıcının paylaştığı adresi indirir; en çok "limit" bayt okur. Yalnız https kabul edilir. */
    private byte[] download(String link, int limit) throws Exception {
        URL url = new URL(link);
        for (int hop = 0; hop < 5; hop++) {
            if (!"https".equals(url.getProtocol())) return null;
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(12000);
            c.setInstanceFollowRedirects(false);
            c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36");
            c.setRequestProperty("Accept-Language", "tr-TR,tr;q=0.9,en;q=0.8");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null) return null;
                url = new URL(url, loc);
                continue;
            }
            if (code != 200) {
                c.disconnect();
                return null;
            }
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n;
                while (out.size() < limit && (n = in.read(buf)) > 0) out.write(buf, 0, n);
                return out.toByteArray();
            } finally {
                c.disconnect();
            }
        }
        return null;
    }

    /** Başka uygulamadan "paylaş" ile gelen metni alır (örn. alışveriş sitesindeki ürün bağlantısı). */
    private void takeIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String t = intent.getStringExtra(Intent.EXTRA_TEXT);
        String subj = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (t == null) return;
        if (subj != null && !t.contains(subj)) t = subj + " " + t;
        if (pageReady && web != null) {
            web.evaluateJavascript("window.KlavuzShared && KlavuzShared(" + org.json.JSONObject.quote(t) + ")", null);
        } else {
            sharedText = t;
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        takeIntent(intent);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        takeIntent(getIntent());

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        // PDF okuma motorunun arka planda (ayrı iş parçacığında) çalışabilmesi için gerekir.
        // Sayfa yalnızca uygulamanın kendi dosyalarını yükler.
        s.setAllowFileAccessFromFileURLs(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);

        web.addJavascriptInterface(new Bridge(), "KlavuzAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme();
                // Uygulamanın kendi dosyaları WebView içinde kalır; diğer her şey dışarıda açılır
                if (scheme.equals("file")) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception e) {
                    // Açacak uygulama yok
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                try {
                    String[] any = new String[]{"*/*"};
                    if (params != null && params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pickMany.launch(any);
                    else pickOne.launch(any);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleBack();
            }
        });

        web.loadUrl("file:///android_asset/index.html");
    }

    /** Geri tuşu: önce sayfa kendi içinde geri gider; gidecek yer yoksa uygulama kapanmaz, arka plana alınır. */
    private void handleBack() {
        if (web == null) {
            moveTaskToBack(true);
            return;
        }
        web.evaluateJavascript("(window.KlavuzBack ? KlavuzBack() : false)", value -> {
            if ("true".equals(value)) return;
            long now = System.currentTimeMillis();
            if (now - lastBack < 2500) {
                moveTaskToBack(true);
            } else {
                lastBack = now;
                android.widget.Toast.makeText(this, "Çıkmak için bir kez daha basın", android.widget.Toast.LENGTH_SHORT).show();
            }
        });
    }
}
