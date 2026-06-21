/* =========================================================
   HORIZON RP — recrutement.js
   Logique de la page de candidature staff.
   ========================================================= */

const WORKER_URL = "https://fragrant-base-e05d.lmauge-joan76.workers.dev";

function getSession() {
  try {
    const raw = sessionStorage.getItem("horizon_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function showState(name) {
  document.querySelectorAll(".recruit-card, .recruit-form").forEach((el) => {
    el.hidden = el.dataset.state !== name;
  });
}

async function init() {
  // Vérifie d'abord si le recrutement est ouvert
  let recrutementOuvert = true;
  try {
    const res = await fetch(`${WORKER_URL}/settings`);
    if (res.ok) {
      const settings = await res.json();
      recrutementOuvert = Boolean(settings.recrutementOuvert);
    }
  } catch {
    // En cas d'échec, on laisse le recrutement ouvert par défaut
  }

  if (!recrutementOuvert) {
    showState("closed");
    const statusEl = document.querySelector("[data-recruit-status]");
    if (statusEl) statusEl.innerHTML = '<span class="dot" style="background:var(--status-red)"></span> Recrutement fermé';
    return;
  }

  const user = getSession();
  if (!user) {
    showState("logged-out");
    return;
  }

  showState("form");
  document.querySelector("[data-user-avatar]").src = user.avatarUrl;
  document.querySelector("[data-user-name]").textContent = "Connecté en tant que " + user.username;

  initForm(user);
}

function initForm(user) {
  const form = document.querySelector("[data-application-form]");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const feedback = document.querySelector("[data-application-feedback]");
    feedback.className = "form-feedback";

    const formData = new FormData(form);
    const answers = {};
    for (let i = 1; i <= 15; i++) {
      answers["q" + i] = (formData.get("q" + i) || "").toString().trim();
    }

    const missing = Object.values(answers).some((v) => v.length === 0);
    if (missing) {
      feedback.textContent = "Merci de répondre à toutes les questions.";
      feedback.classList.add("is-error");
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const res = await fetch(`${WORKER_URL}/application`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discordId: user.id,
          username: user.username,
          answers,
        }),
      });
      if (!res.ok) throw new Error("failed");
      showState("sent");
    } catch {
      feedback.textContent = "Erreur lors de l'envoi. Réessayez.";
      feedback.classList.add("is-error");
      submitBtn.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
