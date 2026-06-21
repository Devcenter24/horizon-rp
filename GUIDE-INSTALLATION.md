# Horizon RP — Guide d'installation

## ⚠️ Étape 0 — Sécurité (rappel)

Le client secret Discord et la clé Supabase `service_role` ne doivent jamais être codés en dur dans un fichier du dépôt GitHub. Ils ne vivent que dans les variables d'environnement du Worker Cloudflare (étape 3) et dans `config.py` sur ton VPS (étape 5) — jamais sur GitHub.

---

## Étape 1 — Base de données Supabase

1. Va sur https://supabase.com/dashboard, ouvre ton projet (`yqiambmrntcqywsbumzq`)
2. Ouvre **SQL Editor → New query**
3. Colle le contenu de `supabase-schema.sql` (fourni) et clique **Run**

Cela crée 6 tables :
- `reports` (signalements de joueurs)
- `sanctions` (ban/kick/warn)
- `staff_duty` (qui est en service)
- `staff_status` (cache interne du statut staff/admin, non lisible publiquement)
- `applications` (candidatures staff, lues par le cog Discord)
- `settings` (une seule ligne : recrutement ouvert/fermé, maintenance, contenu de la carte aperçu)

**Récupère ta clé `service_role`** (différente de la clé `anon` que tu utilises côté site) :
**Project Settings → API → service_role key** (clique "Reveal"). Cette clé sert dans le Worker **et** dans le cog Python — ne la mets jamais ailleurs.

⚠️ Si tu avais déjà exécuté une version précédente du script et obtiens une
erreur du type `policy already exists`, supprime d'abord les anciennes
policies avant de relancer :
```sql
drop policy if exists "reports_select_public" on reports;
drop policy if exists "sanctions_select_public" on sanctions;
drop policy if exists "staff_duty_select_public" on staff_duty;
drop policy if exists "settings_select_public" on settings;
```
Le script ajoute aussi automatiquement la colonne `preview_items` (lignes
dynamiques de la carte aperçu) à une table `settings` existante, sans rien
casser de tes réglages actuels.

---

## Étape 2 — Récupérer les ID Discord nécessaires

1. Active le mode développeur si besoin : **Réglages Discord → Avancés → Mode développeur**
2. Clic droit sur le nom de ton serveur Horizon RP → **Copier l'identifiant du serveur** → c'est `DISCORD_GUILD_ID`

Tu as déjà les autres ID :
- `DISCORD_STAFF_ROLE_ID` = `1517593004263866389`
- `DISCORD_ADMIN_ROLE_ID` = `1517868444203225108`
- Salon recrutement = `1517959840691916902`

Pas besoin de créer de bot supplémentaire pour le site : la vérification des rôles se fait directement avec le compte Discord de la personne qui se connecte.

---

## Étape 3 — Worker Cloudflare

1. Si pas déjà fait, crée un compte gratuit sur https://dash.cloudflare.com/sign-up
2. **Workers & Pages → Create → Create Worker**, nomme-le par exemple `horizon-rp-auth`
3. **Edit code**, remplace tout par le contenu de `cloudflare-worker.js` (fourni), puis **Deploy**
4. **Settings → Variables and Secrets**, ajoute (coche "Encrypt" pour les secrets) :

| Variable | Valeur |
|---|---|
| `DISCORD_CLIENT_ID` | `1517820606656020641` |
| `DISCORD_CLIENT_SECRET` | ton secret Discord régénéré |
| `DISCORD_GUILD_ID` | l'ID de ton serveur Horizon RP (étape 2) |
| `DISCORD_STAFF_ROLE_ID` | `1517593004263866389` |
| `DISCORD_ADMIN_ROLE_ID` | `1517868444203225108` |
| `SUPABASE_URL` | `https://yqiambmrntcqywsbumzq.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | la clé `service_role` (étape 1) |

5. Note l'URL de ton Worker, ex : `https://horizon-rp-auth.tonpseudo.workers.dev`

---

## Étape 4 — Brancher le site sur le Worker

Trois fichiers à mettre à jour avec l'URL réelle de ton Worker :

**`dashboard/dashboard.js`** (ligne 8) :
```js
const WORKER_URL = "https://horizon-rp-auth.tonpseudo.workers.dev";
```

**`recrutement/recrutement.js`** (ligne 5) :
```js
const WORKER_URL = "https://horizon-rp-auth.tonpseudo.workers.dev";
```

**`settings.js`** (à l'intérieur de la fonction) — même URL également.

Republie ces 3 fichiers sur GitHub.

---

## Étape 5 — Cog Discord (candidatures staff)

Le cog `cogs/horizonrp.py` (fourni) tourne sur ton VPS, à côté de ton bot existant.

1. Copie `cogs/horizonrp.py` dans le dossier `cogs/` de ton bot
2. Dans ton `config.py`, ajoute ces deux lignes (à côté de `TOKEN`) :
   ```python
   SUPABASE_URL = "https://yqiambmrntcqywsbumzq.supabase.co"
   SUPABASE_SERVICE_ROLE_KEY = "..."  # la même clé service_role qu'à l'étape 1
   ```
3. Charge le cog au démarrage du bot. **Si ton bot charge déjà automatiquement
   tous les fichiers du dossier `cogs/` (boucle au démarrage), ne fais rien
   de plus — le cog sera détecté tout seul.** Sinon, ajoute une ligne explicite
   là où tu charges tes autres extensions :
   ```python
   await bot.load_extension("cogs.horizonrp")
   ```
   ⚠️ Ne fais pas les deux à la fois (chargement automatique + ligne explicite),
   sinon le bot tentera de charger le cog deux fois et plantera avec une erreur
   `Cog named 'Recrutement' already loaded`.
4. Redémarre ton bot

Le cog vérifie Supabase toutes les 30 secondes et poste automatiquement chaque nouvelle candidature dans le salon `1517959840691916902`, en Components V2 (container avec toutes les réponses), puis la marque comme envoyée pour ne jamais la reposter.

Si une candidature contient des réponses très longues, le cog la répartit automatiquement sur plusieurs messages pour respecter les limites de Discord — pas d'action de ta part nécessaire.

---

## Étape 6 — Vérifier l'URI de redirection Discord

Dans **OAuth2 → Redirects** de ton application Discord, l'URI doit être exactement :
```
https://horizons-rp.netlify.app/dashboard
```

---

## Structure finale du dépôt GitHub

```
horizon-rp/
├── index.html
├── 404.html
├── style.css
├── app.js
├── settings.js
├── dashboard/
│   ├── index.html
│   └── dashboard.js
└── recrutement/
    ├── index.html
    └── recrutement.js
```

Les fichiers suivants ne vont PAS sur GitHub (ils tournent ailleurs) :
- `cloudflare-worker.js` -> Cloudflare Workers
- `supabase-schema.sql` -> exécuté une fois dans Supabase, à ne pas reposter
- `cogs/horizonrp.py` + `utils/cv2_helpers.py` -> ton VPS, à côté de ton bot

---

## Comment ça fonctionne, vue d'ensemble

```
                     +----------------------+
                     |   Netlify       |
                     |  (site statique)     |
                     +----------+-----------+
                                | HTTPS
                                v
                     +----------------------+
                     |  Worker Cloudflare   |
                     |  - echange OAuth     |
                     |  - verifie roles     |
                     |  - lit/ecrit Supabase|
                     +----------+-----------+
                                | REST API (service_role)
                                v
                     +----------------------+
                     |      Supabase         |
                     |  reports, sanctions,  |
                     |  staff_duty,          |
                     |  staff_status,        |
                     |  applications,        |
                     |  settings             |
                     +----------+-----------+
                                | sondage 30s
                                v
                     +----------------------+
                     |   Bot Discord (VPS)  |
                     |  cogs/horizonrp.py |
                     |  poste les nouvelles |
                     |  candidatures en CV2 |
                     +----------------------+
```

### Connexion et rôles

À la connexion, le Worker vérifie via le token Discord de la personne si elle a le rôle staff (`1517593004263866389`) et/ou admin (`1517868444203225108`), et met ce statut en cache dans Supabase (`staff_status`, valable 6h). Les actions sensibles (sanction, prise de service, modification des paramètres) revérifient ce cache avant d'écrire.

### Dashboard — accès par rôle

- **Tout le monde connecté** : Signaler un joueur / Staff en service
- **+ Rôle staff** : Panneau staff (ban/kick/warn + prise de service)
- **+ Rôle admin** : Paramètres (recrutement ouvert/fermé, maintenance, contenu de la carte aperçu)

### Mode maintenance

Quand l'admin active la maintenance depuis le dashboard, un écran plein bloque l'accès sur `index.html`, `404.html` et `recrutement/`. **Le dashboard reste volontairement accessible**, sinon l'admin se bloquerait lui-même hors du seul endroit permettant de désactiver la maintenance.

### Candidatures

Le formulaire `/recrutement/` exige d'être connecté. Les 15 réponses sont envoyées au Worker (`/application`), stockées dans Supabase, puis le cog Discord (sondage 30s) les détecte et les poste dans le salon `1517959840691916902`.

---

## Important — Ce que ce système fait et ne fait pas

- **Bannir / kick / warn dans le dashboard = un enregistrement dans les logs.**
  Cela ne bannit/exclut personne automatiquement de Roblox ni de Discord.
  L'action réelle reste à faire manuellement par le staff ; le dashboard
  sert de registre centralisé et consultable.
- Aucun bot Discord n'est nécessaire pour la partie connexion/vérification
  de rôles (ça passe par le Worker). Un bot existant est en revanche
  nécessaire pour poster les candidatures (cog fourni).
