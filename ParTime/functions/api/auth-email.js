const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...(init.headers || {})
    }
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[character];
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

async function sendWithResend(env, payload) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.AUTH_EMAIL_FROM || env.PARENT_EMAIL_FROM,
      to: [payload.to],
      subject: payload.subject,
      text: `${payload.message}\n\nVerification code: ${payload.code}`,
      html: `
        <div style="font-family: Inter, Arial, sans-serif; line-height: 1.5; color: #10212a;">
          <h1 style="font-size: 20px;">${escapeHtml(payload.subject)}</h1>
          <p>${escapeHtml(payload.message)}</p>
          <div style="margin: 20px 0; padding: 16px 20px; border-radius: 14px; background: #eef8f5; font-size: 28px; letter-spacing: 6px; font-weight: 700; text-align: center;">
            ${escapeHtml(payload.code)}
          </div>
          <p style="color: #5c6f78;">Open ParTime to finish verifying your account.</p>
        </div>
      `
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    return jsonResponse(
      {
        sent: false,
        status: "failed",
        error: result.message || "Email provider rejected the request."
      },
      { status: 502 }
    );
  }

  return jsonResponse({
    sent: true,
    status: "sent",
    provider: "resend",
    providerId: result.id || "",
    sentAt: new Date().toISOString()
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return jsonResponse({ error: "Invalid JSON body." }, { status: 400 });
  }

  const to = normalizeEmail(payload.to);
  const code = String(payload.code || "").trim();
  const subject = String(payload.subject || "ParTime verification code").trim();
  const purpose = String(payload.purpose || "account-verification").trim();
  const label = String(payload.label || "account").trim();
  const message =
    purpose === "password-reset"
      ? `Use this code to reset the password for your ${label} account.`
      : `Use this code to verify your ${label} account.`;

  if (!validEmail(to)) {
    return jsonResponse({ error: "A valid email address is required." }, { status: 400 });
  }

  if (!code) {
    return jsonResponse({ error: "A verification code is required." }, { status: 400 });
  }

  if (!env.RESEND_API_KEY || !(env.AUTH_EMAIL_FROM || env.PARENT_EMAIL_FROM)) {
    return jsonResponse(
      {
        sent: false,
        status: "not_configured",
        error: "Set RESEND_API_KEY and AUTH_EMAIL_FROM (or PARENT_EMAIL_FROM) to send real verification emails."
      },
      { status: 503 }
    );
  }

  return sendWithResend(env, {
    to,
    code,
    subject,
    message
  });
}
