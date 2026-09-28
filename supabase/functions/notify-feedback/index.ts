// supabase/functions/notify-feedback/index.ts
//
// Emails the owner whenever a new row lands in Project Scarlett's feedback_reports table.
//
// DEPLOY TO THE SCARLETT PROJECT ONLY (never the LeadLens project):
//   supabase functions deploy notify-feedback --project-ref dlntgyhfxxbcwwcxaorn --no-verify-jwt
//
// Called by a Postgres trigger (pg_net) with body { "id": "<feedback row uuid>" }.
// Safe to leave publicly callable: a row can be emailed AT MOST ONCE (it is claimed by setting
// notified_at before sending), and the function only ever sends about rows that really exist.
//
// Secrets (supabase secrets set --project-ref dlntgyhfxxbcwwcxaorn ...):
//   RESEND_API_KEY        required
//   FEEDBACK_NOTIFY_TO    required, comma-separated recipient list
//   FEEDBACK_NOTIFY_FROM  optional, defaults to LeadLens Beta <noreply@support.okayestmedia.com>
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically -- and because they belong to
// whichever project the function is deployed to, it cannot read the wrong project's data.

type Row = Record<string, unknown>;
type EnvGetter = { get: (key: string) => string | undefined };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const DEFAULT_FROM = 'LeadLens Beta <noreply@support.okayestmedia.com>';
const TYPE_LABELS: Record<string, string> = {
  bug: 'Bug', crash: 'Crash', ux: 'UX / Design', performance: 'Performance', feature: 'Feature suggestion', other: 'General',
};
const TIMEOUT_MS = 8000;

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const text = (v: unknown, max = 4000): string => {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return s.length > max ? s.slice(0, max) + ' ...[truncated]' : s;
};
const oneLine = (v: unknown, max: number): string => text(v, max * 2).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function buildEmail(row: Row, from: string, to: string[]) {
  const severity = oneLine(row.severity || 'medium', 12).toUpperCase();
  const type = TYPE_LABELS[String(row.feedback_type)] || 'Feedback';
  const headline = oneLine(row.title, 70) || oneLine(row.description, 70) || '(no text)';
  const subject = `[LeadLens beta] ${severity} ${type}: ${headline}`.slice(0, 140);

  const fields: Array<[string, string]> = [
    ['Type', type],
    ['Severity', text(row.severity)],
    ['Screen / feature', text(row.screen_feature)],
    ['Title', text(row.title)],
    ['Description', text(row.description)],
    ['Steps to reproduce', text(row.steps_to_reproduce)],
    ['Expected behavior', text(row.expected_behavior)],
    ['Frequency', text(row.frequency)],
    ['Additional notes', text(row.additional_notes)],
    ['Session rating', row.session_rating ? `${row.session_rating} / 5` : ''],
    ['Tester', [text(row.tester_name), text(row.tester_email)].filter(Boolean).join(' - ')],
    ['Invite code', text(row.invite_code)],
    ['App version', text(row.app_version)],
    ['Submitted', text(row.submitted_at)],
  ];
  const shown = fields.filter(([, v]) => v);

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;max-width:640px">` +
    `<h2 style="margin:0 0 12px">New beta feedback</h2>` +
    `<table style="border-collapse:collapse;width:100%">` +
    shown.map(([k, v]) =>
      `<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;vertical-align:top;white-space:nowrap;color:#555">${escapeHtml(k)}</td>` +
      `<td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`).join('') +
    `</table></div>`;
  const plain = 'New beta feedback\n\n' + shown.map(([k, v]) => `${k}: ${v}`).join('\n');

  const email: Record<string, unknown> = { from, to, subject, html, text: plain };
  const replyTo = text(row.tester_email, 200);
  if (EMAIL_RE.test(replyTo)) email.reply_to = replyTo; // reply straight to the tester
  return email;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function handle(req: Request, env: EnvGetter, fetchFn: typeof fetch): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let id = '';
  try {
    const body = await req.json();
    id = String(body?.id ?? body?.record?.id ?? '');
  } catch { return json(400, { error: 'invalid_json' }); }
  if (!UUID_RE.test(id)) return json(400, { error: 'invalid_id' });

  const base = env.get('SUPABASE_URL');
  const service = env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendKey = env.get('RESEND_API_KEY');
  const to = (env.get('FEEDBACK_NOTIFY_TO') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const missing = [!base && 'SUPABASE_URL', !service && 'SUPABASE_SERVICE_ROLE_KEY', !resendKey && 'RESEND_API_KEY', !to.length && 'FEEDBACK_NOTIFY_TO'].filter(Boolean);
  if (missing.length) { console.error('notify-feedback not configured; missing:', missing.join(',')); return json(500, { error: 'not_configured', missing }); }

  const from = env.get('FEEDBACK_NOTIFY_FROM') || DEFAULT_FROM;
  const rest = { apikey: service as string, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };

  // 1. claim the row (atomic: only one caller can flip notified_at from null)
  let claimed: Row | null = null;
  try {
    const res = await fetchFn(`${base}/rest/v1/feedback_reports?id=eq.${id}&notified_at=is.null`, {
      method: 'PATCH', headers: { ...rest, Prefer: 'return=representation' },
      body: JSON.stringify({ notified_at: new Date().toISOString() }), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) { console.error('claim failed', id, res.status); return json(502, { error: 'claim_failed' }); }
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return json(200, { status: 'skipped' }); // unknown id or already emailed
    claimed = rows[0] as Row;
  } catch (e) { console.error('claim threw', id, (e as Error)?.name); return json(502, { error: 'claim_failed' }); }

  // 2. send; on any failure release the claim so a retry can try again
  let sent = false;
  try {
    const res = await fetchFn('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildEmail(claimed, from, to)), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    sent = res.ok;
    if (!sent) console.error('resend rejected', id, res.status);
  } catch (e) { console.error('resend threw', id, (e as Error)?.name); }

  if (!sent) {
    try {
      await fetchFn(`${base}/rest/v1/feedback_reports?id=eq.${id}`, {
        method: 'PATCH', headers: rest, body: JSON.stringify({ notified_at: null }), signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch { /* nothing more we can do */ }
    return json(502, { error: 'email_failed' });
  }
  console.log('notify-feedback sent', id);
  return json(200, { status: 'sent' });
}

// @ts-ignore -- Deno global (edge runtime)
Deno.serve((req: Request) => handle(req, { get: (k: string) => Deno.env.get(k) }, fetch));
