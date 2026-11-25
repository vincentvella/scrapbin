import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PartFields } from '@/components/part-fields';
import { ThemedText } from '@/components/themed-text';
import { Button, Field, Stepper } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Part } from '@/lib/db';

import type { Api } from './server';

type ScanRef = { scan_id: number; quantity: number; created_at: string; photo_path: string };
type Props = {
  api: Api;
  id: number;
  photoUrl: (rel: string) => string;
  onOpenScan: (id: number) => void;
  onChanged: () => void;
  onDone: () => void;
};

/** One inventory part: edit it, see which scans it came from, delete it. */
export function PartPanel({ api, id, photoUrl, onOpenScan, onChanged, onDone }: Props) {
  const theme = useTheme();
  const [part, setPart] = useState<Part | null>(null);
  const [scans, setScans] = useState<ScanRef[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Part>(`/parts/${id}`).then(setPart);
    api<ScanRef[]>(`/parts/${id}/scans`).then(setScans);
  }, [api, id]);

  if (!part) return null;

  async function save() {
    setSaving(true);
    try {
      setPart(await api<Part>(`/parts/${id}`, { method: 'PUT', body: part }));
      onChanged();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function remove() {
    Alert.alert(`Delete ${part!.name}?`, 'It is removed from your inventory. Scan photos are kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => api(`/parts/${id}`, { method: 'DELETE' }).then(onDone) },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <ThemedText type="subtitle" style={styles.title}>
        {part.name || 'Part'}
      </ThemedText>
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
      <View style={styles.actions}>
        <Button title="Delete part" kind="danger" onPress={remove} />
        <Button title="Save" busy={saving} onPress={save} />
      </View>

      {scans.length > 0 && (
        <View style={styles.gap}>
          <ThemedText type="smallBold">From scans</ThemedText>
          {scans.map((s) => (
            <Pressable
              key={s.scan_id}
              accessibilityRole="button"
              accessibilityLabel={`Scan from ${new Date(s.created_at).toLocaleDateString()}, added ${s.quantity}`}
              onPress={() => onOpenScan(s.scan_id)}
              onAccessibilityTap={() => onOpenScan(s.scan_id)}
              style={[styles.scan, { backgroundColor: theme.backgroundElement }]}>
              <Image source={{ uri: photoUrl(s.photo_path) }} style={styles.thumb} />
              <ThemedText style={styles.flex}>{new Date(s.created_at).toLocaleString()}</ThemedText>
              <ThemedText themeColor="textSecondary">+{s.quantity}</ThemedText>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.four, gap: Spacing.three, maxWidth: 720 },
  title: { fontSize: 24, lineHeight: 30 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notes: { minHeight: 80, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  gap: { gap: Spacing.two },
  scan: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.two, borderRadius: 10 },
  thumb: { width: 44, height: 44, borderRadius: 6 },
});
