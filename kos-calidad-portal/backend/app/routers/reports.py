"""Endpoints de reportes (datos JSON y archivo Excel). Consumidos por n8n."""
from datetime import date, datetime, time
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..reports_excel import build_f006_workbook, build_f015_workbook

router = APIRouter(prefix="/reports", tags=["Reportes"])

_XLSX_MEDIA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


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
