# I-2b — Verificación de correos y validación internacional de teléfonos — 24 de octubre de 2026

Un correo nuevo ya no se considera confirmado hasta que alguien con acceso a esa dirección devuelve un código recibido en ella, y un teléfono sólo se registra con un país elegido y validado con sus reglas de numeración. Ambas reglas las aplica el **servidor** de forma independiente (la interfaz sólo ayuda a escribir bien el dato). Migración nueva: **V54**, aplicada únicamente a la base aislada `vuelos_sanitarios_e2e`; la habitual sigue en **V47**.

> **Qué requiere infraestructura externa:** todo funciona sin ella **salvo el envío real del código**. Sin un servidor SMTP configurado (`MAIL_*`) el sistema informa "servicio de correo no configurado", no envía ni simula nada y ningún correo queda verificado. Las pruebas usan una bandeja SMTP de pruebas (Mailpit): comprueba el envío y el consumo del código, **no la entrega a un proveedor externo real**, que no se probó.

## 1. Estado inicial

| Aspecto | Hallazgo |
|---|---|
| Git | Rama `main`, commit base `e8fce25`, 131 entradas locales sin commit al comenzar. Sin commit, push, reset ni clean. |
| Flyway | Habitual `vuelos_sanitarios` en **V47** (sólo lecturas: 40 tablas de aplicación, 1 correo, 0 teléfonos). Aislada en **V53** → **V54**. |
| Validación previa de correos | Expresión regular `^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$` y 150 caracteres; aceptaba por ejemplo `a..b@x.co`, `.a@x.co` o `ana@example.1x` y no rechazaba caracteres de control como NUL. Ningún correo se verificaba. |
| Validación previa de teléfonos | Sólo `^\+?\d{6,15}$` tras quitar separadores: sin país, sin plan de numeración, "381" y cualquier cadena de 6 a 15 dígitos eran teléfonos válidos. |
| Infraestructura de correo saliente | **Ninguna**: sin `spring-boot-starter-mail`, sin variables de entorno SMTP; las notificaciones del sistema son internas. |
| I-2 | Estable: 9 pruebas de integración, 13 de interfaz y los E2E de API y Chrome seguían aprobando. El descarte automático de 5 minutos se verificó además en Chrome real con reloj simulado (nuevo bloque en `e2e-contactos-tripulacion-ui.cjs`). No se encontraron defectos en I-2; el E2E sí detectó un defecto **de este incremento** (doble incremento de versión al editar dirección y tipo), ya corregido. |

## 2. Diagnóstico de los puntos de entrada de contactos

| Punto de entrada | Qué es | Reglas anteriores | Reglas ahora |
|---|---|---|---|
| `POST/PUT /auth/me/correos` y `/telefonos` (`PersonContactService`, "Mi cuenta") | Contactos de la **persona** (personal o laboral), los mantiene su titular | formato débil, sin país, sin verificación | formato de correo reforzado, código de verificación, país + libphonenumber |
| `POST /auth/users` (`AuthService.createPending` / `saveContacts`) | Contactos iniciales cargados por ADMINISTRADOR al crear la cuenta | las mismas reglas débiles (duplicadas en otro lugar) | **las mismas reglas que el autoservicio**: teléfono con país obligatorio; el correo nace sin verificar |
| Administrador inicial (`createBootstrapAdmin`) | Un correo desde `BOOTSTRAP_ADMIN_EMAIL` | sin validar | se conserva sin verificar; lo confirma el titular |
| `POST /flights`, `/flights/with-patient` y `/transfer-contacts` (`TransferContactService`) | Teléfonos de **terceros** para coordinar UN traslado (pertenecen a la solicitud, no a una persona) | `^\+?\d{6,15}$` | **mismo servicio de numeración** con país por contacto; sin tocar `personas`/`telefonos` |
| Frontend: `account.jsx`, alta de usuarios (`main.jsx`), formulario DTS (`transferContacts.jsx`) | Formularios | reglas locales parciales | un único componente de teléfono (`PhoneField`) y un único módulo de reglas (`contactRules.js`) |
| Consumidores | `CrewContactService` (I-2), detalle de usuario del administrador | — | sólo correos verificados y teléfonos validados llegan a Operaciones |

Conceptos que **no se confunden**: *personal* (privado, nunca se muestra a Operaciones), *laboral* (declarado por el titular; lo consulta Operaciones si está asignado a un vuelo abierto, y ahora sólo si está verificado/validado), *administrativo* (el alta de la cuenta por ADMINISTRADOR; no es una categoría de contacto) y *específico de un vuelo* (`contactos_coordinacion_traslado`: terceros, por solicitud). No se elimina ningún camino antiguo: **todos** pasan por `PhoneNumbers` y por `ContactNormalizer.emailProblem`. `CreatePatient.telefono` ya se había retirado con los contactos de coordinación (V51) y los DTO de contacto ahora rechazan campos desconocidos (`@StrictJson`), de modo que ningún cliente puede declarar "ya validado".

## 3. Política de verificación de correos

* Un correo registrado **nunca** nace verificado ni disponible para uso operativo: se guarda como candidato (`fecha_verificacion IS NULL`) y se distingue en la API y la interfaz (`VERIFICADO`, `PENDIENTE`, `EXPIRADO`, `SIN_VERIFICAR`). No se persiste un estado redundante: pendiente/vencido se deducen de `verificaciones_correo`.
* **Sólo verifica quien tiene la sesión del titular y el código recibido en esa dirección.** No hay enlace público: la confirmación es autenticada, de modo que un identificador ajeno responde 404 igual que uno inexistente (también para el administrador) y no se revela si una dirección existe en otra cuenta.
* Un correo verificado **no se sobrescribe**: cambiar la dirección exige agregar el nuevo, confirmarlo y recién entonces cambiar el principal y retirar el anterior (el único verificado no se retira mientras no haya otro: `LAST_VERIFIED_EMAIL`). El correo pendiente no puede ser el principal (`EMAIL_NOT_VERIFIED`). Un código vencido o un error de envío no dejan al usuario sin su contacto válido.
* **Correos anteriores** (V49–V53, incluido el del administrador inicial): se conservan sin pérdida y **sin verificar**. Sus titulares los confirman con "Enviar código"; nada se bloquea por tener contactos históricos pendientes. Ningún correo figura verificado sin un código confirmado (invariante comprobada en SQL por el E2E).
* **Integración con I-2:** Operaciones recibe únicamente correos laborales **verificados**; si el titular tiene uno sin verificar, el contacto no se devuelve y la respuesta lo informa (`correoLaboralSinVerificar`). El personal jamás lo reemplaza.

## 4. Arquitectura de tokens

| Aspecto | Decisión |
|---|---|
| Generación | `SecureRandom`, 8 caracteres de un alfabeto sin ambigüedades (sin I, L, O, 0, 1): 31⁸ ≈ 8,5·10¹¹ (≈ 39,6 bits), mostrados `ABCD-EFGH`. Entropía acotada por el límite de intentos (5) y los de envío. |
| Almacenamiento | **Sólo HMAC-SHA256** (clave derivada del secreto JWT con una etiqueta propia) de `idCorreo:dirección-normalizada:código`: ligado al contacto y a la dirección; si la dirección cambia, el código no sirve. Nunca el código en SQL, auditoría ni logs (comprobado con todos los códigos de la corrida E2E). Comparación en tiempo constante. |
| Vencimiento / un solo uso | 30 minutos (`EMAIL_VERIFICATION_CODE_MINUTES`); `fecha_uso` o `fecha_invalidacion` + motivo (`REEMPLAZADO`, `VENCIDO`, `AGOTADO`, `CORREO_MODIFICADO`, `CORREO_RETIRADO`, `ENVIO_FALLIDO`). |
| Una verificación abierta por correo | Índice único filtrado `uq_verificaciones_correo_abierta`; reenviar reemplaza. SQL rechaza dos abiertas, motivos inventados, vigencias imposibles y estados contradictorios. |
| Intentos | 5 por código; el quinto error lo bloquea (`AGOTADO`, HTTP 429). El contador y la auditoría se confirman en su propia transacción: no se pierden con la respuesta de error. |
| Límites de envío | 1 mensaje cada 60 s por correo, 5 por correo y día, 10 por usuario y día (variables `EMAIL_VERIFICATION_*`). El rechazo se audita (`VERIFY_RATE_LIMITED`). |
| Persistencia | Tabla `verificaciones_correo`: sobrevive al reinicio del backend (E2E: se reinició con un código pendiente y se confirmó). |
| Concurrencia | Bloqueo de la fila de la persona: ocho confirmaciones simultáneas del mismo código → exactamente una prospera, un solo evento. |
| Reutilización | **No** se reutilizan los códigos de activación de cuenta: aquel proceso (DNI + código de 24 h, BCrypt, sin sesión) es público y de otro propósito; éste es autenticado, ligado a un contacto y con HMAC. |

## 5. Configuración del servicio de correo

`spring-boot-starter-mail` + abstracción `MailTransport` (`SmtpMailTransport` con `JavaMailSender`). Variables (documentadas en `.env.example` y `docker-compose.yml`; ningún secreto real en el repositorio): `MAIL_ENABLED`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_STARTTLS`, `MAIL_SSL`, `MAIL_FROM`, `APP_PUBLIC_URL` y los límites `EMAIL_VERIFICATION_*`. El cliente SMTP sólo existe si `MAIL_ENABLED=true` y hay servidor; la salud del backend no depende del SMTP. **Que el servidor acepte el mensaje no se presenta como entrega**: se guarda "aceptado por el servidor" (`fecha_envio`) y el correo sólo queda verificado cuando alguien devuelve el código.

| Situación | Comportamiento |
|---|---|
| Sin configuración (entorno habitual hoy) | `envio=NO_CONFIGURADO`, `503 MAIL_NOT_CONFIGURED` al pedir código, ningún código emitido, nada simulado, el correo queda sin verificar. |
| SMTP no responde / rechaza | El contacto se registra, el código se invalida (`ENVIO_FALLIDO`), `envio=FALLIDO` / `502 MAIL_SEND_FAILED`, auditado. Probado en E2E pausando el contenedor de la bandeja. |
| Límite alcanzado | `envio=LIMITE_ALCANZADO` / `429 VERIFICATION_RATE_LIMIT` con segundos de espera. |
| E2E | `docker-compose.e2e.yml` agrega el servicio `mailbox` (Mailpit, API en `127.0.0.1:18025`) y apunta el backend a él; plazo de reenvío de 2 s sólo en E2E (el real es de 60 s). |

## 6. Selector internacional y reglas de numeración

* **Biblioteca:** backend `com.googlecode.libphonenumber:libphonenumber:9.0.42` (Java 21); frontend `libphonenumber-js` (metadatos `max`, que validan patrones y no sólo longitud). El bundle pasó de 420 kB (115 kB gzip) a 626 kB (171 kB gzip): queda como mejora futura cargar los metadatos bajo demanda.
* **Backend decide** (`PhoneNumbers.parse(número, región)`): país obligatorio y soportado; sólo dígitos, espacios, guiones, puntos, paréntesis y un `+` inicial; **extensiones y letras rechazadas con motivo explícito** (no se descartan en silencio); formato nacional (con 0 troncal y 15 móvil argentinos) o internacional, con prefijo que debe ser el del país elegido; `isPossibleNumberWithReason` (corto/largo/incompleto) y `isValidNumberForRegion`. Prefijos compartidos (+1): decide la región elegida (un número canadiense no es válido como estadounidense y viceversa). Guarda **E.164** (`numero_normalizado`), formato internacional legible (`numero`) y país (`codigo_pais`). Errores con `motivo` estable (`PHONE_COUNTRY_REQUIRED`, `…_INVALID`, `…_MISMATCH`, `…_TOO_SHORT`, `…_TOO_LONG`, `…_CHARS_INVALID`, `…_EXTENSION_UNSUPPORTED`, `…_INVALID`).
* **Argentina:** no se antepone `+54` a cualquier cadena: `0381 15 555-1234` → `+5493815551234` (móvil, con 9), `011 5555-1234` → `+541155551234` (fijo, sin 9), `+54 9 381 555 1234` equivale a ambos formatos móviles. Probado también Chile, Brasil, España, Estados Unidos, Canadá, Reino Unido, Uruguay y Perú.
* **Frontend** (`PhoneField`, `contactRules.js`): selector con búsqueda por nombre (sin tildes), código o prefijo; Argentina sólo como sugerencia inicial (se puede cambiar; en datos anteriores sin país **no** se supone); prefijo mostrado aparte; si se escribe `+54…` se quita del campo (no se duplica) y un prefijo inequívoco de otro país cambia el país (el +1 compartido no); errores en vivo (pocos/demasiados dígitos, caracteres, país distinto); "Se guardará como +54 9 381 555 1234 (+5493815551234)" (nota: las dos bibliotecas formatean con distintos separadores; el E.164 es idéntico y el servidor guarda su propio formato). El teléfono nunca se presenta como verificado por SMS: se rotula "formato validado (país)".
* **Duplicados:** la unicidad opera sobre E.164 (`uq_telefonos_vigente_por_persona` de V49, sin cambios). Ocho grafías simultáneas del mismo número → una sola fila vigente (E2E real con SQL Server). Además, un dato anterior sin país cuyo número coincide (con o sin prefijo) bloquea el alta y pide editarlo.

## 7. Integración backend / frontend

Backend: `PhoneNumbers` (nuevo, único), `ContactNormalizer.emailProblem` (reglas reforzadas: sola `@`, parte local ASCII ≤ 64 sin puntos mal ubicados, dominio con etiquetas válidas, dominios internacionales vía punycode, terminación alfabética, sin espacios ni controles; sin eliminar puntos ni `+etiqueta`; normalización: minúsculas), `EmailVerificationService`, `MailTransport`/`SmtpMailTransport`, `PersonContactService`, `AuthService`, `TransferContactService`, `CrewContactService`, endpoints nuevos `POST /auth/me/correos/{id}/verificacion` y `…/verificacion/confirmar`. No se agregó una comprobación DNS/MX: no demuestra recepción y añade dependencia de red; la verificación es el código.

Frontend: `account.jsx` (estados, enviar/reenviar/confirmar, país en teléfonos), alta de usuarios, formulario DTS y contactos de coordinación, detalle de usuario del administrador (muestra verificado / sin verificar y validado / sin validar) y panel de tripulación de I-2 (avisa cuando existe un contacto laboral aún no disponible).

## 8. Cambios SQL — V54 (sin modificar V1–V53)

`correos_electronicos.fecha_verificacion`; `telefonos.codigo_pais` y `contactos_coordinacion_traslado.codigo_pais` con `CHECK` (país en mayúsculas ASCII y E.164 `+[1-9]` + dígitos, 8–16 caracteres, cuando el país está informado); tabla `verificaciones_correo` (PK, FK al correo y al solicitante, `CHECK` de vigencia, de cierre y de intentos, índice único filtrado de verificación abierta e índices de límites). Pasaron de 41 a **42 tablas**. No se tocan filas existentes. Lección: `Hibernate ddl validate` rechazó un `TINYINT` mapeado como entero (H2 no lo detecta); se corrigió el mapeo sin tocar la migración.

## 9. Tratamiento de datos existentes

Análisis (script de sólo lectura [diagnostico-telefonos-sin-pais.sql](../scripts/diagnostico-telefonos-sin-pais.sql)):

| Base | Teléfonos sin país | Con `+` (país determinable) | Sin `+` (país **no** determinable) | Observación |
|---|---|---|---|---|
| Habitual (V47) | 0 | 0 | 0 | sin datos que tratar (1 correo, del administrador inicial) |
| Aislada | 2 908 | 23 (3 distintos, todos AR válidos) | 2 885 (21 distintos; 10 dígitos) | todos serían válidos en Argentina, pero **no se supone** |

Estrategia: **no se transforma ni se infiere nada**. Los registros se conservan idénticos (hash verificado en el E2E), se marcan "sin país" en la interfaz, **no se entregan a Operaciones** y los valida su titular eligiendo el país (o el DTS en una solicitud). Un eventual relleno automático de los 23 con `+` válido queda como procedimiento aparte, con autorización. Posibles duplicados tras normalizar se detectan en el alta/edición y con el script de diagnóstico (consulta 2).

## 10. Auditoría

Nuevas operaciones sobre `PERSON_EMAIL` (sólo ADMINISTRADOR las ve): `VERIFY_REQUEST`, `VERIFY_RESEND`, `VERIFY_CONFIRM`, `VERIFY_EXPIRED`, `VERIFY_LOCKED`, `VERIFY_RATE_LIMITED`, `VERIFY_SEND_FAILED`, con la dirección **enmascarada** y el estado. Los eventos de teléfonos incluyen el país y siguen enmascarando el número. Nunca se registran códigos, enlaces ni credenciales SMTP (comprobado contra los códigos reales de la corrida). Cambio de dirección, retiro y principal ya se auditaban.

## 11. Pruebas

| Prueba | Resultado |
|---|---|
| Backend `mvn -o test` | **437 aprobadas** (402 + 35: `PhoneNumbersTest` 8, `EmailVerificationIntegrationTest` 12, `PhoneInternationalIntegrationTest` 8, `SmtpMailTransportTest` 3, `ContactNormalizerTest` +2 y casos nuevos en las pruebas de coordinación e I-2). |
| Frontend `vitest run` | **197 aprobadas** en 15 archivos (180 + 17: `contactRules.test.js` 8, `account.test.jsx` 16 reescrito, `users.test.jsx` +1, `crewContacts.test.jsx` +1); `vite build` correcto. |
| `e2e-verificacion-correo.cjs` (API + SQL Server + bandeja SMTP) | **11 bloques**: recorrido completo, intentos, reenvío y límites, vencimiento con reloj ajustable, reemplazo de un correo verificado, **servidor SMTP caído**, reinicio del backend, concurrencia, restricciones SQL, ausencia de códigos en SQL/auditoría/logs. |
| `e2e-telefonos-internacionales.cjs` | **8 bloques**: nueve países a E.164, rechazos directos a la API sin residuos, equivalencias y concurrencia, edición con versión, datos anteriores, alta administrativa, contactos de coordinación, restricciones SQL, auditoría. |
| `e2e-verificacion-contactos-ui.cjs` (Chrome) | **3 bloques**: selector de países y correo con código recibido en la bandeja, y el selector en el formulario del DTS. |
| E2E de I-2 | API 8 bloques y Chrome 9 (nuevo: descarte automático a los 5 minutos con reloj simulado del navegador). |
| Suite Node completa (`e2e-suite-completa.cjs`, **32 scripts**: los 29 de I-2 + 3 nuevos) | **32/32 aprobados en una única pasada** (≈ 70 min), ejecutada sobre las imágenes reconstruidas con el código final; después de ella sólo se tocó documentación. Incluye `e2e-usuarios` (cuenta con un único administrador), activación, contactos personales, laborales, de coordinación y la migración de contactos. |

Pruebas que verifican lo no obvio: 0 correos verificados sin un código confirmado; el código del token agotado ya no sirve ni siquiera si es el correcto; Operaciones no recibe un correo laboral pendiente ni un teléfono laboral anterior sin país; un teléfono de coordinación jamás pasa a `telefonos`.

## 12. Configuraciones pendientes y límites

1. **Configurar un SMTP real** (`MAIL_*`) en cada entorno; en el habitual está desactivado. Hasta entonces nadie podrá verificar un correo y Operaciones no verá correos.
2. **Entrega real no probada:** sólo se probó contra una bandeja de pruebas.
3. Aplicar V48–V54 a la base habitual **no está autorizado ni hecho**; requiere el procedimiento de respaldo ya documentado y la configuración SMTP.
4. Sin verificación por SMS; el formato válido no prueba que la línea exista.
5. Los 2 885 teléfonos sin `+` y sin país de la base aislada esperan validación por sus titulares.
6. Código y no enlace: no hay verificación sin sesión; el correo queda "pendiente" si el titular no inicia sesión.
7. Un administrador no puede corregir contactos ajenos (sigue sin política).
8. Los intentos denegados siguen sin auditarse (los de abuso de verificación **sí**).
9. Metadatos de libphonenumber-js y de Google pueden diferir levemente por versión; decide el servidor.
10. Deuda de seguridad pendiente (no modificada): enumeración de cuentas en `POST /auth/activar-cuenta` (véase el informe de I-2, §9).

## 13. Estado de Flyway

| Base | Versión | Observación |
|---|---|---|
| Habitual | **V47** | Sólo lecturas. Sin migraciones, reinicios ni escrituras. Cambios de `docker-compose.yml` (variables `MAIL_*` con valores vacíos por defecto) sin aplicar. |
| Aislada E2E | **V54** | V54 aplicada por Flyway al reconstruir `backend`, `frontend` y el nuevo `mailbox` del proyecto E2E. |

## 14. Próxima implementación

**I-3, elegibilidad de la tripulación** (prioridad de seguridad operativa): revocar o dejar vencer una habilitación profesional **no revalida las asignaciones existentes** (`ProfessionalCredentialService.decide` no consulta `vuelos_tripulantes`), la clasificación `COMANDANTE`/`perfiles_comandante` no se contrasta con los vuelos futuros y no hay aptitud previa al inicio del vuelo. Véase §10 del informe de I-2. No se implementó en esta ejecución.
