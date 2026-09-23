import type {
  CreateIntakeInput,
  DamageAssessment,
  EstimateLineSuggestion,
  SuggestEstimateLinesResponse,
} from '@autobody/shared';
import { config, hasOpenAI } from '../../config/index.js';

/**
 * AI estimate-line suggestions — the flagship "AI does the estimator's
 * first pass" feature. Given the damage assessment (severity/affected
 * areas/cost range) and the intake's vehicle/damage description, produce a
 * starting set of PARTS/LABOR/PAINT_MATERIALS line items so staff only
 * have to review, adjust pricing, and accept — never start a repair
 * estimate from a blank line. Same swappable-driver pattern as the rest of
 * the AI layer: a rules fallback that's always available, a real OpenAI
 * driver when configured.
 */
export interface SuggestLinesInput {
  vehicleInfo: string | null;
  damageDescription?: string;
  damageAssessment: DamageAssessment | null;
  existingDescriptions: string[];
}

/**
 * Rules fallback — turns each affected area from the damage assessment into
 * a plausible PARTS + LABOR line pair, splitting the assessment's cost
 * range proportionally across areas so the total roughly lines up with the
 * AI's own damage-assessment estimate. Deliberately conservative/generic
 * (never invents OEM part numbers) — always flagged for staff review.
 */
function suggestLinesWithRules(input: SuggestLinesInput): EstimateLineSuggestion[] {
  const areas = input.damageAssessment?.affectedAreas?.length
    ? input.damageAssessment.affectedAreas
    : input.damageDescription
      ? [input.damageDescription.slice(0, 60)]
      : ['General repair'];

  const costRange = input.damageAssessment?.estimatedCostRange;
  const totalLaborHours = input.damageAssessment?.estimatedLaborHours;
  const perAreaCost = costRange ? (costRange.min + costRange.max) / 2 / areas.length : 300;
  const perAreaLaborHours = totalLaborHours
    ? (totalLaborHours.min + totalLaborHours.max) / 2 / areas.length
    : 1.5;

  const suggestions: EstimateLineSuggestion[] = [];
  for (const area of areas) {
    const partsShare = Math.round(perAreaCost * 0.6 * 100) / 100;
    const paintShare = Math.round(perAreaCost * 0.15 * 100) / 100;
    suggestions.push({
      category: 'PARTS',
      description: `Repair/replace: ${area}`,
      partNumber: null,
      quantity: 1,
      unitPrice: partsShare,
      laborHours: null,
      reasoning: `Estimated from AI damage assessment (${area} flagged as affected).`,
    });
    suggestions.push({
      category: 'LABOR',
      description: `Labor: ${area}`,
      partNumber: null,
      quantity: 1,
      unitPrice: 65,
      laborHours: Math.round(perAreaLaborHours * 10) / 10,
      reasoning: 'Hours split evenly across affected areas from the damage assessment\'s labor-hour range.',
    });
    if (paintShare > 0) {
      suggestions.push({
        category: 'PAINT_MATERIALS',
        description: `Paint & materials: ${area}`,
        partNumber: null,
        quantity: 1,
        unitPrice: paintShare,
        laborHours: null,
        reasoning: 'Paint/materials allowance estimated as a share of the damage-assessment cost range.',
      });
    }
  }
  return suggestions;
}

async function suggestLinesWithOpenAI(input: SuggestLinesInput): Promise<EstimateLineSuggestion[]> {
  const prompt = `You are a collision-repair estimator's assistant. Given the damage info below, suggest a starting set of repair estimate line items (parts, labor, paint materials). Be conservative and generic (no invented OEM part numbers, no invented prices beyond reasonable US collision-repair market rates). Vehicle: ${
    input.vehicleInfo ?? 'unspecified'
  }. Damage description: ${input.damageDescription ?? 'none provided'}. AI damage assessment: ${JSON.stringify(
    input.damageAssessment,
  )}. Existing estimate lines already on file (do not duplicate): ${JSON.stringify(input.existingDescriptions)}.

Respond with ONLY a JSON object: {"lines": [{"category": "PARTS"|"LABOR"|"PAINT_MATERIALS"|"SUBLET"|"MISC", "description": string, "partNumber": string|null, "quantity": number, "unitPrice": number, "laborHours": number|null, "reasoning": string}]}. Limit to at most 8 lines.`;

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
  const parsed = JSON.parse(content) as { lines: EstimateLineSuggestion[] };
  if (!Array.isArray(parsed.lines)) throw new Error('OpenAI response missing "lines" array');
  return parsed.lines;
}

export async function suggestEstimateLines(input: SuggestLinesInput): Promise<SuggestEstimateLinesResponse> {
  if (hasOpenAI) {
    try {
      const suggestions = await suggestLinesWithOpenAI(input);
      return { suggestions, generatedBy: 'openai', generatedAt: new Date().toISOString() };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[ai] OpenAI estimate-line suggestion failed, falling back to rules:', (err as Error).message);
    }
  }
  return {
    suggestions: suggestLinesWithRules(input),
    generatedBy: 'rules',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Estimate gap-check — compares the damage assessment's affected areas
 * against the descriptions already on the estimate and flags anything that
 * looks unaccounted for. Pure string matching (cheap, always on, no AI
 * call) — a safety net against under-quoting a repair before it's sent to
 * the customer/insurer.
 */
export function checkEstimateGaps(
  damageAssessment: DamageAssessment | null,
  existingDescriptions: string[],
): string[] {
  if (!damageAssessment?.affectedAreas?.length) return [];
  const haystack = existingDescriptions.join(' | ').toLowerCase();
  return damageAssessment.affectedAreas.filter((area) => {
    const key = area.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (key.length === 0) return !haystack.includes(area.toLowerCase());
    return !key.some((word) => haystack.includes(word));
  });
}

// Re-export for callers that only need the type import path consolidated here.
export type { CreateIntakeInput };

