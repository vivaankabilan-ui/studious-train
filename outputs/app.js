const STORAGE_KEY = "partime-marketplace-state-v2";
const TODAY = "2026-07-04";

const categories = [
  "Lawn Care",
  "Pet Care",
  "Tutoring",
  "Errands",
  "Tech Help",
  "Snow Help",
  "Babysitting"
];

const currencies = [
  { code: "CHF", label: "CHF - Swiss Franc" },
  { code: "EUR", label: "EUR - Euro" }
];

const languages = ["English", "Spanish", "French", "German", "Mandarin", "Hindi", "Arabic", "Portuguese", "Other"];

const defaultPhotos = {
  w1: "assets/maya-avatar.png",
  w2: "assets/eli-avatar.png",
  w3: "assets/nia-avatar.png",
  w4: "assets/theo-avatar.png"
};

const API_STATE_ENDPOINT = "/api/state";
const AUTH_EMAIL_ENDPOINT = "/api/auth-email";
const SESSION_KEY = "partime-auth-session-v1";
const ONBOARDING_EXPIRES_IN_MS = 30 * 60 * 1000;
const AGE_RANGE_OPTIONS = [
  { value: "Under 18", label: "Under 18" },
  { value: "18-24", label: "18-24" },
  { value: "25-34", label: "25-34" },
  { value: "35-44", label: "35-44" },
  { value: "45-54", label: "45-54" },
  { value: "55-64", label: "55-64" },
  { value: "65+", label: "65+" }
];

let view = "landing";
let routeMeta = {};
let helperFilter = "All";
let helperSearch = "";
let helperNotice = "";
let profileModalWorkerId = "";
let logoMenuOpen = false;
let clientNotificationsOpen = false;
let workerNotificationsOpen = false;
let messagesPollingTimer = null;
let messageDrafts = Object.create(null);
let messageSendBusy = false;
let messageSendError = "";
let saveQueue = Promise.resolve();

function stateTimestamp(candidate) {
  if (!candidate) return 0;
  const raw = candidate.updatedAt || candidate.savedAt || candidate.lastSavedAt || "";
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
}

function stateSize(candidate) {
  if (!candidate) return 0;
  const jobs = Array.isArray(candidate.jobs) ? candidate.jobs.length : 0;
  const clients = candidate.clients ? Object.keys(candidate.clients).length : 0;
  const workers = candidate.workers ? Object.keys(candidate.workers).length : 0;
  const conversations = Array.isArray(candidate.conversations) ? candidate.conversations.length : 0;
  const messages = Array.isArray(candidate.messages) ? candidate.messages.length : 0;
  return jobs + clients + workers + conversations + messages;
}

function chooseBestState(remoteState, localState) {
  if (remoteState && localState) {
    const remoteTime = stateTimestamp(remoteState);
    const localTime = stateTimestamp(localState);
    if (remoteTime !== localTime) {
      return remoteTime > localTime ? remoteState : localState;
    }
    return stateSize(remoteState) >= stateSize(localState) ? remoteState : localState;
  }
  return remoteState || localState || null;
}

function hashPassword(password, salt = "") {
  const input = `${salt}:${password}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function passwordRecord(password, salt = randomSalt()) {
  return {
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt)
  };
}

function randomSalt() {
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint32Array(2);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16)).join("");
  }
  return `${Date.now()}${Math.random().toString(16).slice(2)}`;
}

function hashString(value) {
  const input = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function generateVerificationCode() {
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint32Array(1);
    window.crypto.getRandomValues(bytes);
    return String(bytes[0] % 100000000).padStart(8, "0");
  }
  return String(Math.floor(Math.random() * 100000000)).padStart(8, "0");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return (
    Object.values(state.clients).find((item) => normalizeEmail(item.email) === normalized) ||
    Object.values(state.workers).find((item) => normalizeEmail(item.email) === normalized) ||
    Object.values(state.parents).find((item) => normalizeEmail(item.email) === normalized) ||
    null
  );
}

function accountRoleForUser(user) {
  if (!user) return "client";
  if (state.clients?.[user.id]) return "client";
  if (state.workers?.[user.id]) return "worker";
  return "parent";
}

function onboardingInfo(user) {
  return user?.uiPreferences?.onboarding || {};
}

function onboardingCompleted(user) {
  return Boolean(user?.uiPreferences?.onboardingCompletedAt);
}

function accountNeedsVerification(user) {
  return Boolean(user && !user.emailVerifiedAt);
}

function requiresOnboarding(user) {
  if (!user) return false;
  if (onboardingCompleted(user)) return false;
  if (accountRoleForUser(user) === "worker") {
    return !String(user.name || "").trim() || !String(user.location || "").trim() || !Number(user.age || 0) || !String(user.school || "").trim();
  }
  return !String(user.name || "").trim() || !String(user.location || "").trim();
}

function isEmailVerificationExpired(sentAt) {
  const time = Date.parse(sentAt || "");
  if (!Number.isFinite(time)) return true;
  return Date.now() - time > ONBOARDING_EXPIRES_IN_MS;
}

function sanitizeOnboardingText(value) {
  return String(value || "").trim();
}

function userPostalCode(user) {
  return onboardingInfo(user).postalCode || "";
}

function userDisplayName(user) {
  const info = onboardingInfo(user);
  return info.preferredName || user?.name || user?.email || "";
}

function ageRangeToNumericAge(range) {
  switch (String(range || "")) {
    case "Under 18":
      return 17;
    case "18-24":
      return 18;
    case "25-34":
      return 25;
    case "35-44":
      return 35;
    case "45-54":
      return 45;
    case "55-64":
      return 55;
    case "65+":
      return 65;
    default:
      return 17;
  }
}

async function sendVerificationEmail({ to, code, role }) {
  const response = await fetch(AUTH_EMAIL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      to,
      code,
      purpose: "account-verification",
      subject: role === "worker" ? "Verify your ParTime student account" : "Verify your ParTime account",
      label: role === "worker" ? "student" : "client"
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok && payload.status !== "not_configured") {
    throw new Error(payload.error || "We could not send the verification email.");
  }
  if (payload.status === "not_configured") {
    throw new Error(payload.error || "Email sending is not configured yet.");
  }
  return payload;
}

function createSignupRecord(role, email, password) {
  const normalizedEmail = normalizeEmail(email);
  const idPrefix = role === "worker" ? "w" : "c";
  const id = `${idPrefix}${Date.now()}${Math.random().toString(16).slice(2, 6)}`;
  const record = {
    id,
    email: normalizedEmail,
    phone: "",
    emailVerificationCode: "",
    emailVerificationSentAt: "",
    emailVerifiedAt: "",
    language: "English",
    location: "",
    uiPreferences: {},
    ...passwordRecord(password)
  };

  if (role === "worker") {
    state.workers[id] = {
      ...record,
      name: "",
      parentEmail: "",
      parentConfirmed: false,
      age: 0,
      school: "",
      bio: "",
      services: [],
      certifications: [],
      photo: "",
      ratings: [],
      nextTimes: []
    };
    state.selectedWorkerId = id;
    return state.workers[id];
  }

  state.clients[id] = {
    ...record,
    name: "",
    typicalServices: [],
    preferredCurrency: "CHF"
  };
  state.selectedClientId = id;
  return state.clients[id];
}

function setOnboardingComplete(user, data = {}) {
  user.uiPreferences = {
    ...(user.uiPreferences || {}),
    onboarding: {
      ...(user.uiPreferences?.onboarding || {}),
      ...data
    },
    onboardingCompletedAt: new Date().toISOString()
  };
}

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || typeof session !== "object") return null;
    if (!session.role && session.id) {
      if (state?.clients && state.clients[session.id]) session.role = "client";
      if (state?.workers && state.workers[session.id]) session.role = "worker";
    }
    return session.role && session.id ? session : null;
  } catch {
    return null;
  }
}

function writeSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

function createDefaultState() {
  return {
    selectedClientId: "",
    selectedWorkerId: "",
    clients: {},
    workers: {},
    parents: {},
    jobs: [],
    conversations: [],
    messages: [],
  };
}

function conversationIdForJob(jobId) {
  return `conv_${String(jobId || "").replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function readNotificationSeenAt(role, userId) {
  const user = role === "client" ? getClient(userId) : role === "worker" ? getWorker(userId) : null;
  const raw = user?.notificationSeenAt || "";
  if (raw) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  try {
    const legacy = localStorage.getItem(`partime-notification-seen-${role}-${userId}`);
    return legacy ? Number(legacy) || 0 : 0;
  } catch {
    return 0;
  }
}

function writeNotificationSeenAt(role, userId, value = new Date().toISOString()) {
  const user = role === "client" ? getClient(userId) : role === "worker" ? getWorker(userId) : null;
  if (!user) return "";
  const timestamp = new Date(value).toISOString();
  if (user.notificationSeenAt === timestamp) return timestamp;
  user.notificationSeenAt = timestamp;
  void saveState();
  try {
    localStorage.removeItem(`partime-notification-seen-${role}-${userId}`);
  } catch {
    // ignore
  }
  return timestamp;
}

function ensureConversationForJobId(jobId) {
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) return null;
  const acceptedWorkerId = job.acceptedWorkerId || (job.applications || []).find((item) => item.status === "Accepted")?.workerId || "";
  if (!acceptedWorkerId) return null;
  job.acceptedWorkerId = acceptedWorkerId;
  return ensureConversationForJob(job);
}

function openConversationForJob(jobId) {
  const conversation = getConversationForJob(jobId) || ensureConversationForJobId(jobId);
  return conversation || null;
}

function ensureConversationForJob(job) {
  if (!job || !job.acceptedWorkerId || !job.clientId) return null;
  state.conversations = Array.isArray(state.conversations) ? state.conversations : [];
  let conversation = state.conversations.find((item) => item.jobId === job.id);
  if (conversation) {
    conversation.clientId = job.clientId;
    conversation.workerId = job.acceptedWorkerId;
    conversation.updatedAt = conversation.updatedAt || job.updatedAt || job.createdAt || new Date().toISOString();
    conversation.lastMessageAt = conversation.lastMessageAt || conversation.updatedAt;
    return conversation;
  }

  conversation = {
    id: conversationIdForJob(job.id),
    jobId: job.id,
    clientId: job.clientId,
    workerId: job.acceptedWorkerId,
    createdAt: job.acceptedAt || job.completedAt || job.createdAt || new Date().toISOString(),
    updatedAt: job.acceptedAt || job.completedAt || job.createdAt || new Date().toISOString(),
    clientLastReadAt: "",
    workerLastReadAt: ""
  };
  state.conversations.unshift(conversation);
  return conversation;
}

function normalizeMessagingState() {
  state.conversations = Array.isArray(state.conversations) ? state.conversations : [];
  state.messages = Array.isArray(state.messages) ? state.messages : [];

  const conversationMap = new Map();
  state.conversations = state.conversations
    .filter((conversation) => conversation && conversation.id && conversation.jobId && conversation.clientId && conversation.workerId)
    .map((conversation) => {
      const normalized = {
        id: String(conversation.id),
        jobId: String(conversation.jobId),
        clientId: String(conversation.clientId),
        workerId: String(conversation.workerId),
        createdAt: conversation.createdAt || conversation.updatedAt || new Date().toISOString(),
        updatedAt: conversation.updatedAt || conversation.createdAt || new Date().toISOString(),
        clientLastReadAt: conversation.clientLastReadAt || "",
        workerLastReadAt: conversation.workerLastReadAt || ""
      };
      conversationMap.set(normalized.id, normalized);
      return normalized;
    });

  for (const job of state.jobs || []) {
    if (job.acceptedWorkerId && job.clientId) {
      const existing = state.conversations.find((conversation) => conversation.jobId === job.id);
      if (!existing) {
        const conversation = {
          id: conversationIdForJob(job.id),
          jobId: job.id,
          clientId: job.clientId,
          workerId: job.acceptedWorkerId,
          createdAt: job.acceptedAt || job.completedAt || job.createdAt || new Date().toISOString(),
          updatedAt: job.acceptedAt || job.completedAt || job.createdAt || new Date().toISOString(),
          clientLastReadAt: "",
          workerLastReadAt: ""
        };
        state.conversations.push(conversation);
        conversationMap.set(conversation.id, conversation);
      }
    }
  }

  state.messages = state.messages
    .filter((message) => message && message.id && message.conversationId && message.senderId && message.content)
    .filter((message) => {
      const conversation = conversationMap.get(message.conversationId);
      if (!conversation) return false;
      const allowedSenders = new Set([conversation.clientId, conversation.workerId]);
      return allowedSenders.has(String(message.senderId));
    })
    .map((message) => ({
      id: String(message.id),
      conversationId: String(message.conversationId),
      senderId: String(message.senderId),
      senderRole: message.senderRole || "",
      content: String(message.content),
      createdAt: message.createdAt || new Date().toISOString()
    }));

  const lastMessageByConversation = new Map();
  for (const message of state.messages) {
    const previous = lastMessageByConversation.get(message.conversationId);
    if (!previous || new Date(message.createdAt) > new Date(previous.createdAt)) {
      lastMessageByConversation.set(message.conversationId, message);
    }
  }

  state.conversations = state.conversations.map((conversation) => {
    const latestMessage = lastMessageByConversation.get(conversation.id);
    if (latestMessage && new Date(latestMessage.createdAt) > new Date(conversation.updatedAt || 0)) {
      return {
        ...conversation,
        updatedAt: latestMessage.createdAt
      };
    }
    return conversation;
  });
}

function getConversationById(conversationId) {
  return (state.conversations || []).find((conversation) => conversation.id === conversationId);
}

function getConversationForJob(jobId) {
  return (state.conversations || []).find((conversation) => conversation.jobId === jobId);
}

function getConversationJob(conversation) {
  if (!conversation) return null;
  return (state.jobs || []).find((job) => job.id === conversation.jobId) || null;
}

function getConversationParticipants(conversation) {
  const job = getConversationJob(conversation);
  const client = conversation ? getClient(conversation.clientId) : null;
  const worker = conversation ? getWorker(conversation.workerId) : null;
  return { job, client, worker };
}

function getConversationMessages(conversationId) {
  return (state.messages || [])
    .filter((message) => message.conversationId === conversationId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function getAccessibleConversations(sessionRole, sessionUserId) {
  if (!sessionRole || !sessionUserId) return [];
  const conversations = (state.conversations || []).filter((conversation) => {
    if (sessionRole === "client") return conversation.clientId === sessionUserId;
    if (sessionRole === "worker") return conversation.workerId === sessionUserId;
    return false;
  });
  return conversations
    .map((conversation) => ({
      ...conversation,
      unreadCount: conversationUnreadCount(conversation, sessionRole, sessionUserId)
    }))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

function conversationUnreadCount(conversation, role, userId) {
  if (!conversation) return 0;
  const lastReadAt = role === "client" ? conversation.clientLastReadAt : conversation.workerLastReadAt;
  const unread = getConversationMessages(conversation.id).filter((message) => {
    if (message.senderId === userId) return false;
    if (!lastReadAt) return true;
    return new Date(message.createdAt) > new Date(lastReadAt);
  });
  return unread.length;
}

function conversationPreview(conversation, sessionRole, sessionUserId) {
  const messages = getConversationMessages(conversation.id);
  if (!messages.length) return "Say hello to open the conversation.";
  const latest = messages[messages.length - 1];
  const senderLabel = latest.senderId === sessionUserId ? "You" : sessionRole === "client" ? "Student" : "Client";
  const preview = latest.content.length > 70 ? `${latest.content.slice(0, 67)}…` : latest.content;
  return `${senderLabel}: ${preview}`;
}

function conversationPartnerName(conversation, sessionRole) {
  if (!conversation) return "Conversation";
  if (sessionRole === "client") {
    return getWorker(conversation.workerId)?.name || "Student";
  }
  if (sessionRole === "worker") {
    return getClient(conversation.clientId)?.name || "Client";
  }
  const { client, worker } = getConversationParticipants(conversation);
  return client?.name || worker?.name || "Conversation";
}

function conversationUnreadTimestamp(conversation, role) {
  return role === "client" ? conversation?.clientLastReadAt || "" : conversation?.workerLastReadAt || "";
}

function buildMessageNotificationsForRole(role, user) {
  const seenAt = readNotificationSeenAt(role, user.id);
  return getAccessibleConversations(role, user.id)
    .flatMap((conversation) => {
      const { job, client, worker } = getConversationParticipants(conversation);
      const latestMessage = getConversationMessages(conversation.id).slice(-1)[0];
      if (!latestMessage || latestMessage.senderId === user.id) return [];
      const partner = role === "client" ? worker : client;
      const conversationReadAt = conversationUnreadTimestamp(conversation, role);
      const lastSeen = Math.max(seenAt, conversationReadAt ? new Date(conversationReadAt).getTime() : 0);
      const unread = new Date(latestMessage.createdAt).getTime() > lastSeen;
      return [
        {
          id: `message-${conversation.id}-${latestMessage.id}`,
          title: `${partner ? partner.name : "Conversation"} sent a message`,
          detail: `${job ? job.title : "Accepted job"} • ${conversationPreview(conversation, role, user.id)}`,
          createdAt: latestMessage.createdAt,
          unread,
          action: "open-conversation",
          conversationId: conversation.id
        }
      ];
    })
    .filter(Boolean);
}

function markConversationRead(conversationId) {
  const session = readSession();
  const conversation = getConversationById(conversationId);
  if (!session || !conversation) return;
  const unreadCount = conversationUnreadCount(conversation, session.role, session.id);
  if (!unreadCount) return false;
  const now = new Date().toISOString();
  if (session.role === "client" && conversation.clientId === session.id) {
    conversation.clientLastReadAt = now;
  }
  if (session.role === "worker" && conversation.workerId === session.id) {
    conversation.workerLastReadAt = now;
  }
  conversation.updatedAt = conversation.updatedAt || now;
  void saveState();
  return true;
}

function syncMessagesPolling() {
  const shouldPoll = view === "messages";
  if (!shouldPoll && messagesPollingTimer) {
    clearInterval(messagesPollingTimer);
    messagesPollingTimer = null;
    return;
  }
  if (shouldPoll && !messagesPollingTimer) {
    messagesPollingTimer = window.setInterval(async () => {
      const latest = await loadState();
      if (!latest) return;
      const currentStamp = JSON.stringify({
        conversations: state.conversations,
        messages: state.messages,
        updatedAt: state.updatedAt
      });
      const latestStamp = JSON.stringify({
        conversations: latest.conversations || [],
        messages: latest.messages || [],
        updatedAt: latest.updatedAt
      });
      if (currentStamp !== latestStamp) {
        state = latest;
        normalizeMessagingState();
        render();
      }
    }, 6000);
  }
}

let state = createDefaultState();

function loadLocalState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    return null;
  }
}

async function loadState() {
  let remoteState = null;
  let localState = null;
  try {
    const response = await fetch(API_STATE_ENDPOINT, {
      headers: {
        Accept: "application/json"
      }
    });
    if (response.ok) {
      const payload = await response.json();
      remoteState = payload && payload.state ? payload.state : null;
    }
  } catch (error) {
    // Fall back to local storage below.
  }

  localState = loadLocalState();
  const chosenState = chooseBestState(remoteState, localState);
  if (chosenState) {
    state = chosenState;
    normalizeMessagingState();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
    return state;
  }

  return createDefaultState();
}

async function saveState() {
  state.updatedAt = new Date().toISOString();
  normalizeMessagingState();
  const snapshot = JSON.stringify(state);
  try {
    localStorage.setItem(STORAGE_KEY, snapshot);
  } catch (error) {
    // Ignore local cache failures.
  }

  saveQueue = saveQueue
    .then(() =>
      fetch(API_STATE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: snapshot
      })
    )
    .catch(() => {});

  return saveQueue.catch(() => {});
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

function formatMoney(value, currency = "CHF") {
  const amount = Number(value || 0);
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: hasCents ? 2 : 0
    }).format(amount);
  } catch (error) {
    return `${currency} ${amount.toFixed(hasCents ? 2 : 0)}`;
  }
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${value}T12:00:00`));
}

function dateTimeLabel(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getClient(id = state.selectedClientId) {
  return state.clients[id];
}

function getWorker(id = state.selectedWorkerId) {
  return state.workers[id];
}

function getLinkedAccount() {
  return null;
}

function getApplicationsForWorker(workerId) {
  return state.jobs
    .flatMap((job) =>
      job.applications
        .filter((application) => application.workerId === workerId)
        .map((application) => ({ job, application }))
    )
    .sort((a, b) => new Date(b.application.appliedAt) - new Date(a.application.appliedAt));
}

function jobTotal(job) {
  const total = job.payType === "Hourly" ? Number(job.pay || 0) * Number(job.estimatedHours || 1) : Number(job.pay || 0);
  return Math.round(total * 100) / 100;
}

function totalsForJobs(jobs) {
  return jobs.reduce((totals, job) => {
    const currency = job.currency || "CHF";
    totals[currency] = (totals[currency] || 0) + jobTotal(job);
    return totals;
  }, {});
}

function formatTotals(totals) {
  const entries = Object.entries(totals);
  if (!entries.length) return formatMoney(0, "CHF");
  return entries.map(([currency, amount]) => formatMoney(amount, currency)).join(" + ");
}

function workerEarningsTotals(workerId) {
  return totalsForJobs(state.jobs.filter((job) => job.status === "Completed" && job.acceptedWorkerId === workerId));
}

function paymentLabel(job) {
  const base = `${formatMoney(job.pay, job.currency)}${job.payType === "Hourly" ? "/hr" : ""}`;
  if (job.payType === "Hourly") {
    return `${base} | ${formatMoney(jobTotal(job), job.currency)} est.`;
  }
  return base;
}

function statusClass(status) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function categoryOptions(selected = "") {
  return categories
    .map(
      (category) =>
        `<option value="${escapeHtml(category)}" ${category === selected ? "selected" : ""}>${escapeHtml(category)}</option>`
    )
    .join("");
}

function currencyOptions(selected = "CHF") {
  const active = currencies.some(({ code }) => code === selected) ? selected : "CHF";
  return currencies
    .map(
      ({ code, label }) =>
        `<option value="${escapeHtml(code)}" ${code === active ? "selected" : ""}>${escapeHtml(label)}</option>`
    )
    .join("");
}

function normalizeLanguages(selected = []) {
  if (Array.isArray(selected)) {
    return selected.map((value) => String(value).trim()).filter(Boolean);
  }
  return String(selected || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function languageCheckboxes(selected = []) {
  const active = new Set(normalizeLanguages(selected));
  return languages
    .map(
      (language) => `
        <label class="check-tile">
          <input type="checkbox" name="languages" value="${escapeHtml(language)}" ${active.has(language) ? "checked" : ""} />
          <span>${escapeHtml(language)}</span>
        </label>
      `
    )
    .join("");
}

function languageDisplay(selected = []) {
  return normalizeLanguages(selected).join(", ");
}

function serviceCheckboxes(selectedServices = [], includeOther = false) {
  const selected = new Set(selectedServices);
  const hasCustomService = selectedServices.some((service) => !categories.includes(service) && service !== "__other__");
  const otherChecked = includeOther && (selected.has("__other__") || hasCustomService);
  const items = categories.map(
    (category) => `
      <label class="check-tile">
        <input type="checkbox" name="services" value="${escapeHtml(category)}" ${
          selected.has(category) ? "checked" : ""
        } />
        <span>${escapeHtml(category)}</span>
      </label>
    `
  );

  if (includeOther) {
    items.push(`
      <label class="check-tile">
        <input type="checkbox" name="services" value="__other__" ${otherChecked ? "checked" : ""} />
        <span>Other</span>
      </label>
    `);
  }

  return items.join("");
}

function customServicesValue(selectedServices = []) {
  return selectedServices.filter((service) => !categories.includes(service) && service !== "__other__").join(", ");
}

function hasOtherService(selectedServices = []) {
  return selectedServices.some((service) => !categories.includes(service) && service !== "__other__");
}

function chipList(items, className = "") {
  return items.map((item) => `<span class="chip ${className}">${escapeHtml(item)}</span>`).join("");
}

function renderAvatar(worker, size = "") {
  const className = `avatar ${size}`.trim();
  return `
    <div class="${className}">
      <img src="${escapeHtml(worker.photo)}" alt="${escapeHtml(worker.name)}" />
      <span>${escapeHtml(initials(worker.name))}</span>
    </div>
  `;
}

function profileButton(worker, className = "") {
  return `
    <button class="profile-link ${className}" data-action="open-profile" data-worker-id="${worker.id}">
      ${escapeHtml(worker.name)}
    </button>
  `;
}

function starsText(stars) {
  const rounded = Math.max(1, Math.min(5, Math.round(Number(stars || 0))));
  return "★".repeat(rounded);
}

function ratingSummary(worker) {
  const ratings = worker.ratings || [];
  if (ratings.length < 5) return `★ Rating hidden (${ratings.length}/5 ratings)`;
  const average = ratings.reduce((sum, rating) => sum + Number(rating.stars || 0), 0) / ratings.length;
  return `★ ${average.toFixed(1)} / 5 (${ratings.length} ratings)`;
}

function formatNotificationTime(value) {
  return dateTimeLabel(value || new Date().toISOString());
}

function buildClientNotifications(client) {
  const seenAt = readNotificationSeenAt("client", client.id);
  const jobRequestItems = state.jobs
    .filter((job) => job.clientId === client.id)
    .flatMap((job) =>
      (job.applications || [])
        .filter((application) => application.status === "Applied")
        .map((application) => {
          const worker = getWorker(application.workerId);
          return {
            id: `client-${job.id}-${application.workerId}-${application.appliedAt}`,
            title: `${worker ? worker.name : "A student"} requested ${job.title}`,
            detail: `${job.category} • ${formatDate(job.date)} • ${paymentLabel(job)}`,
            createdAt: application.appliedAt || job.createdAt,
            unread: new Date(application.appliedAt || job.createdAt).getTime() > seenAt,
            action: "open-request",
            jobId: job.id,
            workerId: application.workerId
          };
        })
    );

  const messageItems = buildMessageNotificationsForRole("client", client);

  return [...jobRequestItems, ...messageItems].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function buildWorkerNotifications(worker) {
  const seenAt = readNotificationSeenAt("worker", worker.id);
  const acceptedItems = state.jobs
    .filter((job) => job.acceptedWorkerId === worker.id)
    .map((job) => {
      const client = getClient(job.clientId);
      const acceptedApplication = (job.applications || []).find((application) => application.workerId === worker.id && application.status === "Accepted");
      return {
        id: `worker-accepted-${job.id}`,
        title: `Accepted for ${job.title}`,
        detail: `${client ? client.name : "A client"} approved your request`,
        createdAt: acceptedApplication?.acceptedAt || job.completedAt || job.createdAt,
        unread: new Date(acceptedApplication?.acceptedAt || job.completedAt || job.createdAt).getTime() > seenAt,
        action: "open-conversation",
        conversationId: getConversationForJob(job.id)?.id || ""
      };
    });

  const nextTimedItems = (worker.nextTimes || []).map((item) => {
    const client = getClient(item.clientId);
    const job = state.jobs.find((entry) => entry.id === item.jobId);
    return {
      id: `worker-next-${item.jobId}-${item.clientId}-${item.createdAt}`,
      title: `Next timed by ${client ? client.name : "a client"}`,
      detail: job ? job.title : "Requested follow-up",
      createdAt: item.createdAt,
      unread: new Date(item.createdAt).getTime() > seenAt
    };
  });

  const ratingItems = (worker.ratings || []).map((rating) => ({
    id: `worker-rating-${rating.jobId}-${rating.clientId}-${rating.createdAt}`,
    title: `New ${starsText(rating.stars)} rating`,
    detail: rating.comment ? rating.comment : "No comment was left",
    createdAt: rating.createdAt,
    unread: new Date(rating.createdAt).getTime() > seenAt
  }));

  const messageItems = buildMessageNotificationsForRole("worker", worker);

  return [...acceptedItems, ...nextTimedItems, ...ratingItems, ...messageItems].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function renderNotificationPanel(title, items, emptyMessage) {
  const unreadCount = items.filter((item) => item.unread).length;
  return `
    <section class="notification-panel">
      <div class="panel-heading">
        <h2>${escapeHtml(title)}</h2>
        <span class="pill">${unreadCount} new · ${items.length} total</span>
      </div>
      <div class="notification-list">
        ${
          items.length
            ? items
                .slice(0, 6)
                .map(
                  (item) => `
                    ${
                      item.action
                        ? `
                          <button class="notification-item ${item.unread ? "is-unread" : ""}" type="button" data-action="${escapeHtml(item.action)}" ${item.conversationId ? `data-conversation-id="${escapeHtml(item.conversationId)}"` : ""}>
                            <strong>${escapeHtml(item.title)}</strong>
                            <span>${escapeHtml(item.detail)}</span>
                            <small>${escapeHtml(formatNotificationTime(item.createdAt))}</small>
                          </button>
                        `
                        : `
                          <article class="notification-item ${item.unread ? "is-unread" : ""}">
                            <strong>${escapeHtml(item.title)}</strong>
                            <span>${escapeHtml(item.detail)}</span>
                            <small>${escapeHtml(formatNotificationTime(item.createdAt))}</small>
                          </article>
                        `
                    }
                  `
                )
                .join("")
            : renderEmpty(emptyMessage)
        }
      </div>
    </section>
  `;
}

function alreadyNextTimed(worker, clientId, jobId) {
  return (worker.nextTimes || []).some((item) => item.clientId === clientId && item.jobId === jobId);
}

function sameDayConflict(workerId, candidateJob) {
  return getApplicationsForWorker(workerId).some(({ job, application }) => {
    const activeApplication = application.status === "Applied" || application.status === "Accepted";
    return job.id !== candidateJob.id && job.date === candidateJob.date && job.status !== "Completed" && activeApplication;
  });
}

function addActivityEvent() {}

function displayNameFromEmail(email) {
  const localPart = String(email || "")
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .trim();
  if (!localPart) return "User";
  return `User ${localPart
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")}`;
}

function createLinkedAccount(worker) {
  return null;
}

function pathForView(nextView, meta = {}) {
  if (nextView === "messages" && meta.conversationId) return `/messages/${encodeURIComponent(meta.conversationId)}`;
  if (nextView === "notifications") return "/notifications";
  if (nextView === "client-dashboard") return "/client";
  if (nextView === "worker-dashboard") return "/student";
  if (nextView === "forgot-password") return "/forgot-password";
  if (nextView === "settings") return "/settings";
  if (nextView === "login") return "/login";
  if (nextView === "create-account") return "/create-account";
  return "/";
}

function routeFromLocation() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  const conversationMatch = pathname.match(/^\/messages\/([^/]+)$/);
  if (conversationMatch) {
    return { view: "messages", meta: { conversationId: decodeURIComponent(conversationMatch[1]) } };
  }
  if (pathname === "/messages") return { view: "messages", meta: {} };
  if (pathname === "/notifications") return { view: "notifications", meta: {} };
  if (pathname === "/client") return { view: "client-dashboard", meta: {} };
  if (pathname === "/student") return { view: "worker-dashboard", meta: {} };
  if (pathname === "/forgot-password") return { view: "forgot-password", meta: {} };
  if (pathname === "/settings") return { view: "settings", meta: {} };
  if (pathname === "/login") return { view: "login", meta: {} };
  if (pathname === "/create-account") return { view: "create-account", meta: {} };
  return { view: "landing", meta: {} };
}

function applyRouteFromLocation(replace = false) {
  const route = routeFromLocation();
  view = route.view;
  routeMeta = route.meta || {};
  if (replace) {
    window.history.replaceState({ view, meta: routeMeta }, "", window.location.pathname + window.location.search + window.location.hash);
  }
}

function navigate(nextView, meta = {}) {
  view = nextView;
  routeMeta = meta;
  logoMenuOpen = false;
  clientNotificationsOpen = false;
  workerNotificationsOpen = false;
  const nextPath = pathForView(nextView, meta);
  if (window.location.pathname !== nextPath) {
    window.history.pushState({ view: nextView, meta }, "", nextPath);
  } else {
    window.history.replaceState({ view: nextView, meta }, "", nextPath);
  }
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function render() {
  const app = document.querySelector("#app");
  app.innerHTML = `
    ${renderHeader()}
    <main>
      ${renderView()}
    </main>
    ${renderProfileModal()}
  `;
  bindCommonEvents();
  bindViewEvents();
  syncMessagesPolling();
}

function renderProfileModal() {
  if (!profileModalWorkerId) return "";
  const worker = getWorker(profileModalWorkerId);
  if (!worker) return "";
  return `
    <div class="modal-backdrop" data-action="close-profile">
      <section class="profile-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(worker.name)} profile">
        <button class="modal-close" data-action="close-profile" aria-label="Close profile">x</button>
        <div class="profile-modal-head">
          ${renderAvatar(worker, "large")}
          <div>
            <p class="eyebrow">Student profile</p>
            <h2>${escapeHtml(worker.name)}</h2>
            <span class="profile-rating">${escapeHtml(ratingSummary(worker))}</span>
          </div>
        </div>
        <p>${escapeHtml(worker.bio)}</p>
        <div class="profile-detail-grid">
          <span><strong>Age</strong>${escapeHtml(worker.age)}</span>
          <span><strong>School</strong>${escapeHtml(worker.school)}</span>
          <span><strong>Location</strong>${escapeHtml(worker.location)}</span>
          <span><strong>Language</strong>${escapeHtml(languageDisplay(worker.languages || worker.language))}</span>
        </div>
        <div class="profile-section">
          <h3>Services</h3>
          <div class="chip-row">${chipList(worker.services, "blue")}</div>
        </div>
        <div class="profile-section">
          <h3>Certifications and skills</h3>
          <div class="chip-row">${chipList(worker.certifications, "soft")}</div>
        </div>
      </section>
    </div>
  `;
}

function renderHeader() {
  const session = readSession();
  return `
    <header class="topbar">
      <div class="brand-shell">
        <button class="brand" type="button" data-action="toggle-logo-menu" aria-expanded="${logoMenuOpen ? "true" : "false"}" aria-label="Open ParTime menu">
          <span class="brand-mark">PT</span>
          <span>
            <strong>ParTime</strong>
            <small>Student services marketplace</small>
          </span>
        </button>
        ${logoMenuOpen ? `
          <div class="logo-menu" role="menu" aria-label="ParTime menu">
            <button class="logo-menu-item" type="button" data-view="landing">Home page</button>
            ${session
              ? `
                <button class="logo-menu-item" type="button" data-action="logout">Sign out</button>
                <button class="logo-menu-item" type="button" data-view="settings">Settings</button>
              `
              : `
                <button class="logo-menu-item" type="button" data-view="login">Sign in</button>
              `}
          </div>
        ` : ""}
      </div>
      <div class="header-actions">
        <button class="ghost small" type="button" data-action="open-client-profile">Client profile</button>
        <button class="ghost small" type="button" data-action="open-worker-profile">Student profile</button>
        ${session ? `<button class="nav-link logout-link" data-action="logout">Log out</button>` : ""}
      </div>
    </header>
  `;
}

function renderView() {
  if (view === "login") return renderLogin();
  if (view === "forgot-password") return renderForgotPassword();
  if (view === "create-account") return renderCreateAccount();
  if (view === "onboard-client") return renderClientOnboarding();
  if (view === "onboard-worker") return renderWorkerOnboarding();
  if (view === "client-dashboard") return renderClientDashboard();
  if (view === "worker-dashboard") return renderWorkerDashboard();
  if (view === "notifications") return renderNotificationsView();
  if (view === "messages") return renderMessagesView();
  if (view === "settings") return renderSettings();
  return renderLanding();
}

function renderNotificationsView() {
  const session = readSession();
  if (!session) {
    return `
      <section class="messages-shell messages-shell--locked">
        <div class="access-page panel">
          <p class="eyebrow">Notifications</p>
          <h1>Sign in to view notifications</h1>
          <p class="muted">Please sign in to see your latest updates.</p>
          <div class="action-row">
            <button class="primary" data-view="login">Sign in</button>
            <button class="secondary" data-view="landing">Home</button>
          </div>
        </div>
      </section>
    `;
  }

  const returnTo = routeMeta.returnTo || pathForView(session.role === "client" ? "client-dashboard" : "worker-dashboard", {});
  writeNotificationSeenAt(session.role, session.id);
  const notifications = session.role === "client" ? buildClientNotifications(getClient(session.id)) : buildWorkerNotifications(getWorker(session.id));

  return `
    <section class="messages-shell notifications-shell">
      <div class="section-heading section-heading--with-actions">
        <div>
          <p class="eyebrow">Notifications</p>
          <h1>Latest updates</h1>
          <p class="muted">Your job requests, message alerts, ratings, and timing updates all live here.</p>
        </div>
        <div class="section-actions">
          <button class="secondary small" type="button" data-action="go-back-from-notifications" data-return-to="${escapeHtml(returnTo)}">Back</button>
        </div>
      </div>

      <div class="notifications-page panel">
        <div class="panel-heading">
          <h2>${session.role === "client" ? "Client notifications" : "Student notifications"}</h2>
          <span class="pill">${notifications.length} total</span>
        </div>
        <div class="notification-list notification-list--page">
          ${
            notifications.length
              ? notifications
                  .map(
                    (item) => `
                      ${
                        item.action
                          ? `
                            <button class="notification-item ${item.unread ? "is-unread" : ""}" type="button" data-action="${escapeHtml(item.action)}" ${item.jobId ? `data-job-id="${escapeHtml(item.jobId)}"` : ""} ${item.workerId ? `data-worker-id="${escapeHtml(item.workerId)}"` : ""} ${item.conversationId ? `data-conversation-id="${escapeHtml(item.conversationId)}"` : ""}>
                              <strong>${escapeHtml(item.title)}</strong>
                              <span>${escapeHtml(item.detail)}</span>
                              <small>${escapeHtml(formatNotificationTime(item.createdAt))}</small>
                            </button>
                          `
                          : `
                            <article class="notification-item ${item.unread ? "is-unread" : ""}">
                              <strong>${escapeHtml(item.title)}</strong>
                              <span>${escapeHtml(item.detail)}</span>
                              <small>${escapeHtml(formatNotificationTime(item.createdAt))}</small>
                            </article>
                          `
                      }
                    `
                  )
                  .join("")
              : renderEmpty("No notifications yet.")
          }
        </div>
      </div>
    </section>
  `;
}

function renderSettings() {
  return `
    <section class="settings-shell">
      <div class="section-heading">
        <p class="eyebrow">App settings</p>
        <h1>Settings</h1>
        <p class="muted">A calmer corner for visual preferences, account tools, and small quality-of-life controls.</p>
      </div>
      <div class="settings-grid">
        <article class="panel settings-card settings-card--mint">
          <div class="panel-heading">
            <h2>Visual mood</h2>
            <span class="pill">Soft</span>
          </div>
          <p class="muted">Warm color palettes, compact layouts, and gentle motion all live here.</p>
          <div class="settings-swatch-row" aria-hidden="true">
            <span class="settings-swatch settings-swatch--green"></span>
            <span class="settings-swatch settings-swatch--blue"></span>
            <span class="settings-swatch settings-swatch--peach"></span>
            <span class="settings-swatch settings-swatch--lavender"></span>
          </div>
        </article>
        <article class="panel settings-card settings-card--blue">
          <div class="panel-heading">
            <h2>Account tools</h2>
            <span class="pill">Secure</span>
          </div>
          <p class="muted">Password, language, location, and visibility controls stay close at hand.</p>
          <div class="settings-chip-row">
            <span class="pill tiny">Password</span>
            <span class="pill tiny">Language</span>
            <span class="pill tiny">Notifications</span>
          </div>
        </article>
      </div>
      <div class="action-row">
        <button class="primary" data-view="landing">Home page</button>
        <button class="secondary" data-view="login">Sign in</button>
      </div>
    </section>
  `;
}

function renderHeroScene() {
  return `
    <figure class="hero-visual hero-visual--scene" aria-hidden="true">
      <div class="hero-scene">
        <div class="hero-scene__stage">
          <div class="hero-scene__mark" aria-hidden="true">
            <span class="scene-pill scene-pill--mint">Live local feed</span>
            <span class="hero-scene__arrow"></span>
          </div>
          <div class="hero-scene__board hero-scene__board--main">
            <div class="scene-board__top">
              <span class="scene-badge scene-badge--mint">Post a job</span>
              <span class="scene-badge scene-badge--sky">Public feed</span>
            </div>
            <div class="hero-scene__listing">
              <span class="scene-job-card__label">Pet Care</span>
              <strong>Walk Luna after school</strong>
              <small>CHF 45 · 3 applicants · Open today</small>
            </div>
            <div class="hero-scene__caption">
              <strong>Clients post once.</strong>
              <span>Students apply from a feed that stays clean and immediate.</span>
            </div>
          </div>
        </div>
      </div>
    </figure>
  `;
}

function renderLanding() {
  return `
    <section class="hero-band">
      <div class="hero-copy">
        <p class="eyebrow">Friendly part-time help</p>
        <h1>ParTime</h1>
        <p class="lede">
          A trusted local marketplace for the Ecolint – La Châtaigneraie community where students 18 and under can discover and apply for part-time jobs with a softer, friendlier feel.
        </p>
        <div class="action-row">
          <button class="primary" data-view="login">Sign in</button>
          <button class="secondary" data-view="create-account">Create account</button>
        </div>
        <div class="trust-row" aria-label="Marketplace trust notes">
          <span>Fixed or hourly pay</span>
          <span>Real-time updates</span>
          <span>Safe account checks</span>
        </div>
      </div>
      ${renderHeroScene()}
    </section>

    <section class="section-band">
      <div class="section-heading">
        <p class="eyebrow">How it works</p>
        <h2>Simple flows for every account type</h2>
      </div>
      <div class="step-story">
        <article class="step-row">
          <div class="step-visual step-visual--job" aria-hidden="true">
            <div class="visual-card visual-card--job">
              <div class="visual-card__top">
                <span class="visual-badge visual-badge--green">Post a job</span>
              </div>
              <div class="visual-job-card visual-job-card--accent visual-job-card--wide">
                <strong>Walk the dog after school</strong>
                <span>3 applicants · CHF 45 · fixed</span>
              </div>
              <div class="visual-job-summary">
                <span>One listing</span>
                <span>Public feed</span>
              </div>
            </div>
          </div>
          <div class="step-copy">
            <span class="number">1</span>
            <p class="step-kicker">POST A JOB</p>
            <h3 class="step-title">Have a job to be done?</h3>
            <p class="step-note">Create your listing in minutes and see it appear in the public feed.</p>
          </div>
        </article>
        <article class="step-row step-row--reverse">
          <div class="step-visual step-visual--apply" aria-hidden="true">
            <div class="visual-card visual-card--feed">
              <div class="visual-card__top">
                <span class="visual-badge visual-badge--green">Find jobs</span>
              </div>
              <div class="visual-filter-row">
                <span class="pill tiny">All</span>
                <span class="pill tiny">Lawn Care</span>
                <span class="pill tiny">Pet Care</span>
                <span class="pill tiny">Tech Help</span>
              </div>
              <div class="visual-feed-list">
                <div class="feed-card-mini">
                  <div>
                    <strong>Lawn Care</strong>
                    <span>Maplewood • 2 hours • $45</span>
                  </div>
                </div>
                <div class="feed-card-mini feed-card-mini--accent">
                  <div>
                    <strong>Pet Care</strong>
                    <span>Cedar Grove • tomorrow • $60</span>
                  </div>
                </div>
                <div class="feed-card-mini">
                  <div>
                    <strong>Tutoring</strong>
                    <span>Remote • after school • $35</span>
                  </div>
                </div>
              </div>
              <div class="visual-feed-footer"><span>Live feed</span><span>Apply once</span></div>
            </div>
          </div>
          <div class="step-copy">
            <span class="number">2</span>
            <p class="step-kicker">FIND WORK</p>
            <h3 class="step-title">Find nearby work that fits your skills.</h3>
            <p class="step-note">Filter by category and apply from a live feed that updates instantly.</p>
          </div>
        </article>
        <article class="step-row">
          <div class="step-visual step-visual--monitor" aria-hidden="true">
            <div class="visual-card visual-card--monitor">
              <div class="monitor-top">
                <span class="bell-dot"></span>
                <span>Live updates</span>
              </div>
              <div class="visual-monitor-panel visual-monitor-panel--accent">
                <strong>4.9 / 5</strong>
                <span>after 5 ratings</span>
                <div class="monitor-rating">Public rating</div>
                <span class="monitor-comment">Great communication and careful work.</span>
              </div>
              <div class="visual-monitor-list">
                <span>Job request</span>
                <span>Accepted</span>
                <span>Next timed</span>
              </div>
              <div class="visual-feed-footer"><span>Activity updates</span><span>Lifetime earnings</span></div>
            </div>
          </div>
          <div class="step-copy">
            <span class="number">3</span>
            <p class="step-kicker">STAY IN THE LOOP</p>
            <h3 class="step-title">Stay in the loop from request to finish.</h3>
            <p class="step-note">Notifications keep the progress clear without getting in the way.</p>
          </div>
        </article>
      </div>

      <div class="section-heading section-heading--spaced">
        <p class="eyebrow">Reviews</p>
        <h2>What people say about ParTime</h2>
      </div>
      <div class="review-grid">
        <article class="review-card">
          <div class="review-rating" aria-label="5 out of 5">Rated 5/5</div>
          <p>“The app felt really easy to use, and I liked being able to see everything in one place.”</p>
          <strong>Jordan, client</strong>
        </article>
        <article class="review-card">
          <div class="review-rating" aria-label="5 out of 5">Rated 5/5</div>
          <p>“I could apply fast, and the notifications made it simple to keep track of what was happening.”</p>
          <strong>Maya, student</strong>
        </article>
        <article class="review-card">
          <div class="review-rating" aria-label="4 out of 5">Rated 4/5</div>
          <p>“It feels trustworthy and clear. The live updates make the whole setup a lot more comfortable.”</p>
          <strong>Ana, customer</strong>
        </article>
      </div>
    </section>

  `;
}

function renderLogin() {
  const loginNotice = routeMeta.loginNotice || "";
  return `
    <section class="auth-layout auth-layout--single auth-layout--login">
      <div class="auth-panel auth-panel--login">
        <p class="eyebrow">Secure access</p>
        <h1>Sign in</h1>
        <p class="muted">Use the same sign-in screen for every account and pick up right where you left off.</p>
        ${loginNotice ? `<div class="form-success">${escapeHtml(loginNotice)}</div>` : ""}
        <form class="stack-form" id="loginForm">
          <label>
            <span>Email</span>
            <input type="email" name="email" placeholder="name@example.com" autocomplete="username" required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" name="password" placeholder="Enter your password" autocomplete="current-password" required />
          </label>
          <button class="primary full" type="submit">Submit</button>
        </form>
        <div class="auth-action-stack">
          <button class="secondary full" type="button" data-view="create-account">Create account</button>
          <button class="text-link auth-forgot-link" type="button" data-view="forgot-password">Forgot password?</button>
        </div>
      </div>
    </section>
  `;
}

function renderForgotPassword() {
  const resetEmail = routeMeta.email || "";
  const resetNotice = routeMeta.resetNotice || "";
  return `
    <section class="auth-layout auth-layout--single auth-layout--login">
      <div class="auth-panel auth-panel--login">
        <p class="eyebrow">Secure access</p>
        <h1>Reset password</h1>
        <p class="muted">We’ll send a reset code and let you set a new password for the account that matches your email.</p>
        ${resetNotice ? `<div class="form-success">${escapeHtml(resetNotice)}</div>` : ""}
        <form class="stack-form" id="forgotPasswordForm">
          <label>
            <span>Email</span>
            <input type="email" name="email" value="${escapeHtml(resetEmail)}" required />
          </label>
          <button class="secondary full" type="button" data-action="send-reset-code">Send Reset Link</button>
          <label>
            <span>Reset code</span>
            <input type="text" name="resetCode" inputmode="numeric" maxlength="8" placeholder="Enter your code" />
          </label>
          <label>
            <span>New password</span>
            <input type="password" name="password" minlength="8" required />
          </label>
          <label>
            <span>Confirm password</span>
            <input type="password" name="confirmPassword" minlength="8" required />
          </label>
          <button class="primary full" type="submit">Update password</button>
        </form>
        <div class="auth-action-stack">
          <button class="text-link auth-forgot-link" type="button" data-view="login">Back to sign in</button>
        </div>
      </div>
    </section>
  `;
}

function renderCreateAccount() {
  return `
    <section class="auth-layout auth-layout--single">
      <div class="auth-panel">
        <p class="eyebrow">New account</p>
        <h1>Create account</h1>
        <p class="muted">Choose the type of account you want to create. We’ll start with email and password, then verify the account and finish the first-time profile setup after sign in.</p>
        <div class="account-choices account-choices--stackable">
          <button class="account-card account-card--client" data-view="onboard-client" data-stage="register" type="button">
            <span class="account-card-label">Client account</span>
            <strong>Create a client profile</strong>
            <small>Post jobs, review helpers, and manage payments.</small>
          </button>
          <button class="account-card account-card--worker" data-view="onboard-worker" data-stage="register" type="button">
            <span class="account-card-label">Student account</span>
            <strong>Create a worker profile</strong>
            <small>Verify email, add your details, and start applying.</small>
          </button>
        </div>
      </div>
    </section>
  `;
}

function renderClientOnboarding() {
  const client = getClient() || findUserByEmail(routeMeta.email || "");
  const stage =
    routeMeta.stage ||
    (!client ? "register" : !client.emailVerificationSentAt ? "register" : !client.emailVerifiedAt ? "verify" : !onboardingCompleted(client) ? "details" : "details");
  if (stage === "register") return renderClientRegistrationScreen();
  if (stage === "details") return renderClientDetailsForm();
  return renderClientVerificationScreen();
}

function renderClientRegistrationScreen() {
  return `
    <section class="form-page">
      <div class="section-heading">
        <p class="eyebrow">Client sign up</p>
        <h1>Create your account</h1>
        <p class="muted">Enter an email and password to get started. We’ll send a verification code right after you submit.</p>
      </div>
      <form class="profile-form" id="clientOnboardingForm" data-form="client-register">
        <div class="verification-card">
          <label>
            <span>Email</span>
            <input type="email" name="email" value="" placeholder="name@example.com" autocomplete="username" required />
          </label>
          ${passwordFieldMarkup("password", "Create password", "new-password")}
          <div class="verification-status">
            We’ll send a verification code after you submit this form.
          </div>
        </div>
        <div class="form-actions onboarding-actions">
          <button class="primary" type="submit">Submit</button>
        </div>
      </form>
    </section>
  `;
}

function renderClientVerificationScreen() {
  const client = getClient();
  return `
    <section class="form-page">
      <div class="section-heading section-heading--with-actions">
        <div>
          <p class="eyebrow">Client sign up</p>
          <h1>Verify your email</h1>
          <p class="muted">A verification code has been sent to your email address. Please enter the code below to verify your account.</p>
        </div>
        <div class="section-actions">
          <button class="secondary small" type="button" data-view="create-account">Back</button>
        </div>
      </div>
      <div class="verification-layout verification-layout--vertical">
        <form class="profile-form" id="clientOnboardingForm" data-form="client-verify">
          <label>
            <span>Verification code</span>
            <input
              type="text"
              name="emailVerificationCode"
              inputmode="numeric"
              maxlength="8"
              placeholder="Enter the 8 digit code"
              required
            />
          </label>
          <div class="verification-status ${client.emailVerifiedAt ? "is-confirmed" : ""}">
            ${client.emailVerifiedAt ? "Email verified. Please sign in to continue." : "Enter the code you received by email."}
          </div>
          <div class="form-actions onboarding-actions verification-actions">
            <button class="secondary small" type="button" data-action="send-client-email-code">Resend code</button>
            <button class="primary" type="button" data-action="verify-client-email-code">Verify code</button>
          </div>
        </form>
      </div>
    </section>
  `;
}

function ageRangeForWorker(age) {
  const numericAge = Number(age || 0);
  if (numericAge > 0 && numericAge < 18) return "Under 18";
  if (numericAge >= 18 && numericAge <= 24) return "18-24";
  if (numericAge >= 25 && numericAge <= 34) return "25-34";
  if (numericAge >= 35 && numericAge <= 44) return "35-44";
  if (numericAge >= 45 && numericAge <= 54) return "45-54";
  if (numericAge >= 55 && numericAge <= 64) return "55-64";
  return "65+";
}

function renderClientDetailsForm() {
  const client = getClient();
  const isProfileEdit = routeMeta.mode === "edit";
  const onboarding = onboardingInfo(client);
  return `
    <section class="form-page">
      <div class="section-heading section-heading--with-actions">
        <div>
          <p class="eyebrow">Client profile</p>
          <h1>${isProfileEdit ? "Edit your profile" : "Finish your setup"}</h1>
          <p class="muted">${isProfileEdit ? "Update the details below whenever you want." : "A few quick details help us match you with the right jobs."}</p>
        </div>
        <div class="section-actions">
          ${isProfileEdit ? `<button class="secondary small" type="button" data-action="back-from-profile-edit">Back</button>` : ""}
        </div>
      </div>
      <form class="profile-form" id="clientOnboardingForm" data-form="client-details">
        <div class="onboarding-progress" aria-hidden="true">
          <span class="onboarding-progress__label">Step 2 of 2</span>
          <div class="onboarding-progress__track"><span class="onboarding-progress__bar" style="width:100%"></span></div>
        </div>
        <div class="form-grid onboarding-grid">
          <label>
            <span>Preferred name</span>
            <input type="text" name="name" placeholder="Jordan Taylor" value="${routeMeta.mode === "edit" ? escapeHtml(client.name) : escapeHtml(onboarding.preferredName || "")}" required />
          </label>
          <label>
            <span>Last name</span>
            <input type="text" name="surname" value="${escapeHtml(onboarding.surname || client.surname || "")}" required />
          </label>
          <label>
            <span>Email</span>
            <input type="email" value="${escapeHtml(client.email)}" readonly />
          </label>
          <label>
            <span>Phone number</span>
            <input type="tel" name="phone" value="${escapeHtml(client.phone || "")}" placeholder="Optional" />
          </label>
          <label>
            <span>Postal code</span>
            <input type="text" name="postalCode" value="${escapeHtml(userPostalCode(client))}" placeholder="Enter your postal code" required />
          </label>
          <label>
            <span>Locality</span>
            <input type="text" name="locality" value="${escapeHtml(client.location)}" placeholder="Detected from your postal code" required />
          </label>
          <label>
            <span>Preferred currency</span>
            <select name="preferredCurrency" required>${currencyOptions(client.preferredCurrency || "CHF")}</select>
          </label>
          <fieldset class="form-grid__full">
            <legend>What languages do you speak?</legend>
            <div class="check-grid">${languageCheckboxes(client.languages || client.language)}</div>
          </fieldset>
        </div>
        <fieldset>
          <legend>Services you are interested in</legend>
          <div class="check-grid">${serviceCheckboxes(client.typicalServices)}</div>
        </fieldset>
        <label>
          <span>About you</span>
          <textarea name="about" rows="3" placeholder="Tell helpers a little about your household and what you need">${escapeHtml(onboarding.about || "")}</textarea>
        </label>
        <div class="form-actions">
          <button class="primary" type="submit">${isProfileEdit ? "Save changes" : "Finish setup"}</button>
        </div>
      </form>
    </section>
  `;
}

function renderWorkerOnboarding() {
  const worker = getWorker() || findUserByEmail(routeMeta.email || "");
  const stage =
    routeMeta.stage ||
    (!worker ? "register" : !worker.emailVerificationSentAt ? "register" : !worker.emailVerifiedAt ? "verify" : !onboardingCompleted(worker) ? "details" : "details");
  if (stage === "register") return renderWorkerRegistrationScreen();
  if (stage === "details") return renderWorkerDetailsForm();
  return renderWorkerVerificationScreen();
}

function renderWorkerRegistrationScreen() {
  return `
    <section class="form-page">
      <div class="section-heading">
        <p class="eyebrow">Student sign up</p>
        <h1>Create your account</h1>
        <p class="muted">Enter an email and password to get started. We’ll send a verification code right after you submit.</p>
      </div>
      <form class="profile-form" id="workerOnboardingForm" data-form="worker-register">
        <div class="verification-card">
          <label>
            <span>Email</span>
            <input type="email" name="email" value="" placeholder="name@example.com" autocomplete="username" required />
          </label>
          ${passwordFieldMarkup("password", "Create password", "new-password")}
          <div class="verification-status">
            We’ll send a verification code after you submit this form.
          </div>
        </div>
        <div class="form-actions onboarding-actions">
          <button class="primary" type="submit">Submit</button>
        </div>
      </form>
    </section>
  `;
}

function renderWorkerVerificationScreen() {
  const worker = getWorker();
  return `
    <section class="form-page">
      <div class="section-heading section-heading--with-actions">
        <div>
          <p class="eyebrow">Student sign up</p>
          <h1>Verify your email</h1>
          <p class="muted">A verification code has been sent to your email address. Please enter the code below to verify your account.</p>
        </div>
        <div class="section-actions">
          <button class="secondary small" type="button" data-view="create-account">Back</button>
        </div>
      </div>
      <div class="verification-layout verification-layout--vertical">
        <form class="profile-form" id="workerOnboardingForm" data-form="worker-verify">
          <label>
            <span>Verification code</span>
            <input
              type="text"
              name="emailVerificationCode"
              inputmode="numeric"
              maxlength="8"
              placeholder="Enter the 8 digit code"
              required
            />
          </label>
          <div class="verification-status ${worker.emailVerifiedAt ? "is-confirmed" : ""}">
            ${worker.emailVerifiedAt ? "Email verified. Please sign in to continue." : "Enter the code you received by email."}
          </div>
          <div class="form-actions onboarding-actions verification-actions">
            <button class="secondary small" type="button" data-action="send-worker-email-code">Resend code</button>
            <button class="primary" type="button" data-action="verify-worker-email-code">Verify code</button>
          </div>
        </form>
      </div>
    </section>
  `;
}

function renderWorkerDetailsForm() {
  const worker = getWorker();
  const isProfileEdit = routeMeta.mode === "edit";
  const onboarding = onboardingInfo(worker);
  return `
    <section class="form-page">
      <div class="section-heading section-heading--with-actions">
        <div>
          <p class="eyebrow">Student profile</p>
          <h1>${isProfileEdit ? "Edit your profile" : "Finish your setup"}</h1>
          <p class="muted">${isProfileEdit ? "Update the details below whenever you want." : "A few quick details help us match you with the right jobs."}</p>
        </div>
        <div class="section-actions">
          ${isProfileEdit ? `<button class="secondary small" type="button" data-action="back-from-profile-edit">Back</button>` : ""}
        </div>
      </div>
      <form class="profile-form" id="workerOnboardingForm" data-form="worker-details">
        <div class="onboarding-progress" aria-hidden="true">
          <span class="onboarding-progress__label">Step 2 of 2</span>
          <div class="onboarding-progress__track"><span class="onboarding-progress__bar" style="width:100%"></span></div>
        </div>
        <div class="worker-profile-row">
          <div class="photo-uploader">
            ${renderAvatar(worker, "large")}
            <label class="file-button">
              <span>Upload photo</span>
              <input type="file" name="photo" id="photoInput" accept="image/*" />
            </label>
          </div>
          <div class="form-grid onboarding-grid">
            <label>
              <span>Preferred name</span>
              <input type="text" name="name" placeholder="Jordan Taylor" value="${routeMeta.mode === "edit" ? escapeHtml(worker.name) : escapeHtml(onboarding.preferredName || "")}" required />
            </label>
            <label>
              <span>Age range</span>
              <select name="ageRange" required>
                <option value="">Choose one</option>
                ${AGE_RANGE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}" ${String(onboarding.ageRange || ageRangeForWorker(worker.age)) === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
              </select>
            </label>
            <label>
              <span>Email</span>
              <input type="email" value="${escapeHtml(worker.email)}" readonly />
            </label>
            <label>
              <span>Phone number</span>
              <input type="tel" name="phone" value="${escapeHtml(worker.phone || "")}" placeholder="Optional" />
            </label>
            <label>
              <span>Postal code</span>
              <input type="text" name="postalCode" value="${escapeHtml(userPostalCode(worker))}" placeholder="Enter your postal code" required />
            </label>
            <label>
              <span>Locality</span>
              <input type="text" name="locality" value="${escapeHtml(worker.location)}" placeholder="Detected from your postal code" required />
            </label>
            <fieldset class="form-grid__full">
              <legend>What languages do you speak?</legend>
              <div class="check-grid">${languageCheckboxes(worker.languages || worker.language)}</div>
            </fieldset>
          </div>
        </div>
        <label>
          <span>Short bio</span>
          <textarea name="bio" rows="4" required>${escapeHtml(worker.bio)}</textarea>
        </label>
        <fieldset>
          <legend>Services offered</legend>
          <div class="check-grid">${serviceCheckboxes(worker.services, true)}</div>
        </fieldset>
        <div class="more-service-card" ${hasOtherService(worker.services) ? "" : "hidden"}>
          <h3>More service</h3>
          <label>
            <span>Write another job or service you can offer</span>
            <textarea
              name="customService"
              rows="3"
              placeholder="Write another service, such as car washing or party setup"
            >${escapeHtml(customServicesValue(worker.services))}</textarea>
          </label>
        </div>
        <label>
          <span>Certifications and skills</span>
          <input type="text" name="certifications" value="${escapeHtml(worker.certifications.join(", "))}" required />
        </label>
        <div class="form-actions">
          <button class="primary" type="submit">${isProfileEdit ? "Save changes" : "Finish setup"}</button>
        </div>
      </form>
    </section>
  `;
}

function renderClientDashboard() {
  const client = getClient();
  const clientJobs = state.jobs
    .filter((job) => job.clientId === client.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const activeJobs = clientJobs.filter((job) => job.status !== "Completed");
  const clientNotifications = buildClientNotifications(client);
  const clientUnreadCount = clientNotifications.filter((item) => item.unread).length;

  return `
    <section class="dashboard-shell">
      <div class="dashboard-heading">
        <div>
          <p class="eyebrow">Client dashboard</p>
          <h1>Welcome, ${escapeHtml(client.name)}</h1>
          <p>${escapeHtml(client.location)} jobs and live requests. Language: ${escapeHtml(languageDisplay(client.languages || client.language))}.</p>
        </div>
      <div class="dashboard-actions">
          <button class="icon-button" type="button" data-action="open-messages" aria-label="Open messages">
            💬
          </button>
          <button class="icon-button" type="button" data-action="open-notifications" aria-label="Client notifications">
            🔔
            ${clientUnreadCount ? `<span class="icon-badge">${clientUnreadCount}</span>` : ""}
          </button>
          <button class="secondary" data-view="onboard-client" data-stage="details" data-mode="edit">Edit profile</button>
        </div>
      </div>

      <section class="dashboard-section">
        <div class="panel-heading">
          <h2>Active job posts</h2>
          <span>${activeJobs.length} active</span>
        </div>
        <div class="job-list">
          ${activeJobs.map(renderClientJobCard).join("") || renderEmpty("No active jobs posted yet.")}
        </div>
      </section>

      <div class="two-column">
        <section class="panel">
          <div class="panel-heading">
            <h2>Post a job</h2>
            <span class="pill">Public feed</span>
          </div>
          <form class="stack-form" id="postJobForm">
            <label>
              <span>Title</span>
              <input type="text" name="title" placeholder="Example: Walk the dog after school" required />
            </label>
            <label class="themed-select-label">
              <span>Job type</span>
              <select name="category" required>${categoryOptions("Lawn Care")}</select>
            </label>
            <div class="form-grid compact">
              <label>
                <span>Date</span>
                <input type="date" name="date" min="${TODAY}" value="2026-07-10" required />
              </label>
              <label>
                <span>Pay type</span>
                <select name="payType" required>
                  <option value="Fixed">Fixed price</option>
                  <option value="Hourly">Hourly rate</option>
                </select>
              </label>
              <label>
                <span>Amount</span>
                <input type="number" name="pay" min="0" step="0.01" value="40" required />
              </label>
              <label>
                <span>Currency</span>
            <select name="currency" required>${currencyOptions(client.preferredCurrency || "CHF")}</select>
              </label>
              <label>
                <span>Estimated hours</span>
                <input type="number" name="estimatedHours" min="0.25" step="0.25" value="2" required />
              </label>
            </div>
            <label class="negotiable-bubble">
              <input type="checkbox" name="negotiable" />
              <span>Negotiable</span>
            </label>
            <button class="primary full" type="submit">Post job</button>
            <div class="post-visual-stack" aria-hidden="true">
              <div class="post-visual-stack__top">
                <span class="visual-badge visual-badge--green">Live preview</span>
                <span class="post-visual-stack__meta">Looks like the public feed</span>
              </div>
              <div class="post-visual-stage">
                <div class="post-visual-main">
                  <div class="post-visual-main__head">
                    <strong>Walk the dog after school</strong>
                    <span>Today · 3 applicants</span>
                  </div>
                  <div class="post-visual-chips">
                    <span>Fixed</span>
                    <span>CHF 40</span>
                    <span>Negotiable</span>
                  </div>
                  <div class="post-visual-profiles">
                    ${["Maya", "Eli", "Nia"].map((name, index) => `<span style="--delay:${index * 90}ms">${escapeHtml(name)}</span>`).join("")}
                  </div>
                </div>
                <div class="post-visual-side">
                  <div class="post-visual-mini-card post-visual-mini-card--accent">
                    <strong>Nearby matches</strong>
                    <span>Students with pet care experience</span>
                  </div>
                  <div class="post-visual-mini-card">
                    <strong>Request feed</strong>
                    <span>New applications slide in instantly</span>
                  </div>
                </div>
              </div>
              <div class="post-visual-footer">
                <span>Job posted</span>
                <span>Client inbox</span>
                <span>Student feed</span>
              </div>
            </div>
          </form>
        </section>

        <section class="panel">
          <div class="panel-heading">
            <h2>Job requests</h2>
            <span class="pill">Client inbox</span>
          </div>
          ${renderClientRequestInbox(clientJobs)}
        </section>
      </section>
    </section>
  `;
}

function renderClientRequestInbox(clientJobs) {
  const requests = clientJobs
    .flatMap((job) =>
      (job.applications || [])
        .filter((application) => application.status === "Applied")
        .map((application) => ({
          job,
          application,
          worker: getWorker(application.workerId)
        }))
    )
    .sort((a, b) => new Date(b.application.appliedAt) - new Date(a.application.appliedAt));

  if (!requests.length) {
    return renderEmpty("Student requests will appear here.");
  }

  return `
    <div class="request-list request-list--compact">
      ${requests
        .slice(0, 5)
        .map(
          ({ job, application, worker }) => `
            <article class="request-item">
              ${renderAvatar(worker)}
              <div>
                ${profileButton(worker)}
                <span>${escapeHtml(job.title)} • ${escapeHtml(job.category)}</span>
                <small>Requested ${formatNotificationTime(application.appliedAt)}</small>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderClientJobCard(job) {
  const acceptedWorker = job.acceptedWorkerId ? getWorker(job.acceptedWorkerId) : null;

  return `
    <article class="job-card ${statusClass(job.status)}">
      <div class="job-topline">
        <div>
          <h3>${escapeHtml(job.title)}</h3>
          <div class="chip-row">
            <span class="chip blue">${escapeHtml(job.category)}</span>
            <span class="chip">${formatDate(job.date)}</span>
            <span class="chip">${escapeHtml(job.location)}</span>
            <span class="chip status">${escapeHtml(job.status)}</span>
            <span class="chip">${escapeHtml(job.payType)}</span>
            ${job.negotiable ? `<span class="chip negotiable">Negotiable</span>` : ""}
          </div>
        </div>
        <strong class="pay">${escapeHtml(paymentLabel(job))}</strong>
      </div>

      ${
        acceptedWorker
          ? `
            <div class="accepted-strip">
              ${renderAvatar(acceptedWorker)}
              <div>
                ${profileButton(acceptedWorker)}
                <span>${job.status === "Completed" ? "Completed this job" : "Accepted and in progress"}</span>
                <small>${escapeHtml(ratingSummary(acceptedWorker))}</small>
              </div>
              <div class="accepted-strip__actions">
                ${
                  job.status === "In Progress"
                    ? `<button class="primary small" data-action="complete-job" data-job-id="${job.id}">Approve completion</button>`
                    : ""
                }
                <button class="secondary small" type="button" data-action="open-conversation" data-job-id="${escapeHtml(job.id)}">
                  Message
                </button>
              </div>
            </div>
          `
          : ""
      }

      ${acceptedWorker && job.status === "Completed" ? renderRatingPanel(job, acceptedWorker) : ""}

      <div class="job-subsection">
        <h4>Applications</h4>
        ${
          job.applications.length
            ? job.applications.map((application) => renderApplicationRow(job, application)).join("")
            : `<p class="muted">No applications yet.</p>`
        }
      </div>

    </article>
  `;
}

function renderRatingPanel(job, worker) {
  const existing = (worker.ratings || []).find((rating) => rating.jobId === job.id && rating.clientId === job.clientId);
  if (existing) {
    return `
      <div class="rating-panel">
        <strong>Client rating</strong>
        <span>${escapeHtml(starsText(existing.stars))} Rated ${existing.stars} / 5. Public profile: ${escapeHtml(ratingSummary(worker))}</span>
        ${existing.comment ? `<p class="rating-comment-copy">${escapeHtml(existing.comment)}</p>` : ""}
      </div>
    `;
  }

  return `
    <div class="rating-panel">
      <strong>Rate this student</strong>
      <span>Average rating becomes public after 5 ratings.</span>
      <div class="star-row" aria-label="Rate student">
        ${[1, 2, 3, 4, 5]
          .map(
            (stars) => `
              <button class="star-button" data-action="rate-worker" data-job-id="${job.id}" data-worker-id="${worker.id}" data-stars="${stars}">
                ${escapeHtml(starsText(stars))}
              </button>
            `
          )
          .join("")}
      </div>
      <label class="rating-comment-field">
        <span>Optional comment</span>
        <textarea name="ratingComment" rows="2" placeholder="Write a short note about the work"></textarea>
      </label>
    </div>
  `;
}

function renderApplicationRow(job, application) {
  const worker = getWorker(application.workerId);
  const client = getClient(job.clientId);
  const canAccept = job.status === "Open" && application.status === "Applied";
  const nextTimed = alreadyNextTimed(worker, client.id, job.id);
  const canMessage = Boolean(job.acceptedWorkerId === worker.id || application.status === "Accepted");
  return `
    <div class="application-row">
      ${renderAvatar(worker)}
      <div class="application-copy">
        ${profileButton(worker)}
        <span>${escapeHtml(worker.age)} years old, ${escapeHtml(worker.school)}. Speaks ${escapeHtml(languageDisplay(worker.languages || worker.language))}.</span>
        <small>Applied ${dateTimeLabel(application.appliedAt)} at ${escapeHtml(paymentLabel(job))}. ${escapeHtml(ratingSummary(worker))}</small>
      </div>
      <span class="pill">${escapeHtml(application.status)}</span>
      <div class="application-actions">
        <button class="secondary small" data-action="next-time" data-job-id="${job.id}" data-worker-id="${worker.id}" ${nextTimed ? "disabled" : ""}>
          ${nextTimed ? "Next Timed" : "Next Time"}
        </button>
        ${
          canMessage
            ? `<button class="secondary small" type="button" data-action="open-conversation" data-job-id="${escapeHtml(job.id)}">Message</button>`
            : ""
        }
        ${canAccept ? `<button class="primary small" data-action="accept-application" data-job-id="${job.id}" data-worker-id="${worker.id}">Accept</button>` : ""}
      </div>
    </div>
  `;
}

function renderWorkerDashboard() {
  const worker = getWorker();
  const applications = getApplicationsForWorker(worker.id);
  const inProgress = state.jobs.filter((job) => job.status === "In Progress" && job.acceptedWorkerId === worker.id);
  const feedJobs = getFilteredFeedJobs(worker.id);
  const nextTimes = worker.nextTimes || [];
  const workerNotifications = buildWorkerNotifications(worker);
  const workerUnreadCount = workerNotifications.filter((item) => item.unread).length;

  return `
    <section class="dashboard-shell">
      <div class="dashboard-heading">
        <div class="worker-heading">
          ${renderAvatar(worker, "large")}
          <div>
            <p class="eyebrow">Student dashboard</p>
            <h1>${escapeHtml(worker.name)}</h1>
            <p>${escapeHtml(worker.location)}. ${escapeHtml(worker.age)} years old. Speaks ${escapeHtml(languageDisplay(worker.languages || worker.language))}.</p>
            <span class="profile-rating">${escapeHtml(ratingSummary(worker))}</span>
          </div>
        </div>
        <div class="dashboard-actions">
          <button class="icon-button" type="button" data-action="open-messages" aria-label="Open messages">
            💬
          </button>
          <button class="icon-button" type="button" data-action="open-notifications" aria-label="Student notifications">
            🔔
            ${workerUnreadCount ? `<span class="icon-badge">${workerUnreadCount}</span>` : ""}
          </button>
          <button class="secondary" data-view="onboard-worker" data-stage="details" data-mode="edit">Edit profile</button>
        </div>
      </div>

      <div class="metric-grid">
        <article class="metric-card">
          <span>Lifetime earned</span>
          <strong>${formatTotals(workerEarningsTotals(worker.id))}</strong>
        </article>
        <article class="metric-card">
          <span>Applications</span>
          <strong>${applications.length}</strong>
        </article>
        <article class="metric-card">
          <span>In progress</span>
          <strong>${inProgress.length}</strong>
        </article>
        <article class="metric-card">
          <span>Next Timed</span>
          <strong>${nextTimes.length}</strong>
        </article>
      </div>

      ${helperNotice ? `<div class="notice-banner">${escapeHtml(helperNotice)}</div>` : ""}

      <section class="dashboard-section">
        <div class="panel-heading">
          <div>
            <h2>Available jobs nearby</h2>
            <span>${feedJobs.length} matching jobs</span>
          </div>
        </div>
        <div class="feed-toolbar">
          <label>
            <span>Search</span>
            <input type="search" id="jobSearch" value="${escapeHtml(helperSearch)}" placeholder="Search title, type, or location" />
          </label>
          <label class="themed-select-label">
            <span>Filter category</span>
            <select id="jobFilter">
              <option value="All">All categories</option>
              ${categories
                .map(
                  (category) => `
                    <option value="${escapeHtml(category)}" ${helperFilter === category ? "selected" : ""}>${escapeHtml(category)}</option>
                  `
                )
                .join("")}
            </select>
          </label>
        </div>
        <div class="job-grid">
          ${feedJobs.map((job) => renderWorkerJobCard(job, worker)).join("") || renderEmpty("No open jobs match this filter.")}
        </div>
      </section>

      <section class="dashboard-section">
        <div class="panel-heading">
          <h2>My applications</h2>
          <span>${applications.length} total</span>
        </div>
        <div class="timeline-list">
          ${
            applications
              .map(
                ({ job, application }) => `
                  <article class="timeline-item">
                    <span class="timeline-dot ${statusClass(job.status)}"></span>
                    <div>
                      <strong>${escapeHtml(job.title)}</strong>
                      <span>${escapeHtml(job.status)}. ${escapeHtml(job.category)}. ${escapeHtml(paymentLabel(job))}</span>
                      <small>Applied ${dateTimeLabel(application.appliedAt)}</small>
                    </div>
                    ${
                      job.acceptedWorkerId === worker.id || application.status === "Accepted"
                        ? `<button class="secondary small" type="button" data-action="open-conversation" data-job-id="${escapeHtml(job.id)}">Message</button>`
                        : ""
                    }
                  </article>
                `
              )
              .join("") || renderEmpty("Applications will appear here.")
          }
        </div>
      </section>

      <section class="dashboard-section">
        <div class="panel-heading">
          <h2>Next Timed</h2>
          <span>${nextTimes.length} total</span>
        </div>
        <div class="timeline-list">
          ${
            nextTimes
              .map((item) => {
                const client = getClient(item.clientId);
                const job = state.jobs.find((jobItem) => jobItem.id === item.jobId);
                return `
                  <article class="timeline-item">
                    <span class="timeline-dot completed"></span>
                    <div>
                      <strong>${escapeHtml(client.name)} Next Timed you</strong>
                      <span>${escapeHtml(job?.title || "Future work")}</span>
                      <small>${dateTimeLabel(item.createdAt)}</small>
                    </div>
                  </article>
                `;
              })
              .join("") || renderEmpty("When a client taps Next Time, it will appear here.")
          }
        </div>
      </section>
    </section>
  `;
}

function renderMessagesView() {
  const session = readSession();
  if (!session) {
    return `
      <section class="messages-shell messages-shell--locked">
        <div class="access-page panel">
          <p class="eyebrow">Messages</p>
          <h1>Sign in to open messages</h1>
          <p class="muted">This conversation stays private. Please sign in to continue.</p>
          <div class="action-row">
            <button class="primary" data-view="login">Sign in</button>
            <button class="secondary" data-view="landing">Home</button>
          </div>
        </div>
      </section>
    `;
  }

  const conversations = getAccessibleConversations(session.role, session.id);
  const activeConversationId = routeMeta.conversationId || conversations[0]?.id || "";
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) || conversations[0] || null;
  const activeMessages = activeConversation ? getConversationMessages(activeConversation.id) : [];
  const { job, client, worker } = activeConversation ? getConversationParticipants(activeConversation) : {};
  const partner = session.role === "client" ? worker : client;
  const previewName = partner ? partner.name : "Conversation";
  if (routeMeta.conversationId && !activeConversation) {
    return `
      <section class="messages-shell messages-shell--locked">
        <div class="access-page panel">
          <p class="eyebrow">Messages</p>
          <h1>Conversation unavailable</h1>
          <p class="muted">You do not have access to this conversation, or it does not exist.</p>
          <div class="action-row">
            <button class="primary" data-action="go-back-from-messages">Back</button>
            <button class="secondary" data-view="${session.role === "client" ? "client-dashboard" : "worker-dashboard"}">Dashboard</button>
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="messages-shell">
      <div class="section-heading section-heading--with-actions">
        <div>
          <p class="eyebrow">Messages</p>
          <h1>Private job chat</h1>
          <p class="muted">Only the client and the accepted student can see these conversations.</p>
        </div>
        <div class="section-actions">
          <button class="secondary small" type="button" data-action="go-back-from-messages">Back</button>
        </div>
      </div>

      <div class="messages-layout">
        <aside class="messages-list panel">
          <div class="panel-heading">
            <h2>Conversations</h2>
            <span class="pill">${conversations.length}</span>
          </div>
          <div class="conversation-list">
            ${
              conversations.length
                ? conversations
                    .map((conversation) => {
                      const { job: conversationJob } = getConversationParticipants(conversation);
                      const selected = conversation.id === activeConversation?.id;
                      const unreadCount = conversation.unreadCount || 0;
                      const otherName = conversationPartnerName(conversation, session.role);
                      const avatarSource =
                        session.role === "client"
                          ? getWorker(conversation.workerId) || { name: otherName, photo: "" }
                          : getClient(conversation.clientId) || { name: otherName, photo: "" };
                      return `
                        <button class="conversation-item ${selected ? "is-selected" : ""} ${unreadCount ? "is-unread" : ""}" type="button" data-action="open-conversation" data-conversation-id="${escapeHtml(conversation.id)}">
                          ${renderAvatar(avatarSource)}
                          <div>
                            <strong>${escapeHtml(otherName)}</strong>
                            <span>${escapeHtml(conversationJob?.title || "Accepted job")}</span>
                            <small>${escapeHtml(conversationPreview(conversation, session.role, session.id))}</small>
                          </div>
                          ${unreadCount ? `<span class="pill tiny">${unreadCount}</span>` : ""}
                        </button>
                      `;
                    })
                    .join("")
                : renderEmpty("No accepted job chats yet. Once a client accepts a student, the conversation appears here.")
            }
          </div>
        </aside>

        <section class="messages-thread panel ${activeConversation ? "" : "messages-thread--empty"}">
          ${
            activeConversation
              ? `
                <div class="panel-heading">
                  <div class="conversation-head">
                    ${renderAvatar(partner || { name: previewName, photo: "" })}
                    <div>
                      <h2>${escapeHtml(previewName)}</h2>
                      <span>${escapeHtml(job?.title || "Accepted job")} · ${escapeHtml(job?.category || "")}</span>
                    </div>
                  </div>
                  <span class="pill">${escapeHtml(job?.status || "Open")}</span>
                </div>
                <div class="message-stream" aria-live="polite">
                  ${
                    activeMessages.length
                      ? activeMessages
                          .map((message) => {
                            const sentByMe = message.senderId === session.id;
                            return `
                              <article class="message-bubble ${sentByMe ? "sent" : "received"}">
                                <p>${escapeHtml(message.content)}</p>
                                <small>${escapeHtml(dateTimeLabel(message.createdAt))}</small>
                              </article>
                            `;
                          })
                          .join("")
                      : `
                        <div class="empty-state empty-state--message">
                          Start the conversation with a short hello.
                        </div>
                      `
                  }
                </div>
                <form class="message-composer" data-conversation-id="${escapeHtml(activeConversation.id)}" id="messageForm">
                  <label>
                    <span>Message</span>
                    <textarea name="message" rows="3" placeholder="Write a private message">${escapeHtml(messageDrafts[activeConversation.id] || "")}</textarea>
                  </label>
                  ${messageSendError ? `<div class="form-error">${escapeHtml(messageSendError)}</div>` : ""}
                  <div class="message-composer__actions">
                    <span class="muted">Enter sends the message. Shift + Enter makes a new line.</span>
                    <button class="primary" type="submit" ${messageSendBusy ? "disabled" : ""}>${messageSendBusy ? "Sending..." : "Send"}</button>
                  </div>
                </form>
              `
              : `
                <div class="empty-state empty-state--message">
                  Select an accepted job to open the private conversation.
                </div>
              `
          }
        </section>
      </div>
    </section>
  `;
}

function getFilteredFeedJobs(workerId) {
  const normalizedSearch = helperSearch.trim().toLowerCase();
  return state.jobs
    .filter((job) => job.status === "Open")
    .filter((job) => helperFilter === "All" || job.category === helperFilter)
    .filter((job) => {
      if (!normalizedSearch) return true;
      const client = getClient(job.clientId);
      return [job.title, job.category, job.location, client.name]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function renderWorkerJobCard(job, worker) {
  const client = getClient(job.clientId);
  const application = job.applications.find((item) => item.workerId === worker.id);
  const isSuggested = worker.services.includes(job.category) && worker.location === job.location;
  const hasConflict = !application && sameDayConflict(worker.id, job);

  return `
    <article class="job-card feed-card">
      <div class="job-topline">
        <div>
          <h3>${escapeHtml(job.title)}</h3>
          <div class="chip-row">
            <span class="chip blue">${escapeHtml(job.category)}</span>
            <span class="chip">${formatDate(job.date)}</span>
            <span class="chip">${escapeHtml(job.location)}</span>
            <span class="chip">${escapeHtml(job.payType)}</span>
            ${job.negotiable ? `<span class="chip negotiable">Negotiable</span>` : ""}
          </div>
        </div>
        <strong class="pay">${escapeHtml(paymentLabel(job))}</strong>
      </div>
      <p class="muted">Posted by ${escapeHtml(client.name)}. ${job.applications.length} applicant${job.applications.length === 1 ? "" : "s"}.</p>
      ${isSuggested ? `<span class="match-badge">Strong match</span>` : ""}
      ${hasConflict ? `<p class="conflict-note">Same-day conflict with another application.</p>` : ""}
      <div class="card-actions">
        ${
          application
            ? `<button class="secondary full" disabled>${escapeHtml(application.status)}</button>`
            : hasConflict
              ? `<button class="secondary full" disabled>Date conflict</button>`
              : `<button class="primary full" data-action="apply-job" data-job-id="${job.id}">Apply</button>`
        }
      </div>
    </article>
  `;
}

function renderSafetyMonitor() {
  return "";
}

function renderEmpty(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function bindCommonEvents() {
  document.querySelectorAll("[data-action='toggle-logo-menu']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      logoMenuOpen = !logoMenuOpen;
      clientNotificationsOpen = false;
      workerNotificationsOpen = false;
      render();
    });
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.view;
      const meta = {};
      if (button.dataset.role) meta.role = button.dataset.role;
      if (button.dataset.stage) meta.stage = button.dataset.stage;
      if (button.dataset.mode) meta.mode = button.dataset.mode;
      if (!meta.stage && String(next || "").startsWith("onboard-")) meta.stage = "register";
      navigate(next, meta);
    });
  });

  document.querySelectorAll("[data-action='open-profile']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      profileModalWorkerId = button.dataset.workerId;
      render();
    });
  });

  document.querySelectorAll("[data-action='open-conversation']").forEach((button) => {
    button.addEventListener("click", () => {
      const conversationId = button.dataset.conversationId || "";
      const jobId = button.dataset.jobId || "";
      const session = readSession();
      if (!session) return;
      const conversation = conversationId ? getConversationById(conversationId) : jobId ? openConversationForJob(jobId) : null;
      if (!conversation) return;
      const nextConversationId = conversation.id;
      const returnTo = routeMeta.returnTo || pathForView(view, routeMeta);
      routeMeta = { conversationId: nextConversationId, returnTo };
      navigate("messages", { conversationId: nextConversationId, returnTo });
      if (markConversationRead(nextConversationId)) {
        render();
      }
      if (session.role === "client") writeNotificationSeenAt("client", session.id);
      if (session.role === "worker") writeNotificationSeenAt("worker", session.id);
    });
  });

  document.querySelectorAll("[data-action='open-notifications']").forEach((button) => {
    button.addEventListener("click", () => {
      const session = readSession();
      if (!session) return;
      const returnTo = pathForView(view, routeMeta);
      routeMeta = { returnTo };
      writeNotificationSeenAt(session.role, session.id);
      navigate("notifications", { returnTo });
    });
  });

  document.querySelectorAll("[data-action='open-messages']").forEach((button) => {
    button.addEventListener("click", () => {
      const session = readSession();
      if (!session) return;
      const returnTo = pathForView(view, routeMeta);
      routeMeta = { returnTo };
      navigate("messages", { returnTo });
    });
  });

  document.querySelectorAll("[data-action='open-client-profile']").forEach((button) => {
    button.addEventListener("click", () => {
      const session = readSession();
      if (session?.role === "client") {
        navigate("client-dashboard");
        return;
      }
      navigate("onboard-client", { role: "client", stage: "register" });
    });
  });

  document.querySelectorAll("[data-action='open-worker-profile']").forEach((button) => {
    button.addEventListener("click", () => {
      const session = readSession();
      if (session?.role === "worker") {
        navigate("worker-dashboard");
        return;
      }
      navigate("onboard-worker", { role: "worker", stage: "register" });
    });
  });

  document.querySelectorAll("[data-action='open-request']").forEach((button) => {
    button.addEventListener("click", () => {
      const session = readSession();
      if (!session) return;
      if (session.role === "client") navigate("client-dashboard");
      if (session.role === "worker") navigate("worker-dashboard");
    });
  });

  document.querySelectorAll("[data-action='close-profile']").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && !element.classList.contains("modal-close")) return;
      profileModalWorkerId = "";
      render();
    });
  });

  document.querySelectorAll("[data-action='logout']").forEach((button) => {
    button.addEventListener("click", () => {
      clearSession();
      helperNotice = "";
      routeMeta = { role: "client" };
      navigate("login", { role: "client" });
    });
  });

  document.querySelectorAll("[data-action='back-from-profile-edit']").forEach((button) => {
    button.addEventListener("click", () => {
      const session = readSession();
      if (session?.role === "worker") {
        navigate("worker-dashboard");
        return;
      }
      if (session?.role === "client") {
        navigate("client-dashboard");
        return;
      }
      if (view === "onboard-worker") {
        routeMeta = { ...routeMeta, stage: "verify" };
        render();
        return;
      }
      routeMeta = { ...routeMeta, stage: "verify" };
      render();
    });
  });

  document.querySelectorAll("[data-action='go-back-from-messages']").forEach((button) => {
    button.addEventListener("click", () => {
      if (routeMeta.returnTo) {
        window.history.back();
        return;
      }
      const session = readSession();
      navigate(session?.role === "worker" ? "worker-dashboard" : "client-dashboard");
    });
  });

  document.querySelectorAll("[data-action='go-back-from-notifications']").forEach((button) => {
    button.addEventListener("click", () => {
      const returnTo = button.dataset.returnTo || routeMeta.returnTo || "";
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      const session = readSession();
      navigate(returnTo || (session?.role === "worker" ? "worker-dashboard" : "client-dashboard"));
    });
  });
}

function bindViewEvents() {
  if (view === "login") bindLogin();
  if (view === "forgot-password") bindForgotPassword();
  if (view === "onboard-client") bindClientOnboarding();
  if (view === "onboard-worker") bindWorkerOnboarding();
  if (view === "client-dashboard") bindClientDashboard();
  if (view === "worker-dashboard") bindWorkerDashboard();
  if (view === "notifications") bindNotificationsView();
  if (view === "messages") bindMessagesView();
}

function bindNotificationsView() {
  const session = readSession();
  if (!session) return;
  writeNotificationSeenAt(session.role, session.id);
}

function bindLogin() {
  document.querySelector("#loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const user = findUserByEmail(email);
    if (!user) {
      showFormError(event.currentTarget, "We could not find that email.");
      return;
    }
    if (accountNeedsVerification(user)) {
      showFormError(event.currentTarget, "Please verify your email before signing in.");
      return;
    }

    const salt = user.passwordSalt || "";
    if (hashPassword(password, salt) !== user.passwordHash) {
      showFormError(event.currentTarget, "That password does not match this account.");
      return;
    }

    const role = accountRoleForUser(user);
    writeSession({ role, id: user.id });
    if (requiresOnboarding(user)) {
      navigate(role === "worker" ? "onboard-worker" : "onboard-client", { stage: "details" });
      return;
    }
    navigate(role === "worker" ? "worker-dashboard" : "client-dashboard");
  });
}

function bindForgotPassword() {
  const form = document.querySelector("#forgotPasswordForm");
  if (!form) return;
  let resetTarget = null;

  document.querySelector("[data-action='send-reset-code']").addEventListener("click", () => {
    const email = String(new FormData(form).get("email") || "").trim();
    if (!email) {
      showFormError(form, "Please add your email first.");
      return;
    }

    const user =
      Object.values(state.clients).find((item) => item.email.toLowerCase() === email.toLowerCase()) ||
      Object.values(state.workers).find((item) => item.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      showFormError(form, "We could not find that email.");
      return;
    }

    resetTarget = user;
    user.passwordResetCode = generateVerificationCode();
    user.passwordResetSentAt = new Date().toISOString();
    routeMeta = { ...routeMeta, email, resetNotice: "Reset link ready. Check your email and use the code on this page." };
    saveState();
    render();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim();
    const resetCode = String(formData.get("resetCode") || "").trim();
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    const user =
      resetTarget ||
      Object.values(state.clients).find((item) => item.email.toLowerCase() === email.toLowerCase()) ||
      Object.values(state.workers).find((item) => item.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      showFormError(form, "We could not find that email.");
      return;
    }
    if (!user.passwordResetCode) {
      showFormError(form, "Send the reset code first.");
      return;
    }
    if (resetCode !== user.passwordResetCode) {
      showFormError(form, "That reset code does not match.");
      return;
    }
    if (password.length < 8) {
      showFormError(form, "Please make your password at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      showFormError(form, "Your password entries do not match.");
      return;
    }

    Object.assign(user, passwordRecord(password));
    user.passwordResetCode = "";
    user.passwordResetSentAt = "";
    saveState();
    routeMeta = { loginNotice: "Password updated. Please sign in with your new password." };
    navigate("login", { loginNotice: "Password updated. Please sign in with your new password." });
  });
}

function bindClientOnboarding() {
  const form = document.querySelector("#clientOnboardingForm");
  if (!form) return;
  const stage = routeMeta.stage || (form.dataset.form === "client-register" ? "register" : form.dataset.form === "client-details" ? "details" : "verify");
  const client = getClient();

  const setEmailFromForm = (formData) => {
    const nextEmail = normalizeEmail(formData.get("email"));
    if (nextEmail && client.email !== nextEmail) {
      client.emailVerificationCode = "";
      client.emailVerificationSentAt = "";
      client.emailVerifiedAt = "";
    }
    if (nextEmail) client.email = nextEmail;
    return client;
  };

  if (stage === "register") {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const email = normalizeEmail(formData.get("email"));
      const password = String(formData.get("password") || "");
      if (!email) {
        showFormError(form, "Please add the email first.");
        return;
      }
      if (password.length < 8) {
        showFormError(form, "Please make your password at least 8 characters long.");
        return;
      }
      const existing = findUserByEmail(email);
      if (existing && accountRoleForUser(existing) !== "client") {
        showFormError(form, "That email is already used for a different account.");
        return;
      }
      if (existing && existing.emailVerifiedAt) {
        showFormError(form, "That email already has a verified account. Please sign in.");
        return;
      }
      const draft = existing || createSignupRecord("client", email, password);
      draft.email = email;
      Object.assign(draft, passwordRecord(password));
      draft.emailVerificationCode = generateVerificationCode();
      draft.emailVerificationSentAt = new Date().toISOString();
      draft.emailVerifiedAt = "";
      saveState();
      try {
        await sendVerificationEmail({ to: email, code: draft.emailVerificationCode, role: "client" });
      } catch (error) {
        showFormError(form, error.message || "We could not send the verification email.");
        return;
      }
      navigate("onboard-client", { stage: "verify", email });
    });
    return;
  }

  if (stage === "verify") {
    const sendCodeButton = document.querySelector("[data-action='send-client-email-code']");
    if (sendCodeButton) {
      sendCodeButton.addEventListener("click", async () => {
        const draft = setEmailFromForm(new FormData(form));
        if (!draft.email) {
          showFormError(form, "Please add the email first.");
          return;
        }
        draft.emailVerificationCode = generateVerificationCode();
        draft.emailVerificationSentAt = new Date().toISOString();
        draft.emailVerifiedAt = "";
        saveState();
        try {
          await sendVerificationEmail({ to: draft.email, code: draft.emailVerificationCode, role: "client" });
        } catch (error) {
          showFormError(form, error.message || "We could not send the verification email.");
          return;
        }
        render();
      });
    }

    const verifyCodeButton = document.querySelector("[data-action='verify-client-email-code']");
    if (verifyCodeButton) {
      verifyCodeButton.addEventListener("click", () => {
        const formData = new FormData(form);
        const draft = setEmailFromForm(formData);
        const code = String(formData.get("emailVerificationCode") || "").trim();
        if (!draft.emailVerificationCode) {
          showFormError(form, "Send the email code first.");
          return;
        }
        if (isEmailVerificationExpired(draft.emailVerificationSentAt)) {
          showFormError(form, "That verification code has expired. Please send a new one.");
          return;
        }
        if (code !== draft.emailVerificationCode) {
          showFormError(form, "That email code does not match.");
          return;
        }
        draft.emailVerifiedAt = new Date().toISOString();
        draft.emailVerificationCode = "";
        saveState();
        navigate("login", { loginNotice: "Account verified. Please sign in." });
      });
    }
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const services = formData.getAll("services");
    if (!services.length) {
      showFormError(form, "Please choose at least one service.");
      return;
    }
    const languagesSelected = formData.getAll("languages");
    if (!languagesSelected.length) {
      showFormError(form, "Please choose at least one language.");
      return;
    }
    const draft = setEmailFromForm(formData);
    const postalCode = sanitizeOnboardingText(formData.get("postalCode"));
    let locality = sanitizeOnboardingText(formData.get("locality"));
    if (!locality && postalCode) {
      locality = await lookupLocalityFromPostalCode(postalCode);
    }
    if (!locality) {
      showFormError(form, "Please enter a valid postal code so we can detect your locality.");
      return;
    }
    const preferredName = sanitizeOnboardingText(formData.get("name"));
    const surname = sanitizeOnboardingText(formData.get("surname"));
    if (!isValidPersonName(preferredName) || !isValidPersonName(surname)) {
      showFormError(form, "Please enter a valid name. Names can only contain letters, spaces, and hyphens (-).");
      return;
    }
    draft.name = `${preferredName} ${surname}`.trim();
    draft.phone = sanitizeOnboardingText(formData.get("phone"));
    draft.location = locality;
    draft.preferredCurrency = String(formData.get("preferredCurrency") || "CHF");
    draft.languages = normalizeLanguages(formData.getAll("languages"));
    draft.language = languageDisplay(draft.languages);
    draft.typicalServices = formData.getAll("services");
    setOnboardingComplete(draft, {
      preferredName,
      surname,
      postalCode,
      locality,
      about: sanitizeOnboardingText(formData.get("about")),
      languages: draft.languages,
      interests: draft.typicalServices,
      preferredCurrency: draft.preferredCurrency
    });
    saveState();
    const session = readSession();
    if (session?.role === "client" && session.id === draft.id) {
      navigate("client-dashboard");
    } else if (routeMeta.mode === "edit") {
      navigate("client-dashboard");
    } else {
      writeSession({ role: "client", id: draft.id });
      navigate("client-dashboard");
    }
  });
}

function bindWorkerOnboarding() {
  const form = document.querySelector("#workerOnboardingForm");
  if (!form) return;
  const stage = routeMeta.stage || (form.dataset.form === "worker-register" ? "register" : form.dataset.form === "worker-details" ? "details" : "verify");
  const photoInput = document.querySelector("#photoInput");
  const preview = document.querySelector(".photo-uploader img");
  const worker = getWorker();
  const serviceOtherCheckbox = document.querySelector("input[name='services'][value='__other__']");
  const customServiceCard = document.querySelector(".more-service-card");
  const customServiceInput = document.querySelector("textarea[name='customService']");

  const syncDraftWorker = (formData) => {
    const nextEmail = normalizeEmail(formData.get("email"));
    if (nextEmail && worker.email !== nextEmail) {
      worker.emailVerificationCode = "";
      worker.emailVerificationSentAt = "";
      worker.emailVerifiedAt = "";
    }
    if (nextEmail) worker.email = nextEmail;
    return worker;
  };

  if (stage === "register") {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const email = normalizeEmail(formData.get("email"));
      const password = String(formData.get("password") || "");
      if (!email) {
        showFormError(form, "Please add the student email first.");
        return;
      }
      if (password.length < 8) {
        showFormError(form, "Please make your password at least 8 characters long.");
        return;
      }
      const existing = findUserByEmail(email);
      if (existing && accountRoleForUser(existing) !== "worker") {
        showFormError(form, "That email is already used for a different account.");
        return;
      }
      if (existing && existing.emailVerifiedAt) {
        showFormError(form, "That email already has a verified account. Please sign in.");
        return;
      }
      const draft = existing || createSignupRecord("worker", email, password);
      draft.email = email;
      Object.assign(draft, passwordRecord(password));
      draft.emailVerificationCode = generateVerificationCode();
      draft.emailVerificationSentAt = new Date().toISOString();
      draft.emailVerifiedAt = "";
      saveState();
      try {
        await sendVerificationEmail({ to: email, code: draft.emailVerificationCode, role: "worker" });
      } catch (error) {
        showFormError(form, error.message || "We could not send the verification email.");
        return;
      }
      navigate("onboard-worker", { stage: "verify", email });
    });
    return;
  }

  if (stage === "verify") {
    const sendWorkerEmailButton = document.querySelector("[data-action='send-worker-email-code']");
    if (sendWorkerEmailButton) {
      sendWorkerEmailButton.addEventListener("click", async () => {
        const draft = syncDraftWorker(new FormData(form));
        if (!draft.email) {
          showFormError(form, "Please add the student email first.");
          return;
        }
        draft.emailVerificationCode = generateVerificationCode();
        draft.emailVerificationSentAt = new Date().toISOString();
        draft.emailVerifiedAt = "";
        saveState();
        try {
          await sendVerificationEmail({ to: draft.email, code: draft.emailVerificationCode, role: "worker" });
        } catch (error) {
          showFormError(form, error.message || "We could not send the verification email.");
          return;
        }
        render();
      });
    }

    const verifyWorkerEmailButton = document.querySelector("[data-action='verify-worker-email-code']");
    if (verifyWorkerEmailButton) {
      verifyWorkerEmailButton.addEventListener("click", () => {
        const formData = new FormData(form);
        const draft = syncDraftWorker(formData);
        const code = String(formData.get("emailVerificationCode") || "").trim();
        if (!draft.emailVerificationCode) {
          showFormError(form, "Send the student email code first.");
          return;
        }
        if (isEmailVerificationExpired(draft.emailVerificationSentAt)) {
          showFormError(form, "That verification code has expired. Please send a new one.");
          return;
        }
        if (code !== draft.emailVerificationCode) {
          showFormError(form, "That student email code does not match.");
          return;
        }
        draft.emailVerifiedAt = new Date().toISOString();
        draft.emailVerificationCode = "";
        saveState();
        navigate("login", { loginNotice: "Account verified. Please sign in." });
      });
    }
    return;
  }

  const toggleCustomServiceCard = () => {
    if (!customServiceCard) return;
    const hasOther = Boolean(serviceOtherCheckbox?.checked);
    const hasCustomValue = Boolean(String(customServiceInput?.value || "").trim());
    customServiceCard.hidden = !(hasOther || hasCustomValue);
  };

  document.querySelectorAll("input[name='services']").forEach((checkbox) => {
    checkbox.addEventListener("change", toggleCustomServiceCard);
  });
  if (customServiceInput) {
    customServiceInput.addEventListener("input", toggleCustomServiceCard);
  }
  toggleCustomServiceCard();

  if (photoInput && preview) {
    photoInput.addEventListener("change", () => {
      const file = photoInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        preview.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const languagesSelected = formData.getAll("languages");
    if (!languagesSelected.length) {
      showFormError(form, "Please choose at least one language.");
      return;
    }
    const selectedServices = formData.getAll("services");
    const customService = String(formData.get("customService") || "").trim();
    if (selectedServices.includes("__other__") && !customService) {
      showFormError(form, "Please write the service you mean by Other.");
      return;
    }

    const draft = syncDraftWorker(formData);
    const ageRange = String(formData.get("ageRange") || "");
    if (!ageRange) {
      showFormError(form, "Please choose your age range.");
      return;
    }
    const ageMap = {
      "Under 18": 17,
      "18-24": 18,
      "25-34": 25,
      "35-44": 35,
      "45-54": 45,
      "55-64": 55,
      "65+": 65
    };
    const postalCode = sanitizeOnboardingText(formData.get("postalCode"));
    let locality = sanitizeOnboardingText(formData.get("locality"));
    if (!locality && postalCode) {
      locality = await lookupLocalityFromPostalCode(postalCode);
    }
    if (!locality) {
      showFormError(form, "Please enter a valid postal code so we can detect your locality.");
      return;
    }
    if (!draft.emailVerifiedAt) {
      showFormError(form, "Please finish email verification before saving the account.");
      return;
    }
    if (!draft.services.length && !selectedServices.length) {
      showFormError(form, "Please choose at least one service or write one in More.");
      return;
    }

    const file = photoInput?.files?.[0];
    const commitWorker = (photo) => {
      draft.name = sanitizeOnboardingText(formData.get("name"));
      draft.phone = sanitizeOnboardingText(formData.get("phone"));
      draft.age = ageMap[ageRange] || 17;
      draft.location = locality;
      draft.school = sanitizeOnboardingText(formData.get("school"));
      draft.language = languageDisplay(normalizeLanguages(formData.getAll("languages")));
      draft.languages = normalizeLanguages(formData.getAll("languages"));
      draft.bio = sanitizeOnboardingText(formData.get("bio"));
      draft.services = formData
        .getAll("services")
        .filter((service) => service !== "__other__")
        .concat(
          formData
            .get("customService")
            .split(/[,\n]/)
            .map((item) => item.trim())
            .filter(Boolean)
        )
        .filter((item, index, list) => list.indexOf(item) === index);
      draft.certifications = formData
        .get("certifications")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (photo) draft.photo = photo;
      setOnboardingComplete(draft, {
        preferredName: draft.name,
        ageRange,
        postalCode,
        locality,
        languages: draft.languages,
        interests: draft.services,
        about: draft.bio
      });
      saveState();
      const session = readSession();
      if (session?.role !== "worker" || session.id !== draft.id) {
        writeSession({ role: "worker", id: draft.id });
      }
      navigate("worker-dashboard");
    };

    if (!file) {
      commitWorker();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => commitWorker(reader.result);
    reader.readAsDataURL(file);
  });
}

function showFormError(form, message) {
  const existing = form.querySelector(".form-error");
  if (existing) existing.remove();
  form.querySelectorAll(".field-error").forEach((field) => {
    field.classList.remove("field-error");
    field.removeAttribute("aria-invalid");
  });
  form.insertAdjacentHTML("afterbegin", `<div class="form-error">${escapeHtml(message)}</div>`);
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("password")) {
    const passwordFields = Array.from(form.querySelectorAll('input[name="password"], input[name="confirmPassword"]'));
    passwordFields.forEach((field) => {
      field.classList.add("field-error");
      field.setAttribute("aria-invalid", "true");
    });
    const focusTarget =
      normalized.includes("do not match")
        ? form.querySelector('input[name="confirmPassword"]') || form.querySelector('input[name="password"]')
        : form.querySelector('input[name="password"]');
    focusTarget?.focus();
    return;
  }
  const focusTarget = form.querySelector('input[name="email"], input[name="name"], input[name="surname"]') || form.querySelector("input, textarea, select");
  focusTarget?.focus();
}

function bindClientDashboard() {
  document.querySelector("#postJobForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const client = getClient();
    const payType = formData.get("payType");
    const newJob = {
      id: `j${Date.now()}`,
      clientId: client.id,
      title: formData.get("title").trim(),
      category: formData.get("category"),
      date: formData.get("date"),
      pay: Number(formData.get("pay")),
      payType,
      currency: formData.get("currency"),
      estimatedHours: payType === "Hourly" ? Number(formData.get("estimatedHours") || 1) : 1,
      negotiable: formData.get("negotiable") === "on",
      location: client.location,
      status: "Open",
      createdAt: new Date().toISOString(),
      applications: []
    };
    state.jobs.unshift(newJob);
    saveState();
    render();
  });

  document.querySelectorAll("[data-action='accept-application']").forEach((button) => {
    button.addEventListener("click", () => {
      const job = state.jobs.find((item) => item.id === button.dataset.jobId);
      const worker = getWorker(button.dataset.workerId);
      const session = readSession();
      job.status = "In Progress";
      job.acceptedWorkerId = worker.id;
      const conversation = ensureConversationForJob(job);
      job.applications = job.applications.map((application) => ({
        ...application,
        status: application.workerId === worker.id ? "Accepted" : "Not selected",
        acceptedAt: application.workerId === worker.id ? new Date().toISOString() : application.acceptedAt
      }));
      saveState();
      if (session && session.role === "client" && conversation) {
        navigate("messages", { conversationId: conversation.id, returnTo: "/client" });
        return;
      }
      render();
    });
  });

  document.querySelectorAll("[data-action='complete-job']").forEach((button) => {
    button.addEventListener("click", () => {
      const job = state.jobs.find((item) => item.id === button.dataset.jobId);
      const worker = getWorker(job.acceptedWorkerId);
      job.status = "Completed";
      job.completedAt = new Date().toISOString();
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-action='rate-worker']").forEach((button) => {
    button.addEventListener("click", () => {
      const job = state.jobs.find((item) => item.id === button.dataset.jobId);
      const worker = getWorker(button.dataset.workerId);
      const ratingPanel = button.closest(".rating-panel");
      const commentField = ratingPanel?.querySelector("textarea[name='ratingComment']");
      worker.ratings = worker.ratings || [];
      const alreadyRated = worker.ratings.some((rating) => rating.jobId === job.id && rating.clientId === job.clientId);
      if (alreadyRated) return;
      worker.ratings.push({
        jobId: job.id,
        clientId: job.clientId,
        stars: Number(button.dataset.stars),
        comment: commentField ? commentField.value.trim() : "",
        createdAt: new Date().toISOString()
      });
      job.ratingSubmitted = true;
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-action='next-time']").forEach((button) => {
    button.addEventListener("click", () => {
      const job = state.jobs.find((item) => item.id === button.dataset.jobId);
      const worker = getWorker(button.dataset.workerId);
      worker.nextTimes = worker.nextTimes || [];
      if (alreadyNextTimed(worker, job.clientId, job.id)) return;
      worker.nextTimes.unshift({
        clientId: job.clientId,
        jobId: job.id,
        createdAt: new Date().toISOString()
      });
      saveState();
      render();
    });
  });
}

function bindWorkerDashboard() {
  const searchInput = document.querySelector("#jobSearch");
  const filterInput = document.querySelector("#jobFilter");

  searchInput.addEventListener("input", (event) => {
    helperSearch = event.target.value;
    render();
    const nextSearch = document.querySelector("#jobSearch");
    if (nextSearch) {
      nextSearch.focus();
      nextSearch.setSelectionRange(helperSearch.length, helperSearch.length);
    }
  });

  filterInput.addEventListener("change", (event) => {
    helperFilter = event.target.value;
    render();
  });

  document.querySelectorAll("[data-action='apply-job']").forEach((button) => {
    button.addEventListener("click", () => {
      const job = state.jobs.find((item) => item.id === button.dataset.jobId);
      const worker = getWorker();
      const alreadyApplied = job.applications.some((application) => application.workerId === worker.id);
      if (alreadyApplied) return;
      if (sameDayConflict(worker.id, job)) {
        helperNotice = "You already have an application or accepted job on that date.";
        render();
        return;
      }

      helperNotice = "";
      job.applications.push({
        workerId: worker.id,
        amount: job.pay,
        currency: job.currency,
        payType: job.payType,
        status: "Applied",
        appliedAt: new Date().toISOString()
      });
      saveState();
      render();
    });
  });
}

function bindMessagesView() {
  const session = readSession();
  if (!session) return;

  const form = document.querySelector("#messageForm");
  const conversationId = form?.dataset.conversationId || routeMeta.conversationId || "";
  if (conversationId && markConversationRead(conversationId)) {
    render();
    return;
  }
  if (!form) return;

  const textarea = form.querySelector("textarea[name='message']");
  if (!textarea) return;

  textarea.addEventListener("input", () => {
    messageDrafts[conversationId] = textarea.value;
  });

  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (messageSendBusy) return;
    const content = textarea.value.trim();
    if (!content) {
      messageSendError = "Write a message first.";
      render();
      return;
    }

    const conversation = getConversationById(conversationId);
    if (!conversation) {
      messageSendError = "That conversation is not available.";
      render();
      return;
    }

    const allowed =
      (session.role === "client" && conversation.clientId === session.id) ||
      (session.role === "worker" && conversation.workerId === session.id);
    if (!allowed) {
      messageSendError = "You can only message in your own accepted job threads.";
      render();
      return;
    }

    messageSendBusy = true;
    messageSendError = "";
    render();

    const now = new Date().toISOString();
    state.messages.push({
      id: `msg_${Date.now()}_${hashString(content).slice(0, 8)}`,
      conversationId,
      senderId: session.id,
      senderRole: session.role,
      content,
      createdAt: now
    });
    conversation.updatedAt = now;
    if (session.role === "client") conversation.clientLastReadAt = now;
    if (session.role === "worker") conversation.workerLastReadAt = now;
    messageDrafts[conversationId] = "";

    try {
      await saveState();
      messageSendBusy = false;
      render();
    } catch {
      messageSendBusy = false;
      messageSendError = "We could not send that message right now.";
      render();
    }
  });
}

async function bootstrap() {
  state = (await loadState()) || createDefaultState();
  applyRouteFromLocation(true);
  const session = readSession();
  if (view === "messages" && !session) {
    // keep the deep-link page visible without exposing chat data
  } else if (session) {
    const role = session.role || "client";
    const target = session.id;
    if (role === "client" && state.clients[target]) {
      state.selectedClientId = target;
      if (view === "landing" || view === "login" || view === "create-account" || view === "settings") {
        view = "client-dashboard";
      }
    } else if (role === "worker" && state.workers[target]) {
      state.selectedWorkerId = target;
      if (view === "landing" || view === "login" || view === "create-account" || view === "settings") {
        view = "worker-dashboard";
      }
    } else {
      clearSession();
      if (view !== "messages") view = "login";
    }
  } else {
    if (view !== "messages") {
      view = "landing";
    }
  }

  window.addEventListener("popstate", () => {
    applyRouteFromLocation(false);
    render();
  });

  render();
}

bootstrap();
function enhanceSignupFields() {
  const signupForms = document.querySelectorAll('[data-form="client-details"], [data-form="worker-details"]');
  signupForms.forEach((form) => {
    if (form.dataset.signupEnhanced === "true") return;
    form.dataset.signupEnhanced = "true";

    const nameField = form.querySelector('input[name="name"]');
    const nameValue = String(nameField?.value || "").trim();
    const isEditing = routeMeta?.mode === "edit";
    if (nameField && !isEditing) {
      if (!nameValue || nameValue === "Jordan Taylor") {
        nameField.value = "";
      }
      nameField.placeholder = "Jordan Taylor";
      nameField.autocomplete = "name";
    }

    const passwordFields = form.querySelectorAll('input[type="password"]');
    passwordFields.forEach((field) => {
      if (field.parentElement?.classList.contains("password-field")) return;
      const wrapper = document.createElement("div");
      wrapper.className = "password-field";
      field.parentNode.insertBefore(wrapper, field);
      wrapper.appendChild(field);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "password-toggle";
      button.setAttribute("aria-label", "Show password");
      button.setAttribute("aria-pressed", "false");
      button.innerHTML = `${icon("eye")}`;
      wrapper.appendChild(button);
    });
  });
}

function bindSignupEnhancements() {
  enhanceSignupFields();

  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (!form.matches('[data-form="client-details"], [data-form="worker-details"]')) return;
      const nameField = form.querySelector('input[name="name"]');
      const name = String(nameField?.value || "").trim();
      if (!nameField || !isValidPersonName(name)) {
        event.preventDefault();
        event.stopPropagation();
        if (nameField) {
          nameField.classList.add("field-error");
          nameField.setAttribute("aria-invalid", "true");
        }
        showFormError(form, "Please enter a valid name. Names can only contain letters, spaces, and hyphens (-).");
      }
    },
    true,
  );

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name !== "name") return;
    if (target.closest('[data-form="client-details"], [data-form="worker-details"]')) {
      target.classList.remove("field-error");
      target.removeAttribute("aria-invalid");
    }
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-password-toggle]");
    if (!button) return;
    const fieldId = button.getAttribute("data-password-toggle");
    const input = fieldId ? document.getElementById(fieldId) : null;
    if (!(input instanceof HTMLInputElement)) return;
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    button.setAttribute("aria-pressed", String(!visible));
    button.setAttribute("aria-label", visible ? "Show password" : "Hide password");
    button.innerHTML = visible ? `${icon("eye")}` : `${icon("eye-off")}`;
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindSignupEnhancements, { once: true });
} else {
  bindSignupEnhancements();
}
