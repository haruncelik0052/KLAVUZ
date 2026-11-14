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
import java.io.OutputStream;
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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

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
