import type { ShopDigest } from '@autobody/shared';
import { config, hasOpenAI } from '../../config/index.js';
import type { QueueItem } from '@autobody/shared';
import type { ShopReport } from '../dashboard/dashboard.service.js';
import type { PartsOrderWithSubmission } from '@autobody/shared';

/**
 * AI Daily Digest — the "walk in and already know what today looks like"
 * feature. Combines the Smart Queue, shop KPI report, and outstanding
 * parts into either a short AI-composed narrative or a deterministic
 * bullet summary. Shown on the Home dashboard so a manager doesn't have
 * to open three separate screens every morning to know what needs
 * attention.
 */
export interface DigestInput {
  queue: QueueItem[];
  report: ShopReport;
  outstandingParts: PartsOrderWithSubmission[];
}

function buildRulesDigest(input: DigestInput): ShopDigest {
  const { queue, report, outstandingParts } = input;
  const urgent = queue.filter((q) => q.priority === 'urgent');
  const high = queue.filter((q) => q.priority === 'high');
  const stale = queue.filter((q) => q.ageHours > 72);
  const backordered = outstandingParts.filter((p) => p.status === 'BACKORDERED');

  const headline =
    urgent.length > 0
      ? `${urgent.length} vehicle(s) need urgent attention today`
      : high.length > 0
        ? `${high.length} vehicle(s) are high priority today`
        : queue.length > 0
          ? `${queue.length} open repair order(s), nothing urgent right now`
          : 'No open repair orders — inbox is clear';

  const narrativeParts: string[] = [];
  narrativeParts.push(
    `You have ${queue.length} active repair order(s) in the queue, ${report.last30DaysVolume} new in the last 30 days.`,
  );
  if (report.avgCycleTimeHours !== null) {
    narrativeParts.push(`Average time from intake to emailed is ${report.avgCycleTimeHours} hours.`);
  }
  if (backordered.length > 0) {
    narrativeParts.push(
      `${backordered.length} part(s) are backordered, which may push out completion dates.`,
    );
  }
  if (stale.length > 0) {
    narrativeParts.push(`${stale.length} submission(s) have been sitting untouched for 3+ days.`);
  }

  const topPriorities: string[] = [];
  for (const item of [...urgent, ...high].slice(0, 5)) {
    topPriorities.push(`${item.customerName} (${item.vehicleInfo ?? 'no vehicle info'}) — ${item.queueReason}`);
  }
  if (topPriorities.length === 0 && queue.length > 0) {
    topPriorities.push('Nothing urgent — work the queue top to bottom as usual.');
  }

  const watchouts: string[] = [];
  for (const part of backordered.slice(0, 5)) {
    watchouts.push(`Backordered: ${part.description} for ${part.customerName} (${part.supplier ?? 'no supplier on file'})`);
  }
  if (report.outstandingPartsOrders > 0 && backordered.length === 0) {
    watchouts.push(`${report.outstandingPartsOrders} part(s) still on order — check for delivery updates.`);
  }

  return {
    headline,
    narrative: narrativeParts.join(' '),
    topPriorities,
    watchouts,
    generatedBy: 'rules',
    generatedAt: new Date().toISOString(),
  };
}

async function buildOpenAIDigest(input: DigestInput): Promise<ShopDigest> {
  const prompt = `You are an assistant summarizing a collision repair shop's current workload for the owner/manager first thing in the morning. Be concise, direct, and actionable — like a great office manager giving a 30-second briefing.

Smart queue (ranked worklist, most urgent first): ${JSON.stringify(input.queue.slice(0, 15))}
Shop KPI report: ${JSON.stringify(input.report)}
Outstanding parts orders: ${JSON.stringify(input.outstandingParts.slice(0, 15))}

Respond with ONLY a JSON object: {"headline": string (under 12 words), "narrative": string (2-4 sentences), "topPriorities": string[] (at most 5, each one short line), "watchouts": string[] (at most 5, each one short line, risks/blockers like backordered parts or stale claims)}.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: config.AI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed: ${res.status}`);
  const body = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const content = body.choices[0]?.message.content;
  if (!content) throw new Error('OpenAI response had no content');
  const parsed = JSON.parse(content) as Omit<ShopDigest, 'generatedBy' | 'generatedAt'>;
  return { ...parsed, generatedBy: 'openai', generatedAt: new Date().toISOString() };
}

export async function generateShopDigest(input: DigestInput): Promise<ShopDigest> {
  if (hasOpenAI) {
    try {
      return await buildOpenAIDigest(input);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[ai] OpenAI shop digest failed, falling back to rules:', (err as Error).message);
    }
  }
  return buildRulesDigest(input);
}

