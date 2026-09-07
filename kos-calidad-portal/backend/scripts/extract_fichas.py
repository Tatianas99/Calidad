"""Extrae la tabla de dimensiones de todas las fichas técnicas (PDF y Excel)."""
import json, os, re, unicodedata, glob

BASE = r"c:/Users/tatianas/OneDrive - kos colombia/CALIDAD KOS COLOMBIA - SISTEMA DE GESTION DE INOCUIDAD/CALIDAD DIG"
CARPETAS = {"VASO P1": "Vaso P1", "VASOS P2": "Vaso P2", "CONTENEDORES": "Contenedor", "CAJA CHINA": "Caja china"}


def norm(s):
    s = "" if s is None else str(s)
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower().strip()


def col_idx(headers, key):
    for i, h in enumerate(headers):
        if key in norm(h):
            return i
    return None


def _val(values, i):
    if i is None or i >= len(values):
        return ""
    v = values[i]
    return ("" if v is None else str(v)).replace("\n", " ").strip()


def mapear(headers, values):
    inf_i = col_idx(headers, "inferior")
    sup_i = col_idx(headers, "superior")
    alt_i = col_idx(headers, "altura")
    rim_i = col_idx(headers, "reborde")
    # Si el encabezado "reborde" viene partido/ilegible, usar la columna
    # intermedia entre inferior y superior (así lo tiene la plantilla).
    if rim_i is None and inf_i is not None and sup_i is not None and (sup_i - inf_i) >= 2:
        rim_i = inf_i + 1
    return {
        "plastificado": _val(values, col_idx(headers, "plastificado")),
        "diam_inferior": _val(values, inf_i),
        "rim": _val(values, rim_i),
        "diam_exterior": _val(values, sup_i),
        "altura": _val(values, alt_i),
    }


def _es_encabezado(joined):
    return "inferior" in joined and ("reborde" in joined or "superior" in joined or "altura" in joined)


def _titulo_rows(rows):
    for row in rows[:8]:
        for c in row:
            if c and norm(c).startswith("ficha"):
                return str(c).replace("\n", " ").strip()
    return ""


def tabla_excel(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True)
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        for r, row in enumerate(rows):
            joined = norm(" ".join(str(c) for c in row if c))
            if _es_encabezado(joined):
                headers = [("" if c is None else str(c)) for c in row]
                ci = col_idx(headers, "inferior")
                for vr in rows[r + 1:r + 6]:
                    if ci is not None and ci < len(vr) and vr[ci] not in (None, ""):
                        return headers, list(vr), _titulo_rows(rows)
    return None, None, None


def tabla_pdf(path):
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        for pg in pdf.pages:
            for t in pg.extract_tables():
                for r, row in enumerate(t):
                    joined = norm(" ".join(str(c) for c in row if c))
                    if _es_encabezado(joined) and r + 1 < len(t):
                        # título tomado de la misma página de dimensiones
                        titulo = ""
                        for ln in (pg.extract_text() or "").splitlines():
                            if norm(ln).startswith("ficha"):
                                titulo = ln.strip(); break
                        return [("" if c is None else str(c)) for c in row], t[r + 1], titulo
    return None, None, ""


def codigo(fn):
    m = re.search(r"FCH-PT-\s*(\d+)", fn)
    return f"FCH-PT-{m.group(1)}" if m else ""


def clean_ref(fn):
    b = re.sub(r"\.(pdf|xlsx)$", "", fn, flags=re.I)
    b = re.sub(r"FCH-PT-\s*\d*", "", b)
    b = re.sub(r"-PO-\S+", "", b)
    b = re.sub(r"[-\s]*copia", "", b, flags=re.I)
    b = re.sub(r"\bC\.?0\.?0?\.?0?1?[0-9]\b", "", b)   # calibres C.0.016, C.0.0.16
    b = re.sub(r"\bC\d{1,2}\b", "", b)                  # C10, C12, C13, C16
    b = re.sub(r"[.]+", " ", b)
    b = re.sub(r"\s+", " ", b).strip(" -.")
    return b.upper()


registros = {}
for carpeta, cat in CARPETAS.items():
    for path in glob.glob(os.path.join(BASE, carpeta, "*")):
        fn = os.path.basename(path)
        ext = fn.lower().rsplit(".", 1)[-1]
        if ext not in ("pdf", "xlsx"):
            continue
        try:
            if ext == "xlsx":
                headers, values, titulo = tabla_excel(path)
            else:
                headers, values, titulo = tabla_pdf(path)
        except Exception as e:
            print("ERROR", fn, e); headers = None; titulo = ""
        cod = codigo(fn)
        base = re.sub(r"\.(pdf|xlsx)$", "", fn, flags=re.I)
        key = f"{cat}|{cod or base}"
        med = mapear(headers, values) if headers else {"plastificado": "", "diam_inferior": "", "rim": "", "diam_exterior": "", "altura": ""}
        # referencia: del título (sin 'FICHA TECNICA') o del nombre de archivo
        ref = (titulo or "").replace("FICHA TECNICA", "").replace("FICHA TÉCNICA", "").strip()
        ref = re.sub(r"\s+", " ", ref) or re.sub(r"FCH-PT-\s*\d*", "", base).strip(" -")
        rec = registros.get(key, {"codigo": cod, "categoria": cat, "referencia": clean_ref(fn),
                                  "plastificado": "", "diam_inferior": "", "rim": "", "diam_exterior": "", "altura": "",
                                  "_pdf_src": "", "_xlsx_src": ""})
        for k in ("plastificado", "diam_inferior", "rim", "diam_exterior", "altura"):
            if med[k] and not rec[k]:
                rec[k] = med[k]
        rec["_" + ext + "_src"] = path  # ruta absoluta del archivo fuente
        registros[key] = rec

# --- Copiar archivos a estáticos y armar JSON final servible --------------- #
import shutil
DEST = r"c:/Users/tatianas/OneDrive - kos colombia/CALIDAD KOS COLOMBIA - SISTEMA DE GESTION DE INOCUIDAD/CALIDAD DIG/kos-calidad-portal/backend/app/static/fichas"
os.makedirs(DEST, exist_ok=True)


def slugify(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "ft"


out = []
usados = set()
for r in sorted(registros.values(), key=lambda r: (r["categoria"], r["codigo"] or r["referencia"])):
    slug = slugify(f"{r['codigo']}-{r['categoria']}-{r['referencia']}")
    while slug in usados:
        slug += "x"
    usados.add(slug)
    archivo = ""
    for ext in ("pdf", "xlsx"):
        src = r["_" + ext + "_src"]
        if src:
            dst = f"{slug}.{ext}"
            shutil.copyfile(src, os.path.join(DEST, dst))
            if not archivo:  # preferir pdf para la lupa
                archivo = f"/fichas/{dst}"
    out.append({
        "codigo": r["codigo"], "categoria": r["categoria"], "referencia": r["referencia"],
        "plastificado": r["plastificado"], "diam_inferior": r["diam_inferior"], "rim": r["rim"],
        "diam_exterior": r["diam_exterior"], "altura": r["altura"], "archivo": archivo,
    })

print(f"TOTAL fichas: {len(out)}\n")
for r in out:
    print(f"[{r['categoria']:10}] {r['codigo']:12} | {r['referencia'][:30]:30} | inf={r['diam_inferior'][:10]:10} rim={r['rim'][:8]:8} ext={r['diam_exterior'][:10]:10} alt={r['altura'][:10]:10} | {r['archivo']}")

dstjson = r"c:/Users/tatianas/OneDrive - kos colombia/CALIDAD KOS COLOMBIA - SISTEMA DE GESTION DE INOCUIDAD/CALIDAD DIG/kos-calidad-portal/backend/app/fichas_tecnicas.json"
with open(dstjson, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print("\nJSON ->", dstjson)
print("Archivos copiados a:", DEST)
