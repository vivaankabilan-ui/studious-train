const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const FEEDBACK_TO = "Vivaan.Kabilan@gmail.com";

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

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
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

  const message = String(payload.message || "").trim();
  const senderName = String(payload.senderName || "").trim();
  const senderEmail = String(payload.senderEmail || "").trim();

  if (message.length < 5) {
    return jsonResponse({ error: "Please write a little more feedback before sending." }, { status: 400 });
  }

  if (senderEmail && !validEmail(senderEmail)) {
    return jsonResponse({ error: "Please enter a valid email address or leave it blank." }, { status: 400 });
  }

  if (!env.RESEND_API_KEY || !(env.AUTH_EMAIL_FROM || env.PARENT_EMAIL_FROM)) {
    return jsonResponse(
      {
        sent: false,
        status: "not_configured",
        error: "Set RESEND_API_KEY and AUTH_EMAIL_FROM (or PARENT_EMAIL_FROM) to send feedback emails."
      },
      { status: 503 }
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.AUTH_EMAIL_FROM || env.PARENT_EMAIL_FROM,
      to: [FEEDBACK_TO],
      reply_to: senderEmail || undefined,
      subject: "New ParTime website feedback",
      text: `New ParTime website feedback\n\nFrom: ${senderName || "Anonymous"}${senderEmail ? ` <${senderEmail}>` : ""}\n\n${message}`,
      html: `
        <div style="font-family: Inter, Arial, sans-serif; line-height: 1.55; color: #10212a;">
          <h1 style="font-size: 22px; margin-bottom: 8px;">New ParTime website feedback</h1>
          <p style="color: #5c6f78; margin-top: 0;">From ${escapeHtml(senderName || "Anonymous")}${senderEmail ? ` &lt;${escapeHtml(senderEmail)}&gt;` : ""}</p>
          <div style="margin-top: 20px; padding: 18px 20px; border-radius: 16px; background: #f6f7f9; border: 1px solid #d7dee6; white-space: pre-wrap;">${escapeHtml(message)}</div>
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
