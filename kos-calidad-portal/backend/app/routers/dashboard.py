"""Dashboard: métricas agregadas de calidad para revisión gerencial.

Reúne, para un rango de fechas, los indicadores aprobados por calidad:
  - Filtración (F-006): % de No Cumple por turno / máquina / referencia.
  - Cloro y PH (F-015): % fuera de rango + tendencia (serie de tiempo).
  - Clase B (F-204): cantidad por máquina / turno / referencia.
  - Liberación de rollos (F-005): liberaciones por proveedor / turno / proceso.
  - Rutas Calidad (F-158): cobertura y NC por proceso × turno.

F-005 y F-158 no guardan "turno"; se deriva de la hora (ver `turno_de`).
"""
import unicodedata
from datetime import date, datetime, time
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from .. import models
from ..auth import require
from ..config import PH_MIN, PH_MAX, CLORO_MIN, CLORO_MAX
from ..constants_f158 import PROCESO_LABEL
from .turnos import cargar_horarios, turno_de

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

_ver = require("ver_registros")


def turno_label(n: int) -> str:
    return f"Turno {n}"


def _norm(s: str) -> str:
    return unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()


def _tokens(q: Optional[str]) -> list[str]:
    return [_norm(t) for t in (q or "").split() if t.strip()]


def _match(tokens: list[str], texto: str) -> bool:
    t = _norm(texto)
    return all(tok in t for tok in tokens)


def _ranking(d: dict) -> list[dict]:
    """dict {clave: total} -> lista ordenada desc [{clave, total}]."""
    return [{"clave": k, "total": round(v, 2)} for k, v in sorted(d.items(), key=lambda x: -x[1])]


def _pct_ranking(nc: dict, muestra: dict) -> list[dict]:
    filas = []
    for k in muestra:
        m = muestra[k]
        n = nc.get(k, 0)
        filas.append({"clave": k, "nc": n, "muestra": m, "pct": round(n / m * 100, 1) if m else 0.0})
    return sorted(filas, key=lambda x: -x["pct"])


@router.get("")
def dashboard(
    desde: Optional[date] = None,
    hasta: Optional[date] = None,
    q: Optional[str] = None,  # busca por OP / referencia / marca (F-006, F-204, F-158)
    _u: models.Usuario = Depends(_ver),
    db: Session = Depends(get_db),
):
    tokens = _tokens(q)
    # desde/hasta son opcionales: si no vienen, no hay límite (todo el historial).
    # El "mes actual" por defecto lo aplica el frontend cuando NO hay búsqueda; el
    # buscador, en cambio, no queda atado a la fecha.
    def _rango(query, col):
        if desde is not None:
            query = query.filter(col >= desde)
        if hasta is not None:
            query = query.filter(col <= hasta)
        return query

    horarios = cargar_horarios(db)  # para derivar el turno de F-005 y F-158

    # Catálogos para resolver nombres.
    maq_by_id = {m.id: m.nombre for m in db.query(models.Maquina).all()}
    refs = db.query(models.Referencia).all()
    ref_by_id = {
        r.id: (f"{r.codigo} {r.descripcion}" if r.descripcion else r.codigo) for r in refs
    }

    def maq_nombre(reg):
        return (getattr(reg, "maquina_texto", None) or maq_by_id.get(reg.maquina_id) or "Sin máquina")

    def ref_nombre(reg):
        # La referencia ahora se trae de la OP como texto; la FK vieja es respaldo.
        base = getattr(reg, "referencia_texto", None)
        if not base:
            base = ref_by_id.get(reg.referencia_id, "Sin referencia") if reg.referencia_id else "Sin referencia"
        marca = getattr(reg, "marca", None)
        return f"{base} {marca}".strip() if marca else base

    # ---------------- Filtración (F-006): % NC ---------------- #
    f6 = _rango(
        db.query(models.F006Registro).options(selectinload(models.F006Registro.filtraciones)),
        models.F006Registro.fecha,
    ).all()
    if tokens:
        f6 = [r for r in f6 if _match(tokens, f"{r.orden_produccion or ''} {ref_nombre(r)}")]
    nc_turno, mu_turno = {}, {}
    nc_maq, mu_maq = {}, {}
    nc_ref, mu_ref = {}, {}
    nc_dia, mu_dia = {}, {}
    for r in f6:
        nc = sum((f.cantidad_nocumple or 0) for f in r.filtraciones)
        mu = sum((f.cantidad_muestra or 0) for f in r.filtraciones)
        if mu == 0:
            continue
        kt, km, kr = turno_label(r.turno), maq_nombre(r), ref_nombre(r)
        nc_turno[kt] = nc_turno.get(kt, 0) + nc; mu_turno[kt] = mu_turno.get(kt, 0) + mu
        nc_maq[km] = nc_maq.get(km, 0) + nc; mu_maq[km] = mu_maq.get(km, 0) + mu
        nc_ref[kr] = nc_ref.get(kr, 0) + nc; mu_ref[kr] = mu_ref.get(kr, 0) + mu
        kd = r.fecha.isoformat()
        nc_dia[kd] = nc_dia.get(kd, 0) + nc; mu_dia[kd] = mu_dia.get(kd, 0) + mu

    filtracion = {
        "por_turno": _pct_ranking(nc_turno, mu_turno),
        "por_maquina": _pct_ranking(nc_maq, mu_maq),
        "por_referencia": _pct_ranking(nc_ref, mu_ref),
        "tendencia": [
            {"fecha": d, "pct": round(nc_dia[d] / mu_dia[d] * 100, 1) if mu_dia[d] else 0.0,
             "nc": nc_dia[d], "muestra": mu_dia[d]}
            for d in sorted(mu_dia)
        ],
    }

    # ---------------- Cloro y PH (F-015) ---------------- #
    q15 = db.query(models.F015Medicion)
    if desde is not None:
        q15 = q15.filter(models.F015Medicion.fecha_hora >= datetime.combine(desde, time.min))
    if hasta is not None:
        q15 = q15.filter(models.F015Medicion.fecha_hora <= datetime.combine(hasta, time.max))
    f15 = q15.order_by(models.F015Medicion.fecha_hora).all()
    if tokens:  # el buscador es por OP/referencia/marca; el agua no tiene esos campos
        f15 = []
    ph_serie, cloro_serie = [], []
    ph_fuera = cloro_fuera = 0
    for m in f15:
        t = m.fecha_hora.isoformat()
        ph_serie.append({"t": t, "v": m.ph})
        cloro_serie.append({"t": t, "v": m.cloro})
        if not m.ph_en_rango:
            ph_fuera += 1
        if not m.cloro_en_rango:
            cloro_fuera += 1
    total_agua = len(f15)
    agua = {
        "ph": {
            "fuera": ph_fuera, "total": total_agua,
            "fuera_pct": round(ph_fuera / total_agua * 100, 1) if total_agua else 0.0,
            "min": PH_MIN, "max": PH_MAX, "serie": ph_serie,
        },
        "cloro": {
            "fuera": cloro_fuera, "total": total_agua,
            "fuera_pct": round(cloro_fuera / total_agua * 100, 1) if total_agua else 0.0,
            "min": CLORO_MIN, "max": CLORO_MAX, "serie": cloro_serie,
        },
    }

    # ---------------- Clase B (F-204) ---------------- #
    f204 = _rango(db.query(models.F204Registro), models.F204Registro.fecha).all()
    if tokens:
        f204 = [r for r in f204 if _match(tokens, f"{r.orden_produccion or ''} {ref_nombre(r)}")]
    cb_maq, cb_turno, cb_ref, cb_dia = {}, {}, {}, {}
    for r in f204:
        cb = r.cantidad_clase_b or 0
        kd = r.fecha.isoformat()
        cb_dia[kd] = cb_dia.get(kd, 0) + cb
        if cb == 0:
            continue
        cb_maq[maq_nombre(r)] = cb_maq.get(maq_nombre(r), 0) + cb
        kt = turno_label(r.turno)
        cb_turno[kt] = cb_turno.get(kt, 0) + cb
        cb_ref[ref_nombre(r)] = cb_ref.get(ref_nombre(r), 0) + cb
    claseb = {
        "por_maquina": _ranking(cb_maq),
        "por_turno": _ranking(cb_turno),
        "por_referencia": _ranking(cb_ref),
        "tendencia": [{"fecha": d, "total": cb_dia[d]} for d in sorted(cb_dia)],
    }

    # ---------------- Liberación de rollos (F-005) ---------------- #
    f5 = _rango(db.query(models.F005Registro), models.F005Registro.fecha).all()
    if tokens:  # liberación de rollos no tiene OP/referencia/marca
        f5 = []
    rl_prov, rl_turno, rl_proc, rl_dia = {}, {}, {}, {}
    for r in f5:
        prov = (r.proveedor or "Sin proveedor").strip() or "Sin proveedor"
        rl_prov[prov] = rl_prov.get(prov, 0) + 1
        kt = turno_label(turno_de(r.fecha_hora, horarios))
        rl_turno[kt] = rl_turno.get(kt, 0) + 1
        proc = PROCESO_LABEL.get(r.proceso, r.proceso) if r.proceso else "Sin proceso"
        rl_proc[proc] = rl_proc.get(proc, 0) + 1
        kd = r.fecha.isoformat()
        rl_dia[kd] = rl_dia.get(kd, 0) + 1
    rollos = {
        "por_proveedor": _ranking(rl_prov),
        "por_turno": _ranking(rl_turno),
        "por_proceso": _ranking(rl_proc),
        "tendencia": [{"fecha": d, "total": rl_dia[d]} for d in sorted(rl_dia)],
    }

    # ---------------- Rutas Calidad (F-158) ---------------- #
    f158 = _rango(
        db.query(models.F158Recorrido).options(selectinload(models.F158Recorrido.items)),
        models.F158Recorrido.fecha,
    ).all()
    if tokens:
        def _texto158(r):
            op = next((it.valor for it in r.items if it.campo_key == "op" and it.valor), "")
            ref = next((it.valor for it in r.items if it.tipo == "referencia" and it.valor), "")
            return f"{op} {ref}"
        f158 = [r for r in f158 if _match(tokens, _texto158(r))]
    turnos = [turno_label(1), turno_label(2), turno_label(3)]
    cob = {}   # proceso -> [t1,t2,t3]
    ncp = {}   # proceso -> [t1,t2,t3]
    for r in f158:
        proc = PROCESO_LABEL.get(r.proceso, r.proceso)
        ti = turno_de(r.fecha_hora, horarios) - 1
        cob.setdefault(proc, [0, 0, 0])[ti] += 1
        nc_items = sum(1 for it in r.items if it.tipo == "cncna" and it.valor == "NC")
        ncp.setdefault(proc, [0, 0, 0])[ti] += nc_items

    def _matriz(d):
        filas = [
            {"proceso": p, "valores": v, "total": sum(v)}
            for p, v in sorted(d.items(), key=lambda x: -sum(x[1]))
        ]
        return {"turnos": turnos, "filas": filas}

    rutas = {"cobertura": _matriz(cob), "nc": _matriz(ncp)}

    return {
        "desde": desde.isoformat() if desde else None,
        "hasta": hasta.isoformat() if hasta else None,
        "filtracion": filtracion,
        "agua": agua,
        "claseb": claseb,
        "rollos": rollos,
        "rutas": rutas,
    }
