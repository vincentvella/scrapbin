import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Chip, DANGER, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Part, SavedIdea } from '@/lib/db';

import type { Api } from './server';

type Props = { api: Api; onCountChange: (n: number) => void };

/** Brainstorm projects from the inventory with Claude Code, and keep the ideas worth keeping. */
export function IdeasPanel({ api, onCountChange }: Props) {
  const [ideas, setIdeas] = useState<SavedIdea[]>([]);
  const [inventory, setInventory] = useState<Map<number, Part>>(new Map());
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<SavedIdea[]>('/ideas').then(setIdeas);
    api<Part[]>('/parts?search=').then((parts) => setInventory(new Map(parts.map((p) => [p.id, p]))));
  }, [api]);
  useEffect(() => onCountChange(ideas.length), [ideas.length, onCountChange]);

  async function brainstorm() {
    setBusy(true);
    try {
      setIdeas(await api<SavedIdea[]>('/ideas', { method: 'POST', body: { request } }));
      setRequest('');
    } catch (e) {
      Alert.alert('Brainstorm failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    await api(`/ideas/${id}`, { method: 'DELETE' });
    setIdeas((list) => list.filter((i) => i.id !== id));
  }

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <ThemedText type="subtitle" style={styles.title}>
        Project ideas
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
      {busy ? (
        <View style={styles.inline}>
          <ActivityIndicator />
          <ThemedText themeColor="textSecondary">Claude Code is reading your inventory… this takes a minute or two.</ThemedText>
        </View>
      ) : !ideas.length ? (
        <ThemedText themeColor="textSecondary">
          Ideas use parts you own (with up to three cheap extras to buy) and come with build steps. They&apos;re kept here until you delete them.
        </ThemedText>
      ) : null}
      {ideas.map((idea) => (
        <IdeaCard key={idea.id} idea={idea} inventory={inventory} onDelete={() => remove(idea.id)} />
      ))}
    </ScrollView>
  );
}

function IdeaCard({ idea, inventory, onDelete }: { idea: SavedIdea; inventory: Map<number, Part>; onDelete: () => void }) {
  const theme = useTheme();
  const [showSteps, setShowSteps] = useState(false);
  const meta = [idea.difficulty, `~${idea.hours}h`, idea.request && `for “${idea.request}”`].filter(Boolean).join(' · ');

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.cardHead}>
        <View style={styles.flex}>
          <ThemedText type="smallBold" style={styles.cardTitle}>
            {idea.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {meta}
          </ThemedText>
        </View>
        <Chip label="Delete" accessibilityLabel={`Delete idea ${idea.title}`} onPress={onDelete} />
      </View>
      <ThemedText>{idea.summary}</ThemedText>

      <ThemedText type="smallBold">From your inventory</ThemedText>
      {idea.uses.map((u, i) => {
        const p = inventory.get(u.partId);
        const short = !p ? 'no longer in your inventory' : p.quantity < u.quantity ? `you have ${p.quantity}` : null;
        return (
          <ThemedText key={i} type="small" style={short ? { color: DANGER } : undefined}>
            {u.quantity}× {p ? [p.name, p.value].filter(Boolean).join(' ') : `part #${u.partId}`}
            {u.role ? ` — ${u.role}` : ''}
            {short ? ` (${short})` : ''}
          </ThemedText>
        );
      })}
      {idea.missing.length > 0 && (
        <>
          <ThemedText type="smallBold">To buy</ThemedText>
          {idea.missing.map((m, i) => (
            <ThemedText key={i} type="small">
              {m.quantity}× {m.name}
              {m.why ? ` — ${m.why}` : ''}
            </ThemedText>
          ))}
        </>
      )}

      <View style={styles.row}>
        <Chip label={showSteps ? 'Hide steps' : `Show ${idea.steps.length} build steps`} onPress={() => setShowSteps(!showSteps)} />
      </View>
      {showSteps &&
        idea.steps.map((step, i) => (
          <ThemedText key={i} type="small">
            {i + 1}. {step}
          </ThemedText>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.four, gap: Spacing.three, maxWidth: 820 },
  title: { fontSize: 24, lineHeight: 30 },
  ask: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.one },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  cardTitle: { fontSize: 17, lineHeight: 24 },
  row: { flexDirection: 'row', paddingTop: Spacing.one },
});
