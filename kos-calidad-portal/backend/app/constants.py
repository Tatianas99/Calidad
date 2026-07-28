"""Listas de dominio de los formatos (valores + etiquetas para el frontend)."""

RESULTADOS = ["C", "NC", "N/A"]

# F-006 — ítems del checklist de embalaje (orden = orden del formato en papel).
EMBALAJE_ITEMS_F006 = [
    ("unidad_empaque", "Unidad de empaque"),
    ("rotulo_caja", "Rótulo de caja"),
    ("sellado_bolsa", "Sellado de bolsa"),
    ("goteo_vaso_tapa", "Goteo de vaso con tapa"),
    ("despegado_manual", "Despegado manual"),
    ("impresion", "Impresión"),
    ("stickers_bolsa", "Stickers bolsa"),
    ("rotulo_ecologico", "Rótulo ecológico"),
    ("tapa_centrada", "Tapa centrada"),
    ("prueba_lapiz", "Prueba de lápiz"),
]

# F-006 — tipos de prueba de filtración.
TIPOS_PRUEBA_F006 = [
    ("cafe_caliente", "Café caliente"),
    ("cafe_frio", "Café frío"),
    ("agua_fria", "Agua fría"),
    ("rojo_escarlata", "Rojo escarlata"),
    ("glicerina", "Glicerina"),
]

# F-006 — tipos de material.
TIPOS_MATERIAL_F006 = [
    ("P1", "P1"),
    ("P2", "P2"),
    ("cero_plastico", "Cero plástico"),
    ("SP", "SP"),
]

# Conjuntos de claves para validación.
EMBALAJE_KEYS = {k for k, _ in EMBALAJE_ITEMS_F006}
TIPOS_PRUEBA_KEYS = {k for k, _ in TIPOS_PRUEBA_F006}
TIPOS_MATERIAL_KEYS = {k for k, _ in TIPOS_MATERIAL_F006}


def as_options(pairs):
    """Convierte [(valor, etiqueta)] en [{'value':..., 'label':...}] para el frontend."""
    return [{"value": v, "label": l} for v, l in pairs]


# --------------------------------------------------------------------------- #
# Personal de planta (kos_apps.dbo.personal_planta)
# --------------------------------------------------------------------------- #
# La tabla `personal_planta` guarda el cargo como un código entero (FK a
# `cargos_planta`). Aquí se traduce ese código al 'rol' que usan los formatos
# del portal (auxiliar | operario | empacador | responsable), que es por lo que
# el frontend filtra las listas de firmas (F-006) y responsable (F-015).
#
#   cargos_planta:  1=Empaque  2=Operario  3=Mecanico  4=Lider de turno  5=Auxiliar
CARGO_ROL_MAP = {
    1: "empacador",
    2: "operario",
    3: "mecanico",
    4: "responsable",   # líder de turno -> responsable de la medición (F-015)
    5: "auxiliar",
}
# Rol por defecto si aparece un cargo no mapeado (no romper la sincronización).
ROL_POR_DEFECTO = "operario"
