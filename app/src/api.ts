/**
 * Typed API client for the AutoBody Intake backend.
 * Contract types come from @autobody/shared — the single source of truth
 * also used by the backend, so a field added there is typed here for free.
 */
import type { AttachmentKind, CreateIntakeInput, PublicShop } from '@autobody/shared';
import { config } from './config';

// Re-export under the names the rest of the app already uses.
export type IntakePayload = CreateIntakeInput;
export type { AttachmentKind, PublicShop };

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


