"""Definición de los procesos, máquinas y checklists del formato F-158 (Rutas Calidad).

Fuente única de verdad: el frontend consume esta estructura vía GET /f158/config y
renderiza dinámicamente el checklist de cada proceso. Cada campo tiene un `tipo`:

    texto       -> entrada de texto libre ("Escribir")
    cncna       -> botones C / NC / NA
    opciones    -> selección única de una lista (con `otro=True` habilita "Otro ¿Cuál?")
    referencia  -> buscador de referencia (PQRS) + campo de marca

Los ítems se guardan de forma genérica (clave/valor) en f158_item, así que agregar,
quitar o reordenar campos aquí NO requiere cambios de base de datos.
"""

# Resultado del checklist (el formato en papel usa C / NC / NA).
RESULTADOS_F158 = ["C", "NC", "NA"]

# Tipos de material (compartidos por Slitter, Flexo, Troquelado…).
MATERIALES = ["P1", "P2", "PS", "Bio", "Kraft", "SBS"]

# Calibres (compartidos). El campo permite además "Otro ¿Cuál?" para escribir uno.
CALIBRES = ["0.10", "0.11", "0.12", "0.13", "0.14", "0.15", "0.16", "0.17", "0.18"]

# Máquinas de prueba de Formación: por ahora las mismas que se usan en F-006.
MAQUINAS_FORMACION = ["Termoformadora Norte", "Termoformadora Sur", "Selladora Central"]


# --------------------------- Constructores de campo ------------------------- #
def _t(key, label):
    return {"key": key, "label": label, "tipo": "texto"}


def _c(key, label):
    return {"key": key, "label": label, "tipo": "cncna"}


def _ref(key="referencia", label="Referencia"):
    return {"key": key, "label": label, "tipo": "referencia"}


def _o(key, label, opciones, otro=False):
    return {"key": key, "label": label, "tipo": "opciones", "opciones": list(opciones), "otro": otro}


def _material(key="tipo_material", label="Tipo de material"):
    return _o(key, label, MATERIALES)


def _calibre(key="calibre", label="Calibre"):
    return _o(key, label, CALIBRES, otro=True)


def _calibre_asa():
    # Igual que Calibre pero con opción N/A (además de "Otro ¿cuál?").
    return _o("calibre_asa", "Calibre asa", CALIBRES + ["N/A"], otro=True)


# ------------------------------- Procesos ---------------------------------- #
PROCESOS_F158 = [
    {
        "key": "slitter",
        "label": "Slitter",
        "maquinas": ["Slitter 1", "Slitter 2"],
        "campos": [
            _t("lote_rollo", "Lote del rollo"),
            _material(),
            _calibre(),
            _c("prueba_lapiz", "Prueba de lápiz"),
            _c("medidas", "Medidas"),
            _c("prueba_armado", "Prueba de armado"),
            _c("inocuidad", "Inocuidad"),
        ],
    },
    {
        "key": "flexo",
        "label": "Flexo",
        "maquinas": ["Flexo 1", "Flexo 2"],
        "campos": [
            _t("op", "Orden de producción"),
            _ref(),
            _calibre(),
            _material(),
            _c("ficha_tecnica_op", "Ficha técnica Vrs OP"),
            _c("color", "Color"),
            _c("registro_textos", "Registro, textos"),
            _c("comparacion_positivo", "Comparación positivo"),
            _c("porta_plancha", "Porta plancha"),
            _c("anilox", "Anilox"),
        ],
    },
    {
        "key": "kosexpress",
        "label": "KosExpress",
        "maquinas": [],
        "campos": [
            _t("op", "Orden de producción"),
            _ref(),
            _calibre(),
            _material(),
            _c("ficha_tecnica_op", "Ficha técnica Vrs OP"),
            _c("color", "Color"),
            _c("registro_textos", "Registro, textos"),
            _c("comparacion_positivo", "Comparación positivo"),
        ],
    },
    {
        "key": "troquelado",
        "label": "Troqueladora",
        "maquinas": ["Punching 1", "Punching 2", "Punching 3", "Punching 4", "Troqueladora China"],
        "campos": [
            _t("op", "Orden de producción"),
            _ref(),
            _material(),
            _calibre(),
            _t("numero_rollo", "Número del rollo"),
            _c("troquel_coincide", "Troquel coincide registro"),
            _c("reserva", "Reserva"),
            _c("material_encocado", "Material encocado"),
        ],
    },
    {
        "key": "formacion",
        "label": "Formación",
        "maquinas": MAQUINAS_FORMACION,
        "campos": [
            _t("op", "Orden de producción"),
            _ref(),
            _t("no_caja", "N° caja"),
            _c("identificacion_caja", "Identificación caja"),
            _c("unidad_empaque", "Unidad empaque"),
            _c("despegue_manual", "Despegue manual"),
            _c("impresion", "Impresión"),
            _c("pestana_reborde", "Pestaña en el reborde"),
            _c("sin_pestana_vending", "Sin pestaña vending"),
            _c("ajuste_tapa", "Ajuste tapa"),
            _c("sticker_bolsa", "Sticker bolsa"),
            _c("rotulo", "Rótulo"),
            _c("sellado_bolsa", "Sellado bolsa"),
            _c("dp_punto_hotmelt", "DP punto hotmelt"),
            _c("asa_resistencia_pegue", "Asa (resistencia y pegue)"),
            _calibre_asa(),
        ],
    },
    {
        "key": "anillos",
        "label": "Anillos",
        "maquinas": [],
        "campos": [
            _t("op", "Orden de producción"),
            _ref(),
            _t("no_caja", "N° caja"),
            _c("impresion", "Impresión"),
            _c("pegue", "Pegue"),
            _c("prueba_cafe", "Prueba de café"),
            _c("empaque", "Empaque"),
        ],
    },
    {
        "key": "tapas",
        "label": "Tapas",
        "maquinas": ["Termo 1", "Termo 2", "Papel 1", "Papel 2", "Papel 3", "Papel 4"],
        "campos": [
            _t("op", "Orden de producción"),
            _ref(),
            _c("reborde_apariencia", "Reborde de apariencia"),
            _c("unidad_empaque", "Unidad empaque"),
            _c("sticker_bolsa", "Sticker bolsa"),
            _c("sellado_bolsa", "Sellado bolsa"),
            _c("identificacion_caja", "Identificación caja"),
            _c("corte_perforacion", "Corte perforación"),
            _c("pegue_tapa_papel", "Pegue tapa papel"),
            _c("medicion_ajuste", "Medición (ajuste)"),
            _c("inocuidad", "Inocuidad"),
            _c("tapa_centrada", "Tapa centrada"),
        ],
    },
    {
        "key": "platos",
        "label": "Platos",
        "maquinas": [],
        # NOTA: en el Excel el checklist de Platos aparece cortado; incluye los
        # ítems visibles. Completar si faltan campos al final.
        "nota": "Checklist posiblemente incompleto (el Excel aparece cortado).",
        "campos": [
            _t("op", "Orden de producción"),
            _ref(),
            _c("impresion", "Impresión"),
            _c("apariencia_centrada", "Apariencia centrada"),
            _c("unidad_empaque", "Unidad empaque"),
            _c("sellado_bolsa", "Sellado bolsa"),
            _c("identificacion_caja", "Identificación caja"),
        ],
    },
]

PROCESOS_KEYS = {p["key"] for p in PROCESOS_F158}
PROCESO_LABEL = {p["key"]: p["label"] for p in PROCESOS_F158}


def config_f158(maquinas_formacion=None) -> dict:
    """Estructura que consume el frontend para renderizar el formato.

    `maquinas_formacion`: si se pasa una lista no vacía, se usa como máquinas del
    proceso Formación (viene de la tabla `maquinas`); si no, quedan las de defecto.
    """
    procesos = PROCESOS_F158
    if maquinas_formacion:
        procesos = [
            {**p, "maquinas": list(maquinas_formacion)} if p["key"] == "formacion" else p
            for p in PROCESOS_F158
        ]
    return {
        "procesos": procesos,
        "materiales": MATERIALES,
        "calibres": CALIBRES,
        "resultados": RESULTADOS_F158,
    }
