"""Capa de acceso a datos: engine SQLAlchemy, sesión y base declarativa.

Funciona con SQLite (desarrollo local) y con SQL Server / Azure SQL (producción,
vía mssql+pyodbc). En SQL Server las tablas viven en el esquema 'calidad'.
"""
from sqlalchemy import create_engine, MetaData, text
from sqlalchemy.orm import sessionmaker, declarative_base

from .config import DATABASE_URL, DB_SCHEMA

connect_args = {}
engine_kwargs = dict(pool_pre_ping=True, future=True)
if DATABASE_URL.startswith("sqlite"):
    # SQLite necesita esto para usarse desde varios hilos (uvicorn).
    connect_args = {"check_same_thread": False}
else:
    # El driver ODBC legacy 'SQL Server' falla (HY104) con setinputsizes de
    # pyodbc; desactivarlo lo hace compatible. Con el Driver 18 también funciona.
    engine_kwargs["use_setinputsizes"] = False

engine = create_engine(DATABASE_URL, connect_args=connect_args, **engine_kwargs)

# Todas las tablas se ubican en DB_SCHEMA (p. ej. 'calidad') en SQL Server;
# en SQLite DB_SCHEMA es None (sin esquema).
metadata = MetaData(schema=DB_SCHEMA)
Base = declarative_base(metadata=metadata)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db():
    """Dependencia de FastAPI: entrega una sesión y la cierra al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Crea el esquema (si aplica) y las tablas si no existen.

    En SQL Server se evita la reflexión de SQLAlchemy (checkfirst) porque el
    driver ODBC legacy 'SQL Server' falla al enlazar CAST(? AS NVARCHAR(max)).
    Se comprueba la existencia con OBJECT_ID (literal, sin parámetros).
    """
    from . import models  # noqa: F401  (registra los modelos en el metadata)

    if DB_SCHEMA:
        with engine.begin() as conn:
            conn.execute(
                text(
                    f"IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = '{DB_SCHEMA}') "
                    f"EXEC('CREATE SCHEMA {DB_SCHEMA}')"
                )
            )
        for table in Base.metadata.sorted_tables:  # ordenadas por dependencia (FKs)
            with engine.begin() as conn:
                existe = conn.execute(
                    text(f"SELECT OBJECT_ID('{DB_SCHEMA}.{table.name}', 'U')")
                ).scalar()
                if existe is None:
                    table.create(bind=conn, checkfirst=False)
    else:
        Base.metadata.create_all(bind=engine)
