import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useAuth } from '../../src/auth';
import { Field, PrimaryButton } from '../../src/components/ui';
import { colors, spacing } from '../../src/theme';

export default function PortalLogin() {
  const router = useRouter();
  const { login } = useAuth();
  const [ownerEmail, setOwnerEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await login(ownerEmail.trim(), password);
      router.replace('/portal');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Shop Portal Login</Text>
      <Field
        label="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={ownerEmail}
        onChangeText={setOwnerEmail}
        placeholder="owner@yourshop.com"
      />
      <Field
        label="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton title="Log in" loading={loading} onPress={submit} disabled={!ownerEmail || !password} />
      <Link href="/portal/signup" style={styles.link}>
        <Text style={styles.linkText}>New shop? Sign up here</Text>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  error: { color: colors.danger, marginBottom: spacing.sm },
  link: { marginTop: spacing.lg, alignSelf: 'center' },
  linkText: { color: colors.primary, fontWeight: '600' },
});

