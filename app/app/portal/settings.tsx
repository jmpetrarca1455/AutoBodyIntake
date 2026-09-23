import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth';
import { api, type ShopSettings } from '../../src/api';
import { Field, PrimaryButton, Section } from '../../src/components/ui';
import { colors, spacing } from '../../src/theme';

/**
 * Shop settings + the shareable intake link/QR. This is the screen a
 * non-technical shop owner needs most: "where do I get the link to text
 * my customers?" — front and center, with a one-tap copy.
 */
export default function ShopSettingsScreen() {
  const router = useRouter();
  const { token, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Editable shop fields.
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [secretaryEmail, setSecretaryEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const s = await api.getShopSettings(token);
    setSettings(s);
    setName(s.name);
    setAddress(s.address ?? '');
    setPhone(s.phone ?? '');
    setSecretaryEmail(s.secretaryEmail);
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

  async function copyLink() {
    if (!settings) return;
    await Clipboard.setStringAsync(settings.intakeLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.updateShopSettings(token, {
        name: name.trim(),
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        secretaryEmail: secretaryEmail.trim(),
      });
      await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || loading || !settings) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
    settings.intakeLink,
  )}`;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Section title="Your customer intake link">
        <Text style={styles.hint}>
          Share this link (or QR code) with customers after an accident — by text,
          email, or a printed card. No login required on their end.
        </Text>
        <View style={styles.linkBox}>
          <Text style={styles.linkText} selectable>
            {settings.intakeLink}
          </Text>
        </View>
        <PrimaryButton title={copied ? 'Copied!' : 'Copy link'} onPress={copyLink} />
        <View style={styles.qrWrap}>
          <Image source={{ uri: qrUrl }} style={styles.qr} />
          <Text style={styles.hint}>Scan to open the intake form</Text>
        </View>
      </Section>

      <Section title="Shop details">
        <Field label="Shop name" value={name} onChangeText={setName} />
        <Field label="Address" value={address} onChangeText={setAddress} />
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Field
          label="Secretary / front-desk email (where submissions are sent)"
          value={secretaryEmail}
          onChangeText={setSecretaryEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton title={saved ? 'Saved!' : 'Save changes'} loading={saving} onPress={save} />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.lg, gap: spacing.md },
  hint: { fontSize: 13, color: colors.muted, lineHeight: 19, marginBottom: spacing.sm },
  linkBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  linkText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  qrWrap: { alignItems: 'center', marginTop: spacing.lg, gap: spacing.xs },
  qr: { width: 220, height: 220, borderRadius: 8 },
  error: { color: colors.danger, marginBottom: spacing.sm },
});

