/* =========================================================
   HORIZON RP — app.js
   Menu mobile + bouton "Se connecter avec Discord" (OAuth2)
   -----------------------------------------------------------
   Aucun backend requis : ce script redirige simplement le
   visiteur vers Discord, puis Discord renvoie vers /dashboard
   avec un paramètre ?code=... dans l'URL. dashboard.html lit
   ce paramètre pour afficher "Connexion réussie".
   ========================================================= */

/* ---------- Config OAuth2 Discord ---------- */
const DISCORD_CLIENT_ID = "1517820606656020641";
const REDIRECT_URI = "https://devcenter24.github.io/horizon-rp/dashboard";
const DISCORD_INVITE = "https://discord.gg/q8EvGRN9yf";

const DISCORD_OAUTH_URL =
  "https://discord.com/api/oauth2/authorize" +
  "?client_id=" + DISCORD_CLIENT_ID +
  "&redirect_uri=" + encodeURIComponent(REDIRECT_URI) +
  "&response_type=code" +
  "&scope=identify";

/* ---------- Menu burger (mobile) ---------- */
function initBurgerMenu() {
  const burger = document.querySelector("[data-burger]");
  const mobileNav = document.querySelector("[data-mobile-nav]");
  if (!burger || !mobileNav) return;

  burger.addEventListener("click", () => {
    const isOpen = mobileNav.classList.toggle("is-open");
    burger.classList.toggle("is-open", isOpen);
    burger.setAttribute("aria-expanded", String(isOpen));
    document.body.style.overflow = isOpen ? "hidden" : "";
  });

  mobileNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      mobileNav.classList.remove("is-open");
      burger.classList.remove("is-open");
      burger.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    });
  });
}

/* ---------- Boutons "Se connecter avec Discord" + invitations ---------- */
function initDiscordButtons() {
  document.querySelectorAll("[data-discord-login]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = DISCORD_OAUTH_URL;
    });
  });

  document.querySelectorAll("[data-discord-invite]").forEach((btn) => {
    btn.setAttribute("href", DISCORD_INVITE);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initBurgerMenu();
  initDiscordButtons();
});
