# Revisión de requisitos originales, rendimiento de auditoría, documentos heredados y dependencias externas (I-5.8)

Fecha: 2026-10-28. Complementa `INFORME_CERTIFICACION_FINAL_I58_2026-10-28.md`. Se distingue siempre entre **implementado y probado**, **implementado pero pendiente de un servicio externo** y **realmente incompleto o no modelado**. Que exista una pantalla no se toma como requisito cumplido.

## 1. Requisitos revisados fuera de la matriz SQL

### 1.1 Teléfonos internacionales — IMPLEMENTADO Y PROBADO

Requisito: selección de país, prefijo y validación con metadatos fiables en frontend **y** backend (no un largo máximo arbitrario).

| Aspecto | Evidencia |
|---|---|
| Servidor | `PhoneNumbers` usa **libphonenumber 9.0.42** (metadatos de Google): el número debe ser *válido para el país elegido* (`isValidNumberForRegion`), con longitud posible por país, formatos nacionales (0/15 en Argentina), prefijo `+` coherente con el país, prefijos compartidos (+1), extensiones y letras rechazadas con mensaje explícito; se guarda E.164 y el formato internacional. El tope de 30 caracteres es sólo un límite de entrada, no la regla de validez. |
| Cliente | `contactRules.js` + `phoneField.jsx` con **libphonenumber-js (metadatos `max`)**: buscador de país por nombre/código/prefijo, prefijo mostrado aparte, validación en vivo y vista previa de cómo se guardará. El servidor vuelve a validar y decide. |
| Reglas de negocio | El país lo elige quien carga el dato (no se infiere); no se supone Argentina en datos anteriores: los teléfonos cargados antes de V54 se siguen leyendo y el país debe elegirse al editarlos (comprobado en el ensayo de migración V47→V60). |
| Pruebas | JUnit: `PhoneNumbersTest`, `PhoneInternationalIntegrationTest`; Vitest: `contactRules.test.js`, formularios; E2E contra SQL Server real: `e2e-telefonos-internacionales`, `e2e-verificacion-contactos-ui`, `e2e-contactos(-ui)`, `e2e-contactos-solicitud(-ui)`, `e2e-contactos-tripulacion(-ui)`. |
| Límite declarado | La validez es de **numeración** (formato y rango del plan de numeración). No prueba que la línea exista ni que pertenezca a su titular: no hay verificación por SMS. Si los metadatos de cliente y servidor difieren por versión para un número muy reciente, **decide el servidor**. |

### 1.2 Correo verificado por código (token) — IMPLEMENTADO Y PROBADO con transporte controlado; ENTREGA REAL PENDIENTE DE PROVEEDOR

* Mecanismo (V61): OTP numérico de un solo uso de **seis dígitos** (`SecureRandom`); en la base sólo se guarda su **HMAC** ligado al correo; vence a los 10 min, admite 5 intentos, reenvío ≥ 60 s y límites diarios persistentes por correo, usuario y origen directo con huella HMAC. Un correo no verificado no puede ser principal. No hay enlace en el mensaje: el titular ingresa el código en *Mi cuenta*.
* SMTP: sin `MAIL_ENABLED=true` y servidor, el servicio responde **503 `MAIL_NOT_CONFIGURED`**, no envía nada, no simula entregas y ningún correo queda verificado. Con credenciales **se exige TLS** (`MAIL_SSL=true` o `MAIL_STARTTLS=true` con STARTTLS obligatorio y verificación de identidad del servidor); la configuración que enviaría credenciales sin cifrar impide el arranque. Las credenciales sólo llegan por entorno y el informe de preparación no las expone.
* Probado con Mailpit (servidor SMTP real que retiene mensajes): envío, consumo, vencimiento, intentos, reenvío, caída del SMTP (`docker pause`), límites. **No está probada la entrega a un proveedor externo**: no se declara un proveedor operativo porque no existe uno contratado ni credenciales. Estado: implementado, **pendiente de servicio externo**.

### 1.3 Formularios que usan contactos — IMPLEMENTADO Y PROBADO

Autoservicio (Mi cuenta), alta/edición administrativa, contactos de coordinación del traslado sanitario, solicitud/paciente y contactos laborales de la tripulación (sólo `LABORAL`, sólo Operaciones, con auditoría): cubiertos por los scripts E2E y Vitest listados arriba y por `PersonContactIntegrationTest`, `TransferContactIntegrationTest`, `CrewContactIntegrationTest`, `EmailVerificationIntegrationTest`.

### 1.4 Otras condiciones de la solicitud

| Requisito | Estado | Detalle |
|---|---|---|
| Intervalos de notificación preventiva configurables | **Implementado y probado** | `APP_CREDENTIAL_EXPIRY_NOTICE_DAYS` (lista de días). **60/30/7/0 es una propuesta**, no una obligación normativa: figura como `PROPUESTA` en la lista de preparación hasta `APP_CREDENTIAL_EXPIRY_APPROVED=true`. |
| Credenciales profesionales: revisión administrativa interna | **Implementado y probado** | Verificación por otro administrador; la «consulta externa» ANAC/REFEPS-SISA es una **constancia manual** de lo que el administrador declara haber visto. Ninguna pantalla ni documento afirma validación automática oficial. |
| Retención documental | **Implementado en lo técnico; decisión de negocio pendiente** | No hay purga (`purge-enabled=false`, y la lista de preparación marca ERROR si se habilitara sin política aprobada). No se inventan plazos legales. |
| Antivirus | **Implementado y probado con motor real y base mínima; análisis completo NO probado** | Ver §4 y `SEPARACION_CUENTAS_Y_ANTIMALWARE_I58_2026-10-28.md`. |
| Tripulación mínima por operación (¿copiloto obligatorio?) | **Realmente no modelado** | El sistema no impone composición mínima; sólo capacidad de la aeronave. Depende de una decisión normativa (D4). Desarrollo nuevo, fuera de este cierre. |
| Aptitud psicofísica/aeromédica como entidad propia | **Realmente no modelado** | Se representaría como otro *tipo de habilitación* con su política (D6). |
| Verificación de teléfono por SMS | **No existe** | Declarado; no se prometió. |

## 2. Rendimiento de la consulta global de auditoría — NO REPRODUCIBLE; NO SE DECLARA CERRADA

Incidencia: 26.972 ms para 100 resultados con ≈10.358 eventos (objetivo 5.000 ms). I-5.6 midió 63–92 ms en caliente con 53.239 eventos y no halló causa.

Nueva medición (I-5.8, `scripts/medir-auditoria-frio.cjs`, SQL Server aislado, **69.415 eventos = 6,7× la incidencia**, 52,9 MiB; antes de cada medición `CHECKPOINT` + `DBCC DROPCLEANBUFFERS` + `DBCC FREEPROCCACHE`; backend ya iniciado; el equipo estaba además bajo la carga normal de trabajo). Evidencia: `docs/evidencia-i58/auditoria-rendimiento-frio.txt`.

| Corrida | SQL frío | SQL caliente | HTTP frío (primera consulta) | HTTP caliente (3) | HTTP página profunda en frío |
|---|---:|---:|---:|---|---:|
| 1 | 148 ms | 6 ms | **3.688 ms** | 427/288/405 ms | 296 ms |
| 2 | 97 ms | 13 ms | 560 ms | 237/213/546 ms | 131 ms |
| 3 | 90 ms | 13 ms | 347 ms | 175/187/226 ms | 99 ms |

* SQL (lecturas físicas reales, caché fría) **≤ 148 ms**: la base de datos no es la causa. La consulta usa el índice por fecha; sin barridos de tabla.
* El único valor alto (3,7 s) es la **primera petición HTTP tras vaciar cachés**, con SQL en 148 ms: el resto es camino frío del backend (JIT, plan de consulta de Hibernate, conexión, serialización), amplificado por la contención de memoria de este equipo. En las demás repeticiones: 0,1–0,6 s.
* **Conclusión honesta:** el objetivo de 5 s se cumple con margen en todas las condiciones reproducidas (peor caso 3,7 s con 6,7× el volumen). **No se reprodujo el valor de 27 s ni se identificó su causa**; la hipótesis más plausible (contención de memoria del anfitrión/Docker al medirse, como las que sí produjeron congelamientos del motor Docker en este proyecto) **no se pudo demostrar**. No se modificó código ni índices: hacerlo sin evidencia sería actuar a ciegas.
* Estado: **abierta como «no reproducible»**. Cierre en producción: con `APP_AUDIT_DIAGNOSTICS_ENABLED=true` temporal, ejecutar `scripts/medir-auditoria.cjs` y `scripts/medir-auditoria-frio.cjs` sobre la base real tras migrar, en reposo, y adjuntar el desglose. La base habitual hoy casi no tiene auditoría (no es representativa).

## 3. Conciliación de los ocho documentos heredados

| Pregunta | Respuesta verificada |
|---|---|
| ¿De qué base provenían? | De `vuelos_sanitarios_ensayo_v47`, una **restauración aislada** del respaldo pristino de la base habitual (V47) en la instancia SQL Server del stack E2E, **sembrada** con datos representativos por `scripts/ensayo-sembrar-v47.cjs` (contrato de la API V47). La base habitual **no los contiene**: consulta de sólo lectura de hoy: 0 habilitaciones, 0 documentos de habilitación, 1 usuario, V47. |
| ¿En qué tablas? | `habilitaciones_profesionales` (8 filas, una por comandante `c1`–`c8`) y `documentos_habilitacion` (8 filas, un PDF por habilitación), más `usuarios`/`personas`/`perfiles_comandante`. |
| ¿Fixture o preexistentes? | **Fixture del ensayo** (datos sintéticos creados mediante la API de V47), no datos preexistentes de la habitual. |
| ¿Qué archivos físicos se analizaron? | Los 8 PDF almacenados por el backend V47 en el volumen de documentos del ensayo (`vuelos-sanitarios-ensayo_documents`, clave de almacenamiento propia de cada fila). |
| ¿Cómo se verificó la integridad? | Antes: informe de heredados `{documentos: 8, sinHuella: 8, pendientes: 8, archivosAusentes: 0}`. Con **ClamAV real** se regularizaron los 8: huella SHA-256 rotulada `REGULARIZACION`, origen `ANTERIOR_V59` conservado, y el archivo descargado resultó **idéntico byte a byte** al original subido, sin cambiar ninguna habilitación. |
| ¿Evidencias conservadas? | `docs/evidencia-i57/ensayo-funcional-v60.log` y, de esta corrida (restauración pristina → V60 con la cuenta de migraciones), `docs/evidencia-i58/ensayo-migracion-v47-v60-cuentas-minimo-privilegio.log` (mismas cifras: 8 documentos, 8 sin huella, 7 vuelos abiertos afectados, regularización exitosa). La base y el volumen del ensayo se eliminaron al terminar (eran descartables). |
| ¿Restringidos hasta regularizar? | Sí: un heredado no se descarga, no sustenta verificaciones nuevas y una verificación previa apoyada sólo en él figura con sustento pendiente (`e2e-politicas-documentos-v60`, bloques de heredados). El titular no puede regularizar sus propios documentos. |
| ¿Se falsificó algo? | No: no se inventa fecha de análisis ni motor; historial, autoría, archivo original, huella de carga y resultados quedan intactos (triggers de V60 impiden alterarlos). |

## 4. Inventario de dependencias externas y políticas administrativas

Leyenda: **BM** = bloquea la migración técnica; **BO** = bloquea operar en producción.

| # | Dependencia | Estado actual | BM | BO | Qué debe hacer el responsable |
|---|---|---|:-:|:-:|---|
| 1 | Autorización escrita de la ventana y de las imágenes/bundle a desplegar | Pendiente | **Sí** | Sí | Aprobar fecha, responsables, criterio de aborto y digests. |
| 2 | Crear/guardar las dos cuentas SQL (aplicación y migraciones) en `.env.production` con contraseñas distintas | Preparado, no creado en la habitual | **Sí** | Sí | Definir y custodiar las contraseñas; ejecutar P5 del procedimiento. |
| 3 | Copia del respaldo y clave portátil **fuera del equipo** | Sin copia externa | **Sí** (si se exige copia externa) | Sí | Elegir destino de custodia. |
| 4 | Política profesional (D1–D8) | 0 políticas; decisión documentada | No | **Sí** | Aprobar/rechazar D1–D8 (`DECISION_POLITICAS_PROFESIONALES_I58`); incluye revisión normativa. |
| 5 | Antivirus con base completa (≈2 GB de RAM; freshclam con Internet) | Integración probada; análisis completo **no probado** en este equipo | No | **Sí** para documentación real | Dimensionar equipo (≥ 4 GB dedicados) o servidor aparte (`docker-compose.clamav-standalone.yml`); ejecutar `verificar-antivirus-produccion.cjs`. |
| 6 | Proveedor SMTP real | No existe | No | Condicional | Contratar proveedor, cargar credenciales por entorno, probar entrega real; o aceptar por escrito operar sin verificación de correos. |
| 7 | Plazos de retención documental | Sin política; sin purga | No | **Sí** para cargar documentación real | Aprobar plazos con asesoría legal. |
| 8 | Plazos de aviso de vencimiento (60/30/7/0 propuestos) | Propuesta | No | No (informativo) | Aprobar y poner `APP_CREDENTIAL_EXPIRY_APPROVED=true`. |
| 9 | Normalización de la categoría de aeronave | Texto libre | No | Sólo si las políticas usan categoría | Definir lista cerrada con Operaciones (D8). |
| 10 | Recursos del servidor (RAM/disco, respaldo programado) | Equipo de desarrollo con 7,2 GB y VM Docker de 3,45 GB; se cuelga con dos JVM | Condicional | **Sí** | Confirmar el equipo de producción (ver informe). |
| 11 | Consulta oficial ANAC / REFEPS-SISA | Manual por diseño; sin API acreditada | No | No | Decidir el procedimiento humano de contraste. |
| 12 | Push, CI remoto y despliegue | Sin push (no autorizado) | No | No | Autorizar push cuando corresponda. |
| 13 | Retiro de `BOOTSTRAP_ADMIN_*` tras el primer inicio | Procedimiento P12 | No | Sí (higiene) | Ejecutar P12. |
