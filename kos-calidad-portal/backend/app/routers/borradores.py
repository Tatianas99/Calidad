"""Borrador de trabajo (la "lista del turno") por usuario.

Permite que la MISMA cuenta continúe su turno desde cualquier dispositivo:
el estado del formulario se guarda en el servidor asociado al usuario en sesión.
Es privado — el GET y el PUT filtran por `usuario_id`, así que otras cuentas no
ven ni modifican lo que uno está capturando.
"""
import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..auth import get_current_user
from ..timeutil import now_co

router = APIRouter(prefix="/borradores", tags=["Borradores"])


@router.get("/{clave}", response_model=schemas.BorradorOut)
def obtener_borrador(
    clave: str,
    user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Devuelve el borrador del usuario para ese formato (o contenido nulo)."""
    b = db.get(models.BorradorTurno, (user.id, clave))
    contenido = None
    if b and b.contenido:
        try:
            contenido = json.loads(b.contenido)
        except ValueError:
            contenido = None
    return {"clave": clave, "contenido": contenido}


@router.put("/{clave}", response_model=schemas.BorradorOut)
def guardar_borrador(
    clave: str,
    data: schemas.BorradorIn,
    user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Guarda (upsert) el borrador del usuario para ese formato."""
    texto = json.dumps(data.contenido, ensure_ascii=False) if data.contenido is not None else ""
    b = db.get(models.BorradorTurno, (user.id, clave))
    if b:
        b.contenido = texto
        b.actualizado_en = now_co()
    else:
        db.add(models.BorradorTurno(usuario_id=user.id, clave=clave, contenido=texto))
    db.commit()
    return {"clave": clave, "contenido": data.contenido}
