import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { SavedIdea } from '@/lib/db';

import { DifficultyPill } from './ideas-panel';
import type { Selection } from './inventory-drawer';

type Props = { ideas: SavedIdea[]; selection: Selection; onSelect: (s: Selection) => void };

/** The left side: where you are (overview, brainstorm) and the projects you've saved. */
export function ProjectsSidebar({ ideas, selection, onSelect }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.sidebar, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
      <ThemedText type="smallBold" style={styles.brand}>
        Scrapbin
      </ThemedText>
      <View style={styles.nav}>
        <NavItem title="Overview" selected={selection === null} onPress={() => onSelect(null)} />
        <NavItem title="Brainstorm ideas" selected={selection?.kind === 'brainstorm'} onPress={() => onSelect({ kind: 'brainstorm' })} />
      </View>
      <View style={styles.heading}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.headingText}>
          SAVED IDEAS
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {ideas.length}
        </ThemedText>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {ideas.map((idea) => {
          const selected = selection?.kind === 'idea' && selection.id === idea.id;
          const open = () => onSelect({ kind: 'idea', id: idea.id });
          return (
            <Pressable
              key={idea.id}
              accessibilityRole="button"
              accessibilityLabel={`Idea ${idea.title}`}
              accessibilityState={{ selected }}
              onPress={open}
              onAccessibilityTap={open}
              style={[styles.idea, selected && { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="small" numberOfLines={2} style={styles.ideaTitle}>
                {idea.title}
              </ThemedText>
              <View style={styles.meta}>
                <DifficultyPill difficulty={idea.difficulty} />
                <ThemedText type="small" themeColor="textSecondary" style={styles.metaText}>
                  ~{idea.hours}h · {idea.missing.length ? `${idea.missing.length} to buy` : 'nothing to buy'}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
        {!ideas.length && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            No saved ideas yet. Brainstorm some from your parts.
          </ThemedText>
        )}
      </ScrollView>
    </View>
  );
}

function NavItem({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected }}
      onPress={onPress}
      onAccessibilityTap={onPress}
      style={[styles.navItem, selected && { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="smallBold">{title}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sidebar: { width: 250, borderRightWidth: 1 },
  brand: { fontSize: 17, paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  nav: { paddingHorizontal: Spacing.two, gap: 2 },
  navItem: { paddingHorizontal: Spacing.two, paddingVertical: 7, borderRadius: 8 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingTop: Spacing.four, paddingBottom: Spacing.one },
  headingText: { fontSize: 11, fontWeight: 700, letterSpacing: 0.6 },
  list: { paddingHorizontal: Spacing.two, paddingBottom: Spacing.four, gap: 2 },
  idea: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, borderRadius: 8, gap: 4 },
  ideaTitle: { fontWeight: 600, lineHeight: 18 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  metaText: { fontSize: 12 },
  empty: { padding: Spacing.two },
});
