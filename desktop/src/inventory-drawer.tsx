import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ACCENT, Button, Chip, DANGER, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Part, Scan } from '@/lib/db';
import { CATEGORIES, CATEGORY_LABELS, formatCount, type Category } from '@/lib/parts';

export type QueuedScan = Scan & { analyzing?: boolean };
export type Selection =
  | { kind: 'part' | 'scan' | 'idea'; id: number }
  | { kind: 'brainstorm' }
  | null;

const SCAN_LABEL = { pending: 'Queued', analyzed: 'Ready to review', failed: 'Failed', saved: 'Saved' } as const;

/** Case-insensitive match on name, value, package or category label. */
const matches = (p: Part, q: string) =>
  !q || [p.name, p.value, p.package, CATEGORY_LABELS[p.category]].some((s) => s?.toLowerCase().includes(q));

type Props = {
  parts: Part[];
  scans: QueuedScan[];
  search: string;
  onSearch: (s: string) => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onAddPhotos: () => void;
  onHide: () => void;
  /** Show only this category (picked from the overview). */
  category: Category | null;
  onClearCategory: () => void;
  /** Parts the open idea uses, and how many it needs of each. */
  needed: Map<number, number> | null;
};

/** The right side: adding photos, unfinished scans, and every part, grouped by category. */
export function InventoryDrawer(props: Props) {
  const { parts, scans, search, onSearch, selection, onSelect, onAddPhotos, onHide, category, onClearCategory, needed } = props;
  const theme = useTheme();
  const q = search.trim().toLowerCase();
  const shown = parts.filter((p) => matches(p, q));
  const total = parts.reduce((n, p) => n + p.quantity, 0);
  const groups = (category ? [category] : CATEGORIES)
    .map((c) => ({ category: c, parts: shown.filter((p) => p.category === c) }))
    .filter((g) => g.parts.length);
  const forIdea = needed ? parts.filter((p) => needed.has(p.id)) : [];
  const isSelected = (id: number) => selection?.kind === 'part' && selection.id === id;

  return (
    <View style={[styles.drawer, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <ThemedText type="smallBold" style={styles.title}>
            Inventory
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {parts.length} kinds · {formatCount(total)} pieces
          </ThemedText>
        </View>
        <Chip label="Hide" accessibilityLabel="Hide inventory" onPress={onHide} />
      </View>
      <View style={styles.tools}>
        <Button title="Add photos…" size="small" onPress={onAddPhotos} />
        <Field accessibilityLabel="Search parts" placeholder="Search parts" value={search} onChangeText={onSearch} style={styles.searchField} />
        {category && (
          <View style={styles.filter}>
            <ThemedText type="small" themeColor="textSecondary">
              Showing {CATEGORY_LABELS[category]} only
            </ThemedText>
            <Chip label="Show all" onPress={onClearCategory} />
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {forIdea.length > 0 && (
          <View style={[styles.forIdea, { borderColor: ACCENT }]}>
            <SectionHeading title="For this idea" count={forIdea.length} />
            {forIdea.map((p) => {
              const need = needed!.get(p.id)!;
              const short = p.quantity < need;
              return (
                <Row
                  key={`n${p.id}`}
                  title={p.name}
                  subtitle={`needs ${formatCount(need)}${[p.value, p.package].filter(Boolean).length ? ` · ${[p.value, p.package].filter(Boolean).join(' · ')}` : ''}`}
                  trailing={formatCount(p.quantity)}
                  warn={short}
                  selected={isSelected(p.id)}
                  onPress={() => onSelect({ kind: 'part', id: p.id })}
                />
              );
            })}
          </View>
        )}

        {scans.length > 0 && (
          <>
            <SectionHeading title="Unfinished scans" count={scans.length} />
            {scans.map((s) => (
              <Row
                key={`s${s.id}`}
                title={s.analyzing ? 'Analyzing…' : SCAN_LABEL[s.status]}
                subtitle={new Date(s.created_at).toLocaleString()}
                selected={selection?.kind === 'scan' && selection.id === s.id}
                onPress={() => onSelect({ kind: 'scan', id: s.id })}
              />
            ))}
          </>
        )}
        {groups.map((g) => (
          <View key={g.category}>
            <SectionHeading title={CATEGORY_LABELS[g.category]} count={g.parts.length} />
            {g.parts.map((p) => (
              <Row
                key={p.id}
                title={p.name}
                subtitle={[p.value, p.package].filter(Boolean).join(' · ') || undefined}
                trailing={formatCount(p.quantity)}
                marked={needed?.has(p.id)}
                selected={isSelected(p.id)}
                onPress={() => onSelect({ kind: 'part', id: p.id })}
              />
            ))}
          </View>
        ))}
        {!shown.length && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            {search ? `Nothing matches “${search}”.` : 'No parts yet. Add photos to start.'}
          </ThemedText>
        )}
      </ScrollView>
    </View>
  );
}

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.heading}>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={[styles.headingText, styles.flex]}>
        {title.toUpperCase()}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {count}
      </ThemedText>
    </View>
  );
}

type RowProps = {
  title: string;
  subtitle?: string;
  trailing?: string;
  selected: boolean;
  /** Used by the open idea (a dot in the margin). */
  marked?: boolean;
  /** You have fewer than the open idea needs. */
  warn?: boolean;
  onPress: () => void;
};

function Row({ title, subtitle, trailing, selected, marked, warn, onPress }: RowProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={trailing ? `${title}, ${trailing}${marked ? ', used by this idea' : ''}` : title}
      onPress={onPress}
      onAccessibilityTap={onPress}
      style={[styles.row, selected && { backgroundColor: theme.backgroundSelected }]}>
      <View style={[styles.mark, marked && { backgroundColor: ACCENT }]} />
      <View style={styles.flex}>
        <ThemedText type="small" numberOfLines={1} style={styles.rowTitle}>
          {title}
        </ThemedText>
        {!!subtitle && (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.rowSub}>
            {subtitle}
          </ThemedText>
        )}
      </View>
      {!!trailing && (
        <ThemedText type="small" style={[styles.qty, warn && { color: DANGER }]}>
          {trailing}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  drawer: { width: 300, borderLeftWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.three },
  title: { fontSize: 17 },
  tools: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.two },
  searchField: { paddingVertical: 6, fontSize: 14 },
  filter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  list: { paddingHorizontal: Spacing.two, paddingBottom: Spacing.four },
  forIdea: { borderLeftWidth: 2, marginTop: Spacing.two, paddingBottom: Spacing.one },
  heading: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.two, paddingTop: Spacing.three, paddingBottom: Spacing.one },
  headingText: { fontSize: 11, fontWeight: 700, letterSpacing: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingRight: Spacing.two, paddingVertical: 5, borderRadius: 6 },
  mark: { width: 4, alignSelf: 'stretch', borderRadius: 2, marginLeft: 2 },
  rowTitle: { lineHeight: 18 },
  rowSub: { fontSize: 12, lineHeight: 16 },
  qty: { fontWeight: 700, fontVariant: ['tabular-nums'] },
  empty: { padding: Spacing.two },
});
