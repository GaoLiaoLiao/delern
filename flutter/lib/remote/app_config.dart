import 'package:delern_flutter/remote/error_reporting.dart' as error_reporting;
import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:flutter/foundation.dart';
import 'package:pedantic/pedantic.dart';

class AppConfig {
  static final AppConfig _instance = AppConfig._();

  static AppConfig get instance => _instance;

  AppConfig._() {
    _init();
  }

  // Value initialized from Remote Config, whether enable or disable images
  // feature in the app (uploading images).
  bool get imageFeatureEnabled =>
      _remoteConfig?.getBool('images_feature_enabled') ?? true;

  // Value initialized from Remote Config, whether enable or disable sharing
  // decks with other users.
  bool get sharingFeatureEnabled =>
      _remoteConfig?.getBool('sharing_feature_enabled') ?? true;

  RemoteConfig _remoteConfig;

  Future<void> _init() async {
    _remoteConfig = await RemoteConfig.instance;
    await _remoteConfig
        .setConfigSettings(RemoteConfigSettings(debugMode: kDebugMode));
    try {
      final duration = kDebugMode ? const Duration() : const Duration(hours: 5);
      await _remoteConfig.fetch(expiration: duration);
    } on FetchThrottledException catch (e, stackTrace) {
      unawaited(
          error_reporting.report('RemoteConfig Throttled', e, stackTrace));
    }
  }
}
