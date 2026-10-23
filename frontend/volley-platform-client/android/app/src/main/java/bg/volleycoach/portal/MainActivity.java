package bg.volleycoach.portal;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;

/**
 * In-app WebView shell for coach/parent/athlete portals.
 * Exposes {@code window.VolleyNative} so the web app can open Chrome for Web Push
 * (Android WebView does not support PushManager) and later request FCM tokens.
 */
public class MainActivity extends AppCompatActivity {
    private static final String START_URL = "https://volley-platform-bul.vercel.app/app";
    private static final String PREFS = "volley_coach_shell";
    private static final String KEY_LAST_URL = "last_url";
    private static final String UA_SUFFIX = " VolleyCoachBULApp/1.2.2";

    private WebView webView;
    private ProgressBar progress;
    private SharedPreferences prefs;

    private final ActivityResultLauncher<String> notificationPermissionLauncher =
        registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {});

    private static boolean isAllowed(String url) {
        if (url == null) {
            return false;
        }
        return url.startsWith("https://volley-platform-bul.vercel.app")
            || url.startsWith("https://volley-platform.vercel.app")
            || url.startsWith("https://volley-platform-production.up.railway.app")
            || url.startsWith("about:blank")
            || url.startsWith("data:");
    }

    private String resumeUrl() {
        String last = prefs.getString(KEY_LAST_URL, null);
        if (last != null && isAllowed(last) && last.startsWith("https://")) {
            return last;
        }
        return START_URL;
    }

    public class VolleyNativeBridge {
        @JavascriptInterface
        public void openExternal(String url) {
            if (url == null || url.trim().isEmpty()) {
                return;
            }
            final String target = url.trim();
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(target));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                intent.setPackage("com.android.chrome");
                try {
                    startActivity(intent);
                } catch (ActivityNotFoundException chromeMissing) {
                    intent.setPackage(null);
                    try {
                        startActivity(intent);
                    } catch (Exception ignored) {
                        /* no browser */
                    }
                }
            });
        }

        @JavascriptInterface
        public void requestFcmToken(String callbackId) {
            // When google-services.json + Firebase Messaging are present, returns a token.
            // Otherwise returns "" so the web layer opens Chrome for Web Push.
            tryGetFirebaseToken(callbackId);
        }

        @JavascriptInterface
        public boolean hasNativePush() {
            try {
                Class.forName("com.google.firebase.messaging.FirebaseMessaging");
                return true;
            } catch (Throwable ignored) {
                return false;
            }
        }
    }

    private void tryGetFirebaseToken(final String callbackId) {
        try {
            Class<?> firebaseMessaging = Class.forName("com.google.firebase.messaging.FirebaseMessaging");
            Object instance = firebaseMessaging.getMethod("getInstance").invoke(null);
            Object task = firebaseMessaging.getMethod("getToken").invoke(instance);
            Class<?> onCompleteListener = Class.forName("com.google.android.gms.tasks.OnCompleteListener");
            Object listener = java.lang.reflect.Proxy.newProxyInstance(
                onCompleteListener.getClassLoader(),
                new Class<?>[] { onCompleteListener },
                (proxy, method, args) -> {
                    if ("onComplete".equals(method.getName()) && args != null && args.length > 0) {
                        Object completed = args[0];
                        boolean ok = (Boolean) completed.getClass().getMethod("isSuccessful").invoke(completed);
                        String token = "";
                        if (ok) {
                            Object result = completed.getClass().getMethod("getResult").invoke(completed);
                            token = result != null ? String.valueOf(result) : "";
                        }
                        deliverFcmToken(callbackId, token);
                    }
                    return null;
                }
            );
            task.getClass().getMethod("addOnCompleteListener", onCompleteListener).invoke(task, listener);
        } catch (Throwable ignored) {
            deliverFcmToken(callbackId, "");
        }
    }

    private void deliverFcmToken(final String callbackId, final String token) {
        if (webView == null || callbackId == null) {
            return;
        }
        final String safeId = JSONObject.quote(callbackId);
        final String safeToken = JSONObject.quote(token == null ? "" : token);
        runOnUiThread(
            () -> webView.evaluateJavascript(
                "(function(){try{if(window.__volleyNativeCb){window.__volleyNativeCb("
                    + safeId
                    + ","
                    + safeToken
                    + ");}}catch(e){}})();",
                null
            )
        );
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#F8FAFC"));

        webView = new WebView(this);
        progress = new ProgressBar(this);

        root.addView(
            webView,
            new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        );
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(140, 140, Gravity.CENTER);
        root.addView(progress, progressParams);
        setContentView(root);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setSupportMultipleWindows(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        String ua = settings.getUserAgentString();
        if (ua == null || !ua.contains("VolleyCoachBULApp")) {
            settings.setUserAgentString((ua == null ? "" : ua) + UA_SUFFIX);
        }

        webView.addJavascriptInterface(new VolleyNativeBridge(), "VolleyNative");

        webView.setWebChromeClient(
            new WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    if (request == null) {
                        return;
                    }
                    runOnUiThread(() -> request.grant(request.getResources()));
                }
            }
        );
        webView.setWebViewClient(
            new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    String url = request.getUrl() != null ? request.getUrl().toString() : null;
                    if (isAllowed(url)) {
                        return false;
                    }
                    return true;
                }

                @Override
                public void onPageStarted(WebView view, String url, Bitmap favicon) {
                    progress.setVisibility(View.VISIBLE);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    progress.setVisibility(View.GONE);
                    CookieManager.getInstance().flush();
                    if (url != null && isAllowed(url) && url.startsWith("https://")) {
                        prefs.edit().putString(KEY_LAST_URL, url).apply();
                    }
                }
            }
        );

        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        if (webView != null && webView.canGoBack()) {
                            webView.goBack();
                        } else {
                            setEnabled(false);
                            getOnBackPressedDispatcher().onBackPressed();
                        }
                    }
                }
            );

        maybeRequestNotificationPermission();
        webView.loadUrl(resumeUrl());
    }

    private void maybeRequestNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) {
            return;
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED) {
            return;
        }
        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("VolleyNative");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
