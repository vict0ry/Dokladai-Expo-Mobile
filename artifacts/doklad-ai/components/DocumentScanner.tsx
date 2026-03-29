import React, { useState, useEffect } from "react";
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

interface DocumentScannerProps {
  onDocumentCaptured: (base64: string, filename: string) => void;
  onClose: () => void;
}

export default function DocumentScanner({ onDocumentCaptured, onClose }: DocumentScannerProps) {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!capturedImage) {
      launchCamera();
    }
  }, []);

  async function launchCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Přístup ke kameře",
        "Pro skenování dokladů potřebujeme přístup k vaší kameře. Povolte přístup v nastavení.",
        [
          { text: "Zrušit", style: "cancel", onPress: onClose },
          { text: "Otevřít nastavení", onPress: () => {
            import("react-native").then(({ Linking }) => Linking.openSettings());
            onClose();
          }},
        ]
      );
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) {
        onClose();
        return;
      }

      setCapturedImage(result.assets[0].uri);
    } catch {
      Alert.alert("Chyba", "Nepodařilo se otevřít kameru. Zkuste to znovu.");
      onClose();
    }
  }

  async function pickFromGallery() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setCapturedImage(result.assets[0].uri);
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
    launchCamera();
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
            Otevírám kameru...
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
