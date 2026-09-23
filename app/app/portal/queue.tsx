import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth';
import { api, type QueueItem } from '../../src/api';
import { colors, radius, spacing } from '../../src/theme';

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#b91c1c',
  high: '#c2410c',
  medium: '#a16207',
  low: '#15803d',
};

/**
 * The "Smart Queue" — a shop-wide worklist ranked by what actually needs
 * attention right now (AI priority + age + missing info), not just newest
 * first. This is the screen a front-desk person opens each morning to know
 * exactly what to work on next, instead of scanning a plain inbox.
 */
export default function SmartQueue() {
  const router = useRouter();
  const { token, loading: authLoading } = useAuth();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const list = await api.getQueue(token);
    setItems(list);
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
        <Text style={styles.title}>Today's priorities</Text>
        <Text style={styles.muted}>Ranked by urgency, age, and missing info — work top to bottom.</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.muted}>Nothing in the queue right now.</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <Link href={`/portal/${item.id}`} asChild>
            <Pressable style={styles.row}>
              <View style={styles.rank}>
                <Text style={styles.rankText}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.customerName}</Text>
                <Text style={styles.muted}>{item.vehicleInfo ?? 'No vehicle info'}</Text>
                <Text style={styles.reason}>{item.queueReason}</Text>
              </View>
              {item.priority ? (
                <View style={[styles.badge, { backgroundColor: PRIORITY_COLORS[item.priority] ?? colors.muted }]}>
                  <Text style={styles.badgeText}>{item.priority.toUpperCase()}</Text>
                </View>
              ) : (
                <View style={[styles.badge, { backgroundColor: colors.muted }]}>
                  <Text style={styles.badgeText}>NEW</Text>
                </View>
              )}
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
  reason: { fontSize: 12, color: colors.primary, marginTop: 2, fontWeight: '600' },
  list: { padding: spacing.md, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontWeight: '800', color: colors.text, fontSize: 13 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});

