/* =========================================================
   HORIZON RP — settings.js
   Applique les paramètres globaux sur les pages publiques :
   - Mode maintenance (bloque l'accès au site)
   - Mise à jour dynamique de la carte "Horizon RP — Aperçu"
   Inclus sur index.html. Inoffensif si les éléments data-*
   correspondants sont absents de la page.
   ========================================================= */

const PREVIEW_ICONS_SVG = {
  game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  roles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 3v18M19 3v18M5 8h14M5 16h14"/></svg>',
  language: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h18M3 6h18M3 18h18"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9-5-4.9 6.9-1Z"/></svg>',
};

(async function applyGlobalSettings() {
  const WORKER_URL = "https://fragrant-base-e05d.lmauge-joan76.workers.dev";

  let settings;
  try {
    const res = await fetch(`${WORKER_URL}/settings`);
    if (!res.ok) return;
    settings = await res.json();
  } catch {
    return; // en cas d'échec, on n'affecte pas l'affichage normal du site
  }

  if (settings.maintenance) {
    showMaintenanceOverlay();
    return; // pas la peine de mettre à jour le reste, la page est masquée
  }

  updateRecruitmentBadge(settings.recrutementOuvert);

  if (Array.isArray(settings.previewItems) && settings.previewItems.length) {
    renderPreviewBody(settings.previewItems);
  }
})();

function updateRecruitmentBadge(isOpen) {
  const badge = document.querySelector("[data-recruitment-status]");
  if (!badge) return;

  if (isOpen) {
    badge.innerHTML = '<span class="dot"></span> Recrutement ouvert';
  } else {
    badge.innerHTML = '<span class="dot" style="background:var(--status-red); box-shadow:0 0 0 3px rgba(255,77,77,0.18); animation:none;"></span> Recrutement fermé';
  }
}

function renderPreviewBody(items) {
  const body = document.querySelector("[data-preview-body]");
  if (!body) return;

  const escape = (str) => {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  };

  body.innerHTML = items
    .map((item) => {
      const icon = PREVIEW_ICONS_SVG[item.icon] || PREVIEW_ICONS_SVG.star;
      return `
        <div class="preview-row">
          <span class="preview-row__icon">${icon}</span>
          <span class="preview-row__text">${escape(item.label)}</span>
          <span class="preview-row__value">${escape(item.value)}</span>
        </div>`;
    })
    .join("");
}

function showMaintenanceOverlay() {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: #0a0a0c;
    display: flex; align-items: center; justify-content: center;
    flex-direction: column; text-align: center; padding: 24px;
    font-family: 'Inter', sans-serif; color: #f4f3f0;
  `;
  overlay.innerHTML = `
    <div style="width:64px;height:64px;border-radius:6px;background:rgba(255,106,26,0.1);
      border:1px solid #ff6a1a55;display:flex;align-items:center;justify-content:center;
      color:#ffb347;margin-bottom:24px;">
      <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M12 9v4M12 17h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"/>
      </svg>
    </div>
    <h1 style="font-family:'Oswald',sans-serif;font-size:28px;margin:0 0 10px;">Site en maintenance</h1>
    <p style="color:#a3a2a8;max-width:46ch;margin:0;">Horizon RP est temporairement indisponible. Merci de revenir un peu plus tard.</p>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
}
