"""Sincronización del catálogo de referencias desde dbo.PQRS_Referencias.

`dbo.PQRS_Referencias` vive en la MISMA base que el esquema `calidad` (kx_ecommerce),
así que se lee con la conexión principal del portal (no hace falta engine aparte).
Se mantiene `calidad.referencias` como espejo (upsert por `origen_id`) para que las
llaves foráneas de F-006 sigan funcionando. En SQLite local la tabla no existe y la
sincronización simplemente no se ejecuta.
"""
from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

from .config import _IS_SQLITE
from . import models

log = logging.getLogger("referencias_sync")


def fetch_pqrs_referencias(db: Session) -> list[dict]:
    if _IS_SQLITE:
        return []
    filas: list[dict] = []
    rows = db.execute(text("SELECT Id, Nombre, Descripcion, IsActive FROM dbo.PQRS_Referencias"))
    for r in rows:
        nombre = (r.Nombre or "").strip()
        if not nombre:
            continue
        filas.append({
            "origen_id": int(r.Id),
            "codigo": nombre[:60],
            "descripcion": (r.Descripcion.strip() if r.Descripcion else None),
            "activo": bool(r.IsActive),
        })
    return filas


def sync_referencias(db: Session) -> dict:
    """Sincroniza `referencias` con `PQRS_Referencias`. Upsert por `origen_id`."""
    try:
        filas = fetch_pqrs_referencias(db)
    except Exception:
        log.exception("No se pudo leer dbo.PQRS_Referencias")
        return {"disponible": False, "creados": 0, "actualizados": 0, "desactivados": 0, "total": 0}

    if not filas:
        return {"disponible": False, "creados": 0, "actualizados": 0, "desactivados": 0, "total": 0}

    existentes = {
        r.origen_id: r
        for r in db.query(models.Referencia).filter(models.Referencia.origen_id.isnot(None)).all()
    }
    creados = actualizados = 0
    vistos: set[int] = set()

    for f in filas:
        oid = f["origen_id"]
        vistos.add(oid)
        r = existentes.get(oid)
        if r is None:
            db.add(models.Referencia(
                codigo=f["codigo"], descripcion=f["descripcion"],
                tipo_producto="vaso", origen_id=oid, activo=f["activo"],
            ))
            creados += 1
        elif r.codigo != f["codigo"] or r.descripcion != f["descripcion"] or r.activo != f["activo"]:
            r.codigo = f["codigo"]
            r.descripcion = f["descripcion"]
            r.activo = f["activo"]
            actualizados += 1

    # Desactivar referencias de ejemplo/legacy (sin origen_id) y las que ya no vienen,
    # para que el buscador solo muestre productos de PQRS_Referencias.
    desactivados = 0
    for r in db.query(models.Referencia).filter(models.Referencia.activo == True).all():  # noqa: E712
        if r.origen_id is None or r.origen_id not in vistos:
            r.activo = False
            desactivados += 1

    db.commit()
    resumen = {"disponible": True, "creados": creados, "actualizados": actualizados,
               "desactivados": desactivados, "total": len(vistos)}
    log.info("Sincronización PQRS_Referencias: %s", resumen)
    return resumen
