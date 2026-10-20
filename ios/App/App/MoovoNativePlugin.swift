import Foundation
import Capacitor

/** Fonctions natives pour l'interface sur iPhone / iPad (pendant iOS de MoovoNativePlugin.java). */
@objc(MoovoNativePlugin)
public class MoovoNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MoovoNativePlugin"
    public let jsName = "MoovoNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getDeviceInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playVideo", returnType: CAPPluginReturnPromise),
    ]

    @objc func getDeviceInfo(_ call: CAPPluginCall) {
        call.resolve(["television": false])
    }

    /**
     * Lit un film ou un épisode dans le lecteur VLC intégré (VLCPlayerViewController).
     * Résout à la fermeture du lecteur avec { position, duration } en secondes, et next = true
     * s'il faut enchaîner l'épisode suivant (nextTitle, proposé en fin de lecture).
     */
    @objc func playVideo(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw) else {
            call.reject("URL manquante")
            return
        }
        let title = call.getString("title") ?? ""
        let startAt = call.getDouble("startAt") ?? 0
        let nextTitle = call.getString("nextTitle")

        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("Interface indisponible")
                return
            }
            let player = VLCPlayerViewController(url: url, title: title, startAt: startAt, nextTitle: nextTitle)
            player.onClose = { position, duration, next in
                call.resolve(["position": position, "duration": duration, "next": next])
            }
            presenter.present(player, animated: true)
        }
    }
}
