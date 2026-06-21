"""cogs/recrutement.py — Horizon RP : envoi automatique des candidatures staff

Sonde périodiquement la table `applications` de Supabase et poste chaque
nouvelle candidature (sent_to_discord = false) dans le salon de recrutement,
en Components V2 (container), puis marque la ligne comme envoyée.

Dépendances :
    - aiohttp (déjà utilisé par cv2_helpers.py)
    - discord.py avec discord.ext.tasks

Configuration attendue dans config.py (à côté de TOKEN) :
    SUPABASE_URL              = "https://yqiambmrntcqywsbumzq.supabase.co"
    SUPABASE_SERVICE_ROLE_KEY = "..."   # clé service_role, PAS la clé anon

Installation :
    1. Place ce fichier dans ton dossier cogs/
    2. Ajoute les deux constantes ci-dessus dans config.py
    3. Charge le cog au démarrage du bot :
         await bot.load_extension("cogs.recrutement")
"""

import aiohttp
import discord
from discord.ext import commands, tasks

from config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from utils.cv2_helpers import container, text, sep, _sanitize_components, _discord_headers, DISCORD_API, CV2_FLAG

RECRUITMENT_CHANNEL_ID = 1517959840691916902
POLL_INTERVAL_SECONDS = 30

# Libellés affichés pour chaque question, dans l'ordre du formulaire.
QUESTIONS = [
    ("q1", "Pseudo Discord et ID Discord"),
    ("q2", "Âge"),
    ("q3", "Ancienneté sur Horizon RP"),
    ("q4", "Heures de jeu sur le serveur"),
    ("q5", "Expérience staff sur un autre serveur"),
    ("q6", "Pourquoi rejoindre le staff d'Horizon RP"),
    ("q7", "Principales qualités"),
    ("q8", "Principaux défauts"),
    ("q9", "Réaction face à un joueur irrespectueux"),
    ("q10", "Si un ami enfreint le règlement"),
    ("q11", "Gestion d'un conflit entre deux joueurs"),
    ("q12", "Connaissance du règlement (1 à 10)"),
    ("q13", "Disponibilités dans la semaine"),
    ("q14", "Rôle principal d'un membre du staff"),
    ("q15", "Pourquoi te choisir plutôt qu'un autre"),
]


def _supabase_headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }


def _truncate(value: str, limit: int = 950) -> str:
    """CV2 limite le texte par bloc ; on tronque proprement les réponses trop longues."""
    value = (value or "").strip()
    if len(value) <= limit:
        return value
    return value[: limit - 1].rstrip() + "…"


async def _send_cv2_pure(channel_id: int, components: list) -> dict | None:
    """Envoie un message 100% Components V2, sans champ 'embeds'.
    (send_cv2_embed de cv2_helpers force un embed ; on ne veut pas
    en injecter un None invalide, donc on réplique l'appel HTTP ici.)"""
    url = f"{DISCORD_API}/channels/{channel_id}/messages"
    payload = {
        "flags": CV2_FLAG,
        "components": _sanitize_components(components),
        "allowed_mentions": {"parse": []},
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=_discord_headers(), json=payload) as resp:
            if resp.status in (200, 201):
                return await resp.json()
            body = await resp.text()
            print(f"[RECRUTEMENT] échec envoi Discord {resp.status} -> {body}")
            return None


class Recrutement(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.poll_applications.start()

    def cog_unload(self):
        self.poll_applications.cancel()

    @tasks.loop(seconds=POLL_INTERVAL_SECONDS)
    async def poll_applications(self):
        try:
            pending = await self._fetch_pending_applications()
        except Exception as exc:
            print(f"[RECRUTEMENT] erreur lors de la récupération des candidatures : {exc}")
            return

        for application in pending:
            try:
                await self._post_application(application)
                await self._mark_as_sent(application["id"])
            except Exception as exc:
                print(f"[RECRUTEMENT] erreur lors de l'envoi de la candidature "
                      f"{application.get('id')} : {exc}")

    @poll_applications.before_loop
    async def before_poll_applications(self):
        await self.bot.wait_until_ready()

    async def _fetch_pending_applications(self) -> list[dict]:
        url = (
            f"{SUPABASE_URL}/rest/v1/applications"
            "?sent_to_discord=eq.false&select=*&order=created_at.asc"
        )
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=_supabase_headers()) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    raise RuntimeError(f"Supabase GET {resp.status} -> {body}")
                return await resp.json()

    async def _mark_as_sent(self, application_id: str):
        url = f"{SUPABASE_URL}/rest/v1/applications?id=eq.{application_id}"
        async with aiohttp.ClientSession() as session:
            async with session.patch(
                url,
                headers={**_supabase_headers(), "Prefer": "return=minimal"},
                json={"sent_to_discord": True},
            ) as resp:
                if resp.status not in (200, 204):
                    body = await resp.text()
                    raise RuntimeError(f"Supabase PATCH {resp.status} -> {body}")

    async def _post_application(self, application: dict):
        answers: dict = application.get("answers", {})
        discord_username = application.get("discord_username", "Inconnu")
        discord_id = application.get("discord_id", "?")

        header = [
            text(f"## 📋 Candidature Staff — {discord_username}"),
            text(f"-# Discord ID : `{discord_id}`"),
            sep(),
        ]

        question_blocks = [
            text(f"**{label}**\n{_truncate(str(answers.get(key, '—')))}")
            for key, label in QUESTIONS
        ]

        # Un container CV2 est limité à ~4000 caractères cumulés : on
        # répartit les blocs sur plusieurs messages si besoin plutôt
        # que de risquer un envoi refusé par Discord.
        MAX_CHARS_PER_CONTAINER = 3800
        batches: list[list[dict]] = []
        current_batch: list[dict] = list(header)
        current_len = sum(len(b.get("content", "")) for b in header)

        for block in question_blocks:
            block_len = len(block.get("content", ""))
            if current_len + block_len > MAX_CHARS_PER_CONTAINER and current_batch:
                batches.append(current_batch)
                current_batch = []
                current_len = 0
            current_batch.append(block)
            current_len += block_len

        if current_batch:
            batches.append(current_batch)

        for batch in batches:
            components = [container(batch, accent_color=0xFF6A1A)]
            await _send_cv2_pure(RECRUITMENT_CHANNEL_ID, components)


async def setup(bot: commands.Bot):
    await bot.add_cog(Recrutement(bot))
