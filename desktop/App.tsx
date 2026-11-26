import { DropTarget, useDialog, useWindow } from 'basalt-core';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ACCENT, Button, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Part, Scan } from '@/lib/db';

import { IdeasPanel } from './src/ideas-panel';
import { PartPanel } from './src/part-panel';
import { ScanPanel } from './src/scan-panel';
import { useServer, type Api } from './src/server';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'tiff', 'gif'];
const isImage = (path: string) => IMAGE_EXTENSIONS.includes(path.split('.').pop()?.toLowerCase() ?? '');

/** A scan as the server lists it: `analyzing` while Claude Code is on it. */
type QueuedScan = Scan & { analyzing?: boolean };

const SCAN_LABEL = { pending: 'Queued', analyzed: 'Ready to review', failed: 'Failed', saved: 'Saved' } as const;

export type Selection = { kind: 'part' | 'scan'; id: number } | { kind: 'ideas' } | null;

export default function App() {
  const server = useServer();
  const win = useWindow();
  const hasWindow = win.bounds.width > 0;

  useEffect(() => {
    if (!hasWindow) return; // sizing before the window exists is ignored
    win.setMinimumSize(860, 560);
    win.setSize(1180, 780);
    win.center();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the window appears
  }, [hasWindow]);

  if (server.status !== 'ready') {
    return (
      <ThemedView style={styles.center}>
        {server.status === 'starting' ? (
          <>
            <ActivityIndicator />
            <ThemedText themeColor="textSecondary">Starting Scrapbin…</ThemedText>
          </>
        ) : (
          <>
            <ThemedText type="smallBold">Scrapbin&apos;s local server didn&apos;t start</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.error}>
              {server.error}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              It needs bun and Claude Code (`claude`) on your PATH.
            </ThemedText>
          </>
        )}
      </ThemedView>
    );
  }
  return <Main api={server.api} photoUrl={server.photoUrl} />;
}

function Main({ api, photoUrl }: { api: Api; photoUrl: (rel: string) => string }) {
  const theme = useTheme();
  const dialog = useDialog();
  const [search, setSearch] = useState('');
  const [parts, setParts] = useState<Part[]>([]);
  const [scans, setScans] = useState<QueuedScan[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [dragging, setDragging] = useState(false);
  const [ideaCount, setIdeaCount] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const [p, s] = await Promise.all([
      api<Part[]>(`/parts?search=${encodeURIComponent(search)}`),
      api<QueuedScan[]>('/scans'),
    ]);
    setParts(p);
    setScans(s);
  }, [api, search]);

  useEffect(() => {
    refresh().catch((e) => Alert.alert('Could not load the inventory', String(e?.message ?? e)));
  }, [refresh]);

  // While the server works through a batch, refresh so the list shows each scan as it finishes.
  const working = scans.some((s) => s.status === 'pending' || s.analyzing);
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => refresh().catch(() => {}), 3000);
    return () => clearInterval(timer);
  }, [working, refresh]);

  useEffect(() => {
    api<unknown[]>('/ideas').then((list) => setIdeaCount(list.length), () => {});
  }, [api]);

  async function addPhotos(paths: readonly string[]) {
    const images = paths.filter(isImage);
    if (!images.length) {
      Alert.alert('No photos there', 'Drop or choose JPEG, PNG or HEIC images.');
      return;
    }
    let last: Scan | null = null;
    for (const path of images) {
      try {
        last = await api<Scan>('/scans', { method: 'POST', body: { path } });
      } catch (e) {
        Alert.alert('Could not add that photo', `${path}\n${e instanceof Error ? e.message : e}`);
      }
    }
    await refresh();
    if (last) setSelection({ kind: 'scan', id: last.id });
  }

  async function choosePhotos() {
    const { canceled, paths } = await dialog.openFile({
      title: 'Choose photos of your parts',
      multiple: true,
      filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }],
    });
    if (!canceled && paths?.length) await addPhotos(paths);
  }

  const total = parts.reduce((n, p) => n + p.quantity, 0);

  return (
    <DropTarget
      accepts={['files']}
      style={[styles.root, { backgroundColor: theme.background }]}
      onDragOver={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      onDrop={({ files }) => {
        setDragging(false);
        addPhotos(files);
      }}>
      <View style={[styles.sidebar, { borderColor: theme.backgroundSelected }]}>
        <View style={styles.sideHeader}>
          <ThemedText type="subtitle" style={styles.brand}>
            Scrapbin
          </ThemedText>
          <Button title="Add photos…" onPress={choosePhotos} />
          <Row
            title="Project ideas"
            subtitle={ideaCount ? `${ideaCount} saved` : 'Brainstorm from your parts'}
            selected={selection?.kind === 'ideas'}
            onPress={() => setSelection({ kind: 'ideas' })}
          />
          <Field accessibilityLabel="Search parts" placeholder="Search parts" value={search} onChangeText={setSearch} />
          <ThemedText type="small" themeColor="textSecondary">
            {parts.length} {parts.length === 1 ? 'kind' : 'kinds'} · {total} {total === 1 ? 'part' : 'parts'}
          </ThemedText>
        </View>
        <ScrollView contentContainerStyle={styles.list}>
          {scans.length > 0 && (
            <>
              <ThemedText type="smallBold" style={styles.section}>
                Unfinished scans
              </ThemedText>
              {scans.map((s) => (
                <Row
                  key={`s${s.id}`}
                  title={s.analyzing ? 'Analyzing…' : SCAN_LABEL[s.status]}
                  subtitle={new Date(s.created_at).toLocaleString()}
                  selected={selection?.kind === 'scan' && selection.id === s.id}
                  onPress={() => setSelection({ kind: 'scan', id: s.id })}
                />
              ))}
              <ThemedText type="smallBold" style={styles.section}>
                Parts
              </ThemedText>
            </>
          )}
          {parts.map((p) => (
            <Row
              key={`p${p.id}`}
              title={p.name}
              subtitle={[p.category, p.value, p.package].filter(Boolean).join(' · ')}
              trailing={String(p.quantity)}
              selected={selection?.kind === 'part' && selection.id === p.id}
              onPress={() => setSelection({ kind: 'part', id: p.id })}
            />
          ))}
          {!parts.length && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.section}>
              {search ? `Nothing matches “${search}”.` : 'No parts yet.'}
            </ThemedText>
          )}
        </ScrollView>
      </View>

      <View style={styles.content}>
        {selection?.kind === 'ideas' ? (
          <IdeasPanel api={api} onCountChange={setIdeaCount} />
        ) : selection?.kind === 'scan' ? (
          <ScanPanel
            key={`s${selection.id}`}
            api={api}
            id={selection.id}
            photoUrl={photoUrl}
            onChanged={refresh}
            onDone={() => {
              setSelection(null);
              refresh();
            }}
          />
        ) : selection?.kind === 'part' ? (
          <PartPanel
            key={`p${selection.id}`}
            api={api}
            id={selection.id}
            photoUrl={photoUrl}
            onOpenScan={(id) => setSelection({ kind: 'scan', id })}
            onDone={() => {
              setSelection(null);
              refresh();
            }}
            onChanged={refresh}
          />
        ) : (
          <View style={styles.center}>
            <ThemedText type="smallBold">Drop photos of your parts here</ThemedText>
            <ThemedText themeColor="textSecondary">
              Or use Add photos. Claude Code identifies and counts them, then you review before saving.
            </ThemedText>
          </View>
        )}
      </View>
      {dragging && <View pointerEvents="none" style={[styles.dropOverlay, { borderColor: ACCENT }]} />}
    </DropTarget>
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
        <ThemedText numberOfLines={1}>{title}</ThemedText>
        {!!subtitle && (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        )}
      </View>
      {!!trailing && <ThemedText style={styles.qty}>{trailing}</ThemedText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 300, borderRightWidth: 1 },
  sideHeader: { padding: Spacing.three, gap: Spacing.two },
  brand: { fontSize: 24, lineHeight: 30 },
  list: { paddingHorizontal: Spacing.two, paddingBottom: Spacing.four },
  section: { paddingHorizontal: Spacing.two, paddingTop: Spacing.three, paddingBottom: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, borderRadius: 8 },
  qty: { fontWeight: 700, fontVariant: ['tabular-nums'] },
  content: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  error: { maxWidth: 560, textAlign: 'center' },
  dropOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 3, borderRadius: 12, margin: 6 },
});
