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
  Alert,
  Linking,
  Share,
} from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import Constants, { ExecutionEnvironment } from "expo-constants";
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

function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

let voiceModule: any = null;

async function getVoiceModule() {
  if (isExpoGo()) return null;
  if (voiceModule) return voiceModule;
  try {
    voiceModule = (await import("@react-native-voice/voice")).default;
    return voiceModule;
  } catch {
    return null;
  }
}

async function requestDictationPermissions(): Promise<boolean> {
  if (isExpoGo()) return false;
  try {
    const { ExpoSpeechRecognitionModule } = await import("expo-speech-recognition");
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return result.granted;
  } catch {
    return false;
  }
}

function showPermissionDeniedAlert() {
  const message =
    Platform.OS === "ios"
      ? "Pro hlasové diktování je potřeba povolit přístup k mikrofonu a rozpoznávání řeči v nastavení."
      : "Pro hlasové diktování je potřeba povolit přístup k mikrofonu v nastavení.";
  Alert.alert("Oprávnění zamítnuto", message, [
    { text: "Zrušit", style: "cancel" },
    { text: "Otevřít nastavení", onPress: () => Linking.openSettings() },
  ]);
}

const MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024;

export default function WebViewScreen() {
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(WEB_APP_URL);
  const lastPartialTranscript = useRef("");

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
          handleScannerClose();
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

  function sendToWeb(action: Parameters<typeof createBridgeMessage>[0], payload: Record<string, unknown>) {
    if (!webViewRef.current || !isTrustedUrl(currentUrl)) return;
    const msg = createBridgeMessage(action, payload);
    webViewRef.current.injectJavaScript(buildInjectionScript(msg));
  }

  function handleDocumentCaptured(base64: string, filename: string) {
    setShowScanner(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    sendToWeb("FILE_PICKED", {
      name: filename,
      size: Math.round(base64.length * 0.75),
      type: "image/jpeg",
      base64,
    });
  }

  function handleScannerClose() {
    setShowScanner(false);
    sendToWeb("FILE_PICK_CANCELLED", {});
  }

  async function handleOpenCamera() {
    if (Platform.OS === "web") return;

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      sendToWeb("FILE_PICK_CANCELLED", {});
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        base64: true,
        quality: 0.8,
      });

      if (result.canceled) {
        sendToWeb("FILE_PICK_CANCELLED", {});
        return;
      }

      const asset = result.assets[0];
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      sendToWeb("FILE_PICKED", {
        name: `photo_${Date.now()}.jpg`,
        size: asset.fileSize || Math.round((asset.base64?.length || 0) * 0.75),
        type: asset.mimeType || "image/jpeg",
        base64: asset.base64 || "",
      });
    } catch {
      sendToWeb("FILE_PICK_CANCELLED", {});
    }
  }

  async function handlePickFile(payload?: { accept?: string[] }) {
    if (Platform.OS === "web") return;

    try {
      const types = payload?.accept || ["image/*", "application/pdf"];
      const result = await DocumentPicker.getDocumentAsync({
        type: types,
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        sendToWeb("FILE_PICK_CANCELLED", {});
        return;
      }

      const file = result.assets[0];

      if (file.size && file.size > MAX_FILE_SIZE_BYTES) {
        sendToWeb("FILE_PICK_CANCELLED", { reason: "file_too_large" });
        Alert.alert("Soubor je příliš velký", "Maximální velikost souboru je 30 MB.");
        return;
      }

      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      sendToWeb("FILE_PICKED", {
        name: file.name,
        size: file.size || Math.round(base64.length * 0.75),
        type: file.mimeType || "application/octet-stream",
        base64,
      });
    } catch {
      sendToWeb("FILE_PICK_CANCELLED", {});
    }
  }

  async function handleStartDictation(payload?: { lang?: string }) {
    if (Platform.OS === "web") {
      sendToWeb("DICTATION_ERROR", { error: "not_supported" });
      return;
    }

    const Voice = await getVoiceModule();
    if (!Voice) {
      sendToWeb("DICTATION_ERROR", { error: "not_available" });
      Alert.alert(
        "Diktování nedostupné",
        "Pro hlasový vstup je potřeba development build aplikace."
      );
      return;
    }

    try {
      const hasPermission = await requestDictationPermissions();
      if (!hasPermission) {
        sendToWeb("DICTATION_ERROR", { error: "permission_denied" });
        showPermissionDeniedAlert();
        return;
      }

      lastPartialTranscript.current = "";

      Voice.onSpeechResults = (e: any) => {
        const text = e?.value?.[0] || "";
        lastPartialTranscript.current = text;
        sendToWeb("DICTATION_RESULT", { text, isFinal: true });
      };

      Voice.onSpeechPartialResults = (e: any) => {
        const text = e?.value?.[0] || "";
        lastPartialTranscript.current = text;
        sendToWeb("DICTATION_RESULT", { text, isFinal: false });
      };

      Voice.onSpeechError = (e: any) => {
        const errorCode = e?.error?.code || e?.error?.message || "unknown";
        lastPartialTranscript.current = "";
        sendToWeb("DICTATION_ERROR", { error: errorCode });
      };

      await Voice.start(payload?.lang || "cs-CZ");
    } catch {
      sendToWeb("DICTATION_ERROR", { error: "start_failed" });
    }
  }

  async function handleStopDictation() {
    const Voice = await getVoiceModule();
    if (!Voice) return;

    try {
      await Voice.stop();
      const finalText = lastPartialTranscript.current;
      lastPartialTranscript.current = "";
      sendToWeb("DICTATION_RESULT", { text: finalText, isFinal: true });
    } catch {
      sendToWeb("DICTATION_ERROR", { error: "stop_failed" });
    }
  }

  async function handleShare(payload?: { title?: string; message?: string; url?: string }) {
    try {
      const title = payload?.title || "";
      const url = payload?.url || "";
      const message = payload?.message || "";

      if (!url && !message) {
        sendToWeb("SHARE_CANCELLED", { reason: "no_content" });
        return;
      }

      const shareContent: { title?: string; message?: string; url?: string } = {};
      if (title) shareContent.title = title;
      if (message) shareContent.message = message;
      if (url) shareContent.url = url;

      const result = await Share.share(shareContent);

      if (result.action === Share.sharedAction) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        sendToWeb("SHARE_RESULT", { success: true });
      } else if (result.action === Share.dismissedAction) {
        sendToWeb("SHARE_CANCELLED", { reason: "dismissed" });
      }
    } catch {
      sendToWeb("SHARE_CANCELLED", { reason: "error" });
    }
  }

  async function handleHaptic(payload?: { type?: string }) {
    const hapticType = payload?.type || "light";
    switch (hapticType) {
      case "success":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "warning":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case "error":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case "light":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case "medium":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case "heavy":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      default:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
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
    const eventUrl = event.nativeEvent.url;
    if (!isTrustedUrl(eventUrl || currentUrl)) return;

    try {
      const data = JSON.parse(event.nativeEvent.data);
      const action = data.action || data.type;

      switch (action) {
        case "OPEN_SCANNER":
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowScanner(true);
          break;
        case "OPEN_CAMERA":
          handleOpenCamera();
          break;
        case "PICK_FILE":
          handlePickFile(data.payload);
          break;
        case "START_DICTATION":
          handleStartDictation(data.payload);
          break;
        case "STOP_DICTATION":
          handleStopDictation();
          break;
        case "OPEN_SETTINGS":
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowSettings(true);
          break;
        case "SHARE":
          handleShare(data.payload);
          break;
        case "HAPTIC":
          handleHaptic(data.payload);
          break;
      }
    } catch {
    }
  }

  useEffect(() => {
    return () => {
      getVoiceModule().then((Voice) => {
        if (Voice) {
          Voice.destroy();
          Voice.removeAllListeners();
        }
      });
    };
  }, []);

  if (showScanner) {
    return (
      <DocumentScanner
        onDocumentCaptured={handleDocumentCaptured}
        onClose={handleScannerClose}
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
