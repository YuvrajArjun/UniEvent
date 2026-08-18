/* ============================================================
   events.js — Dynamic Feed Engine + Registration Workflow, now
   backed by the Django REST API instead of a client-side mock
   array. Filtering/sorting/search are delegated to the backend;
   this module focuses on rendering + the registration/receipt UX.
   ============================================================ */

let activeCategory = "All";
let activeScope = "All";
let activeTab = "intra"; // "intra" | "inter" | "all"
let selectedCollegeId = "All";
let collegesCache = [];
let searchTerm = "";
let activeSort = "date-asc";
let metaCache = { categories: [], scopes: [] };
let feedRequestId = 0; // guards against out-of-order network responses clobbering a newer render
let allCountCache = { city: null, count: 0 }; // avoids refetching the unfiltered count on every keystroke/filter change

async function initEventsPage() {
  await renderHeader("home");
  const [meta, colleges] = await Promise.all([
    api.meta().catch(() => ({ categories: [], scopes: [] })),
    api.listColleges().catch(() => []),
  ]);
  metaCache = meta;
  collegesCache = colleges;

  await renderHero();
  renderFeatureStrip();
  renderFilterBar();
  renderFeedSkeleton();
  await renderFeed();
  renderWhyChoose();
  initScrollReveal();

  document.addEventListener("uni:citychange", () => renderFeed());
}

const HERO_ICONS = {
  listings: '<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 9h16M9 5v-1M15 5v-1" stroke-width="1.6" stroke-linecap="round"/></svg>',
  institutions: '<svg viewBox="0 0 24 24"><path d="M4 21V9l8-5 8 5v12" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 21v-6h6v6" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" stroke-width="1.6"/><path d="M12 7.5V12l3 2" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

async function renderHero() {
  const host = qs("#hero-slot");
  if (!host) return;
  let events = [];
  try {
    events = await api.listEvents({});
  } catch (e) { /* hero still renders with zero stats if the API call fails */ }
  const institutions = new Set(events.map((e) => e.institution)).size;

  host.innerHTML = "";
  host.appendChild(
    el("section", { class: "hero" },
      el("img", { src: "/static/assets/unievents-full.png", alt: "", class: "hero__watermark" }),
      el("div", { class: "hero__content" },
        el("div", { class: "hero__badge" },
          el("img", { src: "/static/assets/unievents-mark.png", alt: "" }),
          el("span", {}, "Welcome to UniEvents")
        ),
        el("h1", { class: "hero__title" },
          el("img", { src: "/static/assets/unievents-text.png", alt: "UniEvents", class: "hero__wordmark" })
        ),
        el("p", { class: "hero__subtitle" }, "The Heartbeat of Campus Experiences."),
        el("p", { class: "hero__desc" }, "Discover, connect, and create unforgettable memories with exciting campus events happening around you — then, if you're a student organizer, take your own event from proposal to public listing."),
        el("div", { class: "hero__cta-row" },
          el("a", { href: "#feed", class: "btn btn--gold" }, "Explore Events"),
          el("a", { href: "/about/", class: "btn btn--ghost" }, "Learn More")
        )
      ),
      el("div", { class: "hero__art" },
        el("img", { src: "/static/assets/unievents-mark.png", alt: "UniEvents" }),
        el("span", { class: "hero__art-spark", style: "top:8%; left:10%; font-size:18px;" }, "✦"),
        el("span", { class: "hero__art-spark", style: "top:70%; left:82%; font-size:14px; animation-delay:1.1s;" }, "✦"),
        el("span", { class: "hero__art-spark", style: "top:20%; left:85%; font-size:10px; animation-delay:2s;" }, "✦")
      )
    )
  );

  const statsHost = el("div", { class: "stats-bar" },
    statBlock("stat-listings", events.length, "Live Listings", HERO_ICONS.listings),
    el("div", { class: "stats-bar__sep" }),
    statBlock("stat-inst", institutions, "Partner Institutions", HERO_ICONS.institutions),
    el("div", { class: "stats-bar__sep" }),
    statBlockStatic("24/7", "Proposal Review Window", HERO_ICONS.clock)
  );
  host.appendChild(statsHost);

  const listingsNode = qs("#stat-listings", host);
  const instNode = qs("#stat-inst", host);
  if (listingsNode) animateCount(listingsNode, events.length);
  if (instNode) animateCount(instNode, institutions);
}
function statBlock(id, num, label, iconSvg) {
  return el("div", { class: "stats-bar__item" },
    el("div", { class: "stats-bar__icon", html: iconSvg }),
    el("div", {},
      el("div", { class: "stats-bar__num", id }, "0"),
      el("div", { class: "stats-bar__label" }, label)
    )
  );
}
function statBlockStatic(num, label, iconSvg) {
  return el("div", { class: "stats-bar__item" },
    el("div", { class: "stats-bar__icon", html: iconSvg }),
    el("div", {},
      el("div", { class: "stats-bar__num" }, num),
      el("div", { class: "stats-bar__label" }, label)
    )
  );
}

const FEATURE_ITEMS = [
  { title: "Discover Events", desc: "Find events that match your interests.", icon: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" stroke-width="1.6"/><path d="M20 20l-4.3-4.3" stroke-width="1.6" stroke-linecap="round"/></svg>' },
  { title: "Easy Registration", desc: "Register in just a few simple steps.", icon: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 9h6M9 13h6M9 17h3" stroke-width="1.6" stroke-linecap="round"/></svg>' },
  { title: "Stay Updated", desc: "Get real-time updates and reminders.", icon: '<svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 20a2 2 0 004 0" stroke-width="1.6" stroke-linecap="round"/></svg>' },
  { title: "Connect & Network", desc: "Meet people and build lasting connections.", icon: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3" stroke-width="1.6"/><circle cx="17" cy="8" r="3" stroke-width="1.6"/><path d="M2.5 20c.6-3 2.7-5 5.5-5s4.9 2 5.5 5M12.5 20c.5-2.6 2.3-4.5 4.5-5 2.2.5 4 2.4 4.5 5" stroke-width="1.6" stroke-linecap="round"/></svg>' },
];
function renderFeatureStrip() {
  const heroHost = qs("#hero-slot");
  if (!heroHost) return;
  heroHost.appendChild(
    el("div", { class: "feature-strip" },
      ...FEATURE_ITEMS.map((f) =>
        el("div", { class: "feature-strip__item" },
          el("div", { class: "feature-strip__icon", html: f.icon }),
          el("div", { class: "feature-strip__title" }, f.title),
          el("div", { class: "feature-strip__desc" }, f.desc)
        )
      )
    )
  );
}

const WHY_ITEMS = [
  { title: "Diverse Events", desc: "From cultural to tech, find it all here.", icon: '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 10h16" stroke-width="1.6"/></svg>' },
  { title: "Trusted Platform", desc: "Verified events by authenticated clubs.", icon: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  { title: "Seamless Experience", desc: "User-friendly platform for everyone.", icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="1.6"/><path d="M12 7v5l3 2" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  { title: "Memorable Moments", desc: "Create stories that last a lifetime.", icon: '<svg viewBox="0 0 24 24"><path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z" stroke-width="1.4" stroke-linejoin="round"/></svg>' },
];
function renderWhyChoose() {
  const host = qs("#why-slot");
  if (!host) return;
  host.innerHTML = "";
  host.appendChild(
    el("div", {},
      el("div", { class: "section-head section-head--center" },
        el("h2", {}, "Why Choose UniEvents?"),
        el("span", { class: "section-head__desc" }, "We make campus life more exciting and connected.")
      ),
      el("div", { class: "value-grid" },
        ...WHY_ITEMS.map((w) =>
          el("div", { class: "value-card" },
            el("div", { class: "value-card__glyph", html: w.icon }),
            el("div", { class: "value-card__title" }, w.title),
            el("div", { class: "value-card__desc" }, w.desc)
          )
        )
      )
    )
  );
}

function renderFilterBar() {
  const host = qs("#filter-slot");
  if (!host) return;
  host.innerHTML = "";

  const session = getSession();
  const studentCollegeName = session?.affiliation || session?.college_name || "";

  host.appendChild(
    el("div", { class: "section-head", id: "feed" },
      el("div", {},
        el("h2", {}, "Events Directory"),
        el("span", { class: "section-head__desc" }, "Browse Intra-College and Inter-College campus events")
      ),
      el("a", { href: "#feed", class: "btn btn--ghost btn--sm" }, "View Feed")
    )
  );

  const wrap = el("div", { class: "filter-sticky-wrap" });

  // Event category tabs: [ INTRA-COLLEGE ] [ INTER-COLLEGE ]
  const tabSwitchRow = el("div", { class: "tabbar", style: "margin-bottom:16px; border-bottom:1px solid var(--border-soft);" },
    el("button", { class: `tabbar__btn${activeTab === "intra" ? " tabbar__btn--active" : ""}`, type: "button", id: "btn-tab-intra" }, "INTRA-COLLEGE"),
    el("button", { class: `tabbar__btn${activeTab === "inter" ? " tabbar__btn--active" : ""}`, type: "button", id: "btn-tab-inter" }, "INTER-COLLEGE")
  );

  const searchBar = el("div", { class: "filter-bar" },
    el("input", { type: "search", placeholder: "Search events, colleges, or tags…", id: "search-input", value: searchTerm }),
    el("select", { class: "filter-bar__sort", id: "sort-select", "aria-label": "Sort events" },
      el("option", { value: "date-asc", selected: activeSort === "date-asc" }, "Soonest first"),
      el("option", { value: "date-desc", selected: activeSort === "date-desc" }, "Latest first"),
      el("option", { value: "fee-asc", selected: activeSort === "fee-asc" }, "Fee: Low to High"),
      el("option", { value: "seats-desc", selected: activeSort === "seats-desc" }, "Most seats left")
    )
  );

  // College selector filter (visible during Inter-College mode)
  const collegeSelectOptions = [
    '<option value="All">All Colleges</option>',
    ...collegesCache.map((c) => `<option value="${c.id}"${String(selectedCollegeId) === String(c.id) ? " selected" : ""}>${c.name}</option>`),
  ].join("");

  const collegeFilterRow = el("div", { class: "filter-row", id: "college-filter-row", style: activeTab === "inter" ? "display:flex;" : "display:none;" },
    el("span", { class: "filter-row__label" }, "Select College"),
    el("select", { class: "field-select", id: "college-filter-select", style: "max-width:280px; font-size:13.5px;", html: collegeSelectOptions })
  );

  // Info badge for Intra-College mode
  const intraInfoBadge = el("div", { id: "intra-info-badge", style: activeTab === "intra" ? "display:block;" : "display:none;" },
    session && session.role === "student"
      ? el("div", { class: "status-tag status-tag--active", style: "margin-bottom:12px; font-size:13px; padding:6px 12px;" },
          `🏫 Showing events hosted by your college: ${studentCollegeName || "PCP Polytechnic"}`
        )
      : el("div", { class: "status-tag status-tag--extended", style: "margin-bottom:12px; font-size:13px; padding:6px 12px;" },
          "🔒 Please log in as a student to see Intra-College events for your institution."
        )
  );

  const categoryRow = el("div", { class: "filter-row" },
    el("span", { class: "filter-row__label" }, "Category"),
    ...["All", ...metaCache.categories].map((cat) =>
      el("button", { class: `chip${cat === activeCategory ? " chip--active" : ""}`, type: "button", "data-cat": cat }, cat)
    )
  );

  const resultsBar = el("div", { class: "filter-results-bar", id: "results-bar" });

  wrap.appendChild(tabSwitchRow);
  wrap.appendChild(intraInfoBadge);
  wrap.appendChild(collegeFilterRow);
  wrap.appendChild(searchBar);
  wrap.appendChild(categoryRow);
  wrap.appendChild(resultsBar);
  host.appendChild(wrap);

  qs("#btn-tab-intra", host).addEventListener("click", () => {
    activeTab = "intra";
    qs("#btn-tab-intra", host).classList.add("tabbar__btn--active");
    qs("#btn-tab-inter", host).classList.remove("tabbar__btn--active");
    qs("#college-filter-row", host).style.display = "none";
    qs("#intra-info-badge", host).style.display = "block";
    renderFeed();
  });

  qs("#btn-tab-inter", host).addEventListener("click", () => {
    activeTab = "inter";
    qs("#btn-tab-inter", host).classList.add("tabbar__btn--active");
    qs("#btn-tab-intra", host).classList.remove("tabbar__btn--active");
    qs("#college-filter-row", host).style.display = "flex";
    qs("#intra-info-badge", host).style.display = "none";
    renderFeed();
  });

  qs("#college-filter-select", host)?.addEventListener("change", (e) => {
    selectedCollegeId = e.target.value;
    renderFeed();
  });

  qs("#search-input", host).addEventListener("input", debounce((e) => {
    searchTerm = e.target.value.toLowerCase();
    renderFeed();
  }, 220));

  qs("#sort-select", host).addEventListener("change", (e) => {
    activeSort = e.target.value;
    renderFeed();
  });

  qsa(".chip[data-cat]", host).forEach((chip) =>
    chip.addEventListener("click", () => {
      activeCategory = chip.dataset.cat;
      qsa(".chip[data-cat]", host).forEach((c) => c.classList.remove("chip--active"));
      chip.classList.add("chip--active");
      renderFeed();
    })
  );
}

function renderFeedSkeleton() {
  const host = qs("#feed-slot");
  if (!host) return;
  host.innerHTML = "";
  const grid = el("div", { class: "ticket-grid" });
  for (let i = 0; i < 6; i++) {
    grid.appendChild(
      el("div", { class: "ticket ticket--skeleton" },
        el("div", { class: "ticket__cover skeleton" }),
        el("div", { style: "padding:18px;" },
          el("div", { class: "sk-line", style: "width:40%;" }),
          el("div", { class: "sk-line", style: "width:80%; height:18px;" }),
          el("div", { class: "sk-line", style: "width:60%;" }),
          el("div", { class: "sk-line", style: "width:90%;" })
        )
      )
    );
  }
  host.appendChild(grid);
}

async function renderFeed() {
  const host = qs("#feed-slot");
  if (!host) return;
  const city = getCity();

  const requestId = ++feedRequestId;
  let events = [];
  let allCount = 0;

  try {
    let fetchPromise;
    if (activeTab === "intra") {
      fetchPromise = api.listIntraEvents({ city, category: activeCategory, q: searchTerm, sort: activeSort });
    } else if (activeTab === "inter") {
      fetchPromise = api.listInterEvents({ city, category: activeCategory, college_id: selectedCollegeId, q: searchTerm, sort: activeSort });
    } else {
      fetchPromise = api.listEvents({ city, category: activeCategory, q: searchTerm, sort: activeSort });
    }

    const needsAllCount = allCountCache.city !== city;
    const [eventsRes, allCountRes] = await Promise.all([
      fetchPromise,
      needsAllCount ? api.listEvents({ city }).then((r) => r.length) : Promise.resolve(allCountCache.count),
    ]);
    events = eventsRes || [];
    allCount = allCountRes || 0;
    allCountCache = { city, count: allCount };
  } catch (e) {
    if (requestId !== feedRequestId) return;
    host.innerHTML = "";
    host.appendChild(el("div", { class: "empty-state" },
      el("div", { class: "empty-state__glyph" }, "⚠"),
      el("h3", {}, "Couldn't load events"),
      el("p", {}, e.message || "Please try again in a moment.")
    ));
    return;
  }

  const resultsBar = qs("#results-bar");
  if (requestId !== feedRequestId) return;
  if (resultsBar) {
    resultsBar.innerHTML = "";
    const filtersActive = activeCategory !== "All" || selectedCollegeId !== "All" || searchTerm;
    const modeLabel = activeTab === "intra" ? "Intra-College" : activeTab === "inter" ? "Inter-College" : "All";
    resultsBar.appendChild(el("span", {}, `${events.length} ${modeLabel} events · near ${city || "anywhere"}`));
    if (filtersActive) {
      const clear = el("button", { class: "filter-clear", type: "button" }, "Clear filters");
      clear.addEventListener("click", () => {
        activeCategory = "All"; selectedCollegeId = "All"; searchTerm = "";
        const searchInput = qs("#search-input"); if (searchInput) searchInput.value = "";
        const colSelect = qs("#college-filter-select"); if (colSelect) colSelect.value = "All";
        qsa(".chip[data-cat]").forEach((c) => c.classList.toggle("chip--active", c.dataset.cat === "All"));
        renderFeed();
      });
      resultsBar.appendChild(clear);
    }
  }

  host.innerHTML = "";
  if (events.length === 0) {
    const session = getSession();
    let msg = "No events match that filter.";
    if (activeTab === "intra" && (!session || session.role !== "student")) {
      msg = "Log in with a student account to see Intra-College events organized by your college.";
    }
    host.appendChild(
      el("div", { class: "empty-state" },
        el("div", { class: "empty-state__glyph" }, "🔍"),
        el("h3", {}, "No events found"),
        el("p", {}, msg)
      )
    );
    return;
  }

  const grid = el("div", { class: "ticket-grid" });
  events.forEach((ev, i) => {
    const card = buildTicketCard(ev);
    card.classList.add("reveal");
    card.style.transitionDelay = `${Math.min(i, 8) * 0.04}s`;
    grid.appendChild(card);
  });
  host.appendChild(grid);
  initScrollReveal(host);
}

function buildTicketCard(ev) {
  const cover = ev.cover_image || coverImageFor(ev.title);
  const seatsTotal = ev.seats_total || Math.max(ev.seats_left || 0, 1) * 2;
  const pctLeft = Math.max(0, Math.min(100, Math.round(((ev.seats_left ?? 0) / seatsTotal) * 100)));
  const low = pctLeft <= 25;

  const bookmarkBtn = el("button", {
    class: `ticket__bookmark${ev.is_bookmarked ? " ticket__bookmark--active" : ""}`, type: "button",
    "aria-label": "Save event", title: "Save event",
    onclick: (e) => { e.stopPropagation(); handleBookmarkToggle(ev, bookmarkBtn); },
  }, ev.is_bookmarked ? "♥" : "♡");

  const card = el("article", { class: "ticket" },
    el("div", { class: "ticket__cover-wrap" },
      el("img", { class: "ticket__cover", src: cover, alt: ev.title, loading: "lazy" }),
      el("div", { class: "ticket__cover-fade" }),
      bookmarkBtn,
      el("span", { class: "ticket__countdown" }, countdownLabel(ev.date))
    ),
    el("div", { class: "ticket__main" },
      el("div", { class: "ticket__body", onclick: () => openEventDetail(ev) },
        el("div", { class: "ticket__category-row" },
          el("span", { class: "ticket__category" }, ev.category),
          ev.scope ? el("span", { class: `scope-badge scope-badge--${ev.scope}` }, ev.scope) : null
        ),
        el("div", { class: "ticket__title-row" },
          el("h3", { class: "ticket__title" }, ev.title),
          el("span", { class: "ticket__arrow" }, "→")
        ),
        el("div", { class: "ticket__institution" }, ev.institution),
        el("p", { class: "ticket__desc" }, ev.description),
        el("div", { class: "ticket__tags" }, ...(ev.tags || []).map((t) => el("span", { class: "ticket__tag" }, t))),
        el("div", { class: "ticket__meta" },
          el("span", {}, "📅 " + formatDate(ev.date)),
          el("span", {}, "📍 " + ev.venue)
        ),
        el("div", { class: "ticket__seats-bar" }, el("div", { class: `ticket__seats-fill${low ? " ticket__seats-fill--low" : ""}`, style: `width:${pctLeft}%;` }))
      ),
      el("div", { class: "ticket__stub" },
        el("div", {},
          el("div", { class: "ticket__stub-price" }, formatCurrency(ev.fee)),
          el("div", { class: "ticket__stub-seats" }, `${ev.seats_left ?? "—"} seats left`)
        ),
        el("button", { class: "btn btn--gold btn--sm ticket__stub-btn", onclick: (e) => { e.stopPropagation(); openRegistration(ev); } }, "Register")
      )
    )
  );
  return card;
}

async function handleBookmarkToggle(ev, btn, onChange) {
  if (!getSession()) {
    toast("Log in to save events to your bookmarks.", "error");
    const authOverlay = qs("#auth-overlay");
    if (authOverlay) openOverlay(authOverlay);
    return;
  }
  try {
    const res = await api.toggleBookmark(ev.id);
    ev.is_bookmarked = res.bookmarked;
    if (btn) {
      btn.classList.toggle("ticket__bookmark--active", res.bookmarked);
      btn.textContent = res.bookmarked ? "♥" : "♡";
    }
    if (onChange) onChange(res.bookmarked);
    toast(res.bookmarked ? "Saved to your bookmarks." : "Removed from bookmarks.", "info");
  } catch (err) {
    toast(err.message || "Couldn't update bookmark.", "error");
  }
}

/* ---------- Event detail modal ---------- */
function openEventDetail(ev) {
  const cover = ev.cover_image || coverImageFor(ev.title);
  const overlay = el("div", { class: "modal-overlay" });
  const saveBtn = el("button", { class: "btn btn--outline" }, ev.is_bookmarked ? "♥ Saved" : "♡ Save");
  saveBtn.addEventListener("click", () => handleBookmarkToggle(ev, null, (bookmarked) => {
    saveBtn.textContent = bookmarked ? "♥ Saved" : "♡ Save";
  }));

  const modal = el("div", { class: "modal modal--detail", role: "dialog", "aria-modal": "true" },
    el("button", { class: "modal__close", type: "button", onclick: () => closeOverlay(overlay) }, "×"),
    el("img", { src: cover, alt: ev.title, style: "width:100%; height:220px; object-fit:cover; display:block;" }),
    el("div", { style: "padding:24px 26px 28px;" },
      el("div", { class: "ticket__category-row" },
        el("span", { class: "ticket__category" }, ev.category),
        ev.scope ? el("span", { class: `scope-badge scope-badge--${ev.scope}` }, ev.scope) : null,
        el("span", { class: "ticket__countdown", style: "position:static;" }, countdownLabel(ev.date))
      ),
      el("h2", { style: "font-size:24px; margin-top:10px;" }, ev.title),
      el("div", { class: "ticket__institution", style: "margin-top:4px;" }, ev.institution + (ev.city ? ` · ${ev.city}` : "")),
      el("p", { class: "text-muted", style: "margin-top:14px; font-size:14px; line-height:1.7;" }, ev.description),
      el("div", { class: "ticket__tags", style: "margin-top:14px;" }, ...(ev.tags || []).map((t) => el("span", { class: "ticket__tag" }, t))),
      el("div", { class: "ticket__meta", style: "margin-top:16px; font-size:13px;" },
        el("span", {}, "📅 " + formatDate(ev.date)),
        el("span", {}, "📍 " + ev.venue),
        el("span", {}, "🎟 " + (ev.seats_left ?? "—") + " seats left")
      ),
      el("div", { style: "display:flex; gap:12px; margin-top:24px;" },
        el("button", { class: "btn btn--gold", style: "flex:1;", onclick: () => { closeOverlay(overlay); openRegistration(ev); } }, ev.fee > 0 ? `Register · ${formatCurrency(ev.fee)}` : "Register Free"),
        saveBtn
      )
    )
  );
  overlay.appendChild(modal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeOverlay(overlay); });
  openOverlay(overlay);
}

/* ---------- Registration + Payment + Receipt flow ---------- */
function openRegistration(ev) {
  const session = getSession();
  if (!session) {
    toast("Log in to register for events.", "error");
    const authOverlay = qs("#auth-overlay");
    if (authOverlay) openOverlay(authOverlay);
    return;
  }
  if (session.role !== "student") {
    toast("Registration is only available to student accounts.", "error");
    return;
  }
  if ((ev.seats_left ?? 0) <= 0) {
    toast("This event is sold out.", "error");
    return;
  }

  const overlay = el("div", { class: "modal-overlay" });
  const modal = buildRegistrationForm(ev, session, overlay);
  overlay.appendChild(modal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeOverlay(overlay); });
  openOverlay(overlay);
}

function buildRegistrationForm(ev, session, overlay) {
  const modal = el("div", { class: "modal", role: "dialog" },
    el("button", { class: "modal__close", type: "button", onclick: () => closeOverlay(overlay) }, "×"),
    el("div", { class: "auth-modal__eyebrow" }, "Event Registration"),
    el("h2", { class: "auth-modal__title" }, ev.title),
    el("form", { id: "reg-form", novalidate: "true" },
      el("label", { class: "field-label" }, "Attendee Name",
        el("input", { class: "field-input", id: "reg-name", value: session.name, required: "true" })
      ),
      el("label", { class: "field-label" }, "Student / Attendee ID",
        el("input", { class: "field-input", id: "reg-id", value: session.student_id || "", required: "true" })
      ),
      el("label", { class: "field-label" }, "Affiliation",
        el("input", { class: "field-input", id: "reg-affiliation", value: session.affiliation || "", required: "true" })
      ),
      el("label", { class: "field-label" }, "Email",
        el("input", { class: "field-input", type: "email", id: "reg-email", value: session.email, required: "true" })
      ),
      el("button", { type: "submit", class: "btn btn--gold btn--block" }, ev.fee > 0 ? "Continue to Checkout" : "Confirm Free Registration")
    )
  );

  const form = qs("#reg-form", modal);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fields = [
      [qs("#reg-name", modal), "Please enter the attendee's name."],
      [qs("#reg-id", modal), "Please enter a student / attendee ID."],
      [qs("#reg-affiliation", modal), "Please enter an affiliation."],
      [qs("#reg-email", modal), "Please enter a valid email."],
    ];
    let valid = true;
    fields.forEach(([input, msg]) => {
      const emailOk = input.type !== "email" || /^\S+@\S+\.\S+$/.test(input.value.trim());
      if (!input.value.trim() || !emailOk) { markInvalid(input, msg); valid = false; }
      else clearInvalid(input);
    });
    if (!valid) { toast("Please fix the highlighted fields.", "error"); return; }

    const delegate = {
      attendee_name: qs("#reg-name", modal).value,
      attendee_id: qs("#reg-id", modal).value,
      affiliation: qs("#reg-affiliation", modal).value,
      email: qs("#reg-email", modal).value,
    };
    if (ev.fee > 0) {
      renderCheckout(ev, delegate, overlay);
    } else {
      submitRegistration(ev, delegate, overlay);
    }
  });

  return modal;
}

function renderCheckout(ev, delegate, overlay) {
  const gst = Math.round(ev.fee * 0.18);
  const total = ev.fee + gst;
  const modal = el("div", { class: "modal", role: "dialog" },
    el("button", { class: "modal__close", type: "button", onclick: () => closeOverlay(overlay) }, "×"),
    el("div", { class: "auth-modal__eyebrow" }, "Itemized Checkout"),
    el("h2", { class: "auth-modal__title" }, "Confirm & Pay"),
    el("div", { class: "checkout-line" }, el("span", {}, "Registration fee"), el("span", {}, formatCurrency(ev.fee))),
    el("div", { class: "checkout-line" }, el("span", {}, "GST (18%)"), el("span", {}, formatCurrency(gst))),
    el("div", { class: "checkout-line checkout-line--total" }, el("span", {}, "Total payable"), el("span", {}, formatCurrency(total))),
    el("button", { class: "btn btn--gold btn--block mt-32", id: "pay-btn" }, "Pay & Confirm (Simulated)")
  );
  overlay.innerHTML = "";
  overlay.appendChild(modal);
  const payBtn = qs("#pay-btn", modal);
  payBtn.addEventListener("click", () => {
    payBtn.disabled = true;
    payBtn.textContent = "Processing…";
    setTimeout(() => submitRegistration(ev, delegate, overlay), 550);
  });
}

async function submitRegistration(ev, delegate, overlay) {
  try {
    const registration = await api.registerForEvent(ev.id, delegate);
    renderReceipt(ev, registration, overlay);
  } catch (err) {
    toast(err.message || "Couldn't complete registration.", "error");
    const payBtn = qs("#pay-btn", overlay);
    if (payBtn) { payBtn.disabled = false; payBtn.textContent = "Pay & Confirm (Simulated)"; }
  }
}

function renderReceipt(ev, registration, overlay) {
  const qrCanvas = el("canvas", { id: "receipt-qr", style: "display:block; margin:20px auto; border-radius:8px; border: 4px solid var(--border-soft); background:#fff; padding:6px; box-shadow: var(--shadow-sm);" });
  
  setTimeout(() => {
    try {
      new QRious({
        element: qrCanvas,
        value: window.location.origin + "/verify-ticket/" + registration.transaction_hash + "/",
        size: 150,
        background: "#FFFFFF",
        foreground: "#000000"
      });
    } catch (e) {
      console.error("QRious failed: ", e);
    }
  }, 100);

  const modal = el("div", { class: "modal", role: "dialog" },
    el("button", { class: "modal__close", type: "button", onclick: () => closeOverlay(overlay) }, "×"),
    el("div", { class: "receipt" },
      el("div", { class: "receipt__watermark" }, "✓ Confirmed — Registration Receipt"),
      el("h2", { style: "font-size:19px; margin-bottom:14px;" }, ev.title),
      el("div", { class: "receipt__row" }, el("span", {}, "Attendee"), el("span", {}, registration.attendee_name)),
      el("div", { class: "receipt__row" }, el("span", {}, "Affiliation"), el("span", {}, registration.affiliation)),
      el("div", { class: "receipt__row" }, el("span", {}, "Vendor ID"), el("span", {}, ev.institution.replace(/\s/g, "").slice(0, 8).toUpperCase())),
      el("div", { class: "receipt__row" }, el("span", {}, "Amount Paid"), el("span", {}, formatCurrency(registration.total_paid))),
      registration.gst ? el("div", { class: "receipt__row" }, el("span", {}, "GST included"), el("span", {}, formatCurrency(registration.gst))) : null,
      el("div", { class: "receipt__row" }, el("span", {}, "Transaction Hash")),
      el("div", { class: "receipt__hash" }, registration.transaction_hash),
      el("div", { style: "text-align: center; margin-top: 16px;" },
        el("span", { class: "status-badge status-badge--approved" }, "Scan Pass at Entry"),
        qrCanvas
      ),
      el("p", { class: "text-muted", style: "margin-top:14px; font-size:12px;" }, "This receipt is generated and stored server-side against your account.")
    ),
    el("div", { style: "display:flex; gap:12px; margin-top:24px;" },
      el("button", { class: "btn btn--gold", style: "flex:1;", onclick: () => downloadTicketImage(registration, ev) }, "Download Ticket"),
      el("button", { class: "btn btn--outline", style: "flex:1;", onclick: () => closeOverlay(overlay) }, "Done")
    )
  );
  overlay.innerHTML = "";
  overlay.appendChild(modal);
  toast("Registration confirmed.", "success");
  fireConfettiBurst();
}

document.addEventListener("DOMContentLoaded", initEventsPage);

