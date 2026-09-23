import { useRouter } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useAuth } from '../../src/auth';
import { api, type DashboardStats, type ShopDigest } from '../../src/api';
import { NavCard } from '../../src/components/ui';
import { colors, radius, spacing } from '../../src/theme';

/**
 * Home dashboard — the shop's landing page after login. Shows an AI-
 * generated daily digest (the "walk in and already know what today looks
 * like" feature), top-line stats, then a grid of navigation cards to every
 * module (Smart Queue, Repair Workflow Board, Customers, Scheduling, Parts
 * Orders, Reports, Staff, Settings) — the same "hub of services" pattern
 * CCC ONE uses to tie its Estimating/Workflow/Parts/Payments modules
 * together.
 */
export default function Dashboard() {
  const router = useRouter();
  const { shop, role, loading: authLoading, logout, token } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [digest, setDigest] = useState<ShopDigest | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    const s = await api.getStats(token);
    setStats(s);
  }, [token]);

  const loadDigest = useCallback(async () => {
    if (!token) return;
    setDigestLoading(true);
    try {
      const d = await api.getDigest(token);
      setDigest(d);
    } catch {
      // Digest is a nice-to-have — never block the dashboard on it.
    } finally {
      setDigestLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace('/portal/login');
      return;
    }
    if (token) {
      Promise.all([load(), loadDigest()])
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [authLoading, token, load, loadDigest, router]);

  if (authLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.shopName}>{shop?.name}</Text>
          <Text style={styles.muted}>{shop?.ownerEmail}</Text>
        </View>
        <Pressable
          onPress={() => {
            logout();
            router.replace('/portal/login');
          }}
        >
          <Text style={styles.logout}>Log out</Text>
        </Pressable>
      </View>

      <View style={styles.digestCard}>
        <View style={styles.digestHeaderRow}>
          <Text style={styles.digestLabel}>✨ AI Daily Digest</Text>
          <Pressable onPress={loadDigest} disabled={digestLoading}>
            <Text style={styles.digestRefresh}>{digestLoading ? 'Refreshing…' : 'Refresh'}</Text>
          </Pressable>
        </View>
        {digest ? (
          <>
            <Text style={styles.digestHeadline}>{digest.headline}</Text>
            <Text style={styles.digestNarrative}>{digest.narrative}</Text>
            {digest.topPriorities.length > 0 ? (
              <View style={styles.digestColumns}>
                <View style={styles.digestColumn}>
                  <Text style={styles.digestColumnTitle}>Top priorities</Text>
                  {digest.topPriorities.map((p, i) => (
                    <Text key={i} style={styles.digestBullet}>
                      • {p}
                    </Text>
                  ))}
                </View>
                {digest.watchouts.length > 0 ? (
                  <View style={styles.digestColumn}>
                    <Text style={styles.digestColumnTitle}>Watch out for</Text>
                    {digest.watchouts.map((w, i) => (
                      <Text key={i} style={styles.digestBullet}>
                        • {w}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        ) : (
          <Text style={styles.muted}>No digest yet.</Text>
        )}
      </View>

      {stats ? (
        <View style={styles.statsRow}>
          <Stat label="Total" value={stats.total} />
          <Stat label="Emailed" value={stats.emailed} />
          <Stat label="Failed" value={stats.failed} />
          <Stat label="Last 7 days" value={stats.last7Days} />
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Modules</Text>
      <View style={styles.grid}>
        <NavCard
          icon="⚡️"
          title="Smart Queue"
          description="Today's priorities, ranked by urgency and age."
          onPress={() => router.push('/portal/queue')}
        />
        <NavCard
          icon="🗂️"
          title="Repair Workflow"
          description="Every vehicle by repair stage — the shop's production board."
          onPress={() => router.push('/portal/workflow')}
        />
        <NavCard
          icon="🚗"
          title="Customers"
          description="Full list of repair orders, newest first."
          onPress={() => router.push('/portal/customers')}
        />
        <NavCard
          icon="📅"
          title="Scheduling"
          description="Upcoming drop-off and pickup appointments."
          onPress={() => router.push('/portal/schedule')}
        />
        <NavCard
          icon="🔧"
          title="Parts Orders"
          description="Every part on order across all open ROs."
          onPress={() => router.push('/portal/parts')}
        />
        <NavCard
          icon="📊"
          title="Reports"
          description="Cycle time, RO value, and shop KPIs."
          onPress={() => router.push('/portal/reports')}
        />
        {role === 'OWNER' ? (
          <NavCard
            icon="👥"
            title="Staff"
            description="Invite and manage team logins."
            onPress={() => router.push('/portal/staff')}
          />
        ) : null}
        <NavCard
          icon="⚙️"
          title="Shop Settings"
          description="Intake link, shop info, and preferences."
          onPress={() => router.push('/portal/settings')}
        />
      </View>
    </ScrollView>
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
  container: { padding: spacing.lg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  shopName: { fontSize: 20, fontWeight: '800', color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  logout: { color: colors.danger, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
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
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  digestCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  digestHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  digestLabel: { fontSize: 13, fontWeight: '800', color: colors.primary },
  digestRefresh: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  digestHeadline: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 4 },
  digestNarrative: { fontSize: 13, color: colors.text, lineHeight: 19, marginBottom: spacing.sm },
  digestColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  digestColumn: { flexGrow: 1, flexBasis: 200, minWidth: 180 },
  digestColumnTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  digestBullet: { fontSize: 13, color: colors.text, marginBottom: 3, lineHeight: 18 },
});



