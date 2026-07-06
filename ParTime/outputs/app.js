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

let view = "landing";
let routeMeta = {};
let helperFilter = "All";
let helperSearch = "";
let helperNotice = "";
let profileModalWorkerId = "";

function createDefaultState() {
  return {
    selectedClientId: "c1",
    selectedWorkerId: "w1",
    selectedParentId: "p1",
    clients: {
      c1: {
        id: "c1",
        name: "Jordan Taylor",
        email: "jordan@example.com",
        phone: "",
        language: "English",
        location: "Maplewood",
        typicalServices: ["Lawn Care", "Pet Sitting", "Tech Help"],
        preferredCurrency: "USD"
      },
      c2: {
        id: "c2",
        name: "Priya Shah",
        email: "priya@example.com",
        phone: "",
        language: "English",
        location: "Cedar Grove",
        typicalServices: ["Pet Sitting", "Tutoring", "Errands"],
        preferredCurrency: "USD"
      }
    },
    workers: {
      w1: {
        id: "w1",
        name: "Maya Hernandez",
        email: "maya.student@example.com",
        phone: "",
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
        name: "Eli Brooks",
        email: "eli.student@example.com",
        phone: "",
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
        name: "Nia Patel",
        email: "nia.student@example.com",
        phone: "",
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
        ratings: [
          { jobId: "n1", clientId: "c2", stars: 5, createdAt: "2026-05-16T12:00:00" },
          { jobId: "n2", clientId: "c1", stars: 4, createdAt: "2026-06-12T12:00:00" }
        ],
        nextTimes: []
      },
      w4: {
        id: "w4",
        name: "Theo Kim",
        email: "theo.student@example.com",
        phone: "",
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
        ratings: [],
        nextTimes: []
      }
    },
    parents: {
      p1: {
        id: "p1",
        name: "Ana Hernandez",
        email: "ana.parent@example.com",
        linkedWorkerId: "w1"
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

let state = loadState();

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : createDefaultState();
  } catch (error) {
    return createDefaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function addParentEvent(workerId, type, message) {
  state.parentEvents.unshift({
    id: `e${Date.now()}`,
    workerId,
    type,
    message,
    createdAt: new Date().toISOString()
  });
}

function navigate(nextView, meta = {}) {
  view = nextView;
  routeMeta = meta;
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

function renderHeader() {
  const navItems = [
    ["landing", "Home"],
    ["login", "Login"]
  ];

  return `
    <header class="topbar">
      <button class="brand" data-view="landing" aria-label="ParTime home">
        <span class="brand-mark">PT</span>
        <span>
          <strong>ParTime</strong>
          <small>Student services marketplace</small>
        </span>
      </button>
      <nav class="main-nav" aria-label="Primary navigation">
        ${navItems
          .map(
            ([target, label]) => `
              <button class="nav-link ${view === target ? "is-active" : ""}" data-view="${target}">
                ${label}
              </button>
            `
          )
          .join("")}
      </nav>
    </header>
  `;
}

function renderView() {
  if (view === "login") return renderLogin();
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
          <button class="primary" data-view="onboard-worker">Sign up as a student</button>
          <button class="secondary" data-view="onboard-client">Hire a local student</button>
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
        <h2>Create the profile for the role you want to use</h2>
      </div>
      <div class="action-row">
        <button class="primary" data-view="onboard-client">Client sign up</button>
        <button class="secondary" data-view="onboard-worker">Student sign up</button>
      </div>
    </section>
  `;
}

function renderLogin() {
  const selectedRole = routeMeta.role || "client";
  const roleConfig = {
    client: {
      title: "Client login",
      email: getClient().email,
      onboarding: "onboard-client"
    },
    worker: {
      title: "Student login",
      email: getWorker().email,
      onboarding: "onboard-worker"
    },
    parent: {
      title: "Parent view login",
      email: getParent().email,
      onboarding: "parent-monitor"
    }
  };
  const current = roleConfig[selectedRole];

  return `
    <section class="auth-layout">
      <div class="auth-panel">
        <p class="eyebrow">Secure access</p>
        <h1>${escapeHtml(current.title)}</h1>
        <div class="segmented" role="tablist" aria-label="Choose account type">
          ${Object.keys(roleConfig)
            .map(
              (role) => `
                <button class="${selectedRole === role ? "is-selected" : ""}" data-login-role="${role}">
                  ${role === "client" ? "Client" : role === "worker" ? "Student" : "Parent"}
                </button>
              `
            )
            .join("")}
        </div>
        <form class="stack-form" id="loginForm">
          <label>
            <span>Email</span>
            <input type="email" name="email" value="${escapeHtml(current.email)}" required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" name="password" value="partime1234" required />
          </label>
          <button class="primary full" type="submit">Continue</button>
        </form>
        <button class="text-link" data-view="${current.onboarding}">Create or update this profile</button>
      </div>
      <aside class="trust-panel">
        <h2>Built for supervised work</h2>
        <p>Student accounts require a parent email, students must be under 18, and every application creates a parent-visible activity record.</p>
        <div class="mini-metrics">
          <span><strong>${Object.keys(state.workers).length}</strong> verified students</span>
          <span><strong>${state.jobs.filter((job) => job.status === "Open").length}</strong> open jobs</span>
          <span><strong>${state.parentEvents.length}</strong> parent updates</span>
        </div>
      </aside>
    </section>
  `;
}

function renderClientOnboarding() {
  const client = getClient();
  return `
    <section class="form-page">
      <div class="section-heading">
        <p class="eyebrow">Client sign up</p>
        <h1>Set up a client profile</h1>
      </div>
      <form class="profile-form" id="clientOnboardingForm">
        <div class="form-grid">
          <label>
            <span>Name</span>
            <input type="text" name="name" value="${escapeHtml(client.name)}" required />
          </label>
          <label>
            <span>Email</span>
            <input type="email" name="email" value="${escapeHtml(client.email)}" required />
          </label>
          <label>
            <span>Phone number</span>
            <input type="tel" name="phone" value="${escapeHtml(client.phone || "")}" placeholder="Optional" />
          </label>
          <label>
            <span>Location</span>
            <input type="text" name="location" value="${escapeHtml(client.location)}" required />
          </label>
          <label>
            <span>What language do you speak?</span>
            <select name="language" required>${languageOptions(client.language)}</select>
          </label>
          <label>
            <span>Preferred currency</span>
            <select name="preferredCurrency" required>${currencyOptions(client.preferredCurrency || "USD")}</select>
          </label>
        </div>
        <fieldset>
          <legend>Services usually needed</legend>
          <div class="check-grid">${serviceCheckboxes(client.typicalServices)}</div>
        </fieldset>
        <div class="form-actions">
          <button class="primary" type="submit">Save client profile</button>
        </div>
      </form>
    </section>
  `;
}

function renderWorkerOnboarding() {
  const worker = getWorker();
  return `
    <section class="form-page">
      <div class="section-heading">
        <p class="eyebrow">Student sign up</p>
        <h1>Create a student profile</h1>
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
          <div class="form-grid">
            <label>
              <span>Name</span>
              <input type="text" name="name" value="${escapeHtml(worker.name)}" required />
            </label>
            <label>
              <span>Email</span>
              <input type="email" name="email" value="${escapeHtml(worker.email)}" required />
            </label>
            <label>
              <span>Phone number</span>
              <input type="tel" name="phone" value="${escapeHtml(worker.phone || "")}" placeholder="Optional" />
            </label>
            <label>
              <span>Age</span>
              <input type="number" name="age" value="${escapeHtml(worker.age)}" min="13" required />
            </label>
            <label>
              <span>Location</span>
              <input type="text" name="location" value="${escapeHtml(worker.location)}" required />
            </label>
            <label>
              <span>School</span>
              <input type="text" name="school" value="${escapeHtml(worker.school)}" required />
            </label>
            <label>
              <span>What language do you speak?</span>
              <select name="language" required>${languageOptions(worker.language)}</select>
            </label>
            <label>
              <span>Parent email</span>
              <input type="email" name="parentEmail" value="${escapeHtml(worker.parentEmail)}" required />
            </label>
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
        <button class="secondary" data-view="onboard-client">Edit profile</button>
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
        <button class="secondary" data-view="onboard-worker">Edit profile</button>
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
        <button class="secondary" data-view="login" data-role="parent">Parent login</button>
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

function bindCommonEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.view;
      const meta = button.dataset.role ? { role: button.dataset.role } : {};
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
}

function bindViewEvents() {
  if (view === "login") bindLogin();
  if (view === "onboard-client") bindClientOnboarding();
  if (view === "onboard-worker") bindWorkerOnboarding();
  if (view === "client-dashboard") bindClientDashboard();
  if (view === "worker-dashboard") bindWorkerDashboard();
}

function bindLogin() {
  document.querySelectorAll("[data-login-role]").forEach((button) => {
    button.addEventListener("click", () => navigate("login", { role: button.dataset.loginRole }));
  });

  document.querySelector("#loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const role = routeMeta.role || "client";
    if (role === "worker") navigate("worker-dashboard");
    else if (role === "parent") navigate("parent-monitor");
    else navigate("onboard-client");
  });
}

function bindClientOnboarding() {
  document.querySelector("#clientOnboardingForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const services = formData.getAll("services");
    if (!services.length) {
      showFormError(form, "Please choose at least one service.");
      return;
    }

    const client = getClient();
    client.name = formData.get("name").trim();
    client.email = formData.get("email").trim();
    client.phone = formData.get("phone").trim();
    client.location = formData.get("location").trim();
    client.language = formData.get("language");
    client.preferredCurrency = formData.get("preferredCurrency");
    client.typicalServices = services;
    saveState();
    navigate("client-dashboard");
  });
}

function bindWorkerOnboarding() {
  const form = document.querySelector("#workerOnboardingForm");
  const photoInput = document.querySelector("#photoInput");
  const preview = document.querySelector(".photo-uploader img");

  photoInput.addEventListener("change", () => {
    const file = photoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      preview.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const age = Number(formData.get("age"));
    const customServices = formData
      .get("customService")
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const services = Array.from(new Set([...formData.getAll("services"), ...customServices]));

    if (age >= 18) {
      showFormError(form, "Student work accounts are for students under 18. Please enter an age from 13 to 17.");
      return;
    }

    if (!services.length) {
      showFormError(form, "Please choose at least one service or write one in More.");
      return;
    }

    const saveWorker = (photo) => {
      const worker = getWorker();
      worker.name = formData.get("name").trim();
      worker.email = formData.get("email").trim();
      worker.phone = formData.get("phone").trim();
      worker.age = age;
      worker.location = formData.get("location").trim();
      worker.school = formData.get("school").trim();
      worker.language = formData.get("language");
      worker.parentEmail = formData.get("parentEmail").trim();
      worker.bio = formData.get("bio").trim();
      worker.services = services;
      worker.certifications = formData
        .get("certifications")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      worker.parentConfirmed = true;
      if (photo) worker.photo = photo;

      state.parents.p1.email = worker.parentEmail;
      addParentEvent(worker.id, "Registration confirmed", `${worker.name}'s student profile was confirmed for ParTime.`);
      saveState();
      navigate("worker-dashboard");
    };

    const file = photoInput.files[0];
    if (!file) {
      saveWorker();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => saveWorker(reader.result);
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

render();
