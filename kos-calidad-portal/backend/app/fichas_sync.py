"""Siembra la tabla ficha_tecnica desde fichas_tecnicas.json.

Solo INSERTA las fichas que aún no existen en la base. Las que ya existen NO se
tocan, para conservar cualquier edición hecha por un admin (referencia,
categoría o medidas). Antes se sobrescribían las medidas en cada arranque, lo
que revertía las ediciones.
"""
import json
import logging
from pathlib import Path

from . import models

log = logging.getLogger("uvicorn.error")
_JSON = Path(__file__).resolve().parent / "fichas_tecnicas.json"

_MEDIDAS = ("codigo", "categoria", "plastificado", "diam_inferior", "rim", "diam_exterior", "altura", "archivo")


def _slug(archivo: str, codigo: str, referencia: str) -> str:
    if archivo:
        return archivo.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    return (codigo or referencia or "ft").lower().replace(" ", "-")


def sync_fichas(db) -> dict:
    try:
        datos = json.loads(_JSON.read_text(encoding="utf-8"))
    except Exception as e:
        log.warning("No se pudo leer fichas_tecnicas.json: %s", e)
        return {"insertadas": 0, "actualizadas": 0}
    ins = 0
    for i, d in enumerate(datos):
        fid = _slug(d.get("archivo", ""), d.get("codigo", ""), d.get("referencia", ""))
        if db.get(models.FichaTecnica, fid) is not None:
            continue  # ya existe: NO se toca (se conservan las ediciones del admin)
        db.add(models.FichaTecnica(
            id=fid, referencia=d.get("referencia", ""), orden=i,
            **{k: d.get(k, "") for k in _MEDIDAS},
        ))
        ins += 1
    db.commit()
    log.info("Fichas técnicas: %d nuevas insertadas (existentes sin cambios).", ins)
    return {"insertadas": ins}
