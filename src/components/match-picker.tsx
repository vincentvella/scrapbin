import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { Part, ReviewItem } from '@/lib/db';
import { exactMatch, similarParts } from '@/lib/parts';

type Target = ReviewItem['target'];
type Props = { item: ReviewItem; inventory: Part[]; onChange: (target: Target) => void };

/**
 * Where a reviewed row goes: into a part it exactly matches, into a similar part the person picks
 * (adding to its count, or replacing it as a recount), or into a new part.
 */
export function MatchPicker({ item, inventory, onChange }: Props) {
  const exact = exactMatch(item, inventory);
  const similar = exact ? [] : similarParts(item, inventory);
  const target = item.target;
  const chosen = exact ?? similar.find((p) => p.id === target?.partId) ?? null;

  if (!exact && !similar.length) return null;
  const mode = target && chosen && target.partId === chosen.id ? target.mode : 'add';

  return (
    <View style={styles.wrap}>
      {exact ? (
        <ThemedText type="small" themeColor="textSecondary">
          Matches {exact.name} in your inventory (you have {exact.quantity}).
        </ThemedText>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Similar in your inventory:
          </ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label="Keep separate" selected={!chosen} onPress={() => onChange(undefined)} />
            {similar.map((p) => (
              <Chip
                key={p.id}
                label={`${p.name} · have ${p.quantity}`}
                selected={chosen?.id === p.id}
                onPress={() => onChange({ partId: p.id, mode: 'add' })}
              />
            ))}
          </ScrollView>
        </>
      )}
      {chosen && (
        <View style={styles.chips}>
          <Chip
            label={`Add ${item.quantity} (→ ${chosen.quantity + item.quantity})`}
            selected={mode === 'add'}
            onPress={() => onChange({ partId: chosen.id, mode: 'add' })}
          />
          <Chip
            label={`Replace count (→ ${item.quantity})`}
            selected={mode === 'set'}
            onPress={() => onChange({ partId: chosen.id, mode: 'set' })}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  chips: { flexDirection: 'row', gap: Spacing.one },
});
