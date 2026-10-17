// swift-tools-version: 5.9
import PackageDescription

// Moteur de lecture VLC (MobileVLCKit officiel de VideoLAN) pour les formats que l'iPhone ne lit pas (.mkv, .avi…).
// Le framework (plusieurs centaines de Mo) n'est pas versionné : scripts/fetch-vlckit.sh le télécharge ici.
let package = Package(
    name: "VLCKit",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "VLCKitLink", targets: ["VLCKitLink"])
    ],
    targets: [
        .binaryTarget(name: "MobileVLCKit", path: "MobileVLCKit.xcframework"),
        .target(
            name: "VLCKitLink",
            dependencies: ["MobileVLCKit"],
            // Dépendances système déclarées par le podspec officiel de MobileVLCKit
            linkerSettings: [
                .linkedFramework("QuartzCore"),
                .linkedFramework("CoreText"),
                .linkedFramework("AVFoundation"),
                .linkedFramework("Security"),
                .linkedFramework("CFNetwork"),
                .linkedFramework("AudioToolbox"),
                .linkedFramework("OpenGLES"),
                .linkedFramework("CoreGraphics"),
                .linkedFramework("VideoToolbox"),
                .linkedFramework("CoreMedia"),
                .linkedLibrary("c++"),
                .linkedLibrary("xml2"),
                .linkedLibrary("z"),
                .linkedLibrary("bz2"),
                .linkedLibrary("iconv"),
            ]
        ),
    ]
)
