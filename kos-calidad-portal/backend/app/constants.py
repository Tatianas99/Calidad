"""Listas de dominio de los formatos (valores + etiquetas para el frontend)."""

RESULTADOS = ["C", "NC", "N/A"]

# Listado de máquinas de producción (curado por Calidad). Se usa como opciones
# del campo "Máquina" en F-006 (filtración), F-204 (Clase B) y en el proceso
# Formación de F-158. El campo sigue permitiendo escribir una que no esté aquí.
MAQUINAS_PRODUCCION = [
    "KOVRA 7-1", "KOVRA 7-3", "KOVRA 7-4", "KOVRA 16-2", "KOVRA 16-1",
    "DP 7/9/12", "KOVRA-22", "KOVRA 4-1", "KOVRA 9",
    "KOVRA 12-1", "KOVRA 12-2", "KOVRA 12-3", "CPD 4 OZ", "CPD 5 OZ",
    "CPD 7 OZ", "CPD 12 OZ", "CPD 14 OZ", "CPD 16 OZ",
    "CPD VASO 14 OZ", "CPD VASO 32 OZ",
    "CAJA CHINA 25 OZ", "CAJA CHINA 9 OZ", "CAJA CHINA 16 OZ",
    "PORTA PAPA", "CONT 32 OZ", "CONT 24 OZ", "VASO 7 OZ ASA",
]

# F-006 — ítems del checklist de embalaje.
# Goteo de vaso con tapa y Tapa centrada se piden ahora por cada prueba de
# filtración (no en el embalaje). Aquí quedan solo los ítems generales.
EMBALAJE_ITEMS_F006 = [
    ("despegado_manual", "Despegado manual"),
    ("impresion", "Impresión"),
]

# F-006 — tipos de prueba de filtración.
TIPOS_PRUEBA_F006 = [
    ("cafe_caliente", "Café caliente"),
    ("cafe_frio", "Café frío"),
    ("agua_fria", "Agua fría"),
    ("rojo_escarlata", "Rojo escarlata"),
    ("glicerina", "Glicerina"),
    ("rasgado", "Rasgado"),
]

# F-006 — tipo de papel (misma lista estándar de "Tipo de material" de F-158).
TIPOS_MATERIAL_F006 = [
    ("P1", "P1"),
    ("P2", "P2"),
    ("PS", "PS"),
    ("Bio", "Bio"),
    ("Kraft", "Kraft"),
    ("SBS", "SBS"),
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
