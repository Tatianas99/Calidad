"""Gestión de usuarios (crear, editar, roles, permisos, contraseñas). Solo admin."""
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..auth import require, hash_password, usuario_public, PERMISOS, ROLES

router = APIRouter(prefix="/usuarios", tags=["Usuarios"])

_admin = require("gestionar_usuarios")


@router.get("/meta")
def meta(_: models.Usuario = Depends(_admin)):
    """Roles y permisos disponibles para poblar el formulario."""
    return {"roles": ROLES, "permisos": [{"value": k, "label": v} for k, v in PERMISOS.items()]}


@router.get("", response_model=list[schemas.UsuarioOut])
def listar(_: models.Usuario = Depends(_admin), db: Session = Depends(get_db)):
    users = db.query(models.Usuario).order_by(models.Usuario.username).all()
    return [schemas.UsuarioOut(**usuario_public(u)) for u in users]


@router.post("", response_model=schemas.UsuarioOut, status_code=201)
def crear(data: schemas.UsuarioCreate, _: models.Usuario = Depends(_admin), db: Session = Depends(get_db)):
    if db.query(models.Usuario).filter(models.Usuario.username == data.username).first():
        raise HTTPException(status_code=409, detail="El usuario ya existe")
    if data.rol not in ROLES:
        raise HTTPException(status_code=422, detail="Rol inválido")
    permisos = [p for p in data.permisos if p in PERMISOS]
    u = models.Usuario(
        username=data.username.strip(),
        nombre=data.nombre.strip(),
        password_hash=hash_password(data.password),
        rol=data.rol,
        permisos=json.dumps(permisos),
        activo=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return schemas.UsuarioOut(**usuario_public(u))


@router.put("/{usuario_id}", response_model=schemas.UsuarioOut)
def actualizar(usuario_id: int, data: schemas.UsuarioUpdate, _: models.Usuario = Depends(_admin), db: Session = Depends(get_db)):
    u = db.get(models.Usuario, usuario_id)
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if data.username is not None:
        nuevo = data.username.strip()
        if not nuevo:
            raise HTTPException(status_code=422, detail="El usuario no puede quedar vacío")
        existe = (
            db.query(models.Usuario)
            .filter(models.Usuario.username == nuevo, models.Usuario.id != usuario_id)
            .first()
        )
        if existe:
            raise HTTPException(status_code=409, detail="Ese usuario ya está en uso")
        u.username = nuevo
    if data.nombre is not None:
        u.nombre = data.nombre.strip()
    if data.rol is not None:
        if data.rol not in ROLES:
            raise HTTPException(status_code=422, detail="Rol inválido")
        u.rol = data.rol
    if data.permisos is not None:
        u.permisos = json.dumps([p for p in data.permisos if p in PERMISOS])
    if data.activo is not None:
        u.activo = data.activo
    db.commit()
    db.refresh(u)
    return schemas.UsuarioOut(**usuario_public(u))


@router.post("/{usuario_id}/password")
def cambiar_password(usuario_id: int, data: schemas.PasswordIn, _: models.Usuario = Depends(_admin), db: Session = Depends(get_db)):
    u = db.get(models.Usuario, usuario_id)
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    u.password_hash = hash_password(data.password)
    db.commit()
    return {"ok": True}
