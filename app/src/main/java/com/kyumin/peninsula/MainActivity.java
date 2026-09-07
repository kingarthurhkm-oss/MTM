package com.kyumin.peninsula;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/** Offline app: no network permission, no remote navigation, no raw file access. */
public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/game/index.html";
    private static final int EXPORT = 71, IMPORT = 72, MAX_SAVE = 2_000_000;
    private WebView web;
    private String pendingSave;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (state != null) pendingSave = state.getString("pendingSave");
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(11, 23, 29));
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(11, 23, 29));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setGeolocationEnabled(false);
        s.setSupportMultipleWindows(false);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !START.equals(request.getUrl().toString());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getPath();
                if (!"https".equals(uri.getScheme()) || !HOST.equals(uri.getHost()) || path == null
                        || !path.startsWith("/game/") || path.contains("..") || !"GET".equals(request.getMethod())) {
                    return response(403, "Forbidden", "text/plain", new byte[0]);
                }
                try {
                    String mime = path.endsWith(".html") ? "text/html" : path.endsWith(".js") ? "text/javascript"
                            : path.endsWith(".css") ? "text/css" : path.endsWith(".svg") ? "image/svg+xml"
                            : path.endsWith(".woff2") ? "font/woff2" : path.endsWith(".json") ? "application/json" : "application/octet-stream";
                    return new WebResourceResponse(mime, "UTF-8", 200, "OK",
                            assetHeaders(),
                            getAssets().open(path.substring(1)));
                } catch (Exception e) { return response(404, "Not Found", "text/plain", new byte[0]); }
            }
        });
        web.addJavascriptInterface(new FileActions(), "AndroidFiles");
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        web.loadUrl(START);
    }

    private Map<String, String> assetHeaders() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-cache");
        headers.put("X-Content-Type-Options", "nosniff");
        return headers;
    }

    private WebResourceResponse response(int code, String reason, String mime, byte[] data) {
        return new WebResourceResponse(mime, "UTF-8", code, reason, Collections.emptyMap(), new ByteArrayInputStream(data));
    }

    public final class FileActions {
        @JavascriptInterface public void exportSave(String json) {
            if (json == null || json.length() > MAX_SAVE) return;
            runOnUiThread(() -> {
                pendingSave = json;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("application/json");
                i.putExtra(Intent.EXTRA_TITLE, "peninsula-save.json");
                startActivityForResult(i, EXPORT);
            });
        }
        @JavascriptInterface public void importSave() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
                startActivityForResult(i, IMPORT);
            });
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (result != RESULT_OK || data == null || data.getData() == null) {
            if (request == EXPORT) pendingSave = null;
            return;
        }
        try {
            if (request == EXPORT && pendingSave != null) {
                try (OutputStream stream = getContentResolver().openOutputStream(data.getData(), "wt")) {
                    if (stream == null) throw new IllegalStateException("No output stream");
                    stream.write(pendingSave.getBytes(StandardCharsets.UTF_8));
                }
                pendingSave = null;
                Toast.makeText(this, "저장 파일을 내보냈습니다.", Toast.LENGTH_SHORT).show();
            } else if (request == IMPORT) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                try (InputStream stream = getContentResolver().openInputStream(data.getData())) {
                    if (stream == null) throw new IllegalStateException("No input stream");
                    byte[] buffer = new byte[8192]; int n;
                    while ((n = stream.read(buffer)) != -1) {
                        if (bytes.size() + n > MAX_SAVE) throw new IllegalArgumentException("Save too large");
                        bytes.write(buffer, 0, n);
                    }
                }
                String json = bytes.toString(StandardCharsets.UTF_8.name());
                web.evaluateJavascript("window.receiveNativeSave(" + JSONObject.quote(json) + ")", null);
            }
        } catch (Exception e) {
            pendingSave = null;
            Toast.makeText(this, "파일을 처리하지 못했습니다. 저장 형식과 크기를 확인하세요.", Toast.LENGTH_LONG).show();
        }
    }
    @Override protected void onSaveInstanceState(Bundle out) {
        if (pendingSave != null) out.putString("pendingSave", pendingSave);
        super.onSaveInstanceState(out);
    }
    @Override protected void onPause() {
        web.evaluateJavascript("window.saveBeforePause && window.saveBeforePause()", null);
        web.onPause(); super.onPause();
    }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override public void onBackPressed() {
        web.evaluateJavascript("window.handleAndroidBack && window.handleAndroidBack()", null);
    }
    @Override protected void onDestroy() {
        if (web != null) { web.removeJavascriptInterface("AndroidFiles"); web.destroy(); }
        super.onDestroy();
    }
}
