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
