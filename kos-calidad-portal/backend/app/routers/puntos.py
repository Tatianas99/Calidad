"""Gestión de puntos de medición (configuración F-015). Solo admin."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..auth import require

router = APIRouter(prefix="/puntos-medicion", tags=["Puntos de medición"])

_admin = require("gestionar_catalogos")


@router.get("", response_model=list[schemas.PuntoMedicionAdminOut])
def listar(_: models.Usuario = Depends(_admin), db: Session = Depends(get_db)):
    return db.query(models.PuntoMedicion).order_by(models.PuntoMedicion.nombre).all()


@router.post("", response_model=schemas.PuntoMedicionAdminOut, status_code=201)
def crear(data: schemas.PuntoMedicionCreate, _: models.Usuario = Depends(_admin), db: Session = Depends(get_db)):
    nombre = data.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=422, detail="El nombre es obligatorio")
    if db.query(models.PuntoMedicion).filter(models.PuntoMedicion.nombre == nombre).first():
        raise HTTPException(status_code=409, detail="Ese punto ya existe")
    p = models.PuntoMedicion(nombre=nombre, activo=True)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.put("/{pid}", response_model=schemas.PuntoMedicionAdminOut)
def actualizar(pid: int, data: schemas.PuntoMedicionUpdate, _: models.Usuario = Depends(_admin), db: Session = Depends(get_db)):
    p = db.get(models.PuntoMedicion, pid)
    if not p:
        raise HTTPException(status_code=404, detail="Punto no encontrado")
    if data.nombre is not None:
        nombre = data.nombre.strip()
        if not nombre:
            raise HTTPException(status_code=422, detail="El nombre es obligatorio")
        p.nombre = nombre
    if data.activo is not None:
        p.activo = data.activo
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{pid}", status_code=204)
def borrar(pid: int, _: models.Usuario = Depends(_admin), db: Session = Depends(get_db)):
    p = db.get(models.PuntoMedicion, pid)
    if p:
        db.delete(p)
        db.commit()
