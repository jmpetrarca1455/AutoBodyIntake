/**
 * Typed API client for the AutoBody Intake backend.
 * Contract types come from @autobody/shared — the single source of truth
 * also used by the backend, so a field added there is typed here for free.
 */
import type {
  AttachmentKind,
  CreateIntakeInput,
  PublicShop,
  SignupInput,
  LoginInput,
  AuthResponse,
  AiTriageSummary,
  OcrExtraction,
  ShopRole,
  CreateStaffInput,
  StaffMember,
  DamageAssessment,
  StatusMilestone,
  StatusUpdateDraft,
  AdjusterEmailDraft,
  CommunicationLogEntry,
  QueueItem,
} from '@autobody/shared';
import { documentKindForAttachmentKind } from '@autobody/shared';
import { config } from './config';

// Re-export under the names the rest of the app already uses.
export type IntakePayload = CreateIntakeInput;
export type {
  AttachmentKind,
  PublicShop,
  SignupInput,
  LoginInput,
  AuthResponse,
  AiTriageSummary,
  OcrExtraction,
  ShopRole,
  CreateStaffInput,
  StaffMember,
  DamageAssessment,
  StatusMilestone,
  StatusUpdateDraft,
  AdjusterEmailDraft,
  CommunicationLogEntry,
  QueueItem,
};
export { documentKindForAttachmentKind };

export interface CreatedSubmission {
  id: string;
  status: string;
  shopName: string;
  receivedAt: string;
}

export interface LocalFile {
  uri: string;
  name: string;
  mimeType: string;
}

export interface DashboardStats {
  total: number;
  received: number;
  emailed: number;
  failed: number;
  last7Days: number;
}

export interface ShopSettings {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  secretaryEmail: string;
  ownerEmail: string | null;
  intakeToken: string;
  intakeLink: string;
  isActive: boolean;
  createdAt: string;
  role: ShopRole;
}

export interface AttachmentSummary {
  id: string;
  kind: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface SubmissionSummary {
  id: string;
  status: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  vehicleInfo: string | null;
  claimNumber: string | null;
  emailedAt: string | null;
  createdAt: string;
  aiSummary: AiTriageSummary | null;
  attachments: AttachmentSummary[];
}

export interface SubmissionDetail extends SubmissionSummary {
  data: CreateIntakeInput;
  damageAssessment: DamageAssessment | null;
}

export interface SubmissionListResponse {
  items: SubmissionSummary[];
  nextCursor: string | null;
}

// ── HTTP helpers ────────────────────────────────────────
async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (body as { message?: string }).message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

// ── API surface ─────────────────────────────────────────
export const api = {
  /** Look up shop details from an intake token (to greet the customer). */
  getShop(token: string): Promise<PublicShop> {
    return request<PublicShop>(`/v1/intake/${encodeURIComponent(token)}/shop`);
  },

  /** Create a submission with all typed intake fields. */
  createSubmission(token: string, payload: IntakePayload): Promise<CreatedSubmission> {
    return request<CreatedSubmission>(`/v1/intake/${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Upload one file/photo to a submission. */
  async uploadAttachment(
    token: string,
    submissionId: string,
    kind: AttachmentKind,
    file: LocalFile,
  ): Promise<{ id: string; kind: string; fileName: string }> {
    const form = new FormData();
    // React Native FormData file shape.
    form.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType,
    } as unknown as Blob);

    const res = await fetch(
      `${config.apiBaseUrl}/v1/intake/${encodeURIComponent(token)}/submissions/${submissionId}/attachments?kind=${kind}`,
      { method: 'POST', body: form },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((body as { message?: string }).message ?? 'Upload failed');
    }
    return body as { id: string; kind: string; fileName: string };
  },

  /** Finalize: package + email the submission to the shop's secretary. */
  finalize(
    token: string,
    submissionId: string,
  ): Promise<{ id: string; status: string; message: string }> {
    return request(
      `/v1/intake/${encodeURIComponent(token)}/submissions/${submissionId}/finalize`,
      { method: 'POST' },
    );
  },

  /**
   * Auto-fill: run OCR on a just-uploaded license/insurance-card/VIN photo.
   * Best-effort — callers should swallow failures rather than block the form.
   */
  runOcr(
    token: string,
    submissionId: string,
    attachmentId: string,
  ): Promise<{ id: string; ocrData: OcrExtraction | null; ocrGeneratedAt: string | null }> {
    return request(
      `/v1/intake/${encodeURIComponent(token)}/submissions/${submissionId}/attachments/${attachmentId}/ocr`,
      { method: 'POST' },
    );
  },

  /** Merge a partial patch (e.g. OCR-extracted fields) into an existing submission. */
  updateSubmission(
    token: string,
    submissionId: string,
    patch: Partial<IntakePayload>,
  ): Promise<{ id: string; data: IntakePayload }> {
    return request(
      `/v1/intake/${encodeURIComponent(token)}/submissions/${submissionId}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
  },

  // ── Shop portal auth ──────────────────────────────────
  signup(input: SignupInput): Promise<AuthResponse> {
    return request('/v1/auth/signup', { method: 'POST', body: JSON.stringify(input) });
  },

  login(input: LoginInput): Promise<AuthResponse> {
    return request('/v1/auth/login', { method: 'POST', body: JSON.stringify(input) });
  },

  me(authToken: string): Promise<AuthResponse['shop'] & { role: ShopRole }> {
    return request('/v1/auth/me', undefined, authToken);
  },

  // ── Staff management (owner-only) ─────────────────────
  inviteStaff(authToken: string, input: CreateStaffInput): Promise<StaffMember> {
    return request('/v1/auth/staff', { method: 'POST', body: JSON.stringify(input) }, authToken);
  },

  listStaff(authToken: string): Promise<StaffMember[]> {
    return request('/v1/auth/staff', undefined, authToken);
  },

  deactivateStaff(authToken: string, staffId: string): Promise<StaffMember> {
    return request(`/v1/auth/staff/${staffId}`, { method: 'DELETE' }, authToken);
  },

  // ── Shop dashboard (protected) ────────────────────────
  getStats(authToken: string): Promise<DashboardStats> {
    return request('/v1/dashboard/stats', undefined, authToken);
  },

  listSubmissions(
    authToken: string,
    opts: { limit?: number; cursor?: string; status?: string } = {},
  ): Promise<SubmissionListResponse> {
    const params = new URLSearchParams();
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.cursor) params.set('cursor', opts.cursor);
    if (opts.status) params.set('status', opts.status);
    const qs = params.toString();
    return request(`/v1/dashboard/submissions${qs ? `?${qs}` : ''}`, undefined, authToken);
  },

  getSubmissionDetail(authToken: string, submissionId: string): Promise<SubmissionDetail> {
    return request(`/v1/dashboard/submissions/${submissionId}`, undefined, authToken);
  },

  regenerateAiSummary(authToken: string, submissionId: string): Promise<AiTriageSummary> {
    return request(`/v1/dashboard/submissions/${submissionId}/ai-summary`, { method: 'POST' }, authToken);
  },

  /** The shop's own settings, including its shareable intake link/token. */
  getShopSettings(authToken: string): Promise<ShopSettings> {
    return request('/v1/dashboard/shop', undefined, authToken);
  },

  updateShopSettings(
    authToken: string,
    input: { name?: string; address?: string; phone?: string; secretaryEmail?: string; isActive?: boolean },
  ): Promise<unknown> {
    return request('/v1/dashboard/shop', { method: 'PATCH', body: JSON.stringify(input) }, authToken);
  },

  // ── Smart Queue (shop-wide ranked worklist) ───────────
  getQueue(authToken: string): Promise<QueueItem[]> {
    return request('/v1/dashboard/queue', undefined, authToken);
  },

  // ── AI damage assessment ───────────────────────────────
  runDamageAssessment(authToken: string, submissionId: string): Promise<DamageAssessment> {
    return request(
      `/v1/dashboard/submissions/${submissionId}/damage-assessment`,
      { method: 'POST' },
      authToken,
    );
  },

  // ── Customer status updates (AI-drafted, SMS/email) ───
  draftStatusUpdate(
    authToken: string,
    submissionId: string,
    input: { milestone: StatusMilestone; customInstruction?: string },
  ): Promise<StatusUpdateDraft> {
    return request(
      `/v1/dashboard/submissions/${submissionId}/status-updates/draft`,
      { method: 'POST', body: JSON.stringify(input) },
      authToken,
    );
  },

  sendStatusUpdate(
    authToken: string,
    submissionId: string,
    input: { milestone: StatusMilestone; message: string; channel?: 'sms' | 'email' },
  ): Promise<CommunicationLogEntry> {
    return request(
      `/v1/dashboard/submissions/${submissionId}/status-updates`,
      { method: 'POST', body: JSON.stringify(input) },
      authToken,
    );
  },

  // ── Adjuster follow-up emails (AI-drafted) ─────────────
  draftAdjusterEmail(authToken: string, submissionId: string): Promise<AdjusterEmailDraft> {
    return request(
      `/v1/dashboard/submissions/${submissionId}/adjuster-email/draft`,
      { method: 'POST' },
      authToken,
    );
  },

  sendAdjusterEmail(
    authToken: string,
    submissionId: string,
    input: { to: string; subject: string; body: string },
  ): Promise<CommunicationLogEntry> {
    return request(
      `/v1/dashboard/submissions/${submissionId}/adjuster-email/send`,
      { method: 'POST', body: JSON.stringify(input) },
      authToken,
    );
  },

  // ── Full communications audit log for a submission ────
  listCommunications(authToken: string, submissionId: string): Promise<CommunicationLogEntry[]> {
    return request(`/v1/dashboard/submissions/${submissionId}/communications`, undefined, authToken);
  },

  // ── Automated adjuster follow-up sweep (manual trigger) ─
  runAdjusterFollowUpSweep(
    authToken: string,
  ): Promise<{ checked: number; sent: number; skipped: number }> {
    return request(
      '/v1/dashboard/automation/adjuster-followups/run',
      { method: 'POST' },
      authToken,
    );
  },
};














