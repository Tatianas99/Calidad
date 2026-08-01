"""Almacenamiento de los archivos adjuntos (fotos y videos de los formatos).

Hay dos backends y se elige solo, según la configuración:

  * **Azure Data Lake / Blob Storage** — cuando AZURE_STORAGE_ACCOUNT está
    definida. Es el modo de producción: el disco del App Service es efímero y
    se borra en cada despliegue o reinicio, así que los archivos NO pueden
    quedarse ahí.
  * **Disco local** (`backend/uploads/`) — cuando no lo está, para desarrollo.

En ambos casos la base de datos guarda siempre la misma *ruta relativa*
(p. ej. `f158/<recorrido>/a1b2c3.jpg`); es la clave del blob y también la ruta
en disco. La URL con la que el navegador descarga el archivo se calcula al
vuelo con `url()`, nunca se guarda.

Autenticación en Azure, en orden de preferencia:

  1. **Identidad administrada** (`DefaultAzureCredential`), sin secretos. Es el
     modo recomendado. Los enlaces de lectura se firman con una *user
     delegation key*, así que la identidad necesita los roles
     `Storage Blob Data Contributor` y `Storage Blob Data Delegator`.
  2. **Clave de cuenta**, si se configuró una cadena de conexión. Más simple de
     arrancar, pero es un secreto con acceso total que hay que rotar.
"""
import logging
import mimetypes
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

from .config import (
    AZURE_STORAGE_ACCOUNT,
    AZURE_STORAGE_CONTAINER,
    AZURE_STORAGE_KEY,
    AZURE_STORAGE_URL,
    SAS_TTL,
    UPLOADS_DIR,
)

log = logging.getLogger("uvicorn.error")

# Margen para tolerar el desfase de reloj entre este servidor y Azure: el
# permiso empieza a valer 5 minutos "en el pasado".
_MARGEN = timedelta(minutes=5)


def usa_azure() -> bool:
    """True si los adjuntos van a Azure; False si van al disco local."""
    return bool(AZURE_STORAGE_ACCOUNT)


def content_type_de(ruta: str, tipo: str) -> str:
    """Tipo MIME a partir de la extensión, para que el navegador sepa mostrarlo.

    Sin esto, Azure sirve todo como `application/octet-stream` y los videos se
    descargan en vez de reproducirse.
    """
    adivinado, _ = mimetypes.guess_type(ruta)
    if adivinado:
        return adivinado
    return "video/mp4" if tipo == "video" else "image/jpeg"


# --------------------------------------------------------------------------- #
# Azure
# --------------------------------------------------------------------------- #
_cliente = None
_lock = threading.Lock()

# La user delegation key se pide una vez y se reutiliza: cada llamada es una
# petición de red a Azure y aquí se firma una URL por cada adjunto mostrado.
_delegation_key = None
_delegation_exp: datetime | None = None


def _servicio():
    """BlobServiceClient autenticado (cacheado): identidad administrada o clave."""
    global _cliente
    if _cliente is None:
        with _lock:
            if _cliente is None:
                from azure.storage.blob import BlobServiceClient

                if AZURE_STORAGE_KEY:
                    credencial = AZURE_STORAGE_KEY
                else:
                    from azure.identity import DefaultAzureCredential

                    credencial = DefaultAzureCredential()
                _cliente = BlobServiceClient(
                    account_url=AZURE_STORAGE_URL,
                    credential=credencial,
                )
    return _cliente


def _clave_delegacion():
    """Clave para firmar enlaces temporales; se renueva sola al caducar."""
    global _delegation_key, _delegation_exp
    ahora = datetime.now(timezone.utc)
    # Se renueva un poco antes de la caducidad real para no firmar con una
    # clave que expire mientras el usuario está viendo el archivo.
    if _delegation_key is None or _delegation_exp is None or _delegation_exp - timedelta(minutes=10) <= ahora:
        with _lock:
            inicio = ahora - _MARGEN
            fin = ahora + timedelta(hours=6)
            _delegation_key = _servicio().get_user_delegation_key(inicio, fin)
            _delegation_exp = fin
    return _delegation_key


def _guardar_azure(ruta: str, blob: bytes, content_type: str) -> None:
    from azure.storage.blob import ContentSettings

    cliente = _servicio().get_blob_client(AZURE_STORAGE_CONTAINER, ruta)
    cliente.upload_blob(
        blob,
        overwrite=True,
        content_settings=ContentSettings(content_type=content_type),
    )


def _url_azure(ruta: str) -> str:
    """URL absoluta al blob, firmada y con caducidad (SAS de solo lectura)."""
    from azure.storage.blob import BlobSasPermissions, generate_blob_sas

    ahora = datetime.now(timezone.utc)
    # Con clave de cuenta se firma directamente; con identidad administrada hay
    # que pedirle a Azure una user delegation key porque no hay clave local.
    if AZURE_STORAGE_KEY:
        firma = {"account_key": AZURE_STORAGE_KEY}
    else:
        firma = {"user_delegation_key": _clave_delegacion()}

    sas = generate_blob_sas(
        account_name=AZURE_STORAGE_ACCOUNT,
        container_name=AZURE_STORAGE_CONTAINER,
        blob_name=ruta,
        permission=BlobSasPermissions(read=True),
        start=ahora - _MARGEN,
        expiry=ahora + timedelta(seconds=SAS_TTL),
        **firma,
    )
    # La ruta va percent-encoded en la URL: hay adjuntos antiguos con espacios y
    # paréntesis en el nombre ("image002 (3).png") y sin esto el enlace es
    # inválido y el navegador no los carga. La firma NO se toca: se calcula
    # sobre el nombre sin codificar, que es justo lo que se le pasó arriba.
    ruta_url = quote(ruta, safe="/")
    return f"{AZURE_STORAGE_URL}/{AZURE_STORAGE_CONTAINER}/{ruta_url}?{sas}"


# --------------------------------------------------------------------------- #
# Disco local (desarrollo)
# --------------------------------------------------------------------------- #
def _guardar_local(ruta: str, blob: bytes) -> None:
    destino = UPLOADS_DIR / ruta
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(blob)


# --------------------------------------------------------------------------- #
# Interfaz que usan los routers
# --------------------------------------------------------------------------- #
def guardar(ruta: str, blob: bytes, tipo: str = "image") -> None:
    """Guarda el archivo en `ruta` (relativa), en Azure o en disco."""
    if usa_azure():
        _guardar_azure(ruta, blob, content_type_de(ruta, tipo))
    else:
        _guardar_local(ruta, blob)


def url(ruta: str) -> str:
    """URL de descarga del archivo.

    En Azure es absoluta y temporal; en local es relativa (`/uploads/...`) y la
    sirve el propio backend. El frontend distingue una de otra por el prefijo.
    """
    if usa_azure():
        return _url_azure(ruta)
    return f"/uploads/{ruta}"


def preparar() -> None:
    """Crea el contenedor si aún no existe. Se llama una vez al arrancar.

    Best-effort: si falla (por ejemplo, porque la identidad solo tiene permiso
    de datos y no de gestión), no se impide el arranque; la subida dirá el
    motivo real si el contenedor de verdad no está.
    """
    if not usa_azure():
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        return
    try:
        _servicio().create_container(AZURE_STORAGE_CONTAINER)
        log.info("Contenedor de adjuntos '%s' creado.", AZURE_STORAGE_CONTAINER)
    except Exception as e:
        # Lo normal es que ya exista (ResourceExistsError); no es un problema.
        if type(e).__name__ != "ResourceExistsError":
            log.warning("No se pudo verificar el contenedor de adjuntos: %s", e)


def eliminar(ruta: str) -> None:
    """Borra el archivo. No falla si ya no existe."""
    if usa_azure():
        try:
            _servicio().get_blob_client(AZURE_STORAGE_CONTAINER, ruta).delete_blob()
        except Exception:
            pass
    else:
        (UPLOADS_DIR / ruta).unlink(missing_ok=True)
