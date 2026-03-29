import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
  Platform,
  BackHandler,
  Text,
  TouchableOpacity,
} from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useNetwork } from "@/context/NetworkContext";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { createBridgeMessage, buildInjectionScript } from "@/lib/bridge";
import DocumentScanner from "./DocumentScanner";
import SettingsScreen from "./SettingsScreen";
import OfflineScreen from "./OfflineScreen";

const WEB_APP_URL = "https://doklad.ai";

const TRUSTED_HOSTS = new Set([
  "doklad.ai",
  "www.doklad.ai",
  "app.doklad.ai",
]);

function isTrustedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && TRUSTED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export default function WebViewScreen() {
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(WEB_APP_URL);

  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const { isConnected, lastVisitedUrl, lastPageTitle, saveCurrentUrl } = useNetwork();
  const { isBiometricEnabled } = useAuth();
  const { expoPushToken } = useNotifications();
  const [wasOffline, setWasOffline] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (showScanner) {
          setShowScanner(false);
          return true;
        }
        if (showSettings) {
          setShowSettings(false);
          return true;
        }
        if (canGoBack && webViewRef.current) {
          webViewRef.current.goBack();
          return true;
        }
        return false;
      };

      if (Platform.OS === "android") {
        const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
        return () => subscription.remove();
      }
    }, [canGoBack, showScanner, showSettings])
  );

  const [webViewKey, setWebViewKey] = useState(0);

  function forceReload() {
    setHasError(false);
    setIsLoading(true);
    setWebViewKey((k) => k + 1);
  }

  useEffect(() => {
    if (!isConnected) {
      setWasOffline(true);
    } else if (isConnected && (hasError || wasOffline)) {
      setWasOffline(false);
      forceReload();
    }
  }, [isConnected]);

  useEffect(() => {
    if (webViewRef.current && isTrustedUrl(currentUrl)) {
      const msg = createBridgeMessage("BIOMETRIC_STATUS", {
        enabled: isBiometricEnabled,
      });
      webViewRef.current.injectJavaScript(buildInjectionScript(msg));
    }
  }, [isBiometricEnabled]);

  useEffect(() => {
    if (webViewRef.current && expoPushToken && isTrustedUrl(currentUrl)) {
      const msg = createBridgeMessage("NOTIFICATION_TOKEN", {
        token: expoPushToken,
      });
      webViewRef.current.injectJavaScript(buildInjectionScript(msg));
    }
  }, [expoPushToken]);


  function handleDocumentCaptured(base64: string, filename: string) {
    setShowScanner(false);
    if (webViewRef.current) {
      const message = createBridgeMessage("DOCUMENT_SCANNED", {
        base64,
        filename,
        mimeType: "image/jpeg",
        capturedAt: Date.now(),
      });
      webViewRef.current.injectJavaScript(buildInjectionScript(message));
    }
  }

  function sendAppReady() {
    if (webViewRef.current && isTrustedUrl(currentUrl)) {
      const readyMsg = createBridgeMessage("APP_READY", {
        biometricEnabled: isBiometricEnabled,
        pushToken: expoPushToken,
        platform: Platform.OS,
      });
      webViewRef.current.injectJavaScript(buildInjectionScript(readyMsg));

      if (expoPushToken) {
        const tokenMsg = createBridgeMessage("NOTIFICATION_TOKEN", {
          token: expoPushToken,
        });
        webViewRef.current.injectJavaScript(buildInjectionScript(tokenMsg));
      }

      const biometricMsg = createBridgeMessage("BIOMETRIC_STATUS", {
        enabled: isBiometricEnabled,
      });
      webViewRef.current.injectJavaScript(buildInjectionScript(biometricMsg));
    }
  }

  function handleWebViewMessage(event: WebViewMessageEvent) {
    if (!isTrustedUrl(currentUrl)) return;

    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.action === "OPEN_SCANNER") {
        setShowScanner(true);
      } else if (data.action === "OPEN_SETTINGS") {
        setShowSettings(true);
      }
    } catch {
    }
  }

  if (showScanner) {
    return (
      <DocumentScanner
        onDocumentCaptured={handleDocumentCaptured}
        onClose={() => setShowScanner(false)}
      />
    );
  }

  if (showSettings) {
    return <SettingsScreen onClose={() => setShowSettings(false)} />;
  }

  if (!isConnected) {
    return (
      <>
        <StatusBar style={isDark ? "light" : "dark"} />
        <OfflineScreen
          lastUrl={lastVisitedUrl}
          lastTitle={lastPageTitle}
          onRetry={forceReload}
        />
      </>
    );
  }

  if (hasError) {
    return (
      <View
        style={[
          styles.errorContainer,
          {
            backgroundColor: colors.background,
            paddingTop: Platform.OS === "web" ? 67 : insets.top,
          },
        ]}
      >
        <StatusBar style={isDark ? "light" : "dark"} />
        <Feather name="wifi-off" size={48} color={colors.textSecondary} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>
          Nelze se připojit
        </Text>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>
          Zkontrolujte připojení k internetu a zkuste to znovu.
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={forceReload}
          activeOpacity={0.8}
        >
          <Text style={styles.retryText}>Zkusit znovu</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={[styles.webFallback, { paddingTop: 67, paddingBottom: 34 }]}>
          <Feather name="smartphone" size={48} color={colors.primary} />
          <Text style={[styles.webTitle, { color: colors.text }]}>Doklad.ai</Text>
          <Text style={[styles.webText, { color: colors.textSecondary }]}>
            Tato aplikace je optimalizována pro mobilní zařízení.{"\n"}
            Naskenujte QR kód pro otevření v Expo Go.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={{ paddingTop: insets.top, flex: 1 }}>
        <WebView
          key={webViewKey}
          ref={webViewRef}
          source={{ uri: lastVisitedUrl && isTrustedUrl(lastVisitedUrl) ? lastVisitedUrl : WEB_APP_URL }}
          style={styles.webview}
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => {
            setIsLoading(false);
            sendAppReady();
          }}
          onError={() => {
            setHasError(true);
            setIsLoading(false);
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            if (nativeEvent.statusCode >= 500) {
              setHasError(true);
            }
          }}
          onShouldStartLoadWithRequest={(request) => {
            if (isTrustedUrl(request.url)) return true;
            if (request.url.startsWith("mailto:") || request.url.startsWith("tel:")) return true;
            import("expo-web-browser").then((mod) => mod.openBrowserAsync(request.url));
            return false;
          }}
          onNavigationStateChange={(navState) => {
            setCanGoBack(!!navState.canGoBack);
            if (navState.url) {
              setCurrentUrl(navState.url);
              saveCurrentUrl(navState.url, navState.title || undefined);
            }
          }}
          onMessage={handleWebViewMessage}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          allowsBackForwardNavigationGestures
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          pullToRefreshEnabled
        />
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.8)",
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  errorTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    marginTop: 8,
  },
  errorText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  retryButton: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: 16,
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  webFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  webTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  webText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
});
