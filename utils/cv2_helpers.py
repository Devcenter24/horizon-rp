"""utils/cv2_helpers.py — Discord Components v2 helpers"""

import asyncio
import io
import json
import re
import datetime
import aiohttp
import discord
from config import TOKEN

DISCORD_API = "https://discord.com/api/v10"
CV2_FLAG    = 32768
EPHEMERAL   = 64

# ─── Emoji helpers ────────────────────────────────────────────────────────────

# Supprime tous les variation selectors Unicode (U+FE00–U+FE0F)
_VS_TRANS = str.maketrans("", "", "".join(chr(c) for c in range(0xFE00, 0xFE10)))


def _clean_emoji_name(s: str) -> str:
    return s.translate(_VS_TRANS).strip()


# Codepoints transparents dans une séquence emoji (ignorés lors de la validation)
_EMOJI_TRANSPARENT = frozenset(range(0xFE00, 0xFE10)) | {
    0xFE0F,   # variation selector-16 (emoji presentation)
    0x200D,   # zero width joiner
    0x20E3,   # combining enclosing keycap
}

# Plages de codepoints Unicode officiellement reconnues comme emoji par Discord.
# Filtre positif : seuls ces codepoints sont acceptés comme caractères "de base" d'un emoji.
# Source : Unicode 15 Emoji Data (https://unicode.org/reports/tr51/#emoji_data)
# NB : les caractères keycap (0-9, #, *) sont gérés séparément car ils nécessitent U+20E3.
_EMOJI_CP_RANGES: tuple[tuple[int, int], ...] = (
    (0x00A9, 0x00A9), (0x00AE, 0x00AE),
    (0x203C, 0x203C), (0x2049, 0x2049), (0x2122, 0x2122), (0x2139, 0x2139),
    (0x2194, 0x2199), (0x21A9, 0x21AA),
    (0x231A, 0x231B), (0x2328, 0x2328),
    (0x23CF, 0x23CF), (0x23E9, 0x23F3), (0x23F8, 0x23FA),
    (0x24C2, 0x24C2),
    (0x25AA, 0x25AB), (0x25B6, 0x25B6), (0x25C0, 0x25C0), (0x25FB, 0x25FE),
    (0x2600, 0x2604), (0x260E, 0x260E), (0x2611, 0x2611), (0x2614, 0x2615),
    (0x2618, 0x2618), (0x261D, 0x261D), (0x2620, 0x2620), (0x2622, 0x2623),
    (0x2626, 0x2626), (0x262A, 0x262A), (0x262E, 0x262F), (0x2638, 0x263A),
    (0x2640, 0x2640), (0x2642, 0x2642), (0x2648, 0x2653), (0x265F, 0x2660),
    (0x2663, 0x2663), (0x2665, 0x2666), (0x2668, 0x2668), (0x267B, 0x267B),
    (0x267E, 0x267F), (0x2692, 0x2697), (0x2699, 0x2699), (0x269B, 0x269C),
    (0x26A0, 0x26A1), (0x26A7, 0x26A7), (0x26AA, 0x26AB), (0x26B0, 0x26B1),
    (0x26BD, 0x26BE), (0x26C4, 0x26C5), (0x26CE, 0x26CF), (0x26D1, 0x26D1),
    (0x26D3, 0x26D4), (0x26E9, 0x26EA), (0x26F0, 0x26F5), (0x26F7, 0x26FA),
    (0x26FD, 0x26FD),
    (0x2702, 0x2702), (0x2705, 0x2705), (0x2708, 0x270D), (0x270F, 0x270F),
    (0x2712, 0x2712), (0x2714, 0x2714), (0x2716, 0x2716), (0x271D, 0x271D),
    (0x2721, 0x2721), (0x2728, 0x2728), (0x2733, 0x2734), (0x2744, 0x2744),
    (0x2747, 0x2747), (0x274C, 0x274C), (0x274E, 0x274E), (0x2753, 0x2755),
    (0x2757, 0x2757), (0x2763, 0x2764), (0x2795, 0x2797), (0x27A1, 0x27A1),
    (0x27B0, 0x27B0), (0x27BF, 0x27BF),
    (0x2934, 0x2935), (0x2B05, 0x2B07), (0x2B1B, 0x2B1C), (0x2B50, 0x2B50),
    (0x2B55, 0x2B55),
    (0x3030, 0x3030), (0x303D, 0x303D), (0x3297, 0x3297), (0x3299, 0x3299),
    # Indicateurs régionaux (drapeaux 🇫🇷 etc.)
    (0x1F1E0, 0x1F1FF),
    # Blocs emoji principaux
    (0x1F004, 0x1F004), (0x1F0CF, 0x1F0CF),
    (0x1F170, 0x1F171), (0x1F17E, 0x1F17F), (0x1F18E, 0x1F18E),
    (0x1F191, 0x1F19A), (0x1F201, 0x1F202), (0x1F21A, 0x1F21A),
    (0x1F22F, 0x1F22F), (0x1F232, 0x1F23A), (0x1F250, 0x1F251),
    (0x1F300, 0x1F321), (0x1F324, 0x1F393), (0x1F396, 0x1F397),
    (0x1F399, 0x1F39B), (0x1F39E, 0x1F3F0), (0x1F3F3, 0x1F3F5),
    (0x1F3F7, 0x1F4FD), (0x1F4FF, 0x1F53D), (0x1F549, 0x1F54E),
    (0x1F550, 0x1F567), (0x1F56F, 0x1F570), (0x1F573, 0x1F57A),
    (0x1F587, 0x1F587), (0x1F58A, 0x1F58D), (0x1F590, 0x1F590),
    (0x1F595, 0x1F596), (0x1F5A4, 0x1F5A5), (0x1F5A8, 0x1F5A8),
    (0x1F5B1, 0x1F5B2), (0x1F5BC, 0x1F5BC), (0x1F5C2, 0x1F5C4),
    (0x1F5D1, 0x1F5D3), (0x1F5DC, 0x1F5DE), (0x1F5E1, 0x1F5E1),
    (0x1F5E3, 0x1F5E3), (0x1F5E8, 0x1F5E8), (0x1F5EF, 0x1F5EF),
    (0x1F5F3, 0x1F5F3), (0x1F5FA, 0x1F64F), (0x1F680, 0x1F6C5),
    (0x1F6CB, 0x1F6D2), (0x1F6D5, 0x1F6D7), (0x1F6DC, 0x1F6E5),
    (0x1F6E9, 0x1F6E9), (0x1F6EB, 0x1F6EC), (0x1F6F0, 0x1F6F0),
    (0x1F6F3, 0x1F6FC), (0x1F7E0, 0x1F7EB), (0x1F7F0, 0x1F7F0),
    (0x1F90C, 0x1F93A), (0x1F93C, 0x1F945), (0x1F947, 0x1F9FF),
    (0x1FA00, 0x1FA53), (0x1FA60, 0x1FA6D), (0x1FA70, 0x1FA7C),
    (0x1FA80, 0x1FA88), (0x1FA90, 0x1FABD), (0x1FABF, 0x1FAC5),
    (0x1FACE, 0x1FADB), (0x1FAE0, 0x1FAE8), (0x1FAF0, 0x1FAF8),
)

# Ensemble de codepoints keycap (base) — valides uniquement en présence de U+20E3
_KEYCAP_BASE = frozenset(b"0123456789#*")


def _cp_is_emoji(cp: int) -> bool:
    """Retourne True si cp est un codepoint de base d'emoji Unicode (hors keycap)."""
    for lo, hi in _EMOJI_CP_RANGES:
        if cp < lo:
            break
        if cp <= hi:
            return True
    return False


def _is_valid_unicode_emoji(s: str) -> bool:
    """Vérifie que s est un emoji Unicode valide pour Discord.
    Utilise un filtre positif basé sur les plages Unicode officielles.
    Aucune dépendance externe requise."""
    if not s:
        return False
    # Retire les codepoints "transparents" (variation selectors, ZWJ, keycap combiner)
    chars = [c for c in s if ord(c) not in _EMOJI_TRANSPARENT]
    if not chars:
        return False
    has_keycap_combiner = 0x20E3 in {ord(c) for c in s}
    for c in chars:
        cp = ord(c)
        # Keycap sequences : 0-9, #, * uniquement si suivi de U+20E3
        if cp in _KEYCAP_BASE:
            if has_keycap_combiner:
                continue
            return False
        # Vérification positive : le codepoint doit appartenir aux plages emoji connues
        if not _cp_is_emoji(cp):
            print(f"[EMOJI REJECT] codepoint non-emoji : U+{cp:04X} ({repr(c)}) dans {repr(s)}")
            return False
    return True


def _parse_emoji(emoji: str | None) -> dict | None:
    if not emoji:
        return None
    emoji = emoji.strip()
    # Emoji custom Discord : <:name:id> ou <a:name:id>
    m = re.match(r"<(a?):(\w+):(\d+)>", emoji)
    if m:
        animated, name, eid = m.groups()
        d = {"name": name, "id": str(eid)}
        if animated:
            d["animated"] = True
        return d
    # Emoji Unicode : valider via la lib emoji (spec Unicode officielle)
    cleaned = _clean_emoji_name(emoji)
    candidate = cleaned or emoji
    if not _is_valid_unicode_emoji(candidate):
        print(f"[EMOJI SKIP] invalide : {repr(emoji)} -> {repr(candidate)}")
        return None
    return {"name": candidate}


def _sanitize_components(components: list) -> list:
    """Nettoie récursivement tous les emojis invalides dans un payload CV2."""
    result = []
    for comp in components:
        if not isinstance(comp, dict):
            result.append(comp)
            continue
        comp = dict(comp)

        # Emoji direct sur le composant (bouton, etc.)
        if "emoji" in comp:
            e = comp["emoji"]
            if isinstance(e, dict) and "id" not in e:
                name = _clean_emoji_name(e.get("name", ""))
                if not name or not _is_valid_unicode_emoji(name):
                    print(f"[EMOJI SANITIZE] bouton invalide supprime : {repr(e)}")
                    del comp["emoji"]
                else:
                    comp["emoji"] = {"name": name}

        # Options d'un select_menu
        if "options" in comp:
            clean_opts = []
            for opt in comp["options"]:
                opt = dict(opt)
                if "emoji" in opt:
                    e = opt["emoji"]
                    if isinstance(e, dict) and "id" not in e:
                        name = _clean_emoji_name(e.get("name", ""))
                        if not name or not _is_valid_unicode_emoji(name):
                            print(f"[EMOJI SANITIZE] option invalide supprimee : {repr(e)}")
                            del opt["emoji"]
                        else:
                            opt["emoji"] = {"name": name}
                clean_opts.append(opt)
            comp["options"] = clean_opts

        # Récursion sur sous-composants
        if "components" in comp:
            comp["components"] = _sanitize_components(comp["components"])

        result.append(comp)
    return result


# ─── Composants ───────────────────────────────────────────────────────────────

def container(components: list, accent_color: int | None = None) -> dict:
    c: dict = {"type": 17, "components": components}
    if accent_color is not None:
        c["accent_color"] = accent_color
    return c


def text(content: str) -> dict:
    return {"type": 10, "content": content}


def sep(divider: bool = True, spacing: int = 1) -> dict:
    return {"type": 14, "divider": divider, "spacing": spacing}


def row(*components) -> dict:
    return {"type": 1, "components": list(components)}


def section(components: list, accessory: dict | None = None) -> dict:
    s: dict = {"type": 9, "components": components}
    if isinstance(accessory, dict) and accessory:
        s["accessory"] = accessory
    return s


def thumbnail(url: str | None) -> dict | None:
    if not url:
        return None
    s = str(url).strip()
    if not s or not (s.startswith("https://") or s.startswith("http://")):
        return None
    return {"type": 11, "media": {"url": s}}


def media_gallery(*urls: str) -> dict:
    return {
        "type": 12,
        "items": [{"media": {"url": url}} for url in urls],
    }


def link_btn(label: str, url: str, emoji: str | None = None) -> dict:
    b: dict = {"type": 2, "style": 5, "label": label, "url": url}
    e = _parse_emoji(emoji)
    if e:
        b["emoji"] = e
    return b


def btn_primary(label: str, custom_id: str, emoji: str | None = None, disabled: bool = False) -> dict:
    b: dict = {"type": 2, "style": 1, "label": label, "custom_id": custom_id, "disabled": disabled}
    e = _parse_emoji(emoji)
    if e:
        b["emoji"] = e
    return b


def btn_secondary(label: str, custom_id: str, emoji: str | None = None, disabled: bool = False) -> dict:
    b: dict = {"type": 2, "style": 2, "label": label, "custom_id": custom_id, "disabled": disabled}
    e = _parse_emoji(emoji)
    if e:
        b["emoji"] = e
    return b


def btn_success(label: str, custom_id: str, emoji: str | None = None, disabled: bool = False) -> dict:
    b: dict = {"type": 2, "style": 3, "label": label, "custom_id": custom_id, "disabled": disabled}
    e = _parse_emoji(emoji)
    if e:
        b["emoji"] = e
    return b


def btn_danger(label: str, custom_id: str, emoji: str | None = None, disabled: bool = False) -> dict:
    b: dict = {"type": 2, "style": 4, "label": label, "custom_id": custom_id, "disabled": disabled}
    e = _parse_emoji(emoji)
    if e:
        b["emoji"] = e
    return b


def select_menu(custom_id: str, placeholder: str, options: list,
                min_values: int = 1, max_values: int = 1) -> dict:
    return {"type": 3, "custom_id": custom_id, "placeholder": placeholder,
            "min_values": min_values, "max_values": max_values, "options": options}


def select_option(label: str, value: str, description: str | None = None,
                  emoji: str | None = None, default: bool = False) -> dict:
    opt: dict = {"label": label, "value": value, "default": default}
    if description:
        opt["description"] = description
    e = _parse_emoji(emoji)
    if e:
        opt["emoji"] = e
    return opt


def channel_select(custom_id: str, placeholder: str,
                   channel_types: list | None = None,
                   min_values: int = 1, max_values: int = 1) -> dict:
    comp: dict = {
        "type": 8,
        "custom_id": custom_id,
        "placeholder": placeholder,
        "min_values": min_values,
        "max_values": max_values,
    }
    if channel_types is not None:
        comp["channel_types"] = channel_types
    return comp


def role_select(custom_id: str, placeholder: str) -> dict:
    return {"type": 6, "custom_id": custom_id, "placeholder": placeholder}


def user_select(custom_id: str, placeholder: str) -> dict:
    return {"type": 5, "custom_id": custom_id, "placeholder": placeholder}


def modal_field(custom_id: str, label: str, placeholder: str = "",
                value: str = "", required: bool = True, style: int = 1,
                min_length: int = 0, max_length: int = 100) -> dict:
    field: dict = {"type": 4, "custom_id": custom_id, "label": label,
                   "style": style, "required": required,
                   "min_length": min_length, "max_length": max_length}
    if placeholder:
        field["placeholder"] = placeholder
    if value:
        field["value"] = value
    return field


def now_ts() -> int:
    return int(datetime.datetime.now(datetime.timezone.utc).timestamp())


def now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _discord_headers() -> dict:
    return {"Authorization": f"Bot {TOKEN}", "Content-Type": "application/json"}


def progress_bar(current: int, total: int, length: int = 10) -> str:
    if total == 0:
        return "▱" * length
    filled = round((current / total) * length)
    return "▰" * filled + "▱" * (length - filled)


def _extract_modal_value(data: dict, field_id: str) -> str:
    for comp in data.get("components", []):
        for sub in comp.get("components", []):
            if sub.get("custom_id") == field_id:
                return sub.get("value", "").strip()
    return ""


def _format_duration(seconds: int) -> str:
    if seconds <= 0:
        return "0s"
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    parts = []
    if h:
        parts.append(f"{h}h")
    if m:
        parts.append(f"{m:02d}min")
    if s and not h:
        parts.append(f"{s:02d}s")
    return " ".join(parts) or "0s"


# ─── Envoi Discord ────────────────────────────────────────────────────────────

async def send_cv2(channel_id: int, components: list, *, allowed_mentions: bool = False,
                   file: discord.File | None = None, _retry: int = 3) -> dict | None:
    url      = f"{DISCORD_API}/channels/{channel_id}/messages"
    components = _sanitize_components(components)
    payload: dict = {"flags": CV2_FLAG, "components": components}
    if allowed_mentions:
        payload["allowed_mentions"] = {"parse": ["roles", "users"]}
    else:
        payload["allowed_mentions"] = {"parse": []}
    for attempt in range(_retry):
        async with aiohttp.ClientSession() as s:
            if file is not None:
                form = aiohttp.FormData()
                form.add_field("payload_json", json.dumps(payload),
                               content_type="application/json")
                form.add_field(
                    "files[0]",
                    file.fp,
                    filename=file.filename,
                    content_type="application/octet-stream",
                )
                req = s.post(url, headers={"Authorization": f"Bot {TOKEN}"}, data=form)
            else:
                req = s.post(url, headers=_discord_headers(), json=payload)
            async with req as r:
                if r.status in (200, 201):
                    return await r.json()
                if r.status == 429 and attempt < _retry - 1:
                    data = await r.json()
                    wait = float(data.get("retry_after", 1))
                    print(f"[CV2 SEND] rate limited, retry in {wait}s")
                    await asyncio.sleep(wait)
                    continue
                if r.status == 403:
                    print(f"[CV2 SEND ERR] 403 Forbidden sur channel {channel_id} "
                          f"— verifie les permissions (Send Messages / View Channel)")
                    return None
                if r.status == 404:
                    print(f"[CV2 SEND ERR] 404 Unknown Channel {channel_id} "
                          f"— le bot n'a pas acces ou le salon n'existe pas")
                    return None
                print(f"[CV2 SEND ERR] {r.status} -> {await r.text()}")
                return None
    return None


async def send_cv2_embed(channel_id: int, components: list, embed: dict,
                         *, allowed_mentions: bool = False, _retry: int = 3) -> dict | None:
    url      = f"{DISCORD_API}/channels/{channel_id}/messages"
    components = _sanitize_components(components)
    payload: dict = {"flags": CV2_FLAG, "components": components, "embeds": [embed]}
    if allowed_mentions:
        payload["allowed_mentions"] = {"parse": ["roles", "users"]}
    else:
        payload["allowed_mentions"] = {"parse": []}
    for attempt in range(_retry):
        async with aiohttp.ClientSession() as s:
            async with s.post(url, headers=_discord_headers(), json=payload) as r:
                if r.status in (200, 201):
                    return await r.json()
                if r.status == 429 and attempt < _retry - 1:
                    data = await r.json()
                    wait = float(data.get("retry_after", 1))
                    print(f"[CV2 SEND] rate limited, retry in {wait}s")
                    await asyncio.sleep(wait)
                    continue
                if r.status == 403:
                    print(f"[CV2 SEND ERR] 403 Forbidden sur channel {channel_id} "
                          f"— verifie les permissions (Send Messages / View Channel)")
                    return None
                if r.status == 404:
                    print(f"[CV2 SEND ERR] 404 Unknown Channel {channel_id} "
                          f"— le bot n'a pas acces ou le salon n'existe pas")
                    return None
                print(f"[CV2 SEND ERR] {r.status} -> {await r.text()}")
                return None
    return None


async def edit_cv2(channel_id: int, message_id: int, components: list,
                   *, _retry: int = 3) -> str:
    """Retourne 'ok', 'not_found' (message supprime) ou 'error'."""
    url      = f"{DISCORD_API}/channels/{channel_id}/messages/{message_id}"
    components = _sanitize_components(components)
    payload  = {"flags": CV2_FLAG, "components": components}
    for attempt in range(_retry):
        async with aiohttp.ClientSession() as s:
            async with s.patch(url, headers=_discord_headers(), json=payload) as r:
                if r.status in (200, 201):
                    return "ok"
                if r.status == 429 and attempt < _retry - 1:
                    data = await r.json()
                    wait = float(data.get("retry_after", 1))
                    print(f"[CV2 EDIT] rate limited, retry in {wait}s")
                    await asyncio.sleep(wait)
                    continue
                if r.status == 404:
                    return "not_found"
                print(f"[CV2 EDIT ERR] {r.status} -> {await r.text()}")
                return "error"
    return "error"


async def patch_original_response(app_id: int, token: str, components: list) -> bool:
    url      = f"{DISCORD_API}/webhooks/{app_id}/{token}/messages/@original"
    components = _sanitize_components(components)
    payload  = {"flags": CV2_FLAG, "components": components}
    async with aiohttp.ClientSession() as s:
        async with s.patch(url, headers=_discord_headers(), json=payload) as r:
            ok = r.status in (200, 201, 204)
            if not ok:
                print(f"[PATCH ORIGINAL ERR] {r.status} -> {await r.text()}")
            return ok


async def reply_cv2(interaction: discord.Interaction, components: list,
                    ephemeral: bool = False, update: bool = False) -> None:
    resp_type  = 7 if update else 4
    flags      = CV2_FLAG | (EPHEMERAL if ephemeral else 0)
    url        = f"{DISCORD_API}/interactions/{interaction.id}/{interaction.token}/callback"
    components = _sanitize_components(components)
    payload    = {
        "type": resp_type,
        "data": {
            "flags": flags,
            "components": components,
            "allowed_mentions": {"parse": []},
        },
    }
    async with aiohttp.ClientSession() as s:
        async with s.post(url, json=payload) as r:
            if r.status in (200, 201, 204):
                return
            if r.status == 404:
                return
            print(f"[CV2 REPLY ERR] {r.status} -> {await r.text()}")


async def followup_cv2(interaction: discord.Interaction, components: list,
                       ephemeral: bool = False) -> None:
    """Envoie un message CV2 via webhook followup — a utiliser apres ack_modal."""
    url        = f"{DISCORD_API}/webhooks/{interaction.application_id}/{interaction.token}"
    flags      = CV2_FLAG | (EPHEMERAL if ephemeral else 0)
    components = _sanitize_components(components)
    payload    = {"flags": flags, "components": components,
                  "allowed_mentions": {"parse": []}}
    async with aiohttp.ClientSession() as s:
        async with s.post(url, json=payload) as r:
            if r.status not in (200, 201, 204):
                print(f"[CV2 FOLLOWUP ERR] {r.status} -> {await r.text()}")


async def ack_modal(interaction: discord.Interaction) -> None:
    url = f"{DISCORD_API}/interactions/{interaction.id}/{interaction.token}/callback"
    async with aiohttp.ClientSession() as s:
        async with s.post(url, json={"type": 6}) as r:
            if r.status not in (200, 201, 204):
                print(f"[ACK MODAL ERR] {r.status} -> {await r.text()}")


async def reply_modal(interaction: discord.Interaction, title: str,
                      custom_id: str, fields: list) -> None:
    url     = f"{DISCORD_API}/interactions/{interaction.id}/{interaction.token}/callback"
    payload = {"type": 9, "data": {"title": title, "custom_id": custom_id,
               "components": [{"type": 1, "components": [f]} for f in fields]}}
    async with aiohttp.ClientSession() as s:
        async with s.post(url, json=payload) as r:
            if r.status not in (200, 201, 204):
                print(f"[MODAL ERR] {r.status} -> {await r.text()}")


async def send_public(interaction: discord.Interaction, components: list) -> None:
    await interaction.response.defer(ephemeral=True)
    await send_cv2(interaction.channel_id, components)
    try:
        await interaction.delete_original_response()
    except Exception:
        pass


async def open_dm(user_id) -> str | None:
    async with aiohttp.ClientSession() as s:
        async with s.post(f"{DISCORD_API}/users/@me/channels",
                          headers=_discord_headers(),
                          json={"recipient_id": str(user_id)}) as r:
            if r.status in (200, 201):
                return (await r.json())["id"]
            return None


async def send_to_dm(channel_id: str, embed: dict,
                     components: list | None = None) -> bool:
    payload: dict = {"embeds": [embed]}
    if components:
        payload["components"] = components
    async with aiohttp.ClientSession() as s:
        async with s.post(f"{DISCORD_API}/channels/{channel_id}/messages",
                          headers=_discord_headers(), json=payload) as r:
            return r.status in (200, 201)


async def send_file(channel_id: int, filename: str, content: str,
                    message_content: str = "") -> dict | None:
    """Envoie un fichier texte dans un salon Discord."""
    url = f"{DISCORD_API}/channels/{channel_id}/messages"
    form = aiohttp.FormData()
    payload_json: dict = {"allowed_mentions": {"parse": []}}
    if message_content:
        payload_json["content"] = message_content
    form.add_field("payload_json", json.dumps(payload_json),
                   content_type="application/json")
    form.add_field(
        "files[0]",
        io.BytesIO(content.encode("utf-8")),
        filename=filename,
        content_type="text/plain; charset=utf-8",
    )
    headers = {"Authorization": f"Bot {TOKEN}"}
    async with aiohttp.ClientSession() as s:
        async with s.post(url, headers=headers, data=form) as r:
            if r.status in (200, 201):
                return await r.json()
            print(f"[SEND FILE ERR] {r.status} -> {await r.text()}")
            return None