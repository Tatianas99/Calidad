"""Configuración de horarios de turnos y derivación del turno por la hora.

La grilla (día de la semana × turno) define de qué turno es cada registro de
F-005 y F-158 según su hora. Editable solo por admin.
"""
from datetime import datetime, time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..auth import require

router = APIRouter(prefix="/turnos", tags=["Turnos"])

_admin = require("gestionar_usuarios")


def _parse(hhmm: str) -> time:
    return datetime.strptime(hhmm.strip(), "%H:%M").time()


def _fmt(t: time) -> str:
    return t.strftime("%H:%M")


# --------------------------- Derivación de turno --------------------------- #
def cargar_horarios(db: Session) -> dict:
    """{dia_semana: [(turno, inicio, fin), …]} desde la configuración."""
    h: dict = {}
    for r in db.query(models.TurnoHorario).all():
        h.setdefault(r.dia_semana, []).append((r.turno, r.hora_inicio, r.hora_fin))
    return h


def turno_de(dt: datetime, horarios: dict) -> int:
    """Turno al que pertenece `dt` según los horarios; si no hay match, por defecto."""
    dia = dt.weekday()  # 0=lunes
    hora = dt.time()
    for turno, ini, fin in horarios.get(dia, []):
        if ini <= fin:                       # mismo día
            if ini <= hora < fin:
                return turno
        else:                                # cruza medianoche (p. ej. 22:00–06:00)
            if hora >= ini or hora < fin:
                return turno
    # Por defecto: T1 06–14, T2 14–22, T3 22–06.
    h = dt.hour
    return 1 if 6 <= h < 14 else 2 if 14 <= h < 22 else 3


# ------------------------------- Endpoints -------------------------------- #
def _listar(db: Session) -> list[schemas.TurnoHorarioItem]:
    filas = db.query(models.TurnoHorario).order_by(
        models.TurnoHorario.dia_semana, models.TurnoHorario.turno
    ).all()
    return [
        schemas.TurnoHorarioItem(
            dia_semana=r.dia_semana, turno=r.turno, inicio=_fmt(r.hora_inicio), fin=_fmt(r.hora_fin)
        )
        for r in filas
    ]


@router.get("", response_model=list[schemas.TurnoHorarioItem])
def listar(_: models.Usuario = Depends(_admin), db: Session = Depends(get_db)):
    return _listar(db)


@router.put("", response_model=list[schemas.TurnoHorarioItem])
def guardar(data: schemas.TurnosUpdate, _: models.Usuario = Depends(_admin), db: Session = Depends(get_db)):
    """Reemplaza toda la grilla de horarios."""
    try:
        nuevos = [
            models.TurnoHorario(
                dia_semana=it.dia_semana, turno=it.turno,
                hora_inicio=_parse(it.inicio), hora_fin=_parse(it.fin),
            )
            for it in data.horarios
        ]
    except ValueError:
        raise HTTPException(status_code=422, detail="Hora inválida (usa formato HH:MM)")
    db.query(models.TurnoHorario).delete()
    db.add_all(nuevos)
    db.commit()
    return _listar(db)
