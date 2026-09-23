import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { PARTS_ORDER_STATUS_LABELS, type PartsOrderWithSubmission } from '../../src/api';
import { useAuth } from '../../src/auth';
import { api } from '../../src/api';
import { colors, radius, spacing } from '../../src/theme';

const STATUS_COLORS: Record<string, string> = {
  NEEDED: '#64748b',
  ORDERED: '#0369a1',
  BACKORDERED: '#b91c1c',
  RECEIVED: '#15803d',
  INSTALLED: '#15803d',
  RETURNED: '#64748b',
};

/**
 * Shop-wide Parts Orders view — every part currently being sourced across
 * every open repair order, so a front-desk person can see at a glance
 * what's backordered/overdue without opening each RO individually. Mirrors
 * CCC ONE's Parts procurement tracking module.
 */
export default function PartsOrdersScreen() {
  const router = useRouter();
  const { token, loading: authLoading } = useAuth();
  const [items, setItems] = useState<PartsOrderWithSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const list = await api.getShopPartsOrders(token);
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
        <Text style={styles.title}>Parts Orders</Text>
        <Text style={styles.muted}>Every part on order or needed across all open repair orders.</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.muted}>Nothing outstanding — every part is received or installed.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Link href={`/portal/${item.submissionId}`} asChild>
            <Pressable style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.description}</Text>
                <Text style={styles.muted}>
                  {item.customerName} · {item.vehicleInfo ?? 'No vehicle info'}
                </Text>
                {item.supplier ? <Text style={styles.tiny}>Supplier: {item.supplier}</Text> : null}
                {item.expectedAt ? (
                  <Text style={styles.tiny}>Expected: {new Date(item.expectedAt).toLocaleDateString()}</Text>
                ) : null}
              </View>
              <View style={[styles.badge, { backgroundColor: STATUS_COLORS[item.status] ?? colors.muted }]}>
                <Text style={styles.badgeText}>{PARTS_ORDER_STATUS_LABELS[item.status]}</Text>
              </View>
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
  tiny: { fontSize: 11, color: colors.muted, marginTop: 2 },
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
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});

