/* =========================================================
   HORIZON RP — app.js
   Menu mobile + bouton "Se connecter avec Discord" (OAuth2)
   -----------------------------------------------------------
   Ce script redirige le visiteur vers Discord. Discord renvoie
   ensuite vers /dashboard avec un paramètre ?code=... dans
   l'URL. C'est dashboard/dashboard.js qui échange ce code
   contre un profil via le Worker Cloudflare, et qui détermine
   si l'utilisateur a le rôle staff.
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
  "&scope=" + encodeURIComponent("identify guilds.members.read");

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
