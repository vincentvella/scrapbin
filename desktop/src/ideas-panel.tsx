import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, DANGER, Field } from '@/components/ui';
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
    // Background loads: on failure (server restarting) the new api re-runs this effect.
    api<SavedIdea[]>('/ideas').then(setIdeas, () => {});
    api<Part[]>('/parts?search=').then((parts) => setInventory(new Map(parts.map((p) => [p.id, p]))), () => {});
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

const DIFFICULTY_COLOR = { easy: '#30a46c', medium: '#f5a524', hard: '#e5484d' } as const;

function IdeaCard({ idea, inventory, onDelete }: { idea: SavedIdea; inventory: Map<number, Part>; onDelete: () => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const short = idea.uses.filter((u) => (inventory.get(u.partId)?.quantity ?? 0) < u.quantity).length;
  const toggle = () => setOpen(!open);
  const facts = [
    `~${idea.hours}h`,
    `uses ${idea.uses.length} of your parts`,
    idea.missing.length ? `${idea.missing.length} to buy` : 'nothing to buy',
    short ? `${short} short` : null,
  ].filter(Boolean);

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${open ? 'Collapse' : 'Expand'} ${idea.title}`} onPress={toggle} onAccessibilityTap={toggle} style={styles.cardHead}>
        <View style={styles.flex}>
          <View style={styles.titleLine}>
            <ThemedText type="smallBold" style={styles.cardTitle}>
              {idea.title}
            </ThemedText>
            <View style={[styles.pill, { backgroundColor: DIFFICULTY_COLOR[idea.difficulty] + '33' }]}>
              <ThemedText type="small" style={[styles.pillText, { color: DIFFICULTY_COLOR[idea.difficulty] }]}>
                {idea.difficulty}
              </ThemedText>
            </View>
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={short ? { color: DANGER } : undefined}>
            {facts.join(' · ')}
            {idea.request ? ` · for “${idea.request}”` : ''}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {open ? 'Hide' : 'Details'}
        </ThemedText>
      </Pressable>
      <ThemedText>{idea.summary}</ThemedText>

      {open && (
        <View style={styles.details}>
          <ThemedText type="smallBold">From your inventory</ThemedText>
          <View style={[styles.table, { borderColor: theme.backgroundSelected }]}>
            {idea.uses.map((u, i) => {
              const p = inventory.get(u.partId);
              const lack = !p ? 'not in inventory' : p.quantity < u.quantity ? `have ${p.quantity}` : null;
              return (
                <View key={i} style={[styles.tr, i > 0 && { borderTopWidth: 1, borderColor: theme.backgroundSelected }]}>
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
                </View>
              );
            })}
          </View>

          {idea.missing.length > 0 && (
            <>
              <ThemedText type="smallBold">To buy</ThemedText>
              {idea.missing.map((m, i) => (
                <ThemedText key={i} type="small">
                  {m.quantity}× {m.name}
                  {m.why ? <ThemedText type="small" themeColor="textSecondary">{` — ${m.why}`}</ThemedText> : null}
                </ThemedText>
              ))}
            </>
          )}

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

          <Pressable accessibilityRole="button" accessibilityLabel={`Delete idea ${idea.title}`} onPress={onDelete} onAccessibilityTap={onDelete} style={styles.deleteLink}>
            <ThemedText type="small" style={{ color: DANGER }}>
              Delete this idea
            </ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.four, gap: Spacing.three, maxWidth: 860 },
  title: { fontSize: 26, lineHeight: 32 },
  ask: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  cardTitle: { fontSize: 17, lineHeight: 24 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  pillText: { fontSize: 12, fontWeight: 700 },
  details: { gap: Spacing.two, paddingTop: Spacing.one },
  table: { borderWidth: 1, borderRadius: 8 },
  tr: { flexDirection: 'row', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: 6 },
  qty: { width: 36, fontVariant: ['tabular-nums'], fontWeight: 700 },
  part: { flex: 3 },
  role: { flex: 2 },
  step: { flexDirection: 'row', gap: Spacing.two },
  stepNo: { width: 18, textAlign: 'right', fontWeight: 700 },
  deleteLink: { alignSelf: 'flex-start', paddingTop: Spacing.one },
});
