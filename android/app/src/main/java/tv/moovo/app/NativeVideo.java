package tv.moovo.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy;
import androidx.media3.extractor.DefaultExtractorsFactory;
import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Lecteur vidéo natif (ExoPlayer / Media3) placé sous la WebView, qui devient transparente pendant la lecture :
 * l'interface du lecteur (commandes, zapping, guide, télécommande) reste celle de l'application web,
 * seul le décodage passe par le matériel du téléviseur. Lit HLS, MPEG-TS en direct, MP4, MKV, AVI, HEVC,
 * et l'audio AC3 / E-AC3 / DTS (décodeur FFmpeg quand le matériel ne sait pas faire).
 *
 * Toutes les méthodes s'appellent sur le fil principal.
 */
@UnstableApi
final class NativeVideo {

    interface Emitter {
        void emit(JSObject event);
    }

    private static final String STB_USER_AGENT =
        "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3";
    private static final String DEFAULT_USER_AGENT = "IPTVSmartersPro";
    private static final int PAGE_BACKGROUND = Color.parseColor("#030919");
    /** Coupures pendant un direct : reconnexions avant d'abandonner */
    private static final int MAX_LIVE_RECONNECTS = 6;
    private static final long TICK_MS = 250;

    private final Activity activity;
    private final WebView webView;
    private final Emitter emitter;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Nullable private ExoPlayer player;
    @Nullable private PlayerView view;

    private String url;
    @Nullable private String fallbackUrl;
    private boolean live;
    @Nullable private String mac;
    @Nullable private String token;
    private boolean triedFallback;
    private boolean hasPlayed;
    private int reconnects;
    private float volume = 1f;
    private boolean muted;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            emitState();
            handler.postDelayed(this, TICK_MS);
        }
    };

    NativeVideo(Activity activity, WebView webView, Emitter emitter) {
        this.activity = activity;
        this.webView = webView;
        this.emitter = emitter;
    }

    // ── Chargement ─────────────────────────────────────────────

    void load(String url, @Nullable String fallbackUrl, boolean live, long startMs, @Nullable String mac, @Nullable String token,
              @Nullable String audioLang, @Nullable String subtitleLang) {
        this.url = url;
        this.fallbackUrl = fallbackUrl;
        this.live = live;
        this.mac = mac;
        this.token = token;
        this.triedFallback = false;
        this.hasPlayed = false;
        this.reconnects = 0;

        ensurePlayer();
        TrackSelectionParameters.Builder params = player.getTrackSelectionParameters().buildUpon()
            .clearOverrides()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, subtitleLang == null || "off".equals(subtitleLang));
        if (audioLang != null && !audioLang.isEmpty() && !"auto".equals(audioLang)) params.setPreferredAudioLanguage(audioLang);
        if (subtitleLang != null && !"off".equals(subtitleLang)) params.setPreferredTextLanguage(subtitleLang);
        player.setTrackSelectionParameters(params.build());

        startItem(url, startMs);
    }

    private void startItem(String target, long startMs) {
        if (player == null) return;
        player.setMediaSource(new DefaultMediaSourceFactory(dataSourceFactory(), extractors())
            .setLoadErrorHandlingPolicy(new DefaultLoadErrorHandlingPolicy(live ? 8 : 4))
            .createMediaSource(mediaItem(target)));
        if (startMs > 0) player.seekTo(startMs);
        player.prepare();
        player.setPlayWhenReady(true);
    }

    private MediaItem mediaItem(String target) {
        MediaItem.Builder builder = new MediaItem.Builder().setUri(target);
        String lower = target.toLowerCase(Locale.ROOT);
        // Liens sans extension (portails MAG, « extension=m3u8 ») : le type ne se devine pas toujours tout seul
        if (lower.contains(".m3u8") || lower.contains("extension=m3u8") || lower.contains("output=hls")) {
            builder.setMimeType(MimeTypes.APPLICATION_M3U8);
        }
        return builder.build();
    }

    private DefaultHttpDataSource.Factory dataSourceFactory() {
        Map<String, String> headers = new HashMap<>();
        if (mac != null) {
            headers.put("Cookie", "mac=" + mac + "; stb_lang=en; timezone=Europe%2FParis");
            headers.put("X-User-Agent", "Model: MAG250; Link: Ethernet");
        }
        if (token != null) headers.put("Authorization", "Bearer " + token);
        return new DefaultHttpDataSource.Factory()
            .setUserAgent(mac != null ? STB_USER_AGENT : DEFAULT_USER_AGENT)
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(20_000)
            .setDefaultRequestProperties(headers);
    }

    /**
     * Flux TS d'IPTV : souvent sans image IDR au début (démarrage sur une image I ordinaire).
     * Pas de FLAG_DETECT_ACCESS_UNITS : il fige le décodeur vidéo après quelques images.
     */
    private DefaultExtractorsFactory extractors() {
        return new DefaultExtractorsFactory()
            .setTsExtractorFlags(DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES)
            .setConstantBitrateSeekingEnabled(true);
    }

    private void ensurePlayer() {
        if (player != null) return;

        DefaultRenderersFactory renderers = new DefaultRenderersFactory(activity)
            // Décodeur FFmpeg en secours pour l'audio que le matériel ne lit pas (AC3, DTS…)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)
            .setEnableDecoderFallback(true);

        // Tampon confortable pour les serveurs IPTV irréguliers, reprise rapide après une coupure
        DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
            .setBufferDurationsMs(20_000, 60_000, 1_500, 3_000)
            .setPrioritizeTimeOverSizeThresholds(true)
            .build();

        player = new ExoPlayer.Builder(activity, renderers)
            .setLoadControl(loadControl)
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .setHandleAudioBecomingNoisy(true)
            .build();
        player.setVolume(muted ? 0f : volume);
        player.addListener(listener);
        // Version de débogage : journal détaillé de Media3 (logcat, étiquette EventLogger)
        if ((activity.getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) player.addAnalyticsListener(new androidx.media3.exoplayer.util.EventLogger());

        view = (PlayerView) activity.getLayoutInflater().inflate(R.layout.moovo_player_view, null);
        view.setUseController(false);
        view.setFocusable(false);
        view.setFocusableInTouchMode(false);
        view.setShutterBackgroundColor(Color.BLACK);
        view.setBackgroundColor(Color.BLACK);
        view.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
        view.setKeepScreenOn(true);
        view.setPlayer(player);

        // Sous la WebView, qui devient transparente le temps de la lecture
        ViewGroup parent = (ViewGroup) webView.getParent();
        parent.addView(view, parent.indexOfChild(webView), new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.setBackgroundColor(Color.TRANSPARENT);

        handler.post(ticker);
    }

    // ── Commandes ─────────────────────────────────────────────

    void play() {
        if (player == null) return;
        // Direct en pause trop longtemps : on revient au direct plutôt que de lire du retard
        if (live && player.getPlaybackState() == Player.STATE_IDLE) player.prepare();
        player.play();
    }

    void pause() {
        if (player != null) player.pause();
    }

    void seek(double seconds) {
        if (player != null && !live) player.seekTo((long) (seconds * 1000));
    }

    void setVolume(float volume, boolean muted) {
        this.volume = volume;
        this.muted = muted;
        if (player != null) player.setVolume(muted ? 0f : volume);
    }

    void setResizeMode(String mode) {
        if (view == null) return;
        switch (mode) {
            case "fill": view.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_ZOOM); break;
            case "stretch": view.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FILL); break;
            default: view.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT); break;
        }
    }

    /** Arrêt complet : lecteur libéré (décodeurs rendus au système) et WebView de nouveau opaque. */
    void stop() {
        handler.removeCallbacks(ticker);
        handler.removeCallbacksAndMessages(null);
        if (player != null) {
            player.removeListener(listener);
            player.release();
            player = null;
        }
        if (view != null) {
            ((ViewGroup) view.getParent()).removeView(view);
            view.setPlayer(null);
            view = null;
        }
        webView.setBackgroundColor(PAGE_BACKGROUND);
    }

    // ── Pistes audio et sous-titres ───────────────────────────

    JSObject tracks() {
        JSObject result = new JSObject();
        result.put("audio", trackList(C.TRACK_TYPE_AUDIO));
        result.put("subtitles", trackList(C.TRACK_TYPE_TEXT));
        return result;
    }

    private JSArray trackList(int type) {
        JSArray list = new JSArray();
        if (player == null) return list;
        boolean textOff = type == C.TRACK_TYPE_TEXT && player.getTrackSelectionParameters().disabledTrackTypes.contains(C.TRACK_TYPE_TEXT);
        int groupIndex = 0;
        for (Tracks.Group group : player.getCurrentTracks().getGroups()) {
            if (group.getType() == type) {
                for (int i = 0; i < group.length; i++) {
                    if (!group.isTrackSupported(i)) continue;
                    Format format = group.getTrackFormat(i);
                    JSObject track = new JSObject();
                    track.put("id", groupIndex * 1000 + i);
                    track.put("label", trackLabel(format, list.length() + 1, type));
                    track.put("lang", format.language == null ? "" : format.language);
                    track.put("active", !textOff && group.isTrackSelected(i));
                    list.put(track);
                }
            }
            groupIndex++;
        }
        return list;
    }

    private static String trackLabel(Format format, int number, int type) {
        if (format.label != null && !format.label.isEmpty()) return format.label;
        if (format.language != null && !format.language.isEmpty() && !"und".equals(format.language)) {
            String name = new Locale(format.language).getDisplayLanguage(Locale.FRENCH);
            if (!name.isEmpty()) return Character.toUpperCase(name.charAt(0)) + name.substring(1);
        }
        return (type == C.TRACK_TYPE_AUDIO ? "Piste " : "Sous-titres ") + number;
    }

    /** id = groupe × 1000 + piste ; -1 désactive les sous-titres. */
    void selectTrack(String kind, int id) {
        if (player == null) return;
        int type = "audio".equals(kind) ? C.TRACK_TYPE_AUDIO : C.TRACK_TYPE_TEXT;
        TrackSelectionParameters.Builder params = player.getTrackSelectionParameters().buildUpon();
        if (id < 0) {
            params.setTrackTypeDisabled(type, true);
        } else {
            int groupIndex = id / 1000;
            int trackIndex = id % 1000;
            if (groupIndex >= player.getCurrentTracks().getGroups().size()) return;
            Tracks.Group group = player.getCurrentTracks().getGroups().get(groupIndex);
            params.setTrackTypeDisabled(type, false)
                .setOverrideForType(new TrackSelectionOverride(group.getMediaTrackGroup(), trackIndex));
        }
        player.setTrackSelectionParameters(params.build());
    }

    // ── Événements vers l'interface ───────────────────────────

    private void emitState() {
        if (player == null) return;
        JSObject event = new JSObject();
        event.put("type", "state");
        event.put("time", player.getCurrentPosition() / 1000.0);
        long duration = player.getDuration();
        event.put("duration", live || duration == C.TIME_UNSET ? -1 : duration / 1000.0);
        event.put("buffered", player.getBufferedPosition() / 1000.0);
        event.put("playing", player.isPlaying());
        event.put("paused", !player.getPlayWhenReady());
        event.put("buffering", player.getPlaybackState() == Player.STATE_BUFFERING);
        event.put("ended", player.getPlaybackState() == Player.STATE_ENDED);
        emitter.emit(event);
    }

    private void emitSimple(String type) {
        JSObject event = new JSObject();
        event.put("type", type);
        emitter.emit(event);
    }

    private final Player.Listener listener = new Player.Listener() {
        @Override
        public void onRenderedFirstFrame() {
            hasPlayed = true;
            reconnects = 0;
            emitSimple("firstFrame");
        }

        @Override
        public void onIsPlayingChanged(boolean isPlaying) {
            if (isPlaying) {
                hasPlayed = true;
                reconnects = 0;
            }
            emitState();
        }

        @Override
        public void onPlaybackStateChanged(int state) {
            emitState();
            if (state == Player.STATE_ENDED) {
                // Un direct ne « finit » pas : fin de flux = coupure du fournisseur, on se reconnecte
                if (live) reconnect();
                else emitSimple("ended");
            }
        }

        @Override
        public void onTracksChanged(@NonNull Tracks tracks) {
            emitSimple("tracks");
        }

        @Override
        public void onPlayerError(@NonNull PlaybackException error) {
            if (player == null) return;
            // Direct HLS trop en retard sur la fenêtre du serveur : retour au direct
            if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
                player.seekToDefaultPosition();
                player.prepare();
                return;
            }
            // Coupure en cours de direct : reconnexion silencieuse
            if (live && hasPlayed && reconnects < MAX_LIVE_RECONNECTS) {
                reconnect();
                return;
            }
            // Le flux .ts ne démarre pas : on essaie la variante HLS du même direct
            if (!hasPlayed && fallbackUrl != null && !triedFallback) {
                triedFallback = true;
                startItem(fallbackUrl, 0);
                return;
            }
            JSObject event = new JSObject();
            event.put("type", "error");
            event.put("code", error.getErrorCodeName());
            event.put("message", error.getMessage() == null ? "" : error.getMessage());
            event.put("played", hasPlayed);
            emitter.emit(event);
        }
    };

    private void reconnect() {
        reconnects++;
        handler.postDelayed(() -> {
            if (player == null) return;
            startItem(triedFallback && fallbackUrl != null ? fallbackUrl : url, 0);
        }, Math.min(4_000, 800L * reconnects));
    }

    View getView() {
        return view;
    }
}
