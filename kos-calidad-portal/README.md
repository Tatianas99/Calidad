# Portal de Calidad — KOS Colombia

Digitalización de los formatos de calidad. **Piloto: F-006 (Ruta control proceso
vasos) y F-015 (Cloro y PH del agua)**. Las personas diligencian desde una tablet;
los datos se guardan en SQL Server / Azure SQL.

## Arquitectura

```
 Tablet (React PWA-lite) ──HTTP──> API (FastAPI) ──> Azure SQL Database (esquema 'calidad')
        borrador local + reintento            ▲
                                              └── n8n (agenda) → Excel → correo
```

- **frontend/** — React + Vite + TypeScript. UI para tablet, borrador local y cola de reintento.
- **backend/** — FastAPI + SQLAlchemy. Funciona con SQLite (local) o Azure SQL (producción).
- **db/migrations/** — DDL de referencia para SQL Server.
- **n8n/** — workflow de reportes diarios por correo.

---

## Requisitos

- Python 3.11+ (probado en 3.14) · Node 18+ (probado en 24)
- Para Azure SQL en producción: **ODBC Driver 18 for SQL Server** (ver nota abajo).

---

## 1) Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Ejecutar en local (SQLite, sin instalar nada)

```powershell
$env:DATABASE_URL = "sqlite:///./dev_local.db"
python -m app.seed        # crea tablas + catálogos de ejemplo
python -m uvicorn app.main:app --reload --port 8000
```

### Ejecutar contra Azure SQL

La conexión se arma automáticamente desde `.env` en la raíz del proyecto
(`BD_HOST`, `BD_NAME`, `BD_USER`, `BD_PASSWORD`). **No** definas `DATABASE_URL`
y el backend usará Azure. Las tablas se crean en el esquema **`calidad`**
(aislado de las tablas existentes de la base).

```powershell
Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
python -c "from app.db import init_db; init_db()"   # crea esquema + tablas (aditivo)
python -m app.seed                                   # cargar catálogos reales (editar app/seed.py)
python -m uvicorn app.main:app --port 8000
```

Docs interactivas de la API: `http://localhost:8000/docs`

> **Nota sobre el driver ODBC.** El servidor actual solo tiene el driver legacy
> *"SQL Server"*. El backend lo soporta (usa `use_setinputsizes=False`, evita la
> reflexión y booleanos con `= 1`). **Recomendado para producción:** instalar el
> Driver 18 (como administrador) para mayor rendimiento y soporte:
> `winget install --id Microsoft.msodbcsql.18`. El backend lo detecta y usa
> automáticamente sin cambios de código.

---

## 2) Frontend

```powershell
cd frontend
npm install
# apuntar a la API (por defecto http://localhost:8000)
copy .env.example .env
npm run dev      # http://localhost:5173
```

Build de producción: `npm run build` (genera `dist/`).

---

## 3) n8n (reportes por correo)

1. Importar `n8n/reporte_diario_calidad.json`.
2. Definir la variable de entorno `KOS_API_URL` (URL pública del backend).
3. Configurar una credencial **SMTP** y asignarla al nodo *Enviar por correo*.
4. Ajustar destinatarios, asunto y la agenda (cron, por defecto 22:00 diario).
5. Activar el workflow. Descarga los Excel F-006 y F-015 del día y los envía.

n8n necesita su propia base de datos (se recomienda PostgreSQL, no la de la app).

---

## Base de datos

Esquema **`calidad`** en Azure SQL. Tablas: `personas`, `maquinas`,
`referencias`, `puntos_medicion`, `f006_registro`, `f006_embalaje`,
`f006_filtracion`, `f015_medicion`. DDL de referencia en
`db/migrations/001_schema_pildoto.sql`.

Los catálogos (personas, máquinas, referencias, puntos) se editan en
`backend/app/seed.py` o directamente en la base.

---

## Verificación

- **Backend (SQLite y Azure):** el flujo completo está probado —crear registro
  F-006, embalaje, filtración con hora automática, resultado a los 20 min, firmas;
  medición F-015 con banderas de rango; y generación de Excel.
- **Frontend:** `npm run build` compila sin errores.
- **Prueba de resiliencia:** en el navegador, desconecta la red (DevTools →
  Network → Offline), diligencia un formulario y envíalo: queda *"pendiente de
  sincronizar"*; al reconectar se envía sin duplicar (idempotencia por UUID).

---

## Seguridad

- Las firmas se registran por **selección de nombre** (sin PIN). Proteger el
  **acceso al portal** a nivel de red/app (IP de la WiFi de planta o Azure AD).
- Secretos (cadena de conexión, SMTP) en variables de entorno / Azure Key Vault.
  **Nunca** subir `.env` al repositorio (ya está en `.gitignore`).

---

## Próximas fases (fuera del piloto)

Reutilizando esta plataforma: **F-204** (Clase B y desperdicio), **F-086**
(Ruta tapas) y **F-158** (Auxiliares de calidad, rediseño por recorridos).
Ver el plan en `../plans`.
