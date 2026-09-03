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
class Mediciones(BaseModel):
    """Mediciones del producto (texto libre)."""
    altura_vaso: Optional[str] = None
    diametro_superior: Optional[str] = None
    diametro_inferior: Optional[str] = None
    grueso_rim: Optional[str] = None


class F006RegistroCreate(Mediciones):
    id: Optional[str] = None  # UUID generado en el cliente (idempotencia)
    orden_produccion: Optional[str] = None
    referencia_id: Optional[int] = None  # legacy
    referencia_texto: Optional[str] = None  # referencia traída de la OP
    marca: Optional[str] = None
    fecha: Optional[date] = None  # solo admin puede fijar fecha manual
    maquina_id: Optional[int] = None
    maquina_texto: Optional[str] = None
    turno: Optional[int] = Field(default=None, ge=1, le=3)  # automático por horario


class F006CabeceraUpdate(Mediciones):
    """Editar la cabecera de un producto ya creado."""
    orden_produccion: Optional[str] = None
    referencia_id: Optional[int] = None  # legacy
    referencia_texto: Optional[str] = None  # referencia traída de la OP
    marca: Optional[str] = None
    fecha: Optional[date] = None
    maquina_id: Optional[int] = None
    maquina_texto: Optional[str] = None
    turno: Optional[int] = Field(default=None, ge=1, le=3)  # automático por horario


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
    temp_90: Optional[str] = None  # café caliente: si|no

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
    goteo_vaso_tapa: Optional[str] = None  # C|NC|NA
    tapa_centrada: Optional[str] = None    # C|NC|NA
    comentario: Optional[str] = None


class FirmasUpdate(BaseModel):
    auxiliar_id: Optional[int] = None
    operario_id: Optional[int] = None
    operario_nombre: Optional[str] = None
    empacador_id: Optional[int] = None
    empacador_nombre: Optional[str] = None


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
    temp_90: Optional[str] = None
    hora_lectura: Optional[datetime] = None
    cantidad_cumple: Optional[int] = None
    cantidad_nocumple: Optional[int] = None
    goteo_vaso_tapa: Optional[str] = None
    tapa_centrada: Optional[str] = None
    comentario: Optional[str] = None
    estado: str
    model_config = ConfigDict(from_attributes=True)


class F006RegistroOut(Mediciones):
    id: str
    orden_produccion: Optional[str] = None
    referencia_id: Optional[int] = None
    referencia_texto: Optional[str] = None
    marca: Optional[str] = None
    fecha: date
    maquina_id: Optional[int] = None
    maquina_texto: Optional[str] = None
    turno: int
    auxiliar_id: Optional[int] = None
    auxiliar_nombre: Optional[str] = None
    operario_id: Optional[int] = None
    operario_nombre: Optional[str] = None
    empacador_id: Optional[int] = None
    empacador_nombre: Optional[str] = None
    registrado_por_id: Optional[int] = None
    creado_en: datetime
    embalaje: List[EmbalajeOut] = []
    filtraciones: List[FiltracionOut] = []
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- #
# F-015 — Medición de cloro y PH del agua
# --------------------------------------------------------------------------- #
class F015MedicionCreate(BaseModel):
    id: Optional[str] = None
    fecha: Optional[date] = None  # solo admin puede fijar fecha manual
    fecha_hora: Optional[datetime] = None  # si no se envía, la fija el servidor
    punto_medicion_id: Optional[int] = None
    punto_texto: Optional[str] = None  # punto (buscar/escribir)
    ph: float = Field(ge=0, le=14)
    cloro: float = Field(ge=0)
    responsable_id: Optional[int] = None
    comentario: Optional[str] = None


class F015MedicionOut(BaseModel):
    id: str
    fecha_hora: datetime
    punto_medicion_id: Optional[int] = None
    punto_texto: Optional[str] = None
    ph: float
    cloro: float
    responsable_id: Optional[int] = None
    responsable_nombre: Optional[str] = None
    ph_en_rango: bool
    cloro_en_rango: bool
    comentario: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- #
# F-158 — Rutas Calidad
# --------------------------------------------------------------------------- #
class F158ItemIn(BaseModel):
    campo_key: str
    campo_label: str
    tipo: str
    valor: Optional[str] = None
    ref_id: Optional[int] = None
    marca: Optional[str] = None


class F158ItemOut(F158ItemIn):
    model_config = ConfigDict(from_attributes=True)


class F158AdjuntoOut(BaseModel):
    id: int
    nombre: str
    tipo: str
    url: str = ""  # se completa en el router con la ruta pública
    model_config = ConfigDict(from_attributes=True)


class F158RecorridoCreate(BaseModel):
    id: Optional[str] = None  # UUID del cliente (idempotencia)
    fecha: Optional[date] = None  # solo admin puede fijar fecha manual
    proceso: str
    maquina: Optional[str] = None
    observaciones: Optional[str] = None
    items: List[F158ItemIn] = []


class F158RecorridoUpdate(BaseModel):
    maquina: Optional[str] = None
    observaciones: Optional[str] = None
    items: List[F158ItemIn] = []


class F158RecorridoOut(BaseModel):
    id: str
    proceso: str
    maquina: Optional[str] = None
    responsable_id: Optional[int] = None
    responsable_nombre: Optional[str] = None
    fecha: date
    fecha_hora: datetime
    observaciones: Optional[str] = None
    creado_en: datetime
    actualizado_en: Optional[datetime] = None
    items: List[F158ItemOut] = []
    adjuntos: List[F158AdjuntoOut] = []
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- #
# F-204 — Entrega de producto por turno
# --------------------------------------------------------------------------- #
class F204RegistroCreate(BaseModel):
    id: Optional[str] = None  # UUID del cliente (idempotencia)
    fecha: Optional[date] = None  # solo admin puede fijar fecha manual
    turno: int = Field(ge=1, le=3)
    orden_produccion: Optional[str] = None
    maquina_id: Optional[int] = None
    maquina_texto: Optional[str] = None
    referencia_id: Optional[int] = None  # legacy
    referencia_texto: Optional[str] = None  # referencia traída de la OP
    marca: Optional[str] = None
    cantidad_clase_b: Optional[int] = Field(default=None, ge=0)
    verificacion_desperdicio: Optional[str] = None  # C|NC|NA
    entregado_por_id: Optional[int] = None
    entregado_por_nombre: Optional[str] = None  # buscar o escribir
    observaciones: Optional[str] = None


class F204RegistroOut(BaseModel):
    id: str
    fecha: date
    fecha_hora: datetime
    turno: int
    orden_produccion: Optional[str] = None
    maquina_id: Optional[int] = None
    maquina_texto: Optional[str] = None
    referencia_id: Optional[int] = None
    referencia_texto: Optional[str] = None
    marca: Optional[str] = None
    cantidad_clase_b: Optional[int] = None
    verificacion_desperdicio: Optional[str] = None
    entregado_por_id: Optional[int] = None
    entregado_por_nombre: Optional[str] = None
    recibido_por_id: Optional[int] = None
    recibido_por_nombre: Optional[str] = None
    observaciones: Optional[str] = None
    creado_en: datetime
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- #
# F-005 — Liberación de rollos
# --------------------------------------------------------------------------- #
class F005RegistroBase(BaseModel):
    proceso: Optional[str] = None
    maquina: Optional[str] = None
    lote: str
    material: Optional[str] = None
    ancho: Optional[str] = None
    calibre: Optional[str] = None
    kg: Optional[str] = None
    estado_dinas: Optional[str] = None
    estado_alcohol: Optional[str] = None
    estado_lapiz: Optional[str] = None
    estado_armado: Optional[str] = None
    estado_inocuidad: Optional[str] = None
    proveedor: Optional[str] = None
    observaciones: Optional[str] = None


class F005RegistroCreate(F005RegistroBase):
    id: Optional[str] = None  # UUID del cliente (idempotencia)
    fecha: Optional[date] = None  # solo admin puede fijar fecha manual


class F005RegistroOut(F005RegistroBase):
    id: str
    fecha: date
    fecha_hora: datetime
    responsable_id: Optional[int] = None
    responsable_nombre: Optional[str] = None
    creado_en: datetime
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
    username: Optional[str] = None
    nombre: Optional[str] = None
    rol: Optional[str] = None
    permisos: Optional[List[str]] = None
    activo: Optional[bool] = None


class PasswordIn(BaseModel):
    password: str = Field(min_length=4)


# --------------------------------------------------------------------------- #
# Proveedores de papel (configuración)
# --------------------------------------------------------------------------- #
class ProveedorPapelOut(BaseModel):
    id: int
    nombre: str
    activo: bool
    model_config = ConfigDict(from_attributes=True)


class ProveedorPapelCreate(BaseModel):
    nombre: str


class ProveedorPapelUpdate(BaseModel):
    nombre: Optional[str] = None
    activo: Optional[bool] = None


# Puntos de medición (configuración F-015)
class PuntoMedicionAdminOut(BaseModel):
    id: int
    nombre: str
    activo: bool
    model_config = ConfigDict(from_attributes=True)


class PuntoMedicionCreate(BaseModel):
    nombre: str


class PuntoMedicionUpdate(BaseModel):
    nombre: Optional[str] = None
    activo: Optional[bool] = None


# Horarios de turnos (configuración)
class TurnoHorarioItem(BaseModel):
    dia_semana: int = Field(ge=0, le=6)   # 0=lunes … 6=domingo
    turno: int = Field(ge=1, le=3)
    inicio: str                            # "HH:MM"
    fin: str                               # "HH:MM"


class TurnosUpdate(BaseModel):
    horarios: List[TurnoHorarioItem] = []
