import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Field, PrimaryButton } from '../src/components/ui';
import { colors, spacing } from '../src/theme';

/**
 * Landing screen. In production a customer arrives via the shop's link/QR
 * (/i/<token>) and skips this entirely. This screen is a helpful entry point
 * for testing and for manually entering a shop code.
 */
export default function Home() {
  const router = useRouter();
  const [token, setToken] = useState('');

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.title}>After an accident?</Text>
        <Text style={styles.subtitle}>
          Your body shop sent you a link to share your info. Open that link, or
          enter your shop code below to get started.
        </Text>
      </View>

      <Field
        label="Shop intake code"
        placeholder="Paste your intake code"
        autoCapitalize="none"
        autoCorrect={false}
        value={token}
        onChangeText={setToken}
      />
      <PrimaryButton
        title="Start intake"
        disabled={token.trim().length === 0}
        onPress={() => router.push(`/i/${token.trim()}`)}
      />

      <Text style={styles.hint}>
        Tip: the link looks like …/i/&lt;code&gt;. Opening it goes straight to
        your shop's intake form.
      </Text>

      <View style={styles.portalBox}>
        <Text style={styles.portalTitle}>Run a body shop?</Text>
        <Text style={styles.hint}>
          Log in to your shop's portal to see submissions and AI-triaged priorities.
        </Text>
        <Link href="/portal/login" asChild>
          <Pressable style={styles.portalLink}>
            <Text style={styles.portalLinkText}>Go to shop portal →</Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  hero: { marginBottom: spacing.md },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  subtitle: { fontSize: 15, color: colors.muted, lineHeight: 22 },
  hint: { fontSize: 13, color: colors.muted, marginTop: spacing.md, lineHeight: 20 },
  portalBox: {
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  portalTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  portalLink: { marginTop: spacing.sm },
  portalLinkText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
});




