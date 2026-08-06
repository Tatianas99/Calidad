"""Capa de acceso a datos: engine SQLAlchemy, sesión y base declarativa.

Funciona con SQLite (desarrollo local) y con SQL Server / Azure SQL (producción,
vía mssql+pyodbc). En SQL Server las tablas viven en el esquema 'calidad'.
"""
from sqlalchemy import create_engine, MetaData, text
from sqlalchemy.orm import sessionmaker, declarative_base

from .config import DATABASE_URL, DB_SCHEMA, _IS_SQLITE

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

    _ensure_persona_sync_columns()
    # Enlace de referencias con dbo.PQRS_Referencias y campo libre de marca en F-006.
    _ensure_columns("referencias", [("origen_id", "INTEGER", "INT NULL")])
    _ensure_columns("maquinas", [("origen_id", "INTEGER", "INT NULL")])
    _ensure_columns("f006_registro", [("marca", "VARCHAR(80)", "NVARCHAR(80) NULL")])
    # Mediciones del producto (reintroducidas por solicitud del área de calidad).
    _ensure_columns("f006_registro", [
        ("altura_vaso", "VARCHAR(40)", "NVARCHAR(40) NULL"),
        ("diametro_superior", "VARCHAR(40)", "NVARCHAR(40) NULL"),
        ("diametro_inferior", "VARCHAR(40)", "NVARCHAR(40) NULL"),
        ("grueso_rim", "VARCHAR(40)", "NVARCHAR(40) NULL"),
    ])
    # F-005: proceso, máquina e ítem de estado "inocuidad" (agregados después).
    _ensure_columns("f005_registro", [
        ("proceso", "VARCHAR(30)", "NVARCHAR(30) NULL"),
        ("maquina", "VARCHAR(60)", "NVARCHAR(60) NULL"),
        ("estado_inocuidad", "VARCHAR(4)", "NVARCHAR(4) NULL"),
    ])
    # Campos "buscar/escribir": máquina en texto (F-006/F-204), punto en texto
    # (F-015), OP y auxiliar automático (F-006). Se hacen anulables las FK viejas.
    _ensure_columns("f006_registro", [
        ("orden_produccion", "VARCHAR(40)", "NVARCHAR(40) NULL"),
        ("maquina_texto", "VARCHAR(80)", "NVARCHAR(80) NULL"),
        ("auxiliar_nombre", "VARCHAR(120)", "NVARCHAR(120) NULL"),
        ("referencia_texto", "VARCHAR(200)", "NVARCHAR(200) NULL"),
    ])
    _ensure_columns("f204_registro", [
        ("maquina_texto", "VARCHAR(80)", "NVARCHAR(80) NULL"),
        ("orden_produccion", "VARCHAR(40)", "NVARCHAR(40) NULL"),
        ("referencia_texto", "VARCHAR(200)", "NVARCHAR(200) NULL"),
    ])
    _ensure_columns("f015_medicion", [
        ("punto_texto", "VARCHAR(120)", "NVARCHAR(120) NULL"),
        ("responsable_nombre", "VARCHAR(120)", "NVARCHAR(120) NULL"),
    ])
    _make_nullable("f006_registro", "maquina_id", "INT")
    _make_nullable("f204_registro", "maquina_id", "INT")
    _make_nullable("f015_medicion", "punto_medicion_id", "INT")
    # La referencia ahora se trae de la OP como texto; la FK vieja queda anulable.
    _make_nullable("f006_registro", "referencia_id", "INT")
    _make_nullable("f204_registro", "referencia_id", "INT")


def _ensure_columns(tabla: str, columnas: list[tuple[str, str, str]]):
    """Micro-migración genérica: añade columnas faltantes de forma idempotente.

    columnas: lista de (nombre, tipo_sqlite, tipo_sqlserver).
    """
    if _IS_SQLITE:
        with engine.begin() as conn:
            existentes = {r[1] for r in conn.execute(text(f"PRAGMA table_info({tabla})"))}
            if not existentes:
                return
            for col, tipo_sqlite, _ in columnas:
                if col not in existentes:
                    conn.execute(text(f"ALTER TABLE {tabla} ADD COLUMN {col} {tipo_sqlite}"))
    else:
        with engine.begin() as conn:
            if conn.execute(text(f"SELECT OBJECT_ID('{DB_SCHEMA}.{tabla}', 'U')")).scalar() is None:
                return
            for col, _, tipo_mssql in columnas:
                existe_col = conn.execute(
                    text(
                        "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS "
                        f"WHERE TABLE_SCHEMA = '{DB_SCHEMA}' AND TABLE_NAME = '{tabla}' "
                        f"AND COLUMN_NAME = '{col}'"
                    )
                ).scalar()
                if existe_col is None:
                    conn.execute(text(f"ALTER TABLE [{DB_SCHEMA}].[{tabla}] ADD {col} {tipo_mssql}"))


def _make_nullable(tabla: str, col: str, tipo_mssql: str):
    """Hace anulable una columna existente (idempotente). Solo SQL Server.

    Necesario para permitir valores de texto libre en campos que antes eran FK
    obligatorias (máquina, punto de medición). En SQLite no aplica (dev).
    """
    if _IS_SQLITE:
        return
    with engine.begin() as conn:
        if conn.execute(text(f"SELECT OBJECT_ID('{DB_SCHEMA}.{tabla}', 'U')")).scalar() is None:
            return
        es_nullable = conn.execute(
            text(
                "SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS "
                f"WHERE TABLE_SCHEMA = '{DB_SCHEMA}' AND TABLE_NAME = '{tabla}' "
                f"AND COLUMN_NAME = '{col}'"
            )
        ).scalar()
        if es_nullable == "NO":
            conn.execute(text(f"ALTER TABLE [{DB_SCHEMA}].[{tabla}] ALTER COLUMN {col} {tipo_mssql} NULL"))


def _ensure_persona_sync_columns():
    """Micro-migración: añade las columnas de sincronización a `personas`.

    `create_all`/OBJECT_ID solo crean tablas nuevas; no alteran una tabla
    `personas` preexistente (creada antes de introducir la sincronización con
    personal_planta). Aquí se añaden `origen_id` y `cedula` de forma idempotente.
    """
    # (columna, tipo SQLite, tipo SQL Server)
    columnas = [
        ("origen_id", "INTEGER", "INT NULL"),
        ("cedula", "VARCHAR(20)", "NVARCHAR(20) NULL"),
    ]
    if _IS_SQLITE:
        with engine.begin() as conn:
            existentes = {r[1] for r in conn.execute(text("PRAGMA table_info(personas)"))}
            if not existentes:
                return  # la tabla aún no existe
            for col, tipo_sqlite, _ in columnas:
                if col not in existentes:
                    conn.execute(text(f"ALTER TABLE personas ADD COLUMN {col} {tipo_sqlite}"))
    else:
        with engine.begin() as conn:
            existe_tabla = conn.execute(
                text(f"SELECT OBJECT_ID('{DB_SCHEMA}.personas', 'U')")
            ).scalar()
            if existe_tabla is None:
                return
            for col, _, tipo_mssql in columnas:
                existe_col = conn.execute(
                    text(
                        "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS "
                        f"WHERE TABLE_SCHEMA = '{DB_SCHEMA}' AND TABLE_NAME = 'personas' "
                        f"AND COLUMN_NAME = '{col}'"
                    )
                ).scalar()
                if existe_col is None:
                    conn.execute(
                        text(f"ALTER TABLE [{DB_SCHEMA}].[personas] ADD {col} {tipo_mssql}")
                    )
