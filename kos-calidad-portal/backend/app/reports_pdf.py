"""Generación de reportes en PDF (resumen + detalle) por rango de fecha/hora.

Un endpoint pide el formato (f005..f204) y un rango [desde, hasta] (datetime).
Se arma un PDF con encabezado de marca (logo KOS), una tabla resumen y luego el
detalle de cada registro. reportlab hace el render.
"""
from datetime import datetime
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, PageBreak, KeepTogether,
)
from sqlalchemy.orm import selectinload

from . import models, storage
from .constants import TIPOS_PRUEBA_F006, TIPOS_MATERIAL_F006
from .constants_f158 import PROCESO_LABEL

_LOGO = Path(__file__).resolve().parent / "static" / "logo-kos.png"
BRAND = colors.HexColor("#1e3a8a")
BRAND_L = colors.HexColor("#eef2fb")
GREY = colors.HexColor("#6b7280")
LINE = colors.HexColor("#d1d5db")

_PRUEBA = {v: l for v, l in TIPOS_PRUEBA_F006}
_MATERIAL = {v: l for v, l in TIPOS_MATERIAL_F006}

_S = {
    "titulo": ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=15, textColor=BRAND, leading=18),
    "sub": ParagraphStyle("s", fontName="Helvetica", fontSize=9, textColor=GREY, leading=12),
    "kpi": ParagraphStyle("k", fontName="Helvetica-Bold", fontSize=9.5, textColor=colors.HexColor("#111827"), leading=13),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=11, textColor=BRAND, leading=16, spaceBefore=6, spaceAfter=3),
    "muted": ParagraphStyle("m", fontName="Helvetica", fontSize=9, textColor=GREY),
    "reg_tit": ParagraphStyle("rt", fontName="Helvetica-Bold", fontSize=10, textColor=BRAND, leading=13),
    "reg_sub": ParagraphStyle("rs", fontName="Helvetica", fontSize=8, textColor=GREY, leading=11, spaceAfter=2),
    "small": ParagraphStyle("sm", fontName="Helvetica", fontSize=8, leading=11),
    "cell": ParagraphStyle("c", fontName="Helvetica", fontSize=7.2, leading=8.6),
    "cellh": ParagraphStyle("ch", fontName="Helvetica-Bold", fontSize=7.2, leading=8.6, textColor=colors.white),
}


def _esc(v) -> str:
    s = "" if v is None else str(v)
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _dt(d: datetime):
    return (d.strftime("%d/%m/%Y"), d.strftime("%H:%M")) if d else ("", "")


def _page(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(GREY)
    canvas.drawRightString(A4[0] - 15 * mm, 9 * mm, f"Página {doc.page}")
    canvas.drawString(15 * mm, 9 * mm, "Portal de Calidad · KOS Colombia")
    canvas.setStrokeColor(LINE)
    canvas.line(15 * mm, 11 * mm, A4[0] - 15 * mm, 11 * mm)
    canvas.restoreState()


def _encabezado(titulo, desde, hasta, usuario):
    fd = _dt(desde); fh = _dt(hasta)
    txt = [
        Paragraph(_esc(titulo), _S["titulo"]),
        Paragraph(f"Rango: {fd[0]} {fd[1]} &nbsp;→&nbsp; {fh[0]} {fh[1]}", _S["sub"]),
        Paragraph(f"Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')} · {_esc(usuario)}", _S["sub"]),
    ]
    cell = [txt]
    if _LOGO.exists():
        logo = Image(str(_LOGO), width=20 * mm, height=20 * mm * 270 / 325)
        head = Table([[logo, txt]], colWidths=[24 * mm, None])
    else:
        head = Table([[txt]])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    return [head, Spacer(1, 4),
            Table([[""]], colWidths=[A4[0] - 30 * mm], rowHeights=[2],
                  style=TableStyle([("LINEBELOW", (0, 0), (-1, -1), 1.2, BRAND)])),
            Spacer(1, 6)]


def _tabla_resumen(header, rows):
    data = [[Paragraph(_esc(h), _S["cellh"]) for h in header]]
    for r in rows:
        data.append([Paragraph(_esc(c), _S["cell"]) for c in r])
    t = Table(data, repeatRows=1)
    st = [
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            st.append(("BACKGROUND", (0, i), (-1, i), BRAND_L))
    t.setStyle(TableStyle(st))
    return t


def _mini(header, rows):
    data = [[Paragraph(_esc(h), _S["cellh"]) for h in header]]
    for r in rows:
        data.append([Paragraph(_esc(c), _S["cell"]) for c in r])
    t = Table(data, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#475569")),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def _bloque(titulo, subtitulo="", lineas=None, tablas=None):
    els = [Paragraph(_esc(titulo), _S["reg_tit"])]
    if subtitulo:
        els.append(Paragraph(_esc(subtitulo), _S["reg_sub"]))
    for l in (lineas or []):
        els.append(Paragraph(l, _S["small"]))
    for t in (tablas or []):
        els.append(Spacer(1, 2)); els.append(t)
    els.append(Table([[""]], colWidths=[A4[0] - 30 * mm], rowHeights=[1],
                     style=TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE)])))
    return KeepTogether(els)


# ------------------------- catálogos para resolver ids --------------------- #
def _catalogos(db):
    maq = {m.id: m.nombre for m in db.query(models.Maquina).all()}
    refs = db.query(models.Referencia).all()
    ref = {r.id: (f"{r.codigo} {r.descripcion}" if r.descripcion else r.codigo) for r in refs}
    return maq, ref


def _ref_txt(reg, ref):
    if getattr(reg, "referencia_texto", None):
        base = reg.referencia_texto
    elif reg.referencia_id:
        base = ref.get(reg.referencia_id, "")
    else:
        base = ""
    m = getattr(reg, "marca", None)
    return f"{base} {m}".strip() if m else base


def _maq_txt(reg, maq):
    return getattr(reg, "maquina_texto", None) or maq.get(getattr(reg, "maquina_id", None)) or (reg.maquina if hasattr(reg, "maquina") and isinstance(reg.maquina, str) else "") or ""


def _reducir(data: bytes, max_px=1000, calidad=70) -> bytes:
    """Reduce y recomprime la imagen (JPEG) para no inflar el PDF."""
    from PIL import Image as PILImage
    im = PILImage.open(BytesIO(data))
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    im.thumbnail((max_px, max_px))
    out = BytesIO()
    im.save(out, format="JPEG", quality=calidad, optimize=True)
    return out.getvalue()


def _img_flowable(data: bytes, max_w=55 * mm, max_h=45 * mm):
    """Imagen escalada conservando proporción (para incrustar evidencias)."""
    iw, ih = ImageReader(BytesIO(data)).getSize()
    if not iw or not ih:
        return None
    w, h = max_w, max_w * ih / iw
    if h > max_h:
        h, w = max_h, max_h * iw / ih
    return Image(BytesIO(data), width=w, height=h)


def _imagenes_recorrido(adjuntos, maximo=4):
    """Devuelve (flowables_imagenes, n_videos). Best-effort: ignora fallos."""
    imgs, videos = [], 0
    for a in adjuntos:
        if a.tipo == "video":
            videos += 1
            continue
        if len(imgs) >= maximo:
            continue
        try:
            fl = _img_flowable(_reducir(storage.leer(a.ruta)))
            if fl is not None:
                imgs.append(fl)
        except Exception:
            pass
    return imgs, videos


# ------------------------------- F-006 ------------------------------------- #
def _f006(db, desde, hasta):
    maq, ref = _catalogos(db)
    regs = (db.query(models.F006Registro)
            .options(selectinload(models.F006Registro.filtraciones), selectinload(models.F006Registro.embalaje))
            .filter(models.F006Registro.creado_en >= desde, models.F006Registro.creado_en <= hasta)
            .order_by(models.F006Registro.creado_en).all())
    header = ["Fecha", "Hora", "OP", "Referencia", "Máquina", "Turno", "Pruebas", "% NC"]
    rows, detalles = [], []
    tot_nc = tot_mu = 0
    for r in regs:
        f, h = _dt(r.creado_en)
        pruebas = [x for x in r.filtraciones if not getattr(x, "maquina_parada", False)]
        nc = sum((x.cantidad_nocumple or 0) for x in pruebas)
        mu = sum((x.cantidad_muestra or 0) for x in pruebas)
        tot_nc += nc; tot_mu += mu
        pct = f"{round(nc / mu * 100, 1)}%" if mu else "—"
        rows.append([f, h, r.orden_produccion or "", _ref_txt(r, ref), _maq_txt(r, maq), f"T{r.turno}" if r.turno else "", str(len(r.filtraciones)), pct])
        # detalle
        emb = " · ".join(f"{e.item}: {e.resultado}" for e in r.embalaje) or "—"
        prows = []
        for x in sorted(r.filtraciones, key=lambda z: z.hora_montaje):
            hh = x.hora_montaje.strftime("%H:%M")
            if getattr(x, "maquina_parada", False):
                prows.append([hh, "⛔ Máquina parada", "", "", "", x.comentario or ""])
                continue
            extra = []
            if x.temp_90:
                extra.append(f"90°C:{'Sí' if x.temp_90 == 'si' else 'No'}")
            if x.goteo_vaso_tapa:
                extra.append(f"Goteo:{x.goteo_vaso_tapa}")
            if x.tapa_centrada:
                extra.append(f"Tapa:{x.tapa_centrada}")
            prows.append([hh, _PRUEBA.get(x.tipo_prueba, x.tipo_prueba or ""), _MATERIAL.get(x.tipo_material, x.tipo_material or ""),
                          f"{x.cantidad_cumple if x.cantidad_cumple is not None else '—'}/{x.cantidad_nocumple if x.cantidad_nocumple is not None else '—'}",
                          " ".join(extra), x.comentario or ""])
        tablas = []
        if prows:
            tablas.append(_mini(["Hora", "Prueba", "Papel", "Cumple/NC", "Chequeos", "Comentario"], prows))
        firmas = f"Operario: {r.operario_nombre or '—'} · Empacador: {r.empacador_nombre or '—'} · Auxiliar: {r.auxiliar_nombre or '—'}"
        detalles.append(_bloque(
            _ref_txt(r, ref) or "Producto",
            f"OP {r.orden_produccion or '—'} · {_maq_txt(r, maq) or 'Sin máquina'} · {('T'+str(r.turno)) if r.turno else 'sin turno'} · {f} {h}",
            [f"<b>Embalaje:</b> {_esc(emb)}", f"<b>Firmas:</b> {_esc(firmas)}"],
            tablas,
        ))
    pct_prom = f"{round(tot_nc / tot_mu * 100, 1)}%" if tot_mu else "—"
    return {
        "titulo": "F-006 · Pruebas de filtración",
        "kpis": [f"Registros: {len(regs)}", f"% NC global: {pct_prom}"],
        "header": header, "rows": rows, "detalles": detalles,
    }


# ------------------------------- F-158 ------------------------------------- #
def _f158(db, desde, hasta):
    from .routers.turnos import cargar_horarios, turno_de
    horarios = cargar_horarios(db)
    regs = (db.query(models.F158Recorrido)
            .options(selectinload(models.F158Recorrido.items), selectinload(models.F158Recorrido.adjuntos))
            .filter(models.F158Recorrido.fecha_hora >= desde, models.F158Recorrido.fecha_hora <= hasta)
            .order_by(models.F158Recorrido.fecha_hora).all())
    header = ["Fecha", "Hora", "Proceso", "Máquina", "OP", "Referencia", "Responsable", "C", "NC"]
    rows, detalles = [], []
    conteo = {}  # proceso -> [t1, t2, t3]
    for r in regs:
        f, h = _dt(r.fecha_hora)
        op = next((it.valor for it in r.items if it.campo_key == "op" and it.valor), "")
        refv = next((it.valor for it in r.items if it.tipo == "referencia" and it.valor), "")
        c = sum(1 for it in r.items if it.tipo == "cncna" and it.valor == "C")
        nc = sum(1 for it in r.items if it.tipo == "cncna" and it.valor == "NC")
        proc = PROCESO_LABEL.get(r.proceso, r.proceso)
        rows.append([f, h, proc, r.maquina or "", op, refv, r.responsable_nombre or "", str(c), str(nc)])
        # Conteo por proceso y turno (turno derivado de la hora).
        ti = turno_de(r.fecha_hora, horarios) - 1
        conteo.setdefault(proc, [0, 0, 0])[ti] += 1
        # Detalle SOLO si tiene No Cumple, comentario o evidencia (imagen/video).
        tiene_nc = nc > 0
        tiene_com = bool(r.observaciones and r.observaciones.strip())
        tiene_adj = len(r.adjuntos) > 0
        if not (tiene_nc or tiene_com or tiene_adj):
            continue
        items = [[it.campo_label, it.valor or "—"] for it in r.items if it.campo_key != "op" and it.tipo != "referencia"]
        tablas = [_mini(["Ítem", "Resultado"], items)] if items else []
        lineas = []
        if refv:
            lineas.append(f"<b>Referencia:</b> {_esc(refv)}")
        if tiene_nc:
            nc_items = ", ".join(it.campo_label for it in r.items if it.tipo == "cncna" and it.valor == "NC")
            lineas.append(f'<b>No cumple ({nc}):</b> <font color="#c5221f">{_esc(nc_items)}</font>')
        if tiene_com:
            lineas.append(f"<b>Observaciones:</b> {_esc(r.observaciones)}")
        imgs, videos = _imagenes_recorrido(r.adjuntos) if tiene_adj else ([], 0)
        if videos:
            lineas.append(f"<b>Video(s):</b> {videos} (no se incrustan)")
        if imgs:
            # Imágenes en filas de 2.
            filas_img = [imgs[i:i + 2] for i in range(0, len(imgs), 2)]
            for fila in filas_img:
                while len(fila) < 2:
                    fila.append("")
            tablas.append(Table(filas_img, hAlign="LEFT",
                                style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                                  ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                                  ("TOPPADDING", (0, 0), (-1, -1), 3),
                                                  ("RIGHTPADDING", (0, 0), (-1, -1), 6)])))
        detalles.append(_bloque(
            f"{proc} · {r.maquina or 'Sin máquina'}",
            f"OP {op or '—'} · {r.responsable_nombre or '—'} · {f} {h}",
            lineas, tablas,
        ))
    # Tabla resumen proceso × turno.
    cnt_rows = []
    tot = [0, 0, 0]
    for p, v in sorted(conteo.items()):
        cnt_rows.append([p, str(v[0]), str(v[1]), str(v[2]), str(sum(v))])
        for i in range(3):
            tot[i] += v[i]
    cnt_rows.append(["TOTAL", str(tot[0]), str(tot[1]), str(tot[2]), str(sum(tot))])
    pre = [
        Paragraph("Rutas por proceso y turno", _S["h2"]),
        _tabla_resumen(["Proceso", "Turno 1", "Turno 2", "Turno 3", "Total"], cnt_rows),
        Spacer(1, 6),
    ]
    return {
        "titulo": "F-158 · Rutas de Calidad",
        "kpis": [f"Recorridos: {len(regs)}", f"Con novedad/evidencia: {len(detalles)}"],
        "pre": pre,
        "header": header, "rows": rows, "detalles": detalles,
        "detalle_titulo": "Detalle (solo con No Cumple, comentario o evidencia)",
    }


# ------------------------------- F-204 ------------------------------------- #
def _f204(db, desde, hasta):
    maq, ref = _catalogos(db)
    regs = (db.query(models.F204Registro)
            .filter(models.F204Registro.fecha_hora >= desde, models.F204Registro.fecha_hora <= hasta)
            .order_by(models.F204Registro.fecha_hora).all())
    header = ["Fecha", "Hora", "Turno", "OP", "Máquina", "Referencia", "Clase B", "Desperd.", "Entregado por"]
    rows, detalles = [], []
    tot = 0
    for r in regs:
        f, h = _dt(r.fecha_hora)
        tot += r.cantidad_clase_b or 0
        rows.append([f, h, f"T{r.turno}" if r.turno else "", r.orden_produccion or "", _maq_txt(r, maq), _ref_txt(r, ref),
                     str(r.cantidad_clase_b if r.cantidad_clase_b is not None else ""), r.verificacion_desperdicio or "", r.entregado_por_nombre or ""])
        detalles.append(_bloque(
            _ref_txt(r, ref) or "Entrega",
            f"OP {r.orden_produccion or '—'} · {_maq_txt(r, maq) or 'Sin máquina'} · {('T'+str(r.turno)) if r.turno else ''} · {f} {h}",
            [f"<b>Clase B:</b> {r.cantidad_clase_b if r.cantidad_clase_b is not None else '—'} · <b>Verif. desperdicio:</b> {_esc(r.verificacion_desperdicio or '—')}",
             f"<b>Entregado por:</b> {_esc(r.entregado_por_nombre or '—')} · <b>Recibido por:</b> {_esc(r.recibido_por_nombre or '—')}"]
            + ([f"<b>Observaciones:</b> {_esc(r.observaciones)}"] if r.observaciones else []),
        ))
    return {
        "titulo": "F-204 · Clase B y desperdicio",
        "kpis": [f"Registros: {len(regs)}", f"Total Clase B: {tot}"],
        "header": header, "rows": rows, "detalles": detalles,
    }


# ------------------------------- F-015 ------------------------------------- #
def _f015(db, desde, hasta):
    regs = (db.query(models.F015Medicion)
            .filter(models.F015Medicion.fecha_hora >= desde, models.F015Medicion.fecha_hora <= hasta)
            .order_by(models.F015Medicion.fecha_hora).all())
    header = ["Fecha", "Hora", "Punto", "PH", "PH rango", "Cloro", "Cloro rango", "Responsable"]
    rows, detalles = [], []
    fuera = 0
    for r in regs:
        f, h = _dt(r.fecha_hora)
        if not r.ph_en_rango or not r.cloro_en_rango:
            fuera += 1
        rows.append([f, h, r.punto_texto or "", f"{r.ph}", "Sí" if r.ph_en_rango else "NO", f"{r.cloro}", "Sí" if r.cloro_en_rango else "NO", r.responsable_nombre or ""])
        detalles.append(_bloque(
            f"{r.punto_texto or 'Punto'} · {f} {h}",
            "",
            [f"<b>PH:</b> {r.ph} ({'en rango' if r.ph_en_rango else 'FUERA'}) · <b>Cloro:</b> {r.cloro} ({'en rango' if r.cloro_en_rango else 'FUERA'})",
             f"<b>Responsable:</b> {_esc(r.responsable_nombre or '—')}"]
            + ([f"<b>Observaciones:</b> {_esc(r.comentario)}"] if r.comentario else []),
        ))
    return {
        "titulo": "F-015 · Cloro y PH del agua",
        "kpis": [f"Mediciones: {len(regs)}", f"Fuera de rango: {fuera}"],
        "header": header, "rows": rows, "detalles": detalles,
    }


# ------------------------------- F-005 ------------------------------------- #
def _f005(db, desde, hasta):
    regs = (db.query(models.F005Registro)
            .filter(models.F005Registro.fecha_hora >= desde, models.F005Registro.fecha_hora <= hasta)
            .order_by(models.F005Registro.fecha_hora).all())
    header = ["Fecha", "Hora", "Lote", "Material", "Calibre", "Ancho", "Kg", "Proveedor", "Responsable"]
    rows, detalles = [], []
    for r in regs:
        f, h = _dt(r.fecha_hora)
        rows.append([f, h, r.lote or "", r.material or "", r.calibre or "", r.ancho or "", r.kg or "", r.proveedor or "", r.responsable_nombre or ""])
        estado = " · ".join([f"Dinas:{r.estado_dinas or '—'}", f"Alcohol:{r.estado_alcohol or '—'}",
                             f"Lápiz:{r.estado_lapiz or '—'}", f"Armado:{r.estado_armado or '—'}", f"Inocuidad:{r.estado_inocuidad or '—'}"])
        detalles.append(_bloque(
            f"Lote {r.lote or '—'} · {f} {h}",
            f"{r.material or ''} · Calibre {r.calibre or '—'} · Ancho {r.ancho or '—'} · {r.kg or '—'} kg · {r.proveedor or ''}",
            [f"<b>Estado:</b> {_esc(estado)}", f"<b>Responsable:</b> {_esc(r.responsable_nombre or '—')}"]
            + ([f"<b>Observaciones:</b> {_esc(r.observaciones)}"] if r.observaciones else []),
        ))
    return {
        "titulo": "F-005 · Liberación de rollos",
        "kpis": [f"Registros: {len(regs)}"],
        "header": header, "rows": rows, "detalles": detalles,
    }


_FORMATOS = {"f005": _f005, "f006": _f006, "f015": _f015, "f158": _f158, "f204": _f204}


def build_report_pdf(formato: str, desde: datetime, hasta: datetime, usuario: str, db) -> bytes:
    spec = _FORMATOS[formato](db, desde, hasta)
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=13 * mm, bottomMargin=15 * mm, title=f"Reporte {formato.upper()}")
    story = _encabezado(spec["titulo"], desde, hasta, usuario)
    if spec["kpis"]:
        story.append(Paragraph(" &nbsp;·&nbsp; ".join(_esc(k) for k in spec["kpis"]), _S["kpi"]))
        story.append(Spacer(1, 6))
    for fl in spec.get("pre", []):
        story.append(fl)
    story.append(Paragraph("Resumen", _S["h2"]))
    if spec["rows"]:
        story.append(_tabla_resumen(spec["header"], spec["rows"]))
        if spec["detalles"]:
            story.append(PageBreak())
            story.append(Paragraph(spec.get("detalle_titulo", "Detalle por registro"), _S["h2"]))
            story.append(Spacer(1, 3))
            for d in spec["detalles"]:
                story.append(d); story.append(Spacer(1, 5))
    else:
        story.append(Paragraph("Sin registros en el rango seleccionado.", _S["muted"]))
    doc.build(story, onFirstPage=_page, onLaterPages=_page)
    return buf.getvalue()
