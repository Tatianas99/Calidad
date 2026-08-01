"""Sincronización del catálogo de máquinas desde kos_apps.dbo.maquinas.

Igual que las personas (personal_planta) y las referencias (PQRS_Referencias),
la lista real de máquinas la administra otra aplicación en la base `kos_apps`.
Aquí se mantiene `maquinas` como espejo: se lee `dbo.maquinas` y se hace upsert
por `origen_id` (= dbo.maquinas.Id). Así los desplegables de F-006, F-204 y el
proceso Formación del F-158 muestran las máquinas reales.

Estados en la tabla origen (`dbo.estados_maquinas`):
    1 = En Mantenimiento   2 = Disponible   3 = No Disponible
Se marcan como activas (visibles en los desplegables) solo las **Disponibles**.
"""
from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

from .personal import _get_data_engine
from . import models

log = logging.getLogger("maquinas_sync")

ESTADO_DISPONIBLE = 2


def fetch_maquinas() -> list[dict]:
    """Lee las máquinas desde kos_apps. Devuelve [] si no hay fuente configurada."""
    engine = _get_data_engine()
    if engine is None:
        return []
    filas: list[dict] = []
    with engine.connect() as conn:
        # `nombre` es tipo TEXT -> CAST a NVARCHAR para manejarlo sin problemas.
        rows = conn.execute(
            text("SELECT Id, CAST(nombre AS NVARCHAR(200)) AS nombre, estado FROM dbo.maquinas")
        )
        for r in rows:
            nombre = (r.nombre or "").strip()
            if not nombre:
                continue
            filas.append({
                "origen_id": int(r.Id),
                "nombre": nombre[:80],
                "activo": int(r.estado) == ESTADO_DISPONIBLE if r.estado is not None else False,
            })
    return filas


def sync_maquinas(db: Session) -> dict:
    """Sincroniza `maquinas` con kos_apps.dbo.maquinas. Devuelve un resumen.

    - Alta/actualización por `origen_id`.
    - Solo las Disponibles quedan activas (visibles en los desplegables).
    - Máquinas de ejemplo/legacy sin `origen_id`, o que ya no aparezcan, se
      desactivan (nunca se borran: los registros históricos deben seguir
      resolviendo el nombre de la máquina).
    """
    filas = fetch_maquinas()
    if not filas:
        log.info("Sin datos de dbo.maquinas (fuente no configurada o vacía); no se sincroniza.")
        return {"disponible": False, "creados": 0, "actualizados": 0, "desactivados": 0, "total": 0}

    existentes = {
        m.origen_id: m
        for m in db.query(models.Maquina).filter(models.Maquina.origen_id.isnot(None)).all()
    }

    creados = actualizados = 0
    vistos = set()
    for f in filas:
        oid = f["origen_id"]
        vistos.add(oid)
        m = existentes.get(oid)
        if m is None:
            db.add(models.Maquina(nombre=f["nombre"], origen_id=oid, activo=f["activo"]))
            creados += 1
        elif m.nombre != f["nombre"] or m.activo != f["activo"]:
            m.nombre = f["nombre"]
            m.activo = f["activo"]
            actualizados += 1

    # Desactivar las de ejemplo/legacy (sin origen_id) y las que ya no vengan
    # como Disponibles, para que los desplegables solo muestren máquinas vigentes.
    desactivados = 0
    for m in db.query(models.Maquina).filter(models.Maquina.activo == True).all():  # noqa: E712
        if m.origen_id is None or m.origen_id not in vistos:
            m.activo = False
            desactivados += 1

    db.commit()
    resumen = {
        "disponible": True,
        "creados": creados,
        "actualizados": actualizados,
        "desactivados": desactivados,
        "total": len(vistos),
    }
    log.info("Sincronización dbo.maquinas: %s", resumen)
    return resumen
