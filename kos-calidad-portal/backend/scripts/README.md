# Regenerar la base de datos de Fichas técnicas

`extract_fichas.py` lee las carpetas de fichas (VASO P1, VASOS P2, CONTENEDORES,
CAJA CHINA) que están en la raíz del proyecto (`CALIDAD DIG/`), extrae la tabla
de dimensiones (Excel con openpyxl, PDF con pdfplumber) y genera:

- `backend/app/fichas_tecnicas.json` — la base de datos (referencia, plastificado,
  diámetro inferior, rim, diámetro exterior, altura, archivo).
- `backend/app/static/fichas/*` — copia de cada PDF/Excel (lo que abre la lupa).

## Cómo correrlo (solo para actualizar cuando cambien las fichas)

```
cd backend
./.venv/Scripts/python.exe -m pip install openpyxl pdfplumber pypdf pillow
PYTHONIOENCODING=utf-8 ./.venv/Scripts/python.exe scripts/extract_fichas.py
```

Revisa la salida (imprime cada ficha con sus medidas) y luego despliega.
`pdfplumber`/`pypdf` NO están en `requirements.txt` porque solo se usan aquí, no
en tiempo de ejecución del portal.
