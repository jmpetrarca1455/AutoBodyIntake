import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api, documentKindForAttachmentKind, type IntakePayload, type PublicShop } from '../../src/api';
import { PhotoPicker, type PickedPhoto } from '../../src/components/PhotoPicker';
import { ChoiceRow, Field, PrimaryButton, Section } from '../../src/components/ui';
import { colors, spacing } from '../../src/theme';

type VehicleDraft = {
  make?: string;
  model?: string;
  vin?: string;
  licensePlate?: string;
  damageDescription?: string;
  // Kept as strings for text inputs; coerced to numbers on submit.
  year?: string;
  mileage?: string;
};

type Draft = {
  contact: NonNullable<IntakePayload['contact']>;
  insurance: NonNullable<IntakePayload['insurance']>;
  license: NonNullable<IntakePayload['license']>;
  vehicle: VehicleDraft;
  rental: NonNullable<IntakePayload['rental']>;
  claim: NonNullable<IntakePayload['claim']>;
};

const emptyDraft: Draft = {
  contact: { fullName: '' },
  insurance: {},
  license: {},
  vehicle: {},
  rental: {},
  claim: {},
};

/** Build the API payload, dropping empty groups and coercing numbers. */
function toPayload(d: Draft): IntakePayload {
  const clean = <T extends object>(o: T): T | undefined => {
    const entries = Object.entries(o).filter(([, v]) => v !== undefined && v !== '');
    return entries.length ? (Object.fromEntries(entries) as T) : undefined;
  };
  return {
    contact: {
      fullName: d.contact.fullName.trim(),
      phone: d.contact.phone || undefined,
      email: d.contact.email || undefined,
      preferredContactMethod: d.contact.preferredContactMethod,
    },
    insurance: clean(d.insurance),
    license: clean(d.license),
    vehicle: clean({
      ...d.vehicle,
      year: d.vehicle.year ? Number(d.vehicle.year) : undefined,
      mileage: d.vehicle.mileage ? Number(d.vehicle.mileage) : undefined,
    }),
    rental: clean(d.rental),
    claim: clean(d.claim),
  };
}

export default function IntakeForm() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [shop, setShop] = useState<PublicShop | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .getShop(token)
      .then(setShop)
      .catch((e: Error) => setLoadError(e.message));
  }, [token]);

  // Type-safe section updaters.
  function set<K extends keyof Draft>(section: K, patch: Partial<Draft[K]>) {
    setDraft((d) => ({ ...d, [section]: { ...d[section], ...patch } }));
  }

  async function submit() {
    if (!token) return;
    if (!draft.contact.fullName.trim()) {
      setProgress('Please enter your full name.');
      return;
    }
    setSubmitting(true);
    try {
      setProgress('Sending your information…');
      const submission = await api.createSubmission(token, toPayload(draft));

      // Accumulate any auto-filled fields from OCR so we can persist them
      // server-side (and reflect them locally) after all uploads finish.
      const ocrPatch: Partial<IntakePayload> = {};

      for (let i = 0; i < photos.length; i++) {
        setProgress(`Uploading photo ${i + 1} of ${photos.length}…`);
        const p = photos[i];
        const attachment = await api.uploadAttachment(token, submission.id, p.kind, p);

        const documentType = documentKindForAttachmentKind(p.kind);
        if (documentType) {
          try {
            setProgress('Reading your document…');
            const ocr = await api.runOcr(token, submission.id, attachment.id);
            const fields = ocr.ocrData?.fields;
            if (fields) {
              if (documentType === 'license') {
                ocrPatch.license = {
                  ...ocrPatch.license,
                  ...(fields.name ? { name: fields.name } : {}),
                  ...(fields.number ? { number: fields.number } : {}),
                  ...(fields.expiration ? { expiration: fields.expiration } : {}),
                };
              } else if (documentType === 'insurance_card') {
                ocrPatch.insurance = {
                  ...ocrPatch.insurance,
                  ...(fields.companyName ? { companyName: fields.companyName } : {}),
                  ...(fields.policyNumber ? { policyNumber: fields.policyNumber } : {}),
                };
              } else if (documentType === 'vin' && fields.vin) {
                ocrPatch.vehicle = { ...ocrPatch.vehicle, vin: fields.vin };
              }
            }
          } catch {
            // OCR is a bonus, never a requirement — keep submitting either way.
          }
        }
      }

      if (Object.keys(ocrPatch).length > 0) {
        setProgress('Applying auto-filled details…');
        await api.updateSubmission(token, submission.id, ocrPatch).catch(() => {});
        setDraft((d) => ({
          ...d,
          license: { ...d.license, ...ocrPatch.license },
          insurance: { ...d.insurance, ...ocrPatch.insurance },
          vehicle: ocrPatch.vehicle?.vin ? { ...d.vehicle, vin: ocrPatch.vehicle.vin } : d.vehicle,
        }));
      }

      setProgress('Finishing up…');
      await api.finalize(token, submission.id);
      setDone(true);
    } catch (e) {
      setProgress((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading / error / success states ──────────────────
  if (loadError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Link not found</Text>
        <Text style={styles.muted}>{loadError}</Text>
        <Text style={styles.muted}>Please double-check the link your shop sent you.</Text>
      </View>
    );
  }

  if (!shop) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  if (done) {
    return (
      <View style={styles.center}>
        <Text style={styles.successMark}>✓</Text>
        <Text style={styles.successTitle}>All set!</Text>
        <Text style={styles.muted}>
          Your information was sent to {shop.name}. They'll be in touch shortly.
        </Text>
      </View>
    );
  }

  // ── Form ──────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.shopName}>{shop.name}</Text>
        <Text style={styles.muted}>Please share your accident & vehicle details below.</Text>

        <Section title="Your contact info">
          <Field
            label="Full name *"
            value={draft.contact.fullName}
            onChangeText={(v) => set('contact', { fullName: v })}
            placeholder="Jane Driver"
          />
          <Field
            label="Phone"
            keyboardType="phone-pad"
            value={draft.contact.phone}
            onChangeText={(v) => set('contact', { phone: v })}
            placeholder="(555) 123-4567"
          />
          <Field
            label="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            value={draft.contact.email}
            onChangeText={(v) => set('contact', { email: v })}
            placeholder="you@example.com"
          />
          <ChoiceRow
            label="Preferred contact method"
            value={draft.contact.preferredContactMethod}
            onChange={(v) => set('contact', { preferredContactMethod: v })}
            options={[
              { label: 'Phone', value: 'phone' },
              { label: 'Text', value: 'text' },
              { label: 'Email', value: 'email' },
            ]}
          />
        </Section>

        <Section title="Insurance">
          <Field
            label="Insurance company"
            value={draft.insurance.companyName}
            onChangeText={(v) => set('insurance', { companyName: v })}
          />
          <Field
            label="Policy number"
            value={draft.insurance.policyNumber}
            onChangeText={(v) => set('insurance', { policyNumber: v })}
          />
          <Field
            label="Claim number (if known)"
            value={draft.insurance.claimNumber}
            onChangeText={(v) => set('insurance', { claimNumber: v })}
          />
          <PhotoPicker
            kind="insurance_card_front"
            label="Insurance card — front"
            photos={photos}
            onChange={setPhotos}
            allowMultiple={false}
          />
          <PhotoPicker
            kind="insurance_card_back"
            label="Insurance card — back"
            photos={photos}
            onChange={setPhotos}
            allowMultiple={false}
          />
        </Section>

        <Section title="Driver's license">
          <PhotoPicker
            kind="license_front"
            label="License — front"
            photos={photos}
            onChange={setPhotos}
            allowMultiple={false}
          />
          <PhotoPicker
            kind="license_back"
            label="License — back"
            photos={photos}
            onChange={setPhotos}
            allowMultiple={false}
          />
        </Section>

        <Section title="Vehicle">
          <Field
            label="Year"
            keyboardType="number-pad"
            value={draft.vehicle.year}
            onChangeText={(v) => set('vehicle', { year: v })}
          />
          <Field
            label="Make"
            value={draft.vehicle.make}
            onChangeText={(v) => set('vehicle', { make: v })}
          />
          <Field
            label="Model"
            value={draft.vehicle.model}
            onChangeText={(v) => set('vehicle', { model: v })}
          />
          <Field
            label="License plate"
            autoCapitalize="characters"
            value={draft.vehicle.licensePlate}
            onChangeText={(v) => set('vehicle', { licensePlate: v })}
          />
          <Field
            label="VIN (if known)"
            autoCapitalize="characters"
            value={draft.vehicle.vin}
            onChangeText={(v) => set('vehicle', { vin: v })}
          />
          <Field
            label="What happened?"
            multiline
            value={draft.vehicle.damageDescription}
            onChangeText={(v) => set('vehicle', { damageDescription: v })}
            placeholder="Describe the damage / accident"
          />
          <PhotoPicker
            kind="damage_photo"
            label="Damage photos (add several angles)"
            photos={photos}
            onChange={setPhotos}
          />
        </Section>

        <Section title="Rental coverage">
          <ChoiceRow
            label="Does your policy include rental coverage?"
            value={draft.rental.hasCoverage}
            onChange={(v) => set('rental', { hasCoverage: v })}
            options={[
              { label: 'Yes', value: 'yes' },
              { label: 'No', value: 'no' },
              { label: 'Not sure', value: 'unknown' },
            ]}
          />
          <Field
            label="Rental limit / days (if known)"
            value={draft.rental.limitOrDays}
            onChangeText={(v) => set('rental', { limitOrDays: v })}
          />
        </Section>

        <Section title="Accident details">
          <Field
            label="Date of accident"
            value={draft.claim.accidentDate}
            onChangeText={(v) => set('claim', { accidentDate: v })}
            placeholder="YYYY-MM-DD"
          />
          <Field
            label="Location"
            value={draft.claim.accidentLocation}
            onChangeText={(v) => set('claim', { accidentLocation: v })}
          />
          <Field
            label="Police report # (if any)"
            value={draft.claim.policeReportNumber}
            onChangeText={(v) => set('claim', { policeReportNumber: v })}
          />
          <ChoiceRow
            label="Who was at fault?"
            value={draft.claim.atFault}
            onChange={(v) => set('claim', { atFault: v })}
            options={[
              { label: 'Other party', value: 'other' },
              { label: 'Me', value: 'self' },
              { label: 'Unknown', value: 'unknown' },
            ]}
          />
        </Section>

        {progress ? <Text style={styles.progress}>{progress}</Text> : null}

        <PrimaryButton
          title="Submit to shop"
          loading={submitting}
          onPress={submit}
        />
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  shopName: { fontSize: 22, fontWeight: '800', color: colors.text },
  muted: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20, marginBottom: spacing.md },
  progress: { color: colors.primary, marginBottom: spacing.md, textAlign: 'center' },
  errorTitle: { fontSize: 20, fontWeight: '800', color: colors.danger },
  successMark: { fontSize: 56, color: colors.success },
  successTitle: { fontSize: 24, fontWeight: '800', color: colors.text },
});





