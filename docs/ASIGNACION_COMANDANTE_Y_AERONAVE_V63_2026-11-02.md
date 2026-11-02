# Asignación de comandante y aeronave, ubicación operativa y excepciones geográficas (V63)

Fecha: 2026-11-02 · Rama: `fix/asignacion-comandante-aeronave-ubicacion` · Migración: **V63**

## 1. Diagnóstico

Se reprodujo el fallo antes de corregirlo (script de reproducción sobre el stack E2E con el código previo y consulta de solo lectura a la base habitual).

| Problema | Causa raíz comprobada |
|---|---|
| **A. CO no puede asignar un comandante** | La lista de candidatos (`GET /flights/{id}/available-commanders`) solo devolvía comandantes con `perfiles_comandante.id_provincias` igual a la provincia de origen. En la base habitual (V62) el único comandante tiene `id_provincias = NULL`, de modo que la lista era `[]`. La pantalla de CO solo dibujaba el selector `Comandante` si la lista traía elementos: no mostraba ningún mensaje. |
| **B. No hay forma de registrar la ubicación** | Existía un único mecanismo: un `<select>` de provincias, sin etiqueta visible, dentro de la tabla de *Usuarios activos* del Administrador (`POST /catalogs/commanders/{id}/location`). Solo guardaba **provincia**: no había localidad, ni fecha, ni responsable en el perfil; CO no tenía ninguna pantalla. |
| **C. La aeronave aparece pero no se confirma** | (1) La asignación era **una sola operación atómica de aeronave + comandante** (`POST /flights/{id}/resources`); con la lista de comandantes vacía el botón *Confirmar asignación* nunca se habilitaba, sin explicación. (2) Defecto adicional: si se enviaba un comandante sin provincia, `FlightService.assign` lanzaba `NullPointerException` (línea del chequeo de provincia) y el cliente recibía **HTTP 500 «Error interno»** (reproducido). |

A, B y C comparten una causa: **el dato «dónde está el comandante» no estaba modelado de forma usable** (solo provincia, sin pantalla para CO, sin estado «desconocido» tratado explícitamente) y la asignación no admitía elegir los recursos por separado.

Otros defectos relacionados: en el modelo anterior la regla geográfica era por provincia (estar en Concepción valía como estar en San Miguel de Tucumán); los 566 aeropuertos de la base habitual tienen `id_localidades = NULL` (relación incompleta aeropuerto–localidad), por lo que **no se inventan radios ni cercanías** y la regla ordinaria compara únicamente la localidad del comandante con la **localidad de salida solicitada** (`vuelos_sanitarios.id_localidad_origen`).

## 2. Reglas de negocio resultantes

* **Ubicación operativa** = localidad actual del comandante (`perfiles_comandante.id_localidades_actual`), con su provincia, la fecha y el usuario que la registró. **No es el domicilio** (que no se registra) ni la disponibilidad (cuenta activa, clasificación, habilitación, conflictos).
* **Estados de la ubicación**: `CONOCIDA`, `SOLO_PROVINCIA` (perfiles anteriores a V63: falta la localidad), `DESCONOCIDA` y `LOCALIDAD_DESHABILITADA`. Los comandantes existentes conservan su fila; no se les asignó ninguna ciudad.
* **Elegibilidad ordinaria** (la comprueba el backend, nunca el filtro de React): comandante en la **misma localidad** que la salida **y** apto con la evaluación vigente (`CrewManagementService.evaluate`: cuenta activa, clasificación, habilitación verificada y vigente para el tipo de vuelo/aeronave, informes finales, conflictos de horario).
* **Excepción geográfica** (otra localidad, otra provincia, sin ubicación, solo provincia o localidad deshabilitada): solo si el rol es **CENTRO_OPERACIONES** (`OPERACIONES` recibe 403 `GEOGRAPHIC_EXCEPTION_NOT_AUTHORIZED`), con **justificación obligatoria de al menos 15 caracteres**, y únicamente después de superar todas las demás validaciones. Se registra en `excepciones_geograficas_comandante` (tipo, motivo, autorizante, fecha, localidad del comandante y de salida) y en la auditoría. Si el comandante ya está en la localidad, enviar una excepción se rechaza (400 `GEOGRAPHIC_EXCEPTION_NOT_NEEDED`). Sin excepción: 409 `COMMANDER_OUTSIDE_DEPARTURE_LOCALITY`.
* **Quién actualiza la ubicación**: ADMINISTRADOR y CENTRO_OPERACIONES / OPERACIONES (`PUT /api/commanders/{id}/location`, auditado con valor anterior). **El comandante no puede modificar la propia**: si pudiera declararla, la restricción dependería de lo que afirme el propio comandante; solo puede consultarla (`GET /api/commanders/{id}/location`, solo la propia).
* **Estados que admiten asignar/reservar recursos**: solicitud sanitaria `APROBADO` (horario acordado; el acuerdo solo lo fija `FlightService.fixSanitarySchedule`) con vuelo sin estado o `PLANIFICADO`. Antes del acuerdo todo se rechaza en el servidor (400) igual que los documentos (409 `DOCUMENTS_LOCKED_SCHEDULE_NOT_AGREED`): no se reabre el problema anterior.
* **Reserva vs. asignación definitiva**: confirmar un solo recurso lo deja **reservado** (el vuelo sigue `APROBADO`, el comandante todavía no lo ve ni recibe aviso, la aeronave reservada se excluye de otros vuelos en el mismo horario). Al estar los dos, el vuelo pasa a `PLANIFICADO`, se vincula al comandante en la tripulación, se reevalúa la ruta, se audita y se avisa al comandante. Al completar se **revalidan** la habilitación para esa aeronave y que el comandante siga en la localidad (o tenga excepción vigente).
* **Aeronave asignable**: activa, en la provincia de origen solicitada, no «en vuelo», sin vuelo comprometido ni reservado en el horario y con capacidad de tripulación suficiente. Si cambió entre la consulta y la confirmación: 409 con mensaje claro y la pantalla actualiza la lista.
* **Concurrencia**: transacciones `SERIALIZABLE`, bloqueo del vuelo y de la aeronave/usuario (mismo orden que las asignaciones anteriores).

## 3. Base de datos (V63)

* `perfiles_comandante`: `id_localidades_actual`, `fecha_ubicacion_actual`, `id_usuario_ubicacion` (todas NULL; no se tocan filas). FK compuesta `(id_localidades_actual, id_provincias) → localidades(id_localidades, id_provincias)` (la base impide que la localidad sea de otra provincia, sin duplicar el dato geográfico), `CHECK` que exige provincia, fecha y responsable cuando hay localidad, e índices.
* `localidades`: clave alternativa `uq_localidades_id_provincia`.
* Tabla nueva `excepciones_geograficas_comandante` (una tabla de aplicación más; el inventario de tablas de `docs/INFORME_COMPLETO_BASE_DATOS.md` no se regeneró en esta entrega): historial, sin borrados; `fecha_reemplazo` cierra la excepción cuando se reemplaza al comandante.
* Efecto sobre datos existentes: ninguno (columnas nulas). Los comandantes sin localidad quedan «sin ubicación» y no son elegibles de forma ordinaria hasta que se registre.

## 4. API

| Método y ruta | Rol | Uso |
|---|---|---|
| `GET /api/commanders/locations?q&provinceId&estado` | ADMIN, CO, OPERACIONES | listar ubicaciones |
| `GET /api/commanders/{id}/location` | ADMIN, CO, OPERACIONES; COMANDANTE solo la propia | consultar |
| `PUT /api/commanders/{id}/location` `{provinciaId, localidadId, motivo?}` | ADMIN, CO, OPERACIONES | registrar/corregir |
| `POST /api/catalogs/commanders/{id}/location` `{locationId}` | ADMIN, CO, OPERACIONES | contrato anterior (solo provincia; deja la localidad desconocida) |
| `GET /api/flights/{id}/commander-candidates?q=` | CO, OPERACIONES | ordinarios, no elegibles con su causa, candidatos a excepción, resumen y mensaje |
| `PUT /api/flights/{id}/commander` `{comandanteId, excepcionGeografica?}` | CO, OPERACIONES | reservar / asignar comandante |
| `PUT /api/flights/{id}/assigned-aircraft` `{aircraftId}` | CO, OPERACIONES | reservar / asignar aeronave (con el vuelo `PLANIFICADO` delega en el cambio de aeronave) |
| `POST /api/flights/{id}/resources` | CO, OPERACIONES | asignación combinada (contrato original; misma regla geográfica) |
| `GET /api/flights/{id}/available-commanders` | CO, OPERACIONES | solo los ordinarios (misma forma que antes) |

## 5. Interfaz

* **Centro de Operaciones** (detalle del vuelo, etapa «Horario acordado» y «Preparación»): panel *Asignación de recursos* con dos tarjetas, cada una con estado (Pendiente / Reservado / Asignado), datos del recurso, ubicación operativa del comandante y excepción registrada, acción visible, procesamiento sin doble envío, éxito solo tras la respuesta del servidor y causa de bloqueo junto a la acción. Sin candidatos muestra «No se encontraron comandantes disponibles en la localidad de salida…» con las causas.
* **Centro de Operaciones → Comandantes** y **Administrador → Ubicación de comandantes**: lista con filtros, estado de la ubicación, quién y cuándo, y edición provincia → localidad.
* Se retiró el selector de provincia suelto de la tabla de usuarios (solo guardaba la provincia).

## 6. Evidencia

* **Reproducción previa** (stack E2E, código anterior): sin ubicación el comandante no se ofrecía; asignar aeronave + comandante sin provincia devolvía HTTP 500 (`NullPointerException` en `FlightService.assign`); con la provincia (contrato anterior) la asignación combinada sí funcionaba, lo que confirma que el bloqueo era la ubicación ausente y el diseño atómico.
* **Backend** (JUnit + H2 + Mockito): 641 pruebas, 0 fallos (`mvn -o test`). Nuevas: 13 en `AircraftAssignmentFlightServiceTest` (regla por localidad, excepción autorizada/no autorizada/sin motivo, no omite validaciones, reserva en ambos órdenes, reserva de aeronave, ubicación movida antes de completar, candidatos y mensaje), 9 en `CommanderLocationServiceTest`, 8 en `ResourceAssignmentAuthorizationTest` (autorización por rol, cuerpos inválidos, `@StrictJson`).
* **Frontend** (Vitest): 302 pruebas en 28 archivos, 0 fallos (nuevas: `resourceAssignment.test.jsx` 11, `commanderLocations.test.jsx` 5; `flightStages.test.js` actualizada).
* **E2E con SQL Server real** (stack aislado `vuelos-sanitarios-e2e`, base en V63 aplicada por Flyway, JAR final):
  * `e2e-asignacion-recursos.cjs`: 18 escenarios — esquema y restricciones reales (la FK compuesta y el CHECK rechazan datos inválidos), casos 2, 3, 4, 5, 6, 7, 8, 9, 10 (carreras reales en ambos órdenes por aeronave y por comandante), 11 (trigger temporal que fuerza un fallo de auditoría: sin estado, aeronave, tripulación ni aviso a medias), 12, 13 y 14 (DTS, comandante, administrador y OPERACIONES por HTTP directo).
  * `e2e-asignacion-recursos-ui.cjs` (Chrome): Administrador registra la ubicación y persiste tras recargar; CO reserva comandante, confirma aeronave, el vuelo pasa a PLANIFICADO y sobrevive a la recarga; explicación sin candidatos; excepción justificada; el comandante ve el vuelo en su planificación.
  * Regresión: `e2e-perfiles-comandante`, `e2e-solicitudes`, `e2e-aeronaves-tripulacion`, `e2e-cierre`, `e2e-documentos`, `e2e-documentos-horario`, `e2e-roles-clasificaciones`, `e2e-rutas-revision`, `e2e-auditoria`, `e2e-geografia-integridad`, `e2e-elegibilidad-tripulacion`, `e2e-habilitaciones-vuelos`, `e2e-contactos-tripulacion`, `e2e-usuarios-aislado` y las UI `e2e-solicitudes-ui`, `e2e-documentos-integracion-ui`, `e2e-rutas-revision-ui`, `e2e-sanitario-replanificacion-ui`, `e2e-auditoria-ui`: todos aprobados.
  * Scripts existentes que se adaptaron: los que asignan vuelos sanitarios ubican al comandante con `placeCommander` (localidad de salida) en lugar de sólo la provincia; `e2e-contactos-tripulacion` (umbral de migraciones), `e2e-auditoria-ui` (mayúsculas del rediseño) y `e2e-sanitario-replanificacion-ui` (nuevo panel).
  * **No aprobado**: `e2e-cierre-ui.cjs` aprueba los pasos de vuelo e informe (UI-1 a UI-4) y falla en la verificación de avisos (UI-5): el script busca la región «Notificaciones» en la pantalla principal y, tras el rediseño de navegación, los avisos están en la vista «Notificaciones». Parece un script desactualizado y ajeno a esta corrección, pero **no se comparó contra el commit anterior**; no se modificó.
* **Despliegue local verificado**: copia de seguridad `COPY_ONLY` con `CHECKSUM` verificada de la base habitual (V62) antes de migrar; el backend habitual aplicó V63 (un solo cambio, 0,187 s) y está saludable; el JAR en ejecución tiene el mismo SHA-256 que el compilado; la base conserva 4 usuarios, 1 vuelo, 1 aeronave y 1 perfil de comandante; el frontend servido contiene el código nuevo; `GET /api/commanders/locations` responde con el comandante real en estado `DESCONOCIDA`.
* **No verificado**: la construcción de imágenes con el Dockerfile oficial (el paso de Maven dentro de BuildKit falló por `Temporary failure in name resolution` al descargar dependencias en este equipo; las imágenes backend se generaron con el JAR compilado localmente sobre la imagen anterior, mismo runtime); la asignación con credenciales reales de CO sobre la base habitual (no se usó ninguna cuenta real de CO ni se modificaron datos de la base habitual); la suite completa de scripts E2E (se ejecutó el subconjunto afectado).

## 7. Limitaciones y pendientes

* No se definieron radios de cobertura, aeropuertos cercanos ni traslados: la política del proyecto no los documenta; toda situación fuera de la localidad es excepción.
* Los aeropuertos siguen sin `id_localidades` (566/566 NULL): la aeronave se valida por provincia de origen y, si ya hay origen planificado, por ese aeropuerto.
* Cambiar la ubicación de un comandante **ya asignado** no invalida la asignación (la regla se aplica al asignar); si cambia entre la reserva y la completitud se rechaza la completitud.
* No hay flujo de «solicitud de actualización» iniciado por el comandante: CO y Administrador lo gestionan directamente.
