import { Link, useRouter } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth';
import { api, type DashboardStats, type SubmissionSummary } from '../../src/api';
import { PrimaryButton } from '../../src/components/ui';
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
    <View style={[badgeStyles.badge, { backgroundColor: color }]}>
      <Text style={badgeStyles.text}>{priority.toUpperCase()}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  text: { color: '#fff', fontSize: 11, fontWeight: '800' },
});

export default function Dashboard() {
  const router = useRouter();
  const { token, shop, role, loading: authLoading, logout } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [items, setItems] = useState<SubmissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const [s, list] = await Promise.all([api.getStats(token), api.listSubmissions(token, { limit: 50 })]);
    setStats(s);
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
        <View>
          <Text style={styles.shopName}>{shop?.name}</Text>
          <Text style={styles.muted}>{shop?.ownerEmail}</Text>
        </View>
        <View style={styles.headerActions}>
          <Link href="/portal/settings" asChild>
            <Pressable>
              <Text style={styles.link}>Intake link & settings</Text>
            </Pressable>
          </Link>
          {role === 'OWNER' ? (
            <Link href="/portal/staff" asChild>
              <Pressable>
                <Text style={styles.link}>Manage staff</Text>
              </Pressable>
            </Link>
          ) : null}
          <Pressable
            onPress={() => {
              logout();
              router.replace('/portal/login');
            }}
          >
            <Text style={styles.logout}>Log out</Text>
          </Pressable>
        </View>
      </View>

      {stats ? (
        <View style={styles.statsRow}>
          <Stat label="Total" value={stats.total} />
          <Stat label="Emailed" value={stats.emailed} />
          <Stat label="Failed" value={stats.failed} />
          <Stat label="Last 7 days" value={stats.last7Days} />
        </View>
      ) : null}

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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  shopName: { fontSize: 18, fontWeight: '800', color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  link: { color: colors.primary, fontWeight: '600' },
  logout: { color: colors.danger, fontWeight: '600' },
  statsRow: { flexDirection: 'row', padding: spacing.md, gap: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 2 },
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
});





