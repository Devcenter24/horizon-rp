/**
 * Horizon RP — Worker (auth Discord + actions staff/admin)
 * -----------------------------------------------------
 * Tourne sur Cloudflare Workers (gratuit).
 * Seule pièce qui connaît :
 *   - le client secret Discord
 *   - la clé service_role Supabase
 * Le site GitHub Pages ne fait que l'appeler en HTTPS.
 *
 * Pas de bot Discord nécessaire pour CE Worker : le statut staff/admin
 * est vérifié directement avec le token de l'utilisateur connecté
 * (scope "guilds.members.read"), au moment de la connexion. Ce statut
 * est ensuite mis en cache dans Supabase (table staff_status) pour
 * que les autres routes (sanction, duty, settings) puissent le
 * revérifier sans redemander un token à l'utilisateur.
 *
 * Un bot Discord séparé (sur ton VPS) lit la table `applications`
 * en sondage périodique pour poster les candidatures dans Discord —
 * voir le cog fourni (cogs/recrutement.py).
 *
 * Variables d'environnement à définir dans Cloudflare
 * (Settings > Variables and Secrets) :
 *   DISCORD_CLIENT_ID      = 1517820606656020641
 *   DISCORD_CLIENT_SECRET  = (le secret régénéré sur le portail Discord)
 *   DISCORD_GUILD_ID       = (l'ID de ton serveur Discord Horizon RP)
 *   DISCORD_STAFF_ROLE_ID  = 1517593004263866389
 *   DISCORD_ADMIN_ROLE_ID  = 1517868444203225108
 *   SUPABASE_URL            = https://yqiambmrntcqywsbumzq.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY = (clé service_role, PAS la clé anon)
 *
 * Routes :
 *   POST /auth         { code, redirect_uri }     -> profil + isStaff + isAdmin
 *   POST /report        { ...report, discordId }   -> insère un signalement
 *   POST /sanction      { ...sanction, discordId } -> insère une sanction (staff only)
 *   POST /duty          { discordId, action }      -> prise/fin de service (staff only)
 *   GET  /duty/list                                 -> staff actuellement en service
 *   GET  /logs                                      -> derniers signalements + sanctions
 *   POST /application   { discordId, answers }      -> soumet une candidature staff
 *   GET  /settings                                   -> paramètres publics (maintenance, recrutement, aperçu)
 *   POST /settings      { discordId, ...champs }    -> modifie les paramètres (admin only)
 */

const ALLOWED_ORIGIN = "https://devcenter24.github.io";
// Le statut staff/admin mis en cache expire après ce délai (ms) ; au-delà,
// les routes sensibles le considèrent invalide et refusent l'action
// (l'utilisateur doit se reconnecter pour rafraîchir son statut).
const STAFF_CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 heures

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      if (url.pathname === "/auth" && request.method === "POST") {
        return await handleAuth(request, env);
      }
      if (url.pathname === "/report" && request.method === "POST") {
        return await handleReport(request, env);
      }
      if (url.pathname === "/sanction" && request.method === "POST") {
        return await handleSanction(request, env);
      }
      if (url.pathname === "/duty" && request.method === "POST") {
        return await handleDuty(request, env);
      }
      if (url.pathname === "/duty/list" && request.method === "GET") {
        return await handleDutyList(env);
      }
      if (url.pathname === "/logs" && request.method === "GET") {
        return await handleLogs(env);
      }
      if (url.pathname === "/application" && request.method === "POST") {
        return await handleApplication(request, env);
      }
      if (url.pathname === "/settings" && request.method === "GET") {
        return await handleGetSettings(env);
      }
      if (url.pathname === "/settings" && request.method === "POST") {
        return await handleUpdateSettings(request, env);
      }
      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: "Internal error", detail: String(err) }, 500);
    }
  },
};

/* =========================================================
   /auth — échange le code OAuth, récupère le profil + statut staff/admin
   ========================================================= */
async function handleAuth(request, env) {
  const { code, redirect_uri } = await request.json();
  if (!code || !redirect_uri) return json({ error: "Missing code or redirect_uri" }, 400);

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri,
    }),
  });
  if (!tokenRes.ok) return json({ error: "Token exchange failed", detail: await tokenRes.text() }, 502);
  const tokenData = await tokenRes.json();

  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userRes.ok) return json({ error: "Failed to fetch user" }, 502);
  const user = await userRes.json();

  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${Number(user.discriminator || 0) % 5}.png`;

  // Vérifie les rôles staff/admin avec le token de l'utilisateur lui-même
  // (scope guilds.members.read demandé lors de la connexion).
  const roles = await fetchUserGuildRoles(tokenData.access_token, env);
  const isStaff = roles.includes(env.DISCORD_STAFF_ROLE_ID);
  const isAdmin = roles.includes(env.DISCORD_ADMIN_ROLE_ID);

  // Met en cache ce statut dans Supabase pour que /sanction, /duty et
  // /settings puissent le revérifier plus tard sans redemander un token.
  await cacheStaffStatus(env, user.id, isStaff, isAdmin);

  return json({
    id: user.id,
    username: user.global_name || user.username,
    avatarUrl,
    isStaff,
    isAdmin,
  });
}

/* Récupère les rôles de l'utilisateur sur la guilde via son propre token. */
async function fetchUserGuildRoles(accessToken, env) {
  const res = await fetch(
    `https://discord.com/api/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return []; // pas membre du serveur, ou scope manquant
  const member = await res.json();
  return Array.isArray(member.roles) ? member.roles : [];
}

/* Stocke le statut staff/admin (avec horodatage) dans Supabase. */
async function cacheStaffStatus(env, discordId, isStaff, isAdmin) {
  await supabaseUpsert(env, "staff_status", {
    discord_id: discordId,
    is_staff: isStaff,
    is_admin: isAdmin,
    checked_at: new Date().toISOString(),
  });
}

/* Relit le statut en cache et vérifie qu'il n'est pas expiré.
   level vaut "staff" ou "admin". */
async function hasRoleCached(env, discordId, level) {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/staff_status?discord_id=eq.${discordId}&select=*`,
    { headers: supabaseHeaders(env) }
  );
  if (!res.ok) return false;
  const rows = await res.json();
  if (!rows.length) return false;

  const row = rows[0];
  const checkedAt = new Date(row.checked_at).getTime();
  const isFresh = Date.now() - checkedAt < STAFF_CACHE_TTL_MS;
  if (!isFresh) return false;

  return level === "admin" ? Boolean(row.is_admin) : Boolean(row.is_staff);
}

/* =========================================================
   /report — signalement d'un joueur (tout utilisateur connecté)
   ========================================================= */
async function handleReport(request, env) {
  const body = await request.json();
  const { discordId, username, robloxUsername, robloxId, proofUrl, reason } = body;

  if (!discordId || !robloxUsername || !robloxId || !proofUrl || !reason) {
    return json({ error: "Missing fields" }, 400);
  }

  const { error } = await supabaseInsert(env, "reports", {
    roblox_username: robloxUsername,
    roblox_id: robloxId,
    proof_url: proofUrl,
    reason,
    reported_by_discord_id: discordId,
    reported_by_username: username,
  });

  if (error) return json({ error }, 500);
  return json({ success: true });
}

/* =========================================================
   /sanction — bannir / kick / warn (staff uniquement)
   ========================================================= */
async function handleSanction(request, env) {
  const body = await request.json();
  const { discordId, username, type, robloxUsername, robloxId, duration, reason } = body;

  if (!discordId || !type || !robloxUsername || !robloxId || !duration || !reason) {
    return json({ error: "Missing fields" }, 400);
  }
  if (!["ban", "kick", "warn"].includes(type)) {
    return json({ error: "Invalid sanction type" }, 400);
  }

  const isStaff = await hasRoleCached(env, discordId, "staff");
  if (!isStaff) return json({ error: "Forbidden — staff role required (reconnectez-vous)" }, 403);

  const { error } = await supabaseInsert(env, "sanctions", {
    type,
    roblox_username: robloxUsername,
    roblox_id: robloxId,
    duration,
    reason,
    staff_discord_id: discordId,
    staff_username: username,
  });

  if (error) return json({ error }, 500);
  return json({ success: true });
}

/* =========================================================
   /duty — prise ou fin de service (staff uniquement)
   ========================================================= */
async function handleDuty(request, env) {
  const body = await request.json();
  const { discordId, username, avatarUrl, action } = body;

  if (!discordId || !action) return json({ error: "Missing fields" }, 400);
  if (!["start", "end"].includes(action)) return json({ error: "Invalid action" }, 400);

  const isStaff = await hasRoleCached(env, discordId, "staff");
  if (!isStaff) return json({ error: "Forbidden — staff role required (reconnectez-vous)" }, 403);

  if (action === "start") {
    const { error } = await supabaseUpsert(env, "staff_duty", {
      discord_id: discordId,
      username,
      avatar_url: avatarUrl,
      started_at: new Date().toISOString(),
    });
    if (error) return json({ error }, 500);
  } else {
    const { error } = await supabaseDelete(env, "staff_duty", discordId);
    if (error) return json({ error }, 500);
  }

  return json({ success: true });
}

/* =========================================================
   /duty/list — qui est en service actuellement
   ========================================================= */
async function handleDutyList(env) {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/staff_duty?select=*&order=started_at.desc`,
    { headers: supabaseHeaders(env) }
  );
  const data = await res.json();
  return json({ duty: data });
}

/* =========================================================
   /logs — derniers signalements + sanctions (lecture)
   ========================================================= */
async function handleLogs(env) {
  const [reportsRes, sanctionsRes] = await Promise.all([
    fetch(`${env.SUPABASE_URL}/rest/v1/reports?select=*&order=created_at.desc&limit=30`, {
      headers: supabaseHeaders(env),
    }),
    fetch(`${env.SUPABASE_URL}/rest/v1/sanctions?select=*&order=created_at.desc&limit=30`, {
      headers: supabaseHeaders(env),
    }),
  ]);
  const reports = await reportsRes.json();
  const sanctions = await sanctionsRes.json();
  return json({ reports, sanctions });
}

/* =========================================================
   /application — soumission d'une candidature staff
   ========================================================= */
async function handleApplication(request, env) {
  const body = await request.json();
  const { discordId, username, answers } = body;

  if (!discordId || !username || !answers || typeof answers !== "object") {
    return json({ error: "Missing fields" }, 400);
  }

  // On attend exactement 15 réponses (une par question du formulaire).
  const answerCount = Object.keys(answers).length;
  if (answerCount !== 15) {
    return json({ error: "Expected 15 answers, got " + answerCount }, 400);
  }

  const { error } = await supabaseInsert(env, "applications", {
    discord_id: discordId,
    discord_username: username,
    answers,
    sent_to_discord: false,
  });

  if (error) return json({ error }, 500);
  return json({ success: true });
}

/* =========================================================
   /settings (GET) — paramètres publics du site
   ========================================================= */
async function handleGetSettings(env) {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/settings?id=eq.1&select=*`,
    { headers: supabaseHeaders(env) }
  );
  if (!res.ok) return json({ error: "Failed to fetch settings" }, 500);
  const rows = await res.json();
  if (!rows.length) return json({ error: "Settings not found" }, 404);

  const s = rows[0];

  // Compatibilité : si preview_items n'existe pas encore (ancienne ligne),
  // on reconstruit depuis les 4 anciens champs séparés.
  let previewItems = Array.isArray(s.preview_items) ? s.preview_items : null;
  if (!previewItems || previewItems.length === 0) {
    previewItems = [
      { icon: "game", label: "Jeu support", value: s.preview_game || "Emergency Hamburg" },
      { icon: "roles", label: "Métiers jouables", value: s.preview_roles_count || "8 rôles" },
      { icon: "language", label: "Langue", value: s.preview_language || "Francophone" },
      { icon: "clock", label: "Disponibilité", value: s.preview_availability || "24/7" },
    ];
  }

  return json({
    recrutementOuvert: s.recrutement_ouvert,
    maintenance: s.maintenance,
    previewItems,
  });
}

/* =========================================================
   /settings (POST) — modification des paramètres (admin only)
   ========================================================= */
async function handleUpdateSettings(request, env) {
  const body = await request.json();
  const { discordId, recrutementOuvert, maintenance, previewItems } = body;

  if (!discordId) return json({ error: "Missing discordId" }, 400);

  const isAdmin = await hasRoleCached(env, discordId, "admin");
  if (!isAdmin) return json({ error: "Forbidden — admin role required (reconnectez-vous)" }, 403);

  const update = { id: 1, updated_at: new Date().toISOString() };
  if (typeof recrutementOuvert === "boolean") update.recrutement_ouvert = recrutementOuvert;
  if (typeof maintenance === "boolean") update.maintenance = maintenance;
  if (Array.isArray(previewItems)) {
    // Validation minimale : chaque ligne doit avoir un label et une valeur.
    const cleaned = previewItems
      .filter((item) => item && typeof item === "object" && item.label && item.value)
      .map((item) => ({
        icon: typeof item.icon === "string" ? item.icon : "game",
        label: String(item.label).slice(0, 60),
        value: String(item.value).slice(0, 60),
      }))
      .slice(0, 12); // évite une carte démesurée
    update.preview_items = cleaned;
  }

  const { error } = await supabaseUpsert(env, "settings", update);
  if (error) return json({ error }, 500);
  return json({ success: true });
}

/* =========================================================
   Helpers Supabase (REST API avec clé service_role)
   ========================================================= */
function supabaseHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function supabaseInsert(env, table, row) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...supabaseHeaders(env), Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  if (!res.ok) return { error: await res.text() };
  return { error: null };
}

async function supabaseUpsert(env, table, row) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...supabaseHeaders(env), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
  if (!res.ok) return { error: await res.text() };
  return { error: null };
}

async function supabaseDelete(env, table, discordId) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?discord_id=eq.${discordId}`, {
    method: "DELETE",
    headers: supabaseHeaders(env),
  });
  if (!res.ok) return { error: await res.text() };
  return { error: null };
}

/* =========================================================
   CORS / JSON helpers
   ========================================================= */
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
