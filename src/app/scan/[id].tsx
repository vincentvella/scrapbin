import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PartFields } from '@/components/part-fields';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Chip, DANGER, Stepper } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getScan, saveScan, setScanAnalyzed, setScanFailed, type ReviewItem, type Scan } from '@/lib/db';
import { parseDetectedParts, saveSummary, type Confidence } from '@/lib/parts';
import { photoBase64, photoUri } from '@/lib/photos';
import { getApiKey, getModel } from '@/lib/settings';
import { analyzePhoto, describeError } from '@/lib/vision';

type Row = ReviewItem & { rowId: number; expanded: boolean };

const CONFIDENCE_ORDER: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const CONFIDENCE_COLOR: Record<Confidence, string> = { low: '#e5484d', medium: '#f5a524', high: '#30a46c' };

let nextRowId = 1;
const toRows = (raw: string): Row[] =>
  parseDetectedParts(raw)
    .sort((a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence])
    .map((p) => ({ ...p, rowId: nextRowId++, expanded: false }));

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scanId = Number(id);
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [scan, setScan] = useState<Scan | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const analyze = useCallback(
    async (s: Scan) => {
      const ctrl = new AbortController();
      abort.current = ctrl;
      setAnalyzing(true);
      try {
        const key = await getApiKey();
        if (!key) throw new Error('No API key. Add one in Settings.');
        const model = await getModel();
        const { raw } = await analyzePhoto(key, model, await photoBase64(s.photo_path), ctrl.signal);
        await setScanAnalyzed(db, s.id, model, raw);
        setRows(toRows(raw));
      } catch (e) {
        await setScanFailed(db, s.id, ctrl.signal.aborted ? 'Cancelled' : describeError(e));
      } finally {
        abort.current = null;
        setAnalyzing(false);
        setScan(await getScan(db, s.id));
      }
    },
    [db],
  );

  useEffect(() => {
    let live = true;
    getScan(db, scanId).then((s) => {
      if (!live || !s) return;
      setScan(s);
      if (s.status === 'pending') analyze(s);
      else if (s.status === 'analyzed' && s.raw_json) setRows(toRows(s.raw_json));
    });
    return () => {
      live = false;
      abort.current?.abort();
    };
  }, [db, scanId, analyze]);

  const update = (rowId: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  function addRow() {
    setRows((rs) => [
      ...rs,
      { rowId: nextRowId++, expanded: true, name: '', category: 'other', value: null, package: null, quantity: 1 },
    ]);
  }

  async function save() {
    const { items } = saveSummary(rows);
    if (!items.length) {
      Alert.alert('Nothing to save', 'Every row is empty or set to zero.');
      return;
    }
    setSaving(true);
    try {
      await saveScan(db, scanId, items);
      router.navigate('/');
    } catch (e) {
      Alert.alert('Could not save', describeError(e));
      setSaving(false);
    }
  }

  const summary = saveSummary(rows);

  if (!scan) return <ThemedView style={styles.flex} />;

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
        <Image source={{ uri: photoUri(scan.photo_path) }} style={styles.photo} contentFit="contain" />

        {analyzing ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <ThemedText themeColor="textSecondary">Identifying parts… this can take 10–30 seconds.</ThemedText>
            <Button title="Cancel" kind="secondary" onPress={() => abort.current?.abort()} />
          </View>
        ) : scan.status === 'failed' || scan.status === 'pending' ? (
          <View style={styles.center}>
            <ThemedText style={{ color: DANGER }}>{scan.error ?? 'Not analyzed yet.'}</ThemedText>
            <Button title="Retry" onPress={() => analyze(scan)} />
          </View>
        ) : scan.status === 'saved' ? (
          <ThemedText themeColor="textSecondary">This scan is already in your inventory.</ThemedText>
        ) : (
          <>
            <ThemedText themeColor="textSecondary">
              {rows.length ? 'Check each part. Least certain ones are listed first. Tap a part to edit it.' : 'No parts found. Add them by hand or retake the photo.'}
            </ThemedText>
            {rows.map((r) => (
              <ReviewRow key={r.rowId} row={r} onChange={(p) => update(r.rowId, p)} onRemove={() => setRows((rs) => rs.filter((x) => x.rowId !== r.rowId))} />
            ))}
            <Button title="Add part" kind="secondary" onPress={addRow} />
          </>
        )}
      </ScrollView>
      {scan.status === 'analyzed' && !analyzing && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two }]}>
          <Button title={summary.label} busy={saving} disabled={!summary.items.length} onPress={save} />
        </View>
      )}
    </ThemedView>
  );
}

function ReviewRow({ row, onChange, onRemove }: { row: Row; onChange: (p: Partial<Row>) => void; onRemove: () => void }) {
  const theme = useTheme();
  const detail = [row.category, row.value, row.package].filter(Boolean).join(' · ');
  return (
    <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.rowTop}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${row.name || 'new part'}`} style={styles.flex} onPress={() => onChange({ expanded: !row.expanded })}>
          <View style={styles.nameLine}>
            {row.confidence && (
              <View accessibilityLabel={`${row.confidence} confidence`} style={[styles.dot, { backgroundColor: CONFIDENCE_COLOR[row.confidence] }]} />
            )}
            <ThemedText numberOfLines={1} style={styles.flex}>
              {row.name || 'New part'}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {detail}
            {row.quantityIsEstimate ? ' · count is an estimate' : ''}
          </ThemedText>
        </Pressable>
        <Stepper label={row.name} value={row.quantity} onChange={(quantity) => onChange({ quantity })} />
      </View>
      {row.expanded && (
        <>
          <PartFields part={row} onChange={(p) => onChange(p)} />
          <View style={styles.rowActions}>
            <Chip label="Remove" onPress={onRemove} />
            <Chip label="Done" selected onPress={() => onChange({ expanded: false })} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.three, gap: Spacing.three, paddingBottom: 120 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12 },
  center: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.four },
  row: { borderRadius: 12, padding: Spacing.three, gap: Spacing.three },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowActions: { flexDirection: 'row', justifyContent: 'space-between' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
});
