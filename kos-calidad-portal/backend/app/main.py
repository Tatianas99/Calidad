"""Punto de entrada de la API del Portal de Calidad KOS Colombia."""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from fastapi import Depends

from . import storage
from .config import CORS_ORIGINS, UPLOADS_DIR
from .db import init_db, SessionLocal
from .auth import get_current_user
from .personal import sync_personas
from .referencias_sync import sync_referencias
from .routers import catalogos, f005, f006, f015, f158, f204, reports, auth as auth_router, usuarios

log = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()  # crea tablas si no existen (dev/arranque)
    storage.preparar()  # contenedor de adjuntos (Azure) o carpeta local
    # Sincroniza el catálogo de personas desde kos_apps.personal_planta.
    # Best-effort: si la base de personal no está disponible, el portal arranca
    # igual con el último catálogo sincronizado.
    try:
        db = SessionLocal()
        try:
            sync_personas(db)
            sync_referencias(db)
        finally:
            db.close()
    except Exception:
        log.exception("No se pudo sincronizar catálogos (personal/referencias) al arranque")
    yield


app = FastAPI(
    title="Portal de Calidad KOS Colombia",
    description="API de digitalización de formatos de calidad (piloto: F-006 y F-015).",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

# Archivos subidos (fotos/videos de F-158). En producción viven en Azure Data
# Lake y el navegador los descarga directo con un enlace temporal, así que aquí
# no hay nada que servir. Solo en desarrollo (sin AZURE_STORAGE_ACCOUNT) se
# guardan en disco y se exponen en /uploads/…
if not storage.usa_azure():
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


@app.get("/health", tags=["Salud"])
def health():
    return {"status": "ok"}


# Endpoints abiertos: salud y autenticación.
app.include_router(auth_router.router)

# Endpoints protegidos: requieren token de sesión válido.
_auth = [Depends(get_current_user)]
app.include_router(catalogos.router, dependencies=_auth)
app.include_router(f005.router, dependencies=_auth)
app.include_router(f006.router, dependencies=_auth)
app.include_router(f015.router, dependencies=_auth)
app.include_router(f158.router, dependencies=_auth)
app.include_router(f204.router, dependencies=_auth)
app.include_router(reports.router, dependencies=_auth)
app.include_router(usuarios.router)  # ya exige permiso gestionar_usuarios internamente

# Build del frontend (frontend/dist copiado aquí en el pipeline de despliegue).
# Se monta al final para que las rutas de la API definidas arriba tengan prioridad.
_STATIC_DIR = Path(__file__).resolve().parent / "static"
if _STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(_STATIC_DIR), html=True), name="frontend")
