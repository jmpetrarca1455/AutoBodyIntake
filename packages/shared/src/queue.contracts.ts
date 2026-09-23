import type { AiPriority } from './ai.contracts.js';

/**
 * The "Smart Queue" — a shop-wide, ranked worklist across all active
 * submissions. Unlike a plain inbox sorted by date, this ranks by what
 * actually needs attention *right now*: AI-assessed priority, how much
 * info is still missing, and how long it's been sitting untouched.
 * Deterministic (no extra AI call needed at read time — it reuses each
 * submission's cached AI triage), so it's instant and free to refresh.
 */
export interface QueueItem {
  id: string;
  customerName: string;
  vehicleInfo: string | null;
  status: string;
  priority: AiPriority | null;
  missingInfoCount: number;
  ageHours: number;
  /** Human-readable reason this item is ranked where it is. */
  queueReason: string;
  score: number;
  createdAt: string;
}

