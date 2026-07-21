"""Modelos ORM del portal de calidad (piloto: catálogos + F-006 + F-015)."""
import uuid
from datetime import datetime, date
from typing import Optional, List

from sqlalchemy import String, Integer, Boolean, Date, DateTime, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base
from .timeutil import now_co


def _uuid() -> str:
    return str(uuid.uuid4())


# --------------------------------------------------------------------------- #
# Catálogos (compartidos por todos los formatos)
# --------------------------------------------------------------------------- #
class Persona(Base):
    __tablename__ = "personas"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    rol: Mapped[str] = mapped_column(String(30), nullable=False)  # auxiliar|operario|empacador|responsable
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Maquina(Base):
    __tablename__ = "maquinas"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(80), nullable=False)
    area: Mapped[Optional[str]] = mapped_column(String(60))
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Referencia(Base):
    __tablename__ = "referencias"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    codigo: Mapped[str] = mapped_column(String(60), nullable=False)
    descripcion: Mapped[Optional[str]] = mapped_column(String(160))
    tipo_producto: Mapped[Optional[str]] = mapped_column(String(40))  # vaso|tazon|tapa_papel|tapa_plastica
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class PuntoMedicion(Base):
    __tablename__ = "puntos_medicion"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Usuario(Base):
    __tablename__ = "usuarios"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(60), nullable=False, unique=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(220), nullable=False)
    rol: Mapped[str] = mapped_column(String(20), default="operario")  # admin|calidad|operario
    permisos: Mapped[str] = mapped_column(String(400), default="[]")  # lista JSON de permisos
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=now_co)


# --------------------------------------------------------------------------- #
# F-006 — Ruta control proceso vasos
# --------------------------------------------------------------------------- #
class F006Registro(Base):
    __tablename__ = "f006_registro"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    referencia_id: Mapped[int] = mapped_column(ForeignKey("referencias.id"), nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    maquina_id: Mapped[int] = mapped_column(ForeignKey("maquinas.id"), nullable=False)
    turno: Mapped[int] = mapped_column(Integer, nullable=False)
    auxiliar_id: Mapped[Optional[int]] = mapped_column(ForeignKey("personas.id"))
    operario_id: Mapped[Optional[int]] = mapped_column(ForeignKey("personas.id"))
    empacador_id: Mapped[Optional[int]] = mapped_column(ForeignKey("personas.id"))
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=now_co)

    referencia: Mapped["Referencia"] = relationship()
    maquina: Mapped["Maquina"] = relationship()
    auxiliar: Mapped[Optional["Persona"]] = relationship(foreign_keys=[auxiliar_id])
    operario: Mapped[Optional["Persona"]] = relationship(foreign_keys=[operario_id])
    empacador: Mapped[Optional["Persona"]] = relationship(foreign_keys=[empacador_id])
    embalaje: Mapped[List["F006Embalaje"]] = relationship(
        back_populates="registro", cascade="all, delete-orphan"
    )
    filtraciones: Mapped[List["F006Filtracion"]] = relationship(
        back_populates="registro", cascade="all, delete-orphan"
    )


class F006Embalaje(Base):
    __tablename__ = "f006_embalaje"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    registro_id: Mapped[str] = mapped_column(ForeignKey("f006_registro.id"), nullable=False)
    item: Mapped[str] = mapped_column(String(40), nullable=False)
    resultado: Mapped[str] = mapped_column(String(4), nullable=False)  # C|NC|N/A

    registro: Mapped["F006Registro"] = relationship(back_populates="embalaje")


class F006Filtracion(Base):
    __tablename__ = "f006_filtracion"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    registro_id: Mapped[str] = mapped_column(ForeignKey("f006_registro.id"), nullable=False)
    hora_montaje: Mapped[datetime] = mapped_column(DateTime, default=now_co)
    tipo_prueba: Mapped[str] = mapped_column(String(30), nullable=False)
    tipo_material: Mapped[str] = mapped_column(String(20), nullable=False)
    cantidad_muestra: Mapped[int] = mapped_column(Integer, nullable=False)
    hora_lectura: Mapped[Optional[datetime]] = mapped_column(DateTime)
    cantidad_cumple: Mapped[Optional[int]] = mapped_column(Integer)     # no filtra
    cantidad_nocumple: Mapped[Optional[int]] = mapped_column(Integer)   # filtra
    comentario: Mapped[Optional[str]] = mapped_column(String(4000))
    estado: Mapped[str] = mapped_column(String(15), default="en_proceso")  # en_proceso|finalizada

    registro: Mapped["F006Registro"] = relationship(back_populates="filtraciones")


# --------------------------------------------------------------------------- #
# F-015 — Medición de cloro y PH del agua
# --------------------------------------------------------------------------- #
class F015Medicion(Base):
    __tablename__ = "f015_medicion"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    fecha_hora: Mapped[datetime] = mapped_column(DateTime, default=now_co)
    punto_medicion_id: Mapped[int] = mapped_column(ForeignKey("puntos_medicion.id"), nullable=False)
    ph: Mapped[float] = mapped_column(Float, nullable=False)
    cloro: Mapped[float] = mapped_column(Float, nullable=False)
    responsable_id: Mapped[Optional[int]] = mapped_column(ForeignKey("personas.id"))
    ph_en_rango: Mapped[bool] = mapped_column(Boolean, nullable=False)
    cloro_en_rango: Mapped[bool] = mapped_column(Boolean, nullable=False)
    comentario: Mapped[Optional[str]] = mapped_column(String(4000))

    punto: Mapped["PuntoMedicion"] = relationship()
    responsable: Mapped[Optional["Persona"]] = relationship()
