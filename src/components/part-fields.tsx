import { ScrollView, StyleSheet, View } from 'react-native';

import { Chip, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { CATEGORIES, type Category } from '@/lib/parts';

export type PartFieldValues = { name: string; category: Category; value: string | null; package: string | null };

/** Name, category, value and package editors, shared by the review screen and part detail. */
export function PartFields({ part, onChange }: { part: PartFieldValues; onChange: (p: PartFieldValues) => void }) {
  return (
    <View style={styles.wrap}>
      <Field
        accessibilityLabel="Part name"
        placeholder="Name (e.g. NE555 timer)"
        value={part.name}
        onChangeText={(name) => onChange({ ...part, name })}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {CATEGORIES.map((c) => (
          <Chip key={c} label={c} selected={part.category === c} onPress={() => onChange({ ...part, category: c })} />
        ))}
      </ScrollView>
      <View style={styles.row}>
        <Field
          accessibilityLabel="Value"
          placeholder="Value (10kΩ)"
          style={styles.half}
          value={part.value ?? ''}
          onChangeText={(v) => onChange({ ...part, value: v || null })}
        />
        <Field
          accessibilityLabel="Package"
          placeholder="Package (DIP-8)"
          style={styles.half}
          value={part.package ?? ''}
          onChangeText={(v) => onChange({ ...part, package: v || null })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  chips: { gap: Spacing.one },
  row: { flexDirection: 'row', gap: Spacing.two },
  half: { flex: 1 },
});
