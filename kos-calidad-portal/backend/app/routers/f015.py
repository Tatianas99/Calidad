"""Endpoints del formato F-015 (Medición de cloro y PH del agua)."""
from datetime import date, datetime, time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..auth import require_admin, get_current_user
from ..config import PH_MIN, PH_MAX, CLORO_MIN, CLORO_MAX
from ..timeutil import now_co, fecha_fields

router = APIRouter(prefix="/f015", tags=["F-015 Cloro/PH"])


@router.post("/mediciones", response_model=schemas.F015MedicionOut, status_code=201)
def crear_medicion(
    data: schemas.F015MedicionCreate,
    user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.id:  # idempotencia ante reintentos
        existing = db.get(models.F015Medicion, data.id)
        if existing:
            return existing
    ph_ok = PH_MIN <= data.ph <= PH_MAX
    cloro_ok = CLORO_MIN <= data.cloro <= CLORO_MAX
    _, fh = fecha_fields(user.rol == "admin", data.fecha)
    kwargs = dict(
        fecha_hora=data.fecha_hora or fh,
        punto_medicion_id=data.punto_medicion_id,
        punto_texto=data.punto_texto,
        ph=data.ph,
        cloro=data.cloro,
        responsable_id=data.responsable_id,
        comentario=data.comentario,
        ph_en_rango=ph_ok,
        cloro_en_rango=cloro_ok,
    )
    if data.id:
        kwargs["id"] = data.id
    m = models.F015Medicion(**kwargs)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.get("/mediciones/{medicion_id}", response_model=schemas.F015MedicionOut)
def obtener_medicion(medicion_id: str, db: Session = Depends(get_db)):
    m = db.get(models.F015Medicion, medicion_id)
    if not m:
        raise HTTPException(status_code=404, detail="Medición no encontrada")
    return m


@router.put("/mediciones/{medicion_id}", response_model=schemas.F015MedicionOut)
def actualizar_medicion(
    medicion_id: str, data: schemas.F015MedicionCreate,
    _admin: models.Usuario = Depends(require_admin), db: Session = Depends(get_db),
):
    """Edita una medición y recalcula las banderas de rango. Solo admin."""
    m = db.get(models.F015Medicion, medicion_id)
    if not m:
        raise HTTPException(status_code=404, detail="Medición no encontrada")
    m.punto_medicion_id = data.punto_medicion_id
    m.punto_texto = data.punto_texto
    m.ph = data.ph
    m.cloro = data.cloro
    m.responsable_id = data.responsable_id
    m.comentario = data.comentario
    m.ph_en_rango = PH_MIN <= data.ph <= PH_MAX
    m.cloro_en_rango = CLORO_MIN <= data.cloro <= CLORO_MAX
    db.commit()
    db.refresh(m)
    return m


@router.delete("/mediciones/{medicion_id}", status_code=204)
def borrar_medicion(
    medicion_id: str,
    _admin: models.Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Borra una medición. Solo admin."""
    m = db.get(models.F015Medicion, medicion_id)
    if not m:
        return
    db.delete(m)
    db.commit()


@router.get("/mediciones", response_model=list[schemas.F015MedicionOut])
def listar_mediciones(fecha: Optional[date] = None, db: Session = Depends(get_db)):
    q = db.query(models.F015Medicion)
    if fecha:
        inicio = datetime.combine(fecha, time.min)
        fin = datetime.combine(fecha, time.max)
        q = q.filter(
            models.F015Medicion.fecha_hora >= inicio,
            models.F015Medicion.fecha_hora <= fin,
        )
    return q.order_by(models.F015Medicion.fecha_hora.desc()).all()
