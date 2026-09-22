import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  hero: { marginBottom: spacing.md },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  subtitle: { fontSize: 15, color: colors.muted, lineHeight: 22 },
  hint: { fontSize: 13, color: colors.muted, marginTop: spacing.md, lineHeight: 20 },
});

