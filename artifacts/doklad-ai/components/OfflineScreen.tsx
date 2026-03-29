import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

interface OfflineScreenProps {
  lastUrl: string | null;
  onRetry: () => void;
}

export default function OfflineScreen({ lastUrl, onRetry }: OfflineScreenProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: Platform.OS === "web" ? 67 : insets.top,
          paddingBottom: Platform.OS === "web" ? 34 : insets.bottom,
        },
      ]}
    >
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: colors.surface }]}>
          <Feather name="wifi-off" size={40} color={colors.textSecondary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>
          Jste offline
        </Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          Zkontrolujte připojení k internetu.{"\n"}
          Aplikace se automaticky obnoví po připojení.
        </Text>
        {lastUrl && (
          <View style={[styles.lastUrlContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="clock" size={14} color={colors.textSecondary} />
            <Text style={[styles.lastUrlText, { color: colors.textSecondary }]} numberOfLines={1}>
              Poslední stránka: {lastUrl.replace("https://doklad.ai", "")}
            </Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.retryButton, { backgroundColor: colors.primary }]}
        onPress={onRetry}
        activeOpacity={0.8}
      >
        <Feather name="refresh-cw" size={18} color="#FFF" />
        <Text style={styles.retryText}>Zkusit znovu</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  content: {
    alignItems: "center",
    marginBottom: 40,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  lastUrlContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: "100%",
  },
  lastUrlText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    gap: 8,
  },
  retryText: {
    color: "#FFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
