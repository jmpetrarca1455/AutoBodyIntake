import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MILESTONE_LABELS, type StatusMilestone } from '@autobody/shared';
import { useAuth } from '../../src/auth';
import {
  api,
  type CommunicationLogEntry,
  type SubmissionDetail,
} from '../../src/api';
import { ChoiceRow, PrimaryButton, Section } from '../../src/components/ui';
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

export default function SubmissionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token, loading: authLoading } = useAuth();
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

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

  // Communications history
  const [comms, setComms] = useState<CommunicationLogEntry[]>([]);

  const load = useCallback(async () => {
    if (!token || !id) return;
    const [detail, log] = await Promise.all([
      api.getSubmissionDetail(token, id),
      api.listCommunications(token, id).catch(() => []),
    ]);
    setSubmission(detail);
    setComms(log);
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

  if (loading || !submission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const ai = submission.aiSummary;
  const damage = submission.damageAssessment;
  const d = submission.data;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.name}>{submission.customerName}</Text>
      <Text style={styles.muted}>
        {submission.status} · {submission.vehicleInfo ?? 'No vehicle'}
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
          title={submission.customerPhone ? 'Send via SMS' : 'Send via email'}
          loading={sendingUpdate}
          disabled={!draftMessage.trim()}
          onPress={sendUpdate}
        />
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

      <Section title={`Communications history (${comms.length})`}>
        {comms.length === 0 ? (
          <Text style={styles.muted}>No messages sent yet.</Text>
        ) : (
          comms.map((c) => (
            <View key={c.id} style={styles.commRow}>
              <Text style={styles.commMeta}>
                {c.direction === 'inbound' ? '← Customer replied' : '→ Sent'} · {c.channel.toUpperCase()} ·{' '}
                {c.status} · {new Date(c.createdAt).toLocaleString()}
                {c.aiDrafted ? ' · AI-drafted' : ''}
              </Text>
              {c.subject ? <Text style={styles.commSubject}>{c.subject}</Text> : null}
              <Text style={styles.value}>{c.body}</Text>
            </View>
          ))
        )}
      </Section>

      <Section title="Contact">
        <Field label="Name" value={d.contact?.fullName} />
        <Field label="Phone" value={d.contact?.phone} />
        <Field label="Email" value={d.contact?.email} />
      </Section>

      <Section title="Insurance">
        <Field label="Company" value={d.insurance?.companyName} />
        <Field label="Policy #" value={d.insurance?.policyNumber} />
        <Field label="Claim #" value={d.insurance?.claimNumber} />
        <Field label="Adjuster" value={d.insurance?.adjusterName} />
        <Field label="Adjuster contact" value={d.insurance?.adjusterContact} />
      </Section>

      <Section title="Vehicle">
        <Field label="Vehicle" value={submission.vehicleInfo} />
        <Field label="VIN" value={d.vehicle?.vin} />
        <Field label="Plate" value={d.vehicle?.licensePlate} />
        <Field label="Damage" value={d.vehicle?.damageDescription} />
      </Section>

      <Section title="Claim">
        <Field label="Accident date" value={d.claim?.accidentDate} />
        <Field label="Location" value={d.claim?.accidentLocation} />
        <Field label="At fault" value={d.claim?.atFault} />
      </Section>

      <Section title={`Attachments (${submission.attachments.length})`}>
        {submission.attachments.length === 0 ? (
          <Text style={styles.muted}>None uploaded.</Text>
        ) : (
          submission.attachments.map((a) => (
            <Text key={a.id} style={styles.value}>
              {a.kind} — {a.fileName} ({Math.round(a.sizeBytes / 1024)} KB)
            </Text>
          ))
        )}
      </Section>
    </ScrollView>
  );
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (!value) return null;
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
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
});


