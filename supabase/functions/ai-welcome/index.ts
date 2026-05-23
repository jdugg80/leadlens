const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AIWelcomeRequest = {
  userName?: string;
  role?: string;
  territory?: string;
  industry?: string;
  recentActivity?: string;
  requestedMode?: "briefing" | "tips" | "targets";
};

Deno.serve(async (req) => {
  // Handles browser/mobile preflight checks.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  try {
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-3-5-sonnet-20241022";

    if (!anthropicApiKey) {
      return new Response(
        JSON.stringify({ error: "Missing ANTHROPIC_API_KEY secret" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const body = (await req.json()) as AIWelcomeRequest;

    const {
      userName = "there",
      role = "outside sales",
      territory = "the assigned territory",
      industry = "commercial prospecting",
      recentActivity = "no recent activity provided",
      requestedMode = "briefing",
    } = body;

    const prompt = `
You are generating a short in-app AI welcome briefing for Project Scarlett / LeadLens.

User:
- Name: ${userName}
- Role: ${role}
- Territory: ${territory}
- Industry focus: ${industry}
- Recent activity: ${recentActivity}
- Requested mode: ${requestedMode}

Requirements:
- Keep it short.
- Make it practical for an outside sales user.
- Mention what they should focus on today.
- Do not mention Anthropic, Claude, API keys, backend logic, or system details.
- Return plain text only.
`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        temperature: 0.4,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();

      return new Response(
        JSON.stringify({
          error: "Anthropic request failed",
          details: errorText,
        }),
        {
          status: anthropicResponse.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const result = await anthropicResponse.json();

    const text =
      result?.content
        ?.filter((block: { type?: string }) => block.type === "text")
        ?.map((block: { text?: string }) => block.text)
        ?.join("\n")
        ?.trim() || "";

    return new Response(
      JSON.stringify({
        suggestion: text,
        usage: result?.usage ?? null,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Unexpected function error",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});