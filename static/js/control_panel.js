let cpSession = null;
let allUsers = [];
let searchQuery = "";
let activeTab = "all";

async function initControlPanel() {
  await renderHeader("control-panel");
  cpSession = getSession();
  
  // Guard: only superusers can access. If not, show warning consent screen.
  if (!cpSession || !cpSession.is_superuser) {
    renderWarningScreen();
    return;
  }
  
  wireTabs();
  wireSearch();
  await loadAndRenderUsers();
  initScrollReveal();
}

function renderWarningScreen() {
  const main = qs("#control-panel-main");
  if (!main) return;
  
  main.innerHTML = "";
  
  const container = el("section", { class: "page-shell reveal reveal--visible" },
    el("div", { class: "dev-warning-container" },
      el("div", { class: "dev-warning__badge-container" },
        el("div", { class: "dev-warning__badge" }),
        el("div", { class: "dev-warning__icon" }, "⚠️")
      ),
      el("h2", { class: "dev-warning__title" }, "Developer Restricted Access"),
      el("p", { class: "dev-warning__text" }, 
        "This panel is restricted to authorized developers. Unauthorized attempts to access this registry are strictly monitored and logged."
      ),
      el("div", { class: "dev-warning__policy-box" },
        el("h4", {}, "1. Access Authorization"),
        "Access to this console is strictly limited to authorized engineering personnel under the developer agreement. Logins are tied to unique developer profiles.",
        el("h4", {}, "2. Terms & Conditions"),
        "By continuing, you acknowledge that you are an authorized developer. You agree not to distribute, export, or exploit database records. All query activity is audited in real-time.",
        el("h4", {}, "3. Privacy & Auditing"),
        "Attendee and institute profiles viewed in this portal fall under strict confidentiality rules. Any violation may result in revocation of access and disciplinary actions."
      ),
      el("div", { class: "dev-warning__actions" },
        el("button", { class: "btn btn--gold", id: "btn-warning-agree" }, "Agree & Continue"),
        el("button", { class: "btn dev-login__btn-secondary", id: "btn-warning-back" }, "Back")
      )
    )
  );
  
  main.appendChild(container);
  
  qs("#btn-warning-agree").addEventListener("click", renderLoginScreen);
  qs("#btn-warning-back").addEventListener("click", () => {
    window.location.href = "/";
  });
}

function renderLoginScreen() {
  const main = qs("#control-panel-main");
  if (!main) return;
  
  main.innerHTML = "";
  
  const container = el("section", { class: "page-shell reveal reveal--visible" },
    el("div", { class: "dev-login-container" },
      el("h2", { class: "dev-login__title" }, "Developer Console"),
      el("p", { class: "dev-login__subtitle" }, "Enter your developer credentials to unlock the database registry."),
      el("div", { class: "dev-login__error", id: "dev-login-error" }),
      el("form", { class: "dev-login__form", id: "dev-login-form" },
        el("div", { class: "dev-login__group" },
          el("label", { class: "dev-login__label" }, "Developer Username"),
          el("input", { type: "text", class: "field-input dev-login__input", id: "dev-username", required: true, autocomplete: "username" })
        ),
        el("div", { class: "dev-login__group" },
          el("label", { class: "dev-login__label" }, "Security Password"),
          el("input", { type: "password", class: "field-input dev-login__input", id: "dev-password", required: true, autocomplete: "current-password" })
        ),
        el("button", { type: "submit", class: "btn btn--gold dev-login__btn", id: "dev-submit" }, "Unlock Panel"),
        el("button", { type: "button", class: "btn dev-login__btn-secondary", id: "dev-cancel" }, "Cancel")
      )
    )
  );
  
  main.appendChild(container);
  
  qs("#dev-cancel").addEventListener("click", renderWarningScreen);
  
  qs("#dev-login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const errBox = qs("#dev-login-error");
    const submitBtn = qs("#dev-submit");
    const username = qs("#dev-username").value;
    const password = qs("#dev-password").value;
    
    errBox.style.display = "none";
    submitBtn.disabled = true;
    submitBtn.textContent = "Unlocking...";
    
    try {
      const res = await api.controlPanelLogin(username, password);
      setAuth(res);
      window.location.reload();
    } catch (err) {
      errBox.textContent = err.message || "Invalid developer credentials.";
      errBox.style.display = "block";
      submitBtn.disabled = false;
      submitBtn.textContent = "Unlock Panel";
    }
  });
}

function wireTabs() {
  qsa(".tabbar__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      qsa(".tabbar__btn").forEach((b) => b.classList.remove("tabbar__btn--active"));
      btn.classList.add("tabbar__btn--active");
      activeTab = btn.dataset.tab;
      renderUserList();
    });
  });
}

function wireSearch() {
  const searchInput = qs("#users-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", debounce((e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderUserList();
    }, 200));
  }
}

async function loadAndRenderUsers() {
  const grid = qs("#users-list-grid");
  if (!grid) return;
  
  grid.innerHTML = "";
  grid.appendChild(el("p", { class: "text-muted", style: "grid-column:1/-1; text-align:center; padding:24px;" }, "Loading accounts directory…"));
  
  try {
    allUsers = await api.controlPanelUsers();
    renderStats();
    renderUserList();
  } catch (err) {
    grid.innerHTML = "";
    grid.appendChild(
      el("div", { class: "empty-state", style: "grid-column:1/-1;" },
        el("h3", {}, "Could not load developer registry"),
        el("p", {}, err.message || "Please check your network and authorization.")
      )
    );
  }
}

function renderStats() {
  const host = qs("#control-panel-stats");
  if (!host) return;
  
  const total = allUsers.length;
  const students = allUsers.filter(u => u.role === "student").length;
  const institutions = allUsers.filter(u => u.role === "institute").length;
  const superusers = allUsers.filter(u => u.is_superuser).length;
  
  host.innerHTML = "";
  [
    [total, "Total Users"],
    [students, "Student Accounts"],
    [institutions, "Institution Accounts"],
    [superusers, "Superuser/Dev Accounts"],
  ].forEach(([num, label]) => {
    const card = el("div", { class: "stat-card" }, 
      el("div", { class: "stat-card__num" }, "0"), 
      el("div", { class: "stat-card__label" }, label)
    );
    host.appendChild(card);
    animateCount(qs(".stat-card__num", card), num);
  });
}

function renderUserList() {
  const grid = qs("#users-list-grid");
  if (!grid) return;
  
  grid.innerHTML = "";
  
  // Filter by tab
  let filtered = allUsers;
  if (activeTab === "students") {
    filtered = allUsers.filter(u => u.role === "student");
  } else if (activeTab === "institutions") {
    filtered = allUsers.filter(u => u.role === "institute");
  }
  
  // Filter by search query
  if (searchQuery) {
    filtered = filtered.filter(u => {
      const matchName = (u.name || "").toLowerCase().includes(searchQuery);
      const matchEmail = (u.email || "").toLowerCase().includes(searchQuery);
      const matchCity = (u.city || "").toLowerCase().includes(searchQuery);
      const matchId = (u.student_id || u.institution_id || "").toLowerCase().includes(searchQuery);
      const matchAffiliation = (u.affiliation || u.institution_name || "").toLowerCase().includes(searchQuery);
      return matchName || matchEmail || matchCity || matchId || matchAffiliation;
    });
  }
  
  if (filtered.length === 0) {
    grid.appendChild(
      el("div", { class: "empty-state", style: "grid-column:1/-1; padding: 48px;" },
        el("h3", {}, "No matching accounts found"),
        el("p", { class: "text-muted" }, "Try adjusting your search query or filters.")
      )
    );
    return;
  }
  
  filtered.forEach(u => {
    grid.appendChild(buildUserCard(u));
  });
}

function buildUserCard(u) {
  let roleLabel = u.role;
  let badgeClass = `user-card__role-badge--${u.role}`;
  if (u.is_superuser) {
    roleLabel = "superuser / dev";
    badgeClass = "user-card__role-badge--superuser";
  }
  
  const detailRows = [
    ["Email", u.email],
    ["City", u.city || "Not specified"],
  ];
  
  if (u.role === "student") {
    detailRows.push(["Student ID", u.student_id || "N/A"]);
    detailRows.push(["College", u.affiliation || "N/A"]);
  } else if (u.role === "institute") {
    detailRows.push(["Institution ID", u.institution_id || "N/A"]);
    detailRows.push(["Inst. Name", u.institution_name || "N/A"]);
  }
  
  const card = el("div", { class: "user-card" },
    el("div", { class: "user-card__header" },
      el("div", { class: "user-card__name" }, u.name),
      el("span", { class: `user-card__role-badge ${badgeClass}` }, roleLabel)
    ),
    el("div", { class: "user-card__details" },
      detailRows.map(([label, val]) => [
        el("span", { class: "user-card__label" }, label),
        el("span", { class: "user-card__value" }, val)
      ]).flat()
    ),
    el("div", { class: "user-card__footer" },
      el("div", { class: "user-card__status" },
        el("span", { class: `user-card__status-dot user-card__status-dot--${u.is_active ? "active" : "inactive"}` }),
        el("span", {}, u.is_active ? "Active account" : "Disabled account")
      ),
      el("span", {}, `Joined ${formatDate(u.date_joined)}`)
    )
  );
  return card;
}

document.addEventListener("DOMContentLoaded", initControlPanel);
