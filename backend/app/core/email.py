"""Envoi d'emails (SMTP configurable).

Si aucun SMTP n'est configuré (SMTP_HOST vide), les emails ne sont pas
envoyés : en mode DEBUG le contenu est loggé en console pour permettre le
développement local, sinon l'envoi est simplement ignoré.
"""
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from ..config import settings

logger = logging.getLogger(__name__)


def _from_addr() -> str:
    frm = (settings.SMTP_FROM or settings.SMTP_USER or "").strip()
    return frm or "noreply@bluerock.ai"


def smtp_enabled() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_USER)


def send_email(to: str, subject: str, html: str, text: str | None = None) -> bool:
    """Envoie un email HTML. Retourne True si l'envoi a abouti.

    Sans SMTP configuré : logge le contenu en DEBUG, retourne False.
    """
    if not smtp_enabled():
        if settings.DEBUG:
            logger.info(
                "[EMAIL (SMTP non configuré, contenu loggé)] -> %s | %s\n%s",
                to,
                subject,
                text or "contenu HTML",
            )
        else:
            logger.warning("Email ignoré (SMTP non configuré) -> %s | %s", to, subject)
        return False

    msg = EmailMessage()
    msg["From"] = formataddr(("BlueRock", _from_addr()))
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text or "Veuillez utiliser un client HTML.")
    msg.add_alternative(html, subtype="html")

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT) as smtp:
            smtp.ehlo()
            if settings.SMTP_STARTTLS:
                smtp.starttls()
                smtp.ehlo()
            smtp.login(settings.SMTP_USER, settings.SMTP_PASS)
            smtp.send_message(msg)
        logger.info("Email envoyé -> %s | %s", to, subject)
        return True
    except Exception as e:  # pragma: no cover - dépend du serveur distant
        logger.warning("Échec d'envoi email -> %s | %s | %s", to, subject, e)
        return False


def _layout(title: str, body_html: str, footer: str) -> str:
    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#000;font-family:Inter,-apple-system,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
  <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#fff">Blue<span style="color:#00C853">Rock</span></div>
  <div style="background:#141414;border:1px solid #262626;border-radius:16px;padding:24px;margin-top:16px">
    <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:12px">{title}</div>
    <div style="font-size:13px;line-height:1.7;color:#a3a3a3">{body_html}</div>
  </div>
  <div style="font-size:11px;color:#555;margin-top:16px;line-height:1.6">{footer}</div>
</div>
</body></html>"""


def _text_only(html: str) -> str:
    import re

    return re.sub(r"<[^>]+>", " ", html).strip()


def send_verify_email(to: str, code: str, ttl_minutes: int) -> bool:
    title = "Vérifiez votre adresse email"
    body = (
        f"Votre code de vérification BlueRock est :<br/>"
        f"<div style=\"font-size:32px;font-weight:800;letter-spacing:6px;color:#00C853;margin:14px 0\">{code}</div>"
        f"Ce code expire dans <b>{ttl_minutes} minutes</b>. "
        f"Si vous n'avez pas créé de compte BlueRock, ignorez cet email."
    )
    html = _layout(title, body, "BlueRock — Marché Régional des Valeurs Mobilières de l'UEMOA")
    return send_email(to, "BlueRock — Votre code de vérification", html, _text_only(html))


def send_reset_email(to: str, code: str, ttl_minutes: int) -> bool:
    title = "Réinitialisation de votre mot de passe"
    body = (
        f"Utilisez ce code pour réinitialiser votre mot de passe :<br/>"
        f"<div style=\"font-size:32px;font-weight:800;letter-spacing:6px;color:#00C853;margin:14px 0\">{code}</div>"
        f"Ce code expire dans <b>{ttl_minutes} minutes</b>. "
        f"Si vous n'avez pas demandé cette réinitialisation, ignorez cet email."
    )
    html = _layout(title, body, "BlueRock — Marché Régional des Valeurs Mobilières de l'UEMOA")
    return send_email(to, "BlueRock — Réinitialisation de mot de passe", html, _text_only(html))


def send_welcome_email(to: str, name: str) -> bool:
    title = "Bienvenue sur BlueRock"
    body = (
        f"Bonjour <b>{name}</b>,<br/><br/>"
        f"Votre compte BlueRock est vérifié. Vous pouvez maintenant suivre la BRVM "
        f"en temps réel, analyser les sociétés cotées et gérer votre portefeuille."
    )
    html = _layout(title, body, "BlueRock — Marché Régional des Valeurs Mobilières de l'UEMOA")
    return send_email(to, "BlueRock — Bienvenue", html, _text_only(html))
