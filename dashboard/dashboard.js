/* =========================================================
   HORIZON RP — dashboard.js
   Logique du dashboard connecté : échange OAuth via le Worker,
   affichage des onglets, signalements, sanctions, service staff.
   ========================================================= */

/* À remplacer par l'URL réelle de ton Worker Cloudflare une fois déployé. */
const WORKER_URL = "https://fragrant-base-e05d.lmauge-joan76.workers.dev";

const views = {
  loggedOut: document.querySelector('[data-view="logged-out"]'),
  loading: document.querySelector('[data-view="loading"]'),
  app: document.querySelector('[data-view="app"]'),
};

function showView(name) {
  Object.entries(views).forEach(([key, el]) => {
    if (!el) return;
    el.style.display = key === name ? "" : "none";
  });
}

/* ---------- Session (sessionStorage, effacée à la fermeture de l'onglet) ---------- */
function getSession() {
  try {
    const raw = sessionStorage.getItem("horizon_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function setSession(user) {
  sessionStorage.setItem("horizon_user", JSON.stringify(user));
}

/* ---------- Entrée : gère le retour OAuth (?code=...) ou la session existante ---------- */
async function init() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");

  if (code) {
    showView("loading");
    window.history.replaceState({}, document.title, window.location.pathname);
    try {
      const res = await fetch(`${WORKER_URL}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          redirect_uri: "https://devcenter24.github.io/horizon-rp/dashboard",
        }),
      });
      if (!res.ok) throw new Error("auth failed");
      const user = await res.json();
      setSession(user);
      renderApp(user);
      return;
    } catch (err) {
      console.error("Connexion Discord — erreur:", err);
      showView("logged-out");
      return;
    }
  }

  const existing = getSession();
  if (existing) {
    renderApp(existing);
  } else {
    showView("logged-out");
  }
}

/* ---------- Rendu de l'app connectée ---------- */
function renderApp(user) {
  showView("app");

  document.querySelector("[data-user-avatar]").src = user.avatarUrl;
  document.querySelector("[data-user-name]").firstChild.textContent = user.username + " ";

  const badge = document.querySelector("[data-staff-badge]");
  const dutyToggle = document.querySelector("[data-duty-toggle]");
  const staffTabBtn = document.querySelector('[data-tab="staff-panel"]');

  if (user.isStaff) {
    badge.hidden = false;
    dutyToggle.hidden = false;
    staffTabBtn.hidden = false;
    initDutyToggle(user);
  }

  initTabs();
  loadReports();
  loadDutyList();
  if (user.isStaff) {
    document.querySelector('[data-report-form]') && initReportForm(user);
    initSanctionForm(user);
    loadSanctions();
  } else {
    initReportForm(user);
  }
}

/* ---------- Onglets ---------- */
function initTabs() {
  const buttons = document.querySelectorAll(".dash-tabs button[data-tab]");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.hidden) return;
      buttons.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");

      document.querySelectorAll(".dash-panel").forEach((panel) => {
        panel.classList.toggle("is-active", panel.dataset.panel === btn.dataset.tab);
      });
    });
  });
}

/* ---------- Formulaire signalement ---------- */
function initReportForm(user) {
  const form = document.querySelector("[data-report-form]");
  if (!form || form.dataset.bound) return;
  form.dataset.bound = "true";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const feedback = document.querySelector("[data-report-feedback]");
    feedback.className = "form-feedback";

    const formData = new FormData(form);
    const payload = {
      discordId: user.id,
      username: user.username,
      robloxUsername: formData.get("robloxUsername"),
      robloxId: formData.get("robloxId"),
      proofUrl: formData.get("proofUrl"),
      reason: formData.get("reason"),
    };

    try {
      const res = await fetch(`${WORKER_URL}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("failed");
      feedback.textContent = "Signalement envoyé. Merci !";
      feedback.classList.add("is-success");
      form.reset();
      loadReports();
    } catch {
      feedback.textContent = "Erreur lors de l'envoi. Réessayez.";
      feedback.classList.add("is-error");
    }
  });
}

/* ---------- Formulaire sanction (staff) ---------- */
function initSanctionForm(user) {
  const form = document.querySelector("[data-sanction-form]");
  if (!form || form.dataset.bound) return;
  form.dataset.bound = "true";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const feedback = document.querySelector("[data-sanction-feedback]");
    feedback.className = "form-feedback";

    const formData = new FormData(form);
    const payload = {
      discordId: user.id,
      username: user.username,
      type: formData.get("type"),
      robloxUsername: formData.get("robloxUsername"),
      robloxId: formData.get("robloxId"),
      duration: formData.get("duration"),
      reason: formData.get("reason"),
    };

    try {
      const res = await fetch(`${WORKER_URL}/sanction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("failed");
      feedback.textContent = "Sanction enregistrée.";
      feedback.classList.add("is-success");
      form.reset();
      loadSanctions();
    } catch {
      feedback.textContent = "Erreur lors de l'enregistrement. Réessayez.";
      feedback.classList.add("is-error");
    }
  });
}

/* ---------- Prise / fin de service ---------- */
function initDutyToggle(user) {
  const toggle = document.querySelector("[data-duty-toggle]");
  if (toggle.dataset.bound) return;
  toggle.dataset.bound = "true";

  toggle.addEventListener("click", async () => {
    const onDuty = toggle.dataset.onDuty === "true";
    const action = onDuty ? "end" : "start";

    toggle.disabled = true;
    try {
      const res = await fetch(`${WORKER_URL}/duty`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discordId: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl,
          action,
        }),
      });
      if (!res.ok) throw new Error("failed");
      toggle.dataset.onDuty = onDuty ? "false" : "true";
      document.querySelector("[data-duty-label]").textContent = onDuty
        ? "Prendre son service"
        : "Terminer son service";
      loadDutyList();
    } catch (err) {
      console.error("Erreur duty toggle:", err);
    } finally {
      toggle.disabled = false;
    }
  });
}

/* ---------- Chargement : signalements ---------- */
async function loadReports() {
  const list = document.querySelector("[data-reports-list]");
  const count = document.querySelector("[data-reports-count]");
  try {
    const res = await fetch(`${WORKER_URL}/logs`);
    const data = await res.json();
    const reports = data.reports || [];

    count.textContent = reports.length + (reports.length > 1 ? " signalements" : " signalement");

    if (reports.length === 0) {
      list.innerHTML = '<div class="list-empty">Aucun signalement pour le moment.</div>';
      return;
    }

    list.innerHTML = reports
      .map(
        (r) => `
        <div class="list-row">
          <span class="list-row__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 9v4M12 17h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"/></svg>
          </span>
          <div class="list-row__body">
            <p class="list-row__title"><strong>${escapeHtml(r.roblox_username)}</strong> (ID ${escapeHtml(r.roblox_id)})</p>
            <p class="list-row__meta">${escapeHtml(r.reason)} — signalé par ${escapeHtml(r.reported_by_username)} · ${formatDate(r.created_at)}</p>
          </div>
          <a class="list-row__link" href="${escapeAttr(r.proof_url)}" target="_blank" rel="noopener">Preuve</a>
        </div>`
      )
      .join("");
  } catch {
    list.innerHTML = '<div class="list-empty">Impossible de charger les signalements.</div>';
  }
}

/* ---------- Chargement : sanctions ---------- */
async function loadSanctions() {
  const list = document.querySelector("[data-sanctions-list]");
  const count = document.querySelector("[data-sanctions-count]");
  if (!list) return;
  try {
    const res = await fetch(`${WORKER_URL}/logs`);
    const data = await res.json();
    const sanctions = data.sanctions || [];

    count.textContent = sanctions.length + (sanctions.length > 1 ? " sanctions" : " sanction");

    if (sanctions.length === 0) {
      list.innerHTML = '<div class="list-empty">Aucune sanction enregistrée.</div>';
      return;
    }

    const labels = { ban: "Ban", kick: "Kick", warn: "Warn" };

    list.innerHTML = sanctions
      .map(
        (s) => `
        <div class="list-row">
          <span class="list-row__tag ${s.type}">${labels[s.type] || s.type}</span>
          <div class="list-row__body">
            <p class="list-row__title"><strong>${escapeHtml(s.roblox_username)}</strong> (ID ${escapeHtml(s.roblox_id)}) — ${escapeHtml(s.duration)}</p>
            <p class="list-row__meta">${escapeHtml(s.reason)} — par ${escapeHtml(s.staff_username)} · ${formatDate(s.created_at)}</p>
          </div>
        </div>`
      )
      .join("");
  } catch {
    list.innerHTML = '<div class="list-empty">Impossible de charger les sanctions.</div>';
  }
}

/* ---------- Chargement : staff en service ---------- */
async function loadDutyList() {
  const list = document.querySelector("[data-duty-list]");
  const count = document.querySelector("[data-duty-count]");
  try {
    const res = await fetch(`${WORKER_URL}/duty/list`);
    const data = await res.json();
    const duty = data.duty || [];

    count.textContent = duty.length + (duty.length > 1 ? " en service" : " en service");

    if (duty.length === 0) {
      list.innerHTML = '<div class="list-empty">Personne n\'est en service actuellement.</div>';
      return;
    }

    list.innerHTML = duty
      .map(
        (d) => `
        <div class="list-row">
          <img class="list-row__avatar" src="${escapeAttr(d.avatar_url)}" alt="">
          <div class="list-row__body">
            <p class="list-row__title"><strong>${escapeHtml(d.username)}</strong></p>
            <p class="list-row__meta">En service depuis ${formatDate(d.started_at)}</p>
          </div>
        </div>`
      )
      .join("");
  } catch {
    list.innerHTML = '<div class="list-empty">Impossible de charger la liste.</div>';
  }
}

/* ---------- Helpers ---------- */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
function escapeAttr(str) {
  return (str ?? "").replace(/"/g, "&quot;");
}
function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

document.addEventListener("DOMContentLoaded", init);
