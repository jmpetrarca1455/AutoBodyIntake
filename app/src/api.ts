/**
 * Shared types + API client for the AutoBody Intake backend.
 * Mirrors the backend contracts (see backend/src/modules/intake).
 */
import { config } from './config';

// ── Intake payload (mirrors backend Zod schema) ─────────
export type PreferredContact = 'phone' | 'email' | 'text';

export interface IntakePayload {
  contact: {
    fullName: string;
    phone?: string;
    email?: string;
    preferredContactMethod?: PreferredContact;
  };
  insurance?: {
    companyName?: string;
    policyNumber?: string;
    claimNumber?: string;
    adjusterName?: string;
    adjusterContact?: string;
  };
  license?: {
    name?: string;
    number?: string;
    expiration?: string;
  };
  vehicle?: {
    year?: number;
    make?: string;
    model?: string;
    vin?: string;
    licensePlate?: string;
    mileage?: number;
    damageDescription?: string;
  };
  rental?: {
    hasCoverage?: 'yes' | 'no' | 'unknown';
    limitOrDays?: string;
    preference?: string;
  };
  claim?: {
    accidentDate?: string;
    accidentLocation?: string;
    policeReportNumber?: string;
    otherPartyInfo?: string;
    atFault?: 'self' | 'other' | 'unknown';
  };
}

export type AttachmentKind =
  | 'insurance_card_front'
  | 'insurance_card_back'
  | 'license_front'
  | 'license_back'
  | 'vehicle_photo'
  | 'damage_photo'
  | 'vin_photo'
  | 'other';

export interface PublicShop {
  name: string;
  address: string | null;
  intakeToken: string;
  isActive: boolean;
}

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

// ── HTTP helpers ────────────────────────────────────────
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
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
};

