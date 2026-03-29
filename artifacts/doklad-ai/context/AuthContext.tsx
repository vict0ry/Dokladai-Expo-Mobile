import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Platform, AppState, AppStateStatus } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

interface AuthContextType {
  isAuthenticated: boolean;
  isBiometricAvailable: boolean;
  biometricType: string | null;
  isBiometricEnabled: boolean;
  authenticate: () => Promise<boolean>;
  toggleBiometric: (enabled: boolean) => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isBiometricAvailable: false,
  biometricType: null,
  isBiometricEnabled: false,
  authenticate: async () => false,
  toggleBiometric: async () => {},
  isLoading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

const BIOMETRIC_ENABLED_KEY = "doklad_biometric_enabled";
const FIRST_LAUNCH_KEY = "doklad_first_launch_done";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string | null>(null);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkBiometricSupport();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, [isBiometricEnabled]);

  const handleAppStateChange = useCallback(
    (nextState: AppStateStatus) => {
      if (nextState === "active" && isBiometricEnabled) {
        setIsAuthenticated(false);
        authenticate();
      }
    },
    [isBiometricEnabled]
  );

  async function checkBiometricSupport() {
    try {
      if (Platform.OS === "web") {
        setIsAuthenticated(true);
        setIsLoading(false);
        return;
      }

      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const available = compatible && enrolled;
      setIsBiometricAvailable(available);

      if (available) {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType("Face ID");
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricType("Touch ID");
        } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
          setBiometricType("Iris");
        }
      }

      const storedEnabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
      const firstLaunchDone = await SecureStore.getItemAsync(FIRST_LAUNCH_KEY);

      if (!firstLaunchDone && available) {
        setIsBiometricEnabled(true);
        await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "true");
        await SecureStore.setItemAsync(FIRST_LAUNCH_KEY, "true");
        await authenticate();
      } else if (storedEnabled === "true" && available) {
        setIsBiometricEnabled(true);
        await authenticate();
      } else {
        setIsAuthenticated(true);
      }
    } catch {
      setIsAuthenticated(true);
    } finally {
      setIsLoading(false);
    }
  }

  async function authenticate(): Promise<boolean> {
    if (Platform.OS === "web") {
      setIsAuthenticated(true);
      return true;
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Ověřte svou identitu",
        fallbackLabel: "Použít heslo",
        cancelLabel: "Zrušit",
        disableDeviceFallback: false,
      });

      if (result.success) {
        setIsAuthenticated(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async function toggleBiometric(enabled: boolean) {
    setIsBiometricEnabled(enabled);
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, enabled ? "true" : "false");
    if (!enabled) {
      setIsAuthenticated(true);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isBiometricAvailable,
        biometricType,
        isBiometricEnabled,
        authenticate,
        toggleBiometric,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
