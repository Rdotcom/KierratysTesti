const { withAndroidManifest, withInfoPlist } = require("expo/config-plugins");

// A release never silently inherits Expo's arbitrary-load template exception.
// Explicit lab builds may use private HTTP; JS endpoint guards still reject public HTTP.
module.exports = function withSecurityBoundaries(config) {
  const development = process.env.EXPO_PUBLIC_APP_ENV === "development";
  config = withInfoPlist(config, (next) => {
    next.modResults.NSAppTransportSecurity = {
      NSAllowsArbitraryLoads: development,
      NSAllowsLocalNetworking: development,
      NSAllowsArbitraryLoadsInWebContent: false,
      NSAllowsArbitraryLoadsForMedia: false,
      NSExceptionDomains: {},
    };
    return next;
  });
  return withAndroidManifest(config, (next) => {
    const apps = next.modResults.manifest.application;
    if (!Array.isArray(apps) || apps.length !== 1) throw Error("invalid_android_application");
    apps[0].$["android:allowBackup"] = "false";
    apps[0].$["android:usesCleartextTraffic"] = development ? "true" : "false";
    return next;
  });
};
