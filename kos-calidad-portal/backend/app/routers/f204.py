"""Endpoints del formato F-204 (Entrega de producto por turno).

Fecha y hora las fija el servidor. "Recibido por" = usuario en sesión.
"Entregado por" = operario elegido del catálogo (se guarda el nombre para mostrar).
Editar y borrar registros: solo admin.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..auth import get_current_user, require_admin
from ..timeutil import now_co, today_co, fecha_fields

router = APIRouter(prefix="/f204", tags=["F-204 Entrega producto"])


def _nombre_persona(db: Session, persona_id: Optional[int]) -> Optional[str]:
    if not persona_id:
        return None
    p = db.get(models.Persona, persona_id)
    return p.nombre if p else None


@router.post("/registros", response_model=schemas.F204RegistroOut, status_code=201)
def crear_registro(
    data: schemas.F204RegistroCreate,
    user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crea un registro de entrega. Recibido por = usuario en sesión."""
    if data.id:  # idempotencia ante reintentos de la cola offline
        existing = db.get(models.F204Registro, data.id)
        if existing:
            return existing
    f, fh = fecha_fields(user.rol == "admin", data.fecha)
    kwargs = dict(
        fecha=f,
        fecha_hora=fh,
        turno=data.turno,
        orden_produccion=data.orden_produccion,
        maquina_id=data.maquina_id,
        maquina_texto=data.maquina_texto,
        referencia_id=data.referencia_id,
        referencia_texto=data.referencia_texto,
        marca=data.marca,
        cantidad_clase_b=data.cantidad_clase_b,
        verificacion_desperdicio=data.verificacion_desperdicio,
        entregado_por_id=data.entregado_por_id,
        entregado_por_nombre=_nombre_persona(db, data.entregado_por_id),
        recibido_por_id=user.id,
        recibido_por_nombre=user.nombre,
        observaciones=data.observaciones,
    )
    if data.id:
        kwargs["id"] = data.id
    reg = models.F204Registro(**kwargs)
    db.add(reg)
    db.commit()
    db.refresh(reg)
    return reg


@router.get("/registros", response_model=list[schemas.F204RegistroOut])
def listar_registros(
    fecha: Optional[date] = None,
    turno: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.F204Registro)
    if fecha:
        q = q.filter(models.F204Registro.fecha == fecha)
    if turno:
        q = q.filter(models.F204Registro.turno == turno)
    return q.order_by(models.F204Registro.creado_en.desc()).all()


@router.get("/registros/{registro_id}", response_model=schemas.F204RegistroOut)
def obtener_registro(registro_id: str, db: Session = Depends(get_db)):
    reg = db.get(models.F204Registro, registro_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return reg


@router.put("/registros/{registro_id}", response_model=schemas.F204RegistroOut)
def editar_registro(
    registro_id: str, data: schemas.F204RegistroCreate,
    _admin: models.Usuario = Depends(require_admin), db: Session = Depends(get_db),
):
    """Edita un registro. Solo admin."""
    reg = db.get(models.F204Registro, registro_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    reg.turno = data.turno
    reg.orden_produccion = data.orden_produccion
    reg.maquina_id = data.maquina_id
    reg.maquina_texto = data.maquina_texto
    reg.referencia_id = data.referencia_id
    reg.referencia_texto = data.referencia_texto
    reg.marca = data.marca
    reg.cantidad_clase_b = data.cantidad_clase_b
    reg.verificacion_desperdicio = data.verificacion_desperdicio
    reg.entregado_por_id = data.entregado_por_id
    reg.entregado_por_nombre = _nombre_persona(db, data.entregado_por_id)
    reg.observaciones = data.observaciones
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
    reg = db.get(models.F204Registro, registro_id)
    if not reg:
        return
    db.delete(reg)
    db.commit()
