require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name = 'KierratysLocalVision'
  s.version = package['version']
  s.summary = package['description']
  s.description = package['description']
  s.license = package['license']
  s.author = package['author']
  s.homepage = package['homepage']
  s.platforms = { :ios => '16.4' }
  s.source = { :git => 'https://github.com/roopeaal/KierratysAppi.git' }
  s.static_framework = true
  s.swift_version = '5.9'
  s.source_files = '*.{swift,c,h}'
  if File.directory?(File.join(__dir__, 'JpegDecoderAssets/TurboJPEG.xcframework'))
    s.vendored_frameworks = 'JpegDecoderAssets/TurboJPEG.xcframework'
    s.pod_target_xcconfig = {
      'SWIFT_ACTIVE_COMPILATION_CONDITIONS' => '$(inherited) KIG_PINNED_JPEG',
      'HEADER_SEARCH_PATHS' => '$(inherited) "$(PODS_TARGET_SRCROOT)/JpegDecoderAssets/include"'
    }
  end
  resource_bundles = {
    'KierratysLocalVisionPrivacy' => ['PrivacyInfo.xcprivacy'],
    'KierratysLocalVisionModels' => [
      'Resources/mobileclip_s0_image.mlpackage',
      'Resources/mobileclip-prototypes.bin',
      'Resources/mobileclip-source-spec.bin',
      'Resources/mobileclip-source-manifest.bin',
      'Resources/Notices/*.txt'
    ]
  }
  # Optional, independently pinned candidate. Clean checkouts retain old behavior
  # without staging a >100MB artifact or weakening the legacy resource budget.
  if File.directory?(File.join(__dir__, 'SiglipCandidateAssets'))
    resource_bundles['KierratysSiglipCandidates'] = [
      'SiglipCandidateAssets/vision-int8-block32.mlmodelc',
      'SiglipCandidateAssets/prototypes.json',
      'SiglipCandidateAssets/Notices/*.txt'
    ]
  end
  if File.directory?(File.join(__dir__, 'JpegDecoderAssets/TurboJPEG.xcframework'))
    resource_bundles['KierratysJpegDecoderNotices'] = [
      'JpegDecoderAssets/LICENSE.md', 'JpegDecoderAssets/README.ijg'
    ]
  end
  s.resource_bundles = resource_bundles
  s.frameworks = 'Vision', 'ImageIO', 'CoreGraphics', 'UniformTypeIdentifiers', 'CoreML', 'CoreImage', 'CoreVideo', 'CryptoKit'
  s.dependency 'ExpoModulesCore'
end
