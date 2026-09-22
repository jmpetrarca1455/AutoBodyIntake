import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useAuth } from '../../src/auth';
import { Field, PrimaryButton } from '../../src/components/ui';
import { colors, spacing } from '../../src/theme';

export default function PortalSignup() {
  const router = useRouter();
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [secretaryEmail, setSecretaryEmail] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await signup({
        name: name.trim(),
        secretaryEmail: secretaryEmail.trim(),
        ownerEmail: ownerEmail.trim(),
        password,
      });
      router.replace('/portal');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = name && secretaryEmail && ownerEmail && password.length >= 8;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Sign Up Your Shop</Text>
      <Text style={styles.subtitle}>
        This creates your shop's account and gives you an intake link to share with customers.
      </Text>
      <Field label="Shop name" value={name} onChangeText={setName} placeholder="Downtown Collision" />
      <Field
        label="Secretary / front-desk email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={secretaryEmail}
        onChangeText={setSecretaryEmail}
        placeholder="front@yourshop.com"
      />
      <Field
        label="Your login email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={ownerEmail}
        onChangeText={setOwnerEmail}
        placeholder="owner@yourshop.com"
      />
      <Field
        label="Password (8+ characters)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton title="Create shop account" loading={loading} onPress={submit} disabled={!canSubmit} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginBottom: spacing.sm, lineHeight: 20 },
  error: { color: colors.danger, marginBottom: spacing.sm },
});

