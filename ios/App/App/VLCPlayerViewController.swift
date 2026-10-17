import UIKit
import VLCKitLink

/**
 * Lecteur plein écran des films et séries sur iPhone, basé sur le moteur de VLC (MobileVLCKit).
 * Lit ce que le lecteur d'iOS refuse (.mkv, .avi, HEVC, son AC3 / DTS…) sans quitter Moovo TV.
 * Commandes : lecture / pause, ±10 s, barre de progression, pistes audio et sous-titres, fermeture.
 * À la fermeture, onClose reçoit la position et la durée (secondes) pour la reprise de lecture.
 */
final class VLCPlayerViewController: UIViewController {

    var onClose: ((_ position: Double, _ duration: Double) -> Void)?

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
    private let playButton = UIButton(type: .system)
    private let backButton = UIButton(type: .system)
    private let forwardButton = UIButton(type: .system)
    private let slider = UISlider()
    private let elapsedLabel = UILabel()
    private let remainingLabel = UILabel()
    private let spinner = UIActivityIndicatorView(style: .large)

    private var timer: Timer?
    private var hideWork: DispatchWorkItem?
    private var scrubbing = false
    private var lastTime: Double = 0
    private var lastLength: Double = 0
    private var closed = false
    private var errorShown = false

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
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .allButUpsideDown }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { .landscapeRight }

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

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        timer?.invalidate()
        timer = nil
    }

    // MARK: - Interface

    private func buildInterface() {
        videoView.translatesAutoresizingMaskIntoConstraints = false
        videoView.backgroundColor = .black
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
        func setup(_ button: UIButton, _ name: String, _ config: UIImage.SymbolConfiguration, _ label: String, _ action: Selector) {
            button.translatesAutoresizingMaskIntoConstraints = false
            button.setImage(UIImage(systemName: name, withConfiguration: config), for: .normal)
            button.tintColor = .white
            button.accessibilityLabel = label
            button.addTarget(self, action: action, for: .touchUpInside)
            overlay.addSubview(button)
        }
        setup(closeButton, "xmark", symbol, "Fermer", #selector(closeTapped))
        setup(audioButton, "speaker.wave.2", symbol, "Piste audio", #selector(audioTapped(_:)))
        setup(subtitleButton, "captions.bubble", symbol, "Sous-titres", #selector(subtitleTapped(_:)))
        setup(backButton, "gobackward.10", bigSymbol, "Reculer de 10 secondes", #selector(backTapped))
        setup(playButton, "pause.fill", bigSymbol, "Lecture ou pause", #selector(playTapped))
        setup(forwardButton, "goforward.10", bigSymbol, "Avancer de 10 secondes", #selector(forwardTapped))

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

        slider.translatesAutoresizingMaskIntoConstraints = false
        slider.minimumTrackTintColor = .white
        slider.maximumTrackTintColor = UIColor.white.withAlphaComponent(0.3)
        slider.addTarget(self, action: #selector(scrubBegan), for: .touchDown)
        slider.addTarget(self, action: #selector(scrubMoved), for: .valueChanged)
        slider.addTarget(self, action: #selector(scrubEnded), for: [.touchUpInside, .touchUpOutside, .touchCancel])
        overlay.addSubview(slider)

        let guide = view.safeAreaLayoutGuide
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

            closeButton.topAnchor.constraint(equalTo: guide.topAnchor, constant: 12),
            closeButton.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 16),
            closeButton.widthAnchor.constraint(equalToConstant: 44),
            closeButton.heightAnchor.constraint(equalToConstant: 44),

            subtitleButton.centerYAnchor.constraint(equalTo: closeButton.centerYAnchor),
            subtitleButton.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -16),
            subtitleButton.widthAnchor.constraint(equalToConstant: 44),
            subtitleButton.heightAnchor.constraint(equalToConstant: 44),

            audioButton.centerYAnchor.constraint(equalTo: closeButton.centerYAnchor),
            audioButton.trailingAnchor.constraint(equalTo: subtitleButton.leadingAnchor, constant: -8),
            audioButton.widthAnchor.constraint(equalToConstant: 44),
            audioButton.heightAnchor.constraint(equalToConstant: 44),

            titleLabel.centerYAnchor.constraint(equalTo: closeButton.centerYAnchor),
            titleLabel.leadingAnchor.constraint(equalTo: closeButton.trailingAnchor, constant: 12),
            titleLabel.trailingAnchor.constraint(lessThanOrEqualTo: audioButton.leadingAnchor, constant: -12),

            playButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            playButton.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            playButton.widthAnchor.constraint(equalToConstant: 72),
            playButton.heightAnchor.constraint(equalToConstant: 72),

            backButton.centerYAnchor.constraint(equalTo: playButton.centerYAnchor),
            backButton.trailingAnchor.constraint(equalTo: playButton.leadingAnchor, constant: -48),
            backButton.widthAnchor.constraint(equalToConstant: 64),
            backButton.heightAnchor.constraint(equalToConstant: 64),

            forwardButton.centerYAnchor.constraint(equalTo: playButton.centerYAnchor),
            forwardButton.leadingAnchor.constraint(equalTo: playButton.trailingAnchor, constant: 48),
            forwardButton.widthAnchor.constraint(equalToConstant: 64),
            forwardButton.heightAnchor.constraint(equalToConstant: 64),

            elapsedLabel.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 20),
            elapsedLabel.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -16),

            remainingLabel.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -20),
            remainingLabel.centerYAnchor.constraint(equalTo: elapsedLabel.centerYAnchor),

            slider.leadingAnchor.constraint(equalTo: elapsedLabel.trailingAnchor, constant: 12),
            slider.trailingAnchor.constraint(equalTo: remainingLabel.leadingAnchor, constant: -12),
            slider.centerYAnchor.constraint(equalTo: elapsedLabel.centerYAnchor),
        ])
        elapsedLabel.setContentHuggingPriority(.required, for: .horizontal)
        remainingLabel.setContentHuggingPriority(.required, for: .horizontal)

        let tap = UITapGestureRecognizer(target: self, action: #selector(toggleControls))
        view.addGestureRecognizer(tap)
    }

    private func showControls() {
        overlay.isHidden = false
        UIView.animate(withDuration: 0.2) { self.overlay.alpha = 1 }
        scheduleHide()
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
        if overlay.isHidden || overlay.alpha < 1 {
            showControls()
        } else {
            hideWork?.cancel()
            UIView.animate(withDuration: 0.2, animations: { self.overlay.alpha = 0 }) { _ in
                self.overlay.isHidden = true
            }
        }
    }

    // MARK: - Suivi de la lecture

    private func tick() {
        let time = Double(player.time.intValue) / 1000
        let length = Double(player.media?.length.intValue ?? 0) / 1000
        if time > 0 { lastTime = time }
        if length > 0 { lastLength = length }

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
        case .error:
            showError()
        default:
            break
        }
    }

    private func updateLabels(current: Double) {
        elapsedLabel.text = format(current)
        remainingLabel.text = lastLength > 0 ? "-" + format(max(0, lastLength - current)) : "--:--"
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
        player.jumpBackward(10)
        showControls()
    }

    @objc private func forwardTapped() {
        player.jumpForward(10)
        showControls()
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

    @objc private func audioTapped(_ sender: UIButton) {
        let names = player.audioTrackNames as? [String] ?? []
        let indexes = (player.audioTrackIndexes as? [NSNumber] ?? []).map { $0.int32Value }
        showTrackMenu(title: "Piste audio", names: names, indexes: indexes, current: player.currentAudioTrackIndex, from: sender) { [weak self] index in
            self?.player.currentAudioTrackIndex = index
        }
    }

    @objc private func subtitleTapped(_ sender: UIButton) {
        let names = player.videoSubTitlesNames as? [String] ?? []
        let indexes = (player.videoSubTitlesIndexes as? [NSNumber] ?? []).map { $0.int32Value }
        showTrackMenu(title: "Sous-titres", names: names, indexes: indexes, current: player.currentVideoSubTitleIndex, from: sender) { [weak self] index in
            self?.player.currentVideoSubTitleIndex = index
        }
    }

    private func showTrackMenu(title: String, names: [String], indexes: [Int32], current: Int32, from sender: UIButton,
                               select: @escaping (Int32) -> Void) {
        hideWork?.cancel()
        let sheet = UIAlertController(title: title, message: names.isEmpty ? "Aucune piste disponible" : nil, preferredStyle: .actionSheet)
        for (name, index) in zip(names, indexes) {
            // VLC nomme « Disable » la piste qui coupe les sous-titres ou le son
            let label = name == "Disable" ? "Désactivés" : name
            sheet.addAction(UIAlertAction(title: (index == current ? "✓ " : "") + label, style: .default) { _ in select(index) })
        }
        sheet.addAction(UIAlertAction(title: "Annuler", style: .cancel) { [weak self] _ in self?.scheduleHide() })
        // iPad : la feuille s'ouvre en bulle à partir du bouton
        sheet.popoverPresentationController?.sourceView = sender
        sheet.popoverPresentationController?.sourceRect = sender.bounds
        present(sheet, animated: true)
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

        let finish = { [onClose] in onClose?(position, duration) }
        if presentingViewController != nil {
            dismiss(animated: true, completion: finish)
        } else {
            finish()
        }
    }
}
