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

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function formatRoleStatus(role, active = true) {
  if (role === "worker") return active ? "active" : "pending";
  return active ? "active" : "pending";
}

function toSqlBool(value) {
  return value ? 1 : 0;
}

function fromSqlBool(value) {
  return Boolean(Number(value));
}

function normalizePayType(value) {
  return String(value || "Fixed").toLowerCase() === "hourly" ? "hourly" : "fixed";
}

function normalizeJobStatus(value) {
  const status = String(value || "Open").toLowerCase().replace(/\s+/g, "_");
  if (status === "in_progress" || status === "completed" || status === "canceled" || status === "disputed") return status;
  return "open";
}

function normalizeMessageSenderRole(value) {
  return String(value || "").toLowerCase() === "worker" ? "worker" : "client";
}

function latestTimestamp(...values) {
  let latest = "";
  for (const value of values) {
    const time = Date.parse(value || "");
    if (Number.isFinite(time) && (!latest || time > Date.parse(latest))) {
      latest = value;
    }
  }
  return latest;
}

function normalizeApplicationStatus(value) {
  const status = String(value || "applied").toLowerCase().replace(/\s+/g, "_");
  if (["applied", "accepted", "denied", "withdrawn", "next_timed"].includes(status)) return status;
  if (status === "not_selected") return "denied";
  return "applied";
}

function eventTypeToAction(type) {
  return String(type || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function safeId(prefix, value) {
  return `${prefix}_${String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

async function clearTables(db) {
  const tables = [
    "notification_states",
    "messages",
    "conversations",
    "activity_log",
    "ratings",
    "worker_rating_summary",
    "job_assignments",
    "job_applications",
    "jobs",
    "parent_profiles",
    "client_profiles",
    "worker_profiles",
    "users"
  ];
  for (const table of tables) {
    await db.prepare(`DELETE FROM ${table}`).run();
  }
}

async function ensureNotificationTables(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS notification_states (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('client', 'worker')),
      last_seen_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_notification_states_role ON notification_states(role);
  `);
}

async function ensureMessagingTables(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      worker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      client_last_read_at TEXT,
      worker_last_read_at TEXT,
      last_message_at TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_role TEXT NOT NULL CHECK (sender_role IN ('client', 'worker')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_job_id ON conversations(job_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_client_id ON conversations(client_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_worker_id ON conversations(worker_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
  `);
}

async function saveState(db, state) {
  await clearTables(db);

  const clients = Object.values(state.clients || {});
  const workers = Object.values(state.workers || {});
  const parents = Object.values(state.parents || {});
  const jobs = Array.isArray(state.jobs) ? state.jobs : [];
  const conversations = Array.isArray(state.conversations) ? state.conversations : [];
  const messages = Array.isArray(state.messages) ? state.messages : [];
  const parentEvents = Array.isArray(state.parentEvents) ? state.parentEvents : [];

  for (const client of clients) {
    await db.prepare(
      `INSERT INTO users (id, role, name, email, phone, language, location, status, password_hash, password_salt, email_verification_code, email_verification_sent_at, email_verified_at, created_at, updated_at)
       VALUES (?, 'client', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).bind(
      client.id,
      client.name || "",
      client.email || "",
      client.phone || "",
      client.language || "English",
      client.location || "",
      formatRoleStatus("client", true),
      client.passwordHash || "",
      client.passwordSalt || "",
      client.emailVerificationCode || "",
      client.emailVerificationSentAt || "",
      client.emailVerifiedAt || ""
    ).run();

    await db.prepare(
      `INSERT INTO client_profiles (user_id, preferred_currency, services_looking_for, default_location)
       VALUES (?, ?, ?, ?)`
    ).bind(
      client.id,
      client.preferredCurrency || "USD",
      JSON.stringify(client.typicalServices || []),
      client.location || ""
    ).run();
  }

  for (const client of clients) {
    await db.prepare(
      `INSERT OR REPLACE INTO notification_states (user_id, role, last_seen_at)
       VALUES (?, 'client', ?)`
    ).bind(
      client.id,
      client.notificationSeenAt || ""
    ).run();
  }

  for (const worker of workers) {
    await db.prepare(
      `INSERT INTO users (id, role, name, email, phone, language, location, status, password_hash, password_salt, email_verification_code, email_verification_sent_at, email_verified_at, created_at, updated_at)
       VALUES (?, 'worker', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).bind(
      worker.id,
      worker.name || "",
      worker.email || "",
      worker.phone || "",
      worker.language || "English",
      worker.location || "",
      formatRoleStatus("worker", worker.parentConfirmed !== false),
      worker.passwordHash || "",
      worker.passwordSalt || "",
      worker.emailVerificationCode || "",
      worker.emailVerificationSentAt || "",
      worker.emailVerifiedAt || ""
    ).run();

    const parent = parents.find((item) => item.email === worker.parentEmail || item.linkedWorkerId === worker.id);
    await db.prepare(
      `INSERT INTO worker_profiles (
        user_id, photo_url, bio, age, school, parent_email, parent_confirmed, parent_user_id, services_offered, certifications, verified, parent_verification_code, parent_verification_sent_at, parent_verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      worker.id,
      worker.photo || "",
      worker.bio || "",
      Number(worker.age || 0),
      worker.school || "",
      worker.parentEmail || "",
      toSqlBool(worker.parentConfirmed),
      parent ? parent.id : null,
      JSON.stringify(worker.services || []),
      JSON.stringify(worker.certifications || []),
      toSqlBool(worker.parentConfirmed),
      worker.parentVerificationCode || "",
      worker.parentVerificationSentAt || "",
      worker.parentVerifiedAt || ""
    ).run();
  }

  for (const worker of workers) {
    await db.prepare(
      `INSERT OR REPLACE INTO notification_states (user_id, role, last_seen_at)
       VALUES (?, 'worker', ?)`
    ).bind(
      worker.id,
      worker.notificationSeenAt || ""
    ).run();
  }

  for (const parent of parents) {
    await db.prepare(
      `INSERT INTO users (id, role, name, email, phone, language, location, status, password_hash, password_salt, email_verification_code, email_verification_sent_at, email_verified_at, created_at, updated_at)
       VALUES (?, 'parent', ?, ?, '', 'English', '', 'active', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).bind(
      parent.id,
      parent.name || "",
      parent.email || "",
      parent.passwordHash || "",
      parent.passwordSalt || "",
      parent.emailVerificationCode || "",
      parent.emailVerificationSentAt || "",
      parent.emailVerifiedAt || ""
    ).run();

    await db.prepare(
      `INSERT INTO parent_profiles (user_id, linked_worker_id, read_only_access, notification_email)
       VALUES (?, ?, 1, ?)`
    ).bind(
      parent.id,
      parent.linkedWorkerId || "",
      parent.email || ""
    ).run();
  }

  const ratingRows = [];

  for (const job of jobs) {
    await db.prepare(
      `INSERT INTO jobs (
        id, client_id, title, category, description, location, job_date,
        pay_amount, pay_type, currency, estimated_hours, negotiable,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      job.id,
      job.clientId,
      job.title || "",
      job.category || "",
      job.description || "",
      job.location || "",
      job.date || job.job_date || "",
      Number(job.pay || 0),
      normalizePayType(job.payType),
      job.currency || "USD",
      job.estimatedHours == null ? null : Number(job.estimatedHours),
      toSqlBool(job.negotiable),
      normalizeJobStatus(job.status),
      job.createdAt || new Date().toISOString(),
      job.updatedAt || job.createdAt || new Date().toISOString()
    ).run();

    for (const application of job.applications || []) {
      await db.prepare(
        `INSERT INTO job_applications (
          id, job_id, worker_id, status, amount_offered, currency, pay_type, client_note, worker_note, applied_at, responded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        safeId("app", `${job.id}_${application.workerId}`),
        job.id,
        application.workerId,
        normalizeApplicationStatus(application.status),
        application.amount == null ? null : Number(application.amount),
        application.currency || job.currency || "USD",
        normalizePayType(application.payType || job.payType),
        application.clientNote || "",
        application.workerNote || "",
        application.appliedAt || new Date().toISOString(),
        application.acceptedAt || application.respondedAt || null
      ).run();
    }

    if (job.acceptedWorkerId || normalizeJobStatus(job.status) !== "open") {
      await db.prepare(
        `INSERT OR REPLACE INTO job_assignments (
          id, job_id, worker_id, accepted_by_client_id, accepted_at, job_carried_out,
          completion_status, completed_at, completion_reviewed_at, completion_note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        safeId("assign", job.id),
        job.id,
        job.acceptedWorkerId || (job.applications || []).find((item) => item.status === "Accepted")?.workerId || "",
        job.clientId,
        job.completedAt || job.acceptedAt || job.createdAt || new Date().toISOString(),
        job.status === "Completed" ? 1 : job.jobCarriedOut == null ? null : toSqlBool(job.jobCarriedOut),
        job.status === "Completed" ? "confirmed" : job.jobCarriedOut === false ? "not_completed" : "pending",
        job.completedAt || null,
        job.completedAt || null,
        job.completionNote || ""
      ).run();
    }

    if (job.acceptedWorkerId && Array.isArray(workers)) {
      const worker = workers.find((item) => item.id === job.acceptedWorkerId);
      if (worker && Array.isArray(worker.ratings)) {
        for (const rating of worker.ratings) {
          if (rating.jobId === job.id) {
            ratingRows.push({
              id: safeId("rating", `${worker.id}_${job.id}_${rating.clientId}`),
              workerId: worker.id,
              clientId: rating.clientId,
              jobId: rating.jobId,
              stars: Number(rating.stars || 0),
              comment: rating.comment || "",
              createdAt: rating.createdAt || new Date().toISOString()
            });
          }
        }
      }
    }
  }

  const conversationRows = [];
  const conversationMap = new Map();
  const existingConversationIds = new Set();
  for (const conversation of conversations) {
    if (!conversation || !conversation.id || !conversation.jobId || !conversation.clientId || !conversation.workerId) continue;
    const normalized = {
      id: conversation.id,
      jobId: conversation.jobId,
      clientId: conversation.clientId,
      workerId: conversation.workerId,
      createdAt: conversation.createdAt || conversation.updatedAt || new Date().toISOString(),
      updatedAt: conversation.updatedAt || conversation.createdAt || new Date().toISOString(),
      clientLastReadAt: conversation.clientLastReadAt || "",
      workerLastReadAt: conversation.workerLastReadAt || "",
      lastMessageAt: conversation.lastMessageAt || ""
    };
    conversationRows.push(normalized);
    conversationMap.set(normalized.id, normalized);
    existingConversationIds.add(normalized.jobId);
  }

  for (const job of jobs) {
    const acceptedWorkerId = job.acceptedWorkerId || (job.applications || []).find((item) => item.status === "Accepted")?.workerId || "";
    if (!acceptedWorkerId || existingConversationIds.has(job.id)) continue;
    const createdAt = job.acceptedAt || job.completedAt || job.createdAt || new Date().toISOString();
    const conversation = {
      id: safeId("conv", job.id),
      jobId: job.id,
      clientId: job.clientId,
      workerId: acceptedWorkerId,
      createdAt,
      updatedAt: createdAt,
      clientLastReadAt: "",
      workerLastReadAt: "",
      lastMessageAt: ""
    };
    conversationRows.push(conversation);
    conversationMap.set(conversation.id, conversation);
  }

  const messageRows = [];
  for (const message of messages) {
    const conversation = conversationMap.get(message.conversationId);
    if (!conversation) continue;
    const senderRole = normalizeMessageSenderRole(message.senderRole);
    const allowedSenderId = senderRole === "worker" ? conversation.workerId : conversation.clientId;
    if (String(message.senderId) !== String(allowedSenderId)) continue;
    const normalized = {
      id: message.id,
      conversationId: conversation.id,
      senderId: message.senderId,
      senderRole,
      content: String(message.content || ""),
      createdAt: message.createdAt || new Date().toISOString()
    };
    messageRows.push(normalized);
    const conversationStamp = latestTimestamp(conversation.lastMessageAt, normalized.createdAt, conversation.updatedAt);
    conversation.lastMessageAt = conversationStamp;
    conversation.updatedAt = conversationStamp || conversation.updatedAt;
  }

  for (const conversation of conversationRows) {
    await db.prepare(
      `INSERT OR REPLACE INTO conversations (
        id, job_id, client_id, worker_id, created_at, updated_at, client_last_read_at, worker_last_read_at, last_message_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      conversation.id,
      conversation.jobId,
      conversation.clientId,
      conversation.workerId,
      conversation.createdAt,
      conversation.updatedAt,
      conversation.clientLastReadAt || null,
      conversation.workerLastReadAt || null,
      conversation.lastMessageAt || null
    ).run();
  }

  for (const message of messageRows) {
    await db.prepare(
      `INSERT OR REPLACE INTO messages (id, conversation_id, sender_id, sender_role, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      message.id,
      message.conversationId,
      message.senderId,
      message.senderRole,
      message.content,
      message.createdAt
    ).run();
  }

  for (const worker of workers) {
    const workerRatings = Array.isArray(worker.ratings) ? worker.ratings : [];
    const count = workerRatings.length;
    const average = count ? workerRatings.reduce((sum, rating) => sum + Number(rating.stars || 0), 0) / count : 0;

    await db.prepare(
      `INSERT INTO worker_rating_summary (worker_id, rating_count, rating_average, is_public, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).bind(
      worker.id,
      count,
      Number(average.toFixed(2)),
      toSqlBool(count >= 5)
    ).run();

    for (const rating of workerRatings) {
      ratingRows.push({
        id: safeId("rating", `${worker.id}_${rating.jobId}_${rating.clientId}`),
        workerId: worker.id,
        clientId: rating.clientId,
        jobId: rating.jobId,
        stars: Number(rating.stars || 0),
        comment: rating.comment || "",
        createdAt: rating.createdAt || new Date().toISOString()
      });
    }
  }

  for (const rating of ratingRows) {
    await db.prepare(
      `INSERT OR REPLACE INTO ratings (id, worker_id, client_id, job_id, stars, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      rating.id,
      rating.workerId,
      rating.clientId,
      rating.jobId,
      rating.stars,
      rating.comment,
      rating.createdAt
    ).run();
  }

  for (const worker of workers) {
    for (const nextTime of worker.nextTimes || []) {
      await db.prepare(
        `INSERT INTO activity_log (id, user_id, role, action_type, entity_type, entity_id, metadata, created_at)
         VALUES (?, ?, 'worker', 'next_timed', 'job', ?, ?, ?)`
      ).bind(
        safeId("activity", `${worker.id}_${nextTime.jobId}_next`),
        worker.id,
        nextTime.jobId,
        JSON.stringify({ clientId: nextTime.clientId }),
        nextTime.createdAt || new Date().toISOString()
      ).run();
    }
  }

  for (const event of parentEvents) {
    await db.prepare(
      `INSERT INTO activity_log (id, user_id, role, action_type, entity_type, entity_id, metadata, created_at)
       VALUES (?, ?, 'parent', ?, 'worker', ?, ?, ?)`
    ).bind(
      safeId("activity", event.id || `${event.workerId}_${event.createdAt}`),
      state.selectedParentId || "p1",
      eventTypeToAction(event.type),
      event.workerId,
      JSON.stringify({ message: event.message, eventType: event.type }),
      event.createdAt || new Date().toISOString()
    ).run();
  }
}

async function loadState(db) {
  const users = await db.prepare(`SELECT * FROM users ORDER BY created_at ASC`).all();
  if (!users.results.length) return null;

  const clients = {};
  const workers = {};
  const parents = {};

  const clientProfiles = await db.prepare(`SELECT * FROM client_profiles`).all();
  const clientProfileMap = new Map(clientProfiles.results.map((row) => [row.user_id, row]));
  const workerProfiles = await db.prepare(`SELECT * FROM worker_profiles`).all();
  const workerProfileMap = new Map(workerProfiles.results.map((row) => [row.user_id, row]));
  const parentProfiles = await db.prepare(`SELECT * FROM parent_profiles`).all();
  const parentProfileMap = new Map(parentProfiles.results.map((row) => [row.user_id, row]));
  const notificationStates = await db.prepare(`SELECT * FROM notification_states`).all();
  const notificationStateMap = new Map(notificationStates.results.map((row) => [row.user_id, row]));
  const conversationRows = await db.prepare(`SELECT * FROM conversations ORDER BY created_at ASC`).all();
  const conversationMap = new Map();
  const messageRows = await db.prepare(`SELECT * FROM messages ORDER BY created_at ASC`).all();
  const messagesByConversation = new Map();

  for (const conversation of conversationRows.results) {
    const normalized = {
      id: conversation.id,
      jobId: conversation.job_id,
      clientId: conversation.client_id,
      workerId: conversation.worker_id,
      createdAt: conversation.created_at || "",
      updatedAt: conversation.updated_at || conversation.created_at || "",
      clientLastReadAt: conversation.client_last_read_at || "",
      workerLastReadAt: conversation.worker_last_read_at || "",
      lastMessageAt: conversation.last_message_at || ""
    };
    conversationMap.set(normalized.id, normalized);
    messagesByConversation.set(normalized.id, []);
  }

  for (const message of messageRows.results) {
    const conversation = conversationMap.get(message.conversation_id);
    if (!conversation) continue;
    const normalized = {
      id: message.id,
      conversationId: message.conversation_id,
      senderId: message.sender_id,
      senderRole: message.sender_role || "client",
      content: message.content,
      createdAt: message.created_at || ""
    };
    messagesByConversation.get(conversation.id).push(normalized);
    conversation.lastMessageAt = latestTimestamp(conversation.lastMessageAt, normalized.createdAt, conversation.updatedAt);
    conversation.updatedAt = latestTimestamp(conversation.updatedAt, normalized.createdAt, conversation.lastMessageAt);
  }

  for (const user of users.results) {
    if (user.role === "client") {
      const profile = clientProfileMap.get(user.id) || {};
      const notificationState = notificationStateMap.get(user.id) || {};
      clients[user.id] = {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        emailVerificationCode: user.email_verification_code || "",
        emailVerificationSentAt: user.email_verification_sent_at || "",
        emailVerifiedAt: user.email_verified_at || "",
        language: user.language || "English",
        location: user.location || "",
        passwordHash: user.password_hash || "",
        passwordSalt: user.password_salt || "",
        typicalServices: parseJson(profile.services_looking_for, []),
        preferredCurrency: profile.preferred_currency || "USD",
        notificationSeenAt: notificationState.last_seen_at || ""
      };
    }

    if (user.role === "worker") {
      const profile = workerProfileMap.get(user.id) || {};
      const notificationState = notificationStateMap.get(user.id) || {};
      workers[user.id] = {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        emailVerificationCode: user.email_verification_code || "",
        emailVerificationSentAt: user.email_verification_sent_at || "",
        emailVerifiedAt: user.email_verified_at || "",
        passwordHash: user.password_hash || "",
        passwordSalt: user.password_salt || "",
        parentEmail: profile.parent_email || "",
        parentConfirmed: fromSqlBool(profile.parent_confirmed),
        age: Number(profile.age || 0),
        school: profile.school || "",
        language: user.language || "English",
        location: user.location || "",
        bio: profile.bio || "",
        services: parseJson(profile.services_offered, []),
        certifications: parseJson(profile.certifications, []),
        photo: profile.photo_url || "",
        parentVerificationCode: profile.parent_verification_code || "",
        parentVerificationSentAt: profile.parent_verification_sent_at || "",
        parentVerifiedAt: profile.parent_verified_at || "",
        notificationSeenAt: notificationState.last_seen_at || "",
        ratings: [],
        nextTimes: []
      };
    }

    if (user.role === "parent") {
      const profile = parentProfileMap.get(user.id) || {};
      parents[user.id] = {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerificationCode: user.email_verification_code || "",
        emailVerificationSentAt: user.email_verification_sent_at || "",
        emailVerifiedAt: user.email_verified_at || "",
        passwordHash: user.password_hash || "",
        passwordSalt: user.password_salt || "",
        linkedWorkerId: profile.linked_worker_id || ""
      };
    }
  }

  const ratings = await db.prepare(`SELECT * FROM ratings ORDER BY created_at ASC`).all();
  for (const rating of ratings.results) {
    const worker = workers[rating.worker_id];
    if (!worker) continue;
    worker.ratings.push({
      jobId: rating.job_id,
      clientId: rating.client_id,
      stars: Number(rating.stars || 0),
      comment: rating.comment || "",
      createdAt: rating.created_at
    });
  }

  const activities = await db.prepare(`SELECT * FROM activity_log ORDER BY created_at DESC`).all();
  for (const activity of activities.results) {
    if (activity.action_type === "next_timed" && workers[activity.user_id]) {
      workers[activity.user_id].nextTimes.push({
        clientId: parseJson(activity.metadata, {}).clientId || "",
        jobId: activity.entity_id || "",
        createdAt: activity.created_at
      });
    }
  }

  const assignments = await db.prepare(`SELECT * FROM job_assignments`).all();
  const assignmentMap = new Map(assignments.results.map((row) => [row.job_id, row]));
  const applicationRows = await db.prepare(`SELECT * FROM job_applications ORDER BY applied_at ASC`).all();
  const applicationsByJob = new Map();
  for (const row of applicationRows.results) {
    if (!applicationsByJob.has(row.job_id)) applicationsByJob.set(row.job_id, []);
    applicationsByJob.get(row.job_id).push({
      workerId: row.worker_id,
      amount: row.amount_offered == null ? null : Number(row.amount_offered),
      currency: row.currency || "USD",
      payType: row.pay_type === "hourly" ? "Hourly" : "Fixed",
      status: row.status === "accepted" ? "Accepted" : row.status === "denied" ? "Not selected" : row.status === "next_timed" ? "Next timed" : "Applied",
      appliedAt: row.applied_at,
      acceptedAt: row.responded_at || undefined
    });
  }

  const jobs = await db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC`).all();
  const jobList = jobs.results.map((job) => {
    const assignment = assignmentMap.get(job.id);
    const workerId = assignment ? assignment.worker_id : "";
    const appList = applicationsByJob.get(job.id) || [];
    return {
      id: job.id,
      clientId: job.client_id,
      title: job.title,
      category: job.category,
      description: job.description || "",
      date: job.job_date,
      pay: Number(job.pay_amount || 0),
      payType: job.pay_type === "hourly" ? "Hourly" : "Fixed",
      currency: job.currency || "USD",
      estimatedHours: job.estimated_hours == null ? 1 : Number(job.estimated_hours),
      negotiable: fromSqlBool(job.negotiable),
      location: job.location || "",
      status: job.status === "in_progress" ? "In Progress" : job.status === "completed" ? "Completed" : job.status === "canceled" ? "Canceled" : job.status === "disputed" ? "Disputed" : "Open",
      acceptedWorkerId: workerId || undefined,
      createdAt: job.created_at,
      completedAt: assignment?.completed_at || job.completed_at || undefined,
      ratingSubmitted: job.status === "completed" ? true : undefined,
      applications: appList
    };
  });

  const parentEvents = activities.results
    .filter((activity) => activity.role === "parent" || activity.action_type === "application_sent" || activity.action_type === "job_accepted" || activity.action_type === "completion_approved")
    .map((activity) => {
      const metadata = parseJson(activity.metadata, {});
      return {
        id: activity.id,
        workerId: activity.entity_id || metadata.workerId || "",
        type: activity.action_type.replace(/_/g, " "),
        message: metadata.message || "",
      createdAt: activity.created_at
      };
    });

  const updatedAt = latestTimestamp(
    ...users.results.map((row) => row.updated_at),
    ...jobs.results.map((row) => row.updated_at),
    ...conversationRows.results.map((row) => row.updated_at || row.created_at),
    ...messageRows.results.map((row) => row.created_at),
    ...activities.results.map((row) => row.created_at)
  );

  return {
    updatedAt,
    selectedClientId: clients[Object.keys(clients)[0]]?.id || "c1",
    selectedWorkerId: workers[Object.keys(workers)[0]]?.id || "w1",
    selectedParentId: parents[Object.keys(parents)[0]]?.id || "p1",
    clients,
    workers,
    parents,
    jobs: jobList,
    conversations: Array.from(conversationMap.values()),
    messages: Array.from(messagesByConversation.values()).flat(),
    parentEvents
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.DB) {
    return jsonResponse({ error: "D1 database binding missing." }, { status: 500 });
  }

  await ensureMessagingTables(env.DB);
  await ensureNotificationTables(env.DB);

  if (request.method === "GET") {
    const state = await loadState(env.DB);
    return jsonResponse({ state });
  }

  if (request.method === "POST") {
    const state = await request.json();
    try {
      await env.DB.exec("BEGIN");
      await saveState(env.DB, state);
      await env.DB.exec("COMMIT");
      return jsonResponse({ ok: true });
    } catch (error) {
      try {
        await env.DB.exec("ROLLBACK");
      } catch {}
      return jsonResponse({ error: error?.message || "Unable to save state." }, { status: 500 });
    }
  }

  return jsonResponse({ error: "Method not allowed." }, { status: 405 });
}
