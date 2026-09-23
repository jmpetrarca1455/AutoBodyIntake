import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SUBMISSION_STATUS_LABELS, submissionStatusValues, type SubmissionStatusValue } from '@autobody/shared';
import { useAuth } from '../../src/auth';
import { api, type SubmissionSummary } from '../../src/api';
import { colors, radius, spacing } from '../../src/theme';

const STATUS_COLORS: Record<string, string> = {
  RECEIVED: '#64748b',
  IN_REVIEW: '#a16207',
  EMAILED: '#0369a1',
  ESTIMATE_READY: '#7c3aed',
  IN_REPAIR: '#c2410c',
  READY_FOR_PICKUP: '#0891b2',
  COMPLETED: '#15803d',
  FAILED: '#b91c1c',
  ARCHIVED: '#64748b',
};

// The board's columns, left to right — the actual production flow. FAILED
// and ARCHIVED are intentionally left off the board (they're exceptions,
// not stages a car "moves through") and stay visible only in Customers.
const BOARD_COLUMNS: SubmissionStatusValue[] = submissionStatusValues.filter(
  (s) => s !== 'FAILED' && s !== 'ARCHIVED',
);

/**
 * Repair Workflow Board — a Kanban-style production board, one column per
 * repair stage. This is the screen a shop lives in day to day (the CCC ONE
 * equivalent of "Workflow"/"Production Management"): at a glance, how many
 * cars are at each stage, and which ones need to move next.
 */
export default function WorkflowBoard() {
  const router = useRouter();
  const { token, loading: authLoading } = useAuth();
  const [items, setItems] = useState<SubmissionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    const list = await api.listSubmissions(token, { limit: 200 });
    setItems(list.items);
  }, [token]);

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace('/portal/login');
      return;
    }
    if (token) {
      load()
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [authLoading, token, load, router]);

  const byStatus = useMemo(() => {
    const map = new Map<string, SubmissionSummary[]>();
    for (const col of BOARD_COLUMNS) map.set(col, []);
    for (const item of items) {
      if (!map.has(item.status)) continue; // FAILED/ARCHIVED excluded from the board
      map.get(item.status)!.push(item);
    }
    return map;
  }, [items]);

  if (authLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Repair Workflow</Text>
        <Text style={styles.muted}>Every open repair order, grouped by stage. Tap a card to open its file.</Text>
      </View>
      <ScrollView horizontal contentContainerStyle={styles.board} showsHorizontalScrollIndicator={false}>
        {BOARD_COLUMNS.map((col) => {
          const cars = byStatus.get(col) ?? [];
          return (
            <View key={col} style={styles.column}>
              <View style={styles.columnHeader}>
                <View style={[styles.dot, { backgroundColor: STATUS_COLORS[col] ?? colors.muted }]} />
                <Text style={styles.columnTitle}>{SUBMISSION_STATUS_LABELS[col]}</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{cars.length}</Text>
                </View>
              </View>
              <ScrollView style={styles.columnBody} showsVerticalScrollIndicator={false}>
                {cars.length === 0 ? (
                  <Text style={styles.emptyText}>Nothing here.</Text>
                ) : (
                  cars.map((c) => (
                    <Link key={c.id} href={`/portal/${c.id}`} asChild>
                      <Pressable style={styles.card}>
                        <Text style={styles.cardName}>{c.customerName}</Text>
                        <Text style={styles.cardVehicle}>{c.vehicleInfo ?? 'No vehicle info'}</Text>
                        {c.aiSummary?.priority ? (
                          <View
                            style={[
                              styles.priorityChip,
                              { backgroundColor: PRIORITY_COLORS[c.aiSummary.priority] ?? colors.muted },
                            ]}
                          >
                            <Text style={styles.priorityChipText}>{c.aiSummary.priority.toUpperCase()}</Text>
                          </View>
                        ) : null}
                      </Pressable>
                    </Link>
                  ))
                )}
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#b91c1c',
  high: '#c2410c',
  medium: '#a16207',
  low: '#15803d',
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { padding: spacing.lg, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 2 },
  muted: { fontSize: 13, color: colors.muted },
  board: { padding: spacing.md, gap: spacing.md, alignItems: 'flex-start' },
  column: {
    width: 260,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: '100%',
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  columnTitle: { fontSize: 13, fontWeight: '700', color: colors.text, flex: 1 },
  countBadge: {
    backgroundColor: colors.border,
    borderRadius: 999,
    minWidth: 22,
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  countBadgeText: { fontSize: 11, fontWeight: '800', color: colors.text },
  columnBody: { padding: spacing.sm },
  emptyText: { fontSize: 12, color: colors.muted, fontStyle: 'italic', padding: spacing.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardName: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  cardVehicle: { fontSize: 12, color: colors.muted, marginBottom: spacing.xs },
  priorityChip: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  priorityChipText: { fontSize: 10, fontWeight: '800', color: '#fff' },
});

