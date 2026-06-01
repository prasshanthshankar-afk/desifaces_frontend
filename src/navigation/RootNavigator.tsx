import React from "react";
import { useAuth } from "../core/auth/AuthContext";
import { LoginScreen } from "../screens/LoginScreen";
import DashboardScreen from "../screens/DashboardScreen";

export function RootNavigator() {
  const auth = useAuth() as any;
  const token = auth?.token || auth?.accessToken || auth?.session?.access_token || null;

  return token ? <DashboardScreen /> : <LoginScreen />;
}

export default RootNavigator;
