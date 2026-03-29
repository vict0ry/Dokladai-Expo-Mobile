import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Switch,
  ScrollView,
  Platform,
  Linking,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import Colors from "@/constants/colors";

interface SettingsScreenProps {
  onClose: () => void;
}

export default function SettingsScreen({ onClose }: SettingsScreenProps) {
  const { isBiometricAvailable, biometricType, isBiometricEnabled, toggleBiometric } = useAuth();
  const { hasPermission, requestPermission } = useNotifications();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const appVersion = Constants.expoConfig?.version || "1.0.0";

  async function handleBiometricToggle(value: boolean) {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await toggleBiometric(value);
  }

  async function handleNotificationPress() {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) {
        Linking.openSettings();
      }
    } else {
      Linking.openSettings();
    }
  }

  function handlePrivacyPolicy() {
    Linking.openURL("https://doklad.ai/privacy");
  }

  function handleTerms() {
    Linking.openURL("https://doklad.ai/terms");
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
        },
      ]}
    >
      <View
        style={[
          styles.header,
          {
            borderBottomColor: colors.border,
            paddingTop: Platform.OS === "web" ? 67 : insets.top + 10,
          },
        ]}
      >
        <TouchableOpacity onPress={onClose} style={styles.headerButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Nastavení</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ZABEZPEČENÍ</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.primary + "15" }]}>
                <Feather
                  name={biometricType === "Face ID" ? "eye" : "lock"}
                  size={18}
                  color={colors.primary}
                />
              </View>
              <View>
                <Text style={[styles.settingLabel, { color: colors.text }]}>
                  {biometricType || "Biometrické ověření"}
                </Text>
                <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                  {isBiometricAvailable
                    ? "Zamknout aplikaci při spuštění"
                    : "Není k dispozici na tomto zařízení"}
                </Text>
              </View>
            </View>
            <Switch
              value={isBiometricEnabled}
              onValueChange={handleBiometricToggle}
              disabled={!isBiometricAvailable}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFF"
            />
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>OZNÁMENÍ</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.settingRow} onPress={handleNotificationPress} activeOpacity={0.7}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: "#EF444415" }]}>
                <Feather name="bell" size={18} color="#EF4444" />
              </View>
              <View>
                <Text style={[styles.settingLabel, { color: colors.text }]}>
                  Push notifikace
                </Text>
                <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                  {hasPermission ? "Povoleno" : "Klepněte pro povolení"}
                </Text>
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: hasPermission ? "#10B98115" : "#F59E0B15" }]}>
              <Text style={{ color: hasPermission ? "#10B981" : "#F59E0B", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                {hasPermission ? "Aktivní" : "Vypnuto"}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PRÁVNÍ INFORMACE</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.settingRow} onPress={handlePrivacyPolicy} activeOpacity={0.7}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: "#8B5CF615" }]}>
                <Feather name="shield" size={18} color="#8B5CF6" />
              </View>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                Zásady ochrany osobních údajů
              </Text>
            </View>
            <Feather name="external-link" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <TouchableOpacity style={styles.settingRow} onPress={handleTerms} activeOpacity={0.7}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: "#06B6D415" }]}>
                <Feather name="file-text" size={18} color="#06B6D4" />
              </View>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                Podmínky používání
              </Text>
            </View>
            <Feather name="external-link" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>O APLIKACI</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.primary + "15" }]}>
                <Feather name="info" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Verze</Text>
            </View>
            <Text style={[styles.versionText, { color: colors.textSecondary }]}>{appVersion}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  settingLabel: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  settingDescription: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginLeft: 64,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  versionText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});
