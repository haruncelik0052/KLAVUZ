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
    private String pendingSave;

    // Belge seçici: PDF, Excel, CSV gibi dosyaları seçmek için
    private final ActivityResultLauncher<String> picker =
            registerForActivityResult(new ActivityResultContracts.GetContent(), uri -> {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(uri == null ? null : new Uri[]{uri});
                    filePathCallback = null;
                }
            });

    // Yedek kaydetme: kullanıcı dosyanın yerini seçer
    private final ActivityResultLauncher<String> saver =
            registerForActivityResult(new ActivityResultContracts.CreateDocument("application/json"), uri -> {
                boolean ok = false;
                if (uri != null && pendingSave != null) {
                    try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                        if (out != null) {
                            out.write(pendingSave.getBytes(StandardCharsets.UTF_8));
                            ok = true;
                        }
                    } catch (Exception e) {
                        ok = false;
                    }
                }
                pendingSave = null;
                if (uri != null && web != null) {
                    web.evaluateJavascript("window.KlavuzSaved && KlavuzSaved(" + ok + ")", null);
                }
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

        @JavascriptInterface
        public void saveFile(String name, String content) {
            runOnUiThread(() -> {
                pendingSave = content;
                try {
                    saver.launch(name);
                } catch (Exception e) {
                    pendingSave = null;
                }
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
                    picker.launch("*/*");
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
