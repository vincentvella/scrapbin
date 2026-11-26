import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, View } from 'react-native';

import { PartFields } from '@/components/part-fields';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, DANGER, Stepper } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Part, ReviewItem, Scan } from '@/lib/db';
import { parseDetectedParts, saveSummary, type Confidence } from '@/lib/parts';

import { MatchPicker } from '@/components/match-picker';
import type { Api } from './server';

type Row = ReviewItem & { rowId: number };

const ORDER: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const COLOR: Record<Confidence, string> = { low: '#e5484d', medium: '#f5a524', high: '#30a46c' };

let nextRowId = 1;
const toRows = (raw: string): Row[] =>
  parseDetectedParts(raw)
    .sort((a, b) => ORDER[a.confidence] - ORDER[b.confidence])
    .map((p) => ({ ...p, rowId: nextRowId++ }));

type Props = { api: Api; id: number; photoUrl: (rel: string) => string; onChanged: () => void; onDone: () => void };

/** Review one scan: run Claude on it if needed, edit what it found, save to the inventory. */
export function ScanPanel({ api, id, photoUrl, onChanged, onDone }: Props) {
  const theme = useTheme();
  const [scan, setScan] = useState<Scan | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inventory, setInventory] = useState<Part[]>([]);

  const show = useCallback((s: Scan) => {
    setScan(s);
    if (s.status === 'analyzed' && s.raw_json) setRows(toRows(s.raw_json));
  }, []);

  const analyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      show(await api<Scan>(`/scans/${id}/analyze`, { method: 'POST' }));
      onChanged();
    } catch (e) {
      Alert.alert('Analysis failed', e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }, [api, id, show, onChanged]);

  useEffect(() => {
    api<Part[]>('/parts?search=').then(setInventory);
  }, [api]);

  useEffect(() => {
    api<Scan>(`/scans/${id}`).then((s) => {
      show(s);
      if (s.status === 'pending') analyze();
    });
  }, [api, id, show, analyze]);

  const update = (rowId: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  async function save() {
    const { items } = saveSummary(rows);
    if (!items.length) return Alert.alert('Nothing to save', 'Every row is empty or set to zero.');
    setSaving(true);
    try {
      await api(`/scans/${id}/save`, { method: 'POST', body: { items } });
      onDone();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  function remove() {
    Alert.alert('Delete this scan?', 'The photo is deleted too.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => api(`/scans/${id}`, { method: 'DELETE' }).then(onDone) },
    ]);
  }

  const summary = saveSummary(rows);

  if (!scan) return null;

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.top}>
          <Image source={{ uri: photoUrl(scan.photo_path) }} style={[styles.photo, { backgroundColor: theme.backgroundElement }]} resizeMode="contain" />
          <View style={styles.summary}>
            <ThemedText type="subtitle" style={styles.title}>
              Review scan
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {new Date(scan.created_at).toLocaleString()}
            </ThemedText>
            {analyzing ? (
              <View style={styles.inline}>
                <ActivityIndicator />
                <ThemedText themeColor="textSecondary">Claude Code is identifying parts… (10–60 s)</ThemedText>
              </View>
            ) : scan.status === 'failed' || scan.status === 'pending' ? (
              <>
                <ThemedText style={{ color: DANGER }}>{scan.error ?? 'Not analyzed yet.'}</ThemedText>
                <Button title="Retry" onPress={analyze} />
              </>
            ) : scan.status === 'saved' ? (
              <ThemedText themeColor="textSecondary">This scan is already in your inventory.</ThemedText>
            ) : (
              <>
                <ThemedText themeColor="textSecondary">
                  {rows.length ? 'Check each part; the least certain are first.' : 'No parts found. Add them by hand.'}
                </ThemedText>
                <Button title="Re-analyze" kind="secondary" onPress={analyze} />
              </>
            )}
            <Button title="Delete scan" kind="secondary" onPress={remove} />
          </View>
        </View>

        {scan.status === 'analyzed' && !analyzing && (
          <>
            {rows.map((r) => (
              <View key={r.rowId} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <View style={styles.cardHead}>
                  {r.confidence && <View accessibilityLabel={`${r.confidence} confidence`} style={[styles.dot, { backgroundColor: COLOR[r.confidence] }]} />}
                  <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                    {r.confidence ? `${r.confidence} confidence` : 'added by hand'}
                    {r.quantityIsEstimate ? ' · count is an estimate' : ''}
                  </ThemedText>
                  <Stepper label={r.name || 'new part'} value={r.quantity} onChange={(quantity) => update(r.rowId, { quantity })} />
                  <Chip label="Remove" onPress={() => setRows((rs) => rs.filter((x) => x.rowId !== r.rowId))} accessibilityLabel={`Remove ${r.name}`} />
                </View>
                <PartFields part={r} onChange={(p) => update(r.rowId, p)} />
                <MatchPicker item={r} inventory={inventory} onChange={(target) => update(r.rowId, { target })} />
              </View>
            ))}
            <View style={styles.actions}>
              <Button
                title="Add part"
                kind="secondary"
                onPress={() => setRows((rs) => [...rs, { rowId: nextRowId++, name: '', category: 'other', value: null, package: null, quantity: 1 }])}
              />
              <Button title={summary.label} busy={saving} disabled={!summary.items.length} onPress={save} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.four, gap: Spacing.three },
  top: { flexDirection: 'row', gap: Spacing.four },
  photo: { width: 360, height: 270, borderRadius: 12 },
  summary: { flex: 1, gap: Spacing.two },
  title: { fontSize: 24, lineHeight: 30 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  dot: { width: 10, height: 10, borderRadius: 5 },
  actions: { flexDirection: 'row', gap: Spacing.three, justifyContent: 'flex-end' },
});
