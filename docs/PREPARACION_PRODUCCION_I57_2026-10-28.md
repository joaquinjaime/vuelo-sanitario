# Preparación para producción: antivirus, correo, retención, avisos y configuración (I-5.7, fases 4 y 5)

Fecha: 2026-10-28. Alcance: configuración y procedimiento. **Nada de lo que sigue se aplicó a la base habitual ni a la infraestructura productiva.** Lo que no pudo probarse con los recursos disponibles se dice expresamente.

## 1. Entornos: desarrollo, pruebas y producción

La variable `APP_ENVIRONMENT` (`desarrollo` por omisión, `pruebas`, `produccion`) gobierna lo único que cambia de comportamiento: la exigencia sobre el antivirus. Todo lo demás se configura explícitamente por variables.

| Aspecto | Desarrollo | Pruebas (E2E aislado) | Producción |
|---|---|---|---|
| Archivo de composición | `docker-compose.yml` | `docker-compose.yml` + `docker-compose.e2e*.yml` | `docker-compose.yml` + `docker-compose.prod.yml` (+ `docker-compose.release.yml` con imágenes inmutables) |
| `APP_ENVIRONMENT` | `desarrollo` | `pruebas` | `produccion` |
| Antivirus | Opcional. Sin analizador, los documentos quedan en cuarentena | clamd **real** con base **mínima** (sólo EICAR, 384 MB): prueba la integración, **no la cobertura** | clamd con base **completa y reciente** (freshclam); obligatorio |
| Base mínima aceptada | Sí (no protege) | Sí (es su objeto) | **No**: `APP_ANTIMALWARE_REQUIRE_FULL_DATABASE=true` implícito; con una base sin versión/fecha o con más de `APP_ANTIMALWARE_MAX_SIGNATURE_AGE_DAYS` (7) el analizador figura «no acreditado» y **todo documento queda en cuarentena** |
| SQL Server publicado en | `127.0.0.1:14330` | `127.0.0.1:14331` | `127.0.0.1:14330` (nunca en todas las interfaces) |
| Correo | `MAIL_ENABLED=false` | Mailpit (transporte de prueba, no entrega a nadie) | SMTP real con TLS (pendiente de proveedor) |
| Credenciales de arranque del administrador | Sí | Sí | Retirarlas del entorno tras el primer inicio |
| Límites de memoria | Sin límite | ClamAV 384 MB | Punto de partida en `docker-compose.prod.yml` (ajustar al equipo real) |

Cambio de este incremento sobre exposición: `docker-compose.yml` publicaba SQL Server como `"14330:1433"` (todas las interfaces del equipo). Ahora es `"127.0.0.1:14330:1433"`. **Surte efecto cuando se recree el contenedor de SQL Server de la habitual** (la ventana de migración); el contenedor en ejecución no se tocó.

## 2. Antivirus (fase 4)

### 2.1 Viabilidad de una base completa en este equipo — medición

| Recurso | Valor medido (2026-10-28) |
|---|---|
| RAM total del equipo | 7,2 GB |
| RAM libre del anfitrión con Docker en marcha | ≈ 0,9 GB |
| Memoria asignada a la VM de Docker (sin `.wslconfig`) | 3,45 GB (CPU 8) |
| Uso de los contenedores en marcha | ≈ 2,4 GB (SQL Server habitual 627 MB + E2E 722 MB; backends 430 y 550 MB; ClamAV mínimo 10 MB; Mailpit 26 MB) |
| Disco libre | 274 GB |

ClamAV con la base completa necesita del orden de **1,5 a 2 GB de RAM sólo para clamd** (más el doble durante una recarga si `ConcurrentDatabaseReload` está activo, que la configuración de producción desactiva) y una descarga inicial de firmas (~300 MB, requiere salida a Internet). Con ≈ 1,1 GB libres en la VM de Docker y ≈ 0,9 GB libres en el anfitrión **no es viable** ejecutarlo junto con las dos instancias de SQL Server y los dos backends sin ampliar la memoria de la VM, y ampliarla supera la RAM física libre. Conforme a la instrucción, **no se modificó la asignación de recursos** (no existe `.wslconfig` ni se creó).

**Conclusión:** la prueba con una base completa **quedó bloqueada por recursos y no se ejecutó**. No se afirma que el antivirus completo esté validado. Lo validado es: (a) la integración con clamd real y su protocolo; (b) detección de EICAR; (c) el comportamiento fail-safe, incluida la nueva negativa a tratar una base mínima como protección en producción (ver 2.3).

### 2.2 Recomendación de arquitectura

1. **ClamAV como servicio separado** en un equipo (o VM) con **≥ 4 GB de RAM** dedicados (≥ 2 GB para clamd + holgura), con `freshclam` en ejecución y salida a los espejos de firmas. No en el mismo equipo de desarrollo.
2. El puerto 3310 **no se publica en Internet ni en la LAN general**: sólo accesible desde el servidor de la aplicación (red privada / firewall con regla por origen). clamd no tiene autenticación ni cifrado; no debe exponerse.
3. Si se prefiere una sola máquina, esa máquina debe tener al menos **8 GB** y la VM de Docker (o el servidor Linux) debe poder destinar ≥ 4 GB al par SQL Server + ClamAV además del backend.
4. Alternativa: un servicio de análisis administrado. Requeriría cambiar `ClamdMalwareScanner` por otro `MalwareScanner` (la interfaz ya lo permite) y evaluar el envío de documentación personal a un tercero (Ley 25.326): **decisión de negocio**, no incluida.

### 2.3 Qué hace el sistema si el antivirus no es utilizable (probado)

- Sin analizador configurado, caído, con tiempo agotado, con respuesta desconocida o con **base de firmas no acreditada** (producción): el resultado es `ERROR` → el documento queda en `ERROR_ANALISIS` (cuarentena), **no se descarga, no sustenta una verificación y reintentar no lo limpia**. Nunca se produce «limpio» sin haber examinado el contenido.
- Acreditación (`GuardedMalwareScanner`): `clamd` responde a `VERSION` con `ClamAV <programa>/<versión de firmas>/<fecha de firmas>`. Una base mínima responde sólo la versión del programa (verificado contra el clamd real del E2E: `ClamAV 1.4.6`). Si no hay versión > 0 y fecha dentro del máximo, no está acreditada. Pruebas: `GuardedMalwareScannerTest` (formatos, base antigua, mínima, nula) y `e2e-antimalware-produccion` (backend real con la exigencia activada contra el clamd real de base mínima: cuarentena, no verificable, no descargable, la lista de preparación lo señala, y al restablecer el entorno el mismo documento se analiza de verdad).
- Verificación previa al despliegue, independiente del backend: `node scripts/verificar-antivirus-produccion.cjs --host <clamd> [--port 3310]` (o `--container`). Exige versión de firmas > 0, antigüedad ≤ 7 días, detección de EICAR y OK en contenido inocuo. Contra el clamd mínimo del E2E **falla correctamente** (`NO ACREDITADO PARA PRODUCCIÓN`): detectar EICAR no basta.

### 2.4 Exposición de información sensible (revisado)

- Credenciales: ninguna en el repositorio; `.env`/`.env.*` ignorados (se agregó la excepción `!.env.*.example` para plantillas). `JWT_SECRET`, `DB_PASSWORD`, `MSSQL_SA_PASSWORD`, `MAIL_PASSWORD` sólo por entorno. La lista de preparación informa *si* están presentes, nunca su valor (probado: la respuesta no contiene el secreto).
- Rutas privadas: el almacenamiento usa claves aleatorias `UUID.pdf` dentro de un directorio privado; las respuestas HTTP exponen nombre original, huella y estado, **no** la clave ni la ruta. `DocumentStorage` rechaza claves que escapen del directorio (`getParent().equals(root)`).
- Descarga: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Disposition: attachment`, solo `ADMINISTRADOR`, sólo documentos limpios, verificación de huella al descargar y registro del acceso.
- Permisos de archivos: el volumen `documents_data` lo inicializa `documents-init` (`chown 999:999`) y el backend corre como usuario no privilegiado `spring`. El contenedor de SQL Server y el backend no comparten el sistema de archivos.
- Hallazgo documentado, **no corregido**: el usuario de aplicación de SQL Server es `db_owner` (necesario hoy para que Flyway migre al arrancar). Una vulnerabilidad de inyección SQL tendría permisos amplios. Mitigación recomendada para producción: dos credenciales (migraciones/ejecución) — requiere cambiar el despliegue y es una decisión de infraestructura. Los triggers de V60 protegen frente a errores de código, no frente a un `db_owner` malicioso.

## 3. Correo (fase 5)

Estado verificado en código y pruebas:

- Configuración sólo por `MAIL_*` (sin secretos en el repositorio). Sin `MAIL_ENABLED=true` y servidor, el servicio responde **503 `MAIL_NOT_CONFIGURED`**, no simula entrega y los correos quedan `SIN_VERIFICAR`.
- **Endurecimiento de este incremento** (`MailConfiguration`): con STARTTLS se exige TLS (`starttls.required=true`; si el servidor no lo ofrece el envío falla en lugar de degradarse a texto plano), se verifica la identidad del servidor (`ssl.checkserveridentity`) y **la aplicación se niega a arrancar** si hay `MAIL_USERNAME` sin `MAIL_SSL` ni `MAIL_STARTTLS` (credenciales sin cifrar). Mailpit del E2E no usa credenciales ni TLS (`MAIL_STARTTLS=false`), por lo que no se ve afectado.
- Errores de entrega: el fallo SMTP se registra sin contenido ni dirección completa; el usuario ve «El servidor de correo no aceptó el mensaje» y puede reintentar tras el intervalo de reenvío. Probado con `docker pause` del servidor de pruebas (`e2e-verificacion-correo`).
- Tokens de verificación: desde V61, OTP de seis dígitos con `SecureRandom`; en base sólo su HMAC-SHA256 ligado al correo y a la dirección normalizada (si la dirección cambia, el código deja de servir); comparación en tiempo constante; vencimiento de 10 min, máximo 5 intentos, límites por correo (5/día), usuario (10/día) y origen directo con huella HMAC (50/día), reenvío mínimo 60 s. La clave HMAC deriva de `JWT_SECRET`: **rotar `JWT_SECRET` invalida los códigos pendientes** (no los ya verificados).
- **No se declara probado SMTP real**: no hay proveedor configurado. Mailpit es únicamente infraestructura de prueba. Pendiente: proveedor, dominio remitente con SPF/DKIM, credenciales y una prueba de entrega real.

## 4. Retención documental (fase 5)

- No existe política de retención aprobada. **El sistema no elimina físicamente ningún documento** (`app.retention.credential-documents.purge-enabled=false`, sin código de purga; la lista de preparación marca como error cualquier intento de habilitarla). Retirar o reemplazar es una baja lógica que conserva archivo, huella e historial; el bloqueo de conservación impide retirar o reemplazar.
- Las solicitudes de rectificación o supresión (Ley 25.326) se registran y **protegen la evidencia** bajo bloqueo; su resolución es manual, fuera del sistema.
- **Decisión pendiente (negocio/legal):** plazos de conservación por tipo de documento, criterio de purga y quién la autoriza. No se inventan plazos. Cuando exista, la implementación sólo necesita un proceso de purga aprobado y auditado que respete `bloqueo_conservacion`.

## 5. Avisos de vencimiento (fase 5)

- Umbrales **60 / 30 / 7 / 0 días**: valor por omisión de `APP_CREDENTIAL_EXPIRY_NOTICE_DAYS`; **es una propuesta, no un plazo normativo**, y la lista de preparación la informa como «Propuesta sin aprobar» hasta que se defina `APP_CREDENTIAL_EXPIRY_APPROVED=true`.
- Destinatarios (verificado en `CredentialExpiryNoticeService`): el titular (si está activo), todos los administradores activos y, si el titular tiene asignaciones abiertas, Operaciones y Centro de Operaciones.
- Deduplicación: clave `CRED_EXPIRY:<habilitación>:<vencimiento>:<umbral>` con restricción única (usuario, clave) en `notificaciones`: idempotente entre pasadas, reinicios y dos instancias; un cambio de vencimiento genera clave nueva. Tras una caída sólo se emite el umbral más urgente alcanzado; no se avisa un vencimiento de hace más de 30 días (`catch-up-days`). Un fallo por habilitación no detiene al resto. Pruebas: `CredentialLifecycleIntegrationTest` y `e2e-habilitaciones` (sección F).

## 6. Configuración general, persistencia y recuperación (fase 5)

- Perfiles Docker: `ui` (frontend del E2E), `antimalware` (ClamAV). En producción `antimalware` es obligatorio (`docker-compose.prod.yml` hace que el backend dependa de ClamAV sano).
- Persistencia: volúmenes con nombre `sqlserver_data` (datos), `documents_data` (PDF) y `clamav_db` (firmas). **Los PDF y la base deben respaldarse juntos**: la base referencia archivos por clave.
- Secretos: sólo por entorno (`.env.production`, no versionado; plantilla `.env.production.example`).
- Recursos: límites de `docker-compose.prod.yml` como punto de partida (`PROD_*`), `-XX:MaxRAMPercentage=70` y `ExitOnOutOfMemoryError` para que el contenedor se reinicie en lugar de degradarse.
- Recuperación: ver `PROCEDIMIENTO_ACTUALIZACION_V47_V60.md` (respaldo previo, validaciones, criterios de interrupción y restauración comprobada) y `ACTUALIZACION_BD_Y_RECUPERACION.md` (cadena de respaldos).
- Lista de preparación: `GET /api/admin/readiness` (sólo `ADMINISTRADOR`) y panel en Administración. Elementos obligatorios: esquema sin migraciones pendientes, política activa por cada función, almacenamiento escribible, secreto de sesión suficiente y, **en producción**, antivirus acreditado.
