import { DropTarget, useDialog, useWindow } from 'basalt-core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ACCENT, Chip } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Part, SavedIdea, Scan } from '@/lib/db';
import type { Category } from '@/lib/parts';

import { BrainstormPanel, IdeaDetail } from './src/ideas-panel';
import { PartPanel } from './src/part-panel';
import { ScanPanel } from './src/scan-panel';
import { Overview } from './src/overview';
import { useServer, type Api } from './src/server';
import { InventoryDrawer, type QueuedScan, type Selection } from './src/inventory-drawer';
import { ProjectsSidebar } from './src/projects-sidebar';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'tiff', 'gif'];
const isImage = (path: string) => IMAGE_EXTENSIONS.includes(path.split('.').pop()?.toLowerCase() ?? '');


export default function App() {
  const server = useServer();
  const win = useWindow();
  const hasWindow = win.bounds.width > 0;

  useEffect(() => {
    if (!hasWindow) return; // sizing before the window exists is ignored
    win.setMinimumSize(1040, 600);
    win.setSize(1320, 820);
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
  const [category, setCategory] = useState<Category | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [scans, setScans] = useState<QueuedScan[]>([]);
  const [ideas, setIdeas] = useState<SavedIdea[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [dragging, setDragging] = useState(false);

  const refresh = useCallback(async () => {
    const [p, s, i] = await Promise.all([api<Part[]>('/parts?search='), api<QueuedScan[]>('/scans'), api<SavedIdea[]>('/ideas')]);
    setParts(p);
    setScans(s);
    setIdeas(i);
  }, [api]);

  useEffect(() => {
    // A failed load is transient (the server is restarting); useServer hands us a new api and this runs again.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh() sets state after an awaited fetch, not synchronously
    refresh().catch(() => {});
  }, [refresh]);

  // While the server works through a batch, refresh so the list shows each scan as it finishes.
  const working = scans.some((s) => s.status === 'pending' || s.analyzing);
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => refresh().catch(() => {}), 3000);
    return () => clearInterval(timer);
  }, [working, refresh]);

  const inventory = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);
  const openIdea = selection?.kind === 'idea' ? ideas.find((i) => i.id === selection.id) ?? null : null;
  const needed = useMemo(() => (openIdea ? new Map(openIdea.uses.map((u) => [u.partId, u.quantity])) : null), [openIdea]);

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

  const backHome = () => {
    setSelection(null);
    refresh().catch(() => {});
  };

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
      <ProjectsSidebar ideas={ideas} selection={selection} onSelect={setSelection} />

      <View style={styles.content}>
        {!drawerOpen && (
          <View style={styles.showDrawer}>
            <Chip label="Show inventory" onPress={() => setDrawerOpen(true)} />
          </View>
        )}
        {selection?.kind === 'brainstorm' ? (
          <BrainstormPanel
            api={api}
            ideas={ideas}
            inventory={inventory}
            onIdeas={setIdeas}
            onOpenIdea={(id) => setSelection({ kind: 'idea', id })}
          />
        ) : openIdea ? (
          <IdeaDetail
            key={`i${openIdea.id}`}
            api={api}
            idea={openIdea}
            inventory={inventory}
            onOpenPart={(id) => setSelection({ kind: 'part', id })}
            onDeleted={backHome}
          />
        ) : selection?.kind === 'scan' ? (
          <ScanPanel key={`s${selection.id}`} api={api} id={selection.id} photoUrl={photoUrl} onChanged={refresh} onDone={backHome} />
        ) : selection?.kind === 'part' ? (
          <PartPanel
            key={`p${selection.id}`}
            api={api}
            id={selection.id}
            photoUrl={photoUrl}
            onOpenScan={(id) => setSelection({ kind: 'scan', id })}
            onOpenIdea={(id) => setSelection({ kind: 'idea', id })}
            onDone={backHome}
            onChanged={refresh}
          />
        ) : (
          <Overview parts={parts} dragging={dragging} category={category} onPickCategory={setCategory} onAddPhotos={choosePhotos} />
        )}
      </View>

      {drawerOpen && (
        <InventoryDrawer
          parts={parts}
          scans={scans}
          search={search}
          onSearch={setSearch}
          selection={selection}
          onSelect={setSelection}
          onAddPhotos={choosePhotos}
          onHide={() => setDrawerOpen(false)}
          category={category}
          onClearCategory={() => setCategory(null)}
          needed={needed}
        />
      )}
      {dragging && <View pointerEvents="none" style={[styles.dropOverlay, { borderColor: ACCENT }]} />}
    </DropTarget>
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
  showDrawer: { position: 'absolute', top: Spacing.three, right: Spacing.three, zIndex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  error: { maxWidth: 560, textAlign: 'center' },
  dropOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 3, borderRadius: 12, margin: 6 },
});
