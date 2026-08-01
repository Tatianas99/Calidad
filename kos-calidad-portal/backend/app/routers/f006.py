"""Endpoints del formato F-006 (Ruta control proceso vasos)."""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..auth import require_admin, get_current_user
from ..timeutil import now_co, fecha_fields

router = APIRouter(prefix="/f006", tags=["F-006 Vasos"])


def _get_registro(registro_id: str, db: Session) -> models.F006Registro:
    reg = db.get(models.F006Registro, registro_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return reg


@router.post("/registros", response_model=schemas.F006RegistroOut, status_code=201)
def crear_registro(
    data: schemas.F006RegistroCreate,
    user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crea la cabecera (producto): referencia, fecha, máquina, turno."""
    if data.id:  # idempotencia ante reintentos
        existing = db.get(models.F006Registro, data.id)
        if existing:
            return existing
    f, _ = fecha_fields(user.rol == "admin", data.fecha)
    kwargs = dict(
        orden_produccion=data.orden_produccion,
        referencia_id=data.referencia_id,
        marca=data.marca,
        altura_vaso=data.altura_vaso,
        diametro_superior=data.diametro_superior,
        diametro_inferior=data.diametro_inferior,
        grueso_rim=data.grueso_rim,
        fecha=f,
        maquina_id=data.maquina_id,
        maquina_texto=data.maquina_texto,
        # Auxiliar de calidad = persona en turno (usuario en sesión), automático.
        auxiliar_nombre=user.nombre,
        turno=data.turno,
    )
    if data.id:
        kwargs["id"] = data.id
    reg = models.F006Registro(**kwargs)
    db.add(reg)
    db.commit()
    db.refresh(reg)
    return reg


@router.get("/registros", response_model=list[schemas.F006RegistroOut])
def listar_registros(
    fecha: Optional[date] = None,
    turno: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.F006Registro)
    if fecha:
        q = q.filter(models.F006Registro.fecha == fecha)
    if turno:
        q = q.filter(models.F006Registro.turno == turno)
    return q.order_by(models.F006Registro.creado_en.desc()).all()


@router.get("/registros/{registro_id}", response_model=schemas.F006RegistroOut)
def obtener_registro(registro_id: str, db: Session = Depends(get_db)):
    return _get_registro(registro_id, db)


@router.put("/registros/{registro_id}", response_model=schemas.F006RegistroOut)
def actualizar_cabecera(
    registro_id: str, data: schemas.F006CabeceraUpdate,
    user: models.Usuario = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Actualiza la cabecera (referencia, fecha, máquina, turno) de un producto."""
    reg = _get_registro(registro_id, db)
    reg.orden_produccion = data.orden_produccion
    reg.referencia_id = data.referencia_id
    reg.marca = data.marca
    reg.maquina_texto = data.maquina_texto
    reg.altura_vaso = data.altura_vaso
    reg.diametro_superior = data.diametro_superior
    reg.diametro_inferior = data.diametro_inferior
    reg.grueso_rim = data.grueso_rim
    # La fecha solo la puede cambiar un admin (fecha manual); si no, se conserva.
    if data.fecha and user.rol == "admin":
        reg.fecha = data.fecha
    reg.maquina_id = data.maquina_id
    reg.turno = data.turno
    db.commit()
    db.refresh(reg)
    return reg


@router.put("/registros/{registro_id}/embalaje", response_model=schemas.F006RegistroOut)
def guardar_embalaje(
    registro_id: str, data: schemas.EmbalajeUpdate, db: Session = Depends(get_db)
):
    """Reemplaza el checklist de embalaje del registro."""
    reg = _get_registro(registro_id, db)
    reg.embalaje.clear()
    for it in data.items:
        reg.embalaje.append(models.F006Embalaje(item=it.item, resultado=it.resultado))
    db.commit()
    db.refresh(reg)
    return reg


@router.post(
    "/registros/{registro_id}/filtracion",
    response_model=schemas.FiltracionOut,
    status_code=201,
)
def agregar_filtracion(
    registro_id: str, data: schemas.FiltracionCreate, db: Session = Depends(get_db)
):
    """Agrega una prueba de filtración. La hora de montaje la fija el servidor."""
    _get_registro(registro_id, db)  # valida existencia
    if data.id:
        existing = db.get(models.F006Filtracion, data.id)
        if existing:
            return existing
    kwargs = dict(
        registro_id=registro_id,
        tipo_prueba=data.tipo_prueba,
        tipo_material=data.tipo_material,
        cantidad_muestra=data.cantidad_muestra,
        hora_montaje=now_co(),
        estado="en_proceso",
    )
    if data.id:
        kwargs["id"] = data.id
    f = models.F006Filtracion(**kwargs)
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


@router.patch("/filtracion/{filtracion_id}", response_model=schemas.FiltracionOut)
def registrar_resultado(
    filtracion_id: str, data: schemas.FiltracionResultado, db: Session = Depends(get_db)
):
    """Registra el resultado tras el tiempo de muestra (20 min): cumple / no cumple."""
    f = db.get(models.F006Filtracion, filtracion_id)
    if not f:
        raise HTTPException(status_code=404, detail="Prueba de filtración no encontrada")
    f.cantidad_cumple = data.cantidad_cumple
    f.cantidad_nocumple = data.cantidad_nocumple
    f.comentario = data.comentario
    f.hora_lectura = now_co()
    f.estado = "finalizada"
    db.commit()
    db.refresh(f)
    return f


@router.delete("/registros/{registro_id}", status_code=204)
def borrar_registro(
    registro_id: str,
    _admin: models.Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Borra un registro F-006 con su embalaje y filtraciones. Solo admin."""
    reg = db.get(models.F006Registro, registro_id)
    if not reg:
        return
    db.delete(reg)
    db.commit()


@router.put("/registros/{registro_id}/firmas", response_model=schemas.F006RegistroOut)
def guardar_firmas(
    registro_id: str, data: schemas.FirmasUpdate, db: Session = Depends(get_db)
):
    reg = _get_registro(registro_id, db)
    reg.auxiliar_id = data.auxiliar_id
    reg.operario_id = data.operario_id
    reg.empacador_id = data.empacador_id
    db.commit()
    db.refresh(reg)
    return reg
