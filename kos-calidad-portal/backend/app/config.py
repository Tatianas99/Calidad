"""Configuración de la aplicación (leída de variables de entorno / .env).

Conexión a base de datos, en orden de prioridad:
  1. DATABASE_URL explícita (p. ej. sqlite para desarrollo local).
  2. Variables BD_HOST/BD_NAME/BD_USER/BD_PASSWORD -> Azure SQL / SQL Server.
  3. SQLite local por defecto.
"""
import os
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv

# Cargar .env del backend y de la raíz del proyecto (si existen).
_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_ROOT / "backend" / ".env")
load_dotenv(_ROOT / ".env")


def _best_sqlserver_driver() -> str:
    """Elige el mejor driver ODBC de SQL Server instalado."""
    preferidos = [
        "ODBC Driver 18 for SQL Server",
        "ODBC Driver 17 for SQL Server",
        "SQL Server",  # legacy (funciona con Azure SQL en Windows moderno)
    ]
    try:
        import pyodbc
        instalados = set(pyodbc.drivers())
    except Exception:
        instalados = set()
    for d in preferidos:
        if d in instalados:
            return d
    return "ODBC Driver 18 for SQL Server"


def _build_mssql_url():
    host = os.getenv("BD_HOST")
    name = os.getenv("BD_NAME")
    user = os.getenv("BD_USER")
    pwd = os.getenv("BD_PASSWORD")
    if not (host and name and user and pwd):
        return None
    driver = os.getenv("ODBC_DRIVER") or _best_sqlserver_driver()
    parts = [
        f"DRIVER={{{driver}}}",
        f"SERVER={host}",
        f"DATABASE={name}",
        f"UID={user}",
        f"PWD={pwd}",
        "Encrypt=yes",
    ]
    # Los drivers modernos aceptan estas opciones; el legacy 'SQL Server' no.
    if "17" in driver or "18" in driver:
        parts += ["TrustServerCertificate=no", "Connection Timeout=30"]
    odbc = quote_plus(";".join(parts) + ";")
    return f"mssql+pyodbc:///?odbc_connect={odbc}"


DATABASE_URL = os.getenv("DATABASE_URL") or _build_mssql_url() or "sqlite:///./kos_calidad.db"

_IS_SQLITE = DATABASE_URL.startswith("sqlite")

# Esquema dedicado en SQL Server para aislar las tablas del portal de calidad
# de las tablas existentes (ecommerce / PQRS / facturas). En SQLite no aplica.
DB_SCHEMA = None if _IS_SQLITE else os.getenv("DB_SCHEMA", "calidad")

# Orígenes permitidos para CORS (frontend). Separados por coma.
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

# Rangos esperados para F-015 (medición de cloro y PH del agua).
PH_MIN, PH_MAX = 6.5, 8.5
CLORO_MIN, CLORO_MAX = 0.3, 2.0

# Secreto para firmar tokens de sesión (cambiar en producción vía variable de entorno).
SECRET_KEY = os.getenv("SECRET_KEY", "kos-calidad-dev-secret-CAMBIAR-EN-PRODUCCION")
# Duración del token de sesión (segundos). 30 días para no cortar turnos largos.
TOKEN_TTL = int(os.getenv("TOKEN_TTL", str(30 * 24 * 3600)))
