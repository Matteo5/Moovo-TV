import Foundation
import WebKit
import Capacitor

/**
 * Proxy natif de Moovo-TV pour iOS : équivalent Swift de server/proxy.ts et de NativeProxy.java.
 *
 * Les requêtes de la WebView vers capacitor://localhost/api/proxy?url=...[&mac=...][&token=...]
 * sont relayées ici par URLSession, hors contraintes CORS :
 *  - réponse diffusée en continu (flux MPEG-TS en direct sans fin) ;
 *  - en-tête Range relayé (avance rapide des films) ;
 *  - playlists HLS réécrites pour que segments, clés et sous-playlists repassent par le proxy ;
 *  - user-agents IPTV (IPTV Smarters, décodeur MAG pour les portails Stalker) ;
 *  - POST relayés avec leur corps (contrairement à Android).
 *
 * Tout s'exécute sur le fil principal (file de délégués d'URLSession = file principale) :
 * WebKit exige que les WKURLSchemeTask soient manipulées depuis ce fil, et aucun verrou n'est nécessaire.
 */
final class NativeProxy: NSObject, URLSessionDataDelegate {

    static let shared = NativeProxy()

    private static let requestTimeout: TimeInterval = 30
    private static let maxPlaylistBytes = 8 * 1024 * 1024

    private static let stbUserAgent =
        "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3"
    private static let defaultUserAgent = "IPTVSmartersPro"

    // swiftlint:disable:next force_try
    private static let uriAttribute = try! NSRegularExpression(pattern: "URI=\"([^\"]+)\"")

    /** Requête en cours : la tâche WebKit à alimenter et ce qu'il faut pour réécrire les playlists. */
    private final class Exchange {
        let schemeTask: WKURLSchemeTask
        let method: String
        let mac: String?
        let token: String?
        var headersSent = false
        var buffering = false
        var buffer = Data()
        var status = 200
        var contentType = ""
        var finalUrl: URL

        init(schemeTask: WKURLSchemeTask, method: String, mac: String?, token: String?, target: URL) {
            self.schemeTask = schemeTask
            self.method = method
            self.mac = mac
            self.token = token
            self.finalUrl = target
        }
    }

    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = NativeProxy.requestTimeout
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.urlCache = nil
        // Le cookie MAG est posé à la main : URLSession ne doit pas le remplacer
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        // Multiview : plusieurs flux simultanés vers le même fournisseur
        config.httpMaximumConnectionsPerHost = 12
        return URLSession(configuration: config, delegate: self, delegateQueue: OperationQueue.main)
    }()

    private var exchanges: [Int: Exchange] = [:]
    private var tasksBySchemeTask: [ObjectIdentifier: URLSessionDataTask] = [:]

    static func isProxyRequest(_ url: URL) -> Bool {
        return url.host == "localhost" && url.path == "/api/proxy"
    }

    // MARK: - Entrées WebKit

    func start(_ schemeTask: WKURLSchemeTask) {
        let request = schemeTask.request
        let method = (request.httpMethod ?? "GET").uppercased()

        if method == "OPTIONS" {
            respond(schemeTask, status: 204, headers: corsHeaders(), body: Data())
            return
        }

        guard let url = request.url,
              let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else {
            jsonError(schemeTask, status: 400, message: "Paramètre url manquant.")
            return
        }
        func param(_ name: String) -> String? {
            guard let value = query.first(where: { $0.name == name })?.value, !value.isEmpty else { return nil }
            return value
        }

        guard let rawTarget = param("url") else {
            jsonError(schemeTask, status: 400, message: "Paramètre url manquant.")
            return
        }
        guard rawTarget.hasPrefix("http://") || rawTarget.hasPrefix("https://") else {
            jsonError(schemeTask, status: 400, message: "Seuls les protocoles http et https sont acceptés.")
            return
        }
        guard let target = URL(string: rawTarget)
                ?? rawTarget.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed).flatMap({ URL(string: $0) }) else {
            jsonError(schemeTask, status: 400, message: "URL invalide.")
            return
        }

        let mac = param("mac")
        let token = param("token")
        let upstreamMethod = method == "POST" ? "POST" : method == "HEAD" ? "HEAD" : "GET"

        var upstream = URLRequest(url: target)
        upstream.httpMethod = upstreamMethod
        upstream.setValue(mac != nil ? NativeProxy.stbUserAgent : NativeProxy.defaultUserAgent, forHTTPHeaderField: "User-Agent")
        upstream.setValue("*/*", forHTTPHeaderField: "Accept")
        // Pas de compression : la taille annoncée doit correspondre au corps (requêtes Range)
        upstream.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
        if let mac = mac {
            upstream.setValue("mac=\(mac); stb_lang=en; timezone=Europe%2FParis", forHTTPHeaderField: "Cookie")
            upstream.setValue("Model: MAG250; Link: Ethernet", forHTTPHeaderField: "X-User-Agent")
        }
        if let token = token {
            upstream.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let range = request.value(forHTTPHeaderField: "Range") {
            upstream.setValue(range, forHTTPHeaderField: "Range")
        }
        if upstreamMethod == "POST" {
            if let contentType = request.value(forHTTPHeaderField: "Content-Type") {
                upstream.setValue(contentType, forHTTPHeaderField: "Content-Type")
            }
            upstream.httpBody = requestBody(of: request)
        }

        let dataTask = session.dataTask(with: upstream)
        exchanges[dataTask.taskIdentifier] = Exchange(schemeTask: schemeTask, method: upstreamMethod, mac: mac, token: token, target: target)
        tasksBySchemeTask[ObjectIdentifier(schemeTask as AnyObject)] = dataTask
        dataTask.resume()
    }

    /** Appelé par WebKit quand la page n'a plus besoin de la réponse (zapping, fermeture du lecteur). */
    func stop(_ schemeTask: WKURLSchemeTask) {
        guard let dataTask = tasksBySchemeTask.removeValue(forKey: ObjectIdentifier(schemeTask as AnyObject)) else { return }
        // Plus aucun appel autorisé sur la tâche WebKit : on oublie l'échange avant d'annuler
        exchanges.removeValue(forKey: dataTask.taskIdentifier)
        dataTask.cancel()
    }

    // MARK: - URLSessionDataDelegate

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        // Conserve user-agent, cookie MAG, jeton et Range d'une redirection à l'autre (http ↔ https compris)
        var redirected = request
        task.originalRequest?.allHTTPHeaderFields?.forEach { name, value in
            if redirected.value(forHTTPHeaderField: name) == nil {
                redirected.setValue(value, forHTTPHeaderField: name)
            }
        }
        completionHandler(redirected)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let exchange = exchanges[dataTask.taskIdentifier] else {
            completionHandler(.cancel)
            return
        }
        let http = response as? HTTPURLResponse
        exchange.status = http?.statusCode ?? 200
        exchange.contentType = http?.value(forHTTPHeaderField: "Content-Type") ?? ""
        exchange.finalUrl = response.url ?? exchange.finalUrl

        let expected = response.expectedContentLength
        if exchange.method != "HEAD", exchange.status < 400,
           NativeProxy.looksLikePlaylist(exchange.finalUrl, exchange.contentType),
           expected <= Int64(NativeProxy.maxPlaylistBytes) {
            // Playlist : lue en entier puis réécrite à la fin du téléchargement
            exchange.buffering = true
        } else {
            sendStreamHeaders(exchange, from: http)
        }
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let exchange = exchanges[dataTask.taskIdentifier] else { return }
        if exchange.buffering {
            exchange.buffer.append(data)
            if exchange.buffer.count > NativeProxy.maxPlaylistBytes {
                // Trop gros pour une playlist : on bascule en diffusion continue, sans réécriture
                exchange.buffering = false
                sendStreamHeaders(exchange, from: dataTask.response as? HTTPURLResponse)
                exchange.schemeTask.didReceive(exchange.buffer)
                exchange.buffer = Data()
            }
            return
        }
        exchange.schemeTask.didReceive(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let exchange = exchanges.removeValue(forKey: task.taskIdentifier) else { return }
        tasksBySchemeTask.removeValue(forKey: ObjectIdentifier(exchange.schemeTask as AnyObject))
        let schemeTask = exchange.schemeTask

        if let error = error {
            if exchange.headersSent {
                schemeTask.didFailWithError(error)
            } else if (error as? URLError)?.code == .timedOut {
                jsonError(schemeTask, status: 504, message: "Le serveur distant ne répond pas (délai dépassé).")
            } else {
                let code = (error as? URLError).map { "URLError \($0.code.rawValue)" } ?? "erreur réseau"
                jsonError(schemeTask, status: 502, message: "Échec de connexion au serveur (\(code)).")
            }
            return
        }

        if exchange.buffering {
            var body = exchange.buffer
            var mime = NativeProxy.mimeOf(exchange.contentType)
            if mime.isEmpty { mime = "application/vnd.apple.mpegurl" }
            var contentType = exchange.contentType.isEmpty ? mime : exchange.contentType
            if let text = String(data: body, encoding: .utf8) ?? String(data: body, encoding: .isoLatin1),
               text.contains("#EXT-X-") {
                body = Data(rewriteHlsPlaylist(text, base: exchange.finalUrl, mac: exchange.mac, token: exchange.token).utf8)
                contentType = "\(mime); charset=utf-8"
            }
            var headers = corsHeaders()
            headers["Cache-Control"] = "no-store"
            headers["Content-Type"] = contentType
            respond(schemeTask, status: exchange.status, headers: headers, body: body)
            return
        }

        if !exchange.headersSent {
            sendStreamHeaders(exchange, from: task.response as? HTTPURLResponse)
        }
        schemeTask.didFinish()
    }

    // MARK: - Réponses

    private func sendStreamHeaders(_ exchange: Exchange, from upstream: HTTPURLResponse?) {
        var headers = corsHeaders()
        headers["Cache-Control"] = "no-store"
        headers["Content-Type"] = exchange.contentType.isEmpty ? "application/octet-stream" : exchange.contentType
        let compressed = upstream?.value(forHTTPHeaderField: "Content-Encoding").map { $0 != "identity" } ?? false
        for name in ["Content-Range", "Accept-Ranges", "Content-Length", "Last-Modified", "ETag"] {
            // URLSession décompresse lui-même : la taille annoncée ne correspondrait plus au corps
            if name == "Content-Length" && compressed { continue }
            if let value = upstream?.value(forHTTPHeaderField: name) { headers[name] = value }
        }
        exchange.headersSent = true
        exchange.schemeTask.didReceive(httpResponse(for: exchange.schemeTask, status: exchange.status, headers: headers))
    }

    private func respond(_ schemeTask: WKURLSchemeTask, status: Int, headers: [String: String], body: Data) {
        var headers = headers
        headers["Content-Length"] = String(body.count)
        schemeTask.didReceive(httpResponse(for: schemeTask, status: status, headers: headers))
        if !body.isEmpty { schemeTask.didReceive(body) }
        schemeTask.didFinish()
    }

    private func jsonError(_ schemeTask: WKURLSchemeTask, status: Int, message: String) {
        let payload: [String: String] = ["error": message, "code": ""]
        let body = (try? JSONSerialization.data(withJSONObject: payload)) ?? Data()
        var headers = corsHeaders()
        headers["Content-Type"] = "application/json; charset=utf-8"
        respond(schemeTask, status: status, headers: headers, body: body)
    }

    private func httpResponse(for schemeTask: WKURLSchemeTask, status: Int, headers: [String: String]) -> HTTPURLResponse {
        let url = schemeTask.request.url ?? URL(string: "capacitor://localhost/api/proxy")!
        return HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
    }

    private func corsHeaders() -> [String: String] {
        return [
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
        ]
    }

    // MARK: - Outils

    /** Corps d'une requête POST de la page (WebKit le fournit en bloc ou en flux selon sa taille). */
    private func requestBody(of request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        var data = Data()
        stream.open()
        defer { stream.close() }
        var buffer = [UInt8](repeating: 0, count: 16 * 1024)
        while stream.hasBytesAvailable {
            let read = stream.read(&buffer, maxLength: buffer.count)
            if read <= 0 { break }
            data.append(buffer, count: read)
        }
        return data
    }

    /** Réécrit chaque URI d'une playlist HLS en URL absolue repassant par le proxy. */
    func rewriteHlsPlaylist(_ body: String, base: URL, mac: String?, token: String?) -> String {
        let lines = body.components(separatedBy: "\n")
        return lines.map { rawLine -> String in
            let line = rawLine.hasSuffix("\r") ? String(rawLine.dropLast()) : rawLine
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty { return line }
            if trimmed.hasPrefix("#") {
                let mutable = NSMutableString(string: line)
                let matches = NativeProxy.uriAttribute.matches(in: line, range: NSRange(location: 0, length: mutable.length))
                for match in matches.reversed() {
                    let uri = mutable.substring(with: match.range(at: 1))
                    mutable.replaceCharacters(in: match.range, with: "URI=\"\(proxied(uri, base: base, mac: mac, token: token))\"")
                }
                return mutable as String
            }
            return proxied(trimmed, base: base, mac: mac, token: token)
        }.joined(separator: "\n")
    }

    private func proxied(_ uri: String, base: URL, mac: String?, token: String?) -> String {
        guard let absolute = URL(string: uri, relativeTo: base)?.absoluteString else { return uri }
        var result = "/api/proxy?url=\(NativeProxy.encodeComponent(absolute))"
        if let mac = mac { result += "&mac=\(NativeProxy.encodeComponent(mac))" }
        if let token = token { result += "&token=\(NativeProxy.encodeComponent(token))" }
        return result
    }

    /** Même encodage qu'encodeURIComponent côté JavaScript. */
    private static let componentAllowed: CharacterSet = {
        var set = CharacterSet.alphanumerics
        set.insert(charactersIn: "-_.!~*'()")
        return set
    }()

    private static func encodeComponent(_ value: String) -> String {
        return value.addingPercentEncoding(withAllowedCharacters: componentAllowed) ?? value
    }

    private static func looksLikePlaylist(_ url: URL, _ contentType: String) -> Bool {
        if contentType.lowercased().contains("mpegurl") { return true }
        let path = url.path.lowercased()
        return path.hasSuffix(".m3u8") || path.hasSuffix(".m3u")
    }

    private static func mimeOf(_ contentType: String) -> String {
        return contentType.split(separator: ";", maxSplits: 1).first.map { $0.trimmingCharacters(in: .whitespaces) } ?? ""
    }
}

/**
 * Gestionnaire du schéma capacitor:// de Capacitor, complété par /api/proxy.
 * Capacitor crée lui-même son WebViewAssetHandler sans point d'extension : MainViewController
 * change la classe de cette instance en ProxyAssetHandler (aucune propriété ajoutée, donc sans risque).
 */
final class ProxyAssetHandler: WebViewAssetHandler {

    override func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        if let url = urlSchemeTask.request.url, NativeProxy.isProxyRequest(url) {
            NativeProxy.shared.start(urlSchemeTask)
            return
        }
        super.webView(webView, start: urlSchemeTask)
    }

    override func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        if let url = urlSchemeTask.request.url, NativeProxy.isProxyRequest(url) {
            NativeProxy.shared.stop(urlSchemeTask)
            return
        }
        super.webView(webView, stop: urlSchemeTask)
    }
}
