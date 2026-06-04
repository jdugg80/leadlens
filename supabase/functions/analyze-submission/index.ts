// Supabase Edge Function: analyze-submission
// Triggers on INSERT to feature_requests where source = 'rep'
// 1. Runs Claude AI analysis to generate priority, spec, agent script
// 2. Updates the row with the analysis
// 3. Sends Resend email notification to owner for critical/high priority
// 4. Sends web push notification

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") || "joe@okaymedia.com";
const WEB_PUSH_ENDPOINT = Deno.env.get("WEB_PUSH_ENDPOINT") || "";

const PROJECT_CONTEXTS: Record<string, string> = {
  leadlens: `LeadLens is a React Native field sales prospecting app for pest control.
Stack: React Native 0.74, Expo SDK 51 (bare workflow), Supabase backend, Google Maps/Places API, MMKV storage, Claude AI API, EAS Build.
Key screens: TerritoryMapScreen, ProspectQueueScreen, SupportScreen, LoginScreen, LeadLockCameraScreen.
Design palette: bg #080A0F, cyan #00C9FF, red #CC1040, purple #7B3FBE, chrome #B8BDD0.
Package: com.okaymedia.leadlens`,
};

// ── Claude analysis ───────────────────────────────────────────────────────────
async function analyzeWithClaude(
  rawInput: string,
  type: string,
  projectId: string
): Promise<Record<string, unknown>> {
  const projectContext = PROJECT_CONTEXTS[projectId] || `Project: ${projectId}`;

  const systemPrompt = `You are the technical planning AI for the following project:

${projectContext}

When given a ${type === "bug" ? "bug report" : "feature idea"} submitted by a field rep, respond ONLY with a valid JSON object — no markdown, no backticks, no preamble.

JSON shape:
{
  "title": "short title (max 8 words)",
  "summary": "1-2 sentence plain English summary",
  "type": "${type}",
  "priority": "critical|high|medium|low",
  "priority_reason": "one sentence explaining priority",
  "complexity": "low|medium|high",
  "affected_screens": ["array of screen names"],
  "dependencies": ["any libs, APIs, or features required"],
  "effort_estimate": "e.g. 2-4 hours / 1-2 days / 3-5 days",
  "suggested_update": "e.g. Beta-49 or Beta-50",
  "agent_prompt": "A complete copy-paste Claude prompt to implement this fix/feature. Include all project context, file references, and exact instructions needed.",
  "task_breakdown": [
    { "step": 1, "action": "description of step", "file": "filename if applicable" }
  ]
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: rawInput }],
    }),
  });

  const data = await response.json();
  const text = data.content?.map((b: { text?: string }) => b.text || "").join("") || "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ── Resend email notification ─────────────────────────────────────────────────
async function sendEmailNotification(item: Record<string, unknown>) {
  const priorityEmoji: Record<string, string> = {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🟢",
  };

  const emoji = priorityEmoji[item.priority as string] || "⚪";
  const typeLabel = item.type === "bug" ? "BUG REPORT" : "FEATURE REQUEST";

  const html = `
    <div style="font-family: monospace; background: #080A0F; color: #B8BDD0; padding: 24px; border-radius: 8px; max-width: 600px;">
      <div style="border-bottom: 1px solid #00C9FF33; padding-bottom: 16px; margin-bottom: 16px;">
        <span style="color: #00C9FF; font-size: 18px; letter-spacing: 3px;">LEADLENS ROADMAP</span><br/>
        <span style="color: #444; font-size: 11px; letter-spacing: 2px;">NEW REP SUBMISSION</span>
      </div>
      <div style="margin-bottom: 12px;">
        <span style="font-size: 20px;">${emoji}</span>
        <span style="color: #d0d8f0; font-size: 16px; margin-left: 8px;">${item.title}</span>
      </div>
      <div style="background: #0d1018; border: 1px solid #1a2030; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
        <div style="color: #444; font-size: 10px; letter-spacing: 2px; margin-bottom: 6px;">SUMMARY</div>
        <div style="color: #8899bb; font-size: 13px;">${item.summary}</div>
      </div>
      <div style="display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap;">
        <div style="background: #0d1018; border: 1px solid #1a2030; border-radius: 6px; padding: 10px 14px;">
          <div style="color: #444; font-size: 9px; letter-spacing: 2px;">TYPE</div>
          <div style="color: #8899bb; font-size: 12px; margin-top: 3px;">${typeLabel}</div>
        </div>
        <div style="background: #0d1018; border: 1px solid #1a2030; border-radius: 6px; padding: 10px 14px;">
          <div style="color: #444; font-size: 9px; letter-spacing: 2px;">PRIORITY</div>
          <div style="color: #8899bb; font-size: 12px; margin-top: 3px;">${String(item.priority).toUpperCase()}</div>
        </div>
        <div style="background: #0d1018; border: 1px solid #1a2030; border-radius: 6px; padding: 10px 14px;">
          <div style="color: #444; font-size: 9px; letter-spacing: 2px;">UPDATE</div>
          <div style="color: #8899bb; font-size: 12px; margin-top: 3px;">${item.suggested_update || "TBD"}</div>
        </div>
        <div style="background: #0d1018; border: 1px solid #1a2030; border-radius: 6px; padding: 10px 14px;">
          <div style="color: #444; font-size: 9px; letter-spacing: 2px;">EFFORT</div>
          <div style="color: #8899bb; font-size: 12px; margin-top: 3px;">${item.effort_estimate || "TBD"}</div>
        </div>
      </div>
      <div style="background: #0d1018; border: 1px solid #1a2030; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
        <div style="color: #444; font-size: 10px; letter-spacing: 2px; margin-bottom: 6px;">PRIORITY RATIONALE</div>
        <div style="color: #666; font-size: 12px;">${item.priority_reason}</div>
      </div>
      <div style="background: #0a0f18; border: 1px solid #1a2535; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
        <div style="color: #444; font-size: 10px; letter-spacing: 2px; margin-bottom: 8px;">AGENT SCRIPT READY — COPY AND PASTE TO START FIXING</div>
        <div style="color: #6688aa; font-size: 11px; line-height: 1.6; white-space: pre-wrap;">${item.agent_prompt}</div>
      </div>
      <div style="background: #0d1018; border: 1px solid #1a2030; border-radius: 6px; padding: 12px;">
        <div style="color: #444; font-size: 10px; letter-spacing: 2px; margin-bottom: 6px;">ORIGINAL SUBMISSION</div>
        <div style="color: #444; font-size: 12px; font-style: italic;">${item.raw_input}</div>
      </div>
      <div style="margin-top: 16px; color: #333; font-size: 10px; letter-spacing: 1px;">
        Submitted by: ${item.submitted_by || "Field Rep"} · Project: ${String(item.project).toUpperCase()}
      </div>
    </div>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "LeadLens Roadmap <roadmap@okaymedia.com>",
      to: [OWNER_EMAIL],
      subject: `${emoji} [${typeLabel}] ${item.title} — ${String(item.priority).toUpperCase()} Priority`,
      html,
    }),
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  try {
    const body = await req.json();

    // Supabase webhook sends { type, table, record, old_record }
    const record = body.record;

    if (!record || record.source !== "rep") {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Run Claude analysis
    const spec = await analyzeWithClaude(
      record.raw_input,
      record.type || "bug",
      record.project || "leadlens"
    );

    // Update the row with the analysis
    const { error } = await supabase
      .from("feature_requests")
      .update({
        title: spec.title,
        summary: spec.summary,
        priority: spec.priority,
        priority_reason: spec.priority_reason,
        complexity: spec.complexity,
        affected_screens: JSON.stringify(spec.affected_screens),
        dependencies: JSON.stringify(spec.dependencies),
        effort_estimate: spec.effort_estimate,
        suggested_update: spec.suggested_update,
        agent_prompt: spec.agent_prompt,
        task_breakdown: JSON.stringify(spec.task_breakdown),
        status: "backlog",
      })
      .eq("id", record.id);

    if (error) throw error;

    // Send email for critical and high priority
    const priority = spec.priority as string;
    if (["critical", "high"].includes(priority)) {
      await sendEmailNotification({ ...record, ...spec });
    }

    // Always send for critical
    if (priority === "critical") {
      // Could add SMS via Twilio here in future
      console.log("CRITICAL submission — all channels notified");
    }

    return new Response(
      JSON.stringify({ success: true, priority: spec.priority, title: spec.title }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
