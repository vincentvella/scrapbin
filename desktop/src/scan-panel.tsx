import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MatchPicker } from '@/components/match-picker';
import { PartFields } from '@/components/part-fields';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, DANGER, Segmented, Stepper } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useDefaultMatches } from '@/hooks/use-default-matches';
import { useTheme } from '@/hooks/use-theme';
import type { Part, ReviewItem, Scan } from '@/lib/db';
import { exactMatch, formatCount, parseDetectedParts, saveSummary, similarParts, type Confidence } from '@/lib/parts';

import type { Api } from './server';

type Row = ReviewItem & { rowId: number; matchChecked?: boolean };

const ORDER: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const COLOR: Record<Confidence, string> = { low: '#e5484d', medium: '#f5a524', high: '#30a46c' };

let nextRowId = 1;
const toRows = (raw: string): Row[] =>
  parseDetectedParts(raw)
    .sort((a, b) => ORDER[a.confidence] - ORDER[b.confidence])
    .map((p) => ({ ...p, rowId: nextRowId++ }));

/** Where a row will be saved, in words for the compact list. */
function destination(row: Row, inventory: Part[]) {
  const into = inventory.find((p) => p.id === row.target?.partId) ?? exactMatch(row, inventory);
  if (into) {
    const mode = row.target?.partId === into.id ? row.target.mode : 'add';
    return {
      into,
      text:
        mode === 'set'
          ? `replaces ${formatCount(into.quantity)} → ${formatCount(row.quantity)}`
          : `adds to ${formatCount(into.quantity)} → ${formatCount(into.quantity + row.quantity)}`,
    };
  }
  return { into: null, text: similarParts(row, inventory).length ? 'new part · similar ones exist' : 'new part' };
}

type Props = { api: Api; id: number; photoUrl: (rel: string) => string; onChanged: () => void; onDone: () => void };

/** Review one scan: run Claude on it if needed, check what it found, save to the inventory. */
export function ScanPanel({ api, id, photoUrl, onChanged, onDone }: Props) {
  const theme = useTheme();
  const [scan, setScan] = useState<Scan | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inventory, setInventory] = useState<Part[] | null>(null);

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
    api<Part[]>('/parts?search=').then(setInventory, () => {}); // on failure the new api re-runs this
  }, [api]);
  useDefaultMatches(inventory, rows, setRows);

  useEffect(() => {
    api<Scan>(`/scans/${id}`).then((s) => {
      show(s);
      if (s.status === 'pending') analyze();
    }, () => {});
  }, [api, id, show, analyze]);

  const update = (rowId: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  const inv = inventory ?? [];
  const summary = saveSummary(rows);
  const dest = rows.map((r) => destination(r, inv));
  const existing = dest.filter((d) => d.into).length;
  const modes = rows.filter((_, i) => dest[i].into).map((r) => r.target?.mode ?? 'add');
  const bulkMode = modes.length && modes.every((m) => m === modes[0]) ? modes[0] : null;

  /** Add to (or replace) the count of every part this scan matched. */
  function setAllModes(mode: 'add' | 'set') {
    setRows((rs) => rs.map((r, i) => (dest[i]?.into ? { ...r, target: { partId: dest[i].into!.id, mode } } : r)));
  }

  async function save() {
    if (!summary.items.length) return Alert.alert('Nothing to save', 'Every row is empty or set to zero.');
    setSaving(true);
    try {
      await api(`/scans/${id}/save`, { method: 'POST', body: { items: summary.items } });
      onDone();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  function remove() {
    Alert.alert('Delete this scan?', 'The photo is deleted too.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => api(`/scans/${id}`, { method: 'DELETE' }).then(onDone, (e) => Alert.alert('Could not delete', String(e?.message ?? e))) },
    ]);
  }

  if (!scan) return null;
  const reviewing = scan.status === 'analyzed' && !analyzing;

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
              <ThemedText style={{ color: DANGER }}>{scan.error ?? 'Not analyzed yet.'}</ThemedText>
            ) : scan.status === 'saved' ? (
              <ThemedText themeColor="textSecondary">This scan is already in your inventory.</ThemedText>
            ) : (
              <ThemedText>
                {rows.length
                  ? `${rows.length} ${rows.length === 1 ? 'part' : 'parts'} found · ${existing} already in your inventory · ${rows.length - existing} new`
                  : 'No parts found. Add them by hand below.'}
              </ThemedText>
            )}
            <View style={styles.inline}>
              {scan.status !== 'saved' && !analyzing && (
                <Button title={scan.status === 'analyzed' ? 'Re-analyze' : 'Retry'} kind="secondary" size="small" onPress={analyze} />
              )}
              <Button title="Delete scan" kind="secondary" size="small" onPress={remove} />
            </View>
          </View>
        </View>

        {reviewing && existing > 0 && (
          <View style={styles.bulk}>
            <ThemedText type="small" themeColor="textSecondary">
              For the {existing} {existing === 1 ? 'part' : 'parts'} you already have:
            </ThemedText>
            <View style={styles.bulkControl}>
              <Segmented
                label="Counts for parts you already have"
                value={bulkMode ?? 'mixed'}
                onChange={(m) => m !== 'mixed' && setAllModes(m)}
                options={[
                  { value: 'add', label: 'Add these counts' },
                  { value: 'set', label: 'Replace with these counts' },
                ]}
              />
            </View>
          </View>
        )}

        {reviewing && rows.length > 0 && (
          <View style={[styles.table, { borderColor: theme.backgroundSelected }]}>
            {rows.map((r, i) => (
              <ReviewRow
                key={r.rowId}
                row={r}
                where={dest[i].text}
                existing={!!dest[i].into}
                open={open === r.rowId}
                inventory={inv}
                onToggle={() => setOpen(open === r.rowId ? null : r.rowId)}
                onChange={(p) => update(r.rowId, p)}
                onRemove={() => setRows((rs) => rs.filter((x) => x.rowId !== r.rowId))}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {reviewing && (
        <View style={[styles.footer, { borderColor: theme.backgroundSelected, backgroundColor: theme.background }]}>
          <Button
            title="Add part"
            kind="secondary"
            size="small"
            onPress={() => {
              const rowId = nextRowId++;
              setRows((rs) => [...rs, { rowId, name: '', category: 'other', value: null, package: null, quantity: 1 }]);
              setOpen(rowId);
            }}
          />
          <View style={styles.flex} />
          <Button title={summary.label} busy={saving} disabled={!summary.items.length} onPress={save} />
        </View>
      )}
    </View>
  );
}

type RowProps = {
  row: Row;
  where: string;
  existing: boolean;
  open: boolean;
  inventory: Part[];
  onToggle: () => void;
  onChange: (p: Partial<Row>) => void;
  onRemove: () => void;
};

function ReviewRow({ row, where, existing, open, inventory, onToggle, onChange, onRemove }: RowProps) {
  const theme = useTheme();
  const detail = [row.value, row.package].filter(Boolean).join(' · ');
  return (
    <View style={[styles.row, { borderColor: theme.backgroundSelected }, open && { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.rowLine}>
        <View
          accessibilityLabel={row.confidence ? `${row.confidence} confidence` : 'added by hand'}
          style={[styles.dot, { backgroundColor: row.confidence ? COLOR[row.confidence] : theme.textSecondary }]}
        />
        <View style={styles.flex}>
          <ThemedText type="small" numberOfLines={1} style={styles.name}>
            {row.name || 'New part'}
            {detail ? <ThemedText type="small" themeColor="textSecondary">{`  ${detail}`}</ThemedText> : null}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={[styles.where, existing && styles.whereExisting]}>
            {where}
            {row.quantityIsEstimate ? ' · count is an estimate' : ''}
          </ThemedText>
        </View>
        <Stepper label={row.name || 'new part'} value={row.quantity} onChange={(quantity) => onChange({ quantity })} />
        <Chip label={open ? 'Done' : 'Edit'} selected={open} accessibilityLabel={`${open ? 'Done editing' : 'Edit'} ${row.name}`} onPress={onToggle} />
      </View>
      {open && (
        <View style={styles.editor}>
          <PartFields labeled part={row} onChange={(p) => onChange(p)} />
          <MatchPicker item={row} inventory={inventory} onChange={(target) => onChange({ target })} />
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${row.name}`} onPress={onRemove} onAccessibilityTap={onRemove} style={styles.removeLink}>
            <ThemedText type="small" style={{ color: DANGER }}>
              Remove from this scan
            </ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six, maxWidth: 900 },
  top: { flexDirection: 'row', gap: Spacing.four },
  photo: { width: 300, height: 225, borderRadius: 12 },
  summary: { flex: 1, gap: Spacing.two },
  title: { fontSize: 26, lineHeight: 32 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  bulk: { gap: Spacing.one },
  bulkControl: { maxWidth: 460 },
  table: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  row: { borderBottomWidth: 1 },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { fontWeight: 600 },
  where: { fontSize: 12, lineHeight: 16 },
  whereExisting: { color: '#30a46c' },
  editor: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.three },
  removeLink: { alignSelf: 'flex-start' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two, borderTopWidth: 1 },
});
