"""Endpoints del formato F-015 (Medición de cloro y PH del agua)."""
from datetime import date, datetime, time
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..config import PH_MIN, PH_MAX, CLORO_MIN, CLORO_MAX
from ..timeutil import now_co

router = APIRouter(prefix="/f015", tags=["F-015 Cloro/PH"])


@router.post("/mediciones", response_model=schemas.F015MedicionOut, status_code=201)
def crear_medicion(data: schemas.F015MedicionCreate, db: Session = Depends(get_db)):
    if data.id:  # idempotencia ante reintentos
        existing = db.get(models.F015Medicion, data.id)
        if existing:
            return existing
    ph_ok = PH_MIN <= data.ph <= PH_MAX
    cloro_ok = CLORO_MIN <= data.cloro <= CLORO_MAX
    kwargs = dict(
        fecha_hora=data.fecha_hora or now_co(),
        punto_medicion_id=data.punto_medicion_id,
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
