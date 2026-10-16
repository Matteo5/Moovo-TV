import UIKit
import WebKit
import Capacitor

/** Contrôleur principal : Capacitor, complété par le proxy natif /api/proxy (équivalent de MainActivity Android). */
class MainViewController: CAPBridgeViewController {

    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        // Capacitor a déjà inscrit son gestionnaire du schéma capacitor:// : on lui ajoute le proxy (voir ProxyAssetHandler)
        if let handler = configuration.urlSchemeHandler(forURLScheme: InstanceDescriptorDefaults.scheme) as? WebViewAssetHandler {
            object_setClass(handler, ProxyAssetHandler.self)
        } else {
            CAPLog.print("⚡️ Moovo TV : gestionnaire capacitor:// introuvable, proxy natif inactif")
        }
        return super.webView(with: frame, configuration: configuration)
    }

    override func capacitorDidLoad() {
        // Lecture vidéo : l'écran ne doit pas se mettre en veille
        UIApplication.shared.isIdleTimerDisabled = true
    }
}
