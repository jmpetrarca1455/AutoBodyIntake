import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SUBMISSION_STATUS_LABELS, type SubmissionStatusValue } from '../../src/api';
import { useAuth } from '../../src/auth';
import { api, type ShopReport } from '../../src/api';
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

/**
 * Shop KPI report — cycle time, status breakdown, average estimate value,
 * outstanding parts orders, and recent volume. The scoped-down version of
 * CCC ONE's Insights/analytics module: the handful of numbers a small shop
 * owner actually checks day to day.
 */
export default function ReportsScreen() {
  const router = useRouter();
  const { token, loading: authLoading } = useAuth();
  const [report, setReport] = useState<ShopReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    const r = await api.getReports(token);
    setReport(r);
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

  if (authLoading || loading || !report) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const statusEntries = Object.entries(report.statusBreakdown) as [string, number][];
  const maxCount = Math.max(1, ...statusEntries.map(([, c]) => c));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Reports</Text>
      <Text style={styles.muted}>Shop-wide KPIs, computed from your repair order history.</Text>

      <View style={styles.statsGrid}>
        <StatCard
          label="Avg. cycle time"
          value={report.avgCycleTimeHours !== null ? `${report.avgCycleTimeHours} hrs` : '—'}
          hint="Intake to emailed"
        />
        <StatCard
          label="Avg. estimate value"
          value={report.avgEstimateTotal !== null ? `$${report.avgEstimateTotal.toLocaleString()}` : '—'}
          hint="Across ROs with an estimate"
        />
        <StatCard
          label="Outstanding parts"
          value={String(report.outstandingPartsOrders)}
          hint="Not yet installed/returned"
        />
        <StatCard label="Last 30 days" value={String(report.last30DaysVolume)} hint="New submissions" />
      </View>

      <Text style={styles.sectionLabel}>Repair orders by stage</Text>
      <View style={styles.card}>
        {statusEntries.length === 0 ? (
          <Text style={styles.muted}>No submissions yet.</Text>
        ) : (
          statusEntries.map(([status, count]) => (
            <View key={status} style={styles.barRow}>
              <Text style={styles.barLabel}>
                {SUBMISSION_STATUS_LABELS[status as SubmissionStatusValue] ?? status}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${Math.max(4, (count / maxCount) * 100)}%`,
                      backgroundColor: STATUS_COLORS[status] ?? colors.muted,
                    },
                  ]}
                />
              </View>
              <Text style={styles.barCount}>{count}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statHint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.lg },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 2 },
  muted: { fontSize: 13, color: colors.muted, marginBottom: spacing.lg },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
  statCard: {
    flexGrow: 1,
    flexBasis: 200,
    minWidth: 160,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 2 },
  statHint: { fontSize: 11, color: colors.muted, marginTop: 2 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  barLabel: { width: 130, fontSize: 12, color: colors.text, fontWeight: '600' },
  barTrack: { flex: 1, height: 14, backgroundColor: colors.bg, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },
  barCount: { width: 28, fontSize: 12, color: colors.muted, textAlign: 'right', fontWeight: '700' },
});

