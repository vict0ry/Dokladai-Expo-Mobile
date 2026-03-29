import React from "react";
import { useAuth } from "@/context/AuthContext";
import BiometricLockScreen from "@/components/BiometricLockScreen";
import WebViewScreen from "@/components/WebViewScreen";

export default function MainScreen() {
  const { isAuthenticated, isBiometricEnabled } = useAuth();

  if (isBiometricEnabled && !isAuthenticated) {
    return <BiometricLockScreen />;
  }

  return <WebViewScreen />;
}
