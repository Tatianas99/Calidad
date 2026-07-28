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


def _build_mssql_url(name: str | None = None):
    """Construye la URL SQLAlchemy/ODBC para una base concreta del mismo servidor.

    Si `name` es None se usa BD_NAME (la base del portal de calidad). Con `name`
    explícito se apunta a otra base del mismo servidor (mismas credenciales),
    p. ej. `kos_apps` para leer la tabla de personal de planta.
    """
    host = os.getenv("BD_HOST")
    name = name or os.getenv("BD_NAME")
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

# Base de datos de aplicaciones KOS (mismo servidor y credenciales) que contiene
# la tabla `personal_planta`. Sirve para poblar el catálogo de personas del
# portal. Si no está configurada (o corremos en SQLite local), queda en None y
# la sincronización simplemente no se ejecuta.
BD_NAME_DATA = os.getenv("BD_NAME_DATA")
DATA_DATABASE_URL = _build_mssql_url(BD_NAME_DATA) if BD_NAME_DATA else None

_IS_SQLITE = DATABASE_URL.startswith("sqlite")

# Esquema dedicado en SQL Server para aislar las tablas del portal de calidad
# de las tablas existentes (ecommerce / PQRS / facturas). En SQLite no aplica.
DB_SCHEMA = None if _IS_SQLITE else os.getenv("DB_SCHEMA", "calidad")

# Orígenes permitidos para CORS (frontend). Separados por coma.
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

# Rangos esperados para F-015 (medición de cloro y PH del agua).
PH_MIN, PH_MAX = 6.5, 8.5
CLORO_MIN, CLORO_MAX = 0.3, 2.0

# --------------------------------------------------------------------------- #
# Almacenamiento de adjuntos (fotos/videos de los formatos)
# --------------------------------------------------------------------------- #
# Nombre de la cuenta de Azure Data Lake / Blob Storage. Si está definida, los
# adjuntos van a Azure; si no, se guardan en backend/uploads/ (desarrollo).
# En producción es obligatoria: el disco del App Service se borra en cada
# despliegue. La autenticación es por identidad administrada, sin claves aquí.
def _parse_conn_str(cs: str) -> dict:
    """Descompone una cadena de conexión de Azure Storage en sus partes."""
    partes = {}
    for trozo in cs.split(";"):
        if "=" in trozo:
            k, v = trozo.split("=", 1)
            partes[k.strip().lower()] = v.strip()
    return partes


_cuenta = (os.getenv("AZURE_STORAGE_ACCOUNT") or "").strip()
_conn = (os.getenv("AZURE_STORAGE_CONNECTION_STRING") or "").strip()

# Si en AZURE_STORAGE_ACCOUNT pegaron la cadena de conexión entera en vez del
# nombre de la cuenta, se acepta igual: se saca el nombre (y la clave) de ahí en
# lugar de fallar con un error difícil de entender.
if "accountname=" in _cuenta.lower():
    _conn = _conn or _cuenta
    _cuenta = ""

_partes = _parse_conn_str(_conn) if _conn else {}

AZURE_STORAGE_ACCOUNT = _cuenta or _partes.get("accountname") or None
# Clave de la cuenta: solo si se configuró una cadena de conexión. Con identidad
# administrada queda en None, que es el modo recomendado (sin secretos).
AZURE_STORAGE_KEY = _partes.get("accountkey")
AZURE_STORAGE_CONTAINER = os.getenv("AZURE_STORAGE_CONTAINER", "adjuntos")
_sufijo = _partes.get("endpointsuffix", "core.windows.net")
AZURE_STORAGE_URL = (
    os.getenv("AZURE_STORAGE_URL")
    or (f"https://{AZURE_STORAGE_ACCOUNT}.blob.{_sufijo}" if AZURE_STORAGE_ACCOUNT else "")
)
# Validez (segundos) de los enlaces temporales de descarga. 1 hora alcanza para
# revisar un recorrido; si un video queda abierto más tiempo, basta con recargar.
SAS_TTL = int(os.getenv("SAS_TTL", "3600"))

# Carpeta local de adjuntos (modo desarrollo, y caché de nada más).
UPLOADS_DIR = _ROOT / "backend" / "uploads"

# Secreto para firmar tokens de sesión (cambiar en producción vía variable de entorno).
SECRET_KEY = os.getenv("SECRET_KEY", "kos-calidad-dev-secret-CAMBIAR-EN-PRODUCCION")
# Duración del token de sesión (segundos). 30 días para no cortar turnos largos.
TOKEN_TTL = int(os.getenv("TOKEN_TTL", str(30 * 24 * 3600)))
