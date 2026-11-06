"""Endpoints de Estandarización (monitoreo de variables de máquina).

Cada registro queda con el usuario que inició sesión como responsable y con
fecha/hora del servidor (igual que F-158). Captura máquina, OP/referencia/marca,
calibre, papel, humectación, calidad del vaso y las 6 resistencias del tablero
(H1..H6). Las fotos (del tablero eléctrico y de la calidad del vaso) se guardan
como adjuntos con una `categoria` para poder mostrarlas por separado.
"""
import base64
import uuid as _uuidlib
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from .. import models, schemas, storage
from ..auth import get_current_user, require_admin
from ..timeutil import now_co, fecha_fields
from ..constants_f158 import MAQUINAS_FORMACION, CALIBRES, MATERIALES

router = APIRouter(prefix="/estandarizacion", tags=["Estandarización"])

MAX_BYTES = 30 * 1024 * 1024  # 30 MB por archivo

# Campos del registro que se copian tal cual entre el request y el modelo.
_CAMPOS = (
    "maquina", "orden_produccion", "referencia_texto", "marca", "calibre",
    "proveedor_papel", "tipo_papel", "tipo_humectacion", "calidad_vaso",
    "h1", "h2", "h3", "h4", "h5", "h6", "observaciones",
)


def _out(reg: models.Estandarizacion) -> schemas.EstandarizacionOut:
    data = schemas.EstandarizacionOut.model_validate(reg)
    for src, dst in zip(reg.adjuntos, data.adjuntos):
        dst.url = storage.url(src.ruta)
    return data


@router.get("/config")
def obtener_config():
    """Listas para el formulario: máquinas (las mismas de F-158 Formación),
    calibres y tipos de papel (P1, P2, …), reutilizadas de los demás reportes."""
    return {
        "maquinas": MAQUINAS_FORMACION,
        "calibres": CALIBRES,
        "tipos_papel": MATERIALES,
    }


@router.get("/registros", response_model=list[schemas.EstandarizacionResumen])
def listar_registros(
    desde: Optional[date] = None,
    hasta: Optional[date] = None,
    user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lista liviana para "Ver registros" (sin fotos). El detalle y las fotos se
    piden con GET /estandarizacion/registros/{id} al abrir la fila."""
    q = db.query(models.Estandarizacion)
    if desde:
        q = q.filter(models.Estandarizacion.fecha >= desde)
    if hasta:
        q = q.filter(models.Estandarizacion.fecha <= hasta)
    regs = q.order_by(models.Estandarizacion.creado_en.desc()).all()
    return [schemas.EstandarizacionResumen.model_validate(r) for r in regs]


@router.get("/registros/{registro_id}", response_model=schemas.EstandarizacionOut)
def obtener_registro(registro_id: str, db: Session = Depends(get_db)):
    reg = (
        db.query(models.Estandarizacion)
        .options(selectinload(models.Estandarizacion.adjuntos))
        .filter(models.Estandarizacion.id == registro_id)
        .first()
    )
    if not reg:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return _out(reg)


@router.post("/registros", response_model=schemas.EstandarizacionOut, status_code=201)
def crear_registro(
    data: schemas.EstandarizacionCreate,
    user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crea un registro de estandarización. Responsable = usuario en sesión."""
    if data.id:  # idempotencia ante reintentos de la cola offline
        existing = db.get(models.Estandarizacion, data.id)
        if existing:
            return _out(existing)

    f, fh = fecha_fields(user.rol == "admin", data.fecha)
    kwargs = {c: getattr(data, c) for c in _CAMPOS}
    kwargs.update(
        responsable_id=user.id,
        responsable_nombre=user.nombre,
        fecha=f,
        fecha_hora=fh,
    )
    if data.id:
        kwargs["id"] = data.id
    reg = models.Estandarizacion(**kwargs)
    db.add(reg)
    db.commit()
    db.refresh(reg)
    return _out(reg)


@router.put("/registros/{registro_id}", response_model=schemas.EstandarizacionOut)
def editar_registro(
    registro_id: str,
    data: schemas.EstandarizacionUpdate,
    user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Edita un registro. Solo el responsable (o admin) y dentro de 10 h desde que
    se registró."""
    reg = db.get(models.Estandarizacion, registro_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    es_admin = user.rol == "admin"
    if reg.responsable_id != user.id and not es_admin:
        raise HTTPException(status_code=403, detail="Solo el responsable puede editar su registro")
    if not es_admin and reg.creado_en and now_co() - reg.creado_en > timedelta(hours=10):
        raise HTTPException(status_code=403, detail="El plazo para editar venció (10 h desde que se registró)")

    for c in _CAMPOS:
        setattr(reg, c, getattr(data, c))
    reg.actualizado_en = now_co()
    db.commit()
    db.refresh(reg)
    return _out(reg)


@router.delete("/registros/{registro_id}", status_code=204)
def borrar_registro(
    registro_id: str,
    _admin: models.Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Borra un registro. Solo admin."""
    reg = db.get(models.Estandarizacion, registro_id)
    if not reg:
        return
    db.delete(reg)
    db.commit()


# ------------------------------- Adjuntos ------------------------------------ #
class AdjuntoIn(BaseModel):
    nombre: str
    tipo: str                 # image | video
    data: str                 # base64 (admite prefijo data:...;base64,)
    categoria: str = "vaso"   # tablero | vaso


@router.post("/registros/{registro_id}/adjuntos", response_model=schemas.EstAdjuntoOut, status_code=201)
def subir_adjunto(
    registro_id: str,
    data: AdjuntoIn,
    user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sube una foto o video (base64). `categoria` distingue la foto del tablero
    eléctrico ('tablero') de las fotos de calidad del vaso ('vaso')."""
    reg = db.get(models.Estandarizacion, registro_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    raw = data.data
    if "," in raw and raw.strip().lower().startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        blob = base64.b64decode(raw, validate=False)
    except Exception:
        raise HTTPException(status_code=422, detail="Archivo inválido")
    if not blob:
        raise HTTPException(status_code=422, detail="Archivo vacío")
    if len(blob) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="El archivo supera 30 MB")

    safe = Path(data.nombre).name or "archivo"
    ext = Path(safe).suffix.lower() or (".mp4" if data.tipo == "video" else ".jpg")
    fname = f"{_uuidlib.uuid4().hex[:12]}{ext}"
    tipo = "video" if data.tipo == "video" else "image"
    categoria = "tablero" if data.categoria == "tablero" else "vaso"

    ruta_rel = f"estandarizacion/{registro_id}/{fname}"
    storage.guardar(ruta_rel, blob, tipo)

    adj = models.EstandarizacionAdjunto(
        estandarizacion_id=registro_id,
        nombre=safe,
        tipo=tipo,
        categoria=categoria,
        ruta=ruta_rel,
    )
    db.add(adj)
    db.commit()
    db.refresh(adj)
    out = schemas.EstAdjuntoOut.model_validate(adj)
    out.url = storage.url(ruta_rel)
    return out
