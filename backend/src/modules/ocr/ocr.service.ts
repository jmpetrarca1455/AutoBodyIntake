import {
  OCR_FIELD_TEMPLATES,
  documentKindForAttachmentKind,
  type OcrDocumentKind,
  type OcrExtraction,
} from '@autobody/shared';
import { config, hasOpenAI } from '../../config/index.js';

/**
 * OCR auto-fill — extracts structured fields from a photographed document
 * so the customer doesn't have to type them by hand.
 *
 * Same swappable-driver pattern as ai.service.ts:
 *   • rules  — zero-config fallback. We can't actually read pixels without a
 *     vision model, so this returns typed-but-empty fields (never blocks the
 *     upload flow, and the UI can still show "not extracted yet").
 *   • openai — real extraction via a vision-capable chat completion.
 */
export { documentKindForAttachmentKind };

function emptyExtraction(documentType: OcrDocumentKind): OcrExtraction {
  const fields: Record<string, string | null> = {};
  for (const field of OCR_FIELD_TEMPLATES[documentType]) {
    fields[field] = null;
  }
  return {
    documentType,
    fields,
    confidence: 'low',
    generatedBy: 'rules',
    generatedAt: new Date().toISOString(),
  };
}

async function extractWithOpenAI(
  documentType: OcrDocumentKind,
  imageBuffer: Buffer,
  contentType: string,
): Promise<OcrExtraction> {
  const fieldList = OCR_FIELD_TEMPLATES[documentType].join(', ');
  const dataUrl = `data:${contentType};base64,${imageBuffer.toString('base64')}`;
  const label = documentType.replace('_', ' ');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: config.AI_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract these fields from this ${label} photo: ${fieldList}. Respond with ONLY a JSON object mapping each field name to its extracted string value (or null if illegible/absent). Do not guess — use null when unsure.`,
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI OCR request failed: ${res.status}`);
  }

  const body = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const content = body.choices[0]?.message.content;
  if (!content) {
    throw new Error('OpenAI OCR response had no content');
  }
  const fields = JSON.parse(content) as Record<string, string | null>;

  return {
    documentType,
    fields,
    confidence: 'high',
    generatedBy: 'openai',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Extract fields from a document image. Tries OpenAI Vision when configured
 * (and the file is actually an image — PDFs skip straight to the fallback);
 * always falls back to empty-but-typed fields on any failure.
 */
export async function extractDocumentFields(
  documentType: OcrDocumentKind,
  imageBuffer: Buffer,
  contentType: string,
): Promise<OcrExtraction> {
  if (hasOpenAI && contentType.startsWith('image/')) {
    try {
      return await extractWithOpenAI(documentType, imageBuffer, contentType);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[ocr] OpenAI extraction failed, falling back to empty fields:', (err as Error).message);
    }
  }
  return emptyExtraction(documentType);
}



