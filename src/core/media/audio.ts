import { setAudioModeAsync } from "expo-audio";

let configured = false;

export async function configureAppAudio(): Promise<void> {
  if (configured) return;

  try {
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: "mixWithOthers",
    });
    configured = true;
  } catch (error) {
    console.log("configureAppAudio failed", error);
  }
}
