/* ============================================================
   nav.js — Global Navigation Layout + Authentication Portal.
   Login/signup/logout now call the Django REST API (api.js) instead
   of a local mock user array; the "session" object shape is kept
   identical to the old prototype so downstream pages barely changed.
   ============================================================ */

const DEMO_CREDENTIALS = {
  student: { email: "priya@college.edu", password: "student123" },
  institute: { email: "admin@fergusson.edu", password: "institute123" },
};

async function renderHeader(activePage) {
  const host = qs("#app-header");
  if (!host) return;
  const session = getSession();
  const meta = await getMeta().catch(() => ({ cities: [] }));

  host.innerHTML = "";
  host.appendChild(buildHeaderBar(activePage, session, meta.cities || []));
  host.appendChild(buildMobileNav(activePage, session));
  qs("#bottom-tabbar")?.remove();
  document.body.appendChild(buildBottomTabbar(activePage, session));

  /* The modal is intentionally appended to <body> — NOT inside #app-header,
     so it gets its own body-level stacking context rather than being
     trapped under <main> by a shared z-index tie. */
  qs("#auth-overlay")?.remove();
  document.body.appendChild(buildAuthModal());

  wireHeaderEvents();
}

function buildHeaderBar(activePage, session, cities) {
  const cityListId = "city-datalist";
  const cityOptions = cities.map((c) => `<option value="${c}"></option>`).join("");

  const links = [
    navLink("/", "Home", activePage === "home"),
    navLink("/#feed", "Events Directory", activePage === "events"),
    navLink("/scan-ticket/", "Scan Ticket", activePage === "scan-ticket"),
    navLink("/about/", "About Us", activePage === "about")
  ];

  const bar = el("header", { class: "topbar" },
    el("div", { class: "topbar__inner" },
      el("div", { class: "topbar__brand" },
        el("a", { href: "/", class: "brand-mark", "aria-label": "UniEvents home" },
          el("img", { src: "/static/assets/unievents-text.png", alt: "UniEvents", class: "brand-mark__word" })
        ),
        el("input", {
          class: "city-select", id: "city-input", list: cityListId,
          placeholder: "Search a city…", value: getCity(), "aria-label": "Region filter",
        }),
        el("datalist", { id: cityListId, html: cityOptions })
      ),
      el("nav", { class: "topbar__links" }, ...links),
      el("div", { class: "topbar__actions", id: "topbar-actions" },
        buildActionsForSession(session),
        el("button", { class: "nav-toggle", id: "nav-toggle", "aria-label": "Toggle menu", "aria-expanded": "false" }, "☰")
      )
    )
  );
  return bar;
}

function buildMobileNav(activePage, session) {
  const links = [
    el("a", { href: "/" }, "Home"),
    el("a", { href: "/#feed" }, "Events Directory"),
    el("a", { href: "/scan-ticket/" }, "Scan Ticket"),
    el("a", { href: "/about/" }, "About Us"),
  ];
  if (session?.role === "student") {
    links.push(el("a", { href: "/conduct-event/" }, "Conduct Request"));
    links.push(el("a", { href: "/achievements/" }, "Achievements"));
  }
  if (session?.role === "institute") {
    links.push(el("a", { href: "/dashboard/" }, "Administration Hub"));
  }
  return el("nav", { class: "mobile-nav", id: "mobile-nav" }, ...links);
}

const TAB_ICONS = {
  home: '<svg viewBox="0 0 24 24"><path d="M4 11.5L12 4l8 7.5" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v10h12V10" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  events: '<svg viewBox="0 0 24 24"><path d="M4 5h16v15H4z" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 9.5h16M8 3v3.5M16 3v3.5" stroke-width="1.7" stroke-linecap="round"/></svg>',
  achievements: '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="5.5" stroke-width="1.7"/><path d="M8.5 13.5L7 21l5-2.6 5 2.6-1.5-7.5" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  dashboard: '<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5" stroke-width="1.7"/><path d="M4.5 20c1-4 4-6 7.5-6s6.5 2 7.5 6" stroke-width="1.7" stroke-linecap="round"/></svg>',
};

function buildBottomTabbar(activePage, session) {
  const centerHref = session?.role === "institute" ? "/dashboard/" : "/conduct-event/";
  const centerLabel = session?.role === "institute" ? "Manage" : "Create";

  const tab = (href, label, iconKey, isActive) =>
    el("a", { href, class: `bottom-tabbar__item${isActive ? " bottom-tabbar__item--active" : ""}` },
      el("span", { html: TAB_ICONS[iconKey] }),
      el("span", {}, label)
    );

  const contextTab = session?.role === "student"
    ? tab("/achievements/", "Locker", "achievements", activePage === "achievements")
    : session?.role === "institute"
      ? tab("/dashboard/", "Hub", "dashboard", activePage === "dashboard")
      : tab("/about/", "About", "achievements", activePage === "about");

  const lastTab = session
    ? el("button", { class: "bottom-tabbar__item", type: "button", id: "bottom-tab-logout" },
        el("span", { html: TAB_ICONS.profile }),
        el("span", {}, session.name.split(" ")[0])
      )
    : el("button", { class: "bottom-tabbar__item", type: "button", id: "bottom-tab-login" },
        el("span", { html: TAB_ICONS.profile }),
        el("span", {}, "Log In")
      );

  return el("nav", { class: "bottom-tabbar", id: "bottom-tabbar" },
    tab("/", "Home", "home", activePage === "home"),
    tab("/#feed", "Events", "events", activePage === "events"),
    el("a", { href: centerHref, class: "bottom-tabbar__item" },
      el("span", { class: "bottom-tabbar__center" }, "+"),
      el("span", { class: "bottom-tabbar__center-label" }, centerLabel)
    ),
    contextTab,
    lastTab
  );
}

function navLink(href, label, isActive) {
  return el("a", { href, class: `nav-link${isActive ? " nav-link--active" : ""}` }, label);
}

function buildActionsForSession(session) {
  if (!session) {
    return el("button", { class: "btn btn--gold", id: "btn-open-login" }, "Log In");
  }
  if (session.is_superuser) {
    return el("div", { class: "session-cluster" },
      buildProfilePill(session)
    );
  }
  if (session.role === "student") {
    return el("div", { class: "session-cluster" },
      el("a", { href: "/conduct-event/", class: "btn btn--ghost" }, "Conduct Request"),
      el("a", { href: "/achievements/", class: "btn btn--ghost" }, "Achievements"),
      buildProfilePill(session)
    );
  }
  return el("div", { class: "session-cluster" },
    el("a", { href: "/dashboard/", class: "btn btn--ink" }, "Administration Hub"),
    buildProfilePill(session)
  );
}

function buildProfilePill(session) {
  const initials = session.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const college = session.role === "student" ? session.affiliation : session.institution_name;
  return el("div", { class: "profile-pill" },
    el("span", { class: "profile-pill__avatar" }, initials),
    el("span", { class: "profile-pill__text" },
      el("span", { class: "profile-pill__name" }, session.name.split(" ")[0]),
      college ? el("span", { class: "profile-pill__college" }, college) : null
    ),
    el("button", { class: "profile-pill__logout", id: "btn-logout", title: "Log out" }, "⎋")
  );
}

/* ---------- Auth modal (login + create account) ---------- */
function buildAuthModal() {
  return el("div", { class: "modal-overlay", id: "auth-overlay" },
    el("div", { class: "modal auth-modal", role: "dialog", "aria-modal": "true", id: "auth-modal-inner" },
      el("button", { class: "modal__close", id: "auth-close", type: "button" }, "×"),
      el("img", { src: "/static/assets/unievents-full.png", alt: "UniEvents", class: "auth-modal__logo" }),
      el("div", { id: "auth-modal-body" })
    )
  );
}

function renderLoginBody(container, presetRole) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "auth-modal__eyebrow" }, "Sign in to UniEvents"));
  container.appendChild(el("h2", { class: "auth-modal__title" }, "Log in to UniEvents"));
  container.appendChild(
    el("div", { class: "role-toggle", id: "role-toggle" },
      el("button", { class: `role-toggle__opt${presetRole !== "institute" ? " role-toggle__opt--active" : ""}`, type: "button", "data-role": "student" }, "Student"),
      el("button", { class: `role-toggle__opt${presetRole === "institute" ? " role-toggle__opt--active" : ""}`, type: "button", "data-role": "institute" }, "Institution")
    )
  );
  const form = el("form", { id: "auth-form" },
    el("label", { class: "field-label" }, "Email",
      el("input", { type: "email", id: "auth-email", class: "field-input", placeholder: "you@college.edu", required: "true" })
    ),
    el("label", { class: "field-label" }, "Password",
      el("input", { type: "password", id: "auth-password", class: "field-input", placeholder: "••••••••", required: "true" })
    ),
    el("button", { type: "submit", class: "btn btn--gold btn--block" }, "Enter Platform")
  );
  container.appendChild(form);
  container.appendChild(el("div", { class: "auth-modal__demo", id: "auth-demo-hint" }));
  container.appendChild(
    el("p", { class: "auth-switch" }, "New here? ",
      el("button", { type: "button", class: "auth-switch__link", id: "go-signup" }, "Create an account"))
  );

  let currentRole = presetRole === "institute" ? "institute" : "student";
  updateDemoHint(currentRole);

  qsa(".role-toggle__opt", container).forEach((btn) => {
    btn.addEventListener("click", () => {
      qsa(".role-toggle__opt", container).forEach((b) => b.classList.remove("role-toggle__opt--active"));
      btn.classList.add("role-toggle__opt--active");
      currentRole = btn.dataset.role;
      updateDemoHint(currentRole);
    });
  });

  function updateDemoHint(role) {
    const demo = DEMO_CREDENTIALS[role];
    qs("#auth-demo-hint", container).innerHTML = `Demo credentials — <strong>${demo.email}</strong> / <strong>${demo.password}</strong>`;
  }

  const submitBtn = qs("button[type=submit]", form);
  qs("#auth-form", container).addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = qs("#auth-email", container).value.trim().toLowerCase();
    const password = qs("#auth-password", container).value;
    submitBtn.disabled = true;
    try {
      const res = await api.login({ role: currentRole, email, password });
      setAuth(res);
      toast(`Welcome back, ${res.user.name.split(" ")[0]}.`, "success");
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      toast(err.message || "No matching account for that role. Try the demo credentials, or create an account.", "error");
      submitBtn.disabled = false;
    }
  });

  qs("#go-signup", container).addEventListener("click", () => renderSignupBody(container, currentRole));
}

function renderSignupBody(container, presetRole) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "auth-modal__eyebrow" }, "Create Your UniEvents Account"));
  container.appendChild(el("h2", { class: "auth-modal__title" }, "Join the platform"));
  container.appendChild(
    el("div", { class: "role-toggle", id: "signup-role-toggle" },
      el("button", { class: `role-toggle__opt${presetRole !== "institute" ? " role-toggle__opt--active" : ""}`, type: "button", "data-role": "student" }, "Student"),
      el("button", { class: `role-toggle__opt${presetRole === "institute" ? " role-toggle__opt--active" : ""}`, type: "button", "data-role": "institute" }, "Institution")
    )
  );

  const cityListId = "signup-city-datalist";
  getMeta().then((meta) => {
    const cityOptions = (meta.cities || []).map((c) => `<option value="${c}"></option>`).join("");
    const list = qs(`#${cityListId}`, container);
    if (list) list.innerHTML = cityOptions;
  });

  let role = presetRole === "institute" ? "institute" : "student";
  let collegesList = [];

  function loadCollegesForRole() {
    const params = role === "institute" ? { role: "institute" } : {};
    return api.listColleges(params).then((data) => {
      collegesList = data || [];
      renderRoleFields();
    }).catch(() => {});
  }

  loadCollegesForRole();

  const fieldsHost = el("div", { id: "signup-fields" });
  const form = el("form", { id: "signup-form" },
    el("label", { class: "field-label" }, "Full Name",
      el("input", { class: "field-input", id: "su-name", required: "true", placeholder: role === "institute" ? "e.g. Dr. Meera Iyer" : "e.g. Ananya Kulkarni" })
    ),
    fieldsHost,
    el("label", { class: "field-label" }, "Email",
      el("input", { type: "email", class: "field-input", id: "su-email", required: "true", placeholder: "you@college.edu" })
    ),
    el("label", { class: "field-label" }, "Password",
      el("input", { type: "password", class: "field-input", id: "su-password", required: "true", minlength: "6", placeholder: "At least 6 characters" })
    ),
    el("label", { class: "field-label" }, "City",
      el("input", { class: "field-input", id: "su-city", list: cityListId, placeholder: "Search your city…", value: getCity() }),
      el("datalist", { id: cityListId })
    ),
    el("button", { type: "submit", class: "btn btn--gold btn--block" }, "Create Account")
  );
  container.appendChild(form);
  container.appendChild(
    el("p", { class: "auth-switch" }, "Already have an account? ",
      el("button", { type: "button", class: "auth-switch__link", id: "go-login" }, "Log in"))
  );

  function renderRoleFields() {
    fieldsHost.innerHTML = "";
    const collegeOptions = [
      '<option value="">-- Select College / Institution --</option>',
      ...collegesList.map((c) => `<option value="${c.id}">${c.name} (${c.code})</option>`),
    ].join("");

    if (role === "student") {
      fieldsHost.appendChild(
        el("label", { class: "field-label" }, "College / Institution",
          el("select", { class: "field-select", id: "su-college", required: "true", html: collegeOptions })
        )
      );
      fieldsHost.appendChild(
        el("label", { class: "field-label" }, "Student ID",
          el("input", { class: "field-input", id: "su-studentid", required: "true", placeholder: "e.g. STU-2298" })
        )
      );
    } else {
      fieldsHost.appendChild(
        el("label", { class: "field-label" }, "Select Admin Institution",
          el("select", { class: "field-select", id: "su-college", required: "true", html: collegeOptions })
        )
      );
    }
  }

  qsa("#signup-role-toggle .role-toggle__opt", container).forEach((btn) => {
    btn.addEventListener("click", () => {
      qsa("#signup-role-toggle .role-toggle__opt", container).forEach((b) => b.classList.remove("role-toggle__opt--active"));
      btn.classList.add("role-toggle__opt--active");
      role = btn.dataset.role;
      loadCollegesForRole();
    });
  });

  const submitBtn = qs("button[type=submit]", form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = qs("#su-email", container).value.trim().toLowerCase();
    const collegeSelect = qs("#su-college", container);
    if (!email) return;

    const collegeId = collegeSelect?.value ? parseInt(collegeSelect.value) : null;
    const selectedOptionText = collegeSelect?.options[collegeSelect.selectedIndex]?.text || "";

    const payload = {
      role,
      name: qs("#su-name", container).value.trim(),
      email,
      password: qs("#su-password", container).value,
      city: qs("#su-city", container).value.trim(),
      college_id: collegeId,
    };

    if (role === "student") {
      payload.affiliation = selectedOptionText.replace(/\s*\(\d+\)$/, "").trim();
      payload.student_id = qs("#su-studentid", container).value.trim();
    } else {
      payload.institution_name = selectedOptionText.replace(/\s*\(\d+\)$/, "").trim();
    }

    submitBtn.disabled = true;
    try {
      const res = await api.register(payload);
      if (payload.city) setCity(payload.city);
      setAuth(res);
      toast(`Welcome to UniEvents, ${res.user.name.split(" ")[0]}.`, "success");
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      toast(err.message || "Could not create that account. Try a different email.", "error");
      submitBtn.disabled = false;
    }
  });

  qs("#go-login", container).addEventListener("click", () => renderLoginBody(container, role));
}

function wireHeaderEvents() {
  const overlay = qs("#auth-overlay");
  const openBtn = qs("#btn-open-login");
  const closeBtn = qs("#auth-close");
  const logoutBtn = qs("#btn-logout");
  const body = qs("#auth-modal-body");
  const navToggle = qs("#nav-toggle");
  const mobileNav = qs("#mobile-nav");
  const cityInput = qs("#city-input");

  renderLoginBody(body, "student");

  if (openBtn) openBtn.addEventListener("click", () => openOverlay(overlay));
  if (closeBtn) closeBtn.addEventListener("click", () => closeOverlay(overlay));
  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) closeOverlay(overlay);
  });

  const doLogout = async () => {
    try { await api.logout(); } catch (e) { /* token may already be invalid — still clear it locally */ }
    clearAuth();
    toast("Logged out.", "info");
    setTimeout(() => window.location.reload(), 400);
  };
  logoutBtn?.addEventListener("click", doLogout);
  qs("#bottom-tab-login")?.addEventListener("click", () => openOverlay(overlay));
  qs("#bottom-tab-logout")?.addEventListener("click", doLogout);

  navToggle?.addEventListener("click", () => {
    const open = mobileNav.classList.toggle("mobile-nav--open");
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.textContent = open ? "×" : "☰";
  });
  qsa("a", mobileNav).forEach((a) => a.addEventListener("click", () => {
    mobileNav.classList.remove("mobile-nav--open");
    navToggle?.setAttribute("aria-expanded", "false");
    if (navToggle) navToggle.textContent = "☰";
  }));

  if (cityInput) {
    cityInput.addEventListener("change", () => {
      const val = cityInput.value.trim();
      if (val) {
        setCity(val);
        toast(`Showing events near ${val}.`, "info");
        document.dispatchEvent(new CustomEvent("uni:citychange", { detail: val }));
      }
    });
  }
}

/* ---------- Shared footer (every page) ---------- */
function buildFooter() {
  return el("footer", { class: "footer" },
    el("div", { class: "footer__grid" },
      el("div", {},
        el("img", { src: "/static/assets/unievents-full.png", alt: "UniEvents — The Heartbeat of Campus Experiences.", class: "footer__brand-logo" }),
        el("p", { class: "footer__desc" }, "One directory instead of a dozen group chats — discovery, registration, and the paperwork of running a student-led event, all in a single unified flow."),
        el("div", { class: "footer__social" },
          el("a", { href: "#", "aria-label": "Instagram", onclick: (e) => e.preventDefault() }, "IG"),
          el("a", { href: "#", "aria-label": "LinkedIn", onclick: (e) => e.preventDefault() }, "in"),
          el("a", { href: "#", "aria-label": "Twitter", onclick: (e) => e.preventDefault() }, "X")
        )
      ),
      el("div", { class: "footer__col" },
        el("div", { class: "footer__col-title" }, "Quick Links"),
        el("a", { href: "/" }, "Home"),
        el("a", { href: "/#feed" }, "Events Directory"),
        el("a", { href: "/about/" }, "About Us")
      ),
      el("div", { class: "footer__col" },
        el("div", { class: "footer__col-title" }, "For Students"),
        el("a", { href: "/conduct-event/" }, "Conduct an Event"),
        el("a", { href: "/achievements/" }, "Achievements Locker")
      ),
      el("div", { class: "footer__col" },
        el("div", { class: "footer__col-title" }, "Newsletter"),
        el("p", { class: "footer__newsletter-desc" }, "Subscribe to get updates on the latest events and news."),
        buildNewsletterForm()
      )
    ),
    el("div", { class: "footer__bottom" },
      el("div", { style: "display: flex; flex-direction: column; gap: 4px;" },
        el("span", {}, "© " + new Date().getFullYear() + " UniEvents. All rights reserved."),
        el("span", { class: "text-muted" }, "The Heartbeat of Campus Experiences.")
      ),
      el("span", {},
        "Designed & Developed by ",
        el("a", { href: "https://4thgear.netlify.app/", target: "_blank", class: "accent", style: "text-decoration: underline; font-weight: 700;" }, "4thGear"),
        "."
      )
    )
  );
}

function buildNewsletterForm() {
  const input = el("input", { type: "email", placeholder: "Enter your email", "aria-label": "Email for newsletter" });
  const form = el("form", { class: "footer__newsletter-row" },
    input,
    el("button", { type: "submit", "aria-label": "Subscribe" }, "→")
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    toast("Thanks — you're on the list.", "success");
    input.value = "";
  });
  return form;
}

function renderFooter() {
  const host = qs("#app-footer");
  if (!host) return;
  host.innerHTML = "";
  host.appendChild(buildFooter());
}

document.addEventListener("DOMContentLoaded", renderFooter);
