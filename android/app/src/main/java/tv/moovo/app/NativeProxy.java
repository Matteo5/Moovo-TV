package tv.moovo.app;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Proxy natif de Moovo-TV : équivalent Java de server/proxy.ts.
 *
 * Les requêtes de la WebView vers /api/proxy?url=...[&mac=...][&token=...] sont relayées ici,
 * hors contraintes CORS du navigateur :
 *  - réponse diffusée en continu (flux MPEG-TS en direct sans fin) ;
 *  - en-tête Range relayé (avance rapide des films) ;
 *  - playlists HLS réécrites pour que segments, clés et sous-playlists repassent par le proxy ;
 *  - user-agents IPTV (IPTV Smarters, décodeur MAG pour les portails Stalker).
 *
 * Limite : la WebView ne transmet pas le corps des requêtes POST interceptées ; les POST
 * (synchronisation réseau local) reçoivent donc une erreur explicite.
 */
final class NativeProxy {

    private static final int CONNECT_TIMEOUT_MS = 20_000;
    private static final int READ_TIMEOUT_MS = 30_000;
    private static final int MAX_PLAYLIST_BYTES = 8 * 1024 * 1024;
    private static final int MAX_REDIRECTS = 5;

    private static final String STB_USER_AGENT =
        "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3";
    private static final String DEFAULT_USER_AGENT = "IPTVSmartersPro";

    private static final Pattern URI_ATTRIBUTE = Pattern.compile("URI=\"([^\"]+)\"");

    private NativeProxy() {}

    static boolean isProxyRequest(Uri uri) {
        return "localhost".equals(uri.getHost()) && "/api/proxy".equals(uri.getPath());
    }

    static WebResourceResponse handle(WebResourceRequest request) {
        String method = request.getMethod() == null ? "GET" : request.getMethod().toUpperCase(Locale.ROOT);
        if ("OPTIONS".equals(method)) {
            return new WebResourceResponse("text/plain", "utf-8", 204, "No Content", corsHeaders(), new ByteArrayInputStream(new byte[0]));
        }
        if ("POST".equals(method)) {
            return jsonError(501, "Les envois (POST) ne sont pas disponibles dans l'application Android.");
        }

        Uri uri = request.getUrl();
        String target = uri.getQueryParameter("url");
        if (target == null || target.isEmpty()) return jsonError(400, "Paramètre url manquant.");
        if (!target.startsWith("http://") && !target.startsWith("https://")) {
            return jsonError(400, "Seuls les protocoles http et https sont acceptés.");
        }

        String mac = uri.getQueryParameter("mac");
        String token = uri.getQueryParameter("token");
        Map<String, String> incoming = lowerCaseKeys(request.getRequestHeaders());

        try {
            HttpURLConnection conn = null;
            String currentUrl = target;
            int status = 0;
            for (int i = 0; ; i++) {
                conn = open(currentUrl, mac, token, incoming.get("range"), "HEAD".equals(method) ? "HEAD" : "GET");
                status = conn.getResponseCode();
                String location = conn.getHeaderField("Location");
                if (status < 300 || status >= 400 || location == null) break;
                conn.disconnect();
                if (i >= MAX_REDIRECTS) return jsonError(502, "Trop de redirections.");
                // HttpURLConnection ne suit pas les redirections http ↔ https : on les suit nous-mêmes
                currentUrl = new URL(new URL(currentUrl), location).toString();
            }
            if (status >= 300 && status < 400) return jsonError(502, "Redirection invalide du serveur distant.");

            String contentType = conn.getContentType() == null ? "" : conn.getContentType();
            String mime = mimeOf(contentType);
            InputStream body = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (body == null) body = new ByteArrayInputStream(new byte[0]);

            Map<String, String> headers = corsHeaders();
            headers.put("Cache-Control", "no-store");

            if (status < 400 && looksLikePlaylist(currentUrl, contentType)) {
                long declared = conn.getContentLengthLong();
                if (declared <= MAX_PLAYLIST_BYTES) {
                    byte[] bytes = readAll(body, MAX_PLAYLIST_BYTES);
                    String text = new String(bytes, StandardCharsets.UTF_8);
                    if (text.contains("#EXT-X-")) {
                        text = rewriteHlsPlaylist(text, currentUrl, mac, token);
                        bytes = text.getBytes(StandardCharsets.UTF_8);
                    }
                    String playlistMime = mime.isEmpty() ? "application/vnd.apple.mpegurl" : mime;
                    return new WebResourceResponse(playlistMime, "utf-8", status, reason(status), headers, new ByteArrayInputStream(bytes));
                }
            }

            for (String name : new String[] { "Content-Range", "Accept-Ranges", "Content-Length", "Last-Modified", "ETag" }) {
                String value = conn.getHeaderField(name);
                if (value != null) headers.put(name, value);
            }
            if (mime.isEmpty()) mime = "application/octet-stream";

            return new WebResourceResponse(mime, charsetOf(contentType), status, reason(status), headers, body);
        } catch (java.net.SocketTimeoutException e) {
            return jsonError(504, "Le serveur distant ne répond pas (délai dépassé).");
        } catch (IOException e) {
            return jsonError(502, "Échec de connexion au serveur (" + e.getClass().getSimpleName() + ").");
        }
    }

    private static HttpURLConnection open(String target, String mac, String token, String range, String method) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(target).openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
        conn.setReadTimeout(READ_TIMEOUT_MS);
        conn.setRequestMethod(method);
        conn.setRequestProperty("User-Agent", mac != null ? STB_USER_AGENT : DEFAULT_USER_AGENT);
        conn.setRequestProperty("Accept", "*/*");
        // Pas de compression : la taille annoncée doit correspondre au corps (requêtes Range)
        conn.setRequestProperty("Accept-Encoding", "identity");
        if (mac != null) {
            conn.setRequestProperty("Cookie", "mac=" + mac + "; stb_lang=en; timezone=Europe%2FParis");
            conn.setRequestProperty("X-User-Agent", "Model: MAG250; Link: Ethernet");
        }
        if (token != null) conn.setRequestProperty("Authorization", "Bearer " + token);
        if (range != null) conn.setRequestProperty("Range", range);
        return conn;
    }

    /** Réécrit chaque URI d'une playlist HLS en URL absolue repassant par le proxy. */
    static String rewriteHlsPlaylist(String body, String baseUrl, String mac, String token) {
        StringBuilder out = new StringBuilder(body.length() + 1024);
        String[] lines = body.split("\r?\n", -1);
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            String trimmed = line.trim();
            if (trimmed.isEmpty()) {
                out.append(line);
            } else if (trimmed.startsWith("#")) {
                Matcher m = URI_ATTRIBUTE.matcher(line);
                StringBuffer sb = new StringBuffer();
                while (m.find()) {
                    m.appendReplacement(sb, Matcher.quoteReplacement("URI=\"" + proxied(m.group(1), baseUrl, mac, token) + "\""));
                }
                m.appendTail(sb);
                out.append(sb);
            } else {
                out.append(proxied(trimmed, baseUrl, mac, token));
            }
            if (i < lines.length - 1) out.append('\n');
        }
        return out.toString();
    }

    private static String proxied(String uri, String baseUrl, String mac, String token) {
        try {
            String absolute = new URL(new URL(baseUrl), uri).toString();
            StringBuilder sb = new StringBuilder("/api/proxy?url=").append(URLEncoder.encode(absolute, "UTF-8"));
            if (mac != null) sb.append("&mac=").append(URLEncoder.encode(mac, "UTF-8"));
            if (token != null) sb.append("&token=").append(URLEncoder.encode(token, "UTF-8"));
            return sb.toString();
        } catch (Exception e) {
            return uri;
        }
    }

    private static boolean looksLikePlaylist(String url, String contentType) {
        if (contentType.toLowerCase(Locale.ROOT).contains("mpegurl")) return true;
        String path = Uri.parse(url).getPath();
        return path != null && path.toLowerCase(Locale.ROOT).matches(".*\\.m3u8?$");
    }

    private static byte[] readAll(InputStream in, int limit) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16 * 1024];
        int n;
        while ((n = in.read(buf)) != -1) {
            out.write(buf, 0, n);
            if (out.size() > limit) break;
        }
        in.close();
        return out.toByteArray();
    }

    private static Map<String, String> corsHeaders() {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        h.put("Access-Control-Allow-Headers", "*");
        h.put("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
        return h;
    }

    private static Map<String, String> lowerCaseKeys(Map<String, String> headers) {
        Map<String, String> out = new HashMap<>();
        if (headers != null) {
            for (Map.Entry<String, String> e : headers.entrySet()) out.put(e.getKey().toLowerCase(Locale.ROOT), e.getValue());
        }
        return out;
    }

    private static String mimeOf(String contentType) {
        int semi = contentType.indexOf(';');
        return (semi >= 0 ? contentType.substring(0, semi) : contentType).trim();
    }

    private static String charsetOf(String contentType) {
        Matcher m = Pattern.compile("charset=([\\w-]+)", Pattern.CASE_INSENSITIVE).matcher(contentType);
        return m.find() ? m.group(1) : null;
    }

    // WebResourceResponse exige une phrase de statut non vide
    private static String reason(int status) {
        switch (status) {
            case 200: return "OK";
            case 204: return "No Content";
            case 206: return "Partial Content";
            case 400: return "Bad Request";
            case 401: return "Unauthorized";
            case 403: return "Forbidden";
            case 404: return "Not Found";
            case 416: return "Range Not Satisfiable";
            case 500: return "Internal Server Error";
            case 501: return "Not Implemented";
            case 502: return "Bad Gateway";
            case 503: return "Service Unavailable";
            case 504: return "Gateway Timeout";
            default: return "Status " + status;
        }
    }

    private static WebResourceResponse jsonError(int status, String message) {
        String json = "{\"error\":\"" + message.replace("\\", "\\\\").replace("\"", "\\\"") + "\",\"code\":\"\"}";
        return new WebResourceResponse(
            "application/json",
            "utf-8",
            status,
            reason(status),
            corsHeaders(),
            new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8))
        );
    }
}
