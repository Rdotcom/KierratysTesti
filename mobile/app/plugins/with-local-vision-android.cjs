const { withGradleProperties } = require("expo/config-plugins");
// Android's local image pipeline uses public API26 image/colour/time interfaces.
module.exports = function withLocalVisionAndroid(config) {
  return withGradleProperties(config, (next) => {
    next.modResults = next.modResults.filter(
      (entry) => !(entry.type === "property" && entry.key === "android.minSdkVersion"),
    );
    next.modResults.push({ type: "property", key: "android.minSdkVersion", value: "26" });
    return next;
  });
};
