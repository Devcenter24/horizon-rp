# Horizon RP — Guide d'installation

## ⚠️ Étape 0 — Sécurité (rappel)

Le client secret Discord et la clé Supabase `service_role` ne doivent jamais être codés en dur dans un fichier du dépôt GitHub. Ils ne vivent que dans les variables d'environnement du Worker Cloudflare (étape 3).

---

## Étape 1 — Base de données Supabase

1. Va sur https://supabase.com/dashboard, ouvre ton projet (`yqiambmrntcqywsbumzq`)
2. Ouvre **SQL Editor → New query**
3. Colle le contenu de `supabase-schema.sql` (fourni) et clique **Run**

Cela crée 4 tables : `reports` (signalements), `sanctions` (ban/kick/warn), `staff_duty` (qui est en service), `staff_status` (cache interne du statut staff, non lisible publiquement).

**Récupère ta clé `service_role`** (différente de la clé `anon` que tu utilises côté site) :
**Project Settings → API → service_role key** (clique "Reveal"). C'est une clé puissante : elle ne doit servir que dans le Worker, jamais dans le site.

---

## Étape 2 — Récupérer l'ID de ton serveur Discord

1. Dans Discord, active le mode développeur si besoin : **Réglages → Avancés → Mode développeur**
2. Clic droit sur le nom de ton serveur Horizon RP → **Copier l'identifiant du serveur**
3. C'est ta valeur `DISCORD_GUILD_ID`

Pas besoin de créer de bot : la vérification du rôle staff se fait directement avec le compte Discord de la personne qui se connecte.

---

## Étape 3 — Worker Cloudflare

1. Crée un compte gratuit sur https://dash.cloudflare.com/sign-up si pas déjà fait
2. **Workers & Pages → Create → Create Worker**, nomme-le `horizon-rp-auth`
3. **Edit code**, remplace tout par le contenu de `cloudflare-worker.js` (fourni), puis **Deploy**
4. **Settings → Variables and Secrets**, ajoute (coche "Encrypt" pour les secrets) :

| Variable | Valeur |
|---|---|
| `DISCORD_CLIENT_ID` | `1517820606656020641` |
| `DISCORD_CLIENT_SECRET` | ton secret Discord régénéré |
| `DISCORD_GUILD_ID` | l'ID de ton serveur Horizon RP (étape 2) |
| `DISCORD_STAFF_ROLE_ID` | `1517593004263866389` |
| `SUPABASE_URL` | `https://yqiambmrntcqywsbumzq.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | la clé `service_role` (étape 1) |

5. Note l'URL de ton Worker, ex : `https://horizon-rp-auth.tonpseudo.workers.dev`

---

## Étape 4 — Brancher le site sur le Worker

Dans `dashboard/dashboard.js`, remplace :

```js
const WORKER_URL = "https://horizon-rp-auth.TON-SOUS-DOMAINE.workers.dev";
```

par l'URL réelle de ton Worker (sans slash à la fin). Republie ce fichier sur GitHub.

---

## Étape 5 — Vérifier l'URI de redirection Discord

Dans **OAuth2 → Redirects** de ton application Discord, l'URI doit être exactement :
```
https://devcenter24.github.io/horizon-rp/dashboard
```

---

## Comment ça fonctionne

```
Visiteur clique "Se connecter"
        │
        ▼
Discord (autorise l'app avec les scopes identify + guilds.members.read)
        │
        ▼
Redirige vers /dashboard?code=XXXX
        │
        ▼
dashboard.js envoie le code au Worker (/auth)
        │
        ▼
Le Worker échange le code (avec le secret, caché),
récupère le profil Discord, PUIS utilise le token
de l'utilisateur lui-même pour lire ses rôles sur
ton serveur et vérifier s'il a le rôle staff.
Ce statut est mis en cache dans Supabase (staff_status).
        │
        ▼
Le dashboard affiche :
  - Tout le monde connecté : Signaler un joueur / Staff en service
  - Si staff : + Panneau staff (ban/kick/warn + prise de service)
```

Pour les actions sensibles (sanction, prise de service), le Worker
relit le statut staff mis en cache (valable 6h) avant d'écrire dans
Supabase avec la clé `service_role`. Un visiteur ne peut donc pas
falsifier son statut staff en modifiant le JavaScript du navigateur :
le seul moyen d'apparaître "staff" est d'avoir réellement ce rôle
sur Discord au moment de la connexion.

Si quelqu'un perd le rôle staff sur Discord après s'être connecté,
l'accès aux actions sensibles expire automatiquement après 6h (ou
dès qu'il se reconnecte, le statut est revérifié immédiatement).

---

## Important — Ce que ce système fait et ne fait pas

- **Bannir / kick / warn dans le dashboard = un enregistrement dans les logs.**
  Cela ne bannit/exclut personne automatiquement de Roblox ni de Discord.
  L'action réelle (kick Roblox, ban Discord) reste à faire manuellement
  par le staff ; le dashboard sert de registre centralisé et consultable.
- Aucun bot Discord n'est nécessaire pour ce système.
