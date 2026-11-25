import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

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
};

export function Button({ title, onPress, kind = 'primary', disabled, busy }: ButtonProps) {
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
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
      {busy ? <ActivityIndicator color={fg} /> : <ThemedText style={{ color: fg, fontWeight: 600 }}>{title}</ThemedText>}
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
      style={[styles.chip, { backgroundColor: selected ? ACCENT : theme.backgroundElement }]}>
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

const styles = StyleSheet.create({
  button: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: Spacing.three, alignItems: 'center' },
  field: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, minWidth: 36, alignItems: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  qty: { minWidth: 32, textAlign: 'center', fontVariant: ['tabular-nums'], fontWeight: 600 },
});
