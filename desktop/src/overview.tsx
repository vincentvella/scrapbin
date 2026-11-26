import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ACCENT, Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Part } from '@/lib/db';
import { CATEGORIES, CATEGORY_LABELS, formatCount, type Category } from '@/lib/parts';

type Props = { parts: Part[]; dragging: boolean; category: Category | null; onPickCategory: (c: Category | null) => void; onAddPhotos: () => void };

/** The home pane: what's in the inventory by category, and where photos go. */
export function Overview({ parts, dragging, category, onPickCategory, onAddPhotos }: Props) {
  const theme = useTheme();
  const total = parts.reduce((n, p) => n + p.quantity, 0);
  const tiles = CATEGORIES.map((c) => {
    const inCat = parts.filter((p) => p.category === c);
    return { category: c, kinds: inCat.length, units: inCat.reduce((n, p) => n + p.quantity, 0) };
  }).filter((t) => t.kinds);

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View>
        <ThemedText type="subtitle" style={styles.title}>
          Inventory
        </ThemedText>
        <ThemedText themeColor="textSecondary">
          {parts.length} kinds of part · {formatCount(total)} pieces
        </ThemedText>
      </View>

      {tiles.length > 0 && (
        <View style={styles.grid}>
          {tiles.map((t) => (
            <Pressable
              key={t.category}
              accessibilityRole="button"
              accessibilityLabel={`${CATEGORY_LABELS[t.category]}, ${t.kinds} kinds, ${t.units} pieces`}
              accessibilityState={{ selected: category === t.category }}
              onPress={() => onPickCategory(category === t.category ? null : t.category)}
              onAccessibilityTap={() => onPickCategory(category === t.category ? null : t.category)}
              style={({ pressed }) => [
                styles.tile,
                { backgroundColor: theme.backgroundElement, borderColor: category === t.category ? ACCENT : 'transparent', opacity: pressed ? 0.7 : 1 },
              ]}>
              <ThemedText type="smallBold">{CATEGORY_LABELS[t.category]}</ThemedText>
              <ThemedText style={styles.tileNumber}>{formatCount(t.units)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t.kinds} {t.kinds === 1 ? 'kind' : 'kinds'}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      )}

      <View style={[styles.drop, { borderColor: dragging ? ACCENT : theme.backgroundSelected }]}>
        <ThemedText type="smallBold">{dragging ? 'Drop to add these photos' : 'Add more parts'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          Drop photos anywhere in this window. Claude Code identifies and counts the parts, then you review before anything is saved.
        </ThemedText>
        <Button title="Choose photos…" kind="secondary" size="small" onPress={onAddPhotos} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: Spacing.four, gap: Spacing.four, maxWidth: 860 },
  title: { fontSize: 26, lineHeight: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { width: 150, borderRadius: 12, borderWidth: 2, padding: Spacing.three, gap: 2 },
  tileNumber: { fontSize: 24, lineHeight: 30, fontWeight: 700, fontVariant: ['tabular-nums'] },
  drop: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 14, padding: Spacing.four, alignItems: 'center', gap: Spacing.two },
  center: { textAlign: 'center', maxWidth: 460 },
});
