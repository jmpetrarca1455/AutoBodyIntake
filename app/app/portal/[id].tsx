import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ATTACHMENT_KIND_LABELS,
  MILESTONE_LABELS,
  RECIPIENT_TYPE_LABELS,
  SUBMISSION_STATUS_LABELS,
  submissionStatusValues,
  type AttachmentKind,
  type RecipientType,
  type StatusMilestone,
} from '@autobody/shared';
import { useAuth } from '../../src/auth';
import {
  api,
  type CommunicationLogEntry,
  type IntakePayload,
  type LocalFile,
  type SubmissionDetail,
} from '../../src/api';
import { ChoiceRow, Field, PrimaryButton, Section } from '../../src/components/ui';
import { colors, radius, spacing } from '../../src/theme';

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#b91c1c',
  high: '#c2410c',
  medium: '#a16207',
  low: '#15803d',
};

const SEVERITY_COLORS: Record<string, string> = {
  minor: '#15803d',
  moderate: '#a16207',
  severe: '#c2410c',
  total_loss_likely: '#b91c1c',
};

const MILESTONE_OPTIONS = (Object.keys(MILESTONE_LABELS) as StatusMilestone[]).map((value) => ({
  label: MILESTONE_LABELS[value],
  value,
}));

const STATUS_OPTIONS = submissionStatusValues.map((value) => ({
  label: SUBMISSION_STATUS_LABELS[value],
  value,
}));

const ATTACHMENT_KIND_OPTIONS = (Object.keys(ATTACHMENT_KIND_LABELS) as AttachmentKind[]).map((value) => ({
  label: ATTACHMENT_KIND_LABELS[value],
  value,
}));

const RECIPIENT_FILTER_OPTIONS = [
  { label: 'All', value: 'all' as const },
  ...(Object.keys(RECIPIENT_TYPE_LABELS) as RecipientType[]).map((value) => ({
    label: RECIPIENT_TYPE_LABELS[value],
    value,
  })),
];

const NOTE_RECIPIENT_OPTIONS = (Object.keys(RECIPIENT_TYPE_LABELS) as RecipientType[]).map((value) => ({
  label: RECIPIENT_TYPE_LABELS[value],
  value,
}));

const GENERIC_EMAIL_RECIPIENT_OPTIONS = NOTE_RECIPIENT_OPTIONS.filter((o) => o.value !== 'customer');

type EditableData = {
  contact: NonNullable<IntakePayload['contact']>;
  insurance: NonNullable<IntakePayload['insurance']>;
  license: NonNullable<IntakePayload['license']>;
  vehicle: NonNullable<IntakePayload['vehicle']>;
  rental: NonNullable<IntakePayload['rental']>;
  claim: NonNullable<IntakePayload['claim']>;
};

function emptyEditable(): EditableData {
  return {
    contact: { fullName: '', smsConsent: false },
    insurance: {},
    license: {},
    vehicle: {},
    rental: {},
    claim: {},
  };
}

async function toLocalFile(asset: ImagePicker.ImagePickerAsset): Promise<LocalFile> {
  const uri = asset.uri;
  const extFromUri = uri.split('.').pop()?.split('?')[0]?.toLowerCase();
  const ext = asset.mimeType?.split('/')[1] ?? extFromUri ?? 'jpg';
  const mimeType = asset.mimeType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  return { uri, name: asset.fileName ?? `document-${Date.now()}.${ext}`, mimeType };
}

export default function SubmissionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token, loading: authLoading } = useAuth();
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  // Editable customer-file form state
  const [form, setForm] = useState<EditableData>(emptyEditable());
  const [status, setStatus] = useState<string>('RECEIVED');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);

  // Damage assessment
  const [assessing, setAssessing] = useState(false);

  // Status update
  const [milestone, setMilestone] = useState<StatusMilestone>('in_review');
  const [draftMessage, setDraftMessage] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [sendingUpdate, setSendingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<string | null>(null);

  // Adjuster email
  const [adjusterTo, setAdjusterTo] = useState('');
  const [adjusterSubject, setAdjusterSubject] = useState('');
  const [adjusterBody, setAdjusterBody] = useState('');
  const [draftingAdjuster, setDraftingAdjuster] = useState(false);
  const [sendingAdjuster, setSendingAdjuster] = useState(false);
  const [adjusterResult, setAdjusterResult] = useState<string | null>(null);

  // Generic email (parts supplier / insurance direct / other)
  const [genRecipientType, setGenRecipientType] = useState<RecipientType>('parts_supplier');
  const [genLabel, setGenLabel] = useState('');
  const [genTo, setGenTo] = useState('');
  const [genSubject, setGenSubject] = useState('');
  const [genBody, setGenBody] = useState('');
  const [sendingGeneric, setSendingGeneric] = useState(false);
  const [genericResult, setGenericResult] = useState<string | null>(null);

  // Manual note/call log
  const [noteRecipientType, setNoteRecipientType] = useState<RecipientType>('customer');
  const [noteLabel, setNoteLabel] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [loggingNote, setLoggingNote] = useState(false);
  const [noteResult, setNoteResult] = useState<string | null>(null);

  // Communications history + filter
  const [comms, setComms] = useState<CommunicationLogEntry[]>([]);
  const [commFilter, setCommFilter] = useState<'all' | RecipientType>('all');

  // Attachments
  const [uploadKind, setUploadKind] = useState<AttachmentKind>('other');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!token || !id) return;
    const [detail, log] = await Promise.all([
      api.getSubmissionDetail(token, id),
      api.listCommunications(token, id).catch(() => []),
    ]);
    setSubmission(detail);
    setComms(log);
    setStatus(detail.status);
    setForm({
      contact: {
        ...detail.data.contact,
        fullName: detail.data.contact?.fullName || detail.customerName,
        smsConsent: detail.data.contact?.smsConsent ?? false,
      },
      insurance: { ...detail.data.insurance },
      license: { ...detail.data.license },
      vehicle: { ...detail.data.vehicle },
      rental: { ...detail.data.rental },
      claim: { ...detail.data.claim },
    });
  }, [token, id]);

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

  function setField<G extends keyof EditableData>(
    group: G,
    key: keyof EditableData[G],
    value: string,
  ) {
    setForm((prev) => ({ ...prev, [group]: { ...prev[group], [key]: value } }));
  }

  async function saveChanges() {
    if (!token || !id) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const updated = await api.updateSubmissionStaff(token, id, {
        contact: form.contact,
        insurance: form.insurance,
        license: form.license,
        vehicle: form.vehicle,
        rental: form.rental,
        claim: form.claim,
        status: status as never,
      });
      setSubmission(updated);
      setSaveResult('Saved!');
    } catch (err) {
      setSaveResult(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    if (!token || !id) return;
    setRegenerating(true);
    try {
      const summary = await api.regenerateAiSummary(token, id);
      setSubmission((prev) => (prev ? { ...prev, aiSummary: summary } : prev));
    } finally {
      setRegenerating(false);
    }
  }

  async function runAssessment() {
    if (!token || !id) return;
    setAssessing(true);
    try {
      const assessment = await api.runDamageAssessment(token, id);
      setSubmission((prev) => (prev ? { ...prev, damageAssessment: assessment } : prev));
    } finally {
      setAssessing(false);
    }
  }

  async function draftUpdate() {
    if (!token || !id) return;
    setDrafting(true);
    setUpdateResult(null);
    try {
      const draft = await api.draftStatusUpdate(token, id, { milestone });
      setDraftMessage(draft.message);
    } finally {
      setDrafting(false);
    }
  }

  async function sendUpdate() {
    if (!token || !id || !draftMessage.trim()) return;
    setSendingUpdate(true);
    setUpdateResult(null);
    try {
      const entry = await api.sendStatusUpdate(token, id, { milestone, message: draftMessage.trim() });
      setComms((prev) => [entry, ...prev]);
      setUpdateResult(
        entry.status === 'preview'
          ? `Previewed (no ${entry.channel.toUpperCase()} provider configured) — check server logs.`
          : entry.status === 'failed'
            ? 'Failed to send — check customer contact info.'
            : `Sent via ${entry.channel.toUpperCase()}!`,
      );
      setDraftMessage('');
    } finally {
      setSendingUpdate(false);
    }
  }

  async function draftAdjuster() {
    if (!token || !id) return;
    setDraftingAdjuster(true);
    setAdjusterResult(null);
    try {
      const draft = await api.draftAdjusterEmail(token, id);
      setAdjusterSubject(draft.subject);
      setAdjusterBody(draft.body);
      if (!adjusterTo && submission?.data.insurance?.adjusterContact?.includes('@')) {
        setAdjusterTo(submission.data.insurance.adjusterContact);
      }
    } finally {
      setDraftingAdjuster(false);
    }
  }

  async function sendAdjuster() {
    if (!token || !id || !adjusterTo.trim() || !adjusterSubject.trim() || !adjusterBody.trim()) return;
    setSendingAdjuster(true);
    setAdjusterResult(null);
    try {
      const entry = await api.sendAdjusterEmail(token, id, {
        to: adjusterTo.trim(),
        subject: adjusterSubject.trim(),
        body: adjusterBody.trim(),
      });
      setComms((prev) => [entry, ...prev]);
      setAdjusterResult(
        entry.status === 'preview'
          ? 'Previewed (no email provider configured) — check server logs.'
          : entry.status === 'failed'
            ? 'Failed to send.'
            : 'Sent!',
      );
    } finally {
      setSendingAdjuster(false);
    }
  }

  async function sendGeneric() {
    if (!token || !id || !genTo.trim() || !genSubject.trim() || !genBody.trim()) return;
    setSendingGeneric(true);
    setGenericResult(null);
    try {
      const entry = await api.sendGenericEmail(token, id, {
        recipientType: genRecipientType as Exclude<RecipientType, 'customer'>,
        recipientLabel: genLabel.trim() || undefined,
        to: genTo.trim(),
        subject: genSubject.trim(),
        body: genBody.trim(),
      });
      setComms((prev) => [entry, ...prev]);
      setGenericResult(
        entry.status === 'preview'
          ? 'Previewed (no email provider configured) — check server logs.'
          : entry.status === 'failed'
            ? 'Failed to send.'
            : 'Sent!',
      );
      setGenTo('');
      setGenSubject('');
      setGenBody('');
    } finally {
      setSendingGeneric(false);
    }
  }

  async function logNote() {
    if (!token || !id || !noteBody.trim()) return;
    setLoggingNote(true);
    setNoteResult(null);
    try {
      const entry = await api.logCommunicationNote(token, id, {
        recipientType: noteRecipientType,
        recipientLabel: noteLabel.trim() || undefined,
        channel: 'note',
        body: noteBody.trim(),
      });
      setComms((prev) => [entry, ...prev]);
      setNoteResult('Logged!');
      setNoteBody('');
    } finally {
      setLoggingNote(false);
    }
  }

  async function pickAndUpload(fromCamera: boolean) {
    if (!token || !id) return;
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow access to add photos.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (result.canceled) return;

    setUploading(true);
    try {
      const file = await toLocalFile(result.assets[0]);
      await api.uploadStaffAttachment(token, id, uploadKind, file);
      const updated = await api.getSubmissionDetail(token, id);
      setSubmission(updated);
    } catch (err) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(attachmentId: string) {
    if (!token || !id) return;
    Alert.alert('Remove document?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await api.deleteAttachment(token, id, attachmentId);
          const updated = await api.getSubmissionDetail(token, id);
          setSubmission(updated);
        },
      },
    ]);
  }

  const filteredComms = useMemo(
    () => (commFilter === 'all' ? comms : comms.filter((c) => c.recipientType === commFilter)),
    [comms, commFilter],
  );

  if (loading || !submission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const ai = submission.aiSummary;
  const damage = submission.damageAssessment;
  const smsConsent = form.contact.smsConsent === true;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.name}>{submission.customerName}</Text>
      <Text style={styles.muted}>
        {SUBMISSION_STATUS_LABELS[submission.status as keyof typeof SUBMISSION_STATUS_LABELS] ??
          submission.status}{' '}
        · {submission.vehicleInfo ?? 'No vehicle'}
      </Text>

      <Section title="AI Triage">
        {ai ? (
          <View>
            <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLORS[ai.priority] ?? colors.muted }]}>
              <Text style={styles.priorityText}>{ai.priority.toUpperCase()}</Text>
            </View>
            <Text style={styles.label}>Why</Text>
            <Text style={styles.value}>{ai.priorityReason}</Text>
            <Text style={styles.label}>Summary</Text>
            <Text style={styles.value}>{ai.summary}</Text>
            {ai.missingInfo.length > 0 && (
              <>
                <Text style={styles.label}>Missing info</Text>
                {ai.missingInfo.map((m) => (
                  <Text key={m} style={styles.bullet}>
                    • {m}
                  </Text>
                ))}
              </>
            )}
            <Text style={styles.label}>Suggested next action</Text>
            <Text style={styles.value}>{ai.suggestedNextAction}</Text>
            <Text style={styles.tiny}>
              Generated by {ai.generatedBy} at {new Date(ai.generatedAt).toLocaleString()}
            </Text>
          </View>
        ) : (
          <Text style={styles.muted}>No AI summary yet.</Text>
        )}
        <View style={{ marginTop: spacing.md }}>
          <PrimaryButton title="Regenerate AI summary" loading={regenerating} onPress={regenerate} />
        </View>
      </Section>

      <Section title="AI Damage Assessment">
        {damage ? (
          <View>
            <View
              style={[
                styles.priorityBadge,
                { backgroundColor: SEVERITY_COLORS[damage.severity] ?? colors.muted },
              ]}
            >
              <Text style={styles.priorityText}>{damage.severity.replace(/_/g, ' ').toUpperCase()}</Text>
            </View>
            {damage.affectedAreas.length > 0 && (
              <>
                <Text style={styles.label}>Affected areas</Text>
                {damage.affectedAreas.map((a) => (
                  <Text key={a} style={styles.bullet}>
                    • {a}
                  </Text>
                ))}
              </>
            )}
            <Text style={styles.label}>Repair complexity</Text>
            <Text style={styles.value}>{damage.repairComplexity}</Text>
            <Text style={styles.label}>Est. labor hours</Text>
            <Text style={styles.value}>
              {damage.estimatedLaborHours.min}–{damage.estimatedLaborHours.max} hrs
            </Text>
            <Text style={styles.label}>Est. cost range</Text>
            <Text style={styles.value}>
              ${damage.estimatedCostRange.min.toLocaleString()}–${damage.estimatedCostRange.max.toLocaleString()}{' '}
              {damage.estimatedCostRange.currency}
            </Text>
            <Text style={styles.label}>Recommendation</Text>
            <Text style={styles.value}>{damage.recommendation}</Text>
            <Text style={styles.disclaimer}>{damage.disclaimer}</Text>
            <Text style={styles.tiny}>
              Generated by {damage.generatedBy} · confidence: {damage.confidence} ·{' '}
              {new Date(damage.generatedAt).toLocaleString()}
            </Text>
          </View>
        ) : (
          <Text style={styles.muted}>No damage assessment yet — run it after damage photos are uploaded.</Text>
        )}
        <View style={{ marginTop: spacing.md }}>
          <PrimaryButton
            title={damage ? 'Regenerate assessment' : 'Run damage assessment'}
            loading={assessing}
            onPress={runAssessment}
          />
        </View>
      </Section>

      <Section title="Customer file (editable)">
        <ChoiceRow label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />

        <Text style={styles.groupHeader}>Contact</Text>
        <Field
          label="Full name"
          value={form.contact.fullName}
          onChangeText={(v) => setField('contact', 'fullName', v)}
        />
        <Field label="Phone" value={form.contact.phone} onChangeText={(v) => setField('contact', 'phone', v)} />
        <Field label="Email" value={form.contact.email} onChangeText={(v) => setField('contact', 'email', v)} />

        <Text style={styles.groupHeader}>Insurance</Text>
        <Field
          label="Company"
          value={form.insurance.companyName}
          onChangeText={(v) => setField('insurance', 'companyName', v)}
        />
        <Field
          label="Policy #"
          value={form.insurance.policyNumber}
          onChangeText={(v) => setField('insurance', 'policyNumber', v)}
        />
        <Field
          label="Claim #"
          value={form.insurance.claimNumber}
          onChangeText={(v) => setField('insurance', 'claimNumber', v)}
        />
        <Field
          label="Adjuster name"
          value={form.insurance.adjusterName}
          onChangeText={(v) => setField('insurance', 'adjusterName', v)}
        />
        <Field
          label="Adjuster contact"
          value={form.insurance.adjusterContact}
          onChangeText={(v) => setField('insurance', 'adjusterContact', v)}
        />

        <Text style={styles.groupHeader}>License</Text>
        <Field label="Name" value={form.license.name} onChangeText={(v) => setField('license', 'name', v)} />
        <Field
          label="Number"
          value={form.license.number}
          onChangeText={(v) => setField('license', 'number', v)}
        />
        <Field
          label="Expiration"
          value={form.license.expiration}
          onChangeText={(v) => setField('license', 'expiration', v)}
        />

        <Text style={styles.groupHeader}>Vehicle</Text>
        <Field
          label="Year"
          value={form.vehicle.year ? String(form.vehicle.year) : ''}
          keyboardType="number-pad"
          onChangeText={(v) => setField('vehicle', 'year', v)}
        />
        <Field label="Make" value={form.vehicle.make} onChangeText={(v) => setField('vehicle', 'make', v)} />
        <Field label="Model" value={form.vehicle.model} onChangeText={(v) => setField('vehicle', 'model', v)} />
        <Field label="VIN" value={form.vehicle.vin} onChangeText={(v) => setField('vehicle', 'vin', v)} />
        <Field
          label="License plate"
          value={form.vehicle.licensePlate}
          onChangeText={(v) => setField('vehicle', 'licensePlate', v)}
        />
        <Field
          label="Mileage"
          value={form.vehicle.mileage ? String(form.vehicle.mileage) : ''}
          keyboardType="number-pad"
          onChangeText={(v) => setField('vehicle', 'mileage', v)}
        />
        <Field
          label="Damage description"
          value={form.vehicle.damageDescription}
          multiline
          onChangeText={(v) => setField('vehicle', 'damageDescription', v)}
        />

        <Text style={styles.groupHeader}>Rental</Text>
        <Field
          label="Coverage (yes/no/unknown)"
          value={form.rental.hasCoverage}
          onChangeText={(v) => setField('rental', 'hasCoverage', v)}
        />
        <Field
          label="Limit or days"
          value={form.rental.limitOrDays}
          onChangeText={(v) => setField('rental', 'limitOrDays', v)}
        />
        <Field
          label="Preference"
          value={form.rental.preference}
          onChangeText={(v) => setField('rental', 'preference', v)}
        />

        <Text style={styles.groupHeader}>Claim</Text>
        <Field
          label="Accident date"
          value={form.claim.accidentDate}
          onChangeText={(v) => setField('claim', 'accidentDate', v)}
        />
        <Field
          label="Location"
          value={form.claim.accidentLocation}
          onChangeText={(v) => setField('claim', 'accidentLocation', v)}
        />
        <Field
          label="Police report #"
          value={form.claim.policeReportNumber}
          onChangeText={(v) => setField('claim', 'policeReportNumber', v)}
        />
        <Field
          label="At fault (self/other/unknown)"
          value={form.claim.atFault}
          onChangeText={(v) => setField('claim', 'atFault', v)}
        />
        <Field
          label="Other party info"
          value={form.claim.otherPartyInfo}
          multiline
          onChangeText={(v) => setField('claim', 'otherPartyInfo', v)}
        />

        <PrimaryButton title="Save changes" loading={saving} onPress={saveChanges} />
        {saveResult ? <Text style={styles.resultText}>{saveResult}</Text> : null}
      </Section>

      <Section title={`Documents & photos (${submission.attachments.length})`}>
        {submission.attachments.length === 0 ? (
          <Text style={styles.muted}>None uploaded.</Text>
        ) : (
          submission.attachments.map((a) => {
            const isImage = a.contentType.startsWith('image/');
            const url = api.attachmentUrl(a.id);
            return (
              <View key={a.id} style={styles.attachmentRow}>
                {isImage ? (
                  <Image source={{ uri: url }} style={styles.attachmentThumb} />
                ) : (
                  <View style={[styles.attachmentThumb, styles.attachmentThumbFallback]}>
                    <Text style={styles.attachmentThumbText}>FILE</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.attachmentKind}>
                    {ATTACHMENT_KIND_LABELS[a.kind as AttachmentKind] ?? a.kind}
                  </Text>
                  <Text style={styles.tiny}>
                    {a.fileName} · {Math.round(a.sizeBytes / 1024)} KB
                  </Text>
                  <View style={styles.attachmentActions}>
                    <Pressable onPress={() => Linking.openURL(url)}>
                      <Text style={styles.linkText}>View</Text>
                    </Pressable>
                    <Pressable onPress={() => removeAttachment(a.id)}>
                      <Text style={[styles.linkText, { color: colors.danger }]}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })
        )}

        <Text style={styles.groupHeader}>Add / replace a document</Text>
        <ChoiceRow
          label="Document type"
          value={uploadKind}
          onChange={setUploadKind}
          options={ATTACHMENT_KIND_OPTIONS}
        />
        <View style={styles.row}>
          <Pressable
            style={[styles.smallButton, uploading && styles.buttonDisabled]}
            disabled={uploading}
            onPress={() => pickAndUpload(false)}
          >
            <Text style={styles.smallButtonText}>{uploading ? 'Uploading…' : '+ From library'}</Text>
          </Pressable>
          <Pressable
            style={[styles.smallButton, uploading && styles.buttonDisabled]}
            disabled={uploading}
            onPress={() => pickAndUpload(true)}
          >
            <Text style={styles.smallButtonText}>{uploading ? 'Uploading…' : '+ Camera'}</Text>
          </Pressable>
        </View>
      </Section>

      <Section title="Send status update to customer">
        <ChoiceRow label="Milestone" value={milestone} onChange={setMilestone} options={MILESTONE_OPTIONS} />
        <PrimaryButton title="AI-draft message" loading={drafting} onPress={draftUpdate} />
        <View style={{ height: spacing.sm }} />
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Drafted message will appear here — edit freely before sending."
          placeholderTextColor={colors.muted}
          value={draftMessage}
          onChangeText={setDraftMessage}
        />
        <View style={{ height: spacing.sm }} />
        <PrimaryButton
          title={submission.customerPhone && smsConsent ? 'Send via SMS' : 'Send via email'}
          loading={sendingUpdate}
          disabled={!draftMessage.trim()}
          onPress={sendUpdate}
        />
        {submission.customerPhone && !smsConsent ? (
          <Text style={styles.disclaimer}>
            This customer has a phone on file but didn't opt in to SMS at intake — sending via email
            instead. (TCPA compliance: never text without explicit consent.)
          </Text>
        ) : null}
        {updateResult ? <Text style={styles.resultText}>{updateResult}</Text> : null}
      </Section>

      <Section title="Adjuster follow-up email">
        <PrimaryButton title="AI-draft adjuster email" loading={draftingAdjuster} onPress={draftAdjuster} />
        <View style={{ height: spacing.sm }} />
        <TextInput
          style={styles.input}
          placeholder="Adjuster email address"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={adjusterTo}
          onChangeText={setAdjusterTo}
        />
        <View style={{ height: spacing.sm }} />
        <TextInput
          style={styles.input}
          placeholder="Subject"
          placeholderTextColor={colors.muted}
          value={adjusterSubject}
          onChangeText={setAdjusterSubject}
        />
        <View style={{ height: spacing.sm }} />
        <TextInput
          style={[styles.textArea, { minHeight: 160 }]}
          multiline
          placeholder="Drafted email body will appear here — edit freely before sending."
          placeholderTextColor={colors.muted}
          value={adjusterBody}
          onChangeText={setAdjusterBody}
        />
        <View style={{ height: spacing.sm }} />
        <PrimaryButton
          title="Send to adjuster"
          loading={sendingAdjuster}
          disabled={!adjusterTo.trim() || !adjusterSubject.trim() || !adjusterBody.trim()}
          onPress={sendAdjuster}
        />
        {adjusterResult ? <Text style={styles.resultText}>{adjusterResult}</Text> : null}
      </Section>

      <Section title="Email a parts supplier / insurance company directly">
        <ChoiceRow
          label="Recipient type"
          value={genRecipientType}
          onChange={setGenRecipientType}
          options={GENERIC_EMAIL_RECIPIENT_OPTIONS}
        />
        <Field label="Recipient label (optional, e.g. business name)" value={genLabel} onChangeText={setGenLabel} />
        <TextInput
          style={styles.input}
          placeholder="Recipient email address"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={genTo}
          onChangeText={setGenTo}
        />
        <View style={{ height: spacing.sm }} />
        <TextInput
          style={styles.input}
          placeholder="Subject"
          placeholderTextColor={colors.muted}
          value={genSubject}
          onChangeText={setGenSubject}
        />
        <View style={{ height: spacing.sm }} />
        <TextInput
          style={[styles.textArea, { minHeight: 140 }]}
          multiline
          placeholder="Message body"
          placeholderTextColor={colors.muted}
          value={genBody}
          onChangeText={setGenBody}
        />
        <View style={{ height: spacing.sm }} />
        <PrimaryButton
          title="Send email"
          loading={sendingGeneric}
          disabled={!genTo.trim() || !genSubject.trim() || !genBody.trim()}
          onPress={sendGeneric}
        />
        {genericResult ? <Text style={styles.resultText}>{genericResult}</Text> : null}
      </Section>

      <Section title="Log a call / manual note">
        <ChoiceRow
          label="Who was this with?"
          value={noteRecipientType}
          onChange={setNoteRecipientType}
          options={NOTE_RECIPIENT_OPTIONS}
        />
        <Field label="Label (optional, e.g. name)" value={noteLabel} onChangeText={setNoteLabel} />
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="What happened? e.g. Called customer to confirm pickup time."
          placeholderTextColor={colors.muted}
          value={noteBody}
          onChangeText={setNoteBody}
        />
        <View style={{ height: spacing.sm }} />
        <PrimaryButton title="Log note" loading={loggingNote} disabled={!noteBody.trim()} onPress={logNote} />
        {noteResult ? <Text style={styles.resultText}>{noteResult}</Text> : null}
      </Section>

      <Section title={`Communications history (${filteredComms.length}/${comms.length})`}>
        <View style={styles.chips}>
          {RECIPIENT_FILTER_OPTIONS.map((o) => {
            const active = o.value === commFilter;
            return (
              <Pressable
                key={o.value}
                onPress={() => setCommFilter(o.value)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ height: spacing.sm }} />
        {filteredComms.length === 0 ? (
          <Text style={styles.muted}>No messages in this category yet.</Text>
        ) : (
          filteredComms.map((c) => (
            <View key={c.id} style={styles.commRow}>
              <Text style={styles.commMeta}>
                {RECIPIENT_TYPE_LABELS[c.recipientType]}
                {c.recipientLabel ? ` — ${c.recipientLabel}` : ''} ·{' '}
                {c.direction === 'inbound' ? '← replied' : c.direction === 'internal' ? 'note' : '→ sent'} ·{' '}
                {c.channel.toUpperCase()} · {c.status} · {new Date(c.createdAt).toLocaleString()}
                {c.aiDrafted ? ' · AI-drafted' : ''}
              </Text>
              {c.subject ? <Text style={styles.commSubject}>{c.subject}</Text> : null}
              <Text style={styles.value}>{c.body}</Text>
            </View>
          ))
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.lg },
  name: { fontSize: 22, fontWeight: '800', color: colors.text },
  muted: { fontSize: 13, color: colors.muted, marginBottom: spacing.md },
  label: { fontSize: 12, color: colors.muted, fontWeight: '600', marginTop: spacing.xs },
  value: { fontSize: 15, color: colors.text, marginBottom: spacing.xs },
  bullet: { fontSize: 14, color: colors.text, marginLeft: spacing.xs },
  tiny: { fontSize: 11, color: colors.muted, marginTop: spacing.sm },
  disclaimer: { fontSize: 11, color: colors.muted, marginTop: spacing.sm, fontStyle: 'italic' },
  groupHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  priorityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  priorityText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  textArea: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  input: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  resultText: { marginTop: spacing.sm, color: colors.primary, fontWeight: '600' },
  commRow: { marginBottom: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  commMeta: { fontSize: 11, color: colors.muted, marginBottom: 2, fontWeight: '600' },
  commSubject: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  attachmentRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  attachmentThumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.border },
  attachmentThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  attachmentThumbText: { fontSize: 10, fontWeight: '800', color: colors.muted },
  attachmentKind: { fontSize: 14, fontWeight: '700', color: colors.text },
  attachmentActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  linkText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  smallButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
  },
  smallButtonText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
});




