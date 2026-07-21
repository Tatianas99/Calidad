# n8n — Reporte diario de calidad

Workflow: `reporte_diario_calidad.json`

## Qué hace
En la agenda configurada (por defecto **22:00 diario**), descarga del backend los
reportes Excel de **F-006** y **F-015** del día y los envía por correo a calidad
y jefatura.

## Configuración al importar
1. **Variable de entorno** `KOS_API_URL` = URL pública del backend (ej.
   `https://api-calidad.koscolombia.com`). Sin `/` al final.
2. **Credencial SMTP**: crear en n8n (Settings → Credentials) y asignarla al nodo
   *Enviar por correo (SMTP)* (reemplaza el `id: "REEMPLAZAR"`).
3. **Destinatarios / remitente**: editar `toEmail` y `fromEmail` en el nodo de correo.
4. **Agenda**: el nodo *Agenda* usa cron `0 22 * * *`. Para reportes **por turno**,
   duplicar el trigger o usar varias expresiones (p. ej. `0 6,14,22 * * *`).

## Notas
- El backend expone `GET /reports/f006?fecha=YYYY-MM-DD&formato=xlsx` y el
  equivalente `f015`. El workflow arma la fecha con `{{ $now.toFormat('yyyy-MM-dd') }}`.
- n8n debe poder alcanzar la URL del backend por red.
- Para el histórico de un día específico, ejecutar el workflow manualmente y
  ajustar la expresión de fecha.
