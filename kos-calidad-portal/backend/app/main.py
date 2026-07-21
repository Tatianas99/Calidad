"""Punto de entrada de la API del Portal de Calidad KOS Colombia."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from fastapi import Depends

from .config import CORS_ORIGINS
from .db import init_db
from .auth import get_current_user
from .routers import catalogos, f006, f015, reports, auth as auth_router, usuarios


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()  # crea tablas si no existen (dev/arranque)
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


@app.get("/health", tags=["Salud"])
def health():
    return {"status": "ok"}


# Endpoints abiertos: salud y autenticación.
app.include_router(auth_router.router)

# Endpoints protegidos: requieren token de sesión válido.
_auth = [Depends(get_current_user)]
app.include_router(catalogos.router, dependencies=_auth)
app.include_router(f006.router, dependencies=_auth)
app.include_router(f015.router, dependencies=_auth)
app.include_router(reports.router, dependencies=_auth)
app.include_router(usuarios.router)  # ya exige permiso gestionar_usuarios internamente
