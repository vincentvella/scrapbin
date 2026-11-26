import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { Part, ReviewItem } from '@/lib/db';
import { exactMatch, similarParts } from '@/lib/parts';

type Target = ReviewItem['target'];
type Props = { item: ReviewItem; inventory: Part[]; onChange: (target: Target) => void };

const NEW = -1; // the "New part" option's value

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
            Looks like something you already have. Save as:
          </ThemedText>
          <Segmented
            label="Save as"
            vertical
            value={chosen?.id ?? NEW}
            onChange={(id) => onChange(id === NEW ? undefined : { partId: id, mode: 'add' })}
            options={[
              { value: NEW, label: 'A new part' },
              ...similar.map((p) => ({ value: p.id, label: `Add to ${p.name} (have ${p.quantity})` })),
            ]}
          />
        </>
      )}
      {chosen && (
        <Segmented
          label={`Count for ${chosen.name}`}
          value={mode}
          onChange={(m) => onChange({ partId: chosen.id, mode: m })}
          options={[
            { value: 'add', label: `Add ${item.quantity} (→ ${chosen.quantity + item.quantity})` },
            { value: 'set', label: `Replace with ${item.quantity}` },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
});
