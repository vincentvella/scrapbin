import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Field } from '@/components/ui';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listParts, type Part } from '@/lib/db';

export default function InventoryScreen() {
  const db = useSQLiteContext();
  const [search, setSearch] = useState('');
  const [parts, setParts] = useState<Part[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      listParts(db, search).then(setParts);
    }, [db, search]),
  );

  const total = parts?.reduce((n, p) => n + p.quantity, 0) ?? 0;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Inventory</ThemedText>
          {parts && parts.length > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {parts.length} {parts.length === 1 ? 'kind' : 'kinds'} · {total} {total === 1 ? 'part' : 'parts'}
            </ThemedText>
          )}
          <Field accessibilityLabel="Search parts" placeholder="Search" value={search} onChangeText={setSearch} clearButtonMode="while-editing" />
        </View>
        <FlatList
          data={parts ?? []}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <PartRow part={item} />}
          ListEmptyComponent={
            parts && !search ? (
              <View style={styles.empty}>
                <ThemedText themeColor="textSecondary">No parts yet. Scan a photo of your parts to start.</ThemedText>
                <Button title="Scan parts" onPress={() => router.navigate('/scan')} />
              </View>
            ) : parts ? (
              <ThemedText themeColor="textSecondary" style={styles.empty}>
                Nothing matches “{search}”.
              </ThemedText>
            ) : undefined
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function PartRow({ part }: { part: Part }) {
  const theme = useTheme();
  const detail = [part.value, part.package].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${part.name}, ${part.quantity}`}
      onPress={() => router.push(`/part/${part.id}`)}
      style={({ pressed }) => [styles.row, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.flex}>
        <ThemedText numberOfLines={1}>{part.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {part.category}
          {detail ? ` · ${detail}` : ''}
        </ThemedText>
      </View>
      <ThemedText style={styles.qty}>{part.quantity}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.two },
  list: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: BottomTabInset + Spacing.four },
  row: { flexDirection: 'row', alignItems: 'center', padding: Spacing.three, borderRadius: 12, gap: Spacing.three },
  qty: { fontSize: 20, fontWeight: 700, fontVariant: ['tabular-nums'] },
  empty: { gap: Spacing.three, paddingTop: Spacing.five },
});
