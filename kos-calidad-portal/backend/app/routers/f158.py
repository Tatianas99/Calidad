"""Endpoints del formato F-158 (Rutas Calidad).

Cada recorrido queda con el usuario que inició sesión como responsable y con
fecha/hora del servidor. El checklist se guarda de forma genérica (clave/valor)
según el proceso elegido, definido en constants_f158.py.
"""
import base64
import uuid as _uuidlib
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas, storage
from ..auth import get_current_user, require_admin
from ..timeutil import now_co, today_co, fecha_fields
from ..constants_f158 import config_f158, PROCESOS_KEYS

router = APIRouter(prefix="/f158", tags=["F-158 Rutas Calidad"])

MAX_BYTES = 30 * 1024 * 1024  # 30 MB por archivo


def _out(reg: models.F158Recorrido) -> schemas.F158RecorridoOut:
    data = schemas.F158RecorridoOut.model_validate(reg)
    # Completa la URL de descarga de cada adjunto (temporal si está en Azure).
    for src, dst in zip(reg.adjuntos, data.adjuntos):
        dst.url = storage.url(src.ruta)
    return data


@router.get("/config")
def obtener_config():
    """Procesos, máquinas y checklists (para que el frontend renderice el formato)."""
    return config_f158()


@router.get("/recorridos", response_model=list[schemas.F158RecorridoOut])
def listar_recorridos(
    fecha: Optional[date] = None,
    proceso: Optional[str] = None,
    mios: bool = False,
    user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lista recorridos. `mios=true` limita a los del usuario actual (panel lateral)."""
    q = db.query(models.F158Recorrido)
    if fecha:
        q = q.filter(models.F158Recorrido.fecha == fecha)
    if proceso:
        q = q.filter(models.F158Recorrido.proceso == proceso)
    if mios:
        q = q.filter(models.F158Recorrido.responsable_id == user.id)
    regs = q.order_by(models.F158Recorrido.creado_en.desc()).all()
    return [_out(r) for r in regs]


@router.get("/recorridos/{recorrido_id}", response_model=schemas.F158RecorridoOut)
def obtener_recorrido(recorrido_id: str, db: Session = Depends(get_db)):
    reg = db.get(models.F158Recorrido, recorrido_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Recorrido no encontrado")
    return _out(reg)


@router.post("/recorridos", response_model=schemas.F158RecorridoOut, status_code=201)
def crear_recorrido(
    data: schemas.F158RecorridoCreate,
    user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crea un recorrido con su checklist. Responsable = usuario en sesión."""
    if data.proceso not in PROCESOS_KEYS:
        raise HTTPException(status_code=422, detail=f"Proceso inválido: {data.proceso}")
    if data.id:  # idempotencia ante reintentos de la cola offline
        existing = db.get(models.F158Recorrido, data.id)
        if existing:
            return _out(existing)

    f, fh = fecha_fields(user.rol == "admin", data.fecha)
    kwargs = dict(
        proceso=data.proceso,
        maquina=data.maquina,
        responsable_id=user.id,
        responsable_nombre=user.nombre,
        fecha=f,
        fecha_hora=fh,
        observaciones=data.observaciones,
    )
    if data.id:
        kwargs["id"] = data.id
    reg = models.F158Recorrido(**kwargs)
    for it in data.items:
        reg.items.append(
            models.F158Item(
                campo_key=it.campo_key, campo_label=it.campo_label, tipo=it.tipo,
                valor=it.valor, ref_id=it.ref_id, marca=it.marca,
            )
        )
    db.add(reg)
    db.commit()
    db.refresh(reg)
    return _out(reg)


@router.put("/recorridos/{recorrido_id}", response_model=schemas.F158RecorridoOut)
def editar_recorrido(
    recorrido_id: str,
    data: schemas.F158RecorridoUpdate,
    user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Edita un recorrido. Solo el usuario que lo registró y solo el mismo día."""
    reg = db.get(models.F158Recorrido, recorrido_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Recorrido no encontrado")
    es_admin = user.rol == "admin"
    if reg.responsable_id != user.id and not es_admin:
        raise HTTPException(status_code=403, detail="Solo el responsable puede editar su recorrido")
    if reg.fecha != today_co() and not es_admin:
        raise HTTPException(status_code=403, detail="Solo se puede editar el mismo día del registro")

    reg.maquina = data.maquina
    reg.observaciones = data.observaciones
    reg.items.clear()
    for it in data.items:
        reg.items.append(
            models.F158Item(
                campo_key=it.campo_key, campo_label=it.campo_label, tipo=it.tipo,
                valor=it.valor, ref_id=it.ref_id, marca=it.marca,
            )
        )
    reg.actualizado_en = now_co()
    db.commit()
    db.refresh(reg)
    return _out(reg)


@router.delete("/recorridos/{recorrido_id}", status_code=204)
def borrar_recorrido(
    recorrido_id: str,
    _admin: models.Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Borra un recorrido. Solo admin."""
    reg = db.get(models.F158Recorrido, recorrido_id)
    if not reg:
        return
    db.delete(reg)
    db.commit()


# ------------------------------- Adjuntos ------------------------------------ #
class AdjuntoIn(BaseModel):
    nombre: str
    tipo: str            # image | video
    data: str            # base64 (admite prefijo data:...;base64,)


@router.post("/recorridos/{recorrido_id}/adjuntos", response_model=schemas.F158AdjuntoOut, status_code=201)
def subir_adjunto(
    recorrido_id: str,
    data: AdjuntoIn,
    user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sube una foto o video (base64) y lo guarda en disco; en BD queda la ruta."""
    reg = db.get(models.F158Recorrido, recorrido_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Recorrido no encontrado")

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
    # Nombre corto de archivo: evita superar el límite de ruta de Windows
    # (MAX_PATH = 260), que con nombres largos (fotos de WhatsApp/capturas) y la
    # ruta larga de OneDrive hacía fallar la escritura. El nombre original se
    # conserva en la columna `nombre` solo para mostrarlo.
    ext = Path(safe).suffix.lower() or (".mp4" if data.tipo == "video" else ".jpg")
    fname = f"{_uuidlib.uuid4().hex[:12]}{ext}"
    tipo = "video" if data.tipo == "video" else "image"

    ruta_rel = f"f158/{recorrido_id}/{fname}"
    storage.guardar(ruta_rel, blob, tipo)

    adj = models.F158Adjunto(
        recorrido_id=recorrido_id,
        nombre=safe,
        tipo=tipo,
        ruta=ruta_rel,
    )
    db.add(adj)
    db.commit()
    db.refresh(adj)
    out = schemas.F158AdjuntoOut.model_validate(adj)
    out.url = storage.url(ruta_rel)
    return out
