/* ============================================================
   utils.js — shared DOM/UX helpers used across every page module.
   Business data (users, events, proposals, achievements...) no
   longer lives here — see api.js for the Django REST client. This
   file only keeps small, presentation-only helpers.
   ============================================================ */

const STORAGE_KEYS = {
  CITY: "uni_city", // last-picked city is a UI preference only, kept client-side
};

/* ---------- tiny DOM helpers ---------- */
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === null || v === undefined) return;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  });
  children.flat().forEach((c) => {
    if (c === null || c === undefined) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
};

/* ---------- safe local storage (UI preferences only) ---------- */
function storageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function storageSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ---------- image helpers ---------- */
function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "event";
}
/* Standing in for an AI-fetched cover: a stable seeded photo so an event
   without a cover_image from the backend still renders something on-brand. */
function coverImageFor(seedText) {
  return `https://picsum.photos/seed/${slugify(seedText)}/640/420`;
}

/* ---------- formatting ---------- */
function formatDate(isoStr) {
  const d = new Date(isoStr);
  if (isNaN(d)) return isoStr;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function formatCurrency(n) {
  if (!n || n === 0) return "Free";
  return `₹${Number(n).toLocaleString("en-IN")}`;
}
function countdownLabel(isoStr) {
  const target = new Date(isoStr);
  if (isNaN(target)) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target - startOfToday) / 86400000);
  if (diffDays < 0) return "Past event";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays <= 30) return `In ${diffDays} days`;
  return `In ${Math.round(diffDays / 30)} mo`;
}

/* ---------- debounce ---------- */
function debounce(fn, wait = 220) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* ---------- toast ---------- */
const TOAST_ICONS = { success: "✓", error: "!", info: "i" };
function toast(message, type = "info") {
  let host = qs("#toast-host");
  if (!host) {
    host = el("div", { id: "toast-host" });
    document.body.appendChild(host);
  }
  const note = el("div", { class: `toast toast--${type}` },
    el("span", { class: "toast__icon" }, TOAST_ICONS[type] || "i"),
    el("span", {}, message)
  );
  host.appendChild(note);
  requestAnimationFrame(() => note.classList.add("toast--visible"));
  setTimeout(() => {
    note.classList.remove("toast--visible");
    setTimeout(() => note.remove(), 250);
  }, 3200);
}

/* ---------- clipboard ---------- */
function copyToken(token) {
  navigator.clipboard?.writeText(token).then(
    () => toast("Token copied to clipboard.", "success"),
    () => toast(token, "info")
  );
}

/* ---------- route guarding (reads the cached session from api.js) ---------- */
function requireRole(role, redirectTo = "/") {
  const session = getSession();
  if (!session || session.role !== role) {
    toast(`This area needs a ${role} login.`, "error");
    setTimeout(() => (window.location.href = redirectTo), 900);
    return null;
  }
  return session;
}

/* ---------- generic overlay lifecycle: ESC to close + focus trap-lite ---------- */
function openOverlay(overlay) {
  document.body.appendChild(overlay);
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => overlay.classList.add("modal-overlay--visible"));
  const onKey = (e) => {
    if (e.key === "Escape") closeOverlay(overlay);
  };
  overlay.__escHandler = onKey;
  document.addEventListener("keydown", onKey);
  const firstField = qs("input, textarea, select, button", overlay);
  firstField?.focus({ preventScroll: true });
}
function closeOverlay(overlay) {
  if (!overlay) return;
  overlay.classList.remove("modal-overlay--visible");
  document.body.classList.remove("modal-open");
  if (overlay.__escHandler) document.removeEventListener("keydown", overlay.__escHandler);
  setTimeout(() => overlay.remove(), 220);
}

/* ---------- confirm dialog (replaces window.confirm for destructive actions) ---------- */
function confirmDialog({ title = "Are you sure?", message = "", glyph = "⚠", confirmLabel = "Confirm", danger = true } = {}) {
  return new Promise((resolve) => {
    const overlay = el("div", { class: "modal-overlay" });
    const modal = el("div", { class: "modal confirm-modal", role: "alertdialog", "aria-modal": "true" },
      el("div", { class: "confirm-modal__glyph" }, glyph),
      el("h3", {}, title),
      message ? el("p", { class: "text-muted mt-32", style: "margin-top:10px;" }, message) : null,
      el("div", { class: "confirm-modal__actions" },
        el("button", { class: "btn btn--outline", type: "button", onclick: () => { closeOverlay(overlay); resolve(false); } }, "Cancel"),
        el("button", { class: `btn ${danger ? "btn--danger" : "btn--gold"}`, type: "button", onclick: () => { closeOverlay(overlay); resolve(true); } }, confirmLabel)
      )
    );
    overlay.appendChild(modal);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) { closeOverlay(overlay); resolve(false); } });
    openOverlay(overlay);
  });
}

/* ---------- field validation helpers ---------- */
function markInvalid(input, message) {
  input.classList.add("field-error");
  let msg = input.parentElement.querySelector(".field-error-msg");
  if (!msg) {
    msg = el("span", { class: "field-error-msg" });
    input.insertAdjacentElement("afterend", msg);
  }
  msg.textContent = message;
  msg.classList.add("field-error-msg--visible");
}
function clearInvalid(input) {
  input.classList.remove("field-error");
  const msg = input.parentElement.querySelector(".field-error-msg");
  if (msg) msg.classList.remove("field-error-msg--visible");
}

/* ---------- reveal-on-scroll ---------- */
let __revealObserver = null;
function initScrollReveal(root = document) {
  if (!("IntersectionObserver" in window)) {
    qsa(".reveal", root).forEach((n) => n.classList.add("reveal--visible"));
    return;
  }
  if (!__revealObserver) {
    __revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("reveal--visible");
          __revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  }
  qsa(".reveal:not(.reveal--visible)", root).forEach((n) => __revealObserver.observe(n));
}

/* ---------- animated number counters ---------- */
function animateCount(node, target, { duration = 900, prefix = "", suffix = "" } = {}) {
  if (typeof target !== "number" || isNaN(target)) {
    node.textContent = prefix + target + suffix;
    return;
  }
  const start = 0;
  const startTime = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = Math.round(start + (target - start) * eased);
    node.textContent = prefix + val.toLocaleString("en-IN") + suffix;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ---------- city preference (UI-only, remembered locally) ---------- */
function getCity() {
  return storageGet(STORAGE_KEYS.CITY, "Pune");
}
function setCity(city) {
  storageSet(STORAGE_KEYS.CITY, city);
}

/* ---------- page loader dismiss + back-to-top + shrinking navbar ---------- */
function initChromeExtras() {
  const loader = qs("#page-loader");
  if (loader) {
    window.addEventListener("load", () => {
      setTimeout(() => loader.classList.add("loader--hidden"), 260);
    });
    setTimeout(() => loader.classList.add("loader--hidden"), 1600);
  }

  const topbar = qs(".topbar");
  const backBtn = el("button", { id: "back-to-top", "aria-label": "Back to top", title: "Back to top" }, "↑");
  document.body.appendChild(backBtn);
  backBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  window.addEventListener("scroll", debounce(() => {
    if (window.scrollY > 420) backBtn.classList.add("visible"); else backBtn.classList.remove("visible");
    if (topbar) { if (window.scrollY > 12) topbar.classList.add("topbar--scrolled"); else topbar.classList.remove("topbar--scrolled"); }
  }, 40));
}

document.addEventListener("DOMContentLoaded", initChromeExtras);

function downloadTicketImage(registration, ev) {
  const canvas = document.createElement("canvas");
  canvas.width = 450;
  canvas.height = 700;
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#130D0A";
  ctx.fillRect(0, 0, 450, 700);

  // Border
  ctx.strokeStyle = "#D9A45C";
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 430, 680);

  // Inner border
  ctx.strokeStyle = "rgba(217, 164, 92, 0.2)";
  ctx.lineWidth = 1;
  ctx.strokeRect(16, 16, 418, 668);

  // Header Banner
  ctx.fillStyle = "#4A0F1D"; // maroon-dark
  ctx.fillRect(20, 20, 410, 60);

  // Header Text
  ctx.fillStyle = "#D9A45C"; // gold
  ctx.font = "bold 20px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("UNIEVENTS ENTRY PASS", 225, 50);

  // Reset text alignment
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Event Details Section
  ctx.fillStyle = "#F2C888"; // gold-bright
  ctx.font = "bold 13px Arial, sans-serif";
  ctx.fillText("EVENT DETAILS", 35, 120);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 18px Arial, sans-serif";
  
  // Wrap event title if too long
  const title = ev.title;
  let y = 145;
  if (title.length > 30) {
    ctx.fillText(title.slice(0, 30), 35, y);
    ctx.fillText(title.slice(30), 35, y + 22);
    y += 45;
  } else {
    ctx.fillText(title, 35, y);
    y += 25;
  }

  ctx.fillStyle = "#C9BEA9"; // cream-dim
  ctx.font = "14px Arial, sans-serif";
  ctx.fillText(`Institution: ${ev.institution || "—"}`, 35, y);
  y += 22;
  ctx.fillText(`Date: ${formatDate(ev.date)}`, 35, y);
  y += 22;
  ctx.fillText(`Venue: ${ev.venue}`, 35, y);
  y += 25;

  // Dotted ticket divider
  ctx.strokeStyle = "rgba(217, 164, 92, 0.4)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(30, y);
  ctx.lineTo(420, y);
  ctx.stroke();
  ctx.setLineDash([]); // reset line dash
  y += 30;

  // Attendee Details Section
  ctx.fillStyle = "#F2C888"; // gold-bright
  ctx.font = "bold 13px Arial, sans-serif";
  ctx.fillText("ATTENDEE INFORMATION", 35, y);
  y += 25;

  ctx.fillStyle = "#C9BEA9";
  ctx.font = "14px Arial, sans-serif";
  ctx.fillText(`Name: ${registration.attendee_name}`, 35, y);
  y += 22;
  ctx.fillText(`ID: ${registration.attendee_id}`, 35, y);
  y += 22;
  ctx.fillText(`Affiliation: ${registration.affiliation}`, 35, y);
  y += 22;
  ctx.fillText(`Email: ${registration.email}`, 35, y);
  y += 25;

  // Dotted divider 2
  ctx.strokeStyle = "rgba(217, 164, 92, 0.4)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(30, y);
  ctx.lineTo(420, y);
  ctx.stroke();
  ctx.setLineDash([]);
  y += 25;

  // QR Code Header
  ctx.fillStyle = "#D7A088"; // rosegold
  ctx.font = "bold 11px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("SCAN TO VERIFY ENTRY", 225, y);
  y += 15;

  // Generate QR Canvas
  const qrCanvas = document.createElement("canvas");
  if (typeof QRious !== "undefined") {
    new QRious({
      element: qrCanvas,
      value: window.location.origin + "/verify-ticket/" + registration.transaction_hash + "/",
      size: 150,
      background: "#FFFFFF",
      foreground: "#000000"
    });
  }

  // Draw QR canvas onto ticket canvas
  // Give it a small white background border for nice look
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(145, y - 5, 160, 160);
  ctx.drawImage(qrCanvas, 150, y, 150, 150);
  y += 175;

  // Footer / TXN Hash
  ctx.fillStyle = "#9C8E79"; // slate
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.fillText(`TXN: ${registration.transaction_hash}`, 225, y);

  // Trigger browser download
  try {
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `ticket-${registration.transaction_hash}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast("QR Ticket downloaded successfully!", "success");
  } catch (err) {
    toast("Failed to download ticket image.", "error");
  }
}

