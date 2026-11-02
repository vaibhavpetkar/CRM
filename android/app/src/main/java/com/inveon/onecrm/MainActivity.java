package com.inveon.onecrm;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * The CRM web app in a full-screen WebView. Pages on the CRM's own host stay
 * in the app; other links (WhatsApp, phone, maps, other sites) open in the
 * app that handles them. File pickers, downloads and the back button work the
 * way they do in a browser.
 */
public class MainActivity extends Activity {

    private static final int FILE_CHOOSER_REQUEST = 1;
    private static final String OFFLINE_PAGE = "file:///android_asset/offline.html";

    /**
     * Exports (CSV, Excel, Word) are built in the page as blob: URLs, which the
     * download manager cannot fetch. This hooks anchor clicks for blob links,
     * reads the blob in the page and hands it to {@link Bridge#saveFile}.
     */
    private static final String BLOB_DOWNLOAD_HOOK =
            "(function(){"
            + "if(window.__crmBlobHook||!window.CRMApp)return;window.__crmBlobHook=true;"
            + "function save(a){var href=a.href||'';if(href.indexOf('blob:')!==0)return false;"
            + "var name=a.download||'download';"
            + "fetch(href).then(function(r){return r.blob();}).then(function(b){"
            + "var fr=new FileReader();fr.onloadend=function(){"
            + "var s=String(fr.result);window.CRMApp.saveFile(name,b.type||'application/octet-stream',s.substring(s.indexOf(',')+1));};"
            + "fr.readAsDataURL(b);}).catch(function(){window.CRMApp.saveFailed();});return true;}"
            + "var click=HTMLAnchorElement.prototype.click;"
            + "HTMLAnchorElement.prototype.click=function(){if(!save(this))click.call(this);};"
            + "var dispatch=EventTarget.prototype.dispatchEvent;"
            + "EventTarget.prototype.dispatchEvent=function(e){"
            + "if(this instanceof HTMLAnchorElement&&e&&e.type==='click'&&save(this))return true;"
            + "return dispatch.call(this,e);};"
            + "document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href^=\"blob:\"]');"
            + "if(a&&save(a))e.preventDefault();},true);"
            + "})();";

    private WebView webView;
    private ProgressBar progress;
    private ValueCallback<Uri[]> pendingFileChooser;
    private String crmHost;
    private String lastFailedUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        crmHost = Uri.parse(BuildConfig.CRM_URL).getHost();

        View root = findViewById(R.id.root);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 15 draws apps edge to edge, so keep the page clear of the
            // status bar, navigation bar and on-screen keyboard ourselves.
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsets.CONSUMED;
            });
        }

        progress = findViewById(R.id.progress);
        webView = findViewById(R.id.webview);
        setUpWebView();

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBackOrExit);
        }

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(startUrl(getIntent()));
        }
    }

    private void setUpWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " InveonOneCRM-Android/" + BuildConfig.VERSION_NAME);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, false);

        webView.addJavascriptInterface(new Bridge(), "CRMApp");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isCrmPage(uri)) return false;
                openExternally(uri);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript(BLOB_DOWNLOAD_HOOK, null);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    lastFailedUrl = request.getUrl().toString();
                    view.loadUrl(OFFLINE_PAGE);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgress(newProgress);
                progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFileChooser != null) pendingFileChooser.onReceiveValue(null);
                pendingFileChooser = callback;
                Intent pick = params.createIntent();
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                try {
                    startActivityForResult(Intent.createChooser(pick, getString(R.string.choose_file)), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException e) {
                    pendingFileChooser = null;
                    return false;
                }
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url.startsWith("blob:")) {
                // A blob link the page hook missed: read it in the page instead.
                webView.evaluateJavascript(BLOB_DOWNLOAD_HOOK + "(function(){var a=document.createElement('a');a.href='"
                        + url + "';a.click();})();", null);
                return;
            }
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setMimeType(mimeType);
            req.addRequestHeader("User-Agent", userAgent);
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) req.addRequestHeader("Cookie", cookie);
            req.setTitle(fileName);
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            } else {
                req.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, fileName);
            }
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (dm != null) {
                dm.enqueue(req);
                toast(getString(R.string.download_started, fileName));
            }
        });
    }

    /** The page to open: a CRM link the app was opened with, else the CRM home. */
    private String startUrl(Intent intent) {
        Uri data = intent != null ? intent.getData() : null;
        if (data != null && isCrmPage(data)) return data.toString();
        return BuildConfig.CRM_URL;
    }

    private boolean isCrmPage(Uri uri) {
        String scheme = uri.getScheme();
        if ("file".equals(scheme)) return uri.toString().startsWith(OFFLINE_PAGE);
        return "https".equals(scheme) && crmHost != null && crmHost.equalsIgnoreCase(uri.getHost());
    }

    private void openExternally(Uri uri) {
        try {
            Intent intent;
            if ("intent".equals(uri.getScheme())) {
                intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                intent.setSelector(null);
            } else {
                intent = new Intent(Intent.ACTION_VIEW, uri);
            }
            startActivity(intent);
        } catch (Exception e) {
            toast(getString(R.string.no_app_for_link));
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent.getData() != null) webView.loadUrl(startUrl(intent));
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (pendingFileChooser != null) {
                pendingFileChooser.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                pendingFileChooser = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void goBackOrExit() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            finish();
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        goBackOrExit();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    /** Saves a file the page built in memory into the phone's Downloads. */
    private void saveToDownloads(String name, String mimeType, byte[] bytes) throws Exception {
        String safeName = name.replaceAll("[\\\\/:*?\"<>|]", "_");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
            values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
            Uri item = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (item == null) throw new IllegalStateException("No Downloads folder");
            try (OutputStream out = resolver.openOutputStream(item)) {
                if (out == null) throw new IllegalStateException("Cannot write " + safeName);
                out.write(bytes);
            }
        } else {
            File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) throw new IllegalStateException("No Downloads folder");
            try (OutputStream out = new FileOutputStream(new File(dir, safeName))) {
                out.write(bytes);
            }
        }
    }

    /** Methods the page can call as window.CRMApp.*. */
    class Bridge {
        @JavascriptInterface
        public void saveFile(String name, String mimeType, String base64) {
            runOnUiThread(() -> {
                try {
                    saveToDownloads(name, mimeType, Base64.decode(base64, Base64.DEFAULT));
                    toast(getString(R.string.download_saved, name));
                } catch (Exception e) {
                    toast(getString(R.string.download_failed));
                }
            });
        }

        @JavascriptInterface
        public void saveFailed() {
            runOnUiThread(() -> toast(getString(R.string.download_failed)));
        }

        @JavascriptInterface
        public void retry() {
            runOnUiThread(() -> webView.loadUrl(lastFailedUrl != null ? lastFailedUrl : BuildConfig.CRM_URL));
        }
    }
}
