"""Utilidades de fecha/hora en zona horaria de Colombia (UTC-5, sin horario de verano).

Se almacena hora local de Colombia para que la 'hora' registrada por el sistema
sea correcta sin importar en qué zona corra el servidor (p. ej. Azure en UTC).
"""
from datetime import datetime, timezone, timedelta

CO_TZ = timezone(timedelta(hours=-5))


def now_co() -> datetime:
    """Fecha y hora actual de Colombia como datetime naive (sin tzinfo)."""
    return datetime.now(CO_TZ).replace(tzinfo=None)


def today_co():
    return now_co().date()
