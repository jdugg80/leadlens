const { Resend } = require('resend');

exports.handler = async function (event) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const body = JSON.parse(event.body || '{}');

    const { to, subject, html, text } = body;

    if (!to || !subject || (!html && !text)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing to, subject, or message body.' }),
      };
    }

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    });

    if (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err?.message || 'Unexpected send error',
      }),
    };
  }
};