package tv.moovo.app;

import android.app.UiModeManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Fonctions natives pour l'interface : mode téléviseur, lecteurs vidéo externes. */
@CapacitorPlugin(name = "MoovoNative")
public class MoovoNativePlugin extends Plugin {

    // Lecteurs proposés dans les réglages (doivent aussi figurer dans <queries> du manifeste)
    private static final String[] KNOWN_PLAYERS = {
        "org.videolan.vlc",
        "org.courville.nova",
        "com.mxtech.videoplayer.ad",
        "com.mxtech.videoplayer.pro",
        "com.brouken.player",
        "com.newin.nplayer.pro",
    };

    static boolean isTelevision(Context context) {
        UiModeManager ui = (UiModeManager) context.getSystemService(Context.UI_MODE_SERVICE);
        if (ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION) return true;
        PackageManager pm = context.getPackageManager();
        return pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK) || pm.hasSystemFeature("android.software.leanback_only");
    }

    @PluginMethod
    public void getDeviceInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("television", isTelevision(getContext()));
        call.resolve(result);
    }

    /** Lecteurs externes installés parmi ceux pris en charge. */
    @PluginMethod
    public void getInstalledPlayers(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        JSArray installed = new JSArray();
        for (String pkg : KNOWN_PLAYERS) {
            try {
                pm.getPackageInfo(pkg, 0);
                installed.put(pkg);
            } catch (PackageManager.NameNotFoundException ignored) {
                // Non installé
            }
        }
        JSObject result = new JSObject();
        result.put("packages", installed);
        call.resolve(result);
    }

    /**
     * Ouvre une vidéo dans un lecteur externe.
     * package = nom du paquet (VLC, Nova…) ou vide pour laisser l'utilisateur choisir.
     */
    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url");
        String pkg = call.getString("package", "");
        String title = call.getString("title", "");
        if (url == null || url.isEmpty()) {
            call.reject("URL manquante");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(Uri.parse(url), "video/*");
        // Titre affiché par VLC, MX Player, Just Player…
        intent.putExtra("title", title);
        intent.putExtra("name", title);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            if (pkg != null && !pkg.isEmpty()) {
                intent.setPackage(pkg);
                getContext().startActivity(intent);
            } else {
                Intent chooser = Intent.createChooser(intent, "Lire avec");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(chooser);
            }
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("Lecteur non installé", "NOT_INSTALLED");
        }
    }
}
