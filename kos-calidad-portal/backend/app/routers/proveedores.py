"""Gestión de proveedores de papel (configuración). Solo admin (gestionar_usuarios)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..auth import require

router = APIRouter(prefix="/proveedores-papel", tags=["Proveedores papel"])

_admin = require("gestionar_catalogos")


@router.get("", response_model=list[schemas.ProveedorPapelOut])
def listar(_: models.Usuario = Depends(_admin), db: Session = Depends(get_db)):
    return db.query(models.ProveedorPapel).order_by(models.ProveedorPapel.nombre).all()


@router.post("", response_model=schemas.ProveedorPapelOut, status_code=201)
def crear(data: schemas.ProveedorPapelCreate, _: models.Usuario = Depends(_admin), db: Session = Depends(get_db)):
    nombre = data.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=422, detail="El nombre es obligatorio")
    if db.query(models.ProveedorPapel).filter(models.ProveedorPapel.nombre == nombre).first():
        raise HTTPException(status_code=409, detail="Ese proveedor ya existe")
    p = models.ProveedorPapel(nombre=nombre, activo=True)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.put("/{pid}", response_model=schemas.ProveedorPapelOut)
def actualizar(pid: int, data: schemas.ProveedorPapelUpdate, _: models.Usuario = Depends(_admin), db: Session = Depends(get_db)):
    p = db.get(models.ProveedorPapel, pid)
    if not p:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
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
    p = db.get(models.ProveedorPapel, pid)
    if p:
        db.delete(p)
        db.commit()
