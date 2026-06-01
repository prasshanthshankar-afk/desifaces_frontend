import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

import { tokenStore } from "../../../core/auth/tokenStore";
import { registerNotificationDevice } from "../../../core/api/notifications";

let notificationHandlerConfigured = false;

export function useRegisterPushToken() {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    const run = async () => {
      try {
        const access = await tokenStore.getAccess();
        if (!access) return;
        if (!Device.isDevice) return;

        if (!notificationHandlerConfigured) {
          Notifications.setNotificationHandler({
            handleNotification: async () => ({
              shouldShowAlert: true,
              shouldPlaySound: true,
              shouldSetBadge: true,
              shouldShowBanner: true,
              shouldShowList: true,
            }),
          });
          notificationHandlerConfigured = true;
        }

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("desifaces-default", {
            name: "desifaces.ai",
            importance: Notifications.AndroidImportance.MAX,
          });

          await Notifications.setNotificationChannelAsync("jobs", {
            name: "Jobs",
            importance: Notifications.AndroidImportance.MAX,
          });

          await Notifications.setNotificationChannelAsync("billing", {
            name: "Billing",
            importance: Notifications.AndroidImportance.HIGH,
          });

          await Notifications.setNotificationChannelAsync("support", {
            name: "Support",
            importance: Notifications.AndroidImportance.HIGH,
          });
        }

        const permissions = await Notifications.getPermissionsAsync();
        let finalStatus = permissions.status;

        if (finalStatus !== "granted") {
          const req = await Notifications.requestPermissionsAsync();
          finalStatus = req.status;
        }

        if (finalStatus !== "granted") return;

        const projectId =
          Constants?.expoConfig?.extra?.eas?.projectId ??
          Constants?.easConfig?.projectId;

        const tokenResult = projectId
          ? await Notifications.getExpoPushTokenAsync({ projectId })
          : await Notifications.getExpoPushTokenAsync();

        if (cancelled || !tokenResult?.data) return;

        await registerNotificationDevice({
          expo_push_token: tokenResult.data,
          platform:
            Platform.OS === "ios"
              ? "ios"
              : Platform.OS === "android"
              ? "android"
              : "web",
          device_name: Device.deviceName ?? Device.modelName ?? "Unknown device",
          app_version: Constants.expoConfig?.version ?? "dev",
        });

        console.log("DF_EXPO_PUSH_REGISTERED", tokenResult.data);
      } catch (err) {
        console.log("DF_EXPO_PUSH_REGISTER_ERR", err);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, []);
}