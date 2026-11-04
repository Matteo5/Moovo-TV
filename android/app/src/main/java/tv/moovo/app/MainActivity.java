package tv.moovo.app;

import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MoovoNativePlugin.class);
        super.onCreate(savedInstanceState);

        // Lecture vidéo : l'écran ne doit pas se mettre en veille
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) return;

        // Proxy natif pour les serveurs IPTV (pas d'en-têtes CORS côté fournisseurs)
        bridge.setWebViewClient(new ProxyWebViewClient(bridge));

        WebSettings settings = bridge.getWebView().getSettings();
        // Lecture automatique au zapping, sans geste préalable
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Téléviseur : plein écran permanent, sans barres système
        if (MoovoNativePlugin.isTelevision(this)) {
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }

    /**
     * Touches de télécommande que la WebView ne transmet pas (ou mal, selon le fabricant) :
     * on les renvoie à l'interface sous leur nom standard (KeyboardEvent.key).
     */
    private static String remoteKeyName(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_CHANNEL_UP: return "ChannelUp";
            case KeyEvent.KEYCODE_CHANNEL_DOWN: return "ChannelDown";
            case KeyEvent.KEYCODE_LAST_CHANNEL: return "LastChannel";
            case KeyEvent.KEYCODE_INFO: return "Info";
            case KeyEvent.KEYCODE_GUIDE: return "Guide";
            default: return null;
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        String key = remoteKeyName(event.getKeyCode());
        Bridge bridge = getBridge();
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (key == null || webView == null) return super.dispatchKeyEvent(event);
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            boolean repeat = event.getRepeatCount() > 0;
            webView.evaluateJavascript(
                "(document.activeElement||document.body).dispatchEvent(new KeyboardEvent('keydown',{key:'" + key
                    + "',bubbles:true,cancelable:true,repeat:" + repeat + "}))",
                null
            );
        }
        return true;
    }
}
