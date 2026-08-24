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
      from: env.PARENT_EMAIL_FROM,
      to: [payload.to],
      subject: payload.subject,
      text: `${payload.message}\n\nOpen ParTime to review the full activity log.`,
      html: `
        <div style="font-family: Inter, Arial, sans-serif; line-height: 1.5; color: #10212a;">
          <h1 style="font-size: 20px;">${escapeHtml(payload.subject)}</h1>
          <p>${escapeHtml(payload.message)}</p>
          <p style="color: #5c6f78;">Open ParTime to review the full activity log.</p>
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
  const subject = String(payload.subject || "ParTime parent update").trim();
  const message = String(payload.message || "").trim();

  if (!validEmail(to)) {
    return jsonResponse({ error: "A valid parent email address is required." }, { status: 400 });
  }

  if (!message) {
    return jsonResponse({ error: "Email message is required." }, { status: 400 });
  }

  const emailPayload = {
    to,
    subject,
    message
  };

  if (!env.RESEND_API_KEY || !env.PARENT_EMAIL_FROM) {
    return jsonResponse(
      {
        sent: false,
        status: "not_configured",
        error: "Set RESEND_API_KEY and PARENT_EMAIL_FROM to send real parent emails."
      },
      { status: 202 }
    );
  }

  return sendWithResend(env, emailPayload);
}
