/* =========================================================
   HORIZON RP — dashboard.js
   Logique du dashboard connecté : échange OAuth via le Worker,
   affichage des onglets, signalements, sanctions, service staff.
   ========================================================= */

/* À remplacer par l'URL réelle de ton Worker Cloudflare une fois déployé. */
const WORKER_URL = "https://fragrant-base-e05d.lmauge-joan76.workers.dev";

let views = {};

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
    if (!raw) return null;
    const user = JSON.parse(raw);
    // Sécurité : une session d'un ancien format (avant ajout de isAdmin,
    // ou avatarUrl manquant) ne doit jamais faire planter le rendu.
    if (!user || typeof user !== "object" || !user.id || !user.username) {
      sessionStorage.removeItem("horizon_user");
      return null;
    }
    return user;
  } catch {
    sessionStorage.removeItem("horizon_user");
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
          redirect_uri: "https://hznrp.netlify.app/dashboard/",
        }),
      });
      if (!res.ok) throw new Error("auth failed");
      const user = await res.json();
      setSession(user);

      // Si l'utilisateur venait d'une autre page (ex: /recrutement/),
      // on l'y renvoie automatiquement maintenant qu'il est connecté.
      const returnTo = sessionStorage.getItem("horizon_return_to");
      sessionStorage.removeItem("horizon_return_to");
      if (returnTo && returnTo !== "/dashboard" && returnTo !== "/dashboard/") {
        window.location.href = returnTo;
        return;
      }

      renderApp(user);
      return;
    } catch (err) {
      console.error("Connexion Discord — erreur:", err);
      sessionStorage.removeItem("horizon_user");
      showView("logged-out");
      return;
    }
  }

  const existing = getSession();
  if (existing) {
    try {
      renderApp(existing);
    } catch (err) {
      console.error("Erreur lors du rendu du dashboard, session réinitialisée:", err);
      sessionStorage.removeItem("horizon_user");
      showView("logged-out");
    }
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
  const settingsTabBtn = document.querySelector('[data-tab="settings"]');

  if (user.isStaff) {
    badge.hidden = false;
    dutyToggle.hidden = false;
    staffTabBtn.hidden = false;
    initDutyToggle(user);
  }

  if (user.isAdmin && settingsTabBtn) {
    settingsTabBtn.hidden = false;
    initSettingsForm(user);
    loadSettingsIntoForm();
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

/* ---------- Paramètres (admin) ---------- */
const PREVIEW_ICONS = {
  game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  roles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 3v18M19 3v18M5 8h14M5 16h14"/></svg>',
  language: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h18M3 6h18M3 18h18"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9-5-4.9 6.9-1Z"/></svg>',
};

let previewItemsState = [];

function initSettingsForm(user) {
  const form = document.querySelector("[data-settings-form]");
  if (!form || form.dataset.bound) return;
  form.dataset.bound = "true";

  document.querySelector("[data-add-preview-item]")?.addEventListener("click", () => {
    previewItemsState.push({ icon: "star", label: "", value: "" });
    renderPreviewEditor();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const feedback = document.querySelector("[data-settings-feedback]");
    feedback.className = "form-feedback";

    readPreviewEditorIntoState();
    const cleanItems = previewItemsState.filter((item) => item.label.trim() && item.value.trim());

    if (cleanItems.length === 0) {
      feedback.textContent = "Ajoutez au moins une ligne avec un libellé et une valeur.";
      feedback.classList.add("is-error");
      return;
    }

    const formData = new FormData(form);
    const payload = {
      discordId: user.id,
      recrutementOuvert: formData.get("recrutementOuvert") === "on",
      maintenance: formData.get("maintenance") === "on",
      previewItems: cleanItems,
    };

    try {
      const res = await fetch(`${WORKER_URL}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("failed");
      feedback.textContent = "Paramètres enregistrés.";
      feedback.classList.add("is-success");
    } catch {
      feedback.textContent = "Erreur lors de l'enregistrement. Réessayez.";
      feedback.classList.add("is-error");
    }
  });
}

function renderPreviewEditor() {
  const container = document.querySelector("[data-preview-editor]");
  if (!container) return;

  container.innerHTML = previewItemsState
    .map(
      (item, index) => `
      <div class="preview-editor__row" data-preview-row="${index}">
        <select data-preview-icon>
          ${Object.keys(PREVIEW_ICONS)
            .map((key) => `<option value="${key}" ${item.icon === key ? "selected" : ""}>${key}</option>`)
            .join("")}
        </select>
        <input type="text" data-preview-label placeholder="Libellé (ex: Jeu support)" value="${escapeAttr(item.label)}">
        <input type="text" data-preview-value placeholder="Valeur (ex: Emergency Hamburg)" value="${escapeAttr(item.value)}">
        <button type="button" class="preview-editor__remove" data-remove-preview-item="${index}" aria-label="Supprimer">&times;</button>
      </div>`
    )
    .join("");

  container.querySelectorAll("[data-remove-preview-item]").forEach((btn) => {
    btn.addEventListener("click", () => {
      readPreviewEditorIntoState();
      const idx = Number(btn.dataset.removePreviewItem);
      previewItemsState.splice(idx, 1);
      renderPreviewEditor();
    });
  });
}

function readPreviewEditorIntoState() {
  const rows = document.querySelectorAll("[data-preview-row]");
  previewItemsState = Array.from(rows).map((row) => ({
    icon: row.querySelector("[data-preview-icon]")?.value || "star",
    label: row.querySelector("[data-preview-label]")?.value || "",
    value: row.querySelector("[data-preview-value]")?.value || "",
  }));
}

async function loadSettingsIntoForm() {
  const form = document.querySelector("[data-settings-form]");
  if (!form) return;
  try {
    const res = await fetch(`${WORKER_URL}/settings`);
    if (!res.ok) throw new Error("failed");
    const s = await res.json();

    form.elements.recrutementOuvert.checked = Boolean(s.recrutementOuvert);
    form.elements.maintenance.checked = Boolean(s.maintenance);
    previewItemsState = Array.isArray(s.previewItems) && s.previewItems.length
      ? s.previewItems.map((i) => ({ icon: i.icon || "star", label: i.label || "", value: i.value || "" }))
      : [{ icon: "star", label: "", value: "" }];
    renderPreviewEditor();
  } catch {
    const feedback = document.querySelector("[data-settings-feedback]");
    if (feedback) {
      feedback.textContent = "Impossible de charger les paramètres actuels.";
      feedback.className = "form-feedback is-error";
    }
  }
}

/* ---------- Recherche / filtrage instantané d'une liste ---------- */
function applyListSearch(inputSelector, listEl) {
  const input = document.querySelector(inputSelector);
  if (!input || input.dataset.bound) {
    if (input) filterListRows(input, listEl);
    return;
  }
  input.dataset.bound = "true";
  input.addEventListener("input", () => filterListRows(input, listEl));
}

function filterListRows(input, listEl) {
  const query = input.value.trim().toLowerCase();
  const rows = listEl.querySelectorAll(".list-row[data-search]");
  let visibleCount = 0;

  rows.forEach((row) => {
    const matches = !query || row.dataset.search.includes(query);
    row.style.display = matches ? "" : "none";
    if (matches) visibleCount += 1;
  });

  let emptyMsg = listEl.querySelector(".list-empty--search");
  if (visibleCount === 0 && rows.length > 0) {
    if (!emptyMsg) {
      emptyMsg = document.createElement("div");
      emptyMsg.className = "list-empty list-empty--search";
      emptyMsg.textContent = "Aucun résultat pour cette recherche.";
      listEl.appendChild(emptyMsg);
    }
  } else if (emptyMsg) {
    emptyMsg.remove();
  }
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
        <div class="list-row" data-search="${escapeAttr((r.roblox_username + ' ' + r.roblox_id).toLowerCase())}">
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
    applyListSearch("[data-reports-search]", list);
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
        <div class="list-row" data-search="${escapeAttr((s.roblox_username + ' ' + s.roblox_id).toLowerCase())}">
          <span class="list-row__tag ${s.type}">${labels[s.type] || s.type}</span>
          <div class="list-row__body">
            <p class="list-row__title"><strong>${escapeHtml(s.roblox_username)}</strong> (ID ${escapeHtml(s.roblox_id)}) — ${escapeHtml(s.duration)}</p>
            <p class="list-row__meta">${escapeHtml(s.reason)} — par ${escapeHtml(s.staff_username)} · ${formatDate(s.created_at)}</p>
          </div>
        </div>`
      )
      .join("");
    applyListSearch("[data-sanctions-search]", list);
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
          <span class="list-row__tag duty" data-duty-elapsed="${escapeAttr(d.started_at)}">${formatElapsed(d.started_at)}</span>
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

/* Calcule "Xh Ymin" (ou "Ymin") depuis une date ISO de début de service. */
function formatElapsed(iso) {
  try {
    const start = new Date(iso).getTime();
    const diffMs = Date.now() - start;
    if (diffMs < 0) return "0min";
    const totalMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${minutes}min`;
    return `${minutes}min`;
  } catch {
    return "";
  }
}

/* Rafraîchit l'affichage des durées "en service" sans tout recharger
   depuis le serveur, pour que le compteur avance en direct. */
function refreshDutyElapsedDisplays() {
  document.querySelectorAll("[data-duty-elapsed]").forEach((el) => {
    el.textContent = formatElapsed(el.dataset.dutyElapsed);
  });
}
setInterval(refreshDutyElapsedDisplays, 30000);

document.addEventListener("DOMContentLoaded", () => {
  views = {
    "logged-out": document.querySelector('[data-view="logged-out"]'),
    loading: document.querySelector('[data-view="loading"]'),
    app: document.querySelector('[data-view="app"]'),
  };
  init();
});
