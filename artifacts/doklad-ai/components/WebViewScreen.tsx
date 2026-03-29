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
  Animated,
} from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useNetwork } from "@/context/NetworkContext";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { createBridgeMessage, buildInjectionScript } from "@/lib/bridge";
import DocumentScanner from "./DocumentScanner";
import SettingsScreen from "./SettingsScreen";
import OfflineScreen from "./OfflineScreen";

const WEB_APP_URL = "https://doklad.ai";

const TRUSTED_ORIGINS = [
  "https://doklad.ai",
  "https://www.doklad.ai",
  "https://app.doklad.ai",
];

function isTrustedUrl(url: string): boolean {
  return TRUSTED_ORIGINS.some((origin) => url.startsWith(origin));
}

export default function WebViewScreen() {
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [fabExpanded, setFabExpanded] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(WEB_APP_URL);
  const fabAnim = useRef(new Animated.Value(0)).current;

  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const { isConnected, lastVisitedUrl, saveCurrentUrl } = useNetwork();
  const { isBiometricEnabled } = useAuth();
  const { expoPushToken } = useNotifications();

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
    if (isConnected && hasError) {
      forceReload();
    }
  }, [isConnected]);

  function toggleFab() {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const toValue = fabExpanded ? 0 : 1;
    Animated.spring(fabAnim, {
      toValue,
      useNativeDriver: true,
      friction: 6,
    }).start();
    setFabExpanded(!fabExpanded);
  }

  function closeFab() {
    Animated.spring(fabAnim, {
      toValue: 0,
      useNativeDriver: true,
      friction: 6,
    }).start();
    setFabExpanded(false);
  }

  function openScanner() {
    closeFab();
    setShowScanner(true);
  }

  function openSettings() {
    closeFab();
    setShowSettings(true);
  }

  function handleDocumentCaptured(base64: string, filename: string) {
    setShowScanner(false);
    if (webViewRef.current) {
      const message = createBridgeMessage("DOCUMENT_SCANNED", {
        base64,
        filename,
        mimeType: "image/jpeg",
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

  const scanButtonTranslateY = fabAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -70],
  });
  const settingsButtonTranslateY = fabAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -140],
  });
  const subButtonOpacity = fabAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });
  const fabRotation = fabAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "45deg"],
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={{ paddingTop: insets.top, flex: 1 }}>
        <WebView
          key={webViewKey}
          ref={webViewRef}
          source={{ uri: WEB_APP_URL }}
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
              saveCurrentUrl(navState.url);
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

      <View style={[styles.fabContainer, { bottom: insets.bottom + 24, right: 20 }]}>
        <Animated.View
          style={[
            styles.subFab,
            {
              transform: [{ translateY: settingsButtonTranslateY }],
              opacity: subButtonOpacity,
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.subFabButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={openSettings}
            activeOpacity={0.8}
          >
            <Feather name="settings" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.subFabLabel, { color: colors.text }]}>Nastavení</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.subFab,
            {
              transform: [{ translateY: scanButtonTranslateY }],
              opacity: subButtonOpacity,
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.subFabButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={openScanner}
            activeOpacity={0.8}
          >
            <Feather name="camera" size={20} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[styles.subFabLabel, { color: colors.text }]}>Skenovat</Text>
        </Animated.View>

        <TouchableOpacity
          style={[styles.mainFab, { backgroundColor: colors.primary }]}
          onPress={toggleFab}
          activeOpacity={0.8}
        >
          <Animated.View style={{ transform: [{ rotate: fabRotation }] }}>
            <Feather name="plus" size={26} color="#FFF" />
          </Animated.View>
        </TouchableOpacity>
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
  fabContainer: {
    position: "absolute",
    alignItems: "center",
  },
  mainFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.27,
    shadowRadius: 4.65,
  },
  subFab: {
    position: "absolute",
    bottom: 0,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  subFabButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    borderWidth: 1,
  },
  subFabLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    overflow: "hidden",
  },
});
