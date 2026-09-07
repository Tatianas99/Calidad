"""Siembra la tabla ficha_tecnica desde fichas_tecnicas.json.

En un registro NUEVO se copian todos los campos. En uno EXISTENTE se actualizan
las medidas y el archivo, pero NO la `referencia` (para conservar el nombre que
haya editado un admin).
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
    ins = upd = 0
    for i, d in enumerate(datos):
        fid = _slug(d.get("archivo", ""), d.get("codigo", ""), d.get("referencia", ""))
        row = db.get(models.FichaTecnica, fid)
        if row is None:
            db.add(models.FichaTecnica(
                id=fid, referencia=d.get("referencia", ""), orden=i,
                **{k: d.get(k, "") for k in _MEDIDAS},
            ))
            ins += 1
        else:
            for k in _MEDIDAS:
                setattr(row, k, d.get(k, ""))
            row.orden = i
            upd += 1
    db.commit()
    log.info("Fichas técnicas: %d nuevas, %d actualizadas.", ins, upd)
    return {"insertadas": ins, "actualizadas": upd}
