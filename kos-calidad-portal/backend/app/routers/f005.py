"""Endpoints del formato F-005 (Liberación de rollos).

Fecha/hora las fija el servidor. Responsable = usuario en sesión.
Editar y borrar registros: solo admin.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..auth import get_current_user, require_admin
from ..timeutil import fecha_fields

router = APIRouter(prefix="/f005", tags=["F-005 Liberación de rollos"])

_CAMPOS = [
    "proceso", "maquina", "lote", "material", "ancho", "calibre", "kg",
    "estado_dinas", "estado_alcohol", "estado_lapiz", "estado_armado", "estado_inocuidad",
    "proveedor", "observaciones",
]


@router.post("/registros", response_model=schemas.F005RegistroOut, status_code=201)
def crear_registro(
    data: schemas.F005RegistroCreate,
    user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crea un registro de liberación de rollo. Responsable = usuario en sesión."""
    if data.id:  # idempotencia ante reintentos de la cola offline
        existing = db.get(models.F005Registro, data.id)
        if existing:
            return existing
    f, fh = fecha_fields(user.rol == "admin", data.fecha)
    kwargs = {c: getattr(data, c) for c in _CAMPOS}
    kwargs.update(
        fecha=f,
        fecha_hora=fh,
        responsable_id=user.id,
        responsable_nombre=user.nombre,
    )
    if data.id:
        kwargs["id"] = data.id
    reg = models.F005Registro(**kwargs)
    db.add(reg)
    db.commit()
    db.refresh(reg)
    return reg


@router.get("/registros", response_model=list[schemas.F005RegistroOut])
def listar_registros(
    fecha: Optional[date] = None,
    mios: bool = False,
    user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(models.F005Registro)
    if fecha:
        q = q.filter(models.F005Registro.fecha == fecha)
    if mios:
        q = q.filter(models.F005Registro.responsable_id == user.id)
    return q.order_by(models.F005Registro.creado_en.desc()).all()


@router.get("/registros/{registro_id}", response_model=schemas.F005RegistroOut)
def obtener_registro(registro_id: str, db: Session = Depends(get_db)):
    reg = db.get(models.F005Registro, registro_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return reg


@router.put("/registros/{registro_id}", response_model=schemas.F005RegistroOut)
def editar_registro(
    registro_id: str, data: schemas.F005RegistroCreate,
    _admin: models.Usuario = Depends(require_admin), db: Session = Depends(get_db),
):
    """Edita un registro. Solo admin."""
    reg = db.get(models.F005Registro, registro_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    for c in _CAMPOS:
        setattr(reg, c, getattr(data, c))
    db.commit()
    db.refresh(reg)
    return reg


@router.delete("/registros/{registro_id}", status_code=204)
def borrar_registro(
    registro_id: str,
    _admin: models.Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Borra un registro. Solo admin."""
    reg = db.get(models.F005Registro, registro_id)
    if not reg:
        return
    db.delete(reg)
    db.commit()
