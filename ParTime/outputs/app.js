const STORAGE_KEY = "partime-marketplace-state-v2";
const TODAY = "2026-07-04";

const categories = [
  "Lawn Care",
  "Pet Sitting",
  "Tutoring",
  "Errands",
  "Tech Help",
  "Snow Help",
  "Babysitting"
];

const currencies = [
  { code: "USD", label: "USD - US Dollar" },
  { code: "EUR", label: "EUR - Euro" },
  { code: "GBP", label: "GBP - Pound" },
  { code: "CHF", label: "CHF - Swiss Franc" },
  { code: "CAD", label: "CAD - Canadian Dollar" },
  { code: "AUD", label: "AUD - Australian Dollar" }
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
  const parents = candidate.parents ? Object.keys(candidate.parents).length : 0;
  return jobs + clients + workers + parents;
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

function isValidPersonName(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  return /^[\p{L}]+(?:[ -][\p{L}]+)*$/u.test(normalized);
}

function passwordFieldMarkup(name, label, autocomplete = "new-password") {
  const fieldId = `field-${name}`;
  return `
    <label class="field" for="${fieldId}">
      <span>${escapeHtml(label)}</span>
      <div class="password-field">
        <input id="${fieldId}" type="password" name="${escapeHtml(name)}" autocomplete="${escapeHtml(autocomplete)}" required />
        <button
          type="button"
          class="password-toggle"
          data-password-toggle="${escapeHtml(fieldId)}"
          aria-controls="${fieldId}"
          aria-pressed="false"
          aria-label="Show password"
        >
          ${icon("eye")}
        </button>
      </div>
    </label>
  `;
}

function clearFieldErrors(form) {
  form.querySelectorAll(".field-error").forEach((field) => {
    field.classList.remove("field-error");
    field.removeAttribute("aria-invalid");
  });
}

function addFieldError(form, fieldName) {
  if (!fieldName) return;
  const fields = Array.from(form.querySelectorAll(`[name="${CSS.escape(fieldName)}"]`));
  fields.forEach((field) => {
    field.classList.add("field-error");
    field.setAttribute("aria-invalid", "true");
  });
}

function sanitizeOnboardingText(value) {
  return String(value || "").trim();
}

function findUserByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  return (
    Object.values(state.clients).find((item) => item.email.toLowerCase() === normalized) ||
    Object.values(state.workers).find((item) => item.email.toLowerCase() === normalized) ||
    Object.values(state.parents).find((item) => item.email.toLowerCase() === normalized) ||
    null
  );
}

function onboardingInfo(user) {
  return user?.uiPreferences?.onboarding || {};
}

function onboardingCompleted(user) {
  return Boolean(user?.uiPreferences?.onboardingCompletedAt);
}

function isEmailVerificationExpired(sentAt) {
  if (!sentAt) return false;
  const sentTime = Date.parse(sentAt);
  if (!Number.isFinite(sentTime)) return false;
  return Date.now() - sentTime > ONBOARDING_EXPIRES_IN_MS;
}

function userDisplayName(user) {
  const info = onboardingInfo(user);
  return info.preferredName || user?.name || user?.email || "";
}

function userLocation(user) {
  const info = onboardingInfo(user);
  return info.locality || user?.location || "";
}

function userPostalCode(user) {
  return onboardingInfo(user).postalCode || "";
}

function ageRangeToNumericAge(range) {
  const value = String(range || "").trim();
  if (value === "Under 18") return 17;
  if (value === "18-24") return 21;
  if (value === "25-34") return 29;
  if (value === "35-44") return 39;
  if (value === "45-54") return 49;
  if (value === "55-64") return 59;
  if (value === "65+") return 65;
  return 17;
}

function ageRangeForWorker(age) {
  const numericAge = Number(age || 0);
  if (!numericAge || numericAge <= 18) return "Under 18";
  if (numericAge <= 24) return "18-24";
  if (numericAge <= 34) return "25-34";
  if (numericAge <= 44) return "35-44";
  if (numericAge <= 54) return "45-54";
  if (numericAge <= 64) return "55-64";
  return "65+";
}

function workerAgeLabel(worker) {
  return worker?.ageRange || ageRangeForWorker(worker?.age);
}

function userInterests(user) {
  const info = onboardingInfo(user);
  return Array.isArray(info.interests) ? info.interests : [];
}

function createSignupRecord(role, email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
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
    ...passwordRecord(password),
    uiPreferences: {}
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
    return state.workers[id];
  }

  state.clients[id] = {
    ...record,
    name: "",
    typicalServices: [],
    preferredCurrency: "CHF"
  };
  return state.clients[id];
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
      subject:
        role === "worker"
          ? "Verify your ParTime student account"
          : role === "parent"
            ? "Verify your ParTime parent account"
            : "Verify your ParTime account",
      label: role === "worker" ? "student" : role === "parent" ? "parent" : "client"
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.sent === false) {
    throw new Error(payload.error || "We could not send the verification email.");
  }
  return payload;
}

function normalizedPostalLookup(parts) {
  return parts.map((part) => String(part || "").trim()).find(Boolean) || "";
}

async function lookupLocalityFromPostalCode(postalCode) {
  const normalized = String(postalCode || "").trim();
  if (!normalized) return "";
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&postalcode=${encodeURIComponent(normalized)}&countrycodes=ch&addressdetails=1&limit=1`, {
    headers: {
      Accept: "application/json"
    }
  });
  if (!response.ok) return "";
  const results = await response.json().catch(() => []);
  const first = Array.isArray(results) ? results[0] : null;
  const address = first?.address || {};
  return normalizedPostalLookup([
    address.village,
    address.town,
    address.city,
    address.municipality,
    address.hamlet,
    address.suburb,
    address.county
  ]);
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

function requiresOnboarding(user) {
  if (!user) return false;
  if (onboardingCompleted(user)) return false;
  if (user.role === "worker") {
    return !user.name || !user.location || !user.age || !user.school;
  }
  return !user.name || !user.location;
}

function accountNeedsVerification(user) {
  return Boolean(user && !user.emailVerifiedAt);
}

function nameValueOrPlaceholder(value) {
  return String(value || "");
}

function autoParentIdForEmail(email) {
  return `parent_${hashString(String(email || "").toLowerCase().trim())}`;
}

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getSessionUser() {
  const session = readSession();
  if (!session) return null;
  if (session.role === "worker") return state.workers[session.id] || null;
  if (session.role === "parent") return state.parents[session.id] || null;
  return state.clients[session.id] || null;
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
    selectedParentId: "",
    clients: {},
    workers: {},
    parents: {},
    jobs: [],
    parentEvents: [],
    conversations: [],
    messages: [],
    appReviews: []
  };
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chosenState));
    } catch {
      // ignore
    }
    return chosenState;
  }

  return createDefaultState();
}

async function saveState() {
  state.updatedAt = new Date().toISOString();
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

function formatMoney(value, currency = "USD") {
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

function getParent(id = state.selectedParentId) {
  return state.parents[id];
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
    const currency = job.currency || "USD";
    totals[currency] = (totals[currency] || 0) + jobTotal(job);
    return totals;
  }, {});
}

function formatTotals(totals) {
  const entries = Object.entries(totals);
  if (!entries.length) return formatMoney(0, "USD");
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

function currencyOptions(selected = "USD") {
  return currencies
    .map(
      ({ code, label }) =>
        `<option value="${escapeHtml(code)}" ${code === selected ? "selected" : ""}>${escapeHtml(label)}</option>`
    )
    .join("");
}

function languageOptions(selected = "English") {
  const selectedValues = Array.isArray(selected)
    ? selected.map((value) => String(value || "").trim()).filter(Boolean)
    : String(selected || "")
        .split(",")
        .map((value) => String(value || "").trim())
        .filter(Boolean);
  return [`<option value="">Choose a language</option>`]
    .concat(
      languages.map(
        (language) =>
          `<option value="${escapeHtml(language)}" ${selectedValues.includes(language) ? "selected" : ""}>${escapeHtml(language)}</option>`
      )
    )
    .join("");
}

function serviceCheckboxes(selectedServices = []) {
  return categories
    .map(
      (category) => `
        <label class="check-tile">
          <input type="checkbox" name="services" value="${escapeHtml(category)}" ${
            selectedServices.includes(category) ? "checked" : ""
          } />
          <span>${escapeHtml(category)}</span>
        </label>
      `
    )
    .join("");
}

function customServicesValue(selectedServices = []) {
  return selectedServices.filter((service) => !categories.includes(service)).join(", ");
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
  return state.jobs
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
            createdAt: application.appliedAt || job.createdAt
          };
        })
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function buildWorkerNotifications(worker) {
  const acceptedItems = state.jobs
    .filter((job) => job.acceptedWorkerId === worker.id)
    .map((job) => {
      const client = getClient(job.clientId);
      const acceptedApplication = (job.applications || []).find((application) => application.workerId === worker.id && application.status === "Accepted");
      return {
        id: `worker-accepted-${job.id}`,
        title: `Accepted for ${job.title}`,
        detail: `${client ? client.name : "A client"} approved your request`,
        createdAt: acceptedApplication?.acceptedAt || job.completedAt || job.createdAt
      };
    });

  const nextTimedItems = (worker.nextTimes || []).map((item) => {
    const client = getClient(item.clientId);
    const job = state.jobs.find((entry) => entry.id === item.jobId);
    return {
      id: `worker-next-${item.jobId}-${item.clientId}-${item.createdAt}`,
      title: `Next timed by ${client ? client.name : "a client"}`,
      detail: job ? job.title : "Requested follow-up",
      createdAt: item.createdAt
    };
  });

  const ratingItems = (worker.ratings || []).map((rating) => ({
    id: `worker-rating-${rating.jobId}-${rating.clientId}-${rating.createdAt}`,
    title: `New ${starsText(rating.stars)} rating`,
    detail: rating.comment ? rating.comment : "No comment was left",
    createdAt: rating.createdAt
  }));

  return [...acceptedItems, ...nextTimedItems, ...ratingItems].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function renderNotificationPanel(title, items, emptyMessage) {
  return `
    <section class="notification-panel">
      <div class="panel-heading">
        <h2>${escapeHtml(title)}</h2>
        <span class="pill">${items.length} updates</span>
      </div>
      <div class="notification-list">
        ${
          items.length
            ? items
                .slice(0, 6)
                .map(
                  (item) => `
                    <article class="notification-item">
                      <strong>${escapeHtml(item.title)}</strong>
                      <span>${escapeHtml(item.detail)}</span>
                      <small>${escapeHtml(formatNotificationTime(item.createdAt))}</small>
                    </article>
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

function matchWorkers(job) {
  return Object.values(state.workers)
    .filter((worker) => worker.parentConfirmed && Number(worker.age) < 18)
    .map((worker) => {
      const serviceMatch = worker.services.includes(job.category) ? 70 : 0;
      const locationMatch = worker.location === job.location ? 20 : 8;
      const certificationMatch = worker.certifications.length ? 5 : 0;
      return {
        worker,
        score: serviceMatch + locationMatch + certificationMatch
      };
    })
    .filter((match) => match.score >= 70)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function addParentEvent(workerId, type, message) {
  state.parentEvents.unshift({
    id: `e${Date.now()}`,
    workerId,
    type,
    message,
    createdAt: new Date().toISOString()
  });
}

function displayNameFromEmail(email) {
  const localPart = String(email || "")
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .trim();
  if (!localPart) return "Parent";
  return `Parent ${localPart
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")}`;
}

function createAutoParentAccount(worker) {
  const email = String(worker.parentEmail || "").toLowerCase().trim();
  if (!email) return null;
  const existing = Object.values(state.parents).find((parent) => parent.email.toLowerCase() === email);
  const parent = existing || {
    id: autoParentIdForEmail(email),
    name: displayNameFromEmail(email),
    email,
    linkedWorkerId: worker.id,
    emailVerificationCode: "",
    emailVerificationSentAt: "",
    emailVerifiedAt: ""
  };
  parent.name = parent.name || displayNameFromEmail(email);
  parent.email = email;
  parent.linkedWorkerId = worker.id;
  parent.emailVerifiedAt = worker.parentVerifiedAt || parent.emailVerifiedAt || new Date().toISOString();
  parent.emailVerificationCode = "";
  parent.emailVerificationSentAt = "";
  state.parents[parent.id] = parent;
  state.selectedParentId = parent.id;
  return parent;
}

function navigate(nextView, meta = {}) {
  view = nextView;
  routeMeta = meta;
  logoMenuOpen = false;
  clientNotificationsOpen = false;
  workerNotificationsOpen = false;
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
          <span><strong>Age</strong>${escapeHtml(workerAgeLabel(worker))}</span>
          <span><strong>School</strong>${escapeHtml(worker.school)}</span>
          <span><strong>Location</strong>${escapeHtml(worker.location)}</span>
          <span><strong>Language</strong>${escapeHtml(worker.language)}</span>
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
            <button class="logo-menu-item" type="button" data-view="review">Review</button>
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
        <button class="ghost small" data-action="open-client-profile">Client profile</button>
        <button class="ghost small" data-action="open-worker-profile">Student profile</button>
        ${session ? `<button class="nav-link logout-link" data-action="logout">Log out</button>` : ""}
      </div>
    </header>
  `;
}

function renderView() {
  if (view === "login") return renderLogin();
  if (view === "create-account") return renderCreateAccount();
  if (view === "onboard-client") return renderClientOnboarding();
  if (view === "onboard-worker") return renderWorkerOnboarding();
  if (view === "client-dashboard") return renderClientDashboard();
  if (view === "worker-dashboard") return renderWorkerDashboard();
  if (view === "parent-monitor") return renderParentMonitor();
  if (view === "settings") return renderSettings();
  if (view === "review") return renderReviewPage();
  return renderLanding();
}

function appReviewsForDisplay(limit = 3) {
  const reviews = Array.isArray(state.appReviews) ? state.appReviews : []
    .sort((a, b) => {
      const starsDiff = (Number(b.stars) || 0) - (Number(a.stars) || 0);
      if (starsDiff !== 0) return starsDiff;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  const seen = new Set();
  return reviews
    .filter((review) => {
      const key = review.id || `${review.name}-${review.comment}-${review.createdAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function renderAppReviewCard(review) {
  const stars = Math.max(1, Math.min(5, Number(review.stars) || 5));
  return `
    <article class="review-card">
      <div class="review-stars" aria-label="${stars} star rating">${"★".repeat(stars)}${"☆".repeat(5 - stars)}</div>
      <p>“${escapeHtml(review.comment || "No comment left.")}”</p>
      <strong>${escapeHtml(review.name || "Anonymous")}${review.role ? `, ${escapeHtml(review.role)}` : ""}</strong>
    </article>
  `;
}

function renderReviewPage() {
  const session = readSession();
  const user = getSessionUser();
  const lockedOut = !session || !user;
  const starsOptions = [1, 2, 3, 4, 5].map((value) => `<option value="${value}">${"★".repeat(value)}</option>`).join("");

  return `
    <section class="auth-layout auth-layout--single">
      <div class="auth-panel">
        <p class="eyebrow">Review</p>
        <h1>Leave a review</h1>
        <p class="muted">Pick a star rating and add a short comment if you want.</p>
        ${lockedOut
          ? `
            <div class="panel">
              Sign in first so your review is tied to your account.
            </div>
          `
          : `
            <form class="stack-form review-form" id="reviewForm">
              <label>
                <span>Star rating</span>
                <select name="stars" required>
                  ${starsOptions}
                </select>
              </label>
              <label>
                <span>Comment</span>
                <textarea name="comment" rows="5" maxlength="500" placeholder="Optional comment about the experience"></textarea>
              </label>
              <button class="primary full" type="submit">Save review</button>
              <button class="text-link" type="button" data-view="landing">Back</button>
            </form>
          `
        }
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
        <p class="muted">Quick controls for the app look and account access.</p>
      </div>
      <div class="settings-grid">
        <article class="panel">
          <div class="panel-heading">
            <h2>Interface</h2>
            <span class="pill">Visual</span>
          </div>
          <p class="muted">This area is where the app-wide display preferences live.</p>
        </article>
        <article class="panel">
          <div class="panel-heading">
            <h2>Account</h2>
            <span class="pill">Access</span>
          </div>
          <p class="muted">Use the menu above to switch back home, sign in, or sign out.</p>
        </article>
      </div>
      <div class="action-row">
        <button class="primary" data-view="landing">Home page</button>
        <button class="secondary" data-view="login">Sign in</button>
      </div>
    </section>
  `;
}

function renderLanding() {
  return `
    <section class="hero-band">
      <div class="hero-copy">
        <p class="eyebrow">Parent-aware part-time help</p>
        <h1>ParTime</h1>
        <p class="lede">
          A local marketplace where clients post trusted part-time jobs and students 18 and under can apply with parent visibility built in.
        </p>
        <div class="action-row">
          <button class="primary" data-view="login">Sign in</button>
          <button class="secondary" data-view="create-account">Create account</button>
        </div>
        <div class="trust-row" aria-label="Marketplace trust notes">
          <span>Parent confirmation</span>
          <span>Fixed or hourly pay</span>
          <span>Read-only safety view</span>
        </div>
      </div>
      <figure class="hero-visual">
        <img src="assets/partime-hero.png" alt="ParTime dashboard preview with job cards, student profiles, ratings, and parent updates" />
      </figure>
    </section>

    <section class="section-band">
      <div class="section-heading">
        <p class="eyebrow">How it works</p>
        <h2>Simple flows for every account type</h2>
      </div>
      <div class="step-story">
        <article class="step-row">
          <div class="step-visual step-visual--job" aria-hidden="true">
            <div class="visual-card">
              <div class="visual-card__top">
                <span class="visual-badge visual-badge--green">Post a job</span>
                <span class="visual-chip">Public feed</span>
              </div>
              <div class="visual-line visual-line--wide"></div>
              <div class="visual-line"></div>
              <div class="visual-grid">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
          <div class="step-copy">
            <span class="number">1</span>
            <h3>Clients post jobs</h3>
            <p>Clients choose a title, category, date, pay type, amount, and currency. The job appears in the live student feed right away.</p>
          </div>
        </article>
        <article class="step-row step-row--reverse">
          <div class="step-visual step-visual--apply" aria-hidden="true">
            <div class="visual-card visual-card--feed">
              <div class="feed-card-mini">
                <strong>Lawn Care</strong>
                <span>Apply today</span>
              </div>
              <div class="feed-card-mini feed-card-mini--accent">
                <strong>Pet Sitting</strong>
                <span class="pill tiny">Apply</span>
              </div>
              <div class="feed-card-mini">
                <strong>Tutoring</strong>
                <span>Next available</span>
              </div>
            </div>
          </div>
          <div class="step-copy">
            <span class="number">2</span>
            <h3>Students apply</h3>
            <p>Students filter nearby jobs, apply when dates do not overlap, and keep a running view of applications and completed earnings.</p>
          </div>
        </article>
        <article class="step-row">
          <div class="step-visual step-visual--parent" aria-hidden="true">
            <div class="visual-card visual-card--monitor">
              <div class="monitor-top">
                <span class="bell-dot"></span>
                <span>Parent view</span>
              </div>
              <div class="monitor-line monitor-line--active"></div>
              <div class="monitor-line"></div>
              <div class="monitor-line monitor-line--thin"></div>
            </div>
          </div>
          <div class="step-copy">
            <span class="number">3</span>
            <h3>Parents monitor</h3>
            <p>A linked parent account sees applications, work in progress, completion history, and safety email updates.</p>
          </div>
        </article>
      </div>

      <div class="section-heading section-heading--spaced">
        <p class="eyebrow">Reviews</p>
        <h2>What people say about ParTime</h2>
      </div>
      <div class="review-grid">
        ${appReviewsForDisplay().map(renderAppReviewCard).join("")}
      </div>
    </section>

  `;
}

function renderLogin() {
  const notice = routeMeta.loginNotice || helperNotice;
  return `
    <section class="auth-layout">
      <div class="auth-panel">
        <p class="eyebrow">Secure access</p>
        <h1>Sign in</h1>
        <p class="muted">Use the same sign-in screen for every account.</p>
        ${notice ? `<div class="notice-banner">${escapeHtml(notice)}</div>` : ""}
        <form class="stack-form" id="loginForm">
          <label>
            <span>Email</span>
            <input type="email" name="email" placeholder="name@example.com" required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" name="password" placeholder="Enter your password" required />
          </label>
          <button class="primary full" type="submit">Submit</button>
        </form>
        <button class="text-link" data-view="create-account">Create an account</button>
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
        <p class="muted">Choose the type of account you want to create.</p>
        <div class="account-choices account-choices--stackable">
          <button class="account-card account-card--client" data-view="onboard-client" data-stage="register" type="button">
            <span class="account-card-label">Client account</span>
            <strong>Create a client profile</strong>
            <small>Post jobs, review helpers, and manage payments.</small>
          </button>
          <button class="account-card account-card--worker" data-view="onboard-worker" data-stage="register" type="button">
            <span class="account-card-label">Student account</span>
            <strong>Create a worker profile</strong>
            <small>Verify email, add parent access, and start applying.</small>
          </button>
        </div>
      </div>
    </section>
  `;
}

function renderClientOnboarding() {
  const stage = routeMeta.stage || "register";
  if (stage === "details") return renderClientDetailsForm();
  if (stage === "verify") return renderClientVerificationScreen();
  return renderClientRegistrationScreen();
}

function renderClientRegistrationScreen() {
  return `
    <section class="form-page">
      <div class="section-heading">
        <p class="eyebrow">Client sign up</p>
        <h1>Create your client account</h1>
      </div>
      <div class="verification-layout verification-layout--vertical">
        <form class="profile-form" id="clientOnboardingForm">
          <div class="verification-card">
            <h3>Account details</h3>
            <p>Enter your email and password, then submit to receive your verification code.</p>
            <label>
              <span>Email address</span>
              <input type="email" name="email" placeholder="name@example.com" required />
            </label>
            ${passwordFieldMarkup("password", "Create password")}
          </div>
          <div class="form-actions onboarding-actions">
            <button class="primary" type="submit">Submit</button>
            <button class="text-link" type="button" data-view="create-account">Back</button>
          </div>
        </form>
      </div>
    </section>
  `;
}

function renderClientVerificationScreen() {
  const client = getClient();
  const verificationCode = client.emailVerificationCode || "";
  const verificationSent = Boolean(client.emailVerificationSentAt);
  const verified = Boolean(client.emailVerifiedAt);

  return `
    <section class="form-page">
      <div class="section-heading">
        <p class="eyebrow">Client sign up</p>
        <h1>Verify your email first</h1>
      </div>
      <div class="verification-layout verification-layout--vertical">
        <form class="profile-form" id="clientOnboardingForm">
          <div class="verification-card">
            <h3>Email verification</h3>
            <p>A verification code has been sent to your email address. Please enter the code below to verify your account.</p>
            <label>
              <span>Verification code</span>
              <input
                type="text"
                name="emailVerificationCode"
                inputmode="numeric"
                maxlength="8"
                value="${escapeHtml(verificationCode)}"
                placeholder="Enter the 8 digit code"
                ${verificationSent ? "required" : ""}
              />
            </label>
            <div class="verification-status ${verified ? "is-confirmed" : ""}">
              ${verified ? "Email verified. Please sign in." : verificationSent ? "Code sent. Enter it to continue." : "No code sent yet."}
            </div>
          </div>
          <div class="form-actions onboarding-actions">
            <button class="secondary small" type="button" data-action="send-client-email-code">
              ${verificationSent ? "Resend code" : "Send code"}
            </button>
            <button class="ghost small" type="button" data-action="verify-client-email-code" ${verificationSent ? "" : "disabled"}>
              Verify code
            </button>
          </div>
        </form>
      </div>
    </section>
  `;
}

function renderClientDetailsForm() {
  const client = getClient();
  const onboarding = onboardingInfo(client);
  const nameFieldValue = onboardingCompleted(client) ? (onboarding.preferredName || client.name || "") : "";
  return `
    <section class="form-page">
      <div class="section-heading">
        <p class="eyebrow">Client sign up</p>
        <h1>Set up your profile</h1>
      </div>
      <form class="profile-form" id="clientOnboardingForm">
          <div class="form-grid onboarding-grid">
            <label>
              <span>What name would you like us to call you?</span>
              <input type="text" name="name" value="${escapeHtml(nameFieldValue)}" placeholder="Jordan Taylor" required />
            </label>
          <label>
            <span>Email address</span>
            <input type="email" value="${escapeHtml(client.email)}" readonly />
          </label>
          <label>
            <span>Phone number</span>
            <input type="tel" name="phone" value="${escapeHtml(client.phone || "")}" placeholder="Optional" />
          </label>
          <label>
            <span>Postal code</span>
            <input type="text" name="postalCode" value="${escapeHtml(onboarding.postalCode || userPostalCode(client))}" placeholder="8092" required />
          </label>
          <label>
            <span>Locality</span>
            <input type="text" name="location" value="${escapeHtml(onboarding.locality || client.location)}" placeholder="Zurich" required />
          </label>
          <label>
            <span>What languages do you speak?</span>
            <select name="language" multiple size="4" required>${languageOptions(onboarding.languages || client.language)}</select>
          </label>
          <label>
            <span>Preferred currency</span>
            <select name="preferredCurrency" required>${currencyOptions(client.preferredCurrency || "CHF")}</select>
          </label>
          <label>
            <span>About you</span>
            <textarea name="about" rows="4" placeholder="Tell people a little about yourself">${escapeHtml(onboarding.about || "")}</textarea>
          </label>
        </div>
        <fieldset>
          <legend>Services you are interested in</legend>
          <div class="check-grid">${serviceCheckboxes(client.typicalServices)}</div>
        </fieldset>
        <div class="form-actions">
          <button class="primary" type="submit">Finish setup</button>
        </div>
      </form>
    </section>
  `;
}

function renderWorkerOnboarding() {
  const stage = routeMeta.stage || "register";
  if (stage === "details") return renderWorkerDetailsForm();
  if (stage === "verify") return renderWorkerVerificationScreen();
  return renderWorkerRegistrationScreen();
}

function renderWorkerRegistrationScreen() {
  return `
    <section class="form-page">
      <div class="section-heading">
        <p class="eyebrow">Student sign up</p>
        <h1>Create your student account</h1>
      </div>
      <div class="verification-layout verification-layout--vertical">
        <form class="profile-form" id="workerOnboardingForm">
          <div class="verification-card">
            <h3>Account details</h3>
            <p>Enter your email and password, then submit to receive your verification code.</p>
            <label>
              <span>Email address</span>
              <input type="email" name="email" placeholder="name@example.com" required />
            </label>
            ${passwordFieldMarkup("password", "Create password")}
          </div>
          <div class="form-actions onboarding-actions">
            <button class="primary" type="submit">Submit</button>
            <button class="text-link" type="button" data-view="create-account">Back</button>
          </div>
        </form>
      </div>
    </section>
  `;
}

function renderWorkerVerificationScreen() {
  const worker = getWorker();
  const emailVerificationCode = worker.emailVerificationCode || "";
  const emailVerificationSent = Boolean(worker.emailVerificationSentAt);
  const allVerified = Boolean(worker.emailVerifiedAt);

  return `
    <section class="form-page">
      <div class="section-heading">
        <p class="eyebrow">Student sign up</p>
        <h1>Verify your student email first</h1>
      </div>
      <div class="verification-layout verification-layout--vertical">
        <form class="profile-form" id="workerOnboardingForm">
          <div class="verification-card">
            <h3>Student email verification</h3>
            <p>A verification code has been sent to your email address. Please enter the code below to verify your account.</p>
            <label>
              <span>Verification code</span>
              <input
                type="text"
                name="emailVerificationCode"
                inputmode="numeric"
                maxlength="8"
                value="${escapeHtml(emailVerificationCode)}"
                placeholder="Enter the 8 digit code"
                ${emailVerificationSent ? "required" : ""}
              />
            </label>
            <div class="verification-status ${worker.emailVerifiedAt ? "is-confirmed" : ""}">
              ${worker.emailVerifiedAt ? "Email verified. Please sign in." : emailVerificationSent ? "Code sent. Enter it to continue." : "No code sent yet."}
            </div>
          </div>

          <div class="form-actions onboarding-actions">
            <button class="secondary small" type="button" data-action="send-worker-email-code">
              ${emailVerificationSent ? "Resend code" : "Send code"}
            </button>
            <button class="ghost small" type="button" data-action="verify-worker-email-code" ${emailVerificationSent ? "" : "disabled"}>
              Verify student email
            </button>
          </div>
        </form>
      </div>
    </section>
  `;
}

function renderWorkerDetailsForm() {
  const worker = getWorker();
  const onboarding = onboardingInfo(worker);
  const nameFieldValue = onboardingCompleted(worker) ? (onboarding.preferredName || worker.name || "") : "";
  return `
    <section class="form-page">
      <div class="section-heading">
        <p class="eyebrow">Student sign up</p>
        <h1>Set up your student profile</h1>
      </div>
      <form class="profile-form" id="workerOnboardingForm">
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
              <span>What name would you like us to call you?</span>
              <input type="text" name="name" value="${escapeHtml(nameFieldValue)}" placeholder="Jordan Taylor" required />
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
              <span>Age range</span>
              <select name="ageRange" required>
                ${AGE_RANGE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}" ${((onboarding.ageRange || ageRangeForWorker(worker.age)) === option.value) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
              </select>
            </label>
            <label>
              <span>Postal code</span>
              <input type="text" name="postalCode" value="${escapeHtml(onboarding.postalCode || userPostalCode(worker))}" placeholder="8092" required />
            </label>
            <label>
              <span>Locality</span>
              <input type="text" name="location" value="${escapeHtml(onboarding.locality || worker.location)}" placeholder="Zurich" required />
            </label>
            <label>
              <span>School</span>
              <input type="text" name="school" value="${escapeHtml(worker.school)}" required />
            </label>
            <label>
              <span>What languages do you speak?</span>
              <select name="language" multiple size="4" required>${languageOptions(onboarding.languages || worker.language)}</select>
            </label>
          </div>
        </div>
        <label>
          <span>Parent email</span>
          <input type="email" name="parentEmail" value="${escapeHtml(worker.parentEmail)}" required />
        </label>
        <div class="verification-card ${worker.emailVerifiedAt ? "" : "is-disabled"}">
          <h3>Parent verification</h3>
          <p>We will send an 8 digit code to the parent email once the student email is verified.</p>
          <div class="verification-row">
            <button class="secondary small" type="button" data-action="send-parent-code" ${worker.emailVerifiedAt ? "" : "disabled"}>
              ${worker.parentVerificationSentAt ? "Resend code" : "Send code"}
            </button>
            <span class="verification-email">${escapeHtml(worker.parentEmail || "Parent email needed first")}</span>
          </div>
          <label>
            <span>Parent verification code</span>
            <input
              type="text"
              name="parentVerificationCode"
              inputmode="numeric"
              maxlength="8"
              placeholder="Enter the 8 digit code"
              ${worker.parentVerificationSentAt ? "required" : ""}
            />
          </label>
          <div class="verification-status ${worker.parentConfirmed ? "is-confirmed" : ""}">
            ${worker.parentConfirmed ? "Parent verified." : worker.parentVerificationSentAt ? "Code sent. Enter it to continue." : "No code sent yet."}
          </div>
          <div class="form-actions onboarding-actions">
            <button class="ghost small" type="button" data-action="verify-parent-code" ${worker.parentVerificationSentAt ? "" : "disabled"}>
              Verify parent code
            </button>
          </div>
        </div>
        <label>
          <span>Short bio</span>
          <textarea name="bio" rows="4" required>${escapeHtml(worker.bio)}</textarea>
        </label>
        <fieldset>
          <legend>Services offered</legend>
          <div class="check-grid">${serviceCheckboxes(worker.services)}</div>
        </fieldset>
        <div class="more-service-card">
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
          <button class="primary" type="submit">Finish setup</button>
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

  return `
    <section class="dashboard-shell">
      <div class="dashboard-heading">
        <div>
          <p class="eyebrow">Client dashboard</p>
          <h1>Welcome, ${escapeHtml(client.name)}</h1>
          <p>${escapeHtml(client.location)} jobs and live requests. Language: ${escapeHtml(client.language)}.</p>
        </div>
        <div class="dashboard-actions">
          <button class="icon-button" type="button" data-action="toggle-client-notifications" aria-expanded="${clientNotificationsOpen ? "true" : "false"}" aria-label="Client notifications">
            🔔
          </button>
          <button class="secondary" data-view="onboard-client" data-stage="details">Edit profile</button>
        </div>
      </div>

      ${clientNotificationsOpen ? renderNotificationPanel("Notifications", clientNotifications, "No job requests yet.") : ""}

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
                <select name="currency" required>${currencyOptions(client.preferredCurrency || "USD")}</select>
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
  const matches = matchWorkers(job);
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
              ${
                job.status === "In Progress"
                  ? `<button class="primary small" data-action="complete-job" data-job-id="${job.id}">Approve completion</button>`
                  : ""
              }
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

      ${
        job.status === "Open"
          ? `
            <div class="job-subsection">
              <h4>Suggested students</h4>
              ${
                matches.length
                  ? matches
                      .map(
                        ({ worker, score }) => `
                          <div class="suggested-row">
                            ${renderAvatar(worker)}
                            <div>
                              ${profileButton(worker)}
                              <span>${chipList(worker.services.slice(0, 3), "soft")}</span>
                              <small>${escapeHtml(ratingSummary(worker))}</small>
                            </div>
                            <small>${score}% fit</small>
                          </div>
                        `
                      )
                      .join("")
                  : `<p class="muted">No matches yet for this category.</p>`
              }
            </div>
          `
          : ""
      }
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
  return `
    <div class="application-row">
      ${renderAvatar(worker)}
      <div class="application-copy">
        ${profileButton(worker)}
                <span>Age range ${escapeHtml(workerAgeLabel(worker))}. ${escapeHtml(worker.school)}. Speaks ${escapeHtml(worker.language)}.</span>
        <small>Applied ${dateTimeLabel(application.appliedAt)} at ${escapeHtml(paymentLabel(job))}. ${escapeHtml(ratingSummary(worker))}</small>
      </div>
      <span class="pill">${escapeHtml(application.status)}</span>
      <div class="application-actions">
        <button class="secondary small" data-action="next-time" data-job-id="${job.id}" data-worker-id="${worker.id}" ${nextTimed ? "disabled" : ""}>
          ${nextTimed ? "Next Timed" : "Next Time"}
        </button>
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

  return `
    <section class="dashboard-shell">
      <div class="dashboard-heading">
        <div class="worker-heading">
          ${renderAvatar(worker, "large")}
          <div>
            <p class="eyebrow">Student dashboard</p>
            <h1>${escapeHtml(worker.name)}</h1>
            <p>${escapeHtml(worker.location)}. Age range ${escapeHtml(workerAgeLabel(worker))}. Speaks ${escapeHtml(worker.language)}. Parent confirmed.</p>
            <span class="profile-rating">${escapeHtml(ratingSummary(worker))}</span>
          </div>
        </div>
        <div class="dashboard-actions">
          <button class="icon-button" type="button" data-action="toggle-worker-notifications" aria-expanded="${workerNotificationsOpen ? "true" : "false"}" aria-label="Student notifications">
            🔔
          </button>
          <button class="secondary" data-view="onboard-worker" data-stage="details">Edit profile</button>
        </div>
      </div>

      ${workerNotificationsOpen ? renderNotificationPanel("Notifications", workerNotifications, "No updates yet.") : ""}

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

function renderParentMonitor() {
  const parent = getParent();
  const worker = getWorker(parent.linkedWorkerId);
  const applications = getApplicationsForWorker(worker.id);
  const inProgress = state.jobs.filter((job) => job.status === "In Progress" && job.acceptedWorkerId === worker.id);
  const completed = state.jobs.filter((job) => job.status === "Completed" && job.acceptedWorkerId === worker.id);
  const events = state.parentEvents.filter((event) => event.workerId === worker.id);

  return `
    <section class="dashboard-shell">
      <div class="dashboard-heading">
        <div>
          <p class="eyebrow">Parent monitor</p>
          <h1>${escapeHtml(parent.name)}'s safety view</h1>
          <p>Linked to ${escapeHtml(worker.name)}. Read-only access.</p>
        </div>
      </div>

      <div class="metric-grid">
        <article class="metric-card">
          <span>Total earned</span>
          <strong>${formatTotals(workerEarningsTotals(worker.id))}</strong>
        </article>
        <article class="metric-card">
          <span>Applied jobs</span>
          <strong>${applications.length}</strong>
        </article>
        <article class="metric-card">
          <span>In progress</span>
          <strong>${inProgress.length}</strong>
        </article>
        <article class="metric-card">
          <span>Next Timed</span>
          <strong>${(worker.nextTimes || []).length}</strong>
        </article>
      </div>

      <div class="two-column">
        <section class="panel">
          <div class="panel-heading">
            <h2>Child profile</h2>
            <span class="pill">View only</span>
          </div>
          <div class="profile-summary">
            ${renderAvatar(worker, "large")}
            <div>
              <h3>${escapeHtml(worker.name)}</h3>
              <p>Age range ${escapeHtml(workerAgeLabel(worker))}. ${escapeHtml(worker.school)}. ${escapeHtml(worker.location)}. Speaks ${escapeHtml(worker.language)}.</p>
              <div class="chip-row">${chipList(worker.services, "blue")}</div>
              <span class="profile-rating">${escapeHtml(ratingSummary(worker))}</span>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-heading">
            <h2>Safety email log</h2>
            <span>${events.length} updates</span>
          </div>
          <div class="event-list">
            ${
              events
                .map(
                  (event) => `
                    <article class="event-item">
                      <strong>${escapeHtml(event.type)}</strong>
                      <span>${escapeHtml(event.message)}</span>
                      <small>${dateTimeLabel(event.createdAt)}</small>
                    </article>
                  `
                )
                .join("") || renderEmpty("No parent updates yet.")
            }
          </div>
        </section>
      </div>

      <section class="dashboard-section">
        <div class="panel-heading">
          <h2>Job activity</h2>
          <span>${applications.length} applications</span>
        </div>
        <div class="parent-job-list">
          ${
            applications
              .map(
                ({ job, application }) => `
                  <article class="parent-job-row">
                    <div>
                      <strong>${escapeHtml(job.title)}</strong>
                      <span>${escapeHtml(job.category)}. ${escapeHtml(job.status)}. ${formatDate(job.date)}</span>
                      <small>Application status: ${escapeHtml(application.status)}</small>
                    </div>
                    <strong>${escapeHtml(paymentLabel(job))}</strong>
                  </article>
                `
              )
              .join("") || renderEmpty("No job activity yet.")
          }
        </div>
      </section>

      <section class="dashboard-section">
        <div class="panel-heading">
          <h2>Earnings history</h2>
          <span>${completed.length} completed</span>
        </div>
        <div class="parent-job-list">
          ${
            completed
              .map(
                (job) => `
                  <article class="parent-job-row">
                    <div>
                      <strong>${escapeHtml(job.title)}</strong>
                      <span>${formatDate(job.date)}. Approved by ${escapeHtml(getClient(job.clientId).name)}.</span>
                    </div>
                    <strong>${formatMoney(jobTotal(job), job.currency)}</strong>
                  </article>
                `
              )
              .join("") || renderEmpty("Completed earnings will appear here.")
          }
        </div>
      </section>
    </section>
  `;
}

function renderEmpty(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function bindCommonEvents() {
  const reviewForm = document.querySelector("#reviewForm");
  if (reviewForm) {
    reviewForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const session = readSession();
      const user = getSessionUser();
      if (!session || !user) {
        navigate("login");
        return;
      }
      const formData = new FormData(reviewForm);
      const stars = Math.max(1, Math.min(5, Number(formData.get("stars")) || 5));
      const comment = String(formData.get("comment") || "").trim();
      if (!Array.isArray(state.appReviews)) state.appReviews = [];
      state.appReviews.unshift({
        id: `review-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        name: user.name || "Anonymous",
        role: session.role || "user",
        stars,
        comment,
        createdAt: new Date().toISOString()
      });
      await saveState();
      navigate("landing");
    });
  }

  document.querySelectorAll("[data-action='toggle-logo-menu']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      logoMenuOpen = !logoMenuOpen;
      clientNotificationsOpen = false;
      workerNotificationsOpen = false;
      render();
    });
  });

  document.querySelectorAll("[data-action='toggle-client-notifications']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      clientNotificationsOpen = !clientNotificationsOpen;
      workerNotificationsOpen = false;
      logoMenuOpen = false;
      render();
    });
  });

  document.querySelectorAll("[data-action='toggle-worker-notifications']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      workerNotificationsOpen = !workerNotificationsOpen;
      clientNotificationsOpen = false;
      logoMenuOpen = false;
      render();
    });
  });

  document.querySelectorAll("[data-action='open-client-profile']").forEach((button) => {
    button.addEventListener("click", () => {
      const session = readSession();
      if (session?.role === "client") {
        navigate("client-dashboard");
        return;
      }
      navigate("login", { role: "client", loginNotice: "Sign in to view your client profile." });
    });
  });

  document.querySelectorAll("[data-action='open-worker-profile']").forEach((button) => {
    button.addEventListener("click", () => {
      const session = readSession();
      if (session?.role === "worker") {
        navigate("worker-dashboard");
        return;
      }
      navigate("login", { role: "worker", loginNotice: "Sign in to view your student profile." });
    });
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.view;
      const meta = {};
      if (button.dataset.role) meta.role = button.dataset.role;
      if (button.dataset.stage) meta.stage = button.dataset.stage;
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

  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.passwordToggle);
      if (!target) return;
      const nextVisible = target.type === "password";
      target.type = nextVisible ? "text" : "password";
      button.setAttribute("aria-pressed", String(nextVisible));
      button.setAttribute("aria-label", nextVisible ? "Hide password" : "Show password");
      button.innerHTML = typeof icon === "function" ? icon(nextVisible ? "eye-off" : "eye") : nextVisible ? "🙈" : "👁";
      target.focus();
      const end = target.value.length;
      try {
        target.setSelectionRange(end, end);
      } catch {
        // ignore
      }
    });
  });
}

function bindViewEvents() {
  if (view === "login") bindLogin();
  if (view === "onboard-client") bindClientOnboarding();
  if (view === "onboard-worker") bindWorkerOnboarding();
  if (view === "client-dashboard") bindClientDashboard();
  if (view === "worker-dashboard") bindWorkerDashboard();
}

function bindLogin() {
  document.querySelector("#loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = formData.get("email").trim();
    const password = formData.get("password");
    const user =
      Object.values(state.clients).find((item) => item.email.toLowerCase() === email.toLowerCase()) ||
      Object.values(state.workers).find((item) => item.email.toLowerCase() === email.toLowerCase()) ||
      Object.values(state.parents).find((item) => item.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      showFormError(event.currentTarget, "We could not find that email.");
      return;
    }

    if (accountNeedsVerification(user)) {
      showFormError(event.currentTarget, "Please verify your email before signing in.");
      return;
    }

    if (user.role === "parent" && !user.passwordHash) {
      writeSession({ role: user.role, id: user.id });
      navigate("parent-monitor");
      return;
    }

    const salt = user.passwordSalt || "";
    if (hashPassword(password, salt) !== user.passwordHash) {
      showFormError(event.currentTarget, "That password does not match this account.");
      return;
    }

    writeSession({ role: user.role, id: user.id });
    if (user.role === "worker") navigate("worker-dashboard");
    else if (user.role === "parent") navigate("parent-monitor");
    else navigate("client-dashboard");
  });
}

function bindClientOnboarding() {
  const form = document.querySelector("#clientOnboardingForm");
  if (!form) return;
  const stage = routeMeta.stage || "register";
  const client = getClient();
  const hasEmailField = Boolean(form.querySelector('input[name="email"]'));

  const syncDraftClient = (formData) => {
    if (stage !== "details") return client;
    const selectedLanguages = formData
      .getAll("language")
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const services = formData.getAll("services");
    const preferredName = sanitizeOnboardingText(formData.get("name"));
    const phone = sanitizeOnboardingText(formData.get("phone"));
    const postalCode = sanitizeOnboardingText(formData.get("postalCode"));
    const locality = sanitizeOnboardingText(formData.get("location"));
    const about = sanitizeOnboardingText(formData.get("about"));
    client.name = preferredName;
    client.phone = phone;
    client.location = locality;
    client.language = selectedLanguages.join(", ");
    client.preferredCurrency = String(formData.get("preferredCurrency") || client.preferredCurrency || "CHF");
    client.typicalServices = services;
    client.uiPreferences = {
      ...(client.uiPreferences || {}),
      onboarding: {
        ...(client.uiPreferences?.onboarding || {}),
        preferredName,
        postalCode,
        locality,
        about,
        languages: selectedLanguages,
        interests: services,
        preferredCurrency: client.preferredCurrency
      }
    };
    return client;
  };

  const submitRegistration = async (formData) => {
    const email = normalizeEmail(formData.get("email"));
    const password = String(formData.get("password") || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      addFieldError(form, "email");
      showFormError(form, "Please enter a valid email address.");
      return;
    }

    if (password.length < 8) {
      addFieldError(form, "password");
      showFormError(form, "Please make your password at least 8 characters long.");
      return;
    }

    const existing = findUserByEmail(email);
    if (existing && existing.role !== "client") {
      addFieldError(form, "email");
      showFormError(form, "That email is already linked to another account.");
      return;
    }
    if (existing && existing.emailVerifiedAt && existing.role === "client") {
      addFieldError(form, "email");
      showFormError(form, "That email is already in use.");
      return;
    }

    const draft = existing && existing.role === "client" ? existing : createSignupRecord("client", email, password);
    draft.email = email;
    Object.assign(draft, passwordRecord(password));
    draft.emailVerificationCode = generateVerificationCode();
    draft.emailVerificationSentAt = new Date().toISOString();
    draft.emailVerifiedAt = "";
    state.selectedClientId = draft.id;
    await saveState();

    try {
      await sendVerificationEmail({ to: draft.email, code: draft.emailVerificationCode, role: "client" });
    } catch (error) {
      showFormError(form, error.message || "We could not send the verification email.");
      return;
    }
    routeMeta = { role: "client", stage: "verify" };
    navigate("onboard-client", { role: "client", stage: "verify" });
  };

  const sendCode = async () => {
    const draft = client;
    if (!draft.email) {
      showFormError(form, "Please add the email first.");
      return;
    }
    draft.emailVerificationCode = generateVerificationCode();
    draft.emailVerificationSentAt = new Date().toISOString();
    draft.emailVerifiedAt = "";
    await saveState();
    try {
      await sendVerificationEmail({ to: draft.email, code: draft.emailVerificationCode, role: "client" });
    } catch (error) {
      showFormError(form, error.message || "We could not send the verification email.");
      return;
    }
    render();
  };

  const verifyCode = async () => {
    const code = String(new FormData(form).get("emailVerificationCode") || "").trim();
    if (!client.emailVerificationCode) {
      showFormError(form, "Send the email code first.");
      return;
    }
    if (isEmailVerificationExpired(client.emailVerificationSentAt)) {
      showFormError(form, "That verification code has expired. Please send a new one.");
      return;
    }
    if (code !== client.emailVerificationCode) {
      showFormError(form, "That verification code does not match.");
      return;
    }
    client.emailVerifiedAt = new Date().toISOString();
    client.emailVerificationCode = "";
    await saveState();
    helperNotice = "";
    navigate("login", { loginNotice: "Account verified. Please sign in." });
  };

  if (stage === "register") {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      await submitRegistration(formData);
    });
    return;
  }

  const sendCodeButton = document.querySelector("[data-action='send-client-email-code']");
  if (sendCodeButton) sendCodeButton.addEventListener("click", sendCode);

  const verifyCodeButton = document.querySelector("[data-action='verify-client-email-code']");
  if (verifyCodeButton) verifyCodeButton.addEventListener("click", verifyCode);

  if (stage !== "details") return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const services = formData.getAll("services");
    if (!services.length) {
      showFormError(form, "Please choose at least one service.");
      return;
    }

    const draft = syncDraftClient(formData);
    const preferredName = sanitizeOnboardingText(formData.get("name"));
    if (!isValidPersonName(preferredName)) {
      addFieldError(form, "name");
      showFormError(form, "Please enter a valid name. Names can only contain letters, spaces, and hyphens (-).");
      return;
    }

    const postalCode = sanitizeOnboardingText(formData.get("postalCode"));
    let locality = sanitizeOnboardingText(formData.get("location"));
    if (postalCode && !locality) {
      locality = await lookupLocalityFromPostalCode(postalCode);
    }
    if (!locality) {
      showFormError(form, "Please enter a valid locality.");
      return;
    }

    const languagesSelected = formData.getAll("language").map((value) => String(value || "").trim()).filter(Boolean);
    if (!languagesSelected.length) {
      showFormError(form, "Please choose at least one language.");
      return;
    }

    draft.name = preferredName;
    draft.phone = sanitizeOnboardingText(formData.get("phone"));
    draft.location = locality;
    draft.language = languagesSelected.join(", ");
    draft.preferredCurrency = String(formData.get("preferredCurrency") || draft.preferredCurrency || "CHF");
    draft.typicalServices = services;
    setOnboardingComplete(draft, {
      preferredName,
      postalCode,
      locality,
      about: sanitizeOnboardingText(formData.get("about")),
      languages: languagesSelected,
      interests: services,
      preferredCurrency: draft.preferredCurrency
    });
    await saveState();
    writeSession({ role: "client", id: draft.id });
    navigate("client-dashboard");
  });
}

function bindWorkerOnboarding() {
  const form = document.querySelector("#workerOnboardingForm");
  if (!form) return;
  const stage = routeMeta.stage || "register";
  const photoInput = document.querySelector("#photoInput");
  const preview = document.querySelector(".photo-uploader img");
  const worker = getWorker();
  const hasEmailField = Boolean(form.querySelector('input[name="email"]'));

  const syncDraftWorker = (formData) => {
    if (stage !== "details") return worker;
    const preferredName = sanitizeOnboardingText(formData.get("name"));
    const selectedAgeRange = String(formData.get("ageRange") || "").trim() || ageRangeForWorker(worker.age);
    const selectedLanguages = formData
      .getAll("language")
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const services = formData
      .getAll("services")
      .concat(
        String(formData.get("customService") || "")
          .split(/[,\n]/)
          .map((item) => item.trim())
          .filter(Boolean)
      )
      .filter((item, index, list) => list.indexOf(item) === index);
    const certifications = String(formData.get("certifications") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    worker.name = preferredName;
    worker.ageRange = selectedAgeRange;
    worker.age = ageRangeToNumericAge(selectedAgeRange);
    worker.phone = sanitizeOnboardingText(formData.get("phone"));
    worker.school = sanitizeOnboardingText(formData.get("school"));
    worker.language = selectedLanguages.join(", ");
    worker.bio = sanitizeOnboardingText(formData.get("bio"));
    worker.services = services;
    worker.certifications = certifications;
    const nextParentEmail = sanitizeOnboardingText(formData.get("parentEmail"));
    if (worker.parentEmail !== nextParentEmail) {
      worker.parentVerificationCode = "";
      worker.parentVerificationSentAt = "";
      worker.parentVerifiedAt = "";
      worker.parentConfirmed = false;
    }
    worker.parentEmail = nextParentEmail;
    worker.uiPreferences = {
      ...(worker.uiPreferences || {}),
      onboarding: {
        ...(worker.uiPreferences?.onboarding || {}),
        preferredName,
        ageRange: selectedAgeRange,
        postalCode: sanitizeOnboardingText(formData.get("postalCode")),
        locality: sanitizeOnboardingText(formData.get("location")),
        languages: selectedLanguages,
        interests: services,
        about: sanitizeOnboardingText(formData.get("bio")),
        parentEmail: nextParentEmail
      }
    };
    worker.location = sanitizeOnboardingText(formData.get("location"));
    return worker;
  };

  const submitRegistration = async (formData) => {
    const email = normalizeEmail(formData.get("email"));
    const password = String(formData.get("password") || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      addFieldError(form, "email");
      showFormError(form, "Please enter a valid email address.");
      return;
    }

    if (password.length < 8) {
      addFieldError(form, "password");
      showFormError(form, "Please make your password at least 8 characters long.");
      return;
    }

    const existing = findUserByEmail(email);
    if (existing && existing.role !== "worker") {
      addFieldError(form, "email");
      showFormError(form, "That email is already linked to another account.");
      return;
    }
    if (existing && existing.emailVerifiedAt && existing.role === "worker") {
      addFieldError(form, "email");
      showFormError(form, "That email is already in use.");
      return;
    }
    const draft = existing && existing.role === "worker" ? existing : createSignupRecord("worker", email, password);
    draft.email = email;
    Object.assign(draft, passwordRecord(password));
    draft.emailVerificationCode = generateVerificationCode();
    draft.emailVerificationSentAt = new Date().toISOString();
    draft.emailVerifiedAt = "";
    state.selectedWorkerId = draft.id;
    await saveState();

    try {
      await sendVerificationEmail({ to: draft.email, code: draft.emailVerificationCode, role: "worker" });
    } catch (error) {
      showFormError(form, error.message || "We could not send the verification email.");
      return;
    }
    navigate("onboard-worker", { role: "worker", stage: "verify" });
  };

  const sendWorkerEmailCode = async () => {
    const draft = worker;
    if (!draft.email) {
      showFormError(form, "Please add the student email first.");
      return;
    }
    draft.emailVerificationCode = generateVerificationCode();
    draft.emailVerificationSentAt = new Date().toISOString();
    draft.emailVerifiedAt = "";
    await saveState();
    try {
      await sendVerificationEmail({ to: draft.email, code: draft.emailVerificationCode, role: "worker" });
    } catch (error) {
      showFormError(form, error.message || "We could not send the verification email.");
      return;
    }
    render();
  };

  const verifyWorkerEmailCode = async () => {
    const code = String(new FormData(form).get("emailVerificationCode") || "").trim();
    if (!worker.emailVerificationCode) {
      showFormError(form, "Send the student email code first.");
      return;
    }
    if (isEmailVerificationExpired(worker.emailVerificationSentAt)) {
      showFormError(form, "That verification code has expired. Please send a new one.");
      return;
    }
    if (code !== worker.emailVerificationCode) {
      showFormError(form, "That student email code does not match.");
      return;
    }
    worker.emailVerifiedAt = new Date().toISOString();
    worker.emailVerificationCode = "";
    await saveState();
    helperNotice = "";
    navigate("login", { loginNotice: "Account verified. Please sign in." });
  };

  const sendParentCode = async () => {
    const draft = syncDraftWorker(new FormData(form));
    if (!draft.emailVerifiedAt) {
      showFormError(form, "Verify the student email first.");
      return;
    }
    if (!draft.parentEmail) {
      showFormError(form, "Please add the parent email first.");
      return;
    }
    draft.parentConfirmed = false;
    draft.parentVerificationCode = generateVerificationCode();
    draft.parentVerificationSentAt = new Date().toISOString();
    draft.parentVerifiedAt = "";
    await saveState();
    try {
      await sendVerificationEmail({
        to: draft.parentEmail,
        code: draft.parentVerificationCode,
        role: "parent",
        subject: "Verify your ParTime parent account",
        label: "parent"
      });
    } catch (error) {
      showFormError(form, error.message || "We could not send the parent verification email.");
      return;
    }
    render();
  };

  const verifyParentCode = async () => {
    const formData = new FormData(form);
    const draft = syncDraftWorker(formData);
    if (!draft.emailVerifiedAt) {
      showFormError(form, "Verify the student email first.");
      return;
    }
    const code = String(formData.get("parentVerificationCode") || "").trim();
    if (!draft.parentVerificationCode) {
      showFormError(form, "Send the parent code first.");
      return;
    }
    if (isEmailVerificationExpired(draft.parentVerificationSentAt)) {
      showFormError(form, "That parent verification code has expired. Please send a new one.");
      return;
    }
    if (code !== draft.parentVerificationCode) {
      showFormError(form, "That parent code does not match.");
      return;
    }
    draft.parentConfirmed = true;
    draft.parentVerifiedAt = new Date().toISOString();
    createAutoParentAccount(draft);
    await saveState();
    render();
  };

  if (stage === "register") {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      await submitRegistration(formData);
    });
    return;
  }

  const sendWorkerEmailButton = document.querySelector("[data-action='send-worker-email-code']");
  if (sendWorkerEmailButton) sendWorkerEmailButton.addEventListener("click", sendWorkerEmailCode);
  const verifyWorkerEmailButton = document.querySelector("[data-action='verify-worker-email-code']");
  if (verifyWorkerEmailButton) verifyWorkerEmailButton.addEventListener("click", verifyWorkerEmailCode);
  const sendParentCodeButton = document.querySelector("[data-action='send-parent-code']");
  if (sendParentCodeButton) sendParentCodeButton.addEventListener("click", sendParentCode);
  const verifyParentCodeButton = document.querySelector("[data-action='verify-parent-code']");
  if (verifyParentCodeButton) verifyParentCodeButton.addEventListener("click", verifyParentCode);

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

  if (stage !== "details") return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const ageRange = String(formData.get("ageRange") || "").trim();
    const age = ageRangeToNumericAge(ageRange);
    if (age > 18) {
      showFormError(form, "Student work accounts are for students 18 and under. Please enter an age from 13 to 18.");
      return;
    }

    const draft = syncDraftWorker(formData);
    const preferredName = sanitizeOnboardingText(formData.get("name"));
    if (!isValidPersonName(preferredName)) {
      addFieldError(form, "name");
      showFormError(form, "Please enter a valid name. Names can only contain letters, spaces, and hyphens (-).");
      return;
    }

    if (!draft.services.length) {
      showFormError(form, "Please choose at least one service or write one in More.");
      return;
    }

    if (!draft.emailVerifiedAt || !draft.parentConfirmed) {
      showFormError(form, "Please finish email verification before saving the account.");
      return;
    }

    const file = photoInput?.files?.[0];
    const commitWorker = async (photo) => {
      if (photo) draft.photo = photo;
      draft.ageRange = ageRange;
      draft.age = age;
      draft.name = preferredName;
      const postalCode = sanitizeOnboardingText(formData.get("postalCode"));
      let locality = sanitizeOnboardingText(formData.get("location"));
      if (postalCode && !locality) {
        locality = await lookupLocalityFromPostalCode(postalCode);
      }
      if (!locality) {
        showFormError(form, "Please enter a valid locality.");
        return;
      }
      const selectedLanguages = formData.getAll("language").map((value) => String(value || "").trim()).filter(Boolean);
      if (!selectedLanguages.length) {
        showFormError(form, "Please choose at least one language.");
        return;
      }
      draft.location = locality;
      draft.school = sanitizeOnboardingText(formData.get("school"));
      draft.language = selectedLanguages.join(", ");
      draft.bio = sanitizeOnboardingText(formData.get("bio"));
      draft.parentEmail = sanitizeOnboardingText(formData.get("parentEmail"));
      draft.uiPreferences = {
        ...(draft.uiPreferences || {}),
        onboarding: {
          ...(draft.uiPreferences?.onboarding || {}),
          preferredName,
          ageRange,
          postalCode,
          locality,
          languages: selectedLanguages,
          interests: draft.services,
          about: draft.bio
        }
      };
      if (!draft.parentConfirmed) {
        showFormError(form, "Please finish parent verification before saving the account.");
        return;
      }
      setOnboardingComplete(draft, {
        preferredName,
        ageRange,
        postalCode,
        locality,
        languages: selectedLanguages,
        interests: draft.services,
        about: draft.bio
      });
      draft.parentVerificationCode = "";
      draft.parentVerificationSentAt = draft.parentVerificationSentAt || new Date().toISOString();
      draft.parentVerifiedAt = draft.parentVerifiedAt || new Date().toISOString();
      createAutoParentAccount(draft);
      addParentEvent(draft.id, "Registration confirmed", `${draft.name}'s student profile was confirmed for ParTime.`);
      await saveState();
      writeSession({ role: "worker", id: draft.id });
      navigate("worker-dashboard");
    };

    if (!file) {
      await commitWorker();
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
  form.insertAdjacentHTML("afterbegin", `<div class="form-error">${escapeHtml(message)}</div>`);
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
      job.status = "In Progress";
      job.acceptedWorkerId = worker.id;
      job.applications = job.applications.map((application) => ({
        ...application,
        status: application.workerId === worker.id ? "Accepted" : "Not selected",
        acceptedAt: application.workerId === worker.id ? new Date().toISOString() : application.acceptedAt
      }));
      addParentEvent(worker.id, "Job accepted", `${worker.name} was accepted for ${job.title}.`);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-action='complete-job']").forEach((button) => {
    button.addEventListener("click", () => {
      const job = state.jobs.find((item) => item.id === button.dataset.jobId);
      const worker = getWorker(job.acceptedWorkerId);
      job.status = "Completed";
      job.completedAt = new Date().toISOString();
      addParentEvent(worker.id, "Completion approved", `${worker.name} completed ${job.title} and earned ${formatMoney(jobTotal(job), job.currency)}.`);
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
      addParentEvent(worker.id, "Application sent", `${worker.name} applied for ${job.title}.`);
      saveState();
      render();
    });
  });
}

async function bootstrap() {
  state = (await loadState()) || createDefaultState();
  const session = readSession();
  if (session) {
    const role = session.role || "client";
    const target = session.id;
    if (role === "client" && state.clients[target]) {
      state.selectedClientId = target;
      view = "client-dashboard";
    } else if (role === "worker" && state.workers[target]) {
      state.selectedWorkerId = target;
      view = "worker-dashboard";
    } else if (role === "parent" && state.parents[target]) {
      state.selectedParentId = target;
      view = "parent-monitor";
    } else {
      clearSession();
      view = "login";
    }
  } else {
    view = "landing";
  }

  render();
}

bootstrap();
