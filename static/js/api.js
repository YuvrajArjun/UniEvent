/* ============================================================
   api.js — thin fetch() client for the Django REST backend, plus
   the client-side auth/session cache. This replaces mockData.js +
   the old localStorage-based "session" object from the static
   prototype: everything real now lives in MySQL via Django.
   ============================================================ */

const API_BASE = (window.UNIEVENTS_API_BASE || "/api").replace(/\/$/, "");
const AUTH_KEY = "uni_auth"; // { token, user }

function getAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function setAuth(auth) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}
function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

/* Kept as its own function (rather than inlined) because every page module
   (nav.js, events.js, dashboard.js, conduct.js, achievements.js) reads the
   logged-in user this way — mirrors the old mock "session" shape:
   { id, role, name, email, city, student_id/affiliation OR institution_name/institution_id } */
function getSession() {
  return getAuth()?.user || null;
}

function firstErrorMessage(data) {
  if (!data || typeof data !== "object") return null;
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (Array.isArray(val) && val.length) return String(val[0]);
    if (typeof val === "string") return val;
  }
  return null;
}

async function apiRequest(path, { method = "GET", body, isForm = false, auth = true } = {}) {
  const headers = {};
  const authData = getAuth();
  if (auth && authData?.token) headers["Authorization"] = `Token ${authData.token}`;

  let payload = body;
  if (body !== undefined && !isForm) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: payload });
  } catch (networkErr) {
    const err = new Error("Can't reach the UniEvents server. Check your connection and try again.");
    err.status = 0;
    throw err;
  }

  if (res.status === 204) return null;

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (e) { data = null; }
  }

  if (!res.ok) {
    if (res.status === 401) clearAuth();
    const message = data?.detail || firstErrorMessage(data) || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function buildQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, v);
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

let __metaCache = null;
async function getMeta() {
  if (!__metaCache) __metaCache = await api.meta();
  return __metaCache;
}

const api = {
  // ---- auth ----
  listColleges: (params = {}) => apiRequest(`/auth/colleges/${buildQuery(params)}`, { auth: false }),
  register: (payload) => apiRequest("/auth/register/", { method: "POST", body: payload, auth: false }),
  login: (payload) => apiRequest("/auth/login/", { method: "POST", body: payload, auth: false }),
  logout: () => apiRequest("/auth/logout/", { method: "POST" }),
  me: () => apiRequest("/auth/me/"),

  // ---- meta (categories / scopes / cities) ----
  meta: () => apiRequest("/meta/", { auth: false }),

  // ---- events feed ----
  listEvents: (params = {}) => apiRequest(`/events/${buildQuery(params)}`, { auth: !!getAuth() }),
  listIntraEvents: (params = {}) => apiRequest(`/events/intra/${buildQuery(params)}`, { auth: true }),
  listInterEvents: (params = {}) => apiRequest(`/events/inter/${buildQuery(params)}`, { auth: !!getAuth() }),
  getEvent: (id) => apiRequest(`/events/${id}/`, { auth: !!getAuth() }),
  registerForEvent: (id, payload) => apiRequest(`/events/${id}/register/`, { method: "POST", body: payload }),
  myRegistrations: () => apiRequest("/registrations/mine/"),

  // ---- proposals (conduct-an-event lifecycle) ----
  listProposals: (params = {}) => apiRequest(`/proposals/${buildQuery(params)}`),
  createProposal: (payload) => apiRequest("/proposals/", { method: "POST", body: payload }),
  approveProposal: (id) => apiRequest(`/proposals/${id}/approve/`, { method: "POST" }),
  rejectProposal: (id, reason = "") => apiRequest(`/proposals/${id}/reject/`, { method: "POST", body: { rejection_reason: reason } }),
  validateToken: (token) => apiRequest("/proposals/validate-token/", { method: "POST", body: { token } }),
  publishProposal: (id, formData) => apiRequest(`/proposals/${id}/publish/`, { method: "POST", body: formData, isForm: true }),

  // ---- institute dashboard ----
  dashboardStats: () => apiRequest("/dashboard/stats/"),
  dashboardRegistrations: (params = {}) => apiRequest(`/dashboard/registrations/${buildQuery(params)}`),
  instituteEvents: () => apiRequest("/institute/events/"),
  extendEvent: (id) => apiRequest(`/institute/events/${id}/extend/`, { method: "POST" }),
  pullEvent: (id) => apiRequest(`/institute/events/${id}/pull/`, { method: "POST" }),
  terminateEvent: (id) => apiRequest(`/institute/events/${id}/terminate/`, { method: "DELETE" }),

  // ---- achievements locker ----
  listAchievements: () => apiRequest("/achievements/"),
  createAchievement: (formData) => apiRequest("/achievements/", { method: "POST", body: formData, isForm: true }),
  updateAchievement: (id, formData) => apiRequest(`/achievements/${id}/`, { method: "PUT", body: formData, isForm: true }),
  deleteAchievement: (id) => apiRequest(`/achievements/${id}/`, { method: "DELETE" }),

  // ---- bookmarks ----
  listBookmarks: () => apiRequest("/bookmarks/"),
  toggleBookmark: (eventId) => apiRequest(`/bookmarks/${eventId}/toggle/`, { method: "POST" }),

  // ---- control panel (dev only) ----
  controlPanelUsers: () => apiRequest("/auth/control-panel/users/"),
  controlPanelLogin: (username, password) =>
    apiRequest("/auth/control-panel/login/", {
      method: "POST",
      body: { username, password },
      auth: false,
    }),
};
