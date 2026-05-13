import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface SignalPayload {
  id: string;
  business_name: string;
  address: string;
  city: string;
  zip: string;
  has_pest_indicator: boolean;
  pest_details: string;
  is_new_opening: boolean;
  opening_type: string;
  compliance_level: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase     = createClient(SUPABASE_URL, SERVICE_KEY);

    const body: { signal: SignalPayload } = await req.json();
    const signal = body?.signal;

    if (!signal?.id) return jsonResponse({ error: 'signal is required' }, 400);

    // ── Find users whose territory includes this zip ───────────────────────
    const { data: territoryUsers, error: tzErr } = await supabase
      .from('territory_zips')
      .select('user_id')
      .eq('zip', signal.zip);

    if (tzErr || !territoryUsers?.length) {
      return jsonResponse({ ok: true, sent: 0, reason: 'no users for this zip' });
    }

    const userIds = [...new Set(territoryUsers.map((r: any) => r.user_id))];

    // ── Get push tokens for those users ───────────────────────────────────
    const { data: tokenRows, error: tokenErr } = await supabase
      .from('user_push_tokens')
      .select('push_token, user_id')
      .in('user_id', userIds);

    if (tokenErr || !tokenRows?.length) {
      return jsonResponse({ ok: true, sent: 0, reason: 'no push tokens found' });
    }

    // ── Check we haven't already notified about this signal ───────────────
    const { data: existing } = await supabase
      .from('lenssignal_notifications')
      .select('id')
      .eq('signal_id', signal.id)
      .limit(1);

    if (existing?.length) {
      return jsonResponse({ ok: true, sent: 0, reason: 'already notified' });
    }

    // ── Build notification content ─────────────────────────────────────────
    const isNew        = signal.is_new_opening;
    const hasPest      = signal.has_pest_indicator;
    const location     = [signal.address, signal.city].filter(Boolean).join(', ');

    const title = isNew
      ? `🆕 New Opening — ${signal.zip}`
      : hasPest
        ? `⚠️ Signal Alert — ${signal.zip}`
        : `📍 Signal — ${signal.zip}`;

    const body_text = hasPest
      ? `${signal.business_name} · ${signal.pest_details || 'Pest indicator detected'}`
      : `${signal.business_name}${location ? ` · ${location}` : ''}`;

    // ── Send to all tokens ─────────────────────────────────────────────────
    const messages = tokenRows.map((row: any) => ({
      to:    row.push_token,
      title,
      body:  body_text,
      sound: 'default',
      data:  {
        screen:    'TerritoryMap',
        signalId:  signal.id,
        zip:       signal.zip,
        type:      isNew ? 'opening' : 'compliance',
      },
      channelId: 'signals',
    }));

    const expoResp = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(messages),
    });

    const expoData = await expoResp.json();

    // ── Log notifications sent ─────────────────────────────────────────────
    await supabase.from('lenssignal_notifications').insert(
      tokenRows.map((row: any) => ({
        signal_id:   signal.id,
        user_id:     row.user_id,
        sent_at:     new Date().toISOString(),
        title,
        body:        body_text,
      }))
    );

    return jsonResponse({ ok: true, sent: messages.length, expo: expoData });

  } catch (err) {
    return jsonResponse({
      error:   'Push alert failed',
      details: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
