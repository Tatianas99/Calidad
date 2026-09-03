"""Modelos ORM del portal de calidad (piloto: catálogos + F-006 + F-015)."""
import uuid
from datetime import datetime, date, time
from typing import Optional, List

from sqlalchemy import String, Integer, Boolean, Date, DateTime, Float, ForeignKey, Time
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
    # Id de la fila de origen en kos_apps.personal_planta (clave única y estable
    # de esa tabla). Es la clave que usa la sincronización para hacer upsert sin
    # duplicar; la cédula NO se usa porque en personal_planta hay cédulas
    # repetidas (registros de prueba/placeholder). Nulo en personas creadas a mano.
    origen_id: Mapped[Optional[int]] = mapped_column(Integer, index=True)
    cedula: Mapped[Optional[str]] = mapped_column(String(20))  # informativa
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Maquina(Base):
    __tablename__ = "maquinas"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(80), nullable=False)
    area: Mapped[Optional[str]] = mapped_column(String(60))
    # Id de la fila de origen en kos_apps.dbo.maquinas (clave de sincronización).
    origen_id: Mapped[Optional[int]] = mapped_column(Integer, index=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Referencia(Base):
    __tablename__ = "referencias"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    codigo: Mapped[str] = mapped_column(String(60), nullable=False)
    descripcion: Mapped[Optional[str]] = mapped_column(String(160))
    tipo_producto: Mapped[Optional[str]] = mapped_column(String(40))  # vaso|tazon|tapa_papel|tapa_plastica
    # Id de la fila de origen en dbo.PQRS_Referencias (clave de sincronización).
    origen_id: Mapped[Optional[int]] = mapped_column(Integer, index=True)
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


class TurnoHorario(Base):
    """Horario de un turno para un día de la semana (0=lunes … 6=domingo).

    Sirve para derivar automáticamente el turno de F-005 y F-158 según la hora
    del registro. Una fila por (día, turno) con horario definido.
    """
    __tablename__ = "turno_horario"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dia_semana: Mapped[int] = mapped_column(Integer, nullable=False)  # 0=lunes … 6=domingo
    turno: Mapped[int] = mapped_column(Integer, nullable=False)       # 1, 2, 3
    hora_inicio: Mapped[time] = mapped_column(Time, nullable=False)
    hora_fin: Mapped[time] = mapped_column(Time, nullable=False)


class ProveedorPapel(Base):
    __tablename__ = "proveedores_papel"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=now_co)


# --------------------------------------------------------------------------- #
# F-006 — Ruta control proceso vasos
# --------------------------------------------------------------------------- #
class F006Registro(Base):
    __tablename__ = "f006_registro"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    orden_produccion: Mapped[Optional[str]] = mapped_column(String(40))  # OP (texto)
    referencia_id: Mapped[Optional[int]] = mapped_column(ForeignKey("referencias.id"))  # legacy
    referencia_texto: Mapped[Optional[str]] = mapped_column(String(200))  # referencia traída de la OP
    marca: Mapped[Optional[str]] = mapped_column(String(80))  # texto libre (marca del producto)
    # Mediciones del producto (texto libre; el operario las escribe con su unidad).
    altura_vaso: Mapped[Optional[str]] = mapped_column(String(40))
    diametro_superior: Mapped[Optional[str]] = mapped_column(String(40))
    diametro_inferior: Mapped[Optional[str]] = mapped_column(String(40))
    grueso_rim: Mapped[Optional[str]] = mapped_column(String(40))
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    maquina_id: Mapped[Optional[int]] = mapped_column(ForeignKey("maquinas.id"))  # legacy
    maquina_texto: Mapped[Optional[str]] = mapped_column(String(80))  # máquina (buscar/escribir)
    turno: Mapped[int] = mapped_column(Integer, nullable=False)
    auxiliar_id: Mapped[Optional[int]] = mapped_column(ForeignKey("personas.id"))
    auxiliar_nombre: Mapped[Optional[str]] = mapped_column(String(120))  # auto = usuario en turno
    operario_id: Mapped[Optional[int]] = mapped_column(ForeignKey("personas.id"))  # legacy
    operario_nombre: Mapped[Optional[str]] = mapped_column(String(120))  # buscar o escribir
    empacador_id: Mapped[Optional[int]] = mapped_column(ForeignKey("personas.id"))  # legacy
    empacador_nombre: Mapped[Optional[str]] = mapped_column(String(120))  # buscar o escribir
    # Usuario que registró (para "recuperar finalizados" solo del propio usuario).
    registrado_por_id: Mapped[Optional[int]] = mapped_column(Integer)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=now_co)

    referencia: Mapped[Optional["Referencia"]] = relationship()
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
    temp_90: Mapped[Optional[str]] = mapped_column(String(4))  # café caliente: si|no (¿90°C?)
    hora_lectura: Mapped[Optional[datetime]] = mapped_column(DateTime)
    cantidad_cumple: Mapped[Optional[int]] = mapped_column(Integer)     # no filtra
    cantidad_nocumple: Mapped[Optional[int]] = mapped_column(Integer)   # filtra
    goteo_vaso_tapa: Mapped[Optional[str]] = mapped_column(String(4))   # C|NC|NA (por prueba)
    tapa_centrada: Mapped[Optional[str]] = mapped_column(String(4))     # C|NC|NA (por prueba)
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
    punto_medicion_id: Mapped[Optional[int]] = mapped_column(ForeignKey("puntos_medicion.id"))  # legacy
    punto_texto: Mapped[Optional[str]] = mapped_column(String(120))  # punto (buscar/escribir)
    ph: Mapped[float] = mapped_column(Float, nullable=False)
    cloro: Mapped[float] = mapped_column(Float, nullable=False)
    responsable_id: Mapped[Optional[int]] = mapped_column(ForeignKey("personas.id"))  # legacy
    responsable_nombre: Mapped[Optional[str]] = mapped_column(String(120))  # auto = usuario en sesión
    ph_en_rango: Mapped[bool] = mapped_column(Boolean, nullable=False)
    cloro_en_rango: Mapped[bool] = mapped_column(Boolean, nullable=False)
    comentario: Mapped[Optional[str]] = mapped_column(String(4000))

    punto: Mapped["PuntoMedicion"] = relationship()
    responsable: Mapped[Optional["Persona"]] = relationship()


# --------------------------------------------------------------------------- #
# F-158 — Rutas Calidad (recorridos de los auxiliares por proceso)
# --------------------------------------------------------------------------- #
class F158Recorrido(Base):
    __tablename__ = "f158_recorrido"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    proceso: Mapped[str] = mapped_column(String(30), nullable=False)  # slitter|flexo|…
    maquina: Mapped[Optional[str]] = mapped_column(String(60))
    # Responsable = usuario que inició sesión (id + nombre en el momento del registro).
    responsable_id: Mapped[Optional[int]] = mapped_column(Integer, index=True)
    responsable_nombre: Mapped[Optional[str]] = mapped_column(String(120))
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_hora: Mapped[datetime] = mapped_column(DateTime, default=now_co)
    observaciones: Mapped[Optional[str]] = mapped_column(String(4000))
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=now_co)
    actualizado_en: Mapped[Optional[datetime]] = mapped_column(DateTime)

    items: Mapped[List["F158Item"]] = relationship(
        back_populates="recorrido", cascade="all, delete-orphan"
    )
    adjuntos: Mapped[List["F158Adjunto"]] = relationship(
        back_populates="recorrido", cascade="all, delete-orphan"
    )


class F158Item(Base):
    __tablename__ = "f158_item"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    recorrido_id: Mapped[str] = mapped_column(ForeignKey("f158_recorrido.id"), nullable=False)
    campo_key: Mapped[str] = mapped_column(String(40), nullable=False)
    campo_label: Mapped[str] = mapped_column(String(120), nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)  # texto|cncna|opciones|referencia
    valor: Mapped[Optional[str]] = mapped_column(String(400))       # texto a mostrar/filtrar
    ref_id: Mapped[Optional[int]] = mapped_column(Integer)          # solo tipo referencia
    marca: Mapped[Optional[str]] = mapped_column(String(80))        # solo tipo referencia

    recorrido: Mapped["F158Recorrido"] = relationship(back_populates="items")


class F158Adjunto(Base):
    __tablename__ = "f158_adjunto"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    recorrido_id: Mapped[str] = mapped_column(ForeignKey("f158_recorrido.id"), nullable=False)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)   # image|video
    ruta: Mapped[str] = mapped_column(String(300), nullable=False)  # ruta relativa en disco
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=now_co)

    recorrido: Mapped["F158Recorrido"] = relationship(back_populates="adjuntos")


# --------------------------------------------------------------------------- #
# F-204 — Entrega de producto por turno (clase B / verificación de desperdicio)
# --------------------------------------------------------------------------- #
class F204Registro(Base):
    __tablename__ = "f204_registro"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_hora: Mapped[datetime] = mapped_column(DateTime, default=now_co)
    turno: Mapped[int] = mapped_column(Integer, nullable=False)
    orden_produccion: Mapped[Optional[str]] = mapped_column(String(40))  # OP (junto a máquina)
    maquina_id: Mapped[Optional[int]] = mapped_column(ForeignKey("maquinas.id"))  # legacy
    maquina_texto: Mapped[Optional[str]] = mapped_column(String(80))  # máquina (buscar/escribir)
    referencia_id: Mapped[Optional[int]] = mapped_column(ForeignKey("referencias.id"))  # legacy
    referencia_texto: Mapped[Optional[str]] = mapped_column(String(200))  # referencia traída de la OP
    marca: Mapped[Optional[str]] = mapped_column(String(80))
    cantidad_clase_b: Mapped[Optional[int]] = mapped_column(Integer)
    verificacion_desperdicio: Mapped[Optional[str]] = mapped_column(String(4))  # C|NC|NA
    # Entregado por: operario seleccionado del catálogo (id + nombre snapshot).
    entregado_por_id: Mapped[Optional[int]] = mapped_column(ForeignKey("personas.id"))
    entregado_por_nombre: Mapped[Optional[str]] = mapped_column(String(120))
    # Recibido por: usuario que registró (sesión).
    recibido_por_id: Mapped[Optional[int]] = mapped_column(Integer)
    recibido_por_nombre: Mapped[Optional[str]] = mapped_column(String(120))
    observaciones: Mapped[Optional[str]] = mapped_column(String(4000))
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=now_co)

    maquina: Mapped["Maquina"] = relationship()
    referencia: Mapped[Optional["Referencia"]] = relationship()
    entregado_por: Mapped[Optional["Persona"]] = relationship()


# --------------------------------------------------------------------------- #
# F-005 — Liberación de rollos
# --------------------------------------------------------------------------- #
class F005Registro(Base):
    __tablename__ = "f005_registro"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_hora: Mapped[datetime] = mapped_column(DateTime, default=now_co)
    proceso: Mapped[Optional[str]] = mapped_column(String(30))    # slitter|flexo|troquelado
    maquina: Mapped[Optional[str]] = mapped_column(String(60))
    lote: Mapped[str] = mapped_column(String(80), nullable=False)
    material: Mapped[Optional[str]] = mapped_column(String(20))   # opciones F-158
    ancho: Mapped[Optional[str]] = mapped_column(String(40))      # manual
    calibre: Mapped[Optional[str]] = mapped_column(String(40))    # opciones F-158 (u "otro")
    kg: Mapped[Optional[str]] = mapped_column(String(40))         # manual
    # Estado (checklist C|NC|N/A)
    estado_dinas: Mapped[Optional[str]] = mapped_column(String(4))
    estado_alcohol: Mapped[Optional[str]] = mapped_column(String(4))
    estado_lapiz: Mapped[Optional[str]] = mapped_column(String(4))
    estado_armado: Mapped[Optional[str]] = mapped_column(String(4))
    estado_inocuidad: Mapped[Optional[str]] = mapped_column(String(4))
    proveedor: Mapped[Optional[str]] = mapped_column(String(120))
    observaciones: Mapped[Optional[str]] = mapped_column(String(4000))
    # Responsable = usuario en sesión (id + nombre snapshot).
    responsable_id: Mapped[Optional[int]] = mapped_column(Integer, index=True)
    responsable_nombre: Mapped[Optional[str]] = mapped_column(String(120))
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=now_co)
