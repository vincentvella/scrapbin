import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createScan, deleteScan, unsavedScans, type Scan } from '@/lib/db';
import { deletePhoto, photoUri, pickPhoto, storePhoto } from '@/lib/photos';
import { getApiKey, getModel } from '@/lib/settings';

const STATUS_LABEL = { pending: 'Not analyzed', analyzed: 'Ready to review', failed: 'Failed', saved: 'Saved' } as const;

export default function ScanScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    getApiKey().then((k) => setHasKey(!!k));
    unsavedScans(db).then(setScans);
  }, [db]);
  useFocusEffect(refresh);

  async function start(source: 'camera' | 'library') {
    try {
      const asset = await pickPhoto(source);
      if (!asset) return;
      setBusy(true);
      const rel = await storePhoto(asset);
      const id = await createScan(db, rel, await getModel());
      router.push(`/scan/${id}`);
    } catch (e) {
      Alert.alert('Could not use that photo', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function remove(scan: Scan) {
    Alert.alert('Delete this scan?', 'The photo is deleted too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteScan(db, scan.id);
          deletePhoto(scan.photo_path);
          refresh();
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.body}>
          <ThemedText type="subtitle">Scan parts</ThemedText>
          {hasKey === false ? (
            <View style={styles.gap}>
              <ThemedText themeColor="textSecondary">Add your Anthropic API key first. Scrapbin sends photos straight to Claude with it.</ThemedText>
              <Button title="Open Settings" onPress={() => router.navigate('/settings')} />
            </View>
          ) : (
            <View style={styles.gap}>
              <ThemedText themeColor="textSecondary">
                Spread parts out on a plain background so none overlap. One kind of part per pile counts best.
              </ThemedText>
              <Button title="Take photo" busy={busy} disabled={hasKey === null} onPress={() => start('camera')} />
              <Button title="Choose from library" kind="secondary" disabled={busy || hasKey === null} onPress={() => start('library')} />
            </View>
          )}

          {scans.length > 0 && (
            <View style={styles.gap}>
              <ThemedText type="smallBold">Unfinished scans</ThemedText>
              {scans.map((s) => (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Scan from ${new Date(s.created_at).toLocaleString()}, ${STATUS_LABEL[s.status]}`}
                  onPress={() => router.push(`/scan/${s.id}`)}
                  onLongPress={() => remove(s)}
                  style={[styles.scan, { backgroundColor: theme.backgroundElement }]}>
                  <Image source={{ uri: photoUri(s.photo_path) }} style={styles.thumb} />
                  <View style={styles.flex}>
                    <ThemedText>{STATUS_LABEL[s.status]}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {new Date(s.created_at).toLocaleString()}
                      {s.error ? ` · ${s.error}` : ''}
                    </ThemedText>
                  </View>
                </Pressable>
              ))}
              <ThemedText type="small" themeColor="textSecondary">
                Long-press a scan to delete it.
              </ThemedText>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.three, gap: Spacing.four, paddingBottom: BottomTabInset + Spacing.four },
  gap: { gap: Spacing.three },
  scan: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.two, borderRadius: 12 },
  thumb: { width: 56, height: 56, borderRadius: 8 },
});
