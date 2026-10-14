package tv.moovo.app;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebSettings;

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
}
