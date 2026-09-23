import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth';
import { api, type SubmissionSummary } from '../../src/api';
import { colors, radius, spacing } from '../../src/theme';

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#b91c1c',
  high: '#c2410c',
  medium: '#a16207',
  low: '#15803d',
};

function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority) return null;
  const color = PRIORITY_COLORS[priority] ?? colors.muted;
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{priority.toUpperCase()}</Text>
    </View>
  );
}

/**
 * Full customer/submission list (every repair order the shop has, newest
 * first) — the flat inbox view, separate from the Smart Queue (ranked by
 * urgency) and the Repair Workflow Board (grouped by stage). Reachable from
 * the Home dashboard's "Customers" card.
 */
export default function CustomersScreen() {
  const router = useRouter();
  const { token, loading: authLoading } = useAuth();
  const [items, setItems] = useState<SubmissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const list = await api.listSubmissions(token, { limit: 100 });
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

  async function onRefresh() {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
  }

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
        <Text style={styles.title}>Customers</Text>
        <Text style={styles.muted}>Every repair order on file, newest first.</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.muted}>No submissions yet. Share your intake link with customers!</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Link href={`/portal/${item.id}`} asChild>
            <Pressable style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.customerName}</Text>
                <Text style={styles.muted}>
                  {item.vehicleInfo ?? 'No vehicle info'} · {item.status}
                </Text>
              </View>
              <PriorityBadge priority={item.aiSummary?.priority} />
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  header: { padding: spacing.lg, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 2 },
  muted: { fontSize: 13, color: colors.muted },
  list: { padding: spacing.md, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});

