import { Audio } from "expo-av";

let configured = false;

export async function configureAppAudio() {
  if (configured) return;
  configured = true;

  try {
    // Ensure audio is actually enabled
    await Audio.setIsEnabledAsync(true);

    // Best default: video audio should play even if iOS silent switch is on
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,

      // These are safer defaults than DO_NOT_MIX in a dev environment
      interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_MIX_WITH_OTHERS,
      interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,

      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch (e) {
    // don't crash app for audio config
    console.log("configureAppAudio failed", e);
  }
}