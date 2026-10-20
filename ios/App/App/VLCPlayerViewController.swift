import UIKit
import VLCKitLink

/**
 * Lecteur plein écran des films et séries sur iPhone, basé sur le moteur de VLC (MobileVLCKit).
 * Lit ce que le lecteur d'iOS refuse (.mkv, .avi, HEVC, son AC3 / DTS…) sans quitter Moovo TV.
 * Commandes : lecture / pause, ±10 s (boutons ou double-tap sur les côtés), barre de progression,
 * pistes audio et sous-titres, options (vitesse, format d'image, décalage audio et sous-titres),
 * verrouillage de l'écran, fermeture.
 * À la fermeture, onClose reçoit la position et la durée (secondes) pour la reprise de lecture.
 */
final class VLCPlayerViewController: UIViewController {

    var onClose: ((_ position: Double, _ duration: Double) -> Void)?

    private enum AspectMode: String, CaseIterable {
        case fit, fill, wide, classic

        var label: String {
            switch self {
            case .fit: return "Ajuster"
            case .fill: return "Remplir l’écran"
            case .wide: return "16:9"
            case .classic: return "4:3"
            }
        }
    }

    private static let aspectKey = "moovo.vlc.aspect"
    private static let speeds: [Float] = [0.5, 0.75, 1, 1.25, 1.5, 2]
    private static let delaySteps: [Double] = [-0.5, -0.1, 0.1, 0.5]

    private let url: URL
    private let titleText: String
    private let startAt: Double

    private let player = VLCMediaPlayer()
    private let videoView = UIView()
    private let overlay = UIView()
    private let titleLabel = UILabel()
    private let closeButton = UIButton(type: .system)
    private let audioButton = UIButton(type: .system)
    private let subtitleButton = UIButton(type: .system)
    private let optionsButton = UIButton(type: .system)
    private let playButton = UIButton(type: .system)
    private let backButton = UIButton(type: .system)
    private let forwardButton = UIButton(type: .system)
    private let lockButton = UIButton(type: .system)
    private let unlockButton = UIButton(type: .system)
    private let slider = UISlider()
    private let elapsedLabel = UILabel()
    private let remainingLabel = UILabel()
    private let hudLabel = PaddedLabel()
    private let spinner = UIActivityIndicatorView(style: .large)

    private var timer: Timer?
    private var hideWork: DispatchWorkItem?
    private var hudWork: DispatchWorkItem?
    private var unlockWork: DispatchWorkItem?
    private var scrubbing = false
    private var lastTime: Double = 0
    private var lastLength: Double = 0
    private var closed = false
    private var errorShown = false
    private var didPlay = false
    private var pendingTap: DispatchWorkItem?
    private var touchStart: (point: CGPoint, time: CFTimeInterval)?
    private var lastTapTime: CFTimeInterval = 0
    private static let doubleTapDelay: CFTimeInterval = 0.3
    private var locked = false
    private var showTotal = false
    private var aspect: AspectMode = AspectMode(rawValue: UserDefaults.standard.string(forKey: VLCPlayerViewController.aspectKey) ?? "") ?? .fit

    init(url: URL, title: String, startAt: Double) {
        self.url = url
        self.titleText = title
        self.startAt = startAt
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
        modalTransitionStyle = .crossDissolve
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) non pris en charge")
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    // Le lecteur suit l'orientation de l'iPhone. Une rotation forcée par code (requestGeometryUpdate) pivotait
    // l'affichage sans pivoter les touchers : chaque appui tombait à côté des boutons.
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .allButUpsideDown }

    // MARK: - Cycle de vie

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        buildInterface()

        player.drawable = videoView
        let media = VLCMedia(url: url)
        // Tampon réseau confortable pour les serveurs IPTV, identité attendue par les fournisseurs Xtream
        media.addOption(":network-caching=3000")
        media.addOption(":http-user-agent=IPTVSmartersPro")
        if startAt > 1 {
            media.addOption(":start-time=\(Int(startAt))")
        }
        player.media = media
        player.play()

        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.tick()
        }
        showControls()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        applyAspect()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        timer?.invalidate()
        timer = nil
    }

    override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
        super.viewWillTransition(to: size, with: coordinator)
        // « Remplir l'écran » dépend des proportions de l'écran : on recadre après la rotation
        coordinator.animate(alongsideTransition: nil) { [weak self] _ in self?.applyAspect() }
    }

    // Appuis lus directement (début / fin du toucher) : sur iPhone, le UITapGestureRecognizer posé sur la vue
    // du lecteur ne se déclenchait jamais pendant la lecture VLC, et les commandes ne pouvaient plus revenir.
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesBegan(touches, with: event)
        guard let touch = touches.first, touch.view === view else { return }
        touchStart = (touch.location(in: view), CACurrentMediaTime())
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesEnded(touches, with: event)
        guard let start = touchStart, let touch = touches.first else { return }
        touchStart = nil
        let location = touch.location(in: view)
        let moved = hypot(location.x - start.point.x, location.y - start.point.y)
        guard moved < 20, CACurrentMediaTime() - start.time < 0.6 else { return }
        handleTap(at: location)
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesCancelled(touches, with: event)
        touchStart = nil
    }

    // MARK: - Interface

    private func buildInterface() {
        videoView.translatesAutoresizingMaskIntoConstraints = false
        videoView.backgroundColor = .black
        // La vue vidéo de VLC ne reçoit aucun appui : ils remontent jusqu'au lecteur (voir touchesBegan)
        videoView.isUserInteractionEnabled = false
        view.addSubview(videoView)

        overlay.translatesAutoresizingMaskIntoConstraints = false
        overlay.backgroundColor = UIColor.black.withAlphaComponent(0.4)
        view.addSubview(overlay)

        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.color = .white
        spinner.hidesWhenStopped = true
        spinner.startAnimating()
        view.addSubview(spinner)

        let symbol = UIImage.SymbolConfiguration(pointSize: 22, weight: .semibold)
        let bigSymbol = UIImage.SymbolConfiguration(pointSize: 44, weight: .semibold)
        func setup(_ button: UIButton, _ name: String, _ config: UIImage.SymbolConfiguration, _ label: String, _ action: Selector?) {
            button.translatesAutoresizingMaskIntoConstraints = false
            button.setImage(UIImage(systemName: name, withConfiguration: config), for: .normal)
            button.tintColor = .white
            button.accessibilityLabel = label
            if let action = action { button.addTarget(self, action: action, for: .touchUpInside) }
            overlay.addSubview(button)
        }
        setup(closeButton, "xmark", symbol, "Fermer", #selector(closeTapped))
        setup(audioButton, "speaker.wave.2", symbol, "Piste audio", nil)
        setup(subtitleButton, "captions.bubble", symbol, "Sous-titres", nil)
        setup(optionsButton, "ellipsis.circle", symbol, "Options de lecture", nil)
        setup(backButton, "gobackward.10", bigSymbol, "Reculer de 10 secondes", #selector(backTapped))
        setup(playButton, "pause.fill", bigSymbol, "Lecture ou pause", #selector(playTapped))
        setup(forwardButton, "goforward.10", bigSymbol, "Avancer de 10 secondes", #selector(forwardTapped))
        setup(lockButton, "lock.open", symbol, "Verrouiller l’écran", #selector(lockTapped))

        // Menus natifs, reconstruits à chaque ouverture (pistes connues seulement une fois la lecture lancée)
        audioButton.menu = UIMenu(children: [UIDeferredMenuElement.uncached { [weak self] done in done(self?.audioMenuItems() ?? []) }])
        subtitleButton.menu = UIMenu(children: [UIDeferredMenuElement.uncached { [weak self] done in done(self?.subtitleMenuItems() ?? []) }])
        optionsButton.menu = UIMenu(children: [UIDeferredMenuElement.uncached { [weak self] done in done(self?.optionsMenuItems() ?? []) }])
        for button in [audioButton, subtitleButton, optionsButton] {
            button.showsMenuAsPrimaryAction = true
            button.addAction(UIAction { [weak self] _ in self?.hideWork?.cancel() }, for: .menuActionTriggered)
        }

        // Écran verrouillé : seul ce cadenas reste accessible
        unlockButton.translatesAutoresizingMaskIntoConstraints = false
        unlockButton.setImage(UIImage(systemName: "lock.fill", withConfiguration: symbol), for: .normal)
        unlockButton.tintColor = .white
        unlockButton.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        unlockButton.layer.cornerRadius = 26
        unlockButton.accessibilityLabel = "Déverrouiller l’écran"
        unlockButton.addTarget(self, action: #selector(unlockTapped), for: .touchUpInside)
        unlockButton.isHidden = true
        view.addSubview(unlockButton)

        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.text = titleText
        titleLabel.textColor = .white
        titleLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        titleLabel.lineBreakMode = .byTruncatingTail
        overlay.addSubview(titleLabel)

        for label in [elapsedLabel, remainingLabel] {
            label.translatesAutoresizingMaskIntoConstraints = false
            label.textColor = .white
            label.font = .monospacedDigitSystemFont(ofSize: 13, weight: .medium)
            label.text = "--:--"
            overlay.addSubview(label)
        }
        // Toucher le temps restant affiche la durée totale (et inversement)
        remainingLabel.isUserInteractionEnabled = true
        remainingLabel.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(toggleTimeDisplay)))

        hudLabel.translatesAutoresizingMaskIntoConstraints = false
        hudLabel.textColor = .white
        hudLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        hudLabel.backgroundColor = UIColor.black.withAlphaComponent(0.6)
        hudLabel.layer.cornerRadius = 12
        hudLabel.clipsToBounds = true
        hudLabel.alpha = 0
        view.addSubview(hudLabel)

        slider.translatesAutoresizingMaskIntoConstraints = false
        slider.minimumTrackTintColor = .white
        slider.maximumTrackTintColor = UIColor.white.withAlphaComponent(0.3)
        slider.addTarget(self, action: #selector(scrubBegan), for: .touchDown)
        slider.addTarget(self, action: #selector(scrubMoved), for: .valueChanged)
        slider.addTarget(self, action: #selector(scrubEnded), for: [.touchUpInside, .touchUpOutside, .touchCancel])
        overlay.addSubview(slider)

        let guide = view.safeAreaLayoutGuide
        func square(_ v: UIView, _ side: CGFloat) -> [NSLayoutConstraint] {
            [v.widthAnchor.constraint(equalToConstant: side), v.heightAnchor.constraint(equalToConstant: side)]
        }
        NSLayoutConstraint.activate([
            videoView.topAnchor.constraint(equalTo: view.topAnchor),
            videoView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            videoView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            videoView.trailingAnchor.constraint(equalTo: view.trailingAnchor),

            overlay.topAnchor.constraint(equalTo: view.topAnchor),
            overlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            overlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),

            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor),

            hudLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            hudLabel.topAnchor.constraint(equalTo: guide.topAnchor, constant: 72),

            closeButton.topAnchor.constraint(equalTo: guide.topAnchor, constant: 12),
            closeButton.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 16),

            optionsButton.centerYAnchor.constraint(equalTo: closeButton.centerYAnchor),
            optionsButton.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -16),

            subtitleButton.centerYAnchor.constraint(equalTo: closeButton.centerYAnchor),
            subtitleButton.trailingAnchor.constraint(equalTo: optionsButton.leadingAnchor, constant: -8),

            audioButton.centerYAnchor.constraint(equalTo: closeButton.centerYAnchor),
            audioButton.trailingAnchor.constraint(equalTo: subtitleButton.leadingAnchor, constant: -8),

            titleLabel.centerYAnchor.constraint(equalTo: closeButton.centerYAnchor),
            titleLabel.leadingAnchor.constraint(equalTo: closeButton.trailingAnchor, constant: 12),
            titleLabel.trailingAnchor.constraint(lessThanOrEqualTo: audioButton.leadingAnchor, constant: -12),

            playButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            playButton.centerYAnchor.constraint(equalTo: view.centerYAnchor),

            backButton.centerYAnchor.constraint(equalTo: playButton.centerYAnchor),
            backButton.trailingAnchor.constraint(equalTo: playButton.leadingAnchor, constant: -48),

            forwardButton.centerYAnchor.constraint(equalTo: playButton.centerYAnchor),
            forwardButton.leadingAnchor.constraint(equalTo: playButton.trailingAnchor, constant: 48),

            lockButton.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 16),
            lockButton.bottomAnchor.constraint(equalTo: elapsedLabel.topAnchor, constant: -12),

            unlockButton.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 16),
            unlockButton.centerYAnchor.constraint(equalTo: lockButton.centerYAnchor),

            elapsedLabel.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 20),
            elapsedLabel.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -16),

            remainingLabel.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -20),
            remainingLabel.centerYAnchor.constraint(equalTo: elapsedLabel.centerYAnchor),

            slider.leadingAnchor.constraint(equalTo: elapsedLabel.trailingAnchor, constant: 12),
            slider.trailingAnchor.constraint(equalTo: remainingLabel.leadingAnchor, constant: -12),
            slider.centerYAnchor.constraint(equalTo: elapsedLabel.centerYAnchor),
        ]
            + [closeButton, audioButton, subtitleButton, optionsButton, lockButton].flatMap { square($0, 44) }
            + square(unlockButton, 52)
            + square(playButton, 72) + square(backButton, 64) + square(forwardButton, 64))
        elapsedLabel.setContentHuggingPriority(.required, for: .horizontal)
        remainingLabel.setContentHuggingPriority(.required, for: .horizontal)

        // Double-tap : côtés = ±10 s, centre = Ajuster / Remplir ; simple tap = afficher ou masquer les commandes
    }

    private func showControls() {
        guard !locked else { return }
        overlay.isHidden = false
        UIView.animate(withDuration: 0.2) { self.overlay.alpha = 1 }
        scheduleHide()
    }

    private func hideControls() {
        hideWork?.cancel()
        UIView.animate(withDuration: 0.2, animations: { self.overlay.alpha = 0 }) { _ in
            self.overlay.isHidden = true
        }
    }

    private func scheduleHide() {
        hideWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self = self, self.player.isPlaying, !self.scrubbing else { return }
            UIView.animate(withDuration: 0.3, animations: { self.overlay.alpha = 0 }) { _ in
                self.overlay.isHidden = true
            }
        }
        hideWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 4, execute: work)
    }

    @objc private func toggleControls() {
        if locked {
            flashUnlockButton()
        } else if overlay.isHidden || overlay.alpha < 1 {
            showControls()
        } else {
            hideControls()
        }
    }

    /** Message bref au centre haut de l'écran (« +10 s », « Vitesse 1,5× »…). */
    private func showHud(_ text: String) {
        hudWork?.cancel()
        hudLabel.text = text
        UIView.animate(withDuration: 0.15) { self.hudLabel.alpha = 1 }
        let work = DispatchWorkItem { [weak self] in
            UIView.animate(withDuration: 0.3) { self?.hudLabel.alpha = 0 }
        }
        hudWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2, execute: work)
    }

    // MARK: - Suivi de la lecture

    private func tick() {
        let time = Double(player.time.intValue) / 1000
        let length = Double(player.media?.length.intValue ?? 0) / 1000
        if time > 0 { lastTime = time }
        if length > 0 { lastLength = length }

        // La sortie vidéo de VLC accroche un UITapGestureRecognizer à notre vue (menus DVD) : on le retire
        for recognizer in view.gestureRecognizers ?? [] { view.removeGestureRecognizer(recognizer) }
        if player.isPlaying { didPlay = true }
        if player.isPlaying || player.state == .paused {
            spinner.stopAnimating()
        } else if player.state == .opening || player.state == .buffering {
            spinner.startAnimating()
        }

        if !scrubbing {
            if lastLength > 0 { slider.value = Float(lastTime / lastLength) }
            updateLabels(current: lastTime)
        }
        let icon = player.isPlaying ? "pause.fill" : "play.fill"
        playButton.setImage(UIImage(systemName: icon, withConfiguration: UIImage.SymbolConfiguration(pointSize: 44, weight: .semibold)), for: .normal)

        switch player.state {
        case .ended:
            close()
        case .stopped where didPlay && lastLength > 0 && lastTime >= lastLength - 3:
            // Fin du fichier vue en « stopped » (l'état « ended » peut passer entre deux relevés) : uniquement près de la fin
            close()
        case .error:
            showError()
        default:
            break
        }
    }

    private func updateLabels(current: Double) {
        elapsedLabel.text = format(current)
        if lastLength <= 0 {
            remainingLabel.text = "--:--"
        } else {
            remainingLabel.text = showTotal ? format(lastLength) : "-" + format(max(0, lastLength - current))
        }
    }

    private func format(_ seconds: Double) -> String {
        let total = Int(seconds.rounded(.down))
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%02d:%02d", m, s)
    }

    private func showError() {
        guard !errorShown else { return }
        errorShown = true
        spinner.stopAnimating()
        let alert = UIAlertController(
            title: "Lecture impossible",
            message: "Ce fichier ne répond pas. Il est peut-être indisponible ou votre abonnement a atteint sa limite de connexions.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Fermer", style: .default) { [weak self] _ in self?.close() })
        present(alert, animated: true)
    }

    // MARK: - Actions

    @objc private func closeTapped() { close() }


    @objc private func playTapped() {
        if player.isPlaying { player.pause() } else { player.play() }
        showControls()
    }

    @objc private func backTapped() {
        seek(by: -10)
        showControls()
    }

    @objc private func forwardTapped() {
        seek(by: 10)
        showControls()
    }

    private func seek(by seconds: Int32) {
        if seconds < 0 { player.jumpBackward(-seconds) } else { player.jumpForward(seconds) }
        lastTime = max(0, min(lastLength > 0 ? lastLength : .greatestFiniteMagnitude, lastTime + Double(seconds)))
        updateLabels(current: lastTime)
    }

    /** Simple appui = afficher / masquer les commandes ; deux appuis rapprochés = double-tap. */
    private func handleTap(at location: CGPoint) {
        // Écran verrouillé : le cadenas apparaît tout de suite, sans attendre un éventuel double-tap
        if locked { return flashUnlockButton() }
        let now = CACurrentMediaTime()
        if let pending = pendingTap, now - lastTapTime < Self.doubleTapDelay {
            pending.cancel()
            pendingTap = nil
            lastTapTime = 0
            handleDoubleTap(at: location)
            return
        }
        lastTapTime = now
        let work = DispatchWorkItem { [weak self] in
            self?.pendingTap = nil
            self?.toggleControls()
        }
        pendingTap = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.doubleTapDelay, execute: work)
    }

    private func handleDoubleTap(at location: CGPoint) {
        guard !locked else { return flashUnlockButton() }
        let x = location.x
        let width = view.bounds.width
        if x < width / 3 {
            seek(by: -10)
            showHud("−10 s")
        } else if x > width * 2 / 3 {
            seek(by: 10)
            showHud("+10 s")
        } else {
            setAspect(aspect == .fill ? .fit : .fill)
        }
    }

    @objc private func toggleTimeDisplay() {
        showTotal.toggle()
        updateLabels(current: lastTime)
        scheduleHide()
    }

    @objc private func scrubBegan() {
        scrubbing = true
        hideWork?.cancel()
    }

    @objc private func scrubMoved() {
        updateLabels(current: Double(slider.value) * lastLength)
    }

    @objc private func scrubEnded() {
        player.position = slider.value
        lastTime = Double(slider.value) * lastLength
        scrubbing = false
        scheduleHide()
    }

    // MARK: - Verrouillage

    @objc private func lockTapped() {
        locked = true
        hideControls()
        flashUnlockButton()
    }

    @objc private func unlockTapped() {
        locked = false
        unlockWork?.cancel()
        unlockButton.isHidden = true
        showControls()
    }

    private func flashUnlockButton() {
        unlockWork?.cancel()
        unlockButton.isHidden = false
        unlockButton.alpha = 1
        let work = DispatchWorkItem { [weak self] in
            UIView.animate(withDuration: 0.3, animations: { self?.unlockButton.alpha = 0 }) { _ in
                if self?.locked == true { self?.unlockButton.isHidden = true }
            }
        }
        unlockWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5, execute: work)
    }

    // MARK: - Format d'image

    private func setAspect(_ mode: AspectMode) {
        aspect = mode
        UserDefaults.standard.set(mode.rawValue, forKey: Self.aspectKey)
        applyAspect()
        showHud("Format : \(mode.label)")
    }

    private func applyAspect() {
        let size = view.bounds.size
        var ratio: String?
        var crop: String?
        switch aspect {
        case .fit: break
        case .fill where size.width > 0 && size.height > 0:
            crop = "\(Int(size.width.rounded())):\(Int(size.height.rounded()))"
        case .fill: break
        case .wide: ratio = "16:9"
        case .classic: ratio = "4:3"
        }
        // VLC recopie ces chaînes C : on libère notre copie juste après
        withCString(ratio) { player.videoAspectRatio = $0 }
        withCString(crop) { player.videoCropGeometry = $0 }
    }

    private func withCString(_ value: String?, _ body: (UnsafeMutablePointer<CChar>?) -> Void) {
        guard let value = value, let pointer = strdup(value) else { return body(nil) }
        body(pointer)
        free(pointer)
    }

    // MARK: - Menus

    private func audioMenuItems() -> [UIMenuElement] {
        let names = player.audioTrackNames as? [String] ?? []
        let indexes = (player.audioTrackIndexes as? [NSNumber] ?? []).map { $0.int32Value }
        return trackItems(names: names, indexes: indexes, current: player.currentAudioTrackIndex) { [weak self] index in
            self?.player.currentAudioTrackIndex = index
        }
    }

    private func subtitleMenuItems() -> [UIMenuElement] {
        let names = player.videoSubTitlesNames as? [String] ?? []
        let indexes = (player.videoSubTitlesIndexes as? [NSNumber] ?? []).map { $0.int32Value }
        return trackItems(names: names, indexes: indexes, current: player.currentVideoSubTitleIndex) { [weak self] index in
            self?.player.currentVideoSubTitleIndex = index
        }
    }

    private func trackItems(names: [String], indexes: [Int32], current: Int32, select: @escaping (Int32) -> Void) -> [UIMenuElement] {
        guard !names.isEmpty else {
            return [UIAction(title: "Aucune piste disponible", attributes: .disabled) { _ in }]
        }
        return zip(names, indexes).map { name, index in
            // VLC nomme « Disable » la piste qui coupe les sous-titres ou le son
            let label = name == "Disable" ? "Désactivés" : name
            return UIAction(title: label, state: index == current ? .on : .off) { [weak self] _ in
                select(index)
                self?.scheduleHide()
            }
        }
    }

    private func optionsMenuItems() -> [UIMenuElement] {
        let speedItems = Self.speeds.map { speed in
            UIAction(title: speedLabel(speed), state: abs(player.rate - speed) < 0.01 ? .on : .off) { [weak self] _ in
                self?.player.rate = speed
                self?.showHud("Vitesse \(self?.speedLabel(speed) ?? "")")
                self?.scheduleHide()
            }
        }
        let aspectItems = AspectMode.allCases.map { mode in
            UIAction(title: mode.label, state: mode == aspect ? .on : .off) { [weak self] _ in
                self?.setAspect(mode)
                self?.scheduleHide()
            }
        }
        let audioDelay = Double(player.currentAudioPlaybackDelay) / 1_000_000
        let subtitleDelay = Double(player.currentVideoSubTitleDelay) / 1_000_000
        return [
            UIMenu(title: "Vitesse", subtitle: speedLabel(player.rate), image: UIImage(systemName: "speedometer"), children: speedItems),
            UIMenu(title: "Format d’image", subtitle: aspect.label, image: UIImage(systemName: "aspectratio"), children: aspectItems),
            UIMenu(title: "Décalage audio", subtitle: delayLabel(audioDelay), image: UIImage(systemName: "waveform"),
                   children: delayItems(current: audioDelay) { [weak self] value in
                       self?.player.currentAudioPlaybackDelay = Int(value * 1_000_000)
                       self?.showHud("Audio \(self?.delayLabel(value) ?? "")")
                   }),
            UIMenu(title: "Décalage des sous-titres", subtitle: delayLabel(subtitleDelay), image: UIImage(systemName: "captions.bubble"),
                   children: delayItems(current: subtitleDelay) { [weak self] value in
                       self?.player.currentVideoSubTitleDelay = Int(value * 1_000_000)
                       self?.showHud("Sous-titres \(self?.delayLabel(value) ?? "")")
                   }),
        ]
    }

    private func delayItems(current: Double, apply: @escaping (Double) -> Void) -> [UIMenuElement] {
        var items: [UIMenuElement] = Self.delaySteps.map { step in
            UIAction(title: (step > 0 ? "+" : "−") + formatSeconds(abs(step))) { [weak self] _ in
                apply(((current + step) * 10).rounded() / 10)
                self?.scheduleHide()
            }
        }
        items.append(UIAction(title: "Réinitialiser", attributes: current == 0 ? .disabled : []) { [weak self] _ in
            apply(0)
            self?.scheduleHide()
        })
        return items
    }

    private func speedLabel(_ speed: Float) -> String {
        speed == 1 ? "Normale" : formatNumber(Double(speed)) + "×"
    }

    private func delayLabel(_ seconds: Double) -> String {
        if abs(seconds) < 0.05 { return "Aucun" }
        return (seconds > 0 ? "+" : "−") + formatSeconds(abs(seconds))
    }

    private func formatSeconds(_ seconds: Double) -> String { formatNumber(seconds) + " s" }

    private func formatNumber(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 2
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }

    // MARK: - Fermeture

    private func close() {
        guard !closed else { return }
        closed = true
        timer?.invalidate()
        timer = nil
        hideWork?.cancel()

        let position = lastTime
        let duration = lastLength
        // L'arrêt de VLC peut bloquer quelques instants sur un flux réseau : hors du fil principal,
        // en gardant lecteur et vue vivants jusqu'au bout (libérés ensuite sur le fil principal)
        let mediaPlayer = player
        let drawable = videoView
        DispatchQueue.global(qos: .userInitiated).async {
            mediaPlayer.stop()
            DispatchQueue.main.async { _ = (mediaPlayer, drawable) }
        }

        let finish: () -> Void = { [onClose] in onClose?(position, duration) }
        if presentingViewController != nil {
            dismiss(animated: true, completion: finish)
        } else {
            finish()
        }
    }
}

/** Étiquette avec marges intérieures, pour la bulle d'information du lecteur. */
private final class PaddedLabel: UILabel {
    private let insets = UIEdgeInsets(top: 8, left: 14, bottom: 8, right: 14)

    override func drawText(in rect: CGRect) {
        super.drawText(in: rect.inset(by: insets))
    }

    override var intrinsicContentSize: CGSize {
        let size = super.intrinsicContentSize
        return CGSize(width: size.width + insets.left + insets.right, height: size.height + insets.top + insets.bottom)
    }
}
