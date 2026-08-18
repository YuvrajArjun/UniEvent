/* ============================================================
   dashboard.js — Institute Administration Hub. Applications queue,
   token-based listing portal, and inventory management now all run
   against the Django REST API.
   ============================================================ */

let dashSession = null;
let queueSearch = "";
let dashMeta = { categories: [] };
let applicationsRequestId = 0; // guards against out-of-order network responses

async function initDashboard() {
  await renderHeader("dashboard");
  dashSession = requireRole("institute");
  if (!dashSession) {
    qs("#dashboard-main").innerHTML = "";
    qs("#dashboard-main").appendChild(buildRestrictedDashboard());
    return;
  }
  dashMeta = await api.meta().catch(() => ({ categories: ["Technical", "Cultural", "Workshop", "Sports", "Other"] }));
  wireTabs();
  await renderStatCards();
  renderQueueSearch();
  await renderApplications();
  await renderRegistrations();
  renderListingPortal();
  await renderInventory();
  initScrollReveal();
}

function buildRestrictedDashboard() {
  return el("div", { class: "restricted" },
    el("div", { class: "restricted__glyph" }, "🔒"),
    el("h3", {}, "Institution login required"),
    el("p", { class: "text-muted" }, "The Administration Hub is only visible to accounts with an institutional profile. Log in from the top bar to continue.")
  );
}

function wireTabs() {
  qsa(".tabbar__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      qsa(".tabbar__btn").forEach((b) => b.classList.remove("tabbar__btn--active"));
      qsa(".tab-panel").forEach((p) => p.classList.remove("tab-panel--active"));
      btn.classList.add("tabbar__btn--active");
      qs(`#panel-${btn.dataset.tab}`).classList.add("tab-panel--active");
    });
  });
}

/* ---------- Overview stat cards ---------- */
async function renderStatCards() {
  const host = qs("#stat-cards");
  if (!host) return;
  let stats;
  try {
    stats = await api.dashboardStats();
  } catch (e) {
    stats = { pending_review: 0, active_listings: 0, seats_open: 0, tokens_issued: 0, total_registrations: 0, intra_registrations: 0, inter_registrations: 0 };
  }

  host.innerHTML = "";
  [
    [stats.pending_review, "Pending Review"],
    [stats.active_listings, "Active Listings"],
    [stats.total_registrations ?? 0, "Total Registrations"],
    [stats.intra_registrations ?? 0, "Intra-College Registrations"],
    [stats.inter_registrations ?? 0, "Inter-College Registrations"],
  ].forEach(([num, label]) => {
    const card = el("div", { class: "stat-card" }, el("div", { class: "stat-card__num" }, "0"), el("div", { class: "stat-card__label" }, label));
    host.appendChild(card);
    animateCount(qs(".stat-card__num", card), num);
  });
}

/* ---------- Applications Management Center ---------- */
async function renderApplications() {
  const grid = qs("#queue-grid");
  grid.innerHTML = "";
  grid.appendChild(el("p", { class: "text-muted", style: "grid-column:1/-1; text-align:center; padding:24px;" }, "Loading applications…"));

  const requestId = ++applicationsRequestId;
  let proposals = [];
  try {
    proposals = await api.listProposals(queueSearch ? { q: queueSearch } : {});
  } catch (err) {
    if (requestId !== applicationsRequestId) return;
    grid.innerHTML = "";
    grid.appendChild(el("div", { class: "empty-state", style: "grid-column:1/-1;" }, el("h3", {}, "Couldn't load applications"), el("p", {}, err.message || "")));
    return;
  }

  if (requestId !== applicationsRequestId) return; // a newer search already superseded this one

  const pending = proposals.filter((p) => p.status === "pending");
  const approved = proposals.filter((p) => p.status === "approved");
  const rejected = proposals.filter((p) => p.status === "rejected");

  grid.innerHTML = "";
  grid.appendChild(buildQueue("pending", "Pending", pending, buildPendingCard));
  grid.appendChild(buildQueue("approved", "Approved", approved, buildApprovedCard));
  grid.appendChild(buildQueue("rejected", "Rejected", rejected, buildRejectedCard));
}

function renderQueueSearch() {
  const host = qs("#queue-search-slot");
  if (!host) return;
  const input = el("input", { type: "search", class: "field-input", placeholder: "Search by title, student, or college…", style: "max-width:360px;" });
  host.appendChild(input);
  input.addEventListener("input", debounce((e) => { queueSearch = e.target.value; renderApplications(); }, 220));
}

function buildQueue(key, label, items, cardBuilder) {
  const body = el("div", { class: "queue__body" });
  if (items.length === 0) {
    body.appendChild(el("p", { class: "text-muted", style: "font-size:12.5px; text-align:center; padding:20px 0;" }, "Nothing here."));
  } else {
    items.forEach((item) => body.appendChild(cardBuilder(item)));
  }
  return el("div", { class: "queue" },
    el("div", { class: `queue__head queue__head--${key}` }, el("span", {}, label), el("span", { class: "queue__count" }, String(items.length))),
    body
  );
}

function scopeTag(p) {
  return p.scope ? el("span", { class: `scope-badge scope-badge--${p.scope}`, style: "margin-left:6px;" }, p.scope) : null;
}

function buildPendingCard(p) {
  return el("div", { class: "app-card" },
    el("div", { class: "app-card__title" }, p.title, scopeTag(p)),
    el("div", { class: "app-card__meta" }, `${p.student_name} · ${p.student_affiliation || "—"}`),
    el("div", { class: "app-card__meta" }, `📅 ${formatDate(p.date)} · 📍 ${p.venue}`),
    el("div", { class: "app-card__budget" }, `Budget: ${formatCurrency(p.budget)}`),
    el("div", { class: "app-card__actions" },
      el("button", { class: "btn btn--gold btn--sm", type: "button", onclick: () => approveProposal(p.id) }, "Approve & Generate Token"),
      el("button", { class: "btn btn--outline btn--sm", type: "button", onclick: () => rejectProposal(p.id) }, "Reject")
    )
  );
}
function buildApprovedCard(p) {
  return el("div", { class: "app-card" },
    el("div", { class: "app-card__title" }, p.title, scopeTag(p)),
    el("div", { class: "app-card__meta" }, `${p.student_name} · ${formatDate(p.date)}`),
    el("div", { class: "app-card__token" },
      el("span", {}, p.token),
      el("button", { class: "btn btn--outline btn--sm", type: "button", onclick: () => copyToken(p.token) }, "Copy")
    ),
    p.published ? el("div", { class: "status-tag status-tag--active", style: "margin-top:8px; display:inline-block;" }, "Published") : null
  );
}
function buildRejectedCard(p) {
  return el("div", { class: "app-card" },
    el("div", { class: "app-card__title" }, p.title, scopeTag(p)),
    el("div", { class: "app-card__meta" }, `${p.student_name} · ${formatDate(p.date)}`),
    el("div", { class: "app-card__meta", style: "margin-top:6px; color:var(--danger, #ef4444);" },
      `Reason: ${p.rejection_reason || "Venue is already booked."}`
    )
  );
}

async function approveProposal(id) {
  try {
    await api.approveProposal(id);
    toast("Token generated and shared with the student.", "success");
    await renderApplications();
    await renderStatCards();
  } catch (err) {
    toast(err.message || "Couldn't approve this proposal.", "error");
  }
}

async function rejectProposal(id) {
  const reason = prompt("Enter a rejection reason for the student:", "Venue is already booked.");
  if (reason === null) return; // user cancelled

  try {
    await api.rejectProposal(id, reason.trim() || "Venue is already booked.");
    toast("Proposal rejected.", "info");
    await renderApplications();
    await renderStatCards();
  } catch (err) {
    toast(err.message || "Couldn't reject this proposal.", "error");
  }
}

/* ---------- Student Registrations Management ---------- */
let activeRegTypeFilter = "All";
let regSearchTerm = "";

async function renderRegistrations() {
  const filterHost = qs("#reg-filter-slot");
  const listHost = qs("#registrations-list");
  if (!listHost) return;

  if (filterHost) {
    filterHost.innerHTML = "";
    const filterGroup = el("div", { style: "display:flex; gap:8px; align-items:center;" },
      el("input", { type: "search", class: "field-input", placeholder: "Search student, ID, or event…", style: "max-width:260px;", value: regSearchTerm }),
      el("select", { class: "field-select", id: "reg-type-select", style: "max-width:180px;" },
        el("option", { value: "All", selected: activeRegTypeFilter === "All" }, "All Registrations"),
        el("option", { value: "INTRA_COLLEGE", selected: activeRegTypeFilter === "INTRA_COLLEGE" }, "Intra-College Only"),
        el("option", { value: "INTER_COLLEGE", selected: activeRegTypeFilter === "INTER_COLLEGE" }, "Inter-College Only")
      )
    );
    filterHost.appendChild(filterGroup);

    qs("input[type=search]", filterHost).addEventListener("input", debounce((e) => {
      regSearchTerm = e.target.value;
      fetchAndRenderRegistrations(listHost);
    }, 220));

    qs("#reg-type-select", filterHost).addEventListener("change", (e) => {
      activeRegTypeFilter = e.target.value;
      fetchAndRenderRegistrations(listHost);
    });
  }

  await fetchAndRenderRegistrations(listHost);
}

async function fetchAndRenderRegistrations(host) {
  host.innerHTML = "";
  host.appendChild(el("p", { class: "text-muted" }, "Loading registrations…"));

  let regs = [];
  try {
    regs = await api.dashboardRegistrations({ type: activeRegTypeFilter, q: regSearchTerm });
  } catch (e) {
    host.innerHTML = "";
    host.appendChild(el("div", { class: "empty-state" }, el("h3", {}, "Couldn't load registrations"), el("p", {}, e.message || "")));
    return;
  }

  host.innerHTML = "";
  if (regs.length === 0) {
    host.appendChild(el("div", { class: "empty-state" },
      el("div", { class: "empty-state__glyph" }, "📑"),
      el("h3", {}, "No registrations found"),
      el("p", {}, "Student registrations for your college's events will appear here.")
    ));
    return;
  }

  regs.forEach((r) => {
    const isIntra = r.registration_type === "INTRA_COLLEGE";
    const badgeClass = isIntra ? "status-badge--approved" : "status-badge--pending";
    const badgeLabel = isIntra ? "INTRA-COLLEGE" : "INTER-COLLEGE";

    const row = el("div", { class: "inventory-row", style: "align-items:flex-start; padding:16px;" },
      el("div", { class: "inventory-row__info" },
        el("div", { style: "font-weight:600; font-size:15px;" }, r.attendee_name,
          el("span", { class: `status-badge ${badgeClass}`, style: "margin-left:8px; font-size:11px;" }, badgeLabel)
        ),
        el("div", { class: "text-muted", style: "font-size:13px; margin-top:4px;" }, `ID: ${r.attendee_id} · College: ${r.affiliation} · Email: ${r.email}`),
        el("div", { style: "font-weight:500; font-size:13.5px; margin-top:6px; color:var(--text-main);" }, `Event: ${r.event_title}`),
        el("div", { class: "text-muted", style: "font-size:12px; margin-top:4px;" }, `Hash: ${r.transaction_hash} · Date: ${formatDate(r.registered_at)}`)
      ),
      el("div", { style: "text-align:right;" },
        el("div", { style: "font-weight:700; font-size:16px; color:var(--gold-light);" }, formatCurrency(r.total_paid)),
        r.gst ? el("div", { class: "text-muted", style: "font-size:11.5px;" }, `(Fee ${formatCurrency(r.fee_paid)} + GST ${formatCurrency(r.gst)})`) : null
      )
    );
    host.appendChild(row);
  });
}

/* ---------- Event Listing Portal ---------- */
function renderListingPortal() {
  const host = qs("#listing-portal");
  host.innerHTML = "";

  const tokenForm = el("form", { id: "token-form", class: "modal", style: "max-width:480px; padding:24px;", novalidate: "true" },
    el("label", { class: "field-label" }, "Approved Proposal Token",
      el("input", { class: "field-input", id: "token-input", placeholder: "UNI-EVNT-…", required: "true" }),
      el("span", { class: "field-hint" }, "Paste the token generated when you approved a student's proposal.")
    ),
    el("button", { type: "submit", class: "btn btn--gold btn--block" }, "Validate Token")
  );
  host.appendChild(tokenForm);
  host.appendChild(el("div", { id: "listing-result", class: "mt-32" }));

  tokenForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const tokenInput = qs("#token-input", tokenForm);
    const token = tokenInput.value.trim();
    const resultHost = qs("#listing-result");
    resultHost.innerHTML = "";

    if (!token) { markInvalid(tokenInput, "Paste a token first."); return; }
    try {
      const proposal = await api.validateToken(token);
      clearInvalid(tokenInput);
      resultHost.appendChild(buildPublishForm(proposal));
    } catch (err) {
      markInvalid(tokenInput, err.message || "No approved proposal matches that token.");
      toast(err.message || "No approved proposal matches that token.", "error");
    }
  });
}

function buildPublishForm(proposal) {
  let uploadedFile = null;

  const form = el("form", { id: "publish-form", class: "modal", style: "max-width:560px; padding:24px;", novalidate: "true" },
    el("div", { class: "auth-modal__eyebrow" }, "Token verified ✓"),
    el("h3", { style: "margin:6px 0 4px; font-size:19px;" }, proposal.title),
    proposal.scope ? el("span", { class: `scope-badge scope-badge--${proposal.scope}` }, proposal.scope) : null,
    el("div", { class: "field-row", style: "margin-top:16px;" },
      el("label", { class: "field-label" }, "Category",
        el("select", { class: "field-select", id: "pub-category" })
      ),
      el("label", { class: "field-label" }, "Registration Fee (₹, 0 = free)",
        el("input", { type: "number", min: "0", class: "field-input", id: "pub-fee", value: "0" })
      )
    ),
    el("div", { class: "field-row" },
      el("label", { class: "field-label" }, "Seats Available",
        el("input", { type: "number", min: "1", class: "field-input", id: "pub-seats", value: "100" })
      ),
      el("label", { class: "field-label" }, "Tags (comma separated)",
        el("input", { class: "field-input", id: "pub-tags", placeholder: "Workshop, Beginner" })
      )
    ),
    el("label", { class: "field-label" }, "Cover Image (optional)",
      el("div", { class: "cover-upload", id: "pub-cover-trigger" }, "Click to upload a cover photo — otherwise a related image is fetched automatically."),
      el("input", { type: "file", accept: "image/*", id: "pub-cover-input", style: "display:none;" }),
      el("div", { id: "pub-cover-preview-host" })
    ),
    el("button", { type: "submit", class: "btn btn--gold btn--block" }, "Publish to Public Events Feed")
  );

  qs("#pub-category", form).innerHTML = (dashMeta.categories || []).map((c) => `<option>${c}</option>`).join("");

  const coverTrigger = qs("#pub-cover-trigger", form);
  const coverInput = qs("#pub-cover-input", form);
  coverTrigger.addEventListener("click", () => coverInput.click());
  coverInput.addEventListener("change", () => {
    const file = coverInput.files[0];
    if (!file) return;
    uploadedFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      qs("#pub-cover-preview-host", form).innerHTML = "";
      qs("#pub-cover-preview-host", form).appendChild(el("img", { class: "cover-preview", src: reader.result }));
    };
    reader.readAsDataURL(file);
  });

  const submitBtn = qs("button[type=submit]", form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const seats = qs("#pub-seats", form);
    if (!seats.value || Number(seats.value) < 1) { markInvalid(seats, "Enter at least 1 seat."); toast("Please fix the highlighted fields.", "error"); return; }
    clearInvalid(seats);

    const fd = new FormData();
    fd.append("category", qs("#pub-category", form).value);
    fd.append("fee", qs("#pub-fee", form).value || "0");
    fd.append("seats_total", seats.value);
    fd.append("tags", qs("#pub-tags", form).value);
    if (uploadedFile) fd.append("cover_upload", uploadedFile);
    else fd.append("cover_image_url", coverImageFor(proposal.title));

    submitBtn.disabled = true;
    try {
      await api.publishProposal(proposal.id, fd);
      toast("Event published to the public feed.", "success");
      fireConfettiBurst();
      renderListingPortal();
      await renderInventory();
      await renderApplications();
      await renderStatCards();
    } catch (err) {
      toast(err.message || "Couldn't publish this event.", "error");
      submitBtn.disabled = false;
    }
  });

  return form;
}

/* ---------- Active Inventory Overview ---------- */
async function renderInventory() {
  const host = qs("#inventory-list");
  host.innerHTML = "";
  host.appendChild(el("p", { class: "text-muted" }, "Loading inventory…"));

  let all = [];
  try {
    all = await api.instituteEvents();
  } catch (err) {
    host.innerHTML = "";
    host.appendChild(el("div", { class: "empty-state" }, el("h3", {}, "Couldn't load inventory"), el("p", {}, err.message || "")));
    return;
  }

  host.innerHTML = "";
  if (all.length === 0) {
    host.appendChild(el("div", { class: "empty-state" },
      el("div", { class: "empty-state__glyph" }, "📭"),
      el("h3", {}, "No live listings yet"),
      el("p", {}, "Events you publish via the Event Listing Portal will appear here.")
    ));
    return;
  }

  all.forEach((ev) => {
    const statusClass = ev.status === "pulled" ? "pulled" : ev.status === "extended" ? "extended" : "active";
    const row = el("div", { class: "inventory-row" },
      el("div", { class: "inventory-row__info" },
        el("div", { style: "font-weight:600; font-size:14px;" }, ev.title, ev.scope ? el("span", { class: `scope-badge scope-badge--${ev.scope}`, style: "margin-left:8px;" }, ev.scope) : null),
        el("div", { class: "text-muted", style: "font-size:12.5px;" }, `📅 ${formatDate(ev.date)} · 📍 ${ev.venue} · ${ev.seats_left} seats`)
      ),
      el("span", { class: `status-tag status-tag--${statusClass}` }, ev.status),
      el("div", { style: "display:flex; gap:8px;" },
        el("button", { class: "btn btn--outline btn--sm", type: "button", onclick: () => extendListing(ev.id) }, "Extend +7d"),
        el("button", { class: "btn btn--outline btn--sm", type: "button", onclick: () => pullListing(ev.id) }, "Pull"),
        el("button", { class: "btn btn--danger btn--sm", type: "button", onclick: () => terminateListing(ev.id) }, "Terminate")
      )
    );
    host.appendChild(row);
  });
}

async function extendListing(id) {
  try {
    await api.extendEvent(id);
    toast("Listing extended by 7 days.", "success");
    await renderInventory();
  } catch (err) {
    toast(err.message || "Couldn't extend this listing.", "error");
  }
}
async function pullListing(id) {
  const ok = await confirmDialog({
    title: "Pull this listing?",
    message: "This event will be hidden from the public directory. You can't undo this from here — you'd need to publish it again.",
    glyph: "⏸", confirmLabel: "Pull Listing",
  });
  if (!ok) return;
  try {
    await api.pullEvent(id);
    toast("Listing pulled from the active directory.", "info");
    await renderInventory();
    await renderStatCards();
  } catch (err) {
    toast(err.message || "Couldn't pull this listing.", "error");
  }
}
async function terminateListing(id) {
  const ok = await confirmDialog({
    title: "Terminate this listing?",
    message: "This permanently deletes the event from your inventory. This cannot be undone.",
    glyph: "🗑", confirmLabel: "Terminate Permanently",
  });
  if (!ok) return;
  try {
    await api.terminateEvent(id);
    toast("Listing terminated and removed permanently.", "error");
    await renderInventory();
    await renderStatCards();
  } catch (err) {
    toast(err.message || "Couldn't terminate this listing.", "error");
  }
}

document.addEventListener("DOMContentLoaded", initDashboard);
