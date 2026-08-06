"""Consulta de órdenes de producción (OP) desde kos_apps.dbo.op_numeros.

Cada OP (columna `docto`) tiene varias filas: el producto terminado más sus
materiales (hojilla, polyboard). La "Referencia" de calidad es el **producto
terminado** (`tipo_inv` que empieza por 'IN1430'); como respaldo, el ítem que no
sea HOJILLA/POLYBOARD. La `marca` es consistente para toda la OP.

Se consulta EN VIVO (las OP se crean a diario), no por sincronización, para que
siempre traiga la información más reciente. Si la base de datos de datos no está
disponible, devuelve lista vacía / 404 sin tumbar el portal.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from ..personal import _get_data_engine

router = APIRouter(prefix="/catalogos/op", tags=["Catálogos"])

# Selecciona 1 fila por OP: prioriza el producto terminado (IN1430), luego el
# ítem que no sea materia prima (HOJILLA/POLYBOARD), y de último cualquiera.
_INNER = """
    SELECT docto,
           CAST(item  AS NVARCHAR(200)) AS item,
           CAST(marca AS NVARCHAR(100)) AS marca,
           ROW_NUMBER() OVER (
               PARTITION BY docto ORDER BY
                   CASE WHEN CAST(tipo_inv AS NVARCHAR(40)) LIKE 'IN1430%' THEN 0
                        WHEN CAST(item AS NVARCHAR(200)) NOT LIKE 'HOJILLA%'
                         AND CAST(item AS NVARCHAR(200)) NOT LIKE 'POLYBOARD%' THEN 1
                        ELSE 2 END,
                   Id DESC
           ) AS rn
    FROM dbo.op_numeros
"""


def _fila(row) -> dict:
    return {
        "op": str(row.docto),
        "referencia": (row.item or "").strip(),
        "marca": (row.marca or "").strip(),
    }


@router.get("")
def buscar_op(q: str = "", limit: int = 25):
    """Busca OP por número (docto), referencia o marca. Devuelve las más recientes."""
    eng = _get_data_engine()
    if eng is None:
        return []
    qn = (q or "").strip()
    limit = max(1, min(limit, 50))
    where = "WHERE z.rn = 1"
    params: dict = {}
    if qn:
        where += (
            " AND (CAST(z.docto AS NVARCHAR(20)) LIKE :q"
            " OR z.item LIKE :q OR z.marca LIKE :q)"
        )
        params["q"] = f"%{qn}%"
    sql = f"SELECT TOP {limit} z.docto, z.item, z.marca FROM ({_INNER}) z {where} ORDER BY z.docto DESC"
    try:
        with eng.connect() as c:
            return [_fila(r) for r in c.execute(text(sql), params)]
    except Exception:
        return []


@router.get("/{docto}")
def resolver_op(docto: int):
    """Resuelve una OP exacta a {op, referencia, marca}. 404 si no existe."""
    eng = _get_data_engine()
    if eng is None:
        raise HTTPException(status_code=503, detail="Catálogo de OP no disponible")
    sql = f"SELECT TOP 1 z.docto, z.item, z.marca FROM ({_INNER}) z WHERE z.rn = 1 AND z.docto = :d"
    try:
        with eng.connect() as c:
            row = c.execute(text(sql), {"d": docto}).first()
    except Exception:
        raise HTTPException(status_code=503, detail="No se pudo consultar la OP")
    if not row:
        raise HTTPException(status_code=404, detail="OP no encontrada")
    return _fila(row)
