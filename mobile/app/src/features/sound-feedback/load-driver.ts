import { createLocalSoundDriver } from "./driver";

const sources = {
  tap: require("../../../assets/sounds/tap.wav"),
  ready: require("../../../assets/sounds/ready.wav"),
  confirm: require("../../../assets/sounds/confirm.wav"),
  attention: require("../../../assets/sounds/attention.wav"),
};

export async function loadSoundDriver() {
  // Optional native availability is guarded by the controller's caught lazy
  // load. Older binaries without ExpoAudio must still open and work normally.
  const audio = await import("expo-audio");
  await audio.setAudioModeAsync({
    playsInSilentMode: false,
    interruptionMode: "mixWithOthers",
    allowsRecording: false,
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
    allowsBackgroundRecording: false,
  });
  return createLocalSoundDriver(
    {
      createPlayer: (source) =>
        audio.createAudioPlayer(source, {
          downloadFirst: false,
          keepAudioSessionActive: false,
          updateInterval: 250,
        }),
    },
    sources,
  );
}
