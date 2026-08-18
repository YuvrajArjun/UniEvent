/* ============================================================
   conduct.js — "Conduct Event" lifecycle, student side. Proposals
   and publishing now go through the Django REST API; the stepper /
   validation UX is unchanged from the original prototype.
   ============================================================ */

async function initConductPage() {
  await renderHeader("conduct");
  const session = requireRole("student");
  if (!session) {
    qs("#conduct-main").innerHTML = "";
    qs("#conduct-main").appendChild(buildRestricted());
    return;
  }
  const [meta, colleges] = await Promise.all([
    api.meta().catch(() => ({ categories: [], scopes: ["Intercollege", "Intracollege"] })),
    api.listColleges().catch(() => []),
  ]);

  renderStepper();
  renderProposalForm(session, meta, colleges);
  await renderMyProposals(session);
  initScrollReveal();
}

function renderStepper() {
  const host = qs("#stepper-slot");
  if (!host) return;
  const steps = ["Submit Proposal", "Institution Review", "Token → Publish"];
  const stepper = el("div", { class: "stepper" });
  steps.forEach((label, i) => {
    stepper.appendChild(el("div", { class: `stepper__dot${i === 0 ? " stepper__dot--active" : ""}` }, String(i + 1)));
    stepper.appendChild(el("span", { class: "stepper__label" }, label));
    if (i < steps.length - 1) stepper.appendChild(el("div", { class: "stepper__line" }));
  });
  host.appendChild(stepper);
}

function buildRestricted() {
  return el("div", { class: "restricted" },
    el("div", { class: "restricted__glyph" }, "🔒"),
    el("h3", {}, "Student login required"),
    el("p", { class: "text-muted" }, "Only logged-in students can submit a Conduct Event proposal. Log in from the top bar to continue.")
  );
}

function validateField(input, condition, message) {
  if (!condition) { markInvalid(input, message); return false; }
  clearInvalid(input);
  return true;
}

function renderProposalForm(session, meta, colleges = []) {
  const host = qs("#form-slot");

  const collegeOptions = [
    '<option value="">-- Select Responsible College --</option>',
    ...colleges.map((c) => {
      const selected = (session.college_id === c.id || session.affiliation === c.name) ? " selected" : "";
      return `<option value="${c.id}"${selected}>${c.name} (${c.code})</option>`;
    }),
  ].join("");

  const form = el("form", { class: "modal", style: "max-width:640px; padding:28px 26px;", id: "proposal-form", novalidate: "true" },
    el("div", { class: "auth-modal__eyebrow" }, "Step 1 — Student Proposal"),
    el("h2", { class: "auth-modal__title" }, "Propose a new event"),
    el("label", { class: "field-label" }, "Responsible College / Institution",
      el("select", { class: "field-select", id: "p-college", required: "true", html: collegeOptions }),
      el("span", { class: "field-hint" }, "Select the host institution that will review and approve this proposal.")
    ),
    el("label", { class: "field-label" }, "Event Title",
      el("input", { class: "field-input", id: "p-title", required: "true", placeholder: "e.g. Python Workshop" })
    ),
    el("label", { class: "field-label" }, "Aim / Purpose",
      el("textarea", { class: "field-textarea", id: "p-aim", required: "true", placeholder: "What is this event trying to achieve?" })
    ),
    el("label", { class: "field-label" }, "Event Scope",
      el("select", { class: "field-select", id: "p-scope" }),
      el("span", { class: "field-hint" }, "Intercollege — open to students from other institutions. Intracollege — open only within host campus.")
    ),
    el("div", { class: "field-row" },
      el("label", { class: "field-label" }, "Proposed Date",
        el("input", { type: "date", class: "field-input", id: "p-date", required: "true" })
      ),
      el("label", { class: "field-label" }, "Expected Budget (₹)",
        el("input", { type: "number", min: "0", class: "field-input", id: "p-budget", required: "true", placeholder: "25000" })
      )
    ),
    el("label", { class: "field-label" }, "Venue Requirements",
      el("input", { class: "field-input", id: "p-venue", required: "true", placeholder: "e.g. Seminar Hall, capacity 200, AV setup" })
    ),
    el("button", { type: "submit", class: "btn btn--gold btn--block" }, "Submit for Review")
  );
  host.appendChild(form);

  qs("#p-scope", form).innerHTML = (meta.scopes || ["Intercollege", "Intracollege"]).map((s) => `<option>${s}</option>`).join("");

  const today = new Date().toISOString().slice(0, 10);
  qs("#p-date", form).setAttribute("min", today);

  const submitBtn = qs("button[type=submit]", form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const collegeSelect = qs("#p-college", form);
    const title = qs("#p-title", form);
    const aim = qs("#p-aim", form);
    const date = qs("#p-date", form);
    const budget = qs("#p-budget", form);
    const venue = qs("#p-venue", form);

    let ok = true;
    ok = validateField(collegeSelect, !!collegeSelect.value, "Select the approving college.") && ok;
    ok = validateField(title, title.value.trim().length >= 4, "Give the event a descriptive title (4+ characters).") && ok;
    ok = validateField(aim, aim.value.trim().length >= 10, "Describe the aim in a bit more detail.") && ok;
    ok = validateField(date, !!date.value && date.value >= today, "Choose a valid upcoming date.") && ok;
    ok = validateField(budget, Number(budget.value) >= 0 && budget.value !== "", "Enter an expected budget (0 or more).") && ok;
    ok = validateField(venue, venue.value.trim().length >= 3, "Describe the venue requirement.") && ok;
    if (!ok) { toast("Please fix the highlighted fields.", "error"); return; }

    submitBtn.disabled = true;
    try {
      await api.createProposal({
        target_college: parseInt(collegeSelect.value),
        title: title.value.trim(),
        aim: aim.value.trim(),
        scope: qs("#p-scope", form).value,
        date: date.value,
        venue: venue.value.trim(),
        budget: Number(budget.value),
      });
      toast("Proposal submitted to College Admin. Track its status below.", "success");
      form.reset();
      await renderMyProposals(getSession());
    } catch (err) {
      toast(err.message || "Couldn't submit the proposal.", "error");
    } finally {
      submitBtn.disabled = false;
    }
  });
}

async function renderMyProposals(session) {
  const host = qs("#my-proposals");
  host.innerHTML = "";
  host.appendChild(el("div", { class: "section-head", style: "margin-top:0;" }, el("h2", {}, "My Proposals"), el("span", { class: "section-head__sub" }, "Loading…")));

  let mine = [];
  try {
    mine = await api.listProposals();
  } catch (err) {
    host.innerHTML = "";
    host.appendChild(el("div", { class: "empty-state" }, el("div", { class: "empty-state__glyph" }, "⚠"), el("h3", {}, "Couldn't load proposals"), el("p", {}, err.message || "")));
    return;
  }

  host.innerHTML = "";
  host.appendChild(
    el("div", { class: "section-head", style: "margin-top:0;" },
      el("h2", {}, "My Proposals"),
      el("span", { class: "section-head__sub" }, `${mine.length} submitted`)
    )
  );

  if (mine.length === 0) {
    host.appendChild(el("div", { class: "empty-state" },
      el("div", { class: "empty-state__glyph" }, "📝"),
      el("h3", {}, "Nothing here yet"),
      el("p", {}, "Your submitted proposals will appear here with live status.")
    ));
    return;
  }

  mine.forEach((p) => {
    const isRejected = p.status === "rejected";
    const card = el("div", { class: "proposal-card" },
      el("div", { class: "proposal-card__top" },
        el("strong", {}, p.title),
        el("div", { style: "display:flex; gap:8px;" },
          p.scope ? el("span", { class: `scope-badge scope-badge--${p.scope}` }, p.scope) : null,
          el("span", { class: `status-badge status-badge--${p.status}` }, p.status)
        )
      ),
      el("div", { class: "text-muted", style: "font-size:12.5px; margin-top:4px;" }, `Approving College: ${p.target_college_name || "PCP Polytechnic"}`),
      el("p", { class: "text-muted", style: "font-size:13px; margin-top:6px;" }, p.aim),
      el("div", { class: "text-muted", style: "font-size:12.5px; margin-top:8px;" },
        `📅 ${formatDate(p.date)} · 📍 ${p.venue} · Budget ${formatCurrency(p.budget)}`
      ),
      isRejected ? el("div", { style: "margin-top:10px; font-size:13px; color:var(--danger, #ef4444); background:rgba(239,68,68,0.1); padding:8px 12px; border-radius:6px;" },
        el("strong", {}, "Rejected Reason: "),
        p.rejection_reason || "Venue is already booked."
      ) : null,
      p.status === "approved" ? el("div", { class: "proposal-card__token-row" },
        el("code", {}, p.token),
        el("button", { class: "btn btn--outline btn--sm", type: "button", onclick: () => copyToken(p.token) }, "Copy Token"),
        p.published
          ? el("span", { class: "status-tag status-tag--active" }, "Published")
          : el("button", { class: "btn btn--gold btn--sm", type: "button", onclick: () => openSelfPublish(p) }, "Publish to Feed")
      ) : null
    );
    host.appendChild(card);
  });
}

/* ---------- Self-publish (student may publish once approved) ---------- */
async function openSelfPublish(proposal) {
  const overlay = el("div", { class: "modal-overlay" });
  const meta = await api.meta().catch(() => ({ categories: ["Technical", "Cultural", "Workshop", "Sports", "Other"] }));
  let uploadedFile = null;

  const form = el("form", { class: "modal", id: "self-publish-form", novalidate: "true" },
    el("button", { class: "modal__close", type: "button", onclick: () => closeOverlay(overlay) }, "×"),
    el("div", { class: "auth-modal__eyebrow" }, "Token verified ✓ — Direct Publish"),
    el("h2", { class: "auth-modal__title" }, proposal.title),
    el("div", { class: "field-row" },
      el("label", { class: "field-label" }, "Category",
        el("select", { class: "field-select", id: "sp-category" })
      ),
      el("label", { class: "field-label" }, "Registration Fee (₹, 0 = free)",
        el("input", { type: "number", min: "0", class: "field-input", id: "sp-fee", value: "0" })
      )
    ),
    el("div", { class: "field-row" },
      el("label", { class: "field-label" }, "Seats Available",
        el("input", { type: "number", min: "1", class: "field-input", id: "sp-seats", value: "60" })
      ),
      el("label", { class: "field-label" }, "Tags (comma separated)",
        el("input", { class: "field-input", id: "sp-tags", placeholder: "Student-Organized" })
      )
    ),
    el("label", { class: "field-label" }, "Cover Image (optional)",
      el("div", { class: "cover-upload", id: "sp-cover-trigger" }, "Click to upload a cover photo — otherwise a related image is fetched automatically."),
      el("input", { type: "file", accept: "image/*", id: "sp-cover-input", style: "display:none;" }),
      el("div", { id: "sp-cover-preview-host" })
    ),
    el("button", { type: "submit", class: "btn btn--gold btn--block" }, "Publish to Public Events Feed")
  );
  overlay.appendChild(form);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeOverlay(overlay); });
  openOverlay(overlay);

  qs("#sp-category", form).innerHTML = (meta.categories || []).map((c) => `<option>${c}</option>`).join("");

  const coverTrigger = qs("#sp-cover-trigger", form);
  const coverInput = qs("#sp-cover-input", form);
  coverTrigger.addEventListener("click", () => coverInput.click());
  coverInput.addEventListener("change", () => {
    const file = coverInput.files[0];
    if (!file) return;
    uploadedFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      qs("#sp-cover-preview-host", form).innerHTML = "";
      qs("#sp-cover-preview-host", form).appendChild(el("img", { class: "cover-preview", src: reader.result }));
    };
    reader.readAsDataURL(file);
  });

  const submitBtn = qs("button[type=submit]", form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const seats = qs("#sp-seats", form);
    if (!seats.value || Number(seats.value) < 1) { markInvalid(seats, "Enter at least 1 seat."); toast("Please fix the highlighted fields.", "error"); return; }
    clearInvalid(seats);

    const fd = new FormData();
    fd.append("category", qs("#sp-category", form).value);
    fd.append("fee", qs("#sp-fee", form).value || "0");
    fd.append("seats_total", seats.value);
    fd.append("tags", qs("#sp-tags", form).value);
    if (uploadedFile) fd.append("cover_upload", uploadedFile);
    else fd.append("cover_image_url", coverImageFor(proposal.title));

    submitBtn.disabled = true;
    try {
      await api.publishProposal(proposal.id, fd);
      closeOverlay(overlay);
      toast("Published to the public feed.", "success");
      fireConfettiBurst();
      await renderMyProposals(getSession());
    } catch (err) {
      toast(err.message || "Couldn't publish this proposal.", "error");
      submitBtn.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", initConductPage);
