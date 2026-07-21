"""Siembra de catálogos iniciales (datos de ejemplo).

Ejecutar con:  python -m app.seed
Reemplazar estos datos de ejemplo por las listas reales que provea calidad.
"""
from .db import SessionLocal, init_db
from . import models
from .auth import hash_password


def seed():
    init_db()
    db = SessionLocal()
    try:
        if db.query(models.Usuario).count() == 0:
            # Usuario administrador inicial (CAMBIAR la contraseña tras el primer ingreso).
            db.add(models.Usuario(
                username="admin", nombre="Administrador",
                password_hash=hash_password("Kos2026*"),
                rol="admin", permisos="[]", activo=True,
            ))
        if db.query(models.Persona).count() == 0:
            db.add_all([
                models.Persona(nombre="Ana Ramírez", rol="auxiliar"),
                models.Persona(nombre="Luis Gómez", rol="auxiliar"),
                models.Persona(nombre="Carlos Pérez", rol="operario"),
                models.Persona(nombre="Marta Díaz", rol="operario"),
                models.Persona(nombre="Jorge Núñez", rol="empacador"),
                models.Persona(nombre="Sofía Torres", rol="empacador"),
                models.Persona(nombre="Diana Ruiz", rol="responsable"),
            ])
        if db.query(models.Maquina).count() == 0:
            db.add_all([
                models.Maquina(nombre="Formadora 1", area="Formación"),
                models.Maquina(nombre="Formadora 2", area="Formación"),
                models.Maquina(nombre="Formadora 3", area="Formación"),
                models.Maquina(nombre="Selladora 1", area="Empaque"),
            ])
        if db.query(models.Referencia).count() == 0:
            db.add_all([
                models.Referencia(codigo="VAS-7OZ", descripcion="Vaso 7 oz", tipo_producto="vaso"),
                models.Referencia(codigo="VAS-9OZ", descripcion="Vaso 9 oz", tipo_producto="vaso"),
                models.Referencia(codigo="VAS-12OZ", descripcion="Vaso 12 oz", tipo_producto="vaso"),
                models.Referencia(codigo="VAS-16OZ", descripcion="Vaso 16 oz", tipo_producto="vaso"),
            ])
        if db.query(models.PuntoMedicion).count() == 0:
            db.add_all([
                models.PuntoMedicion(nombre="Entrada planta"),
                models.PuntoMedicion(nombre="Tanque principal"),
                models.PuntoMedicion(nombre="Baños"),
                models.PuntoMedicion(nombre="Cafetería"),
            ])
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
    print("Catálogos sembrados correctamente.")
