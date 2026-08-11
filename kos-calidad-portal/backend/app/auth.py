"""Autenticación: hash de contraseñas, tokens firmados y dependencias de acceso.

Sin dependencias externas: usa hashlib/hmac (librería estándar).
"""
import os
import json
import time
import hmac
import base64
import hashlib

from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session

from .db import get_db
from .config import SECRET_KEY, TOKEN_TTL
from . import models

# Permisos disponibles en el sistema (clave -> etiqueta).
PERMISOS = {
    "registrar_f005": "Registrar F-005 (Liberación rollos)",
    "registrar_f006": "Registrar F-006",
    "registrar_f015": "Registrar F-015",
    "registrar_f158": "Registrar F-158 (Rutas Calidad)",
    "registrar_f204": "Registrar F-204 (Entrega producto)",
    "ver_registros": "Ver registros",
    "gestionar_catalogos": "Editar proveedores de papel y puntos de medición",
    "gestionar_usuarios": "Gestionar usuarios",
}
ROLES = ["admin", "calidad", "operario"]


# ----------------------------- Contraseñas ----------------------------- #
def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 120_000)
    return f"pbkdf2$120000${salt.hex()}${dk.hex()}"


def verify_password(pw: str, stored: str) -> bool:
    try:
        _algo, iters, salt_hex, hash_hex = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


# ------------------------------- Tokens -------------------------------- #
def _b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def create_token(usuario_id: int) -> str:
    body = {"sub": usuario_id, "exp": int(time.time()) + TOKEN_TTL}
    raw = _b64e(json.dumps(body).encode())
    sig = _b64e(hmac.new(SECRET_KEY.encode(), raw.encode(), hashlib.sha256).digest())
    return f"{raw}.{sig}"


def verify_token(token: str):
    try:
        raw, sig = token.split(".")
        expected = _b64e(hmac.new(SECRET_KEY.encode(), raw.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        body = json.loads(_b64d(raw))
        if body.get("exp", 0) < time.time():
            return None
        return body
    except Exception:
        return None


# --------------------------- Dependencias ------------------------------ #
def get_current_user(
    authorization: str = Header(None), db: Session = Depends(get_db)
) -> models.Usuario:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    payload = verify_token(authorization[7:])
    if not payload:
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")
    user = db.get(models.Usuario, payload["sub"])
    if not user or not user.activo:
        raise HTTPException(status_code=401, detail="Usuario inactivo")
    return user


def user_permisos(user: models.Usuario) -> list[str]:
    if user.rol == "admin":
        return list(PERMISOS.keys())
    try:
        permisos = json.loads(user.permisos or "[]")
    except Exception:
        permisos = []
    # El rol "calidad" siempre puede editar proveedores de papel y puntos de medición.
    if user.rol == "calidad" and "gestionar_catalogos" not in permisos:
        permisos = permisos + ["gestionar_catalogos"]
    return permisos


def usuario_public(user: models.Usuario) -> dict:
    """Representación pública del usuario (permisos como lista)."""
    return {
        "id": user.id,
        "username": user.username,
        "nombre": user.nombre,
        "rol": user.rol,
        "permisos": user_permisos(user),
        "activo": user.activo,
    }


def require(permiso: str):
    """Dependencia que exige un permiso (admin siempre pasa)."""
    def dep(user: models.Usuario = Depends(get_current_user)) -> models.Usuario:
        if permiso not in user_permisos(user):
            raise HTTPException(status_code=403, detail="No tienes permiso para esta acción")
        return user
    return dep


def require_admin(user: models.Usuario = Depends(get_current_user)) -> models.Usuario:
    """Dependencia que exige rol admin (editar/borrar registros)."""
    if user.rol != "admin":
        raise HTTPException(status_code=403, detail="Solo un administrador puede editar o borrar registros")
    return user
