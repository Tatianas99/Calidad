"""Alertas de Calidad: comunicados de reclamos de cliente (solo admin).

El portal guarda los datos y la foto; la imagen (PNG) la dibuja el navegador a
partir de estos datos, así que una alerta se puede corregir y volver a
descargar cuantas veces haga falta.
"""
import base64
import json
import uuid as _uuidlib
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, storage
from ..auth import get_current_user

router = APIRouter(prefix="/alertas", tags=["Alertas de Calidad"])

# Las alertas se hacían a mano hasta la 014; el portal sigue desde la 015.
NUMERO_INICIAL = 15
MAX_FOTO = 10 * 1024 * 1024  # 10 MB (el navegador ya la reduce a ~1600 px)
ESTADOS_DEFECTO = {"nuevo", "sigue"}
ETIQUETAS = {"NUEVO", "REINCIDENTE"}


def _solo_admin(user: models.Usuario = Depends(get_current_user)) -> models.Usuario:
    if user.rol != "admin":
        raise HTTPException(status_code=403, detail="Las alertas de calidad son solo para administradores")
    return user


class DefectoIn(BaseModel):
    titulo: str
    detalle: str = ""
    estado: str = "nuevo"  # nuevo | sigue


class AlertaIn(BaseModel):
    numero: int
    fecha: date
    producto: str
    codigo: Optional[str] = None
    titulo: str
    etiqueta: str = "NUEVO"
    reporte: str = ""
    area: Optional[str] = None
    impacto: Optional[str] = None
    defectos: list[DefectoIn] = []
    acciones: list[str] = []
    cliente: Optional[str] = None
    op_lote: Optional[str] = None


class FotoIn(BaseModel):
    nombre: str = "foto.jpg"
    data: str  # base64 (admite prefijo data:...;base64,)


def _limpio(v: Optional[str]) -> Optional[str]:
    v = (v or "").strip()
    return v or None


def _out(a: models.AlertaCalidad) -> dict:
    return {
        "id": a.id,
        "numero": a.numero,
        "fecha": a.fecha.isoformat(),
        "producto": a.producto,
        "codigo": a.codigo,
        "titulo": a.titulo,
        "etiqueta": a.etiqueta,
        "reporte": a.reporte or "",
        "area": a.area,
        "impacto": a.impacto,
        "defectos": json.loads(a.defectos or "[]"),
        "acciones": json.loads(a.acciones or "[]"),
        "cliente": a.cliente,
        "op_lote": a.op_lote,
        "tiene_foto": bool(a.foto_ruta),
        "creado_por": a.creado_por,
        "creado_en": a.creado_en.isoformat() if a.creado_en else None,
    }


def _aplicar(a: models.AlertaCalidad, data: AlertaIn, db: Session) -> None:
    if data.numero < 1:
        raise HTTPException(status_code=422, detail="El número de alerta debe ser mayor que 0")
    otro = db.query(models.AlertaCalidad).filter(models.AlertaCalidad.numero == data.numero).first()
    if otro and otro.id != a.id:
        raise HTTPException(status_code=409, detail=f"Ya existe la alerta N° {data.numero:03d}")
    producto, titulo = data.producto.strip(), data.titulo.strip()
    if not producto or not titulo:
        raise HTTPException(status_code=422, detail="El producto y el defecto principal son obligatorios")

    defectos = []
    for d in data.defectos[:3]:
        t = d.titulo.strip()
        if t:
            estado = d.estado if d.estado in ESTADOS_DEFECTO else "nuevo"
            defectos.append({"titulo": t[:120], "detalle": d.detalle.strip()[:200], "estado": estado})
    acciones = [x.strip()[:300] for x in data.acciones[:3] if x.strip()]

    a.numero = data.numero
    a.fecha = data.fecha
    a.producto = producto[:200]
    a.codigo = _limpio(data.codigo)
    a.titulo = titulo[:200]
    a.etiqueta = data.etiqueta if data.etiqueta in ETIQUETAS else "NUEVO"
    a.reporte = data.reporte.strip()[:1000]
    a.area = _limpio(data.area)
    a.impacto = _limpio(data.impacto)
    a.defectos = json.dumps(defectos, ensure_ascii=False)
    a.acciones = json.dumps(acciones, ensure_ascii=False)
    a.cliente = _limpio(data.cliente)
    a.op_lote = _limpio(data.op_lote)


def _buscar(db: Session, alerta_id: int) -> models.AlertaCalidad:
    a = db.get(models.AlertaCalidad, alerta_id)
    if not a:
        raise HTTPException(status_code=404, detail="Alerta no encontrada")
    return a


@router.get("")
def listar(_: models.Usuario = Depends(_solo_admin), db: Session = Depends(get_db)):
    filas = db.query(models.AlertaCalidad).order_by(models.AlertaCalidad.numero.desc()).all()
    return [_out(a) for a in filas]


@router.get("/siguiente")
def siguiente(_: models.Usuario = Depends(_solo_admin), db: Session = Depends(get_db)):
    mayor = db.query(func.max(models.AlertaCalidad.numero)).scalar()
    return {"numero": max(NUMERO_INICIAL, (mayor or 0) + 1)}


@router.get("/{alerta_id}")
def obtener(alerta_id: int, _: models.Usuario = Depends(_solo_admin), db: Session = Depends(get_db)):
    return _out(_buscar(db, alerta_id))


@router.post("", status_code=201)
def crear(data: AlertaIn, user: models.Usuario = Depends(_solo_admin), db: Session = Depends(get_db)):
    a = models.AlertaCalidad(creado_por=user.nombre)
    _aplicar(a, data, db)
    db.add(a)
    db.commit()
    db.refresh(a)
    return _out(a)


@router.put("/{alerta_id}")
def actualizar(alerta_id: int, data: AlertaIn, _: models.Usuario = Depends(_solo_admin), db: Session = Depends(get_db)):
    a = _buscar(db, alerta_id)
    _aplicar(a, data, db)
    db.commit()
    db.refresh(a)
    return _out(a)


@router.delete("/{alerta_id}", status_code=204)
def borrar(alerta_id: int, _: models.Usuario = Depends(_solo_admin), db: Session = Depends(get_db)):
    a = db.get(models.AlertaCalidad, alerta_id)
    if a:
        if a.foto_ruta:
            storage.eliminar(a.foto_ruta)
        db.delete(a)
        db.commit()
    return Response(status_code=204)


@router.put("/{alerta_id}/foto")
def subir_foto(alerta_id: int, data: FotoIn, _: models.Usuario = Depends(_solo_admin), db: Session = Depends(get_db)):
    a = _buscar(db, alerta_id)
    raw = data.data
    if "," in raw and raw.strip().lower().startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        blob = base64.b64decode(raw, validate=False)
    except Exception:
        raise HTTPException(status_code=422, detail="Foto inválida")
    if not blob:
        raise HTTPException(status_code=422, detail="Foto vacía")
    if len(blob) > MAX_FOTO:
        raise HTTPException(status_code=413, detail="La foto supera 10 MB")

    ruta = f"alertas/{a.id}/{_uuidlib.uuid4().hex[:12]}.jpg"
    storage.guardar(ruta, blob, "image")
    anterior = a.foto_ruta
    a.foto_ruta = ruta
    db.commit()
    if anterior:
        storage.eliminar(anterior)
    return {"ok": True}


@router.get("/{alerta_id}/foto")
def ver_foto(alerta_id: int, _: models.Usuario = Depends(_solo_admin), db: Session = Depends(get_db)):
    """Devuelve la foto desde el mismo origen del portal.

    No se usa el enlace temporal de Azure porque el navegador necesita leer los
    píxeles para generar el PNG, y una imagen de otro dominio lo impide (CORS).
    """
    a = _buscar(db, alerta_id)
    if not a.foto_ruta:
        raise HTTPException(status_code=404, detail="La alerta no tiene foto")
    return Response(
        content=storage.leer(a.foto_ruta),
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )
