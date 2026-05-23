import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  try {
    const body = await req.json();

    // Supabase database webhook payload
    const record = body.record || body;

    const {
      id           = '',
      email        = 'unknown',
      primary_organization_id = null,
      created_at   = new Date().toISOString(),
    } = record;

    const dt        = new Date(created_at);
    const formatted = dt.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }) + ' at ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const isOrphaned = !primary_organization_id;
    const statusColor = isOrphaned ? '#CC1040' : '#00E5A0';
    const statusLabel = isOrphaned ? '⚠ ORPHANED — No Organization' : '✓ Has Organization';
    const supabaseAuthUrl = 'https://supabase.com/dashboard/project/qkbvwryucaakkkqaqvka/auth/users';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#080A0F;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080A0F;padding:32px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Header bar -->
        <tr>
          <td style="background:linear-gradient(90deg,#CC1040,#7B3FBE);height:3px;font-size:0;">&nbsp;</td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:#161B26;border:1px solid #1E2535;border-top:none;padding:36px 36px 28px;">

            <!-- Logo + badge -->
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
              <tr>
                <td style="vertical-align:middle;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="background:linear-gradient(135deg,#00C9FF,#7B3FBE);width:38px;height:38px;text-align:center;vertical-align:middle;font-weight:700;font-size:12px;color:#fff;letter-spacing:1px;">
                        LL
                      </td>
                      <td style="padding-left:10px;font-size:11px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#B8BDD0;vertical-align:middle;">
                        LEADLENS
                      </td>
                    </tr>
                  </table>
                </td>
                <td align="right" style="vertical-align:middle;">
                  <span style="background:rgba(204,16,64,0.12);border:1px solid rgba(204,16,64,0.4);padding:5px 12px;font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#CC1040;">
                    🚨 ROGUE SIGNUP
                  </span>
                </td>
              </tr>
            </table>

            <p style="font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#CC1040;margin:0 0 10px;">
              UNAUTHORIZED ACCESS ATTEMPT
            </p>
            <h1 style="font-size:22px;font-weight:700;color:#E8ECF5;margin:0 0 20px;line-height:1.25;">
              New account created without an invite.
            </h1>

            <!-- Details grid -->
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;background:#0D1017;border:1px solid #1E2535;">
              <tr>
                <td style="padding:14px 18px;border-bottom:1px solid #1E2535;">
                  <p style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6B7399;margin:0 0 4px;">Email</p>
                  <p style="font-size:14px;color:#E8ECF5;margin:0;">${email}</p>
                </td>
                <td style="padding:14px 18px;border-bottom:1px solid #1E2535;border-left:1px solid #1E2535;">
                  <p style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6B7399;margin:0 0 4px;">Signed Up</p>
                  <p style="font-size:13px;color:#E8ECF5;margin:0;">${formatted}</p>
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding:14px 18px;border-bottom:1px solid #1E2535;">
                  <p style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6B7399;margin:0 0 4px;">Profile Status</p>
                  <p style="font-size:13px;color:${statusColor};margin:0;font-weight:700;">${statusLabel}</p>
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding:14px 18px;">
                  <p style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6B7399;margin:0 0 4px;">User ID</p>
                  <p style="font-size:11px;color:#6B7399;margin:0;font-family:monospace;">${id}</p>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
              <tr>
                <td style="background:linear-gradient(90deg,#CC1040,#7B3FBE);">
                  <a href="${supabaseAuthUrl}" style="display:inline-block;padding:13px 28px;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#fff;text-decoration:none;">
                    DELETE IN SUPABASE →
                  </a>
                </td>
              </tr>
            </table>

            <p style="font-size:12px;color:#6B7399;margin:0;">
              This alert fired because a new row was inserted into the <code style="color:#00C9FF;">profiles</code> table.<br>
              If this was a legitimate tester, they still need to be assigned to an organization.
            </p>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 0;text-align:center;">
            <p style="font-size:10px;color:#2A3147;letter-spacing:2px;text-transform:uppercase;margin:0;">
              LEADLENS · SECURITY ALERT · OKAY MEDIA
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const resendKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'noreply@support.okayestmedia.com';
    const toEmail   = 'theokaymediafam@gmail.com';

    if (!resendKey) {
      console.warn('[notify-rogue-signup] RESEND_API_KEY not set');
      return new Response(JSON.stringify({ success: false, error: 'RESEND_API_KEY not configured' }), { status: 500 });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    fromEmail,
        to:      [toEmail],
        subject: `🚨 [LeadLens] Rogue signup — ${email}`,
        html,
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: result }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
