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

type BrainstormProps = {
  api: Api;
  ideas: SavedIdea[];
  inventory: Map<number, Part>;
  onIdeas: (ideas: SavedIdea[]) => void;
  onOpenIdea: (id: number) => void;
};

/** Ask Claude Code for project ideas built from the inventory. */
export function BrainstormPanel({ api, ideas, inventory, onIdeas, onOpenIdea }: BrainstormProps) {
  const theme = useTheme();
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<number[]>([]);

  async function brainstorm() {
    setBusy(true);
    try {
      const before = new Set(ideas.map((i) => i.id));
      const list = await api<SavedIdea[]>('/ideas', { method: 'POST', body: { request } });
      setFresh(list.filter((i) => !before.has(i.id)).map((i) => i.id));
      onIdeas(list);
      setRequest('');
    } catch (e) {
      Alert.alert('Brainstorm failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const shown = ideas.filter((i) => fresh.includes(i.id));

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <ThemedText type="subtitle" style={styles.title}>
        Brainstorm
      </ThemedText>
      <ThemedText themeColor="textSecondary">
        Claude Code reads your whole inventory and suggests projects you can build with it, with up to three cheap extras to buy
        and build steps. Ideas are saved in the sidebar until you delete them.
      </ThemedText>
      <View style={styles.ask}>
        <Field
          accessibilityLabel="What do you want to build"
          placeholder="What do you want to build? (optional: “something for my desk”, “no soldering”)"
          value={request}
          onChangeText={setRequest}
          onSubmitEditing={brainstorm}
          style={styles.flex}
        />
        <Button title="Brainstorm" busy={busy} onPress={brainstorm} />
      </View>
      {busy && (
        <View style={styles.inline}>
          <ActivityIndicator />
          <ThemedText themeColor="textSecondary">Claude Code is reading your inventory… this takes a minute or two.</ThemedText>
        </View>
      )}
      {shown.length > 0 && (
        <View style={styles.gap}>
          <ThemedText type="smallBold">New ideas</ThemedText>
          {shown.map((idea) => (
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
