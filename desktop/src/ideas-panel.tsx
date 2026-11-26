import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, DANGER, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Part, SavedIdea } from '@/lib/db';

import type { Api } from './server';

export const DIFFICULTY_COLOR = { easy: '#30a46c', medium: '#f5a524', hard: '#e5484d' } as const;

/** How many of an idea's parts you're short of right now. */
export const shortCount = (idea: SavedIdea, inventory: Map<number, Part>) =>
  idea.uses.filter((u) => (inventory.get(u.partId)?.quantity ?? 0) < u.quantity).length;

/** "~4h · uses 15 of your parts · 1 to buy · 2 short" */
export function ideaFacts(idea: SavedIdea, inventory: Map<number, Part>) {
  const short = shortCount(idea, inventory);
  return [
    `~${idea.hours}h`,
    `uses ${idea.uses.length} of your parts`,
    idea.missing.length ? `${idea.missing.length} to buy` : 'nothing to buy',
    short ? `${short} short` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function DifficultyPill({ difficulty }: { difficulty: SavedIdea['difficulty'] }) {
  return (
    <View style={[styles.pill, { backgroundColor: DIFFICULTY_COLOR[difficulty] + '33' }]}>
      <ThemedText type="small" style={[styles.pillText, { color: DIFFICULTY_COLOR[difficulty] }]}>
        {difficulty}
      </ThemedText>
    </View>
  );
}

/** A brainstorm the server is running (or that failed; then `error` says why). */
export type BrainstormJob = { id: number; request: string; started_at: string; error: string | null };

type BrainstormProps = {
  api: Api;
  ideas: SavedIdea[];
  jobs: BrainstormJob[];
  newIds: Set<number>;
  inventory: Map<number, Part>;
  onChanged: () => void;
  onOpenIdea: (id: number) => void;
};

const since = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

/** Ask Claude Code for project ideas built from the inventory. Runs in the background; leave whenever you like. */
export function BrainstormPanel({ api, ideas, jobs, newIds, inventory, onChanged, onOpenIdea }: BrainstormProps) {
  const theme = useTheme();
  const [request, setRequest] = useState('');
  const [starting, setStarting] = useState(false);

  async function start(text: string) {
    setStarting(true);
    try {
      await api('/ideas', { method: 'POST', body: { request: text } });
      setRequest('');
      onChanged();
    } catch (e) {
      Alert.alert('Could not start the brainstorm', e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  async function dismiss(id: number) {
    await api(`/ideas/jobs/${id}`, { method: 'DELETE' }).catch(() => {});
    onChanged();
  }

  const running = jobs.filter((j) => !j.error);
  const failed = jobs.filter((j) => j.error);
  const fresh = ideas.filter((i) => newIds.has(i.id));

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <ThemedText type="subtitle" style={styles.title}>
        Brainstorm
      </ThemedText>
      <ThemedText themeColor="textSecondary">
        Claude Code reads your whole inventory and suggests projects you can build with it, with up to three cheap extras to buy
        and build steps. It runs in the background, so carry on while it works; new ideas appear in the sidebar.
      </ThemedText>
      <View style={styles.ask}>
        <Field
          accessibilityLabel="What do you want to build"
          placeholder="What do you want to build? (optional: “something for my desk”, “no soldering”)"
          value={request}
          onChangeText={setRequest}
          onSubmitEditing={() => start(request)}
          style={styles.flex}
        />
        <Button title="Brainstorm" busy={starting} onPress={() => start(request)} />
      </View>

      {running.map((j) => (
        <View key={j.id} style={[styles.job, { backgroundColor: theme.backgroundElement }]}>
          <ActivityIndicator />
          <ThemedText type="small" style={styles.flex}>
            Brainstorming{j.request ? ` “${j.request}”` : ''}… {since(j.started_at)} so far (usually a minute or two)
          </ThemedText>
        </View>
      ))}
      {failed.map((j) => (
        <View key={j.id} style={[styles.job, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.flex}>
            <ThemedText type="small" style={{ color: DANGER }}>
              Brainstorm{j.request ? ` “${j.request}”` : ''} failed: {j.error}
            </ThemedText>
          </View>
          <Button
            title="Retry"
            kind="secondary"
            size="small"
            onPress={() => {
              dismiss(j.id);
              start(j.request);
            }}
          />
          <Button title="Dismiss" kind="secondary" size="small" onPress={() => dismiss(j.id)} />
        </View>
      ))}

      {fresh.length > 0 && (
        <View style={styles.gap}>
          <ThemedText type="smallBold">New ideas</ThemedText>
          {fresh.map((idea) => (
            <Pressable
              key={idea.id}
              accessibilityRole="button"
              accessibilityLabel={`Open idea ${idea.title}`}
              onPress={() => onOpenIdea(idea.id)}
              onAccessibilityTap={() => onOpenIdea(idea.id)}
              style={({ pressed }) => [styles.card, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
              <View style={styles.titleLine}>
                <ThemedText type="smallBold" style={styles.cardTitle}>
                  {idea.title}
                </ThemedText>
                <DifficultyPill difficulty={idea.difficulty} />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {ideaFacts(idea, inventory)}
              </ThemedText>
              <ThemedText>{idea.summary}</ThemedText>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

type DetailProps = { api: Api; idea: SavedIdea; inventory: Map<number, Part>; onOpenPart: (id: number) => void; onDeleted: () => void };

/** One saved idea, in full: what it uses from the inventory, what to buy, how to build it. */
export function IdeaDetail({ api, idea, inventory, onOpenPart, onDeleted }: DetailProps) {
  const theme = useTheme();
  const short = shortCount(idea, inventory);

  function remove() {
    Alert.alert(`Delete “${idea.title}”?`, 'The idea is removed. Your parts are not touched.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => api(`/ideas/${idea.id}`, { method: 'DELETE' }).then(onDeleted, (e) => Alert.alert('Could not delete', String(e?.message ?? e))),
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View>
        <View style={styles.titleLine}>
          <ThemedText type="subtitle" style={styles.title}>
            {idea.title}
          </ThemedText>
          <DifficultyPill difficulty={idea.difficulty} />
        </View>
        <ThemedText themeColor="textSecondary" style={short ? { color: DANGER } : undefined}>
          {ideaFacts(idea, inventory)}
          {idea.request ? ` · for “${idea.request}”` : ''}
        </ThemedText>
      </View>
      <ThemedText>{idea.summary}</ThemedText>

      <View style={styles.gap}>
        <ThemedText type="smallBold">From your inventory</ThemedText>
        <View style={[styles.table, { borderColor: theme.backgroundSelected }]}>
          {idea.uses.map((u, i) => {
            const p = inventory.get(u.partId);
            const lack = !p ? 'not in inventory' : p.quantity < u.quantity ? `have ${p.quantity}` : null;
            const open = () => p && onOpenPart(p.id);
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`${u.quantity} ${p?.name ?? 'missing part'}, ${u.role}`}
                onPress={open}
                onAccessibilityTap={open}
                style={[styles.tr, i > 0 && { borderTopWidth: 1, borderColor: theme.backgroundSelected }]}>
                <ThemedText type="small" style={styles.qty}>
                  {u.quantity}×
                </ThemedText>
                <ThemedText type="small" style={[styles.part, lack ? { color: DANGER } : undefined]}>
                  {p ? [p.name, p.value].filter(Boolean).join(' ') : `part #${u.partId}`}
                  {lack ? ` (${lack})` : ''}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.role}>
                  {u.role}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {idea.missing.length > 0 && (
        <View style={styles.gap}>
          <ThemedText type="smallBold">To buy</ThemedText>
          {idea.missing.map((m, i) => (
            <ThemedText key={i} type="small">
              {m.quantity}× {m.name}
              {m.why ? <ThemedText type="small" themeColor="textSecondary">{` — ${m.why}`}</ThemedText> : null}
            </ThemedText>
          ))}
        </View>
      )}

      <View style={styles.gap}>
        <ThemedText type="smallBold">Build steps</ThemedText>
        {idea.steps.map((step, i) => (
          <View key={i} style={styles.step}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.stepNo}>
              {i + 1}
            </ThemedText>
            <ThemedText type="small" style={styles.flex}>
              {step}
            </ThemedText>
          </View>
        ))}
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel={`Delete idea ${idea.title}`} onPress={remove} onAccessibilityTap={remove} style={styles.deleteLink}>
        <ThemedText type="small" style={{ color: DANGER }}>
          Delete this idea…
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.four, gap: Spacing.three, maxWidth: 860 },
  title: { fontSize: 26, lineHeight: 32 },
  ask: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  gap: { gap: Spacing.two },
  job: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: 12 },
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.one },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  cardTitle: { fontSize: 17, lineHeight: 24 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  pillText: { fontSize: 12, fontWeight: 700 },
  table: { borderWidth: 1, borderRadius: 8 },
  tr: { flexDirection: 'row', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: 6 },
  qty: { width: 36, fontVariant: ['tabular-nums'], fontWeight: 700 },
  part: { flex: 3 },
  role: { flex: 2 },
  step: { flexDirection: 'row', gap: Spacing.two },
  stepNo: { width: 18, textAlign: 'right', fontWeight: 700 },
  deleteLink: { alignSelf: 'flex-start', paddingTop: Spacing.one },
});
