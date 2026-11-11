import ExpoModulesCore
import UIKit

// The app's screens stay private on an iPhone as on Android (owner's decisions, 2026-10-28 and
// M37 plan §2, item 5). Apple offers no switch for this, so it is done in two layers:
//
// 1. The block: each window is drawn inside the layer iOS keeps for password fields, which
//    screenshots, screen recordings and mirroring leave out. It is not an Apple feature, and an
//    iOS update could stop it working without warning, so it is checked on each new iOS version.
// 2. The fallback, with Apple's own features: a cover while the screen is recorded or mirrored and
//    while the app is in the app switcher, and an event for the app after a screenshot, which iOS
//    reports only once it is taken.

@MainActor
enum ScreenPrivacy {
  private static let secured = NSHashTable<UIWindow>.weakObjects()
  private static var observers: [NSObjectProtocol] = []
  private static var cover: UIView?

  /// The app's colour (the icon's background in app.json), so the cover looks like the app.
  private static let coverColor = UIColor(red: 0x13 / 255, green: 0x4d / 255, blue: 0x67 / 255, alpha: 1)

  static func start() {
    guard observers.isEmpty else { return }
    let center = NotificationCenter.default
    let watch = { (name: Notification.Name, action: @escaping @MainActor () -> Void) in
      center.addObserver(forName: name, object: nil, queue: .main) { _ in
        MainActor.assumeIsolated(action)
      }
    }
    observers = [
      watch(UIApplication.didBecomeActiveNotification) {
        windows.forEach(protect)
        showCover(isCaptured)
      },
      watch(UIApplication.willResignActiveNotification) { showCover(true) },
      watch(UIScreen.capturedDidChangeNotification) {
        showCover(isCaptured || UIApplication.shared.applicationState != .active)
      },
    ]
  }

  private static var windows: [UIWindow] {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
  }

  private static var isCaptured: Bool {
    windows.contains { $0.screen.isCaptured }
  }

  /// Moves the window's layer into a password field's drawing layer, once per window. If iOS
  /// doesn't have the layers this expects, the window is left as it is and the fallback remains.
  private static func protect(_ window: UIWindow) {
    if secured.contains(window) { return }
    let field = UITextField()
    field.isSecureTextEntry = true
    field.isUserInteractionEnabled = false
    window.addSubview(field)
    let canvas =
      field.layer.sublayers?.first { layer in
        layer.delegate.map { String(describing: type(of: $0)).contains("CanvasView") } ?? false
      } ?? field.layer.sublayers?.last
    guard let superlayer = window.layer.superlayer, let canvas else {
      field.removeFromSuperview()
      return
    }
    superlayer.addSublayer(field.layer)
    canvas.addSublayer(window.layer)
    secured.add(window)
  }

  private static func showCover(_ show: Bool) {
    if !show {
      cover?.removeFromSuperview()
      cover = nil
      return
    }
    guard cover == nil, let window = windows.first(where: \.isKeyWindow) ?? windows.first else {
      return
    }
    let view = UIView(frame: window.bounds)
    view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.backgroundColor = coverColor
    view.accessibilityElementsHidden = true
    window.addSubview(view)
    cover = view
  }
}

/// Starts the protection when the app launches, before any screen is drawn.
public class ScreenPrivacyAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    ScreenPrivacy.start()
    return true
  }
}

/// Tells the app that a screenshot was taken, so it can say that screenshots aren't allowed.
public class ScreenPrivacyModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("ScreenPrivacy")

    Events("onScreenshot")

    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(
        forName: UIApplication.userDidTakeScreenshotNotification, object: nil, queue: .main
      ) { [weak self] _ in
        self?.sendEvent("onScreenshot")
      }
    }

    OnStopObserving {
      if let observer = self.observer {
        NotificationCenter.default.removeObserver(observer)
      }
      self.observer = nil
    }
  }
}
