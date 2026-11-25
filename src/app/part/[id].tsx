import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PartFields } from '@/components/part-fields';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Field, Stepper } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deletePart, getPart, partScans, updatePart, type Part } from '@/lib/db';
import { photoUri } from '@/lib/photos';

type ScanRef = Awaited<ReturnType<typeof partScans>>[number];

export default function PartScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const partId = Number(id);
  const db = useSQLiteContext();
  const theme = useTheme();
  const [part, setPart] = useState<Part | null>(null);
  const [scans, setScans] = useState<ScanRef[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPart(db, partId).then(setPart);
    partScans(db, partId).then(setScans);
  }, [db, partId]);

  if (!part) return <ThemedView style={styles.flex} />;

  async function save() {
    if (!part!.name.trim()) {
      Alert.alert('A part needs a name');
      return;
    }
    setSaving(true);
    try {
      await updatePart(db, { ...part!, name: part!.name.trim() });
      router.back();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  function remove() {
    Alert.alert(`Delete ${part!.name}?`, 'It is removed from your inventory. Scan photos are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePart(db, partId);
          router.back();
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: part.name || 'Part' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
        <PartFields part={part} onChange={(p) => setPart({ ...part, ...p })} />
        <View style={styles.qtyRow}>
          <ThemedText>Quantity</ThemedText>
          <Stepper label={part.name} value={part.quantity} onChange={(quantity) => setPart({ ...part, quantity })} />
        </View>
        <Field
          accessibilityLabel="Notes"
          placeholder="Notes (where it's stored, datasheet…)"
          multiline
          value={part.notes ?? ''}
          onChangeText={(notes) => setPart({ ...part, notes: notes || null })}
          style={styles.notes}
        />
        <Button title="Save" busy={saving} onPress={save} />

        {scans.length > 0 && (
          <View style={styles.gap}>
            <ThemedText type="smallBold">From scans</ThemedText>
            {scans.map((s) => (
              <Pressable
                key={s.scan_id}
                accessibilityRole="button"
                accessibilityLabel={`Scan from ${new Date(s.created_at).toLocaleDateString()}, added ${s.quantity}`}
                onPress={() => router.push(`/scan/${s.scan_id}`)}
                style={[styles.scan, { backgroundColor: theme.backgroundElement }]}>
                <Image source={{ uri: photoUri(s.photo_path) }} style={styles.thumb} />
                <ThemedText style={styles.flex}>{new Date(s.created_at).toLocaleDateString()}</ThemedText>
                <ThemedText themeColor="textSecondary">+{s.quantity}</ThemedText>
              </Pressable>
            ))}
          </View>
        )}

        <Button title="Delete part" kind="danger" onPress={remove} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notes: { minHeight: 80, textAlignVertical: 'top' },
  gap: { gap: Spacing.two },
  scan: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.two, borderRadius: 12 },
  thumb: { width: 44, height: 44, borderRadius: 6 },
});
