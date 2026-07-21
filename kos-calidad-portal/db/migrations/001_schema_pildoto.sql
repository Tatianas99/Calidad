/* =====================================================================
   Portal de Calidad KOS Colombia — Esquema piloto (F-006 + F-015)
   Motor: SQL Server / Azure SQL Database
   Uso:   ejecutar una vez sobre la base de datos de la aplicación.
   Nota:  el backend también puede crear estas tablas automáticamente
          (init_db). Este script es la referencia para producción.
   ===================================================================== */

/* ---------------------- Catálogos ---------------------- */
IF OBJECT_ID('dbo.personas', 'U') IS NULL
CREATE TABLE dbo.personas (
    id      INT IDENTITY(1,1) PRIMARY KEY,
    nombre  NVARCHAR(120) NOT NULL,
    rol     NVARCHAR(30)  NOT NULL,   -- auxiliar | operario | empacador | responsable
    activo  BIT NOT NULL DEFAULT 1
);

IF OBJECT_ID('dbo.maquinas', 'U') IS NULL
CREATE TABLE dbo.maquinas (
    id      INT IDENTITY(1,1) PRIMARY KEY,
    nombre  NVARCHAR(80) NOT NULL,
    area    NVARCHAR(60) NULL,
    activo  BIT NOT NULL DEFAULT 1
);

IF OBJECT_ID('dbo.referencias', 'U') IS NULL
CREATE TABLE dbo.referencias (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    codigo        NVARCHAR(60)  NOT NULL,
    descripcion   NVARCHAR(160) NULL,
    tipo_producto NVARCHAR(40)  NULL,   -- vaso | tazon | tapa_papel | tapa_plastica
    activo        BIT NOT NULL DEFAULT 1
);

IF OBJECT_ID('dbo.puntos_medicion', 'U') IS NULL
CREATE TABLE dbo.puntos_medicion (
    id      INT IDENTITY(1,1) PRIMARY KEY,
    nombre  NVARCHAR(120) NOT NULL,
    activo  BIT NOT NULL DEFAULT 1
);

/* ---------------------- F-006 — Vasos ---------------------- */
IF OBJECT_ID('dbo.f006_registro', 'U') IS NULL
CREATE TABLE dbo.f006_registro (
    id            CHAR(36) PRIMARY KEY,               -- UUID generado en el cliente
    referencia_id INT NOT NULL REFERENCES dbo.referencias(id),
    fecha         DATE NOT NULL,
    maquina_id    INT NOT NULL REFERENCES dbo.maquinas(id),
    turno         INT NOT NULL,
    auxiliar_id   INT NULL REFERENCES dbo.personas(id),
    operario_id   INT NULL REFERENCES dbo.personas(id),
    empacador_id  INT NULL REFERENCES dbo.personas(id),
    creado_en     DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_f006_fecha_turno')
CREATE INDEX ix_f006_fecha_turno ON dbo.f006_registro (fecha, turno);

IF OBJECT_ID('dbo.f006_embalaje', 'U') IS NULL
CREATE TABLE dbo.f006_embalaje (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    registro_id  CHAR(36) NOT NULL REFERENCES dbo.f006_registro(id),
    item         NVARCHAR(40) NOT NULL,   -- clave del ítem de embalaje
    resultado    NVARCHAR(4)  NOT NULL    -- C | NC | N/A
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_f006_embalaje_reg')
CREATE INDEX ix_f006_embalaje_reg ON dbo.f006_embalaje (registro_id);

IF OBJECT_ID('dbo.f006_filtracion', 'U') IS NULL
CREATE TABLE dbo.f006_filtracion (
    id                CHAR(36) PRIMARY KEY,          -- UUID generado en el cliente
    registro_id       CHAR(36) NOT NULL REFERENCES dbo.f006_registro(id),
    hora_montaje      DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    tipo_prueba       NVARCHAR(30) NOT NULL,         -- cafe_caliente | cafe_frio | agua_fria | rojo_escarlata | glicerina
    tipo_material     NVARCHAR(20) NOT NULL,         -- P1 | P2 | cero_plastico | SP
    cantidad_muestra  INT NOT NULL,
    hora_lectura      DATETIME2 NULL,
    cantidad_cumple   INT NULL,                      -- no filtra
    cantidad_nocumple INT NULL,                      -- filtra
    comentario        NVARCHAR(4000) NULL,
    estado            NVARCHAR(15) NOT NULL DEFAULT 'en_proceso'  -- en_proceso | finalizada
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_f006_filtracion_reg')
CREATE INDEX ix_f006_filtracion_reg ON dbo.f006_filtracion (registro_id);

/* ---------------------- F-015 — Cloro / PH ---------------------- */
IF OBJECT_ID('dbo.f015_medicion', 'U') IS NULL
CREATE TABLE dbo.f015_medicion (
    id                 CHAR(36) PRIMARY KEY,         -- UUID generado en el cliente
    fecha_hora         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    punto_medicion_id  INT NOT NULL REFERENCES dbo.puntos_medicion(id),
    ph                 FLOAT NOT NULL,
    cloro              FLOAT NOT NULL,
    responsable_id     INT NULL REFERENCES dbo.personas(id),
    ph_en_rango        BIT NOT NULL,                 -- 6.5 – 8.5
    cloro_en_rango     BIT NOT NULL,                 -- 0.3 – 2
    comentario         NVARCHAR(4000) NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_f015_fecha')
CREATE INDEX ix_f015_fecha ON dbo.f015_medicion (fecha_hora);
GO
