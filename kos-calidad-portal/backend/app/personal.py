"""Sincronización del catálogo de personas desde kos_apps.personal_planta.

El portal de calidad guarda sus registros (F-006, F-015) referenciando la tabla
local `personas` mediante llaves foráneas. La lista real de personal la
administra otra aplicación en la base `kos_apps` (tabla `dbo.personal_planta`),
en el mismo servidor SQL y con las mismas credenciales.

Azure SQL no permite consultas entre bases distintas, así que en lugar de leer
`personal_planta` en cada consulta, mantenemos `personas` como un *espejo*: una
sincronización lee `personal_planta` y hace upsert en `personas` usando la
cédula como clave natural. Así todo lo existente (FKs, relaciones, reportes
Excel, cola offline del frontend) sigue funcionando sin cambios, y el portal
sigue operando aunque `kos_apps` esté momentáneamente inaccesible.
"""
from __future__ import annotations

import logging

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from .config import DATA_DATABASE_URL
from .constants import CARGO_ROL_MAP, ROL_POR_DEFECTO
from . import models

log = logging.getLogger("personal_sync")

# Engine perezoso hacia kos_apps (se crea una sola vez, al primer uso).
_data_engine = None


def _get_data_engine():
    global _data_engine
    if DATA_DATABASE_URL is None:
        return None
    if _data_engine is None:
        # use_setinputsizes=False por el driver ODBC legacy 'SQL Server' (igual
        # que la conexión principal del portal, ver db.py).
        _data_engine = create_engine(
            DATA_DATABASE_URL,
            pool_pre_ping=True,
            future=True,
            use_setinputsizes=False,
        )
    return _data_engine


def fetch_personal_planta() -> list[dict]:
    """Lee el personal de planta desde kos_apps. Devuelve [] si no hay fuente.

    Cada elemento: {origen_id:int, cedula:str|None, nombre:str, rol:str, activo:bool}.
    """
    engine = _get_data_engine()
    if engine is None:
        return []
    filas: list[dict] = []
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                # nombre_operario es tipo TEXT -> CAST a NVARCHAR para poder
                # ordenarlo/manejarlo sin problemas con el driver.
                "SELECT Id, CAST(nombre_operario AS NVARCHAR(200)) AS nombre, "
                "cedula, estado, cargo FROM dbo.personal_planta"
            )
        )
        for r in rows:
            nombre = (r.nombre or "").strip()
            if not nombre:
                continue
            filas.append({
                "origen_id": int(r.Id),
                "cedula": str(r.cedula) if r.cedula is not None else None,
                "nombre": nombre[:120],
                "rol": CARGO_ROL_MAP.get(r.cargo, ROL_POR_DEFECTO),
                "activo": bool(r.estado),
            })
    return filas


def sync_personas(db: Session) -> dict:
    """Sincroniza `personas` con `personal_planta`. Devuelve un resumen.

    - Alta/actualización por `origen_id` (= personal_planta.Id), que es la clave
      única y estable de esa tabla. NO se usa la cédula como clave porque en
      personal_planta hay cédulas repetidas (registros de prueba).
    - Personas provenientes de personal_planta que ya no estén activas o hayan
      desaparecido se marcan como inactivas (nunca se borran: los registros
      históricos deben poder seguir resolviendo el nombre).
    - Personas de ejemplo/legacy sin `origen_id` se desactivan para que los
      desplegables solo muestren personal de planta vigente.
    """
    filas = fetch_personal_planta()
    if not filas:
        log.info("Sin datos de personal_planta (fuente no configurada o vacía); no se sincroniza.")
        return {"disponible": False, "creados": 0, "actualizados": 0, "desactivados": 0, "total": 0}

    # Índice de personas locales ya enlazadas a personal_planta.
    existentes = {
        p.origen_id: p
        for p in db.query(models.Persona).filter(models.Persona.origen_id.isnot(None)).all()
    }

    creados = actualizados = 0
    origenes_vistos = set()

    for f in filas:
        oid = f["origen_id"]
        origenes_vistos.add(oid)
        p = existentes.get(oid)
        if p is None:
            db.add(models.Persona(
                nombre=f["nombre"], rol=f["rol"], origen_id=oid,
                cedula=f["cedula"], activo=f["activo"],
            ))
            creados += 1
        else:
            cambio = (
                p.nombre != f["nombre"] or p.rol != f["rol"]
                or p.activo != f["activo"] or p.cedula != f["cedula"]
            )
            if cambio:
                p.nombre = f["nombre"]
                p.rol = f["rol"]
                p.cedula = f["cedula"]
                p.activo = f["activo"]
                actualizados += 1

    # Desactivar las que provienen de personal_planta pero ya no aparecen en esta
    # corrida, y las de ejemplo/legacy sin origen_id, para que los desplegables
    # solo muestren personal de planta vigente.
    desactivados = 0
    for p in db.query(models.Persona).filter(models.Persona.activo == True).all():  # noqa: E712
        if p.origen_id is None or p.origen_id not in origenes_vistos:
            p.activo = False
            desactivados += 1

    db.commit()
    resumen = {
        "disponible": True,
        "creados": creados,
        "actualizados": actualizados,
        "desactivados": desactivados,
        "total": len(origenes_vistos),
    }
    log.info("Sincronización personal_planta: %s", resumen)
    return resumen
