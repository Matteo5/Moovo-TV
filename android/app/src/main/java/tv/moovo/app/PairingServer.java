package tv.moovo.app;

import android.content.Context;

import com.getcapacitor.JSObject;

import org.json.JSONException;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.Locale;

/**
 * Appairage depuis un téléphone : petit serveur HTTP du réseau local, actif seulement pendant que l'écran
 * d'appairage est ouvert sur la TV. Le téléphone (QR code) ouvre la page de saisie, puis envoie les accès
 * avec le code à 4 chiffres affiché sur la TV. Rien ne passe par Internet.
 */
final class PairingServer {

    interface Listener {
        void onReceived(JSObject source);
    }

    private static final int PREFERRED_PORT = 8765;
    private static final int MAX_BODY = 16 * 1024;
    private static final int MAX_FAILURES = 10;

    private final Context context;
    private final Listener listener;
    private ServerSocket server;
    private String code;
    private int failures;

    PairingServer(Context context, Listener listener) {
        this.context = context;
        this.listener = listener;
    }

    synchronized boolean isRunning() {
        return server != null && !server.isClosed();
    }

    synchronized String code() {
        return code;
    }

    synchronized int port() {
        return server == null ? -1 : server.getLocalPort();
    }

    /** Démarre le serveur (port 8765, sinon un port libre) avec un nouveau code. */
    synchronized void start() throws IOException {
        if (!isRunning()) {
            try {
                server = new ServerSocket(PREFERRED_PORT);
            } catch (IOException busy) {
                server = new ServerSocket(0);
            }
            final ServerSocket socket = server;
            Thread accept = new Thread(() -> acceptLoop(socket), "moovo-pairing");
            accept.setDaemon(true);
            accept.start();
        }
        code = String.format(Locale.ROOT, "%04d", new SecureRandom().nextInt(10_000));
        failures = 0;
    }

    synchronized void stop() {
        if (server != null) {
            try {
                server.close();
            } catch (IOException ignored) {
                // Déjà fermé
            }
        }
        server = null;
        code = null;
    }

    private void acceptLoop(ServerSocket socket) {
        while (!socket.isClosed()) {
            try {
                Socket client = socket.accept();
                Thread worker = new Thread(() -> handle(client), "moovo-pairing-client");
                worker.setDaemon(true);
                worker.start();
            } catch (IOException e) {
                // Serveur fermé (fin de l'appairage)
                return;
            }
        }
    }

    private void handle(Socket client) {
        try (Socket s = client) {
            s.setSoTimeout(10_000);
            InputStream in = s.getInputStream();
            String head = readHead(in);
            if (head == null) return;
            String[] lines = head.split("\r\n");
            String[] request = lines[0].split(" ");
            if (request.length < 2) return;
            String method = request[0];
            String path = request[1];
            int length = 0;
            for (String line : lines) {
                if (line.toLowerCase(Locale.ROOT).startsWith("content-length:")) {
                    try {
                        length = Integer.parseInt(line.substring(15).trim());
                    } catch (NumberFormatException ignored) {
                        length = -1;
                    }
                }
            }

            OutputStream out = s.getOutputStream();
            if ("GET".equals(method) && (path.equals("/") || path.startsWith("/?"))) {
                respond(out, 200, "text/html; charset=utf-8", page());
            } else if ("POST".equals(method) && path.equals("/pair")) {
                if (length <= 0 || length > MAX_BODY) {
                    respondJson(out, 413, false, "Envoi trop volumineux.");
                    return;
                }
                handlePair(out, new String(readBytes(in, length), StandardCharsets.UTF_8));
            } else {
                respond(out, 404, "text/plain; charset=utf-8", "Introuvable".getBytes(StandardCharsets.UTF_8));
            }
        } catch (IOException ignored) {
            // Connexion interrompue par le téléphone
        }
    }

    private void handlePair(OutputStream out, String body) throws IOException {
        JSObject data;
        try {
            data = new JSObject(body);
        } catch (JSONException e) {
            respondJson(out, 400, false, "Envoi illisible.");
            return;
        }
        synchronized (this) {
            if (code == null) {
                respondJson(out, 410, false, "L’appairage est terminé sur la TV.");
                return;
            }
            if (failures >= MAX_FAILURES) {
                respondJson(out, 429, false, "Trop d’essais : rouvrez l’appairage sur la TV.");
                return;
            }
            if (!code.equals(data.getString("code", ""))) {
                failures++;
                respondJson(out, 403, false, "Code incorrect : recopiez les 4 chiffres affichés sur la TV.");
                return;
            }
        }
        data.remove("code");
        respondJson(out, 200, true, null);
        listener.onReceived(data);
    }

    private byte[] page() throws IOException {
        try (InputStream in = context.getResources().openRawResource(R.raw.pairing)) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int n;
            while ((n = in.read(chunk)) != -1) buffer.write(chunk, 0, n);
            return buffer.toByteArray();
        }
    }

    private static String readHead(InputStream in) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        int matched = 0;
        int b;
        while ((b = in.read()) != -1) {
            buffer.write(b);
            if (buffer.size() > 8192) return null;
            matched = (b == '\r' && (matched == 0 || matched == 2)) || (b == '\n' && (matched == 1 || matched == 3)) ? matched + 1 : 0;
            if (matched == 4) return buffer.toString("ISO-8859-1");
        }
        return null;
    }

    private static byte[] readBytes(InputStream in, int length) throws IOException {
        byte[] data = new byte[length];
        int read = 0;
        while (read < length) {
            int n = in.read(data, read, length - read);
            if (n == -1) break;
            read += n;
        }
        return data;
    }

    private static void respondJson(OutputStream out, int status, boolean ok, String error) throws IOException {
        JSObject json = new JSObject();
        json.put("ok", ok);
        if (error != null) json.put("error", error);
        respond(out, status, "application/json; charset=utf-8", json.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static void respond(OutputStream out, int status, String type, byte[] body) throws IOException {
        String head = "HTTP/1.1 " + status + " " + (status == 200 ? "OK" : "Error") + "\r\n"
            + "Content-Type: " + type + "\r\n"
            + "Content-Length: " + body.length + "\r\n"
            + "Cache-Control: no-store\r\n"
            + "Connection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.ISO_8859_1));
        out.write(body);
        out.flush();
    }

    /** Adresse IPv4 de la TV sur le réseau local (Wi-Fi ou Ethernet), ou null hors réseau. */
    static String localAddress() {
        String fallback = null;
        try {
            for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nif.isUp() || nif.isLoopback() || nif.isVirtual()) continue;
                for (InetAddress address : Collections.list(nif.getInetAddresses())) {
                    if (!(address instanceof Inet4Address) || !address.isSiteLocalAddress()) continue;
                    String name = nif.getName();
                    if (name.startsWith("wlan") || name.startsWith("eth")) return address.getHostAddress();
                    if (fallback == null) fallback = address.getHostAddress();
                }
            }
        } catch (IOException ignored) {
            // Pas de réseau
        }
        return fallback;
    }
}
