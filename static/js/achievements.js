/* ============================================================
   achievements.js — Personal Achievements Portfolio. Certificates
   are now uploaded to the Django backend (MySQL + media storage)
   instead of being base64-encoded into localStorage.
   ============================================================ */

let lockerSession = null;

async function initAchievementsPage() {
  await renderHeader("achievements");
  lockerSession = requireRole("student");
  if (!lockerSession) {
    qs("#locker-main").innerHTML = "";
    qs("#locker-main").appendChild(buildRestrictedLocker());
    return;
  }
  wireTabs();
  renderDropzone();
  await renderLocker();
  await renderTickets();
  initScrollReveal();
}

function buildRestrictedLocker() {
  return el("div", { class: "restricted" },
    el("div", { class: "restricted__glyph" }, "🔒"),
    el("h3", {}, "Student login required"),
    el("p", { class: "text-muted" }, "The Achievements Locker is a personal space for logged-in students only.")
  );
}

function renderDropzone() {
  const host = qs("#dropzone-slot");
  const zone = el("div", { class: "dropzone", id: "dropzone" },
    el("div", { class: "dropzone__glyph" }, "⬆"),
    el("p", {}, el("strong", {}, "Click to add"), " or drag a certificate image here"),
    el("input", { type: "file", id: "file-input", accept: "image/*", style: "display:none;" })
  );
  host.appendChild(zone);

  const fileInput = qs("#file-input", zone);
  zone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

  ["dragover", "dragleave", "drop"].forEach((evt) =>
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      if (evt === "dragover") zone.classList.add("dropzone--drag");
      if (evt === "dragleave" || evt === "drop") zone.classList.remove("dropzone--drag");
      if (evt === "drop") handleFiles(e.dataTransfer.files);
    })
  );
}

function handleFiles(files) {
  if (!files || files.length === 0) return;
  const file = files[0];
  const reader = new FileReader();
  reader.onload = () => {
    openMetadataPrompt(file, reader.result);
  };
  reader.readAsDataURL(file);
}

function openMetadataPrompt(file, previewSrc, existing) {
  const overlay = el("div", { class: "modal-overlay" });
  const isEdit = !!existing;
  const form = el("form", { class: "modal", id: "achievement-form", novalidate: "true" },
    el("button", { class: "modal__close", type: "button", onclick: () => closeOverlay(overlay) }, "×"),
    el("div", { class: "auth-modal__eyebrow" }, isEdit ? "Edit Achievement" : "New Achievement"),
    el("h2", { class: "auth-modal__title" }, isEdit ? "Update this entry" : "Add to your locker"),
    el("img", { src: previewSrc, style: "width:100%; height:140px; object-fit:cover; border-radius:8px; margin-bottom:16px;" }),
    el("label", { class: "field-label" }, "Title",
      el("input", { class: "field-input", id: "ach-title", required: "true", placeholder: "e.g. Winner — Codeverse '25", value: existing?.title || "" })
    ),
    el("label", { class: "field-label" }, "Issued By",
      el("input", { class: "field-input", id: "ach-issuer", required: "true", placeholder: "e.g. COEP Innovation Hub", value: existing?.issuer || "" })
    ),
    el("label", { class: "field-label" }, "Date",
      el("input", { type: "date", class: "field-input", id: "ach-date", required: "true", value: existing?.date || "" })
    ),
    el("button", { type: "submit", class: "btn btn--gold btn--block" }, isEdit ? "Save Changes" : "Save to Locker")
  );
  overlay.appendChild(form);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeOverlay(overlay); });
  openOverlay(overlay);

  const submitBtn = qs("button[type=submit]", form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = qs("#ach-title", form);
    const issuer = qs("#ach-issuer", form);
    const date = qs("#ach-date", form);
    let ok = true;
    if (!title.value.trim()) { markInvalid(title, "Give this achievement a title."); ok = false; } else clearInvalid(title);
    if (!issuer.value.trim()) { markInvalid(issuer, "Who issued this?"); ok = false; } else clearInvalid(issuer);
    if (!date.value) { markInvalid(date, "Pick a date."); ok = false; } else clearInvalid(date);
    if (!ok) { toast("Please fix the highlighted fields.", "error"); return; }

    const fd = new FormData();
    fd.append("title", title.value.trim());
    fd.append("issuer", issuer.value.trim());
    fd.append("date", date.value);
    if (file) fd.append("image", file);

    submitBtn.disabled = true;
    try {
      if (isEdit) {
        await api.updateAchievement(existing.id, fd);
        toast("Achievement updated.", "success");
      } else {
        await api.createAchievement(fd);
        toast("Saved to your locker.", "success");
      }
      closeOverlay(overlay);
      await renderLocker();
    } catch (err) {
      toast(err.message || "Couldn't save this achievement.", "error");
      submitBtn.disabled = false;
    }
  });
}

async function renderLocker() {
  const host = qs("#locker-grid");
  host.innerHTML = "";
  host.appendChild(el("p", { class: "text-muted" }, "Loading your locker…"));

  let items = [];
  try {
    items = await api.listAchievements();
  } catch (err) {
    host.innerHTML = "";
    host.appendChild(el("div", { class: "empty-state" }, el("h3", {}, "Couldn't load your locker"), el("p", {}, err.message || "")));
    return;
  }

  const subEl = host.parentElement.querySelector(".section-head__sub");
  if (subEl) subEl.textContent = `${items.length} saved`;
  const statsHost = qs("#locker-stats");
  if (statsHost) {
    statsHost.innerHTML = "";
    const issuers = new Set(items.map((i) => i.issuer)).size;
    const thisYear = items.filter((i) => new Date(i.date).getFullYear() === new Date().getFullYear()).length;
    [[items.length, "Total saved"], [issuers, "Unique issuers"], [thisYear, "This year"]].forEach(([num, label]) => {
      statsHost.appendChild(el("div", { class: "locker-stat" }, el("strong", {}, String(num)), label));
    });
  }

  host.innerHTML = "";
  if (items.length === 0) {
    host.appendChild(el("div", { class: "empty-state" },
      el("div", { class: "empty-state__glyph" }, "🏆"),
      el("h3", {}, "Your locker is empty"),
      el("p", {}, "Add a certificate or achievement above to see it here.")
    ));
    return;
  }

  items.forEach((item) => {
    const card = el("div", { class: "achievement-card reveal" },
      el("img", { class: "achievement-card__thumb", src: item.image, alt: item.title }),
      el("div", { class: "achievement-card__body" },
        el("div", { class: "achievement-card__title" }, item.title),
        el("div", { class: "achievement-card__meta" }, `${item.issuer} · ${formatDate(item.date)}`),
        el("div", { class: "achievement-card__actions" },
          el("button", { class: "achievement-card__link achievement-card__link--edit", type: "button", onclick: () => openMetadataPrompt(null, item.image, item) }, "Edit"),
          el("button", { class: "achievement-card__link achievement-card__link--remove", type: "button", onclick: () => removeAchievement(item.id) }, "Remove")
        )
      )
    );
    host.appendChild(card);
  });
  initScrollReveal(host);
}

async function removeAchievement(id) {
  const ok = await confirmDialog({
    title: "Remove this achievement?",
    message: "It will be permanently removed from your locker.",
    glyph: "🗑", confirmLabel: "Remove",
  });
  if (!ok) return;
  try {
    await api.deleteAchievement(id);
    toast("Removed from locker.", "info");
    await renderLocker();
  } catch (err) {
    toast(err.message || "Couldn't remove this achievement.", "error");
  }
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

async function renderTickets() {
  const host = qs("#tickets-grid");
  if (!host) return;
  host.innerHTML = "";
  host.appendChild(el("p", { class: "text-muted" }, "Loading your tickets…"));

  let tickets = [];
  try {
    tickets = await api.myRegistrations();
  } catch (err) {
    host.innerHTML = "";
    host.appendChild(el("div", { class: "empty-state" }, el("h3", {}, "Couldn't load your tickets"), el("p", {}, err.message || "")));
    return;
  }

  const subEl = qs("#tickets-count");
  if (subEl) subEl.textContent = `${tickets.length} tickets`;

  host.innerHTML = "";
  if (tickets.length === 0) {
    host.appendChild(el("div", { class: "empty-state" },
      el("div", { class: "empty-state__glyph" }, "🎟"),
      el("h3", {}, "No registered events"),
      el("p", {}, "You haven't registered for any events yet. Head over to the home feed to discover active events!")
    ));
    return;
  }

  for (const reg of tickets) {
    let eventDetail = null;
    try {
      eventDetail = await api.getEvent(reg.event);
    } catch (e) {
      eventDetail = {
        title: reg.event_title || "Campus Event",
        institution: reg.event_institution || "University",
        venue: "Main Campus Venue",
        date: new Date().toISOString(),
        category: "Other"
      };
    }

    const ticketCard = buildTicketPassCard(reg, eventDetail);
    host.appendChild(ticketCard);
  }
  initScrollReveal(host);
}

function buildTicketPassCard(reg, ev) {
  const cover = ev.cover_image || coverImageFor(ev.title);
  
  const card = el("article", { class: "achievement-card reveal" },
    el("img", { class: "achievement-card__thumb", src: cover, alt: ev.title, loading: "lazy" }),
    el("div", { class: "achievement-card__body" },
      el("div", { class: "status-tag status-tag--active", style: "display:inline-block; margin-bottom:8px; font-size:10px; font-weight:700;" }, "Entry Pass Active"),
      el("h3", { class: "achievement-card__title" }, ev.title),
      el("div", { class: "achievement-card__meta", style: "margin-top:4px;" }, `📅 ${formatDate(ev.date)} · 📍 ${ev.venue}`),
      el("div", { class: "achievement-card__meta", style: "margin-top:6px; color: var(--gold-bright); font-weight:600;" }, `Attendee: ${reg.attendee_name}`),
      el("div", { class: "achievement-card__actions", style: "margin-top:14px; display:flex; gap:10px;" },
        el("button", { 
          class: "btn btn--gold btn--sm", 
          style: "flex:1; padding: 6px 10px; font-size: 11px; height: 32px;", 
          type: "button",
          onclick: (e) => { e.stopPropagation(); downloadTicketImage(reg, ev); } 
        }, "Download"),
        el("button", { 
          class: "btn btn--outline btn--sm", 
          style: "flex:1; padding: 6px 10px; font-size: 11px; height: 32px;", 
          type: "button",
          onclick: (e) => { e.stopPropagation(); showTicketModal(reg, ev); } 
        }, "View QR")
      )
    )
  );
  return card;
}

function showTicketModal(registration, ev) {
  const overlay = el("div", { class: "modal-overlay" });
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
      el("div", { class: "receipt__watermark" }, "✓ Confirmed — Entry Pass Receipt"),
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
      el("p", { class: "text-muted", style: "margin-top:14px; font-size:12px;" }, "This pass is generated and stored server-side against your account.")
    ),
    el("div", { style: "display:flex; gap:12px; margin-top:24px;" },
      el("button", { class: "btn btn--gold", style: "flex:1;", onclick: () => downloadTicketImage(registration, ev) }, "Download Ticket"),
      el("button", { class: "btn btn--outline", style: "flex:1;", onclick: () => closeOverlay(overlay) }, "Close")
    )
  );
  overlay.innerHTML = "";
  overlay.appendChild(modal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeOverlay(overlay); });
  openOverlay(overlay);
}

document.addEventListener("DOMContentLoaded", initAchievementsPage);
