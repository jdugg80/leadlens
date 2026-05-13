import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * PHASE 2: SERVER-SIDE OCR CLEANUP
 * This function processes a LeadLock capture by normalizing text
 * and running the matching logic.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { capture_id } = await req.json();
    if (!capture_id) throw new Error('capture_id is required');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Mark as processing
    await supabase
      .from('leadlock_captures')
      .update({ processing_status: 'processing' })
      .eq('id', capture_id);

    // 2. Load capture data
    const { data: capture, error: fetchError } = await supabase
      .from('leadlock_captures')
      .select('*')
      .eq('id', capture_id)
      .single();

    if (fetchError || !capture) throw new Error('Failed to load capture');

    // 3. Server-side OCR Cleanup (Placeholder Adapter)
    // TODO: Implement actual OCR provider logic here (e.g., GPT-4o-mini vision, Claude, etc.)
    // For now, we perform basic normalization of the client-side OCR text.

    let normalizedText = (capture.raw_ocr_text || '').trim();

    // Example normalization: remove common OCR noise, fix casing
    normalizedText = normalizedText
      .replace(/[|¦]/g, '') // Remove common vertical bar noise
      .replace(/\s+/g, ' '); // Collapse spaces

    // 4. Update capture with results
    const { error: updateError } = await supabase
      .from('leadlock_captures')
      .update({
        normalized_ocr_text: normalizedText,
        processing_status: 'matched'
      })
      .eq('id', capture_id);

    if (updateError) throw updateError;

    // 5. Call the Matching RPC
    const { data: matches, error: rpcError } = await supabase.rpc('match_leadlock_capture', {
      p_capture_id: capture_id,
      p_radius_meters: 500
    });

    if (rpcError) {
      console.error('[LeadLockRPC] Error:', rpcError);
      // Don't fail the whole function if matching fails, just return empty matches
    }

    return new Response(JSON.stringify({
      ok: true,
      status: 'matched',
      matches: matches || []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
