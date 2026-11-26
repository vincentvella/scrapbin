import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PartFields } from '@/components/part-fields';
import { ThemedText } from '@/components/themed-text';
import { Button, DANGER, Field, Stepper } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Part, SavedIdea } from '@/lib/db';
import { CATEGORY_LABELS, formatCount } from '@/lib/parts';

import type { Api } from './server';

type ScanRef = { scan_id: number; quantity: number; created_at: string; photo_path: string };
type Props = {
  api: Api;
  id: number;
  photoUrl: (rel: string) => string;
  onOpenScan: (id: number) => void;
  onOpenIdea: (id: number) => void;
  onChanged: () => void;
  onDone: () => void;
};

const editable = (p: Part) => JSON.stringify([p.name, p.category, p.value, p.package, p.quantity, p.notes]);

/** One inventory part: edit it, see which scans it came from and which ideas need it. */
export function PartPanel({ api, id, photoUrl, onOpenScan, onOpenIdea, onChanged, onDone }: Props) {
  const theme = useTheme();
  const [saved, setSaved] = useState<Part | null>(null);
  const [part, setPart] = useState<Part | null>(null);
  const [scans, setScans] = useState<ScanRef[]>([]);
  const [ideas, setIdeas] = useState<{ id: number; title: string; quantity: number }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Part>(`/parts/${id}`).then((p) => {
      setSaved(p);
      setPart(p);
    }, () => {});
    api<ScanRef[]>(`/parts/${id}/scans`).then(setScans, () => {});
    api<SavedIdea[]>('/ideas').then(
      (list) => setIdeas(list.flatMap((i) => i.uses.filter((u) => u.partId === id).map((u) => ({ id: i.id, title: i.title, quantity: u.quantity })))),
      () => {},
    );
  }, [api, id]);

  if (!part || !saved) return null;
  const dirty = editable(part) !== editable(saved);
  const detail = [CATEGORY_LABELS[part.category], part.value, part.package].filter(Boolean).join(' · ');

  async function save() {
    setSaving(true);
    try {
      const p = await api<Part>(`/parts/${id}`, { method: 'PUT', body: part });
      setSaved(p);
      setPart(p);
      onChanged();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function remove() {
    Alert.alert(`Delete ${saved!.name}?`, 'It is removed from your inventory. Scan photos are kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => api(`/parts/${id}`, { method: 'DELETE' }).then(onDone, (e) => Alert.alert('Could not delete', String(e?.message ?? e))) },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <ThemedText type="subtitle" style={styles.title} numberOfLines={2}>
            {part.name || 'Untitled part'}
          </ThemedText>
          <ThemedText themeColor="textSecondary">{detail}</ThemedText>
        </View>
        <View style={styles.qtyBox}>
          <ThemedText type="small" themeColor="textSecondary">
            On hand
          </ThemedText>
          <Stepper label={part.name} value={part.quantity} onChange={(quantity) => setPart({ ...part, quantity })} />
        </View>
      </View>

      <Section title="Details">
        <PartFields labeled part={part} onChange={(p) => setPart({ ...part, ...p })} />
        <View style={styles.labeled}>
          <ThemedText type="small" themeColor="textSecondary">
            Notes
          </ThemedText>
          <Field
            accessibilityLabel="Notes"
            placeholder="Where it's stored, a datasheet link…"
            multiline
            value={part.notes ?? ''}
            onChangeText={(notes) => setPart({ ...part, notes: notes || null })}
            style={styles.notes}
          />
        </View>
        <View style={styles.actions}>
          {dirty && <Button title="Discard" kind="secondary" size="small" onPress={() => setPart(saved)} />}
          <Button title={dirty ? 'Save changes' : 'Saved'} size="small" busy={saving} disabled={!dirty} onPress={save} />
        </View>
      </Section>

      {ideas.length > 0 && (
        <Section title={`Used in ${ideas.length} saved ${ideas.length === 1 ? 'idea' : 'ideas'}`}>
          {ideas.map((i, n) => (
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityLabel={`Idea ${i.title}, needs ${i.quantity}`}
              onPress={() => onOpenIdea(i.id)}
              onAccessibilityTap={() => onOpenIdea(i.id)}
              style={[styles.line, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" style={styles.flex}>
                {i.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                needs {formatCount(i.quantity)}
              </ThemedText>
            </Pressable>
          ))}
        </Section>
      )}

      {scans.length > 0 && (
        <Section title="Added by scans">
          {scans.map((s) => (
            <Pressable
              key={s.scan_id}
              accessibilityRole="button"
              accessibilityLabel={`Scan from ${new Date(s.created_at).toLocaleDateString()}, added ${s.quantity}`}
              onPress={() => onOpenScan(s.scan_id)}
              onAccessibilityTap={() => onOpenScan(s.scan_id)}
              style={[styles.line, { backgroundColor: theme.backgroundElement }]}>
              <Image source={{ uri: photoUrl(s.photo_path) }} style={styles.thumb} />
              <ThemedText type="small" style={styles.flex}>
                {new Date(s.created_at).toLocaleString()}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                +{formatCount(s.quantity)}
              </ThemedText>
            </Pressable>
          ))}
        </Section>
      )}

      <Pressable accessibilityRole="button" accessibilityLabel="Delete part" onPress={remove} onAccessibilityTap={remove} style={styles.delete}>
        <ThemedText type="small" style={{ color: DANGER }}>
          Delete this part…
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.four, gap: Spacing.four, maxWidth: 760 },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.four },
  title: { fontSize: 26, lineHeight: 32 },
  qtyBox: { alignItems: 'flex-end', gap: Spacing.one },
  section: { gap: Spacing.two },
  labeled: { gap: Spacing.one },
  notes: { minHeight: 72, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 10 },
  thumb: { width: 36, height: 36, borderRadius: 6 },
  delete: { alignSelf: 'flex-start', paddingVertical: Spacing.one },
});
