import { ActivityIndicator, Platform, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const ACCENT = '#3c87f7';
export const DANGER = '#e5484d';

type ButtonProps = {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  size?: 'regular' | 'small';
};

export function Button({ title, onPress, kind = 'primary', disabled, busy, size = 'regular' }: ButtonProps) {
  const theme = useTheme();
  const bg = kind === 'primary' ? ACCENT : kind === 'danger' ? DANGER : theme.backgroundElement;
  const fg = kind === 'secondary' ? theme.text : '#fff';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      onAccessibilityTap={disabled || busy ? undefined : onPress} // Basalt: lets VoiceOver/AXPress activate it
      style={({ pressed }) => [styles.button, size === 'small' && styles.buttonSmall, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
      {busy ? <ActivityIndicator color={fg} /> : <ThemedText type={size === 'small' ? 'small' : 'default'} style={{ color: fg, fontWeight: 600 }}>{title}</ThemedText>}
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      {...props}
      style={[styles.field, { color: theme.text, backgroundColor: theme.background, borderColor: theme.backgroundSelected }, props.style]}
    />
  );
}

type ChipProps = { label: string; selected?: boolean; onPress?: () => void; accessibilityLabel?: string };

export function Chip({ label, selected, onPress, accessibilityLabel }: ChipProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      onAccessibilityTap={onPress}
      style={[styles.chip, { backgroundColor: selected ? ACCENT : theme.backgroundSelected }]}>
      <ThemedText type="small" style={selected && { color: '#fff' }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function Stepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <View style={styles.stepper}>
      <Chip label="−" accessibilityLabel={`Decrease ${label}`} onPress={() => onChange(Math.max(0, value - 1))} />
      <ThemedText accessibilityLabel={`${label} quantity ${value}`} style={styles.qty}>
        {value}
      </ThemedText>
      <Chip label="+" accessibilityLabel={`Increase ${label}`} onPress={() => onChange(value + 1)} />
    </View>
  );
}

type SegmentedProps<T extends string | number> = {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Stack options (for long labels); default is side by side, equal widths. */
  vertical?: boolean;
};

// Basalt (macOS) doesn't route an accessibility press to radio-role views, so VoiceOver couldn't pick an option;
// there the options are buttons with a selected state, which VoiceOver reads as "selected".
const RADIOS_WORK = (Platform.OS as string) !== 'macos';

/** One choice out of a few, as a single control: exactly one option is selected (a radio group). */
export function Segmented<T extends string | number>({ label, options, value, onChange, vertical }: SegmentedProps<T>) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole={RADIOS_WORK ? 'radiogroup' : undefined}
      accessibilityLabel={label}
      style={[styles.segmented, vertical && styles.segmentedVertical, { borderColor: theme.backgroundSelected, backgroundColor: theme.background }]}>
      {options.map((o) => {
        const selected = o.value === value;
        const press = () => onChange(o.value);
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole={RADIOS_WORK ? 'radio' : 'button'}
            accessibilityLabel={o.label}
            accessibilityState={RADIOS_WORK ? { checked: selected } : { selected }}
            onPress={press}
            onAccessibilityTap={press}
            style={[styles.segment, !vertical && styles.segmentFlex, selected && { backgroundColor: ACCENT }]}>
            <ThemedText type="small" numberOfLines={2} style={[styles.segmentText, !vertical && styles.centered, selected && { color: '#fff', fontWeight: 700 }]}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 2, gap: 2 },
  segmentedVertical: { flexDirection: 'column' },
  segment: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center' },
  segmentFlex: { flex: 1 },
  segmentText: { lineHeight: 18 },
  centered: { textAlign: 'center' },
  button: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: Spacing.three, alignItems: 'center' },
  buttonSmall: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  field: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, minWidth: 36, alignItems: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  qty: { minWidth: 32, textAlign: 'center', fontVariant: ['tabular-nums'], fontWeight: 600 },
});
