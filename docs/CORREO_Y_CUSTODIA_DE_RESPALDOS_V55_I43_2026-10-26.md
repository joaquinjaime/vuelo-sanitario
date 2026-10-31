# I-4.3 Correo electrónico (SMTP) y custodia de respaldos para V55 — 2026-10-26

Este documento responde dos preguntas del despliegue V47 → V55: qué cambia para el correo cuando la habitual queda sin SMTP, y qué hay que conservar fuera del disco principal para poder recuperar de verdad. No contiene credenciales ni claves, y no se copió nada a destinos externos.

## 1. Correo: qué ocurre con `MAIL_ENABLED=false`

La habitual no define variables `MAIL_*` en su `.env`; `docker-compose.yml` les da valores por defecto (`MAIL_ENABLED=false`), de modo que V55 arrancará **sin cliente SMTP**. Comprobado con las imágenes release sobre la restauración migrada (perfil `docker`, `MAIL_ENABLED=false`):

* El administrador entra y opera con normalidad; `GET /api/flights` responde 200; `/api/e2e/*` no existe (404).
* Su único correo queda **`SIN_VERIFICAR`** (V54 no marca nada como verificado: no hay evidencia) y **sigue siendo su correo principal**.
* `POST /api/auth/me/correos/{id}/verificacion` responde **503 `MAIL_NOT_CONFIGURED`** ("El servicio de correo no está configurado…"). No envía nada, no simula una entrega y no deja un código vigente.

### Funcionalidades concretas que quedan limitadas

| Función | Con V55 y sin SMTP |
|---|---|
| Verificar un correo (código de un solo uso) | No disponible (503). Ningún correo puede pasar a `VERIFICADO`. |
| Elegir como principal un correo **nuevo** | Rechazado (409 `EMAIL_NOT_VERIFIED`): sólo un correo verificado puede ser principal. El principal que ya existe se conserva. |
| Centro de Operaciones consulta los contactos de la tripulación de un vuelo (I-2) | Los **correos laborales sin verificar no se entregan** (se informa que existe pero no está disponible). Los **teléfonos anteriores a V54 sin país tampoco**; los teléfonos nuevos sí, y no dependen del SMTP. Los contactos **personales** nunca se entregan. |
| Editar la dirección de un correo | Un correo sin verificar se edita en el lugar; uno verificado no (se agrega el nuevo y se confirma). Sin SMTP no hay verificados, así que no hay restricción adicional. |
| Inicio de sesión, activación de cuentas, vuelos, rutas, documentos, auditoría | **Sin cambios**: el sistema no envía correos para ninguna de ellas (el único consumidor de `MailTransport` es `EmailVerificationService`). |

Hoy la habitual tiene 1 usuario, 1 correo y ningún vuelo ni tripulación, de modo que la limitación **no afecta ninguna operación actual**. Sí afectará a Operaciones cuando existan tripulantes con correo laboral que quieran que se les consulte por correo: mientras no haya SMTP sólo podrá coordinar por los teléfonos validados.

### ¿Bloqueo o limitación aceptable?

**Limitación aceptable, no bloqueo**, con dos condiciones: (1) que quede registrada la decisión de desplegar sin SMTP, y (2) que se avise a Operaciones de que los contactos anteriores a V54 deben revalidarse (los teléfonos con su país desde "Mi cuenta"; los correos cuando haya SMTP). Si Operaciones necesita consultar correos laborales desde el primer día, entonces **sí** es un requisito previo a la ventana: configurar SMTP antes o inmediatamente después de desplegar (reinicio del backend, sin cambios de esquema).

### Cómo habilitar SMTP de forma segura (sin inventar datos)

El mecanismo ya existe y no requiere código nuevo; faltan los datos del proveedor, que sólo puede aportar el titular del servicio de correo:

1. En el `.env` local (ignorado por Git) completar `MAIL_ENABLED=true`, `MAIL_HOST`, `MAIL_PORT` (587 por defecto), `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_STARTTLS=true` (o `MAIL_SSL=true` si el proveedor usa TLS implícito), `MAIL_FROM` (remitente autorizado en ese servidor) y `APP_PUBLIC_URL`. Las credenciales llegan sólo por entorno; nunca al repositorio, a la imagen ni a los logs.
2. Recrear sólo el backend con la misma imagen release (`up -d --no-build --pull never --no-deps backend`). El cliente se crea únicamente si `MAIL_ENABLED=true` **y** hay servidor; sin `MAIL_FROM` el servicio sigue informando "no configurado".
3. Probar con una cuenta de prueba: pedir el código, recibirlo en esa dirección y confirmarlo. El éxito del servidor SMTP significa "aceptado", no "entregado": el correo sólo queda verificado cuando alguien devuelve el código.

Desde V61 el código es un OTP decimal de seis dígitos, generado con `SecureRandom` y guardado sólo como HMAC-SHA256 ligado al correo y a la dirección; vence a los 10 minutos, se usa una vez, admite 5 intentos y se reemplaza al reenviar. Los límites persistentes son de 1 envío por 60 s, 5 por correo, 10 por usuario y 50 por origen de red directo al día; el origen se guarda como huella HMAC y no se confía en cabeceras reenviadas. El rechazo por abuso se audita; nada del código ni la dirección completa se registra. Con un certificado/relé propio (por ejemplo, un relé SMTP interno de la organización) se aplican las mismas reglas.

### Alternativas que no debilitan la verificación

* Configurar el SMTP real (recomendado) antes o poco después de la ventana.
* Hasta entonces, coordinar por **teléfonos laborales con país** (no dependen del SMTP) y dejar los correos sin verificar.
* **No son aceptables**: marcar `fecha_verificacion` por SQL, un indicador que omita la verificación, o usar la bandeja de pruebas (Mailpit) en la habitual: retiene los mensajes y no entrega a nadie. Un "atestado del administrador" requeriría un diseño y una auditoría nuevos (fuera de esta etapa).

## 2. Custodia de respaldos fuera del disco principal

Hoy todo (base, volúmenes Docker, respaldos cifrados y claves) está en el mismo equipo y el mismo disco: un fallo del disco o del equipo pierde datos **y** respaldos. Para una recuperación real hay que conservar fuera de ese disco, y **por canales distintos**:

| Qué | Dónde está hoy | Por qué hace falta | Observaciones |
|---|---|---|---|
| FULL cifrado de la ventana (`*.bak.aesgcm`) y el FULL V47/V32 cifrados | `C:\ProgramData\VuelosSanitarios\Backups` | Es el punto de recuperación; el descifrado se verifica sin SQL Server | Copiar sólo el cifrado, no el `.bak` en claro |
| Clave de cada respaldo (`*.key`, 32 bytes) | `C:\ProgramData\VuelosSanitarios\RecoveryKeys` | Sin ella el cifrado es irrecuperable | **Nunca junto al cifrado**; destino con acceso restringido; no mostrarla ni pegarla |
| Secretos de la aplicación (`.env`: contraseña de SA, login y contraseña de la aplicación, `JWT_SECRET`) | `.env` (ignorado por Git) | Restaurar la base en otra instancia no restaura los logins (viven en `master`): hay que recrear el login de la aplicación con su contraseña y reasignar el usuario; `JWT_SECRET` firma las sesiones y deriva la clave de los códigos de verificación | Guardarlos cifrados o en un gestor de contraseñas; separados de los respaldos |
| Imágenes V47 (vigentes) y V55 (`docker image save`) y el ZIP del bundle con su SHA-256 | `%USERPROFILE%\Backups\VuelosSanitarios` y los artefactos de esta etapa | Volver atrás exige las imágenes V47 compatibles con el FULL | Verificar el SHA-256 al copiar |
| Volumen de documentos (hoy vacío) | volumen `vuelos-sanitarios_documents_data` | Los PDF viven fuera de SQL Server | Repetir la comprobación en la ventana |
| Herramientas de recuperación: `RecoveryTools` (Java + librerías), `protect-sql-backup.ps1`, el ZIP de PowerShell 7.4.13 con su hash | `C:\ProgramData\VuelosSanitarios\RecoveryTools` | Recuperar en otro equipo sin depender de este perfil | Recordar: usar `pwsh` 7 o `bash`, no Windows PowerShell 5.1 |
| Código fuente | rama `release/v55-integracion` | Reconstruir las imágenes | Un `git bundle` local verificable; el push al remoto requiere su autorización |

Requisitos mínimos para llamar "recuperable" a una copia externa: (1) el cifrado y la clave llegan por canales separados; (2) se verificó en el destino el SHA-256 y `protect-sql-backup.ps1 -Mode Verify` con `pwsh` 7.4; (3) se probó **una vez** una restauración completa desde esa copia en otra ubicación. Lo que se probó aquí es la recuperación **dentro del equipo** (cadena AES → SQL Server aislado → V47 → imágenes V47); la recuperación desde una copia fuera del equipo **no está probada**. Este equipo no copió nada a destinos externos.
