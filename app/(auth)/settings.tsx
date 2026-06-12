import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { getBackendUrl, setBackendUrl, getDefaultBackendUrl } from "../../src/services/config";
import { testConnection } from "../../src/services/api";

export default function SettingsScreen() {
  const [urlInput, setUrlInput] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "fail" | null>(null);

  useEffect(() => {
    const url = getBackendUrl();
    setUrlInput(url);
    setCurrentUrl(url);
  }, []);

  async function handleSave() {
    if (!urlInput.trim()) {
      Alert.alert("Validation Error", "Backend URL cannot be empty.");
      return;
    }

    try {
      await setBackendUrl(urlInput);
      const newUrl = getBackendUrl();
      setCurrentUrl(newUrl);
      setUrlInput(newUrl);
      Alert.alert("Success", "Backend URL updated successfully.");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to save URL.");
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const isReachable = await testConnection(urlInput);
      if (isReachable) {
        setTestResult("success");
      } else {
        setTestResult("fail");
      }
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  }

  async function handleResetToDefault() {
    const defaultUrl = getDefaultBackendUrl();
    setUrlInput(defaultUrl);
    try {
      await setBackendUrl(defaultUrl);
      setCurrentUrl(defaultUrl);
      setTestResult(null);
      Alert.alert("Reset Complete", "Backend URL has been reset to default.");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to reset URL.");
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Background glow orbs */}
      <View style={styles.glow1} />
      <View style={styles.glow2} />

      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Settings</Text>
          <View style={{ width: 60 }} /> {/* Spacer */}
        </View>

        {/* Current URL Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoLabel}>Current Backend URL:</Text>
          <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="tail">
            {currentUrl || "Not configured"}
          </Text>
        </View>

        {/* Input Form */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Backend URL</Text>
          <TextInput
            style={styles.input}
            value={urlInput}
            onChangeText={(text) => {
              setUrlInput(text);
              if (testResult) setTestResult(null);
            }}
            placeholder="http://192.168.1.100:3000"
            placeholderTextColor="#525252"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>

        {/* Test Result Indicator */}
        {testing && (
          <View style={styles.resultContainer}>
            <ActivityIndicator color="#f59e0b" size="small" />
            <Text style={styles.testingText}>Testing connection...</Text>
          </View>
        )}
        {!testing && testResult === "success" && (
          <View style={styles.resultContainer}>
            <Text style={styles.successText}>✓ Connection successful</Text>
          </View>
        )}
        {!testing && testResult === "fail" && (
          <View style={styles.resultContainer}>
            <Text style={styles.failText}>✗ Unable to reach server</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.testBtn]}
            onPress={handleTestConnection}
            disabled={testing}
          >
            <Text style={styles.testBtnText}>Test Connection</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.resetBtn]}
            onPress={handleResetToDefault}
          >
            <Text style={styles.resetBtnText}>Reset to Default</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, !urlInput.trim() && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!urlInput.trim()}
          activeOpacity={0.8}
        >
          <Text style={styles.saveButtonText}>Save Changes</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  glow1: {
    position: "absolute",
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "#f59e0b",
    opacity: 0.04,
  },
  glow2: {
    position: "absolute",
    bottom: -100,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "#ea580c",
    opacity: 0.04,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#111111",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  backButtonText: {
    color: "#a3a3a3",
    fontSize: 13,
    fontWeight: "600",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#f5f5f5",
    textAlign: "center",
  },
  infoSection: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#737373",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  infoValue: {
    fontSize: 14,
    color: "#e5e5e5",
    fontWeight: "700",
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: "#a3a3a3",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#f5f5f5",
  },
  resultContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    gap: 8,
  },
  testingText: {
    fontSize: 13,
    color: "#a3a3a3",
    fontWeight: "600",
  },
  successText: {
    fontSize: 13,
    color: "#22c55e",
    fontWeight: "700",
  },
  failText: {
    fontSize: 13,
    color: "#ef4444",
    fontWeight: "700",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  testBtn: {
    backgroundColor: "rgba(245,158,11,0.08)",
    borderColor: "rgba(245,158,11,0.3)",
  },
  testBtnText: {
    color: "#f59e0b",
    fontSize: 13,
    fontWeight: "700",
  },
  resetBtn: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderColor: "rgba(239,68,68,0.3)",
  },
  resetBtnText: {
    color: "#ef4444",
    fontSize: 13,
    fontWeight: "700",
  },
  saveButton: {
    backgroundColor: "#f59e0b",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveButtonDisabled: {
    backgroundColor: "#2a2a2a",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
