import UIKit
import AVKit
import AVFoundation

/**
 * Lecteur plein écran des films et séries avec le lecteur de l'iPhone (AVPlayerViewController) :
 * commandes d'iOS, image dans l'image, AirPlay, écran verrouillé.
 * Il ne lit ni .mkv ni .avi, ni certains sons et encodages : si le fichier ne démarre pas, onFallback demande
 * de passer sur le lecteur VLC ; si la lecture casse en cours de route, l'utilisateur choisit.
 * À la fermeture, onClose reçoit la position et la durée (secondes) pour la reprise de lecture.
 */
final class ApplePlayerController: NSObject, AVPlayerViewControllerDelegate {

    var onClose: ((_ position: Double, _ duration: Double, _ next: Bool) -> Void)?
    /** Le lecteur de l'iPhone renonce : la lecture doit reprendre ailleurs à cette position. */
    var onFallback: ((_ position: Double) -> Void)?

    /** Sans lecture au bout de ce délai, on passe sur VLC */
    private static let startTimeout: CFTimeInterval = 20
    /** Lecture bloquée depuis ce délai : on propose de continuer sur VLC */
    private static let stallTimeout: CFTimeInterval = 20
    private static let playableExtensions: Set<String> = ["mp4", "m4v", "mov", "m3u8"]

    /** Conteneurs que le lecteur de l'iPhone peut ouvrir : les autres vont directement sur VLC. */
    static func canTry(_ url: URL) -> Bool {
        playableExtensions.contains(url.pathExtension.lowercased())
    }

    private let asset: AVURLAsset
    private let item: AVPlayerItem
    private let player: AVPlayer
    private let controller = AVPlayerViewController()
    private let startAt: Double
    /** Épisode suivant (« S01 · É02 — Titre ») proposé en fin de lecture, nil pour un film */
    private let nextTitle: String?

    private weak var presenter: UIViewController?
    private let nextCard = UIView()
    private let nextButton = UIButton(type: .system)

    private var timer: Timer?
    private var observers: [NSObjectProtocol] = []
    private var loadStartedAt: CFTimeInterval = 0
    private var stalledSince: CFTimeInterval?
    private var presentationDone = false
    private var afterPresentation: (() -> Void)?
    private var preparing = false
    private var seekDone = false
    private var started = false
    private var videoSeen = false
    private var finished = false
    private var failureShown = false
    private var pipActive = false
    private var restoringFromPip = false
    private var nextDismissed = false
    private var lastTime: Double = 0
    private var lastDuration: Double = 0

    init(url: URL, title: String, startAt: Double, nextTitle: String?) {
        // Identité attendue par les fournisseurs Xtream
        asset = AVURLAsset(url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": ["User-Agent": "IPTVSmartersPro"]])
        item = AVPlayerItem(asset: asset)
        player = AVPlayer(playerItem: item)
        self.startAt = startAt
        self.nextTitle = nextTitle
        super.init()

        let metadata = AVMutableMetadataItem()
        metadata.identifier = .commonIdentifierTitle
        metadata.value = title as NSString
        metadata.extendedLanguageTag = "und"
        item.externalMetadata = [metadata]
    }

    func present(from presenter: UIViewController) {
        self.presenter = presenter
        controller.player = player
        controller.delegate = self
        controller.modalPresentationStyle = .fullScreen
        controller.allowsPictureInPicturePlayback = true
        controller.canStartPictureInPictureAutomaticallyFromInline = true
        if nextTitle != nil { buildNextCard() }

        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            guard let self = self else { return }
            self.close(next: self.wantsNext)
        })
        observers.append(center.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            self?.playbackFailed()
        })

        loadStartedAt = CACurrentMediaTime()
        let timer = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in self?.tick() }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer

        presenter.present(controller, animated: true) { [weak self] in
            guard let self = self else { return }
            self.presentationDone = true
            self.afterPresentation?()
            self.afterPresentation = nil
        }
    }

    /** Ferme le lecteur en renvoyant la position atteinte (croix d'iOS, fin du fichier, nouvelle lecture…). */
    func close(next: Bool = false) {
        leave { [weak self] in
            guard let self = self else { return }
            self.onClose?(self.lastTime, self.lastDuration, next)
        }
    }

    // MARK: - Suivi de la lecture

    private func tick() {
        guard !finished else { return }

        // La croix ou le glissement vers le bas d'iOS ont fermé le lecteur (l'image dans l'image le masque aussi)
        if presentationDone && !pipActive && controller.presentingViewController == nil {
            close()
            return
        }

        if item.status == .failed {
            playbackFailed()
            return
        }
        if item.status == .readyToPlay && !preparing {
            preparing = true
            prepare()
        }
        if !started {
            if player.timeControlStatus == .playing {
                started = true
            } else if !pausedBeforeStart && CACurrentMediaTime() - loadStartedAt > ApplePlayerController.startTimeout {
                fallBack()
                return
            }
        }

        let time = item.currentTime().seconds
        if started && time.isFinite { lastTime = time }

        // Réseau coupé en pleine lecture : iOS réessaie sans fin et sans signaler d'erreur
        if player.timeControlStatus != .waitingToPlayAtSpecifiedRate {
            stalledSince = nil
        } else if stalledSince == nil {
            stalledSince = CACurrentMediaTime()
        } else if started, let since = stalledSince, CACurrentMediaTime() - since > ApplePlayerController.stallTimeout {
            playbackFailed()
            return
        }

        let duration = item.duration.seconds
        if duration.isFinite && duration > 0 { lastDuration = duration }

        // Son lu mais image absente : encodage vidéo refusé par l'iPhone sans erreur (certains HEVC)
        if item.presentationSize != .zero {
            videoSeen = true
        } else if started && !videoSeen && lastTime - startAt > 4 {
            fallBack()
            return
        }
        updateNextCard()
    }

    /** La lecture a été mise en pause par l'utilisateur avant la première image : pas un échec. */
    private var pausedBeforeStart: Bool { seekDone && player.timeControlStatus == .paused }

    /** Fichier ouvert : on écarte ceux dont les pistes ne se liront pas, puis on lance à la bonne position. */
    private func prepare() {
        Task { @MainActor [weak self] in
            guard let self = self, await self.tracksArePlayable() else {
                self?.fallBack()
                return
            }
            guard !self.finished else { return }
            let begin: () -> Void = { [weak self] in
                self?.seekDone = true
                self?.player.play()
            }
            guard self.startAt > 1 else {
                begin()
                return
            }
            let target = CMTime(seconds: self.startAt, preferredTimescale: 600)
            let tolerance = CMTime(seconds: 2, preferredTimescale: 600)
            self.item.seek(to: target, toleranceBefore: tolerance, toleranceAfter: tolerance) { _ in
                DispatchQueue.main.async(execute: begin)
            }
        }
    }

    /** Au moins une piste vidéo et une piste son lisibles, s'il y en a (DTS dans un MP4 : aucune). HLS : pas de piste ici. */
    private func tracksArePlayable() async -> Bool {
        guard let tracks = try? await asset.load(.tracks) else { return true }
        func anyPlayable(_ list: [AVAssetTrack]) async -> Bool {
            if list.isEmpty { return true }
            for track in list where (try? await track.load(.isPlayable)) == true { return true }
            return false
        }
        let video = await anyPlayable(tracks.filter { $0.mediaType == .video })
        let audio = await anyPlayable(tracks.filter { $0.mediaType == .audio })
        return video && audio
    }

    // MARK: - Échecs

    private func playbackFailed() {
        guard !finished, !failureShown else { return }
        guard started else {
            fallBack()
            return
        }
        // Rien à proposer si le lecteur est réduit en image dans l'image : on garde la position atteinte
        guard !pipActive, controller.presentingViewController != nil else {
            close()
            return
        }
        failureShown = true
        player.pause()
        let alert = UIAlertController(
            title: "La lecture s’est interrompue",
            message: "Le lecteur de l’iPhone n’arrive pas à continuer ce fichier. Vous pouvez reprendre au même endroit avec le lecteur VLC.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Continuer avec VLC", style: .default) { [weak self] _ in self?.fallBack() })
        alert.addAction(UIAlertAction(title: "Fermer", style: .cancel) { [weak self] _ in self?.close() })
        controller.present(alert, animated: true)
    }

    private func fallBack() {
        let position = started ? lastTime : startAt
        leave { [weak self] in self?.onFallback?(position) }
    }

    // MARK: - Sortie

    /** Arrête la lecture, retire le lecteur de l'écran, puis exécute done (une seule fois). */
    private func leave(then done: @escaping () -> Void) {
        guard !finished else { return }
        finished = true
        timer?.invalidate()
        timer = nil
        player.pause()
        observers.forEach(NotificationCenter.default.removeObserver)
        observers = []

        let dismissAndFinish: () -> Void = { [weak self] in
            guard let self = self else { return }
            if self.controller.presentingViewController != nil {
                self.controller.dismiss(animated: true, completion: done)
            } else {
                done()
            }
        }
        // Échec très rapide : on attend la fin de l'animation d'ouverture avant de refermer
        if presentationDone {
            dismissAndFinish()
        } else {
            afterPresentation = dismissAndFinish
        }
    }

    // MARK: - Image dans l'image

    func playerViewControllerWillStartPictureInPicture(_ playerViewController: AVPlayerViewController) {
        pipActive = true
    }

    func playerViewController(_ playerViewController: AVPlayerViewController, failedToStartPictureInPictureWithError error: Error) {
        pipActive = false
    }

    func playerViewController(
        _ playerViewController: AVPlayerViewController,
        restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
    ) {
        guard !finished, let presenter = presenter, presenter.presentedViewController == nil else {
            completionHandler(false)
            return
        }
        restoringFromPip = true
        presenter.present(controller, animated: true) { completionHandler(true) }
    }

    func playerViewControllerDidStopPictureInPicture(_ playerViewController: AVPlayerViewController) {
        pipActive = false
        // Fenêtre fermée par sa croix (et non agrandie) : la lecture est terminée
        if !restoringFromPip { close() }
        restoringFromPip = false
    }

    // MARK: - Épisode suivant

    /** L'épisode suivant démarrera à la fin, sauf si la carte a été masquée. */
    private var wantsNext: Bool { nextTitle != nil && !nextDismissed }

    private func buildNextCard() {
        let view: UIView = controller.view
        nextCard.translatesAutoresizingMaskIntoConstraints = false
        nextCard.backgroundColor = UIColor(white: 0.08, alpha: 0.88)
        nextCard.layer.cornerRadius = 16
        nextCard.layer.borderWidth = 1
        nextCard.layer.borderColor = UIColor.white.withAlphaComponent(0.12).cgColor
        nextCard.isHidden = true
        nextCard.alpha = 0
        view.addSubview(nextCard)

        let caption = UILabel()
        caption.text = "Épisode suivant"
        caption.font = .systemFont(ofSize: 12, weight: .semibold)
        caption.textColor = UIColor.white.withAlphaComponent(0.65)

        let name = UILabel()
        name.text = nextTitle
        name.font = .systemFont(ofSize: 15, weight: .semibold)
        name.textColor = .white
        name.numberOfLines = 2

        var play = UIButton.Configuration.filled()
        play.baseBackgroundColor = .white
        play.baseForegroundColor = .black
        play.cornerStyle = .capsule
        play.image = UIImage(systemName: "play.fill", withConfiguration: UIImage.SymbolConfiguration(pointSize: 13, weight: .bold))
        play.imagePadding = 6
        nextButton.configuration = play
        nextButton.addTarget(self, action: #selector(nextTapped), for: .touchUpInside)

        var hide = UIButton.Configuration.plain()
        hide.baseForegroundColor = UIColor.white.withAlphaComponent(0.8)
        hide.title = "Masquer"
        let hideButton = UIButton(configuration: hide)
        hideButton.addTarget(self, action: #selector(dismissNextTapped), for: .touchUpInside)

        let buttons = UIStackView(arrangedSubviews: [nextButton, hideButton])
        buttons.spacing = 8
        let stack = UIStackView(arrangedSubviews: [caption, name, buttons])
        stack.axis = .vertical
        stack.alignment = .leading
        stack.spacing = 6
        stack.setCustomSpacing(12, after: name)
        stack.translatesAutoresizingMaskIntoConstraints = false
        nextCard.addSubview(stack)

        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: nextCard.topAnchor, constant: 14),
            stack.bottomAnchor.constraint(equalTo: nextCard.bottomAnchor, constant: -12),
            stack.leadingAnchor.constraint(equalTo: nextCard.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: nextCard.trailingAnchor, constant: -16),
            nextCard.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -16),
            nextCard.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -64),
            nextCard.widthAnchor.constraint(lessThanOrEqualToConstant: 320),
            nextCard.leadingAnchor.constraint(greaterThanOrEqualTo: guide.leadingAnchor, constant: 16),
        ])
    }

    /** Carte visible dans les 20 dernières secondes, avec le compte à rebours avant l'enchaînement. */
    private func updateNextCard() {
        guard nextTitle != nil else { return }
        let remaining = lastDuration - lastTime
        let visible = wantsNext && started && lastDuration > 30 && remaining <= 20
        if visible {
            var config = nextButton.configuration
            config?.title = "Lire (\(max(1, Int(remaining.rounded(.up)))))"
            nextButton.configuration = config
        }
        guard visible == nextCard.isHidden else { return }
        if visible {
            nextCard.superview?.bringSubviewToFront(nextCard)
            nextCard.isHidden = false
            UIView.animate(withDuration: 0.25) { self.nextCard.alpha = 1 }
        } else {
            UIView.animate(withDuration: 0.2, animations: { self.nextCard.alpha = 0 }) { _ in self.nextCard.isHidden = true }
        }
    }

    @objc private func nextTapped() { close(next: true) }

    @objc private func dismissNextTapped() {
        nextDismissed = true
        updateNextCard()
    }
}
