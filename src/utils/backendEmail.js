export async function sendBackendEmail({
  endpoint,
  to,
  subject,
  html,
  text,
}) {
  const payload = {
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.error ||
      data?.resend_error?.message ||
      data?.message ||
      `Backend email failed (${response.status})`;

    throw new Error(message);
  }

  return data;
}