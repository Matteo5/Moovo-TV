package tv.moovo.app;

import android.app.UiModeManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Fonctions natives pour l'interface : mode téléviseur, lecteur vidéo natif, lecteurs externes, mises à jour. */
@CapacitorPlugin(name = "MoovoNative")
@androidx.media3.common.util.UnstableApi
public class MoovoNativePlugin extends Plugin {

    private NativeVideo video;

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
        result.put("nativeVideo", true);
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            result.put("versionName", info.versionName);
            result.put("versionCode", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode);
        } catch (PackageManager.NameNotFoundException ignored) {
            // Sans version : pas de proposition de mise à jour
        }
        result.put("model", Build.MANUFACTURER + " " + Build.MODEL);
        result.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(result);
    }

    // ── Lecteur vidéo natif (ExoPlayer sous la WebView) ─────────

    private NativeVideo video() {
        if (video == null) {
            video = new NativeVideo(getActivity(), getBridge().getWebView(), event -> notifyListeners("videoEvent", event));
        }
        return video;
    }

    private void onUi(PluginCall call, Runnable action) {
        getActivity().runOnUiThread(() -> {
            try {
                action.run();
                call.resolve();
            } catch (RuntimeException e) {
                call.reject(e.getMessage() == null ? "Erreur du lecteur" : e.getMessage());
            }
        });
    }

    @PluginMethod
    public void videoLoad(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL manquante");
            return;
        }
        onUi(call, () -> video().load(
            url,
            call.getString("fallbackUrl"),
            Boolean.TRUE.equals(call.getBoolean("live", false)),
            (long) (call.getDouble("startAt", 0.0) * 1000),
            call.getString("mac"),
            call.getString("token"),
            call.getString("audioLang"),
            call.getString("subtitleLang")
        ));
    }

    @PluginMethod
    public void videoPlay(PluginCall call) {
        onUi(call, () -> video().play());
    }

    @PluginMethod
    public void videoPause(PluginCall call) {
        onUi(call, () -> video().pause());
    }

    @PluginMethod
    public void videoSeek(PluginCall call) {
        double time = call.getDouble("time", 0.0);
        onUi(call, () -> video().seek(time));
    }

    @PluginMethod
    public void videoVolume(PluginCall call) {
        float volume = call.getFloat("volume", 1f);
        boolean muted = Boolean.TRUE.equals(call.getBoolean("muted", false));
        onUi(call, () -> video().setVolume(volume, muted));
    }

    @PluginMethod
    public void videoResize(PluginCall call) {
        String mode = call.getString("mode", "fit");
        onUi(call, () -> video().setResizeMode(mode));
    }

    @PluginMethod
    public void videoSelectTrack(PluginCall call) {
        String kind = call.getString("kind", "audio");
        int id = call.getInt("id", -1);
        onUi(call, () -> video().selectTrack(kind, id));
    }

    @PluginMethod
    public void videoTracks(PluginCall call) {
        getActivity().runOnUiThread(() -> call.resolve(video == null ? new JSObject() : video.tracks()));
    }

    @PluginMethod
    public void videoStop(PluginCall call) {
        onUi(call, () -> {
            if (video != null) video.stop();
        });
    }

    // ── Mises à jour (APK téléchargé depuis le lien publié, puis installateur d'Android) ──
    // Événements « updateProgress » { received, total } pendant les téléchargements.

    /** APK d'une version donnée, dans le cache de l'application (effacé par Android si la place manque). */
    private java.io.File updateFile(int versionCode) {
        return new java.io.File(new java.io.File(getContext().getCacheDir(), "updates"), "moovo-tv-" + versionCode + ".apk");
    }

    /** Télécharge l'APK dans un fichier temporaire, renommé seulement une fois complet. */
    private java.io.File downloadUpdateFile(String url, int versionCode) throws java.io.IOException {
        java.io.File apk = updateFile(versionCode);
        java.io.File dir = apk.getParentFile();
        if (apk.exists() && apk.length() > 0) return apk;
        if (dir == null || (!dir.exists() && !dir.mkdirs())) throw new java.io.IOException("Dossier de téléchargement indisponible");
        // Anciennes versions téléchargées : inutiles
        java.io.File[] old = dir.listFiles();
        if (old != null) for (java.io.File f : old) if (!f.equals(apk)) f.delete();
        java.io.File part = new java.io.File(dir, apk.getName() + ".part");
        download(url, part);
        if (!part.renameTo(apk)) throw new java.io.IOException("Enregistrement de la mise à jour impossible");
        return apk;
    }

    /**
     * Télécharge la mise à jour en arrière-plan, sans rien demander : l'installation ne demandera
     * ensuite qu'une confirmation, sans attente.
     */
    @PluginMethod
    public void prepareUpdate(PluginCall call) {
        String url = call.getString("url");
        int versionCode = call.getInt("versionCode", 0);
        if (url == null || url.isEmpty() || versionCode <= 0) {
            call.reject("Lien de mise à jour manquant");
            return;
        }
        new Thread(() -> {
            try {
                downloadUpdateFile(url, versionCode);
                call.resolve();
            } catch (Exception e) {
                call.reject("Téléchargement impossible : " + (e.getMessage() == null ? "erreur réseau" : e.getMessage()));
            }
        }).start();
    }

    /**
     * Ouvre l'installateur d'Android sur l'APK (téléchargé au besoin). Même identifiant et même signature :
     * Android remplace l'application en gardant ses données (connexion, favoris, réglages).
     * Sans l'autorisation « Installer des applications inconnues », l'écran de réglage correspondant est ouvert,
     * il suffit de réessayer ensuite.
     */
    @PluginMethod
    public void installUpdate(PluginCall call) {
        String url = call.getString("url");
        // Versions de l'interface antérieures à prepareUpdate : pas de numéro, fichier à part
        int versionCode = call.getInt("versionCode", 0);
        if (url == null || url.isEmpty()) {
            call.reject("Lien de mise à jour manquant");
            return;
        }
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent settings = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.getPackageName()));
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(settings);
            } catch (ActivityNotFoundException ignored) {
                // Réglage introuvable sur ce boîtier : le message de l'interface explique où le trouver
            }
            call.reject("Autorisez Moovo TV à installer des applications, puis réessayez.", "NEED_PERMISSION");
            return;
        }
        new Thread(() -> {
            try {
                java.io.File apk = downloadUpdateFile(url, versionCode);
                Uri uri = androidx.core.content.FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apk);
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(uri, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(install);
                call.resolve();
            } catch (Exception e) {
                // Fichier peut-être abîmé : on le retéléchargera à la prochaine tentative
                updateFile(versionCode).delete();
                call.reject("Téléchargement impossible : " + (e.getMessage() == null ? "erreur réseau" : e.getMessage()));
            }
        }).start();
    }

    private void download(String target, java.io.File out) throws java.io.IOException {
        String current = target;
        for (int hop = 0; hop < 8; hop++) {
            java.net.HttpURLConnection conn = (java.net.HttpURLConnection) new java.net.URL(current).openConnection();
            conn.setConnectTimeout(20_000);
            conn.setReadTimeout(60_000);
            conn.setInstanceFollowRedirects(false);
            conn.setRequestProperty("User-Agent", "MoovoTV-Updater");
            int code = conn.getResponseCode();
            if (code >= 300 && code < 400 && conn.getHeaderField("Location") != null) {
                current = new java.net.URL(new java.net.URL(current), conn.getHeaderField("Location")).toString();
                conn.disconnect();
                continue;
            }
            if (code != 200) throw new java.io.IOException("le serveur a répondu " + code);
            String type = conn.getContentType() == null ? "" : conn.getContentType();
            // Google Drive renvoie une page HTML quand le fichier n'est pas partagé publiquement
            if (type.startsWith("text/html")) throw new java.io.IOException("le lien ne mène pas à l'APK (partage du fichier sur « Tous les utilisateurs disposant du lien » ?)");
            long total = conn.getContentLengthLong();
            try (java.io.InputStream in = conn.getInputStream(); java.io.FileOutputStream os = new java.io.FileOutputStream(out)) {
                byte[] buffer = new byte[64 * 1024];
                long received = 0;
                long lastEmit = 0;
                int n;
                while ((n = in.read(buffer)) != -1) {
                    os.write(buffer, 0, n);
                    received += n;
                    if (received - lastEmit > 512 * 1024) {
                        lastEmit = received;
                        JSObject progress = new JSObject();
                        progress.put("received", received);
                        progress.put("total", total);
                        notifyListeners("updateProgress", progress);
                    }
                }
            } finally {
                conn.disconnect();
            }
            return;
        }
        throw new java.io.IOException("trop de redirections");
    }

    // Bouton Accueil de la télécommande : la vidéo se met en pause (le son ne continue pas en arrière-plan)
    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (video != null) video.pause();
    }

    @Override
    protected void handleOnDestroy() {
        if (video != null) video.stop();
        if (pairing != null) pairing.stop();
        super.handleOnDestroy();
    }

    // ── Appairage depuis un téléphone (serveur local, événement « pairingReceived ») ──

    private PairingServer pairing;

    @PluginMethod
    public void startPairing(PluginCall call) {
        String address = PairingServer.localAddress();
        if (address == null) {
            call.reject("La TV n'est pas connectée à un réseau local.", "NO_NETWORK");
            return;
        }
        if (pairing == null) pairing = new PairingServer(getContext(), source -> notifyListeners("pairingReceived", source));
        try {
            pairing.start();
        } catch (java.io.IOException e) {
            call.reject("Appairage impossible : " + e.getMessage());
            return;
        }
        String url = "http://" + address + (pairing.port() == 80 ? "" : ":" + pairing.port()) + "/";
        JSObject result = new JSObject();
        result.put("url", url);
        result.put("code", pairing.code());
        call.resolve(result);
    }

    @PluginMethod
    public void stopPairing(PluginCall call) {
        if (pairing != null) pairing.stop();
        call.resolve();
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
