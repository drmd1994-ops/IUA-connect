# The app's own iOS module for screen privacy (M37 plan §2, item 5). No outside code.
Pod::Spec.new do |s|
  s.name           = 'ScreenPrivacy'
  s.version        = '1.0.0'
  s.summary        = 'Keeps the Med Connect app out of screenshots, recordings and the app switcher'
  s.description    = s.summary
  s.author         = 'Med Connect'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
