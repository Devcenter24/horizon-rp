/* =========================================================
   HORIZON RP — settings.js
   Applique les paramètres globaux sur les pages publiques :
   - Mode maintenance (bloque l'accès au site)
   - Mise à jour de la carte "Horizon RP — Aperçu"
   Inclus sur index.html. Inoffensif si les éléments data-*
   correspondants sont absents de la page.
   ========================================================= */

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

  if (settings.preview) {
    const map = {
      "[data-preview-game]": settings.preview.game,
      "[data-preview-roles]": settings.preview.rolesCount,
      "[data-preview-language]": settings.preview.language,
      "[data-preview-availability]": settings.preview.availability,
    };
    Object.entries(map).forEach(([selector, value]) => {
      if (!value) return;
      const el = document.querySelector(selector);
      if (el) el.textContent = value;
    });
  }
})();

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
