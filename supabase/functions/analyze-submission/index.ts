// Supabase Edge Function: analyze-submission
// Triggers on INSERT to feature_requests where source = 'in-app'
// Auto-triages bug reports only; feature requests require manual review.
// 1. Runs Claude AI analysis
// 2. Updates the row with analysis
// 3. Sends Resend email for ALL submissions
// 4. Sends web push to all subscribed devices

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") || "joe@okaymedia.com";
const VAPID_PUBLIC_KEY = "BJuv9Pf5X4PPM6fwosFB7OcUXOiV7XayE0N1T_hR-paY7mPijE-XaiKGa9nop5V2-zElWNHjWSASm-nmiinARfQ";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "I0559-PMAUWqQWyf8gl2hf-BJ7IZ-CC2rccmUFGhRaA";

const PROJECT_CONTEXTS: Record<string, string> = {
  leadlens: `LeadLens is a React Native field sales prospecting app for pest control.
Stack: React Native 0.74, Expo SDK 51 (bare workflow), Supabase backend, Google Maps/Places API, MMKV storage, Claude AI API, EAS Build.
Key screens: TerritoryMapScreen, ProspectQueueScreen, SupportScreen, LoginScreen, LeadLockCameraScreen.
Design palette: bg #080A0F, cyan #00C9FF, red #CC1040, purple #7B3FBE, chrome #B8BDD0.`,
};

const PRIORITY_EMOJI: Record<string, string> = {
  critical: "🔴", high: "🟠", medium: "🟡", low: "🟢",
};

// ── Claude analysis ───────────────────────────────────────────────────────────
async function analyzeWithClaude(rawInput: string, type: string, projectId: string) {
  const projectContext = PROJECT_CONTEXTS[projectId] || `Project: ${projectId}`;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ANTHROPIC_API_KEY}`,
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 1500,
      system: `You are the technical planning AI for: ${projectContext}
When given a ${type === "bug" ? "bug report" : "feature idea"}, respond ONLY with valid JSON — no markdown, no backticks.
JSON shape: {"title":"short title","summary":"1-2 sentence summary","type":"${type}","priority":"critical|high|medium|low","priority_reason":"one sentence","complexity":"low|medium|high","affected_screens":[],"dependencies":[],"effort_estimate":"e.g. 2-4 hours","suggested_update":"e.g. Beta-49","agent_prompt":"complete copy-paste Claude prompt","task_breakdown":[{"step":1,"action":"","file":""}]}`,
      messages: [{ role: "user", content: rawInput }],
    }),
  });
  const data = await response.json();
  const text = data.content?.map((b: { text?: string }) => b.text || "").join("") || "";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ── Resend email ──────────────────────────────────────────────────────────────
async function sendEmail(item: Record<string, unknown>) {
  const emoji = PRIORITY_EMOJI[item.priority as string] || "⚪";
  const typeLabel = item.type === "bug" ? "BUG REPORT" : "FEATURE REQUEST";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: "LeadLens Roadmap <roadmap@okaymedia.com>",
      to: [OWNER_EMAIL],
      subject: `${emoji} [${typeLabel}] ${item.title} — ${String(item.priority).toUpperCase()}`,
      html: `<div style="font-family:monospace;background:#080A0F;color:#B8BDD0;padding:24px;border-radius:8px;max-width:600px">
        <div style="color:#00C9FF;font-size:18px;letter-spacing:3px;margin-bottom:16px">LEADLENS ROADMAP</div>
        <div style="font-size:20px;margin-bottom:12px">${emoji} <strong style="color:#d0d8f0">${item.title}</strong></div>
        <div style="background:#0d1018;border:1px solid #1a2030;border-radius:6px;padding:12px;margin-bottom:12px;color:#8899bb">${item.summary}</div>
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <span style="background:#0d1018;border:1px solid #1a2030;border-radius:4px;padding:6px 10px;font-size:11px">Priority: ${String(item.priority).toUpperCase()}</span>
          <span style="background:#0d1018;border:1px solid #1a2030;border-radius:4px;padding:6px 10px;font-size:11px">Update: ${item.suggested_update}</span>
          <span style="background:#0d1018;border:1px solid #1a2030;border-radius:4px;padding:6px 10px;font-size:11px">Effort: ${item.effort_estimate}</span>
        </div>
        <div style="background:#0d1018;border:1px solid #1a2030;border-radius:6px;padding:12px;margin-bottom:12px">
          <div style="color:#444;font-size:10px;letter-spacing:2px;margin-bottom:6px">AGENT SCRIPT</div>
          <div style="color:#6688aa;font-size:11px;white-space:pre-wrap">${item.agent_prompt}</div>
        </div>
        <div style="color:#333;font-size:10px">From: ${item.submitted_by} · ${item.project}</div>
      </div>`,
    }),
  });
}

// ── Web Push ──────────────────────────────────────────────────────────────────
async function sendWebPush(supabase: ReturnType<typeof createClient>, item: Record<string, unknown>) {
  const { data: subs } = await supabase.from('push_subscriptions').select('subscription');
  if (!subs || subs.length === 0) return;

  const emoji = PRIORITY_EMOJI[item.priority as string] || "⚪";
  const payload = JSON.stringify({
    title: `${emoji} New ${item.type === 'bug' ? 'Bug Report' : 'Feature Request'}`,
    body: String(item.title),
    priority: item.priority,
    tag: `leadlens-${item.id}`,
    url: '/roadmap',
  });

  // Send push to each subscription
  for (const sub of subs) {
    try {
      const subscription = JSON.parse(sub.subscription);
      // Use web-push compatible format via fetch
      await fetch(subscription.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "TTL": "86400",
        },
        body: payload,
      });
    } catch (e) {
      console.warn("Push send failed:", e);
    }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  try {
    const body = await req.json();
    const record = body.record;
    if (!record || record.source !== "in-app") {
      return new Response(JSON.stringify({ skipped: true, reason: "not_in_app_submission" }), { status: 200 });
    }

    // Only auto-triage bug reports. Feature requests require manual review
    // via the roadmap site's Re-Analyze button to avoid unnecessary API calls
    // on ideas that might get rejected before any script is ever generated.
    if (record.type !== "bug") {
      return new Response(JSON.stringify({ skipped: true, reason: "feature_request_requires_manual_review" }), { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const spec = await analyzeWithClaude(record.raw_input, record.type || "bug", record.project || "leadlens");

    // Update row with analysis
    await supabase.from("feature_requests").update({
      title: spec.title, summary: spec.summary, priority: spec.priority,
      priority_reason: spec.priority_reason, complexity: spec.complexity,
      affected_screens: JSON.stringify(spec.affected_screens),
      dependencies: JSON.stringify(spec.dependencies),
      effort_estimate: spec.effort_estimate, suggested_update: spec.suggested_update,
      agent_prompt: spec.agent_prompt, task_breakdown: JSON.stringify(spec.task_breakdown),
      status: "backlog",
    }).eq("id", record.id);

    // Send notifications for ALL submissions
    await Promise.allSettled([
      sendEmail({ ...record, ...spec }),
      sendWebPush(supabase, { ...record, ...spec }),
    ]);

    return new Response(JSON.stringify({ success: true, priority: spec.priority }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
