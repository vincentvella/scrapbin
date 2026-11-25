import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Chip, Field } from '@/components/ui';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { getApiKey, getModel, MODELS, setApiKey, setModel } from '@/lib/settings';

export default function SettingsScreen() {
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [model, setModelState] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getApiKey().then(setSaved);
      getModel().then(setModelState);
    }, []),
  );

  async function saveKey() {
    const key = draft.trim();
    if (!key.startsWith('sk-ant-')) {
      Alert.alert('That does not look like an Anthropic key', 'Keys start with sk-ant-.');
      return;
    }
    await setApiKey(key);
    setSaved(key);
    setDraft('');
  }

  async function removeKey() {
    await setApiKey('');
    setSaved(null);
  }

  async function chooseModel(id: string) {
    await setModel(id);
    setModelState(id);
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
          <ThemedText type="subtitle">Settings</ThemedText>

          <View style={styles.gap}>
            <ThemedText type="smallBold">Anthropic API key</ThemedText>
            {saved ? (
              <>
                <ThemedText>Saved: sk-ant-…{saved.slice(-4)}</ThemedText>
                <Button title="Remove key" kind="secondary" onPress={removeKey} />
              </>
            ) : (
              <>
                <Field
                  accessibilityLabel="API key"
                  placeholder="sk-ant-…"
                  value={draft}
                  onChangeText={setDraft}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Button title="Save key" disabled={!draft.trim()} onPress={saveKey} />
              </>
            )}
            <ThemedText type="small" themeColor="textSecondary">
              Create a key at console.anthropic.com. It stays in this device&apos;s keychain and is only sent to
              Anthropic. Scans are billed to your account.
            </ThemedText>
          </View>

          <View style={styles.gap}>
            <ThemedText type="smallBold">Model</ThemedText>
            {MODELS.map((m) => (
              <View key={m.id} style={styles.model}>
                <Chip label={m.label} selected={model === m.id} onPress={() => chooseModel(m.id)} />
                <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                  {m.hint}
                </ThemedText>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.three, gap: Spacing.five, paddingBottom: BottomTabInset + Spacing.four },
  gap: { gap: Spacing.two },
  model: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});
