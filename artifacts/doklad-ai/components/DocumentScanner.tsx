import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

/**
 * Native document scanner.
 *
 * Primary path: react-native-document-scanner-plugin → VisionKit
 * (`VNDocumentCameraViewController`) on iOS 13+, ML Kit DocumentScanner on
 * Android. These give Apple/Google-grade edge detection, perspective
 * correction, glare removal and auto-shutter — far better than the OpenCV.js
 * web fallback or a raw camera capture, which is what we need for App Store
 * review (review team specifically dislikes apps that ship a worse-than-system
 * scanner experience).
 *
 * Fallbacks:
 *  - Plugin missing or platform unsupported → expo-image-picker camera,
 *    then expo-image-picker gallery — same UX the previous version had.
 *  - User can always pick a photo from the gallery via the icon button on the
 *    preview screen.
 *
 * Output stays compatible with WebViewScreen.handleDocumentCaptured(base64,
 * filename), which forwards to the web bridge as DOCUMENT_SCANNED.
 */

interface DocumentScannerProps {
  onDocumentCaptured: (base64: string, filename: string) => void;
  onClose: () => void;
}

// react-native-document-scanner-plugin is a native module; we load it lazily
// to keep the preview screen renderable on platforms where it isn't compiled
// in (Expo Go, web). The dynamic require pattern here is how Expo guides
// optional-native loading — `require` is intentional so Metro can resolve it
// at bundle time without breaking when it's missing.
type NativeScanResult = { scannedImages?: string[]; status?: string };
type NativeScanOptions = {
  croppedImageQuality?: number;
  maxNumDocuments?: number;
  responseType?: string;
};
type NativeScannerModule = {
  scanDocument: (opts?: NativeScanOptions) => Promise<NativeScanResult>;
  ResponseType?: { Base64?: string; ImageFilePath?: string };
};

function loadNativeScanner(): NativeScannerModule | null {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("react-native-document-scanner-plugin");
    const scanner = (mod && (mod.default || mod)) as NativeScannerModule;
    if (typeof scanner?.scanDocument !== "function") return null;
    return scanner;
  } catch {
    return null;
  }
}

export default function DocumentScanner({ onDocumentCaptured, onClose }: DocumentScannerProps) {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const launchedOnceRef = useRef(false);

  useEffect(() => {
    if (launchedOnceRef.current || capturedImage) return;
    launchedOnceRef.current = true;
    launchScanner();
  }, []);

  /**
   * Try native VisionKit/ML Kit first; fall back to plain camera if the
   * plugin isn't available. Both paths converge on `setCapturedImage` /
   * `setCapturedBase64`, then the user confirms.
   */
  async function launchScanner() {
    const native = loadNativeScanner();
    if (native) {
      const ok = await launchNativeScanner(native);
      if (ok) return;
      // Fall through to camera fallback if native returned no usable image
      // (cancel is handled inside launchNativeScanner and closes the screen).
    }
    await launchCameraFallback();
  }

  /** @returns true if we got an image (or user cancelled cleanly) */
  async function launchNativeScanner(native: NativeScannerModule): Promise<boolean> {
    try {
      const responseType = native.ResponseType?.Base64 || "base64";
      const result = await native.scanDocument({
        croppedImageQuality: 85,
        maxNumDocuments: 1,
        responseType,
      });

      if (result.status === "cancel") {
        onClose();
        return true;
      }

      const first = result.scannedImages?.[0];
      if (!first) {
        // Plugin returned success but no image — let camera fallback try.
        return false;
      }

      // The plugin returns either a raw base64 string or a file:// path
      // depending on responseType. Handle both — some platforms ignore the
      // option silently.
      if (first.startsWith("file://") || first.startsWith("/")) {
        const uri = first.startsWith("file://") ? first : `file://${first}`;
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: "base64",
        });
        setCapturedImage(uri);
        setCapturedBase64(base64);
      } else {
        // Raw base64 — synthesise a data URL for the on-device preview.
        setCapturedImage(`data:image/jpeg;base64,${first}`);
        setCapturedBase64(first);
      }
      return true;
    } catch (err) {
      // Most common: user denied camera permission, or native module is
      // present in JS but the iOS/Android side isn't linked (dev build out
      // of date). Fall back rather than dead-ending the user.
      console.warn("[DocumentScanner] native scan failed:", err);
      return false;
    }
  }

  async function launchCameraFallback() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Přístup ke kameře",
        "Pro skenování dokladů potřebujeme přístup k vaší kameře. Povolte přístup v nastavení.",
        [
          { text: "Zrušit", style: "cancel", onPress: onClose },
          {
            text: "Otevřít nastavení",
            onPress: () => {
              import("react-native").then(({ Linking }) => Linking.openSettings());
              onClose();
            },
          },
        ]
      );
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        onClose();
        return;
      }

      const asset = result.assets[0];
      setCapturedImage(asset.uri);
      if (asset.base64) setCapturedBase64(asset.base64);
    } catch {
      Alert.alert("Chyba", "Nepodařilo se otevřít kameru. Zkuste to znovu.");
      onClose();
    }
  }

  async function pickFromGallery() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setCapturedImage(asset.uri);
        setCapturedBase64(asset.base64 ?? null);
      }
    } catch {
      Alert.alert("Chyba", "Nepodařilo se otevřít galerii. Zkuste to znovu.");
    }
  }

  async function confirmImage() {
    if (!capturedImage) return;

    setIsProcessing(true);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      // Prefer the base64 we already have (native scanner / camera with
      // base64:true / gallery). Only re-read from disk if for some reason
      // we don't — keeps the confirm step instant in the common path.
      let base64 = capturedBase64;
      if (!base64) {
        if (capturedImage.startsWith("data:")) {
          base64 = capturedImage.split(",")[1] ?? null;
        } else {
          base64 = await FileSystem.readAsStringAsync(capturedImage, {
            encoding: "base64",
          });
        }
      }
      if (!base64) {
        Alert.alert("Chyba", "Snímek se nepodařilo načíst.");
        return;
      }

      const timestamp = Date.now();
      const filename = `doklad_${timestamp}.jpg`;

      onDocumentCaptured(base64, filename);
    } catch {
      Alert.alert("Chyba", "Nepodařilo se zpracovat snímek. Zkuste to znovu.");
    } finally {
      setIsProcessing(false);
    }
  }

  function retake() {
    setCapturedImage(null);
    setCapturedBase64(null);
    launchScanner();
  }

  if (!capturedImage) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.loadingContainer, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Feather name="x" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Otevírám skener...
          </Text>
          <TouchableOpacity
            style={[styles.galleryButton, { borderColor: colors.primary }]}
            onPress={pickFromGallery}
            activeOpacity={0.8}
          >
            <Feather name="image" size={20} color={colors.primary} />
            <Text style={[styles.galleryButtonText, { color: colors.primary }]}>
              Vybrat z galerie
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <View style={[styles.previewHeader, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={retake} style={styles.headerButton}>
          <Feather name="arrow-left" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.previewTitle}>Kontrola snímku</Text>
        <TouchableOpacity onPress={pickFromGallery} style={styles.headerButton}>
          <Feather name="image" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.cropContainer}>
        <Image source={{ uri: capturedImage }} style={styles.previewImage} resizeMode="contain" />
      </View>

      <Text style={styles.cropHint}>
        Zkontrolujte, zda je doklad čitelný
      </Text>

      <View style={[styles.previewActions, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={[styles.actionButton, styles.retakeButton]}
          onPress={retake}
          activeOpacity={0.8}
        >
          <Feather name="refresh-cw" size={20} color="#FFF" />
          <Text style={styles.actionButtonText}>Znovu</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
          onPress={confirmImage}
          activeOpacity={0.8}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Feather name="check" size={20} color="#FFF" />
              <Text style={styles.actionButtonText}>Použít</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  galleryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    marginTop: 16,
  },
  galleryButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  previewTitle: {
    color: "#FFF",
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  cropContainer: {
    flex: 1,
    position: "relative",
  },
  cropHint: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingVertical: 8,
  },
  previewImage: {
    flex: 1,
  },
  previewActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingTop: 20,
    paddingHorizontal: 32,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  retakeButton: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  actionButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
