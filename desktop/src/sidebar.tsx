import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Chip, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Part, Scan } from '@/lib/db';
import { CATEGORIES, CATEGORY_LABELS, formatCount, type Category } from '@/lib/parts';

export type QueuedScan = Scan & { analyzing?: boolean };
export type Selection = { kind: 'part' | 'scan'; id: number } | { kind: 'ideas' } | null;

const SCAN_LABEL = { pending: 'Queued', analyzed: 'Ready to review', failed: 'Failed', saved: 'Saved' } as const;

type Props = {
  parts: Part[];
  scans: QueuedScan[];
  search: string;
  onSearch: (s: string) => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
  ideaCount: number | null;
  onAddPhotos: () => void;
  /** Show only this category (picked from the overview). */
  category: Category | null;
  onClearCategory: () => void;
};

/** Navigation (inventory overview, ideas), unfinished scans, and the parts list grouped by category. */
export function Sidebar({ parts, scans, search, onSearch, selection, onSelect, ideaCount, onAddPhotos, category, onClearCategory }: Props) {
  const theme = useTheme();
  const total = parts.reduce((n, p) => n + p.quantity, 0);
  const groups = (category ? [category] : CATEGORIES).map((c) => ({ category: c, parts: parts.filter((p) => p.category === c) })).filter((g) => g.parts.length);

  return (
    <View style={[styles.sidebar, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
      <View style={styles.header}>
        <ThemedText type="smallBold" style={styles.brand}>
          Scrapbin
        </ThemedText>
        <Button title="Add photos…" size="small" onPress={onAddPhotos} />
      </View>

      <View style={styles.nav}>
        <NavItem
          title="Inventory"
          detail={search ? undefined : `${parts.length} kinds · ${formatCount(total)}`}
          selected={selection === null}
          onPress={() => onSelect(null)}
        />
        <NavItem
          title="Project ideas"
          detail={ideaCount ? String(ideaCount) : undefined}
          selected={selection?.kind === 'ideas'}
          onPress={() => onSelect({ kind: 'ideas' })}
        />
      </View>

      <View style={styles.search}>
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
                selected={selection?.kind === 'part' && selection.id === p.id}
                onPress={() => onSelect({ kind: 'part', id: p.id })}
              />
            ))}
          </View>
        ))}
        {!parts.length && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            {search ? `Nothing matches “${search}”.` : 'No parts yet. Add photos to start.'}
          </ThemedText>
        )}
      </ScrollView>
    </View>
  );
}

function NavItem({ title, detail, selected, onPress }: { title: string; detail?: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected }}
      onPress={onPress}
      onAccessibilityTap={onPress}
      style={[styles.navItem, selected && { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="smallBold" style={styles.flex}>
        {title}
      </ThemedText>
      {!!detail && (
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      )}
    </Pressable>
  );
}

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.heading}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.headingText}>
        {title.toUpperCase()}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {count}
      </ThemedText>
    </View>
  );
}

type RowProps = { title: string; subtitle?: string; trailing?: string; selected: boolean; onPress: () => void };

function Row({ title, subtitle, trailing, selected, onPress }: RowProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={trailing ? `${title}, ${trailing}` : title}
      onPress={onPress}
      onAccessibilityTap={onPress}
      style={[styles.row, selected && { backgroundColor: theme.backgroundSelected }]}>
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
        <ThemedText type="small" style={styles.qty}>
          {trailing}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sidebar: { width: 290, borderRightWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  brand: { fontSize: 17 },
  nav: { paddingHorizontal: Spacing.two, gap: 2 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: 7, borderRadius: 8 },
  search: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  searchField: { paddingVertical: 6, fontSize: 14 },
  filter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.two },
  list: { paddingHorizontal: Spacing.two, paddingBottom: Spacing.four },
  heading: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.two, paddingTop: Spacing.three, paddingBottom: Spacing.one },
  headingText: { fontSize: 11, fontWeight: 700, letterSpacing: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: 5, borderRadius: 6 },
  rowTitle: { lineHeight: 18 },
  rowSub: { fontSize: 12, lineHeight: 16 },
  qty: { fontWeight: 700, fontVariant: ['tabular-nums'] },
  empty: { padding: Spacing.two },
});
