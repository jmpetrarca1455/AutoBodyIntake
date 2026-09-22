import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth';
import { api, type StaffMember } from '../../src/api';
import { Field, PrimaryButton, Section } from '../../src/components/ui';
import { colors, spacing } from '../../src/theme';

/**
 * Owner-only screen to invite/manage staff logins. Staff can work the
 * submission inbox but can't change shop settings or manage other staff
 * (enforced server-side too — this UI is just the convenient front-end).
 */
export default function StaffManagement() {
  const router = useRouter();
  const { token, role, loading: authLoading } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const list = await api.listStaff(token);
    setStaff(list);
  }, [token]);

  useEffect(() => {
    if (!authLoading && role && role !== 'OWNER') {
      router.replace('/portal');
      return;
    }
    if (token) {
      load()
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [authLoading, role, token, load, router]);

  async function invite() {
    if (!token || !email || !password) return;
    setInviting(true);
    setError(null);
    try {
      await api.inviteStaff(token, { email: email.trim(), password });
      setEmail('');
      setPassword('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInviting(false);
    }
  }

  async function deactivate(id: string) {
    if (!token) return;
    await api.deactivateStaff(token, id).catch(() => {});
    await load();
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
      <Section title="Invite a staff member">
        <Field
          label="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="staff@yourshop.com"
        />
        <Field
          label="Temporary password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton
          title="Invite"
          loading={inviting}
          onPress={invite}
          disabled={!email || password.length < 8}
        />
      </Section>

      <Text style={styles.listTitle}>Team ({staff.length})</Text>
      <FlatList
        data={staff}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.muted}>No staff invited yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.email}</Text>
              <Text style={styles.muted}>{item.isActive ? 'Active' : 'Deactivated'}</Text>
            </View>
            {item.isActive ? (
              <Pressable onPress={() => deactivate(item.id)}>
                <Text style={styles.danger}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  muted: { fontSize: 13, color: colors.muted },
  error: { color: colors.danger, marginBottom: spacing.sm },
  danger: { color: colors.danger, fontWeight: '600' },
  listTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  list: { padding: spacing.lg, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
});

