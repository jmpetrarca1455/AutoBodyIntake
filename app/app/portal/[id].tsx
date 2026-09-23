import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  ESTIMATE_CATEGORY_LABELS,
  PARTS_ORDER_STATUS_LABELS,
  type AttachmentKind,
  type RecipientType,
  type StatusMilestone,
  type EstimateLineCategory,
  type PartsOrderStatus,
} from '@autobody/shared';
import { useAuth } from '../../src/auth';
import {
  api,
  type CommunicationLogEntry,
  type IntakePayload,
  type LocalFile,
  type SubmissionDetail,
  type EstimateLineItemEntry,
  type PartsOrderEntry,
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

const ESTIMATE_CATEGORY_OPTIONS = (Object.keys(ESTIMATE_CATEGORY_LABELS) as EstimateLineCategory[]).map((value) => ({
  label: ESTIMATE_CATEGORY_LABELS[value],
  value,
}));

const PARTS_ORDER_STATUS_OPTIONS = (Object.keys(PARTS_ORDER_STATUS_LABELS) as PartsOrderStatus[]).map((value) => ({
  label: PARTS_ORDER_STATUS_LABELS[value],
  value,
}));

const PARTS_STATUS_COLORS: Record<string, string> = {
  NEEDED: '#64748b',
  ORDERED: '#0369a1',
  BACKORDERED: '#b91c1c',
  RECEIVED: '#15803d',
  INSTALLED: '#15803d',
  RETURNED: '#64748b',
};

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

/** ISO string → "YYYY-MM-DDTHH:mm" for editing in a plain text field. */
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" (or empty) → ISO string or null, for saving. */
function fromDatetimeLocal(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Derive the editable form shape from a loaded/just-saved submission. */
function buildForm(detail: SubmissionDetail): EditableData {
  return {
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
  };
}

/** A single label/value row for the read-only (non-editing) view. Renders
 * nothing when the value is empty, so groups with no data collapse away. */
function ReadOnlyRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

/** A titled card box — used to arrange field groups (Contact, Insurance,
 * Vehicle, etc.) as a responsive multi-column grid that fills the screen
 * width instead of one long list running down the left edge. */
function GroupCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.groupCard}>
      <Text style={styles.groupCardTitle}>{title}</Text>
      <View style={styles.fieldGrid}>{children}</View>
    </View>
  );
}

/** A single field's slot inside a GroupCard's mini-grid. Pass `full` for
 * long-text fields (descriptions, notes) that should span the whole card. */
function GridItem({ full, children }: { full?: boolean; children: ReactNode }) {
  return <View style={[styles.fieldGridItem, full && styles.fieldGridItemFull]}>{children}</View>;
}

/** A titled card box for prose/stat content (not a field-input grid) — used
 * to break AI Triage/Damage Assessment output into scannable boxes instead
 * of one long column of labels and paragraphs. */
function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.groupCard}>
      <Text style={styles.groupCardTitle}>{title}</Text>
      {children}
    </View>
  );
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
  const [editingFile, setEditingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);

  // Standalone status dropdown (always available, independent of edit mode)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

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

  // Scheduling (drop-off/pickup) — plain datetime-local-ish text fields
  const [dropoffScheduledAt, setDropoffScheduledAt] = useState('');
  const [pickupScheduledAt, setPickupScheduledAt] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleResult, setScheduleResult] = useState<string | null>(null);

  // Repair estimate (line items)
  const [estimateLines, setEstimateLines] = useState<EstimateLineItemEntry[]>([]);
  const [newLineCategory, setNewLineCategory] = useState<EstimateLineCategory>('PARTS');
  const [newLineDescription, setNewLineDescription] = useState('');
  const [newLinePartNumber, setNewLinePartNumber] = useState('');
  const [newLineQuantity, setNewLineQuantity] = useState('1');
  const [newLineUnitPrice, setNewLineUnitPrice] = useState('');
  const [newLineLaborHours, setNewLineLaborHours] = useState('');
  const [addingLine, setAddingLine] = useState(false);

  // Parts orders
  const [partsOrders, setPartsOrders] = useState<PartsOrderEntry[]>([]);
  const [newPartDescription, setNewPartDescription] = useState('');
  const [newPartNumber, setNewPartNumber] = useState('');
  const [newPartSupplier, setNewPartSupplier] = useState('');
  const [addingPart, setAddingPart] = useState(false);

  const load = useCallback(async () => {
    if (!token || !id) return;
    const [detail, log, estimate, parts] = await Promise.all([
      api.getSubmissionDetail(token, id),
      api.listCommunications(token, id).catch(() => []),
      api.getEstimate(token, id).catch(() => ({ lines: [], totals: { byCategory: {}, grandTotal: 0 } }) as never),
      api.getPartsOrders(token, id).catch(() => []),
    ]);
    setSubmission(detail);
    setComms(log);
    setStatus(detail.status);
    setForm(buildForm(detail));
    setEstimateLines(estimate.lines);
    setPartsOrders(parts);
    setDropoffScheduledAt(toDatetimeLocal(detail.dropoffScheduledAt));
    setPickupScheduledAt(toDatetimeLocal(detail.pickupScheduledAt));
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
      setForm(buildForm(updated));
      setEditingFile(false);
      setSaveResult('Saved!');
    } catch (err) {
      setSaveResult(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    if (submission) {
      setForm(buildForm(submission));
      setStatus(submission.status);
    }
    setSaveResult(null);
    setEditingFile(false);
  }

  /** Change just the lifecycle status via the header dropdown — saves
   * immediately without requiring the full "Edit" form to be open. */
  async function changeStatus(newStatus: string) {
    setStatusMenuOpen(false);
    if (!token || !id || newStatus === status) return;
    const previous = status;
    setStatus(newStatus);
    setChangingStatus(true);
    try {
      const updated = await api.updateSubmissionStaff(token, id, { status: newStatus as never });
      setSubmission(updated);
      setForm(buildForm(updated));
    } catch (err) {
      setStatus(previous);
      Alert.alert('Failed to update status', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setChangingStatus(false);
    }
  }

  /** Save the drop-off/pickup schedule — independent mini-form, same
   * "saves immediately" pattern as the status dropdown. */
  async function saveSchedule() {
    if (!token || !id) return;
    setSavingSchedule(true);
    setScheduleResult(null);
    try {
      const updated = await api.updateSubmissionStaff(token, id, {
        dropoffScheduledAt: fromDatetimeLocal(dropoffScheduledAt),
        pickupScheduledAt: fromDatetimeLocal(pickupScheduledAt),
      });
      setSubmission(updated);
      setScheduleResult('Saved!');
    } catch (err) {
      setScheduleResult(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSavingSchedule(false);
    }
  }

  // ── Repair estimate (line items) ────────────────────────
  async function addEstimateLine() {
    if (!token || !id || !newLineDescription.trim()) return;
    setAddingLine(true);
    try {
      const quantity = Number(newLineQuantity) || 1;
      const unitPrice = Number(newLineUnitPrice) || 0;
      const laborHours = newLineLaborHours.trim() ? Number(newLineLaborHours) : undefined;
      const line = await api.addEstimateLine(token, id, {
        category: newLineCategory,
        description: newLineDescription.trim(),
        partNumber: newLinePartNumber.trim() || undefined,
        quantity,
        unitPrice,
        laborHours,
      });
      setEstimateLines((prev) => [...prev, line]);
      setNewLineDescription('');
      setNewLinePartNumber('');
      setNewLineQuantity('1');
      setNewLineUnitPrice('');
      setNewLineLaborHours('');
    } catch (err) {
      Alert.alert('Could not add line', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setAddingLine(false);
    }
  }

  async function removeEstimateLine(lineId: string) {
    if (!token || !id) return;
    await api.deleteEstimateLine(token, id, lineId);
    setEstimateLines((prev) => prev.filter((l) => l.id !== lineId));
  }

  const estimateTotals = useMemo(() => {
    const byCategory: Record<string, number> = { PARTS: 0, LABOR: 0, PAINT_MATERIALS: 0, SUBLET: 0, MISC: 0 };
    for (const line of estimateLines) byCategory[line.category] = (byCategory[line.category] ?? 0) + line.total;
    const grandTotal = Object.values(byCategory).reduce((sum, v) => sum + v, 0);
    return { byCategory, grandTotal };
  }, [estimateLines]);

  // ── Parts orders ─────────────────────────────────────────
  async function addPartsOrder() {
    if (!token || !id || !newPartDescription.trim()) return;
    setAddingPart(true);
    try {
      const order = await api.addPartsOrder(token, id, {
        description: newPartDescription.trim(),
        partNumber: newPartNumber.trim() || undefined,
        supplier: newPartSupplier.trim() || undefined,
      });
      setPartsOrders((prev) => [...prev, order]);
      setNewPartDescription('');
      setNewPartNumber('');
      setNewPartSupplier('');
    } catch (err) {
      Alert.alert('Could not add part', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setAddingPart(false);
    }
  }

  async function changePartsOrderStatus(orderId: string, nextStatus: PartsOrderStatus) {
    if (!token || !id) return;
    const updated = await api.updatePartsOrder(token, id, orderId, { status: nextStatus });
    setPartsOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
  }

  async function removePartsOrder(orderId: string) {
    if (!token || !id) return;
    await api.deletePartsOrder(token, id, orderId);
    setPartsOrders((prev) => prev.filter((o) => o.id !== orderId));
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
            <View style={styles.groupGrid}>
              <InfoCard title="Why this priority">
                <Text style={styles.value}>{ai.priorityReason}</Text>
              </InfoCard>
              <InfoCard title="Summary">
                <Text style={styles.value}>{ai.summary}</Text>
              </InfoCard>
              {ai.missingInfo.length > 0 && (
                <InfoCard title="Missing info">
                  {ai.missingInfo.map((m) => (
                    <Text key={m} style={styles.bullet}>
                      • {m}
                    </Text>
                  ))}
                </InfoCard>
              )}
              <InfoCard title="Suggested next action">
                <Text style={styles.value}>{ai.suggestedNextAction}</Text>
              </InfoCard>
            </View>
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
            <View style={styles.groupGrid}>
              {damage.affectedAreas.length > 0 && (
                <InfoCard title="Affected areas">
                  {damage.affectedAreas.map((a) => (
                    <Text key={a} style={styles.bullet}>
                      • {a}
                    </Text>
                  ))}
                </InfoCard>
              )}
              <InfoCard title="Repair complexity">
                <Text style={styles.value}>{damage.repairComplexity}</Text>
              </InfoCard>
              <InfoCard title="Est. labor hours">
                <Text style={styles.value}>
                  {damage.estimatedLaborHours.min}–{damage.estimatedLaborHours.max} hrs
                </Text>
              </InfoCard>
              <InfoCard title="Est. cost range">
                <Text style={styles.value}>
                  ${damage.estimatedCostRange.min.toLocaleString()}–${damage.estimatedCostRange.max.toLocaleString()}{' '}
                  {damage.estimatedCostRange.currency}
                </Text>
              </InfoCard>
              <InfoCard title="Recommendation">
                <Text style={styles.value}>{damage.recommendation}</Text>
              </InfoCard>
            </View>
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

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderLeft}>
            <Text style={styles.sectionTitleRow}>Customer file</Text>
            <View style={styles.statusDropdownWrap}>
              <Pressable
                style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[status] ?? colors.muted }]}
                onPress={() => setStatusMenuOpen((o) => !o)}
                disabled={changingStatus}
              >
                <Text style={styles.statusBadgeText}>
                  {changingStatus
                    ? 'Updating…'
                    : (SUBMISSION_STATUS_LABELS[status as keyof typeof SUBMISSION_STATUS_LABELS] ?? status)}
                </Text>
                <Text style={styles.statusBadgeCaret}>{statusMenuOpen ? '▴' : '▾'}</Text>
              </Pressable>
              {statusMenuOpen && (
                <View style={styles.statusMenu}>
                  {STATUS_OPTIONS.map((o) => (
                    <Pressable
                      key={o.value}
                      style={[styles.statusMenuItem, o.value === status && styles.statusMenuItemActive]}
                      onPress={() => changeStatus(o.value)}
                    >
                      <View style={[styles.statusMenuDot, { backgroundColor: STATUS_COLORS[o.value] ?? colors.muted }]} />
                      <Text style={styles.statusMenuItemText}>{o.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </View>
          {!editingFile && (
            <Pressable style={styles.editIconButton} onPress={() => setEditingFile(true)}>
              <Text style={styles.editIconText}>✎ Edit</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.card}>
          {editingFile ? (
            <>
              <View style={styles.groupGrid}>
                <GroupCard title="Contact">
                  <GridItem>
                    <Field
                      label="Full name"
                      value={form.contact.fullName}
                      onChangeText={(v) => setField('contact', 'fullName', v)}
                    />
                  </GridItem>
                  <GridItem>
                    <Field label="Phone" value={form.contact.phone} onChangeText={(v) => setField('contact', 'phone', v)} />
                  </GridItem>
                  <GridItem>
                    <Field label="Email" value={form.contact.email} onChangeText={(v) => setField('contact', 'email', v)} />
                  </GridItem>
                </GroupCard>

                <GroupCard title="Insurance">
                  <GridItem>
                    <Field
                      label="Company"
                      value={form.insurance.companyName}
                      onChangeText={(v) => setField('insurance', 'companyName', v)}
                    />
                  </GridItem>
                  <GridItem>
                    <Field
                      label="Policy #"
                      value={form.insurance.policyNumber}
                      onChangeText={(v) => setField('insurance', 'policyNumber', v)}
                    />
                  </GridItem>
                  <GridItem>
                    <Field
                      label="Claim #"
                      value={form.insurance.claimNumber}
                      onChangeText={(v) => setField('insurance', 'claimNumber', v)}
                    />
                  </GridItem>
                  <GridItem>
                    <Field
                      label="Adjuster name"
                      value={form.insurance.adjusterName}
                      onChangeText={(v) => setField('insurance', 'adjusterName', v)}
                    />
                  </GridItem>
                  <GridItem>
                    <Field
                      label="Adjuster contact"
                      value={form.insurance.adjusterContact}
                      onChangeText={(v) => setField('insurance', 'adjusterContact', v)}
                    />
                  </GridItem>
                </GroupCard>

                <GroupCard title="License">
                  <GridItem>
                    <Field label="Name" value={form.license.name} onChangeText={(v) => setField('license', 'name', v)} />
                  </GridItem>
                  <GridItem>
                    <Field
                      label="Number"
                      value={form.license.number}
                      onChangeText={(v) => setField('license', 'number', v)}
                    />
                  </GridItem>
                  <GridItem>
                    <Field
                      label="Expiration"
                      value={form.license.expiration}
                      onChangeText={(v) => setField('license', 'expiration', v)}
                    />
                  </GridItem>
                </GroupCard>

                <GroupCard title="Vehicle">
                  <GridItem>
                    <Field
                      label="Year"
                      value={form.vehicle.year ? String(form.vehicle.year) : ''}
                      keyboardType="number-pad"
                      onChangeText={(v) => setField('vehicle', 'year', v)}
                    />
                  </GridItem>
                  <GridItem>
                    <Field label="Make" value={form.vehicle.make} onChangeText={(v) => setField('vehicle', 'make', v)} />
                  </GridItem>
                  <GridItem>
                    <Field label="Model" value={form.vehicle.model} onChangeText={(v) => setField('vehicle', 'model', v)} />
                  </GridItem>
                  <GridItem>
                    <Field label="VIN" value={form.vehicle.vin} onChangeText={(v) => setField('vehicle', 'vin', v)} />
                  </GridItem>
                  <GridItem>
                    <Field
                      label="License plate"
                      value={form.vehicle.licensePlate}
                      onChangeText={(v) => setField('vehicle', 'licensePlate', v)}
                    />
                  </GridItem>
                  <GridItem>
                    <Field
                      label="Mileage"
                      value={form.vehicle.mileage ? String(form.vehicle.mileage) : ''}
                      keyboardType="number-pad"
                      onChangeText={(v) => setField('vehicle', 'mileage', v)}
                    />
                  </GridItem>
                  <GridItem full>
                    <Field
                      label="Damage description"
                      value={form.vehicle.damageDescription}
                      multiline
                      onChangeText={(v) => setField('vehicle', 'damageDescription', v)}
                    />
                  </GridItem>
                </GroupCard>

                <GroupCard title="Rental">
                  <GridItem>
                    <Field
                      label="Coverage (yes/no/unknown)"
                      value={form.rental.hasCoverage}
                      onChangeText={(v) => setField('rental', 'hasCoverage', v)}
                    />
                  </GridItem>
                  <GridItem>
                    <Field
                      label="Limit or days"
                      value={form.rental.limitOrDays}
                      onChangeText={(v) => setField('rental', 'limitOrDays', v)}
                    />
                  </GridItem>
                  <GridItem>
                    <Field
                      label="Preference"
                      value={form.rental.preference}
                      onChangeText={(v) => setField('rental', 'preference', v)}
                    />
                  </GridItem>
                </GroupCard>

                <GroupCard title="Claim">
                  <GridItem>
                    <Field
                      label="Accident date"
                      value={form.claim.accidentDate}
                      onChangeText={(v) => setField('claim', 'accidentDate', v)}
                    />
                  </GridItem>
                  <GridItem>
                    <Field
                      label="Location"
                      value={form.claim.accidentLocation}
                      onChangeText={(v) => setField('claim', 'accidentLocation', v)}
                    />
                  </GridItem>
                  <GridItem>
                    <Field
                      label="Police report #"
                      value={form.claim.policeReportNumber}
                      onChangeText={(v) => setField('claim', 'policeReportNumber', v)}
                    />
                  </GridItem>
                  <GridItem>
                    <Field
                      label="At fault (self/other/unknown)"
                      value={form.claim.atFault}
                      onChangeText={(v) => setField('claim', 'atFault', v)}
                    />
                  </GridItem>
                  <GridItem full>
                    <Field
                      label="Other party info"
                      value={form.claim.otherPartyInfo}
                      multiline
                      onChangeText={(v) => setField('claim', 'otherPartyInfo', v)}
                    />
                  </GridItem>
                </GroupCard>
              </View>

              <View style={styles.row}>
                <Pressable style={[styles.secondaryButton, { flex: 1 }]} onPress={cancelEdit}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <PrimaryButton title="Save changes" loading={saving} onPress={saveChanges} />
                </View>
              </View>
              {saveResult ? <Text style={styles.resultText}>{saveResult}</Text> : null}
            </>
          ) : (
            <View style={styles.groupGrid}>
              <GroupCard title="Contact">
                <GridItem>
                  <ReadOnlyRow label="Full name" value={form.contact.fullName} />
                </GridItem>
                <GridItem>
                  <ReadOnlyRow label="Phone" value={form.contact.phone} />
                </GridItem>
                <GridItem>
                  <ReadOnlyRow label="Email" value={form.contact.email} />
                </GridItem>
              </GroupCard>

              <GroupCard title="Insurance">
                {form.insurance.companyName ||
                form.insurance.policyNumber ||
                form.insurance.claimNumber ||
                form.insurance.adjusterName ||
                form.insurance.adjusterContact ? (
                  <>
                    <GridItem>
                      <ReadOnlyRow label="Company" value={form.insurance.companyName} />
                    </GridItem>
                    <GridItem>
                      <ReadOnlyRow label="Policy #" value={form.insurance.policyNumber} />
                    </GridItem>
                    <GridItem>
                      <ReadOnlyRow label="Claim #" value={form.insurance.claimNumber} />
                    </GridItem>
                    <GridItem>
                      <ReadOnlyRow label="Adjuster name" value={form.insurance.adjusterName} />
                    </GridItem>
                    <GridItem>
                      <ReadOnlyRow label="Adjuster contact" value={form.insurance.adjusterContact} />
                    </GridItem>
                  </>
                ) : (
                  <GridItem full>
                    <Text style={styles.muted}>No insurance info on file.</Text>
                  </GridItem>
                )}
              </GroupCard>

              <GroupCard title="License">
                {form.license.name || form.license.number || form.license.expiration ? (
                  <>
                    <GridItem>
                      <ReadOnlyRow label="Name" value={form.license.name} />
                    </GridItem>
                    <GridItem>
                      <ReadOnlyRow label="Number" value={form.license.number} />
                    </GridItem>
                    <GridItem>
                      <ReadOnlyRow label="Expiration" value={form.license.expiration} />
                    </GridItem>
                  </>
                ) : (
                  <GridItem full>
                    <Text style={styles.muted}>No license info on file.</Text>
                  </GridItem>
                )}
              </GroupCard>

              <GroupCard title="Vehicle">
                <GridItem>
                  <ReadOnlyRow label="Year" value={form.vehicle.year} />
                </GridItem>
                <GridItem>
                  <ReadOnlyRow label="Make" value={form.vehicle.make} />
                </GridItem>
                <GridItem>
                  <ReadOnlyRow label="Model" value={form.vehicle.model} />
                </GridItem>
                <GridItem>
                  <ReadOnlyRow label="VIN" value={form.vehicle.vin} />
                </GridItem>
                <GridItem>
                  <ReadOnlyRow label="License plate" value={form.vehicle.licensePlate} />
                </GridItem>
                <GridItem>
                  <ReadOnlyRow label="Mileage" value={form.vehicle.mileage} />
                </GridItem>
                <GridItem full>
                  <ReadOnlyRow label="Damage description" value={form.vehicle.damageDescription} />
                </GridItem>
              </GroupCard>

              <GroupCard title="Rental">
                {form.rental.hasCoverage || form.rental.limitOrDays || form.rental.preference ? (
                  <>
                    <GridItem>
                      <ReadOnlyRow label="Coverage" value={form.rental.hasCoverage} />
                    </GridItem>
                    <GridItem>
                      <ReadOnlyRow label="Limit or days" value={form.rental.limitOrDays} />
                    </GridItem>
                    <GridItem>
                      <ReadOnlyRow label="Preference" value={form.rental.preference} />
                    </GridItem>
                  </>
                ) : (
                  <GridItem full>
                    <Text style={styles.muted}>No rental info on file.</Text>
                  </GridItem>
                )}
              </GroupCard>

              <GroupCard title="Claim">
                {form.claim.accidentDate ||
                form.claim.accidentLocation ||
                form.claim.policeReportNumber ||
                form.claim.atFault ||
                form.claim.otherPartyInfo ? (
                  <>
                    <GridItem>
                      <ReadOnlyRow label="Accident date" value={form.claim.accidentDate} />
                    </GridItem>
                    <GridItem>
                      <ReadOnlyRow label="Location" value={form.claim.accidentLocation} />
                    </GridItem>
                    <GridItem>
                      <ReadOnlyRow label="Police report #" value={form.claim.policeReportNumber} />
                    </GridItem>
                    <GridItem>
                      <ReadOnlyRow label="At fault" value={form.claim.atFault} />
                    </GridItem>
                    <GridItem full>
                      <ReadOnlyRow label="Other party info" value={form.claim.otherPartyInfo} />
                    </GridItem>
                  </>
                ) : (
                  <GridItem full>
                    <Text style={styles.muted}>No claim info on file.</Text>
                  </GridItem>
                )}
              </GroupCard>
            </View>
          )}
        </View>
      </View>

      <Section title={`Documents & photos (${submission.attachments.length})`}>
        {submission.attachments.length === 0 ? (
          <Text style={styles.muted}>None uploaded.</Text>
        ) : (
          <View style={styles.groupGrid}>
            {submission.attachments.map((a) => {
              const isImage = a.contentType.startsWith('image/');
              const url = api.attachmentUrl(a.id);
              return (
                <View key={a.id} style={styles.attachmentCard}>
                  {isImage ? (
                    <Image source={{ uri: url }} style={styles.attachmentThumbLarge} />
                  ) : (
                    <View style={[styles.attachmentThumbLarge, styles.attachmentThumbFallback]}>
                      <Text style={styles.attachmentThumbText}>FILE</Text>
                    </View>
                  )}
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
              );
            })}
          </View>
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

      <Section title="Scheduling">
        <View style={styles.groupGrid}>
          <GroupCard title="Appointments">
            <GridItem>
              <Field
                label="Drop-off (YYYY-MM-DDTHH:mm)"
                value={dropoffScheduledAt}
                placeholder="2026-09-25T09:00"
                onChangeText={setDropoffScheduledAt}
              />
            </GridItem>
            <GridItem>
              <Field
                label="Pickup (YYYY-MM-DDTHH:mm)"
                value={pickupScheduledAt}
                placeholder="2026-10-01T16:00"
                onChangeText={setPickupScheduledAt}
              />
            </GridItem>
          </GroupCard>
        </View>
        <PrimaryButton title="Save schedule" loading={savingSchedule} onPress={saveSchedule} />
        {scheduleResult ? <Text style={styles.resultText}>{scheduleResult}</Text> : null}
      </Section>

      <Section title={`Repair estimate ($${estimateTotals.grandTotal.toLocaleString()})`}>
        <View style={styles.groupGrid}>
          {ESTIMATE_CATEGORY_OPTIONS.map((cat) => (
            <View key={cat.value} style={styles.estimateTotalCard}>
              <Text style={styles.estimateTotalLabel}>{cat.label}</Text>
              <Text style={styles.estimateTotalValue}>
                ${(estimateTotals.byCategory[cat.value] ?? 0).toLocaleString()}
              </Text>
            </View>
          ))}
        </View>

        {estimateLines.length > 0 && (
          <View style={{ marginTop: spacing.md }}>
            {estimateLines.map((line) => (
              <View key={line.id} style={styles.lineRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineDescription}>{line.description}</Text>
                  <Text style={styles.tiny}>
                    {ESTIMATE_CATEGORY_LABELS[line.category]}
                    {line.partNumber ? ` · #${line.partNumber}` : ''}
                    {line.category === 'LABOR'
                      ? ` · ${line.laborHours ?? 0} hrs @ $${line.unitPrice}/hr`
                      : ` · ${line.quantity} × $${line.unitPrice}`}
                  </Text>
                </View>
                <Text style={styles.lineTotal}>${line.total.toLocaleString()}</Text>
                <Pressable onPress={() => removeEstimateLine(line.id)}>
                  <Text style={[styles.linkText, { color: colors.danger, marginLeft: spacing.sm }]}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.groupHeader}>Add a line</Text>
        <View style={styles.groupGrid}>
          <View style={styles.groupCard}>
            <View style={styles.fieldGrid}>
              <GridItem>
                <ChoiceRow
                  label="Category"
                  value={newLineCategory}
                  onChange={setNewLineCategory}
                  options={ESTIMATE_CATEGORY_OPTIONS}
                />
              </GridItem>
              <GridItem full>
                <Field label="Description" value={newLineDescription} onChangeText={setNewLineDescription} />
              </GridItem>
              <GridItem>
                <Field label="Part # (optional)" value={newLinePartNumber} onChangeText={setNewLinePartNumber} />
              </GridItem>
              {newLineCategory === 'LABOR' ? (
                <>
                  <GridItem>
                    <Field
                      label="Labor hours"
                      value={newLineLaborHours}
                      keyboardType="decimal-pad"
                      onChangeText={setNewLineLaborHours}
                    />
                  </GridItem>
                  <GridItem>
                    <Field
                      label="Rate ($/hr)"
                      value={newLineUnitPrice}
                      keyboardType="decimal-pad"
                      onChangeText={setNewLineUnitPrice}
                    />
                  </GridItem>
                </>
              ) : (
                <>
                  <GridItem>
                    <Field
                      label="Quantity"
                      value={newLineQuantity}
                      keyboardType="decimal-pad"
                      onChangeText={setNewLineQuantity}
                    />
                  </GridItem>
                  <GridItem>
                    <Field
                      label="Unit price ($)"
                      value={newLineUnitPrice}
                      keyboardType="decimal-pad"
                      onChangeText={setNewLineUnitPrice}
                    />
                  </GridItem>
                </>
              )}
            </View>
            <View style={{ marginTop: spacing.sm }}>
              <PrimaryButton
                title="Add line"
                loading={addingLine}
                disabled={!newLineDescription.trim()}
                onPress={addEstimateLine}
              />
            </View>
          </View>
        </View>
      </Section>

      <Section title={`Parts orders (${partsOrders.length})`}>
        {partsOrders.length === 0 ? (
          <Text style={styles.muted}>No parts on order yet.</Text>
        ) : (
          <View style={styles.groupGrid}>
            {partsOrders.map((order) => (
              <View key={order.id} style={styles.groupCard}>
                <Text style={styles.groupCardTitle}>{order.description}</Text>
                {order.partNumber ? <Text style={styles.tiny}>Part #: {order.partNumber}</Text> : null}
                {order.supplier ? <Text style={styles.tiny}>Supplier: {order.supplier}</Text> : null}
                <View style={{ marginTop: spacing.sm }}>
                  <ChoiceRow
                    label="Status"
                    value={order.status}
                    onChange={(v) => changePartsOrderStatus(order.id, v)}
                    options={PARTS_ORDER_STATUS_OPTIONS}
                  />
                </View>
                <Pressable onPress={() => removePartsOrder(order.id)}>
                  <Text style={[styles.linkText, { color: colors.danger }]}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.groupHeader}>Add a part</Text>
        <View style={styles.groupGrid}>
          <View style={styles.groupCard}>
            <View style={styles.fieldGrid}>
              <GridItem full>
                <Field label="Description" value={newPartDescription} onChangeText={setNewPartDescription} />
              </GridItem>
              <GridItem>
                <Field label="Part # (optional)" value={newPartNumber} onChangeText={setNewPartNumber} />
              </GridItem>
              <GridItem>
                <Field label="Supplier (optional)" value={newPartSupplier} onChangeText={setNewPartSupplier} />
              </GridItem>
            </View>
            <View style={{ marginTop: spacing.sm }}>
              <PrimaryButton
                title="Add part"
                loading={addingPart}
                disabled={!newPartDescription.trim()}
                onPress={addPartsOrder}
              />
            </View>
          </View>
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
  section: { marginBottom: spacing.lg, position: 'relative', zIndex: 10 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
    zIndex: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
    marginRight: spacing.xs,
    position: 'relative',
    zIndex: 50,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
    position: 'relative',
    zIndex: 50,
  },
  sectionTitleRow: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusDropdownWrap: { position: 'relative', zIndex: 100 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  statusBadgeCaret: { color: '#fff', fontSize: 10, fontWeight: '700' },
  statusMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: spacing.xs,
    minWidth: 220,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 100,
  },
  statusMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  statusMenuItemActive: { backgroundColor: colors.inputBg },
  statusMenuDot: { width: 8, height: 8, borderRadius: 4 },
  statusMenuItemText: { fontSize: 14, color: colors.text, fontWeight: '600' },
  editIconButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  editIconText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  secondaryButton: {
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  secondaryButtonText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  groupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.md },
  groupCard: {
    flexGrow: 1,
    flexBasis: 300,
    minWidth: 260,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  fieldGridItem: { flexBasis: '46%', flexGrow: 1, minWidth: 120 },
  fieldGridItemFull: { flexBasis: '100%' },
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
  attachmentCard: {
    flexGrow: 1,
    flexBasis: 200,
    minWidth: 180,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  attachmentThumbLarge: {
    width: '100%',
    height: 120,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
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
  estimateTotalCard: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 130,
    backgroundColor: colors.inputBg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  estimateTotalLabel: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  estimateTotalValue: { fontSize: 18, fontWeight: '800', color: colors.primary, marginTop: 2 },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lineDescription: { fontSize: 14, fontWeight: '700', color: colors.text },
  lineTotal: { fontSize: 14, fontWeight: '800', color: colors.text },
});
































