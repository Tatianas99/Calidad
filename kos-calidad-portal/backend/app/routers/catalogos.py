"""Endpoints de catálogos (personas, máquinas, referencias, puntos) y opciones."""
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..personal import sync_personas
from ..referencias_sync import sync_referencias
from ..maquinas_sync import sync_maquinas
from ..constants import (
    as_options, EMBALAJE_ITEMS_F006, TIPOS_PRUEBA_F006, TIPOS_MATERIAL_F006, RESULTADOS,
)

router = APIRouter(prefix="/catalogos", tags=["Catálogos"])


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
    }
