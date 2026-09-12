"""Endpoints de catálogos (personas, máquinas, referencias, puntos) y opciones."""
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..auth import require_admin
from ..personal import sync_personas
from ..referencias_sync import sync_referencias
from ..maquinas_sync import sync_maquinas
from ..constants import (
    as_options, EMBALAJE_ITEMS_F006, TIPOS_PRUEBA_F006, TIPOS_MATERIAL_F006, RESULTADOS,
    MAQUINAS_PRODUCCION,
)

router = APIRouter(prefix="/catalogos", tags=["Catálogos"])


@router.get("/fichas", response_model=list[schemas.FichaTecnicaOut])
def fichas_tecnicas(db: Session = Depends(get_db)):
    """Base de datos de fichas técnicas (medidas + enlace al PDF/archivo)."""
    return (db.query(models.FichaTecnica)
            .filter(models.FichaTecnica.activo == True)
            .order_by(models.FichaTecnica.orden).all())


@router.post("/fichas", response_model=schemas.FichaTecnicaOut, status_code=201)
def crear_ficha(
    data: schemas.FichaTecnicaCreate,
    _admin: models.Usuario = Depends(require_admin), db: Session = Depends(get_db),
):
    """Crea una nueva ficha técnica. Solo admin."""
    ref = (data.referencia or "").strip()
    if not ref:
        raise HTTPException(status_code=422, detail="La referencia es obligatoria")
    # id (slug) único a partir de la referencia.
    base = re.sub(r"[^a-z0-9]+", "-", ref.lower()).strip("-") or "ficha"
    fid, n = base, 2
    while db.get(models.FichaTecnica, fid) is not None:
        fid, n = f"{base}-{n}", n + 1
    orden = (db.query(func.max(models.FichaTecnica.orden)).scalar() or 0) + 1

    def limpio(v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        return v or None

    f = models.FichaTecnica(
        id=fid, referencia=ref, codigo=limpio(data.codigo), categoria=limpio(data.categoria),
        diam_inferior=limpio(data.diam_inferior), rim=limpio(data.rim),
        diam_exterior=limpio(data.diam_exterior), altura=limpio(data.altura),
        orden=orden, activo=True,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


@router.put("/fichas/{ficha_id}", response_model=schemas.FichaTecnicaOut)
def editar_ficha(
    ficha_id: str, data: schemas.FichaTecnicaUpdate,
    _admin: models.Usuario = Depends(require_admin), db: Session = Depends(get_db),
):
    """Edita el nombre de la referencia de una ficha técnica. Solo admin."""
    f = db.get(models.FichaTecnica, ficha_id)
    if not f:
        raise HTTPException(status_code=404, detail="Ficha no encontrada")
    f.referencia = data.referencia.strip()
    for campo in ("categoria", "diam_inferior", "rim", "diam_exterior", "altura"):
        val = getattr(data, campo)
        if val is not None:
            setattr(f, campo, val.strip())
    db.commit()
    db.refresh(f)
    return f


@router.delete("/fichas/{ficha_id}", status_code=204)
def borrar_ficha(
    ficha_id: str,
    _admin: models.Usuario = Depends(require_admin), db: Session = Depends(get_db),
):
    """Borra (lógicamente) una ficha técnica. Solo admin. No reaparece al reiniciar."""
    f = db.get(models.FichaTecnica, ficha_id)
    if f:
        f.activo = False
        db.commit()


@router.get("/personas", response_model=list[schemas.PersonaOut])
def personas(rol: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.Persona).filter(models.Persona.activo == True)
    if rol:
        q = q.filter(models.Persona.rol == rol)
    return q.order_by(models.Persona.nombre).all()


@router.post("/personas/sync")
def personas_sync(db: Session = Depends(get_db)):
    """Re-sincroniza el catálogo de personas desde kos_apps.personal_planta."""
    return sync_personas(db)


@router.get("/maquinas", response_model=list[schemas.MaquinaOut])
def maquinas(db: Session = Depends(get_db)):
    return (
        db.query(models.Maquina)
        .filter(models.Maquina.activo == True)
        .order_by(models.Maquina.nombre)
        .all()
    )


@router.post("/maquinas/sync")
def maquinas_sync(db: Session = Depends(get_db)):
    """Re-sincroniza el catálogo de máquinas desde kos_apps.dbo.maquinas."""
    return sync_maquinas(db)


@router.get("/referencias", response_model=list[schemas.ReferenciaOut])
def referencias(db: Session = Depends(get_db)):
    return (
        db.query(models.Referencia)
        .filter(models.Referencia.activo == True)
        .order_by(models.Referencia.codigo)
        .all()
    )


@router.post("/referencias/sync")
def referencias_sync(db: Session = Depends(get_db)):
    """Re-sincroniza el catálogo de referencias desde dbo.PQRS_Referencias."""
    return sync_referencias(db)


@router.get("/puntos-medicion", response_model=list[schemas.PuntoMedicionOut])
def puntos_medicion(db: Session = Depends(get_db)):
    return (
        db.query(models.PuntoMedicion)
        .filter(models.PuntoMedicion.activo == True)
        .order_by(models.PuntoMedicion.nombre)
        .all()
    )


@router.get("/proveedores-papel", response_model=list[schemas.ProveedorPapelOut])
def proveedores_papel(db: Session = Depends(get_db)):
    """Lista de proveedores de papel activos (para el desplegable del F-005)."""
    return (
        db.query(models.ProveedorPapel)
        .filter(models.ProveedorPapel.activo == True)
        .order_by(models.ProveedorPapel.nombre)
        .all()
    )


@router.get("/opciones")
def opciones():
    """Listas de dominio (etiquetas) para poblar el frontend."""
    return {
        "embalaje_f006": as_options(EMBALAJE_ITEMS_F006),
        "tipos_prueba_f006": as_options(TIPOS_PRUEBA_F006),
        "tipos_material_f006": as_options(TIPOS_MATERIAL_F006),
        "resultados": RESULTADOS,
        "turnos": [1, 2, 3],
        "maquinas": MAQUINAS_PRODUCCION,
    }
