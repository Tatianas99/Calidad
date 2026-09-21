"""Resumen ejecutivo de Clase B (F-204): agregados + comparación con el periodo
anterior. Fuente única para el dashboard (bloque `claseb`) y para el PDF del
informe, así ambos muestran exactamente lo mismo.
"""
import unicodedata
from datetime import date, timedelta
from typing import Optional

from . import models


def _norm(s: str) -> str:
    return unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()


def _tokens(q: Optional[str]) -> list[str]:
    return [_norm(t) for t in (q or "").split() if t.strip()]


def _match(tokens: list[str], texto: str) -> bool:
    t = _norm(texto)
    return all(tok in t for tok in tokens)


def _ranking(d: dict) -> list[dict]:
    return [{"clave": k, "total": round(v, 2)} for k, v in sorted(d.items(), key=lambda x: -x[1])]


def _catalogos(db):
    maq_by_id = {m.id: m.nombre for m in db.query(models.Maquina).all()}
    ref_by_id = {
        r.id: (f"{r.codigo} {r.descripcion}" if r.descripcion else r.codigo)
        for r in db.query(models.Referencia).all()
    }
    return maq_by_id, ref_by_id


def _ref_nombre(reg, ref_by_id) -> str:
    base = getattr(reg, "referencia_texto", None)
    if not base:
        base = ref_by_id.get(reg.referencia_id, "Sin referencia") if reg.referencia_id else "Sin referencia"
    marca = getattr(reg, "marca", None)
    return f"{base} {marca}".strip() if marca else base


def _registros(db, desde, hasta, tokens, ref_by_id):
    q = db.query(models.F204Registro)
    if desde is not None:
        q = q.filter(models.F204Registro.fecha >= desde)
    if hasta is not None:
        q = q.filter(models.F204Registro.fecha <= hasta)
    regs = q.all()
    if tokens:
        regs = [r for r in regs if _match(tokens, f"{r.orden_produccion or ''} {_ref_nombre(r, ref_by_id)}")]
    return regs


def _total(regs) -> int:
    return sum((r.cantidad_clase_b or 0) for r in regs)


def resumen_claseb(db, desde: Optional[date], hasta: Optional[date], q: Optional[str]) -> dict:
    """Agrega la Clase B del rango por máquina/turno/referencia/OP + tendencia, y
    compara el total con el periodo inmediatamente anterior de igual duración."""
    tokens = _tokens(q)
    maq_by_id, ref_by_id = _catalogos(db)
    regs = _registros(db, desde, hasta, tokens, ref_by_id)

    cb_maq, cb_turno, cb_ref, cb_op, cb_dia = {}, {}, {}, {}, {}
    for r in regs:
        cb = r.cantidad_clase_b or 0
        kd = r.fecha.isoformat()
        cb_dia[kd] = cb_dia.get(kd, 0) + cb
        if cb == 0:
            continue
        maqn = getattr(r, "maquina_texto", None) or maq_by_id.get(r.maquina_id) or "Sin máquina"
        cb_maq[maqn] = cb_maq.get(maqn, 0) + cb
        kt = f"Turno {r.turno}"
        cb_turno[kt] = cb_turno.get(kt, 0) + cb
        rn = _ref_nombre(r, ref_by_id)
        cb_ref[rn] = cb_ref.get(rn, 0) + cb
        kop = (r.orden_produccion or "").strip() or "Sin OP"
        cb_op[kop] = cb_op.get(kop, 0) + cb

    total = _total(regs)

    # Comparación con el periodo anterior (misma cantidad de días, justo antes).
    comparacion = None
    if desde is not None and hasta is not None:
        dias = (hasta - desde).days + 1
        prev_hasta = desde - timedelta(days=1)
        prev_desde = prev_hasta - timedelta(days=dias - 1)
        prev_total = _total(_registros(db, prev_desde, prev_hasta, tokens, ref_by_id))
        cambio = ((total - prev_total) / prev_total * 100) if prev_total else None
        comparacion = {
            "prev_desde": prev_desde.isoformat(),
            "prev_hasta": prev_hasta.isoformat(),
            "prev_total": prev_total,
            "cambio_pct": round(cambio, 1) if cambio is not None else None,
        }

    return {
        "total": total,
        "por_maquina": _ranking(cb_maq),
        "por_turno": _ranking(cb_turno),
        "por_referencia": _ranking(cb_ref),
        "por_op": _ranking(cb_op),
        "tendencia": [{"fecha": d, "total": cb_dia[d]} for d in sorted(cb_dia)],
        "comparacion": comparacion,
    }
