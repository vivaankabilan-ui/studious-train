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
const SESSION_KEY = "partime-auth-session-v1";
const LOGIN_DRAFT_KEY = "partime-login-draft-v1";
const ONBOARDING_KEY = "partime-onboarding-draft-v1";
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SEED_PASSWORD = "ParTime1234!";
const DEFAULT_UI_PREFERENCES = {
  theme: "emerald",
  automaticFilters: true,
  compactMode: false,
  smartSuggestions: true
};

let view = "landing";
let routeMeta = {};
let helperFilter = "All";
let helperSearch = "";
let helperNotice = "";
let authNotice = "";
let profileModalWorkerId = "";
let brandMenuOpen = false;
let settingsModalOpen = false;
let saveQueue = Promise.resolve();

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

function normalizeUiPreferences(preferences = {}) {
  return {
    ...DEFAULT_UI_PREFERENCES,
    ...preferences
  };
}

function getSessionUser() {
  const session = readSession();
  if (!session) return null;
  if (session.role === "worker") return state.workers[session.id] || null;
  if (session.role === "parent") return state.parents[session.id] || null;
  return state.clients[session.id] || null;
}

function activeUiPreferences() {
  return normalizeUiPreferences(getSessionUser()?.uiPreferences);
}

function hasEmailConflict(email, ignoreId = "", roles = null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const matchesRole = (role) => !Array.isArray(roles) || roles.includes(role);
  return Boolean(
    Object.values(state.clients).find(
      (item) => item.id !== ignoreId && matchesRole("client") && normalizeEmail(item.email) === normalized
    ) ||
      Object.values(state.workers).find(
        (item) => item.id !== ignoreId && matchesRole("worker") && normalizeEmail(item.email) === normalized
      ) ||
      Object.values(state.parents).find(
        (item) => item.id !== ignoreId && matchesRole("parent") && normalizeEmail(item.email) === normalized
      )
  );
}

function applyTheme(theme) {
  if (!document?.documentElement) return;
  document.documentElement.dataset.theme = theme || DEFAULT_UI_PREFERENCES.theme;
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

function autoParentIdForEmail(email) {
  return `parent_${hashString(String(email || "").toLowerCase().trim())}`;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isVerificationExpired(sentAt) {
  if (!sentAt) return false;
  const sent = new Date(sentAt).getTime();
  return Number.isFinite(sent) ? Date.now() - sent > VERIFICATION_TTL_MS : false;
}

function onboardingDraftKeyFor(viewName, id) {
  return `${ONBOARDING_KEY}:${viewName}:${id || "draft"}`;
}

function saveOnboardingDraft(viewName, stage, id) {
  try {
    localStorage.setItem(
      ONBOARDING_KEY,
      JSON.stringify({
        view: viewName,
        stage,
        id: id || "",
        savedAt: new Date().toISOString()
      })
    );
  } catch {
    // ignore
  }
}

function loadOnboardingDraft() {
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearOnboardingDraft() {
  try {
    localStorage.removeItem(ONBOARDING_KEY);
  } catch {
    // ignore
  }
}

function showAuthNotice(message) {
  authNotice = message || "";
}

function clearAuthNotice() {
  authNotice = "";
}

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
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

function readRememberedLogin() {
  try {
    const raw = localStorage.getItem(LOGIN_DRAFT_KEY);
    return raw ? JSON.parse(raw) : { email: "", password: "" };
  } catch {
    return { email: "", password: "" };
  }
}

function writeRememberedLogin(email, password) {
  try {
    localStorage.setItem(
      LOGIN_DRAFT_KEY,
      JSON.stringify({
        email: String(email || ""),
        password: String(password || "")
      })
    );
  } catch {
    // ignore
  }
}

function createDefaultState() {
  return {
    selectedClientId: "c1",
    selectedWorkerId: "w1",
    selectedParentId: "p1",
    clients: {
      c1: {
        id: "c1",
        role: "client",
        name: "Jordan Taylor",
        email: "jordan@example.com",
        phone: "",
        emailVerificationCode: "",
        emailVerificationSentAt: "",
        emailVerifiedAt: "2026-07-01T00:00:00",
        language: "English",
        location: "Maplewood",
        typicalServices: ["Lawn Care", "Pet Sitting", "Tech Help"],
        preferredCurrency: "USD",
        uiPreferences: normalizeUiPreferences(),
        ...passwordRecord(DEFAULT_SEED_PASSWORD, "client-c1")
      },
      c2: {
        id: "c2",
        role: "client",
        name: "Priya Shah",
        email: "priya@example.com",
        phone: "",
        emailVerificationCode: "",
        emailVerificationSentAt: "",
        emailVerifiedAt: "2026-07-01T00:00:00",
        language: "English",
        location: "Cedar Grove",
        typicalServices: ["Pet Sitting", "Tutoring", "Errands"],
        preferredCurrency: "USD",
        uiPreferences: normalizeUiPreferences(),
        ...passwordRecord(DEFAULT_SEED_PASSWORD, "client-c2")
      }
    },
    workers: {
      w1: {
        id: "w1",
        role: "worker",
        name: "Maya Hernandez",
        email: "maya.student@example.com",
        phone: "",
        emailVerificationCode: "",
        emailVerificationSentAt: "",
        emailVerifiedAt: "2026-07-01T00:00:00",
        parentEmail: "ana.parent@example.com",
        parentConfirmed: true,
        age: 16,
        school: "Lincoln High School",
        language: "English",
        location: "Maplewood",
        bio: "Reliable after-school student who enjoys yard projects, pets, and weekend errands.",
        services: ["Lawn Care", "Pet Sitting", "Errands"],
        certifications: ["Pet first aid", "Honor roll", "Community service club"],
        photo: defaultPhotos.w1,
        uiPreferences: normalizeUiPreferences(),
        ...passwordRecord(DEFAULT_SEED_PASSWORD, "worker-w1"),
        ratings: [
          { jobId: "r1", clientId: "c2", stars: 5, createdAt: "2026-05-10T12:00:00" },
          { jobId: "r2", clientId: "c1", stars: 4, createdAt: "2026-05-24T12:00:00" },
          { jobId: "r3", clientId: "c2", stars: 5, createdAt: "2026-06-06T12:00:00" },
          { jobId: "r4", clientId: "c1", stars: 5, createdAt: "2026-06-22T12:00:00" }
        ],
        nextTimes: [
          { clientId: "c1", jobId: "j5", createdAt: "2026-06-30T18:20:00" }
        ]
      },
      w2: {
        id: "w2",
        role: "worker",
        name: "Eli Brooks",
        email: "eli.student@example.com",
        phone: "",
        emailVerificationCode: "",
        emailVerificationSentAt: "",
        emailVerifiedAt: "2026-07-01T00:00:00",
        parentEmail: "sarah.parent@example.com",
        parentConfirmed: true,
        age: 17,
        school: "Roosevelt Academy",
        language: "Spanish",
        location: "Maplewood",
        bio: "Patient tutor and tech student available after school and on Saturdays.",
        services: ["Tutoring", "Tech Help"],
        certifications: ["Math team", "Student tech desk"],
        photo: defaultPhotos.w2,
        uiPreferences: normalizeUiPreferences(),
        ...passwordRecord(DEFAULT_SEED_PASSWORD, "worker-w2"),
        ratings: [
          { jobId: "e1", clientId: "c1", stars: 5, createdAt: "2026-04-11T12:00:00" },
          { jobId: "e2", clientId: "c2", stars: 5, createdAt: "2026-04-18T12:00:00" },
          { jobId: "e3", clientId: "c1", stars: 4, createdAt: "2026-05-09T12:00:00" },
          { jobId: "e4", clientId: "c2", stars: 5, createdAt: "2026-06-02T12:00:00" },
          { jobId: "e5", clientId: "c1", stars: 5, createdAt: "2026-06-15T12:00:00" }
        ],
        nextTimes: []
      },
      w3: {
        id: "w3",
        role: "worker",
        name: "Nia Patel",
        email: "nia.student@example.com",
        phone: "",
        emailVerificationCode: "",
        emailVerificationSentAt: "",
        emailVerifiedAt: "2026-07-01T00:00:00",
        parentEmail: "dev.parent@example.com",
        parentConfirmed: true,
        age: 15,
        school: "Lincoln High School",
        language: "Hindi",
        location: "Cedar Grove",
        bio: "Animal-loving student with experience walking dogs and caring for cats.",
        services: ["Pet Sitting", "Snow Help", "Lawn Care"],
        certifications: ["Shelter volunteer", "Babysitting basics"],
        photo: defaultPhotos.w3,
        uiPreferences: normalizeUiPreferences(),
        ...passwordRecord(DEFAULT_SEED_PASSWORD, "worker-w3"),
        ratings: [
          { jobId: "n1", clientId: "c2", stars: 5, createdAt: "2026-05-16T12:00:00" },
          { jobId: "n2", clientId: "c1", stars: 4, createdAt: "2026-06-12T12:00:00" }
        ],
        nextTimes: []
      },
      w4: {
        id: "w4",
        role: "worker",
        name: "Theo Kim",
        email: "theo.student@example.com",
        phone: "",
        emailVerificationCode: "",
        emailVerificationSentAt: "",
        emailVerifiedAt: "2026-07-01T00:00:00",
        parentEmail: "min.parent@example.com",
        parentConfirmed: true,
        age: 16,
        school: "Roosevelt Academy",
        language: "Mandarin",
        location: "Maplewood",
        bio: "Careful student for errands, babysitting support, and simple household tasks.",
        services: ["Errands", "Babysitting", "Tutoring"],
        certifications: ["CPR basics", "Peer mentor"],
        photo: defaultPhotos.w4,
        uiPreferences: normalizeUiPreferences(),
        ...passwordRecord(DEFAULT_SEED_PASSWORD, "worker-w4"),
        ratings: [],
        nextTimes: []
      }
    },
    parents: {
      p1: {
        id: "p1",
        role: "parent",
        name: "Ana Hernandez",
        email: "ana.parent@example.com",
        emailVerificationCode: "",
        emailVerificationSentAt: "",
        emailVerifiedAt: "2026-07-01T00:00:00",
        linkedWorkerId: "w1",
        ...passwordRecord(DEFAULT_SEED_PASSWORD, "parent-p1")
      }
    },
    jobs: [
      {
        id: "j1",
        clientId: "c1",
        title: "Mow front yard and bag clippings",
        category: "Lawn Care",
        date: "2026-07-08",
        pay: 45,
        payType: "Fixed",
        currency: "USD",
        estimatedHours: 1,
        negotiable: true,
        location: "Maplewood",
        status: "Open",
        createdAt: "2026-07-04T09:00:00",
        applications: []
      },
      {
        id: "j2",
        clientId: "c2",
        title: "Feed cats during weekend trip",
        category: "Pet Sitting",
        date: "2026-07-09",
        pay: 60,
        payType: "Fixed",
        currency: "USD",
        estimatedHours: 1,
        negotiable: false,
        location: "Cedar Grove",
        status: "Open",
        createdAt: "2026-07-03T15:30:00",
        applications: [
          {
            workerId: "w3",
            amount: 60,
            currency: "USD",
            payType: "Fixed",
            status: "Applied",
            appliedAt: "2026-07-04T08:15:00"
          }
        ]
      },
      {
        id: "j3",
        clientId: "c1",
        title: "Set up new Wi-Fi printer",
        category: "Tech Help",
        date: "2026-07-10",
        pay: 35,
        payType: "Fixed",
        currency: "USD",
        estimatedHours: 1,
        negotiable: true,
        location: "Maplewood",
        status: "Open",
        createdAt: "2026-07-03T13:45:00",
        applications: [
          {
            workerId: "w2",
            amount: 35,
            currency: "USD",
            payType: "Fixed",
            status: "Applied",
            appliedAt: "2026-07-04T10:05:00"
          }
        ]
      },
      {
        id: "j4",
        clientId: "c2",
        title: "Algebra review before exam",
        category: "Tutoring",
        date: "2026-07-07",
        pay: 25,
        payType: "Hourly",
        currency: "USD",
        estimatedHours: 2,
        negotiable: false,
        location: "Cedar Grove",
        status: "In Progress",
        acceptedWorkerId: "w2",
        createdAt: "2026-07-03T11:00:00",
        applications: [
          {
            workerId: "w2",
            amount: 25,
            currency: "USD",
            payType: "Hourly",
            status: "Accepted",
            appliedAt: "2026-07-03T12:10:00",
            acceptedAt: "2026-07-04T09:20:00"
          }
        ]
      },
      {
        id: "j5",
        clientId: "c1",
        title: "Plant balcony herbs",
        category: "Lawn Care",
        date: "2026-07-02",
        pay: 40,
        payType: "Fixed",
        currency: "USD",
        estimatedHours: 1,
        negotiable: false,
        location: "Maplewood",
        status: "Completed",
        acceptedWorkerId: "w1",
        completedAt: "2026-07-02T18:15:00",
        createdAt: "2026-07-01T17:30:00",
        ratingSubmitted: false,
        applications: [
          {
            workerId: "w1",
            amount: 40,
            currency: "USD",
            payType: "Fixed",
            status: "Accepted",
            appliedAt: "2026-07-01T18:05:00",
            acceptedAt: "2026-07-02T09:00:00"
          }
        ]
      }
    ],
    parentEvents: [
      {
        id: "e1",
        workerId: "w1",
        type: "Completion approved",
        message: "Maya completed Plant balcony herbs and earned $40.",
        createdAt: "2026-07-02T18:15:00"
      },
      {
        id: "e2",
        workerId: "w1",
        type: "Application sent",
        message: "Maya applied for Plant balcony herbs.",
        createdAt: "2026-07-01T18:05:00"
      }
    ]
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
  try {
    const response = await fetch(API_STATE_ENDPOINT, {
      headers: {
        Accept: "application/json"
      }
    });
    if (response.ok) {
      const payload = await response.json();
      if (payload && payload.state) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.state));
        return payload.state;
      }
    }
  } catch (error) {
    // Fall back to local storage below.
  }

  const localState = loadLocalState();
  if (localState) return localState;
  return createDefaultState();
}

function findDuplicateEmailInState(snapshot) {
  const seen = new Map();
  const records = [
    ...(Object.values(snapshot.clients || {})),
    ...(Object.values(snapshot.workers || {})),
    ...(Object.values(snapshot.parents || {}))
  ];

  for (const record of records) {
    const email = normalizeEmail(record.email);
    if (!email) continue;
    if (seen.has(email) && seen.get(email) !== record.id) {
      return email;
    }
    seen.set(email, record.id);
  }
  return "";
}

async function saveState() {
  const duplicateEmail = findDuplicateEmailInState(state);
  if (duplicateEmail) {
    showAuthNotice("That email is already in use.");
    return Promise.resolve();
  }

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
  return [`<option value="">Choose a language</option>`]
    .concat(
      languages.map(
        (language) =>
          `<option value="${escapeHtml(language)}" ${language === selected ? "selected" : ""}>${escapeHtml(language)}</option>`
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

function jobFitScore(worker, job) {
  let score = 0;
  if (worker.services.includes(job.category)) score += 70;
  if (worker.location === job.location) score += 20;
  if (worker.certifications.length) score += 5;
  if (job.negotiable) score += 3;
  return score;
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
  if (!existing && hasEmailConflict(email, "", ["client", "worker"])) return null;
  const parent = existing || {
    id: autoParentIdForEmail(email),
    role: "parent",
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
  brandMenuOpen = false;
  if (String(nextView).startsWith("onboard-")) {
    saveOnboardingDraft(nextView, meta.stage || "verify", meta.id || "");
  } else if (nextView === "login" || nextView === "create-account" || nextView === "landing") {
    clearAuthNotice();
  }
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function render() {
  const app = document.querySelector("#app");
  const prefs = activeUiPreferences();
  document.documentElement.dataset.theme = prefs.theme || DEFAULT_UI_PREFERENCES.theme;
  document.documentElement.dataset.compact = prefs.compactMode ? "true" : "false";
  app.innerHTML = `
    ${renderHeader()}
    <main>
      ${renderView()}
    </main>
    ${renderProfileModal()}
    ${renderSettingsModal()}
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
          <span><strong>Age</strong>${escapeHtml(worker.age)}</span>
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

function renderSettingsModal() {
  const session = readSession();
  if (!session || !settingsModalOpen) return "";
  const user = getSessionUser();
  if (!user) return "";
  const role = session.role || "client";
  const uiPreferences = normalizeUiPreferences(user.uiPreferences);
  const title = role === "worker" ? "Student settings" : role === "parent" ? "Parent settings" : "Client settings";
  const services = role === "worker" ? user.services || [] : user.typicalServices || [];
  const moreServiceValue = role === "worker" ? customServicesValue(user.services || []) : "";

  return `
    <div class="modal-backdrop" data-action="close-settings">
      <section class="settings-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <button class="modal-close" data-action="close-settings" aria-label="Close settings">x</button>
        <div class="settings-head">
          <div>
            <p class="eyebrow">Settings</p>
            <h2>${escapeHtml(title)}</h2>
            <span class="muted">Update account details, passwords, and UI preferences.</span>
          </div>
        </div>

        <form class="settings-form" id="settingsForm">
          <input type="hidden" name="role" value="${escapeHtml(role)}" />
          <div class="settings-body">
            <section class="settings-section">
              <h3>Account</h3>
              <div class="form-grid onboarding-grid">
                <label>
                  <span>Email</span>
                  <input type="email" value="${escapeHtml(user.email)}" readonly />
                </label>
                <label>
                  <span>Name</span>
                  <input type="text" name="name" maxlength="120" placeholder="Example: Maya" required />
                </label>
                <label>
                  <span>Phone number</span>
                  <input type="tel" name="phone" value="${escapeHtml(user.phone || "")}" maxlength="30" placeholder="Optional" />
                </label>
                <label>
                  <span>Address / location</span>
                  <input type="text" name="location" value="${escapeHtml(user.location || "")}" maxlength="120" required />
                </label>
                <label>
                  <span>What language do you speak?</span>
                  <select name="language" required>${languageOptions(user.language || "English")}</select>
                </label>
                <label>
                  <span>New password</span>
                  <input type="password" name="password" maxlength="128" placeholder="Leave blank to keep current password" />
                </label>
                <label>
                  <span>Confirm new password</span>
                  <input type="password" name="confirmPassword" maxlength="128" placeholder="Leave blank to keep current password" />
                </label>
                ${
                  role === "client"
                    ? `
                      <label>
                        <span>Preferred currency</span>
                        <select name="preferredCurrency" required>${currencyOptions(user.preferredCurrency || "USD")}</select>
                      </label>
                    `
                    : ""
                }
                ${
                  role === "worker"
                    ? `
                      <label>
                        <span>Age</span>
                        <input type="number" name="age" value="${escapeHtml(user.age)}" min="13" max="17" required />
                      </label>
                      <label>
                        <span>School</span>
                        <input type="text" name="school" value="${escapeHtml(user.school || "")}" maxlength="120" required />
                      </label>
                    `
                    : ""
                }
              </div>
              <fieldset>
                <legend>${role === "worker" ? "Services offered" : "Jobs you are interested in"}</legend>
                <div class="check-grid">${serviceCheckboxes(services)}</div>
              </fieldset>
              ${
                role === "worker"
                  ? `
                    <div class="more-service-card">
                      <h3>More service</h3>
                      <label>
                        <span>Write another job or service you can offer</span>
                        <textarea
                          name="customService"
                          rows="3"
                          maxlength="180"
                          placeholder="Write another service, such as car washing or party setup"
                        >${escapeHtml(moreServiceValue)}</textarea>
                      </label>
                    </div>
                    <label>
                      <span>Short bio</span>
                      <textarea name="bio" rows="4" maxlength="500" required>${escapeHtml(user.bio || "")}</textarea>
                    </label>
                    <label>
                      <span>Certifications and skills</span>
                      <input type="text" name="certifications" value="${escapeHtml((user.certifications || []).join(", "))}" maxlength="300" required />
                    </label>
                  `
                  : ""
              }
            </section>
            <section class="settings-section">
              <h3>Interface</h3>
              <div class="ui-settings-grid">
                <label class="themed-select-label">
                  <span>Colour theme</span>
                  <select name="theme">
                    <option value="emerald" ${uiPreferences.theme === "emerald" ? "selected" : ""}>Emerald</option>
                    <option value="ocean" ${uiPreferences.theme === "ocean" ? "selected" : ""}>Ocean</option>
                    <option value="sky" ${uiPreferences.theme === "sky" ? "selected" : ""}>Sky</option>
                    <option value="forest" ${uiPreferences.theme === "forest" ? "selected" : ""}>Forest</option>
                    <option value="sunset" ${uiPreferences.theme === "sunset" ? "selected" : ""}>Sunset</option>
                    <option value="berry" ${uiPreferences.theme === "berry" ? "selected" : ""}>Berry</option>
                    <option value="midnight" ${uiPreferences.theme === "midnight" ? "selected" : ""}>Midnight</option>
                  </select>
                </label>
                <label class="toggle-chip">
                  <input type="checkbox" name="automaticFilters" ${uiPreferences.automaticFilters ? "checked" : ""} />
                  <span>Automatic filters</span>
                </label>
                <label class="toggle-chip">
                  <input type="checkbox" name="compactMode" ${uiPreferences.compactMode ? "checked" : ""} />
                  <span>Compact layout</span>
                </label>
                <label class="toggle-chip">
                  <input type="checkbox" name="smartSuggestions" ${uiPreferences.smartSuggestions ? "checked" : ""} />
                  <span>Smart suggestions</span>
                </label>
              </div>
            </section>
          </div>

          <div class="form-actions settings-actions">
            <button class="primary" type="submit">Save changes</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderHeader() {
  const session = readSession();
  return `
    <header class="topbar">
      <div class="brand-wrap">
        <button class="brand" type="button" data-action="toggle-brand-menu" aria-expanded="${brandMenuOpen ? "true" : "false"}" aria-haspopup="menu" aria-label="ParTime menu">
          <span class="brand-mark">PT</span>
          <span>
            <strong>ParTime</strong>
            <small>Student services marketplace</small>
          </span>
        </button>
        ${brandMenuOpen ? `
          <div class="brand-menu" role="menu" aria-label="ParTime menu">
            ${
              session
                ? `
                  <button type="button" role="menuitem" data-action="open-settings">Settings</button>
                  <button type="button" role="menuitem" data-action="logout">Logout</button>
                `
                : `<button type="button" role="menuitem" data-action="brand-menu-nav" data-view="login">Log in</button>`
            }
          </div>
        ` : ""}
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
  return renderLanding();
}

function renderLanding() {
  return `
    <section class="hero-band">
      <div class="hero-copy">
        <p class="eyebrow">Parent-aware part-time help</p>
        <h1>ParTime</h1>
        <p class="lede">
          A local marketplace where clients post trusted part-time jobs and students under 18 can apply with parent visibility built in.
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
      <div class="step-grid">
        <article class="info-card">
          <span class="number">1</span>
          <h3>Clients post jobs</h3>
          <p>Clients choose a title, category, date, pay type, amount, and currency. The job appears in the live student feed right away.</p>
        </article>
        <article class="info-card">
          <span class="number">2</span>
          <h3>Students apply</h3>
          <p>Students filter nearby jobs, apply when dates do not overlap, and keep a running view of applications and completed earnings.</p>
        </article>
        <article class="info-card">
          <span class="number">3</span>
          <h3>Parents monitor</h3>
          <p>A linked parent account sees applications, work in progress, completion history, and safety email updates.</p>
        </article>
      </div>
    </section>

    <section class="cta-band">
      <div>
        <p class="eyebrow">Start here</p>
        <h2>Login or create an account from the top buttons</h2>
      </div>
    </section>
  `;
}

function renderLogin() {
  const rememberedLogin = readRememberedLogin();
  return `
    <section class="auth-layout">
      <div class="auth-panel">
        ${renderAuthNotice()}
        <p class="eyebrow">Secure access</p>
        <h1>Sign in</h1>
        <p class="muted">Use the same sign-in screen for every account.</p>
        <form class="stack-form" id="loginForm">
          <label>
            <span>Email</span>
            <input type="email" name="email" value="${escapeHtml(rememberedLogin.email || "")}" maxlength="254" autocomplete="username" required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" name="password" value="${escapeHtml(rememberedLogin.password || "")}" maxlength="128" autocomplete="current-password" required />
          </label>
          <button class="primary full" type="submit">Continue</button>
        </form>
      </div>
    </section>
  `;
}

function renderCreateAccount() {
  return `
    <section class="auth-layout">
      <div class="auth-panel">
        ${renderAuthNotice()}
        <p class="eyebrow">New account</p>
        <h1>Create account</h1>
        <p class="muted">Choose the type of account you want to create.</p>
        <div class="auth-back-row">
          <button class="text-link" type="button" data-view="login">Back</button>
        </div>
        <div class="account-choice-grid">
          <button class="account-card account-card--client account-card--large" data-view="onboard-client" data-stage="verify" type="button">
            <span class="account-card-label">Client account</span>
            <strong>Create a client profile</strong>
            <small>Post jobs, review helpers, and manage payments.</small>
          </button>
          <button class="account-card account-card--worker account-card--large" data-view="onboard-worker" data-stage="verify" type="button">
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
  return routeMeta.stage === "details" ? renderClientDetailsForm() : renderClientVerificationScreen();
}

function renderClientVerificationScreen() {
  const client = getClient();
  const verificationCode = client.emailVerificationCode || "";
  const verificationSent = Boolean(client.emailVerificationSentAt);
  const verified = Boolean(client.emailVerifiedAt);

  return `
    <section class="form-page">
      <div class="page-heading-row">
        <div class="section-heading">
          <p class="eyebrow">Client sign up</p>
          <h1>Verify your email first</h1>
        </div>
        <button class="back-button back-button-top-right" type="button" data-view="create-account">Back</button>
      </div>
      ${renderAuthNotice()}
      <div class="verification-layout verification-layout--vertical">
        <form class="profile-form" id="clientOnboardingForm">
          <div class="verification-card">
            <h3>Email verification</h3>
            <p>We will send an 8 digit code to this email. Enter it here to prove the address is real.</p>
            <label>
              <span>Email</span>
              <input type="email" name="email" value="${escapeHtml(client.email)}" maxlength="254" required />
            </label>
            <div class="verification-row verification-row--stacked">
              <span class="verification-email">${escapeHtml(client.email || "Email needed first")}</span>
              <button class="secondary small" type="button" data-action="send-client-email-code">
                ${verificationSent ? "Resend code" : "Send code"}
              </button>
            </div>
            <label>
              <span>Verification code</span>
              <input
                type="text"
                name="emailVerificationCode"
                data-action="client-email-code-input"
                inputmode="numeric"
                maxlength="8"
                placeholder="Enter the 8 digit code"
                autocomplete="one-time-code"
                ${verificationSent ? "" : "disabled"}
              />
            </label>
            <div class="verification-status ${verified ? "is-confirmed" : ""}" data-verification-status="client">
              ${verified ? "Email verified. You can continue to the profile." : verificationSent ? `Code sent to ${escapeHtml(client.email)}.` : "No code sent yet."}
            </div>
            <p class="verification-note">For this prototype, the code is shown here after it is generated.</p>
            ${verificationSent ? `<div class="verification-code">${verificationCode}</div>` : ""}
          </div>
          <div class="form-actions onboarding-actions">
            <button class="primary continue-fade ${verified ? "is-visible" : ""}" type="button" data-action="continue-client-profile" ${verified ? "" : "disabled"}>
              Continue to client profile
            </button>
          </div>
        </form>
        <aside class="trust-panel">
          <h2>Why we verify</h2>
          <p>Every account starts with a real email check so the profile stays tied to a real person.</p>
        </aside>
      </div>
    </section>
  `;
}

function renderClientDetailsForm() {
  const client = getClient();
  return `
    <section class="form-page">
      <div class="page-heading-row">
        <div class="section-heading">
          <p class="eyebrow">Client sign up</p>
          <h1>Set up a client profile</h1>
        </div>
        <button class="back-button back-button-top-right" type="button" data-view="create-account">Back</button>
      </div>
      ${renderAuthNotice()}
      <form class="profile-form" id="clientOnboardingForm">
        <div class="form-grid onboarding-grid">
          <label>
            <span>Name</span>
            <input type="text" name="name" maxlength="120" placeholder="Example: Maya" required />
          </label>
          <label>
            <span>Email</span>
            <input type="email" name="email" value="${escapeHtml(client.email)}" readonly />
          </label>
          <label>
            <span>Phone number</span>
            <input type="tel" name="phone" value="${escapeHtml(client.phone || "")}" maxlength="30" placeholder="Optional" />
          </label>
          <label>
            <span>Location</span>
            <input type="text" name="location" value="${escapeHtml(client.location)}" maxlength="120" required />
          </label>
          <label>
            <span>What language do you speak?</span>
            <select name="language" required>${languageOptions(client.language)}</select>
          </label>
          <label>
            <span>Preferred currency</span>
            <select name="preferredCurrency" required>${currencyOptions(client.preferredCurrency || "USD")}</select>
          </label>
          <label>
            <span>Create password</span>
            <input type="password" name="password" maxlength="128" required />
          </label>
          <label>
            <span>Confirm password</span>
            <input type="password" name="confirmPassword" maxlength="128" required />
          </label>
        </div>
        <fieldset>
          <legend>Services usually needed</legend>
          <div class="check-grid">${serviceCheckboxes(client.typicalServices)}</div>
        </fieldset>
        <div class="form-actions">
          <button class="primary" type="submit">Log in</button>
        </div>
      </form>
    </section>
  `;
}

function renderWorkerOnboarding() {
  return routeMeta.stage === "details" ? renderWorkerDetailsForm() : renderWorkerVerificationScreen();
}

function renderWorkerVerificationScreen() {
  const worker = getWorker();
  const emailVerificationCode = worker.emailVerificationCode || "";
  const emailVerificationSent = Boolean(worker.emailVerificationSentAt);
  const parentVerificationCode = worker.parentVerificationCode || "";
  const parentVerificationSent = Boolean(worker.parentVerificationSentAt);
  const allVerified = Boolean(worker.emailVerifiedAt && worker.parentConfirmed);

  return `
    <section class="form-page">
      <div class="page-heading-row">
        <div class="section-heading">
          <p class="eyebrow">Student sign up</p>
          <h1>Verify the emails first</h1>
        </div>
        <button class="back-button back-button-top-right" type="button" data-view="create-account">Back</button>
      </div>
      ${renderAuthNotice()}
      <div class="verification-layout verification-layout--vertical">
        <form class="profile-form" id="workerOnboardingForm">
          <div class="verification-card">
            <h3>Student email verification</h3>
            <p>We will send an 8 digit code to this student email. Enter it here to prove the address is real.</p>
            <label>
              <span>Email</span>
              <input type="email" name="email" value="${escapeHtml(worker.email)}" maxlength="254" required />
            </label>
            <div class="verification-row verification-row--stacked">
              <span class="verification-email">${escapeHtml(worker.email || "Email needed first")}</span>
              <button class="secondary small" type="button" data-action="send-worker-email-code">
                ${emailVerificationSent ? "Resend code" : "Send code"}
              </button>
            </div>
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
              ${worker.emailVerifiedAt ? "Email verified." : emailVerificationSent ? `Code sent to ${escapeHtml(worker.email)}.` : "No code sent yet."}
            </div>
            <p class="verification-note">For this prototype, the code is shown here after it is generated.</p>
            ${emailVerificationSent ? `<div class="verification-code">${emailVerificationCode}</div>` : ""}
          </div>

          <div class="verification-card ${worker.emailVerifiedAt ? "" : "is-disabled"}">
            <h3>Parent verification</h3>
            <p>We will send an 8 digit code to the parent email. This step opens after the student email is verified.</p>
            <div class="verification-row">
              <button class="secondary small" type="button" data-action="send-parent-code" ${worker.emailVerifiedAt ? "" : "disabled"}>
                ${parentVerificationSent ? "Resend code" : "Send code"}
              </button>
              <span class="verification-email">${escapeHtml(worker.parentEmail || "Parent email needed first")}</span>
            </div>
            <label>
              <span>Parent email</span>
              <input type="email" name="parentEmail" value="${escapeHtml(worker.parentEmail)}" maxlength="254" required ${worker.emailVerifiedAt ? "" : "disabled"} />
            </label>
            <label>
              <span>Parent verification code</span>
              <input
                type="text"
                name="parentVerificationCode"
                inputmode="numeric"
                maxlength="8"
                value="${escapeHtml(parentVerificationCode)}"
                placeholder="Enter the 8 digit code"
                ${parentVerificationSent && worker.emailVerifiedAt ? "required" : ""}
                ${worker.emailVerifiedAt ? "" : "disabled"}
              />
            </label>
            <div class="verification-status ${worker.parentConfirmed ? "is-confirmed" : ""}">
              ${worker.parentConfirmed ? "Parent verified and account created." : worker.emailVerifiedAt ? parentVerificationSent ? `Code sent to ${escapeHtml(worker.parentEmail)}.` : "No code sent yet." : "Verify the student email first."}
            </div>
            <p class="verification-note">For this prototype, the code is shown here after it is generated.</p>
            ${parentVerificationSent ? `<div class="verification-code">${parentVerificationCode}</div>` : ""}
          </div>

          <div class="form-actions onboarding-actions">
            <button class="ghost small" type="button" data-action="verify-worker-email-code" ${emailVerificationSent ? "" : "disabled"}>
              Verify student email
            </button>
            <button class="ghost small" type="button" data-action="verify-parent-code" ${parentVerificationSent && worker.emailVerifiedAt ? "" : "disabled"}>
              Verify parent code
            </button>
            <button class="primary" type="button" data-action="continue-worker-profile" ${allVerified ? "" : "disabled"}>
              Continue to student profile
            </button>
          </div>
        </form>
        <aside class="trust-panel">
          <h2>Parent access</h2>
          <p>Once the parent email is verified, ParTime creates a parent account automatically so the parent can open the child view without another sign in.</p>
          <div class="mini-metrics">
            <span><strong>${Object.keys(state.parents).length}</strong> parent accounts</span>
            <span><strong>${state.parentEvents.length}</strong> safety updates</span>
          </div>
        </aside>
      </div>
    </section>
  `;
}

function renderWorkerDetailsForm() {
  const worker = getWorker();
  return `
    <section class="form-page">
      <div class="page-heading-row">
        <div class="section-heading">
          <p class="eyebrow">Student sign up</p>
          <h1>Create a student profile</h1>
        </div>
        <button class="back-button back-button-top-right" type="button" data-view="create-account">Back</button>
      </div>
      ${renderAuthNotice()}
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
              <span>Name</span>
              <input type="text" name="name" maxlength="120" placeholder="Example: Maya" required />
            </label>
            <label>
              <span>Email</span>
              <input type="email" name="email" value="${escapeHtml(worker.email)}" readonly />
            </label>
            <label>
              <span>Phone number</span>
              <input type="tel" name="phone" value="${escapeHtml(worker.phone || "")}" maxlength="30" placeholder="Optional" />
            </label>
            <label>
              <span>Age</span>
              <input type="number" name="age" value="${escapeHtml(worker.age)}" min="13" required />
            </label>
            <label>
              <span>Location</span>
              <input type="text" name="location" value="${escapeHtml(worker.location)}" maxlength="120" required />
            </label>
            <label>
              <span>School</span>
              <input type="text" name="school" value="${escapeHtml(worker.school)}" maxlength="120" required />
            </label>
            <label>
              <span>What language do you speak?</span>
              <select name="language" required>${languageOptions(worker.language)}</select>
            </label>
            <label>
              <span>Parent email</span>
              <input type="email" name="parentEmail" value="${escapeHtml(worker.parentEmail)}" readonly />
            </label>
            <label>
              <span>Create password</span>
              <input type="password" name="password" maxlength="128" required />
            </label>
            <label>
              <span>Confirm password</span>
              <input type="password" name="confirmPassword" maxlength="128" required />
            </label>
          </div>
        </div>
        <label>
          <span>Short bio</span>
          <textarea name="bio" rows="4" maxlength="500" required>${escapeHtml(worker.bio)}</textarea>
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
              maxlength="180"
              placeholder="Write another service, such as car washing or party setup"
            >${escapeHtml(customServicesValue(worker.services))}</textarea>
          </label>
        </div>
        <label>
          <span>Certifications and skills</span>
          <input type="text" name="certifications" value="${escapeHtml(worker.certifications.join(", "))}" maxlength="300" required />
        </label>
        <div class="consent-banner">
          Parent confirmation is required for student accounts. The linked parent view records the confirmation.
        </div>
        <div class="form-actions">
          <button class="primary" type="submit">Save student profile</button>
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
  const activeCount = clientJobs.filter((job) => job.status !== "Completed").length;
  const applicationCount = clientJobs.reduce((total, job) => total + job.applications.length, 0);
  const totalPaid = formatTotals(totalsForJobs(clientJobs.filter((job) => job.status === "Completed")));

  return `
    <section class="dashboard-shell">
      <div class="dashboard-heading">
        <div>
          <p class="eyebrow">Client dashboard</p>
          <h1>Welcome, ${escapeHtml(client.name)}</h1>
          <p>${escapeHtml(client.location)} jobs and matched students. Language: ${escapeHtml(client.language)}.</p>
        </div>
      </div>

      <div class="metric-grid">
        <article class="metric-card">
          <span>Active posts</span>
          <strong>${activeCount}</strong>
        </article>
        <article class="metric-card">
          <span>Applications</span>
          <strong>${applicationCount}</strong>
        </article>
        <article class="metric-card">
          <span>Total paid</span>
          <strong>${totalPaid}</strong>
        </article>
      </div>

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
            <h2>Automatic matches</h2>
            <span class="pill">Based on service and location</span>
          </div>
          ${renderClientMatchSummary(clientJobs)}
        </section>
      </div>

      <section class="dashboard-section">
        <div class="panel-heading">
          <h2>Active job posts</h2>
          <span>${clientJobs.length} total</span>
        </div>
        <div class="job-list">
          ${clientJobs.map(renderClientJobCard).join("") || renderEmpty("No jobs posted yet.")}
        </div>
      </section>
    </section>
  `;
}

function renderClientMatchSummary(clientJobs) {
  const openJobs = clientJobs.filter((job) => job.status === "Open");
  const matches = openJobs.flatMap((job) =>
    matchWorkers(job).map((match) => ({ ...match, jobTitle: job.title, category: job.category }))
  );

  if (!matches.length) {
    return renderEmpty("Post an open job to see suggested students.");
  }

  return `
    <div class="match-list">
      ${matches
        .slice(0, 4)
        .map(
          ({ worker, score, jobTitle, category }) => `
            <article class="mini-person">
              ${renderAvatar(worker)}
              <div>
                ${profileButton(worker)}
                <span>${escapeHtml(category)} match for ${escapeHtml(jobTitle)}</span>
                <small>${score}% fit | ${escapeHtml(ratingSummary(worker))}</small>
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
        <span>${escapeHtml(worker.age)} years old, ${escapeHtml(worker.school)}. Speaks ${escapeHtml(worker.language)}.</span>
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
  const prefs = activeUiPreferences();
  const applications = getApplicationsForWorker(worker.id);
  const inProgress = state.jobs.filter((job) => job.status === "In Progress" && job.acceptedWorkerId === worker.id);
  const feedJobs = getFilteredFeedJobs(worker.id);
  const nextTimes = worker.nextTimes || [];

  return `
    <section class="dashboard-shell">
      <div class="dashboard-heading">
        <div class="worker-heading">
          ${renderAvatar(worker, "large")}
          <div>
            <p class="eyebrow">Student dashboard</p>
            <h1>${escapeHtml(worker.name)}</h1>
            <p>${escapeHtml(worker.location)}. ${escapeHtml(worker.age)} years old. Speaks ${escapeHtml(worker.language)}. Parent confirmed.</p>
            <span class="profile-rating">${escapeHtml(ratingSummary(worker))}</span>
          </div>
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
        ${prefs.automaticFilters ? `<div class="notice-banner">Automatic filters are on, so your feed starts with nearby matching jobs.</div>` : ""}
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
  const worker = getWorker(workerId);
  const normalizedSearch = helperSearch.trim().toLowerCase();
  const prefs = activeUiPreferences();
  let jobs = state.jobs
    .filter((job) => job.status === "Open")
    .filter((job) => helperFilter === "All" || job.category === helperFilter)
    .filter((job) => {
      if (!normalizedSearch) return true;
      const client = getClient(job.clientId);
      return [job.title, job.category, job.location, client.name]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });

  if (prefs.automaticFilters && !normalizedSearch && helperFilter === "All") {
    jobs = jobs.filter((job) => worker.services.includes(job.category) || worker.location === job.location);
  }

  return jobs.sort((a, b) => {
    if (prefs.smartSuggestions) {
      const scoreDelta = jobFitScore(worker, b) - jobFitScore(worker, a);
      if (scoreDelta) return scoreDelta;
    }
    return new Date(a.date) - new Date(b.date);
  });
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
              <p>${escapeHtml(worker.age)}. ${escapeHtml(worker.school)}. ${escapeHtml(worker.location)}. Speaks ${escapeHtml(worker.language)}.</p>
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

function renderAuthNotice() {
  return authNotice ? `<div class="notice-banner auth-banner">${escapeHtml(authNotice)}</div>` : "";
}

function verificationLink(viewName, accountId, code) {
  const url = new URL(window.location.href);
  url.searchParams.set("verify", viewName);
  url.searchParams.set("id", accountId);
  url.searchParams.set("code", code);
  return url.toString();
}

function bindCommonEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.view;
      const meta = {};
      if (button.dataset.role) meta.role = button.dataset.role;
      if (button.dataset.stage) meta.stage = button.dataset.stage;
      if (!meta.stage && String(next || "").startsWith("onboard-")) meta.stage = "verify";
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

  document.querySelectorAll("[data-action='open-settings']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      brandMenuOpen = false;
      settingsModalOpen = true;
      render();
    });
  });

  document.querySelectorAll("[data-action='close-settings']").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && !element.classList.contains("modal-close")) return;
      settingsModalOpen = false;
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
      settingsModalOpen = false;
      navigate("login", { role: "client" });
    });
  });

  document.querySelectorAll("[data-action='toggle-brand-menu']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      brandMenuOpen = !brandMenuOpen;
      render();
    });
  });

  document.querySelectorAll("[data-action='brand-menu-nav']").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.view;
      brandMenuOpen = false;
      if (next === "logout") {
        clearSession();
        helperNotice = "";
        settingsModalOpen = false;
        navigate("login", { role: "client" });
        return;
      }
      navigate(next, next === "client-dashboard" ? { role: "client" } : next === "worker-dashboard" ? { role: "worker" } : next === "parent-monitor" ? { role: "parent" } : {});
    });
  });

  if (brandMenuOpen) {
    document.addEventListener(
      "click",
      (event) => {
        const brandWrap = document.querySelector(".brand-wrap");
        if (brandWrap && !brandWrap.contains(event.target)) {
          brandMenuOpen = false;
          render();
        }
      },
      { once: true }
    );
  }
}

function bindSettingsModal() {
  const form = document.querySelector("#settingsForm");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const session = readSession();
    const user = getSessionUser();
    if (!session || !user) return;

    const role = session.role || user.role || "client";
    const formData = new FormData(form);
    const password = String(formData.get("password") || "").trim();
    const confirmPassword = String(formData.get("confirmPassword") || "").trim();

    if (password || confirmPassword) {
      if (password.length < 8) {
        showFormError(form, "Please make your new password at least 8 characters long.");
        return;
      }
      if (password !== confirmPassword) {
        showFormError(form, "Your password entries do not match.");
        return;
      }
      Object.assign(user, passwordRecord(password));
    }

    user.name = String(formData.get("name") || "").trim();
    user.phone = String(formData.get("phone") || "").trim();
    user.location = String(formData.get("location") || "").trim();
    user.language = String(formData.get("language") || "English");
    user.uiPreferences = normalizeUiPreferences({
      ...user.uiPreferences,
      theme: String(formData.get("theme") || DEFAULT_UI_PREFERENCES.theme),
      automaticFilters: formData.get("automaticFilters") === "on",
      compactMode: formData.get("compactMode") === "on",
      smartSuggestions: formData.get("smartSuggestions") === "on"
    });

    if (role === "client") {
      user.preferredCurrency = String(formData.get("preferredCurrency") || "USD");
      user.typicalServices = formData.getAll("services");
    } else if (role === "worker") {
      const age = Number(formData.get("age"));
      if (!Number.isFinite(age) || age < 13 || age >= 18) {
        showFormError(form, "Student accounts must stay under 18.");
        return;
      }
      user.age = age;
      user.school = String(formData.get("school") || "").trim();
      user.bio = String(formData.get("bio") || "").trim();
      user.services = formData
        .getAll("services")
        .concat(
          String(formData.get("customService") || "")
            .split(/[,\n]/)
            .map((item) => item.trim())
            .filter(Boolean)
        )
        .filter((item, index, list) => list.indexOf(item) === index);
      user.certifications = String(formData.get("certifications") || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }

    settingsModalOpen = false;
    await saveState();
    render();
  });
}

function bindViewEvents() {
  if (view === "login") bindLogin();
  if (view === "onboard-client") bindClientOnboarding();
  if (view === "onboard-worker") bindWorkerOnboarding();
  if (view === "client-dashboard") bindClientDashboard();
  if (view === "worker-dashboard") bindWorkerDashboard();
  bindSettingsModal();
}

function bindLogin() {
  document.querySelector("#loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = normalizeEmail(formData.get("email"));
    const password = formData.get("password");
    if (!isValidEmail(email)) {
      showFormError(event.currentTarget, "Please enter a valid email address.");
      return;
    }
    const user =
      Object.values(state.clients).find((item) => normalizeEmail(item.email) === email) ||
      Object.values(state.workers).find((item) => normalizeEmail(item.email) === email) ||
      Object.values(state.parents).find((item) => normalizeEmail(item.email) === email);
    if (!user) {
      showFormError(event.currentTarget, "We could not find that email.");
      return;
    }

    const role = resolveRoleForUser(user);

    if ((role === "client" || role === "worker") && !user.emailVerifiedAt) {
      showFormError(event.currentTarget, "Please verify your email before signing in.");
      return;
    }

    if (role === "parent" && !user.passwordHash) {
      writeSession({ role, id: user.id });
      navigate("parent-monitor");
      return;
    }

    const salt = user.passwordSalt || "";
    if (hashPassword(password, salt) !== user.passwordHash) {
      showFormError(event.currentTarget, "That password does not match this account.");
      return;
    }

    writeRememberedLogin(email, password);
    writeSession({ role, id: user.id });
    if (role === "worker") navigate("worker-dashboard");
    else if (role === "parent") navigate("parent-monitor");
    else navigate("client-dashboard");
  });
}

function bindClientOnboarding() {
  const form = document.querySelector("#clientOnboardingForm");
  if (!form) return;
  const stage = routeMeta.stage || "verify";
  const client = getClient();

  const syncDraftClient = (formData) => {
    const nextEmail = normalizeEmail(formData.get("email"));
    if (client.email !== nextEmail) {
      client.emailVerificationCode = "";
      client.emailVerificationSentAt = "";
      client.emailVerifiedAt = "";
    }
    client.email = nextEmail || client.email;
    if (stage === "details") {
      client.name = String(formData.get("name") || "").trim();
      client.phone = String(formData.get("phone") || "").trim();
      client.location = String(formData.get("location") || "").trim();
      client.language = formData.get("language");
      client.preferredCurrency = formData.get("preferredCurrency");
      client.typicalServices = formData.getAll("services");
    }
    return client;
  };

  const sendCodeButton = document.querySelector("[data-action='send-client-email-code']");
  if (sendCodeButton) {
    sendCodeButton.addEventListener("click", () => {
      const formData = new FormData(form);
      const draft = syncDraftClient(formData);
      if (!isValidEmail(draft.email)) {
        showFormError(form, "Please add a valid email address first.");
        return;
      }
      const duplicate = findAccountByEmail(draft.email, draft.id);
      if (duplicate && duplicate.id !== draft.id) {
        showFormError(form, "That email address is already in use.");
        return;
      }
      if (draft.emailVerifiedAt && draft.emailVerificationCode) {
        showAuthNotice("This email is already verified.");
      }
      if (!draft.email) {
        showFormError(form, "Please add the email first.");
        return;
      }
      draft.emailVerificationCode = generateVerificationCode();
      draft.emailVerificationSentAt = new Date().toISOString();
      draft.emailVerifiedAt = "";
      saveOnboardingDraft("onboard-client", stage, draft.id);
      saveState();
      render();
    });
  }

  const verificationStatus = document.querySelector("[data-verification-status='client']");
  const codeInput = document.querySelector("[data-action='client-email-code-input']");
  if (codeInput && verificationStatus) {
    const evaluateCode = () => {
      const draft = syncDraftClient(new FormData(form));
      const code = String(codeInput.value || "").trim();
      if (!draft.emailVerificationCode) {
        verificationStatus.textContent = draft.emailVerificationSentAt ? "Waiting for a code." : "No code sent yet.";
        verificationStatus.classList.remove("is-confirmed", "is-error");
        return;
      }
      if (code.length < 8) {
        verificationStatus.textContent = "Enter the 8 digit code.";
        verificationStatus.classList.remove("is-confirmed", "is-error");
        return;
      }
      if (normalizeEmail(code) !== normalizeEmail(draft.emailVerificationCode)) {
        verificationStatus.textContent = "Incorrect code";
        verificationStatus.classList.remove("is-confirmed");
        verificationStatus.classList.add("is-error");
        return;
      }
      draft.emailVerifiedAt = new Date().toISOString();
      draft.emailVerificationCode = "";
      draft.emailVerificationSentAt = "";
      verificationStatus.textContent = "Email verified. You can continue to the profile.";
      verificationStatus.classList.remove("is-error");
      verificationStatus.classList.add("is-confirmed");
      saveOnboardingDraft("onboard-client", stage, draft.id);
      saveState();
      showAuthNotice("Email verified. You can continue to the client profile.");
      render();
    };

    codeInput.addEventListener("input", evaluateCode);
    if (client.emailVerificationCode && client.emailVerifiedAt) {
      verificationStatus.textContent = "Email verified. You can continue to the profile.";
      verificationStatus.classList.add("is-confirmed");
    }
  }

  const continueButton = document.querySelector("[data-action='continue-client-profile']");
  if (continueButton) {
    continueButton.addEventListener("click", () => {
      const formData = new FormData(form);
      const draft = syncDraftClient(formData);
      if (!draft.emailVerifiedAt) {
        showFormError(form, "Verify the email before continuing.");
        return;
      }
      saveOnboardingDraft("onboard-client", "details", draft.id);
      routeMeta = { ...routeMeta, stage: "details" };
      render();
    });
  }

  if (stage !== "details") return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const services = formData.getAll("services");
    if (!services.length) {
      showFormError(form, "Please choose at least one service.");
      return;
    }

    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    if (password.length < 8) {
      showFormError(form, "Please make your password at least 8 characters long.");
      return;
    }
    if (password.length > 128) {
      showFormError(form, "Please keep your password to 128 characters or fewer.");
      return;
    }
    if (password !== confirmPassword) {
      showFormError(form, "Your password entries do not match.");
      return;
    }

    const draft = syncDraftClient(formData);
    const duplicate = findAccountByEmail(draft.email, draft.id);
    if (duplicate && duplicate.id !== draft.id) {
      showFormError(form, "That email address is already in use.");
      return;
    }
    if (!draft.emailVerifiedAt) {
      showFormError(form, "Please verify the email address before saving the client profile.");
      return;
    }

    Object.assign(draft, passwordRecord(password));
    writeRememberedLogin(draft.email, password);
    saveOnboardingDraft("onboard-client", "details", draft.id);
    saveState();
    clearSession();
    clearOnboardingDraft();
    navigate("login", { role: "client" });
    showAuthNotice("Client profile saved. Please log in with your email and password.");
    render();
  });
}

function bindWorkerOnboarding() {
  const form = document.querySelector("#workerOnboardingForm");
  if (!form) return;
  const stage = routeMeta.stage || "verify";
  const photoInput = document.querySelector("#photoInput");
  const preview = document.querySelector(".photo-uploader img");
  const worker = getWorker();

  const syncDraftWorker = (formData) => {
    const nextEmail = normalizeEmail(formData.get("email"));
    const nextParentEmail = normalizeEmail(formData.get("parentEmail"));
    if (worker.email !== nextEmail) {
      worker.emailVerificationCode = "";
      worker.emailVerificationSentAt = "";
      worker.emailVerifiedAt = "";
    }
    worker.email = nextEmail || worker.email;
    if (stage === "details") {
      worker.name = String(formData.get("name") || "").trim();
      worker.phone = String(formData.get("phone") || "").trim();
      worker.age = Number(formData.get("age"));
      worker.location = String(formData.get("location") || "").trim();
      worker.school = String(formData.get("school") || "").trim();
      worker.language = formData.get("language");
      worker.bio = String(formData.get("bio") || "").trim();
      worker.services = formData
        .getAll("services")
        .concat(
          formData
            .get("customService")
            .split(/[,\n]/)
            .map((item) => item.trim())
            .filter(Boolean)
        )
        .filter((item, index, list) => list.indexOf(item) === index);
      worker.certifications = formData
        .get("certifications")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (worker.parentEmail !== nextParentEmail) {
      worker.parentVerificationCode = "";
      worker.parentVerificationSentAt = "";
      worker.parentVerifiedAt = "";
      worker.parentConfirmed = false;
    }
    worker.parentEmail = nextParentEmail || worker.parentEmail;
    return worker;
  };

  const sendWorkerEmailCode = () => {
    const draft = syncDraftWorker(new FormData(form));
    if (!isValidEmail(draft.email)) {
      showFormError(form, "Please add a valid student email first.");
      return;
    }
    const duplicate = findAccountByEmail(draft.email, draft.id);
    if (duplicate && duplicate.id !== draft.id) {
      showFormError(form, "That student email is already in use.");
      return;
    }
    draft.emailVerificationCode = generateVerificationCode();
    draft.emailVerificationSentAt = new Date().toISOString();
    draft.emailVerifiedAt = "";
    saveOnboardingDraft("onboard-worker", stage, draft.id);
    saveState();
    render();
  };

  const verifyWorkerEmailCode = () => {
    const formData = new FormData(form);
    const draft = syncDraftWorker(formData);
    const code = String(formData.get("emailVerificationCode") || "").trim();
    if (!draft.emailVerificationCode) {
      showFormError(form, "Send the student email code first.");
      return;
    }
    const message = verificationStateMessage(draft, code, "Student email");
    if (message) {
      showFormError(form, message);
      return;
    }
    draft.emailVerifiedAt = new Date().toISOString();
    draft.emailVerificationCode = "";
    draft.emailVerificationSentAt = "";
    saveOnboardingDraft("onboard-worker", stage, draft.id);
    saveState();
    render();
  };

  const sendParentCode = () => {
    const draft = syncDraftWorker(new FormData(form));
    if (!draft.emailVerifiedAt) {
      showFormError(form, "Verify the student email first.");
      return;
    }
    if (!isValidEmail(draft.parentEmail)) {
      showFormError(form, "Please add the parent email first.");
      return;
    }
    if (!isEmailAvailableForParent(draft.parentEmail, draft.id)) {
      showFormError(form, "That parent email is already tied to another student or client account.");
      return;
    }
    draft.parentConfirmed = false;
    draft.parentVerificationCode = generateVerificationCode();
    draft.parentVerificationSentAt = new Date().toISOString();
    draft.parentVerifiedAt = "";
    saveOnboardingDraft("onboard-worker", stage, draft.id);
    saveState();
    render();
  };

  const verifyParentCode = () => {
    const formData = new FormData(form);
    const draft = syncDraftWorker(formData);
    if (!draft.emailVerifiedAt) {
      showFormError(form, "Verify the student email first.");
      return;
    }
    const code = String(formData.get("parentVerificationCode") || "").trim();
    if (!isEmailAvailableForParent(draft.parentEmail, draft.id)) {
      showFormError(form, "That parent email is already tied to another student or client account.");
      return;
    }
    if (!draft.parentVerificationCode) {
      showFormError(form, "Send the parent code first.");
      return;
    }
    const message = verificationStateMessage({ ...draft, emailVerificationCode: draft.parentVerificationCode, emailVerificationSentAt: draft.parentVerificationSentAt, emailVerifiedAt: draft.parentVerifiedAt }, code, "Parent");
    if (message) {
      showFormError(form, message);
      return;
    }
    draft.parentConfirmed = true;
    draft.parentVerifiedAt = new Date().toISOString();
    draft.parentVerificationCode = "";
    draft.parentVerificationSentAt = "";
    createAutoParentAccount(draft);
    saveOnboardingDraft("onboard-worker", stage, draft.id);
    saveState();
    render();
  };

  const continueButton = document.querySelector("[data-action='continue-worker-profile']");
  if (continueButton) {
    continueButton.addEventListener("click", () => {
      const draft = syncDraftWorker(new FormData(form));
      if (!draft.emailVerifiedAt || !draft.parentConfirmed) {
        showFormError(form, "Verify both emails before continuing.");
        return;
      }
      saveOnboardingDraft("onboard-worker", "details", draft.id);
      routeMeta = { ...routeMeta, stage: "details" };
      render();
    });
  }

  const openParentViewButton = document.querySelector("[data-action='open-parent-view']");
  if (openParentViewButton) {
    openParentViewButton.addEventListener("click", () => {
      const draft = syncDraftWorker(new FormData(form));
      if (!isEmailAvailableForParent(draft.parentEmail, draft.id)) {
        showFormError(form, "That parent email is already tied to another student or client account.");
        return;
      }
      const parent = createAutoParentAccount(draft);
      if (parent) {
        state.selectedParentId = parent.id;
        saveState();
      }
      navigate("parent-monitor");
    });
  }

  const sendWorkerEmailButton = document.querySelector("[data-action='send-worker-email-code']");
  if (sendWorkerEmailButton) sendWorkerEmailButton.addEventListener("click", sendWorkerEmailCode);
  const verifyWorkerEmailButton = document.querySelector("[data-action='verify-worker-email-code']");
  if (verifyWorkerEmailButton) verifyWorkerEmailButton.addEventListener("click", verifyWorkerEmailCode);
  const sendParentCodeButton = document.querySelector("[data-action='send-parent-code']");
  if (sendParentCodeButton) sendParentCodeButton.addEventListener("click", sendParentCode);
  const verifyParentCodeButton = document.querySelector("[data-action='verify-parent-code']");
  if (verifyParentCodeButton) verifyParentCodeButton.addEventListener("click", verifyParentCode);

  if (stage !== "details") return;

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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const age = Number(formData.get("age"));
    if (age >= 18) {
      showFormError(form, "Student work accounts are for students under 18. Please enter an age from 13 to 17.");
      return;
    }

    const draft = syncDraftWorker(formData);
    if (!draft.services.length) {
      showFormError(form, "Please choose at least one service or write one in More.");
      return;
    }

    const duplicate = findAccountByEmail(draft.email, draft.id);
    if (duplicate && duplicate.id !== draft.id) {
      showFormError(form, "That student email is already in use.");
      return;
    }

    if (!draft.emailVerifiedAt || !draft.parentConfirmed) {
      showFormError(form, "Please finish email verification before saving the account.");
      return;
    }

    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    if (password.length < 8) {
      showFormError(form, "Please make your password at least 8 characters long.");
      return;
    }
    if (password.length > 128) {
      showFormError(form, "Please keep your password to 128 characters or fewer.");
      return;
    }
    if (password !== confirmPassword) {
      showFormError(form, "Your password entries do not match.");
      return;
    }

    const file = photoInput?.files?.[0];
    const commitWorker = (photo) => {
      Object.assign(draft, passwordRecord(password));
      if (photo) draft.photo = photo;
      writeRememberedLogin(draft.email, password);
      draft.parentVerificationCode = "";
      draft.parentVerificationSentAt = draft.parentVerificationSentAt || new Date().toISOString();
      draft.parentVerifiedAt = draft.parentVerifiedAt || new Date().toISOString();
      createAutoParentAccount(draft);
      addParentEvent(draft.id, "Registration confirmed", `${draft.name}'s student profile was confirmed for ParTime.`);
      saveState();
      writeSession({ role: "worker", id: draft.id });
      clearOnboardingDraft();
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
  form.insertAdjacentHTML("afterbegin", `<div class="form-error">${escapeHtml(message)}</div>`);
}

function resolveRoleForUser(user) {
  if (!user) return "";
  if (user.role) return user.role;
  if (Object.values(state.clients).some((item) => item.id === user.id)) return "client";
  if (Object.values(state.workers).some((item) => item.id === user.id)) return "worker";
  if (Object.values(state.parents).some((item) => item.id === user.id)) return "parent";
  return "";
}

function findAccountByEmail(email, ignoreId = "") {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return (
    Object.values(state.clients).find((item) => item.id !== ignoreId && normalizeEmail(item.email) === normalized) ||
    Object.values(state.workers).find((item) => item.id !== ignoreId && normalizeEmail(item.email) === normalized) ||
    Object.values(state.parents).find((item) => item.id !== ignoreId && normalizeEmail(item.email) === normalized) ||
    null
  );
}

function isEmailAvailableForParent(email, ignoreId = "") {
  return !hasEmailConflict(email, ignoreId, ["client", "worker"]);
}

function verificationStateMessage(record, code, label = "Email") {
  if (record.emailVerifiedAt) return `${label} already verified.`;
  if (!record.emailVerificationCode) return `Send the ${label.toLowerCase()} verification link first.`;
  if (isVerificationExpired(record.emailVerificationSentAt)) return "Expired email verification link.";
  if (normalizeEmail(code) !== normalizeEmail(record.emailVerificationCode)) return `${label} verification link is invalid or has already been used.`;
  return "";
}

function handleVerificationLinkFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const verify = params.get("verify");
  const id = params.get("id");
  const code = params.get("code");
  if (!verify || !id || !code) return false;

  const clearUrl = () => {
    try {
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    } catch {
      // ignore
    }
  };

  if (verify === "client-email") {
    const client = state.clients[id];
    if (!client) {
      showAuthNotice("This verification link no longer exists.");
      clearUrl();
      return true;
    }
    state.selectedClientId = client.id;
    const message = verificationStateMessage(client, code, "Email");
    if (message) {
      showAuthNotice(message);
      view = "onboard-client";
      routeMeta = { stage: client.emailVerifiedAt ? "details" : "verify" };
      clearUrl();
      return true;
    }
    client.emailVerifiedAt = new Date().toISOString();
    client.emailVerificationCode = "";
    client.emailVerificationSentAt = "";
    saveState();
    showAuthNotice("Email verified. You can continue to the client profile.");
    view = "onboard-client";
    routeMeta = { stage: "verify" };
    clearUrl();
    return true;
  }

  if (verify === "worker-email") {
    const worker = state.workers[id];
    if (!worker) {
      showAuthNotice("This verification link no longer exists.");
      clearUrl();
      return true;
    }
    state.selectedWorkerId = worker.id;
    const message = verificationStateMessage(worker, code, "Student email");
    if (message) {
      showAuthNotice(message);
      view = "onboard-worker";
      routeMeta = { stage: worker.emailVerifiedAt ? "verify" : "verify" };
      clearUrl();
      return true;
    }
    worker.emailVerifiedAt = new Date().toISOString();
    worker.emailVerificationCode = "";
    worker.emailVerificationSentAt = "";
    saveState();
    showAuthNotice("Student email verified.");
    view = "onboard-worker";
    routeMeta = { stage: "verify" };
    clearUrl();
    return true;
  }

  if (verify === "worker-parent") {
    const worker = state.workers[id];
    if (!worker) {
      showAuthNotice("This verification link no longer exists.");
      clearUrl();
      return true;
    }
    state.selectedWorkerId = worker.id;
    const message = verificationStateMessage(worker, code, "Parent");
    if (message) {
      showAuthNotice(message);
      view = "onboard-worker";
      routeMeta = { stage: worker.parentConfirmed ? "details" : "verify" };
      clearUrl();
      return true;
    }
    worker.parentConfirmed = true;
    worker.parentVerifiedAt = new Date().toISOString();
    worker.parentVerificationCode = "";
    worker.parentVerificationSentAt = "";
    createAutoParentAccount(worker);
    saveState();
    showAuthNotice("Parent verified. You can continue to the student profile.");
    view = "onboard-worker";
    routeMeta = { stage: "verify" };
    clearUrl();
    return true;
  }

  return false;
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
      worker.ratings = worker.ratings || [];
      const alreadyRated = worker.ratings.some((rating) => rating.jobId === job.id && rating.clientId === job.clientId);
      if (alreadyRated) return;
      worker.ratings.push({
        jobId: job.id,
        clientId: job.clientId,
        stars: Number(button.dataset.stars),
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
  const remoteState = await (async () => {
    try {
      const response = await fetch(API_STATE_ENDPOINT, {
        headers: {
          Accept: "application/json"
        }
      });
      if (response.ok) {
        const payload = await response.json();
        return payload && payload.state ? payload.state : null;
      }
    } catch (error) {
      return null;
    }
    return null;
  })();

  state = remoteState || loadLocalState() || createDefaultState();
  handleVerificationLinkFromUrl();
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
  if (!remoteState) {
    await saveState();
  }
}

bootstrap();
