"""Endpoints de autenticación: login y usuario actual."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..auth import verify_password, create_token, get_current_user, usuario_public

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.post("/login", response_model=schemas.LoginOut)
def login(data: schemas.LoginIn, db: Session = Depends(get_db)):
    user = db.query(models.Usuario).filter(models.Usuario.username == data.username).first()
    if not user or not user.activo or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    token = create_token(user.id)
    return schemas.LoginOut(token=token, usuario=schemas.UsuarioOut(**usuario_public(user)))


@router.get("/me", response_model=schemas.UsuarioOut)
def me(user: models.Usuario = Depends(get_current_user)):
    return schemas.UsuarioOut(**usuario_public(user))
