"""Schemas Pydantic (validación de entrada/salida de la API)."""
from datetime import date, datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .constants import EMBALAJE_KEYS, TIPOS_PRUEBA_KEYS, TIPOS_MATERIAL_KEYS, RESULTADOS


# --------------------------------------------------------------------------- #
# Catálogos
# --------------------------------------------------------------------------- #
class PersonaOut(BaseModel):
    id: int
    nombre: str
    rol: str
    model_config = ConfigDict(from_attributes=True)


class MaquinaOut(BaseModel):
    id: int
    nombre: str
    area: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class ReferenciaOut(BaseModel):
    id: int
    codigo: str
    descripcion: Optional[str] = None
    tipo_producto: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class PuntoMedicionOut(BaseModel):
    id: int
    nombre: str
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- #
# F-006 — Ruta control proceso vasos
# --------------------------------------------------------------------------- #
class F006RegistroCreate(BaseModel):
    id: Optional[str] = None  # UUID generado en el cliente (idempotencia)
    referencia_id: int
    fecha: date
    maquina_id: int
    turno: int = Field(ge=1, le=3)


class F006CabeceraUpdate(BaseModel):
    """Editar la cabecera de un producto ya creado."""
    referencia_id: int
    fecha: date
    maquina_id: int
    turno: int = Field(ge=1, le=3)


class EmbalajeItemIn(BaseModel):
    item: str
    resultado: str

    @field_validator("item")
    @classmethod
    def _val_item(cls, v):
        if v not in EMBALAJE_KEYS:
            raise ValueError(f"Ítem de embalaje inválido: {v}")
        return v

    @field_validator("resultado")
    @classmethod
    def _val_resultado(cls, v):
        if v not in RESULTADOS:
            raise ValueError(f"Resultado inválido: {v} (use C, NC o N/A)")
        return v


class EmbalajeUpdate(BaseModel):
    items: List[EmbalajeItemIn]


class FiltracionCreate(BaseModel):
    id: Optional[str] = None  # UUID generado en el cliente (idempotencia)
    tipo_prueba: str
    tipo_material: str
    cantidad_muestra: int = Field(ge=0)

    @field_validator("tipo_prueba")
    @classmethod
    def _val_prueba(cls, v):
        if v not in TIPOS_PRUEBA_KEYS:
            raise ValueError(f"Tipo de prueba inválido: {v}")
        return v

    @field_validator("tipo_material")
    @classmethod
    def _val_material(cls, v):
        if v not in TIPOS_MATERIAL_KEYS:
            raise ValueError(f"Tipo de material inválido: {v}")
        return v


class FiltracionResultado(BaseModel):
    cantidad_cumple: int = Field(ge=0)     # no filtra
    cantidad_nocumple: int = Field(ge=0)   # filtra
    comentario: Optional[str] = None


class FirmasUpdate(BaseModel):
    auxiliar_id: Optional[int] = None
    operario_id: Optional[int] = None
    empacador_id: Optional[int] = None


class EmbalajeOut(BaseModel):
    item: str
    resultado: str
    model_config = ConfigDict(from_attributes=True)


class FiltracionOut(BaseModel):
    id: str
    hora_montaje: datetime
    tipo_prueba: str
    tipo_material: str
    cantidad_muestra: int
    hora_lectura: Optional[datetime] = None
    cantidad_cumple: Optional[int] = None
    cantidad_nocumple: Optional[int] = None
    comentario: Optional[str] = None
    estado: str
    model_config = ConfigDict(from_attributes=True)


class F006RegistroOut(BaseModel):
    id: str
    referencia_id: int
    fecha: date
    maquina_id: int
    turno: int
    auxiliar_id: Optional[int] = None
    operario_id: Optional[int] = None
    empacador_id: Optional[int] = None
    creado_en: datetime
    embalaje: List[EmbalajeOut] = []
    filtraciones: List[FiltracionOut] = []
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- #
# F-015 — Medición de cloro y PH del agua
# --------------------------------------------------------------------------- #
class F015MedicionCreate(BaseModel):
    id: Optional[str] = None
    fecha_hora: Optional[datetime] = None  # si no se envía, la fija el servidor
    punto_medicion_id: int
    ph: float = Field(ge=0, le=14)
    cloro: float = Field(ge=0)
    responsable_id: Optional[int] = None
    comentario: Optional[str] = None


class F015MedicionOut(BaseModel):
    id: str
    fecha_hora: datetime
    punto_medicion_id: int
    ph: float
    cloro: float
    responsable_id: Optional[int] = None
    ph_en_rango: bool
    cloro_en_rango: bool
    comentario: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- #
# Autenticación y usuarios
# --------------------------------------------------------------------------- #
class LoginIn(BaseModel):
    username: str
    password: str


class UsuarioOut(BaseModel):
    id: int
    username: str
    nombre: str
    rol: str
    permisos: List[str] = []
    activo: bool
    model_config = ConfigDict(from_attributes=True)


class LoginOut(BaseModel):
    token: str
    usuario: UsuarioOut


class UsuarioCreate(BaseModel):
    username: str
    nombre: str
    password: str = Field(min_length=4)
    rol: str = "operario"
    permisos: List[str] = []


class UsuarioUpdate(BaseModel):
    nombre: Optional[str] = None
    rol: Optional[str] = None
    permisos: Optional[List[str]] = None
    activo: Optional[bool] = None


class PasswordIn(BaseModel):
    password: str = Field(min_length=4)
