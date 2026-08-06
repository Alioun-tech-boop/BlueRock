import json
import logging
import urllib.error
import urllib.request
from typing import Optional, Tuple

from ..config import settings

_log = logging.getLogger(__name__)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def call_llm(
    system: str,
    user: str,
    max_tokens: int = 3000,
    temperature: float = 0.3,
) -> Tuple[Optional[str], str]:
    """Appelle un LLM gratuit (Gemini en priorité, OpenAI en secours).

    Retourne (texte, fournisseur) — fournisseur: "gemini" | "openai" | "".
    """
    if settings.GEMINI_API_KEY:
        try:
            text = _call_gemini(system, user, max_tokens, temperature)
            if text:
                return text, "gemini"
            _log.warning("Gemini returned empty content")
        except Exception as e:
            _log.warning("Gemini call failed: %s", e)

    if settings.OPENAI_API_KEY and settings.OPENAI_API_KEY != "your-openai-api-key":
        try:
            text = _call_openai(system, user, max_tokens, temperature)
            if text:
                return text, "openai"
            _log.warning("OpenAI returned empty content")
        except Exception as e:
            _log.warning("OpenAI call failed: %s", e)

    return None, ""


def _call_gemini(system: str, user: str, max_tokens: int, temperature: float) -> Optional[str]:
    body = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        },
    }
    url = GEMINI_URL.format(model=settings.GEMINI_MODEL) + f"?key={settings.GEMINI_API_KEY}"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError, TypeError):
        return None


def _call_openai(system: str, user: str, max_tokens: int, temperature: float) -> Optional[str]:
    import openai

    client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return (resp.choices[0].message.content or "").strip()
