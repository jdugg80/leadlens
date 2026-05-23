const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
 
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
 
  try {
    const { repEmail, repName, issueType, subject, details, expected, actual, appVersion, platform, employeeNum, branchNum } = await req.json();
 
    if (!repEmail || !subject || !details) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: repEmail, subject, details' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
 
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const adminEmail = Deno.env.get('ADMIN_EMAIL');
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'noreply@support.okayestmedia.com';

    if (!supabaseUrl || !supabaseKey || !resendKey || !adminEmail) {
      return new Response(
        JSON.stringify({ error: 'Missing environment variables' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
 
    // Insert ticket via REST API
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/support_tickets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        rep_email: repEmail,
        rep_name: repName,
        issue_type: issueType,
        subject,
        details,
        expected: expected || null,
        actual: actual || null,
        app_version: appVersion,
        platform,
        employee_num: employeeNum,
        branch_num: branchNum,
        status: 'open',
      }),
    });
 
    if (!insertRes.ok) {
      const insertError = await insertRes.text();
      console.error('Database insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save support ticket' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
 
    const tickets = await insertRes.json();
    const ticket = Array.isArray(tickets) ? tickets[0] : tickets;
 
    // Send email via Resend
    const emailBody = `
<h2>New Support Ticket: ${subject}</h2>
 
<p><strong>Issue Type:</strong> ${issueType}</p>
<p><strong>From:</strong> ${repName} (${repEmail})</p>
<p><strong>Employee #:</strong> ${employeeNum || 'N/A'}</p>
<p><strong>Branch/Dept:</strong> ${branchNum || 'N/A'}</p>
 
<h3>Issue Details</h3>
<p>${details.replace(/\n/g, '<br>')}</p>
 
<h3>Expected Result</h3>
<p>${expected ? expected.replace(/\n/g, '<br>') : '(not provided)'}</p>
 
<h3>Actual Result</h3>
<p>${actual ? actual.replace(/\n/g, '<br>') : '(not provided)'}</p>
 
<h3>System Info</h3>
<ul>
  <li><strong>App Version:</strong> ${appVersion}</li>
  <li><strong>Platform:</strong> ${platform}</li>
  <li><strong>Ticket ID:</strong> ${ticket.id}</li>
  <li><strong>Submitted:</strong> ${new Date(ticket.created_at).toLocaleString()}</li>
</ul>
 
<p><a href="https://support.okayestmedia.com/tickets/${ticket.id}">View Ticket</a></p>
    `;
 
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: adminEmail,
        replyTo: repEmail,
        subject: `[LeadLens Support] ${subject}`,
        html: emailBody,
      }),
    });
 
    if (!emailResponse.ok) {
      const emailError = await emailResponse.text();
      console.error('Resend error:', emailError);
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: emailError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
 
    const emailResult = await emailResponse.json();
 
    return new Response(
      JSON.stringify({ success: true, ticketId: ticket.id, emailId: emailResult.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Function error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
 