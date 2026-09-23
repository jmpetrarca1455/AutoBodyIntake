import querystring from 'node:querystring';
import type { FastifyInstance } from 'fastify';
import { recordInboundSms } from '../communications/communications.service.js';
import { verifyTwilioSignature } from '../communications/sms.service.js';

/**
 * Public webhook endpoints — reachable with NO auth (verified instead by
 * provider-specific signatures), since the calling party is a third-party
 * service (Twilio), not a logged-in shop user.
 *
 * This module's own Fastify context (see app.ts: each module gets an
 * encapsulated `register()` call) is the only place we register a
 * urlencoded body parser — Twilio POSTs
 * `application/x-www-form-urlencoded`, and scoping the parser here means
 * it never affects any other route's JSON parsing.
 */
export async function webhooksRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body: string, done) => {
      try {
        done(null, querystring.parse(body));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // Inbound SMS reply from a customer — completes the two-way texting loop
  // (outbound status updates are sent from the dashboard; this is how their
  // replies show up in the same communications history).
  app.post('/webhooks/twilio/sms', async (request, reply) => {
    const body = request.body as Record<string, string>;
    const from = body.From;
    const text = body.Body;

    const signature = request.headers['x-twilio-signature'] as string | undefined;
    const fullUrl = `${request.protocol}://${request.hostname}${request.url}`;
    if (!verifyTwilioSignature(fullUrl, body, signature)) {
      return reply.code(403).send('Invalid signature');
    }

    if (from && text) {
      await recordInboundSms(from, text).catch((err) => {
        request.log.warn({ err }, '[webhooks] failed to record inbound SMS');
      });
    }

    // Empty TwiML response — we don't auto-reply; staff see it in the
    // dashboard and decide whether/how to respond.
    reply.type('text/xml');
    return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  });
}

