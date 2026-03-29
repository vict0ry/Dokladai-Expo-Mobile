import React, { useState, useRef, useEffect, useCallback } from "react";
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
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

interface DocumentScannerProps {
  onDocumentCaptured: (base64: string, filename: string) => void;
  onClose: () => void;
}

const CAMERA_TIMEOUT_MS = 3000;

export default function DocumentScanner({ onDocumentCaptured, onClose }: DocumentScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (permission?.granted && !capturedImage) {
      const delay = setTimeout(() => {
        setIsCameraActive(true);
      }, 100);
      return () => clearTimeout(delay);
    } else {
      setIsCameraActive(false);
      setIsCameraReady(false);
    }
  }, [permission?.granted, capturedImage]);

  useEffect(() => {
    if (isCameraActive && !isCameraReady && !cameraFailed) {
      timeoutRef.current = setTimeout(() => {
        if (!isCameraReady) {
          setCameraFailed(true);
          setIsCameraActive(false);
        }
      }, CAMERA_TIMEOUT_MS);
    }
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isCameraActive, isCameraReady, cameraFailed]);

  const handleCameraReady = useCallback(() => {
    setIsCameraReady(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleMountError = useCallback(() => {
    setCameraFailed(true);
    setIsCameraActive(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (retryDelayRef.current) {
        clearTimeout(retryDelayRef.current);
      }
    };
  }, []);

  async function fallbackToImagePicker() {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setCapturedImage(result.assets[0].uri);
      }
    } catch {
      Alert.alert("Chyba", "Nepodařilo se otevřít kameru. Zkuste to znovu.");
    }
  }

  if (!permission) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View
        style={[
          styles.permissionContainer,
          {
            backgroundColor: colors.background,
            paddingTop: Platform.OS === "web" ? 67 : insets.top + 20,
          },
        ]}
      >
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Feather name="x" size={24} color={colors.text} />
        </TouchableOpacity>
        <Feather name="camera" size={64} color={colors.primary} />
        <Text style={[styles.permissionTitle, { color: colors.text }]}>
          Přístup ke kameře
        </Text>
        <Text style={[styles.permissionText, { color: colors.textSecondary }]}>
          Pro skenování dokladů potřebujeme přístup k vaší kameře.
        </Text>
        <TouchableOpacity
          style={[styles.permissionButton, { backgroundColor: colors.primary }]}
          onPress={requestPermission}
          activeOpacity={0.8}
        >
          <Text style={styles.permissionButtonText}>Povolit kameru</Text>
        </TouchableOpacity>
      </View>
    );
  }

  async function takePicture() {
    if (!cameraRef.current || isProcessing) return;

    setIsProcessing(true);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (photo?.uri) {
        setCapturedImage(photo.uri);
      } else {
        Alert.alert("Chyba", "Nepodařilo se pořídit snímek. Zkuste to znovu.");
      }
    } catch {
      Alert.alert("Chyba", "Nepodařilo se pořídit snímek. Zkuste to znovu.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function pickFromGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setCapturedImage(result.assets[0].uri);
    }
  }

  async function confirmImage() {
    if (!capturedImage) return;

    setIsProcessing(true);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      const base64 = await FileSystem.readAsStringAsync(capturedImage, {
        encoding: FileSystem.EncodingType.Base64,
      });

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
    setCameraFailed(false);
    setIsCameraReady(false);
  }

  if (capturedImage) {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <View style={[styles.previewHeader, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={retake} style={styles.headerButton}>
            <Feather name="arrow-left" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.previewTitle}>Oříznutí a kontrola</Text>
          <View style={styles.headerButton} />
        </View>

        <View style={styles.cropContainer}>
          <Image source={{ uri: capturedImage }} style={styles.previewImage} resizeMode="contain" />
          <View style={styles.cropOverlay} pointerEvents="none">
            <View style={styles.cropFrame}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
          </View>
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

  if (cameraFailed) {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <View style={[styles.cameraHeader, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Feather name="x" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.cameraTitle}>Skenovat doklad</Text>
          <TouchableOpacity onPress={pickFromGallery} style={styles.headerButton}>
            <Feather name="image" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.fallbackContainer}>
          <Feather name="camera-off" size={48} color="rgba(255,255,255,0.6)" />
          <Text style={styles.fallbackTitle}>
            Náhled kamery není dostupný
          </Text>
          <Text style={styles.fallbackText}>
            Na tomto zařízení nelze zobrazit náhled kamery. Použijte tlačítko níže pro pořízení snímku.
          </Text>
          <TouchableOpacity
            style={[styles.fallbackButton, { backgroundColor: colors.primary }]}
            onPress={fallbackToImagePicker}
            activeOpacity={0.8}
          >
            <Feather name="camera" size={20} color="#FFF" />
            <Text style={styles.fallbackButtonText}>Otevřít kameru</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.fallbackRetryButton}
            onPress={() => {
              setCameraFailed(false);
              setIsCameraReady(false);
              setIsCameraActive(false);
              retryDelayRef.current = setTimeout(() => setIsCameraActive(true), 100);
            }}
            activeOpacity={0.8}
          >
            <Feather name="refresh-cw" size={16} color="rgba(255,255,255,0.7)" />
            <Text style={styles.fallbackRetryText}>Zkusit znovu</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      {isCameraActive && (
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          active={isCameraActive}
          onCameraReady={handleCameraReady}
          onMountError={handleMountError}
        >
          <View style={[styles.cameraHeader, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity onPress={onClose} style={styles.headerButton}>
              <Feather name="x" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.cameraTitle}>Skenovat doklad</Text>
            <TouchableOpacity onPress={pickFromGallery} style={styles.headerButton}>
              <Feather name="image" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.scanOverlay}>
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <Text style={styles.scanHint}>
              Zarovnejte doklad do rámečku
            </Text>
          </View>

          <View style={[styles.cameraControls, { paddingBottom: insets.bottom + 20 }]}>
            <TouchableOpacity
              style={styles.captureButton}
              onPress={takePicture}
              activeOpacity={0.7}
              disabled={isProcessing}
            >
              <View style={styles.captureInner}>
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#1A56DB" />
                ) : (
                  <Feather name="camera" size={28} color="#1A56DB" />
                )}
              </View>
            </TouchableOpacity>
          </View>
        </CameraView>
      )}
      {!isCameraReady && isCameraActive && (
        <View style={styles.cameraLoadingOverlay}>
          <ActivityIndicator size="large" color="#FFF" />
          <Text style={styles.cameraLoadingText}>Spouštění kamery...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  cameraHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraTitle: {
    color: "#FFF",
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  scanOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scanFrame: {
    width: 280,
    height: 380,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: "#FFF",
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },
  scanHint: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 20,
  },
  cameraControls: {
    alignItems: "center",
    paddingTop: 20,
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },
  permissionContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  closeButton: {
    position: "absolute",
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginTop: 8,
  },
  permissionText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  permissionButton: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: 8,
  },
  permissionButtonText: {
    color: "#FFF",
    fontSize: 16,
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
  cropOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  cropFrame: {
    width: "85%",
    aspectRatio: 0.7,
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
  cameraLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  cameraLoadingText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  fallbackContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  fallbackTitle: {
    color: "#FFF",
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  fallbackText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  fallbackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: 8,
  },
  fallbackButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  fallbackRetryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  fallbackRetryText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
