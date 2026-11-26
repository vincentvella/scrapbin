import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Chip, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { CATEGORIES, type Category } from '@/lib/parts';

export type PartFieldValues = { name: string; category: Category; value: string | null; package: string | null };

type Props = {
  part: PartFieldValues;
  onChange: (p: PartFieldValues) => void;
  /** Desktop layout: a label over each field, and category chips that wrap instead of scrolling. */
  labeled?: boolean;
};

/** Name, category, value and package editors, shared by the review screens and part detail. */
export function PartFields({ part, onChange, labeled }: Props) {
  const chips = CATEGORIES.map((c) => (
    <Chip key={c} label={c} selected={part.category === c} onPress={() => onChange({ ...part, category: c })} />
  ));
  return (
    <View style={styles.wrap}>
      <Labeled label="Name" show={labeled}>
        <Field
          accessibilityLabel="Part name"
          placeholder="Name (e.g. NE555 timer)"
          value={part.name}
          onChangeText={(name) => onChange({ ...part, name })}
        />
      </Labeled>
      <Labeled label="Category" show={labeled}>
        {labeled ? (
          <View style={styles.wrapChips}>{chips}</View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {chips}
          </ScrollView>
        )}
      </Labeled>
      <View style={styles.row}>
        <Labeled label="Value" show={labeled} style={styles.half}>
          <Field
            accessibilityLabel="Value"
            placeholder={labeled ? '10kΩ, 100nF, M3×8mm…' : 'Value (10kΩ)'}
            value={part.value ?? ''}
            onChangeText={(v) => onChange({ ...part, value: v || null })}
          />
        </Labeled>
        <Labeled label="Package" show={labeled} style={styles.half}>
          <Field
            accessibilityLabel="Package"
            placeholder={labeled ? 'DIP-8, 0805, 5mm…' : 'Package (DIP-8)'}
            value={part.package ?? ''}
            onChangeText={(v) => onChange({ ...part, package: v || null })}
          />
        </Labeled>
      </View>
    </View>
  );
}

function Labeled({ label, show, style, children }: { label: string; show?: boolean; style?: object; children: ReactNode }) {
  if (!show) return <View style={style}>{children}</View>;
  return (
    <View style={[styles.labeled, style]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  chips: { gap: Spacing.one },
  wrapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  row: { flexDirection: 'row', gap: Spacing.two },
  half: { flex: 1 },
  labeled: { gap: Spacing.one },
});
