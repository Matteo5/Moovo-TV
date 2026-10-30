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

    /** Lecteur de l'iPhone en cours (il survit à sa fenêtre pendant l'image dans l'image). */
    private var applePlayer: ApplePlayerController?

    /**
     * Lit un film ou un épisode : lecteur de l'iPhone (ApplePlayerController) si le format le permet,
     * sinon ou s'il renonce, lecteur VLC intégré (VLCPlayerViewController). engine = "vlc" impose VLC.
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
        let engine = call.getString("engine") ?? "auto"

        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("Interface indisponible")
                return
            }
            // Une fenêtre d'image dans l'image peut encore jouer la vidéo précédente
            self.applePlayer?.close()

            let resolve: (Double, Double, Bool) -> Void = { position, duration, next in
                call.resolve(["position": position, "duration": duration, "next": next])
            }
            let playInVLC: (Double) -> Void = { position in
                let player = VLCPlayerViewController(url: url, title: title, startAt: position, nextTitle: nextTitle)
                player.onClose = resolve
                presenter.present(player, animated: true)
            }
            guard engine != "vlc", ApplePlayerController.canTry(url) else {
                playInVLC(startAt)
                return
            }
            let player = ApplePlayerController(url: url, title: title, startAt: startAt, nextTitle: nextTitle)
            player.onClose = { [weak self] position, duration, next in
                self?.applePlayer = nil
                resolve(position, duration, next)
            }
            player.onFallback = { [weak self] position in
                self?.applePlayer = nil
                playInVLC(position)
            }
            self.applePlayer = player
            player.present(from: presenter)
        }
    }
}
