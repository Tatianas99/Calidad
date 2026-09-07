"""Endpoints de reportes (datos JSON, Excel y PDF por rango de fecha/hora)."""
from datetime import date, datetime, time
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..auth import get_current_user
from ..reports_excel import build_f006_workbook, build_f015_workbook
from ..reports_pdf import build_report_pdf

router = APIRouter(prefix="/reports", tags=["Reportes"])

_XLSX_MEDIA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_FORMATOS_PDF = {"f005", "f006", "f015", "f158", "f204"}


@router.get("/pdf/{formato}")
def reporte_pdf(
    formato: str,
    desde: datetime = Query(..., description="Inicio del rango (fecha y hora)"),
    hasta: datetime = Query(..., description="Fin del rango (fecha y hora)"),
    user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Genera un PDF (resumen + detalle) del formato en el rango [desde, hasta]."""
    if formato not in _FORMATOS_PDF:
        raise HTTPException(status_code=404, detail="Formato no válido")
    if hasta < desde:
        raise HTTPException(status_code=400, detail="El rango de fechas es inválido")
    pdf = build_report_pdf(formato, desde, hasta, user.nombre, db)
    nombre = f"reporte_{formato}_{desde:%Y%m%d-%H%M}_{hasta:%Y%m%d-%H%M}.pdf"
    return StreamingResponse(
        BytesIO(pdf), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


@router.get("/f006")
def reporte_f006(
    fecha: date = Query(...),
    turno: Optional[int] = None,
    formato: str = Query("json", pattern="^(json|xlsx)$"),
    db: Session = Depends(get_db),
):
    q = db.query(models.F006Registro).filter(models.F006Registro.fecha == fecha)
    if turno:
        q = q.filter(models.F006Registro.turno == turno)
    registros = q.order_by(models.F006Registro.creado_en).all()

    if formato == "xlsx":
        stream = build_f006_workbook(registros, fecha, turno)
        nombre = f"F-006_{fecha}" + (f"_T{turno}" if turno else "") + ".xlsx"
        return StreamingResponse(
            stream,
            media_type=_XLSX_MEDIA,
            headers={"Content-Disposition": f"attachment; filename={nombre}"},
        )

    data = [schemas.F006RegistroOut.model_validate(r).model_dump(mode="json") for r in registros]
    return JSONResponse(data)


@router.get("/f015")
def reporte_f015(
    fecha: date = Query(...),
    formato: str = Query("json", pattern="^(json|xlsx)$"),
    db: Session = Depends(get_db),
):
    inicio = datetime.combine(fecha, time.min)
    fin = datetime.combine(fecha, time.max)
    mediciones = (
        db.query(models.F015Medicion)
        .filter(models.F015Medicion.fecha_hora >= inicio, models.F015Medicion.fecha_hora <= fin)
        .order_by(models.F015Medicion.fecha_hora)
        .all()
    )

    if formato == "xlsx":
        stream = build_f015_workbook(mediciones, fecha)
        nombre = f"F-015_{fecha}.xlsx"
        return StreamingResponse(
            stream,
            media_type=_XLSX_MEDIA,
            headers={"Content-Disposition": f"attachment; filename={nombre}"},
        )

    data = [schemas.F015MedicionOut.model_validate(m).model_dump(mode="json") for m in mediciones]
    return JSONResponse(data)
