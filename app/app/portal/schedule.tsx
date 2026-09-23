import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth';
import { api, type SubmissionSummary } from '../../src/api';
import { colors, radius, spacing } from '../../src/theme';

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Scheduling — every repair order with a scheduled drop-off or pickup,
 * soonest first. The scoped-down version of CCC ONE's appointment booking
 * module: no bay/capacity planning yet, just a clear "what's happening
 * when" list a front-desk person can scan each morning.
 */
export default function ScheduleScreen() {
  const router = useRouter();
  const { token, loading: authLoading } = useAuth();
  const [items, setItems] = useState<SubmissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const list = await api.getSchedule(token);
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
        <Text style={styles.title}>Scheduling</Text>
        <Text style={styles.muted}>
          Upcoming drop-offs and pickups. Set a date from a customer's file to see it here.
        </Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.muted}>No appointments scheduled yet.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const dropoff = formatDate(item.dropoffScheduledAt);
          const pickup = formatDate(item.pickupScheduledAt);
          return (
            <Link href={`/portal/${item.id}`} asChild>
              <Pressable style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.customerName}</Text>
                  <Text style={styles.muted}>{item.vehicleInfo ?? 'No vehicle info'}</Text>
                  <View style={styles.chipsRow}>
                    {dropoff ? (
                      <View style={[styles.chip, { backgroundColor: '#0369a1' }]}>
                        <Text style={styles.chipText}>Drop-off {dropoff}</Text>
                      </View>
                    ) : null}
                    {pickup ? (
                      <View style={[styles.chip, { backgroundColor: '#15803d' }]}>
                        <Text style={styles.chipText}>Pickup {pickup}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            </Link>
          );
        }}
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
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  chipText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});

