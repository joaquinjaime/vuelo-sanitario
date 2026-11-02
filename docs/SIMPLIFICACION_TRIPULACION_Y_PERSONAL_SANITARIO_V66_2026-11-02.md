# Simplificación de la tripulación y del personal sanitario (V66) — 2026-11-02

Este documento **reemplaza** las reglas de habilitaciones profesionales, clasificaciones administrativas, políticas de suficiencia y verificación documental
(I-5.6, I-5.7, I-5.8, `REQUISITOS_COMANDANTE_CLASIFICACION_ADMINISTRATIVA`, `DECISION_POLITICAS_PROFESIONALES_I58`). Esas reglas quedaron **fuera del alcance**:
la aplicación administra quién participa en cada vuelo, con qué función y qué recursos hay disponibles; no certifica profesionales aeronáuticos ni sanitarios.

> La licencia de un comandante y la matrícula de un médico o enfermero son **datos declarados** para identificar a la persona. La aplicación no los verifica ante
> ningún organismo (no hay integración con ANAC ni registros profesionales) y nunca los presenta como credenciales verificadas.

## A. Diagnóstico

| Complejidad anterior | Efecto | Decisión |
|---|---|---|
| Un comandante necesitaba cuenta activa **+** clasificación administrativa **+** política de suficiencia activa **+** habilitación documentada y verificada (PDF, antimalware, consultas externas) | Nadie era asignable hasta que Administración cargaba 3–4 trámites; con 0 políticas, **nadie** podía serlo (caso real: `maria123`) | Se eliminan del flujo. El comandante es asignable al crearse |
| El copiloto, el médico y el enfermero eran **usuarios** clasificados con su propia habilitación | Cuentas innecesarias; Administración decidía quién viajaba | El copiloto es un usuario COMANDANTE asignado por CO; médicos y enfermeros son registros de DTS **sin cuenta** |
| Disponibilidad: sólo solapamiento de horarios y la ubicación registrada | No se podía encadenar vuelos; tampoco se detectaban ubicaciones futuras incoherentes | Ubicación **prevista** derivada del itinerario (sin campo redundante) |

## B. Tablas y relaciones

* **Conservadas sin cambios:** `personas`, `usuarios`, `usuarios_roles`, `perfiles_comandante` (licencia y provincia), `vuelos`, `vuelos_sanitarios`, `vuelos_tripulantes`
  (ya representaba la función por vuelo; `COMANDANTE` y `COPILOTO`), `roles_tripulacion`, `eventos_auditoria`, `notificaciones`, `aeronaves`, `aeropuertos`, el sistema de
  documentos de vuelo (`documentos_vuelo`, `versiones_documento_vuelo`, `bloqueos_documento_vuelo`).
* **Modificada (V66):** `excepciones_geograficas_comandante` + columna `funcion` (`COMANDANTE` | `COPILOTO`, por defecto `COMANDANTE`; las filas existentes son de comandantes).
* **Nuevas, estrictamente necesarias (V66):**
  * `personal_sanitario` — profesional de un DTS: `id_personas` (identidad reutilizada), `id_usuario_dts` (responsable del catálogo), `tipo_profesional` (`MEDICO`/`ENFERMERO`),
    `matricula`, `esta_activo` + `fecha_desactivacion`, versión optimista. Únicos: `(dts, persona)` y `(dts, tipo, matrícula)`. **Sin** columnas de cuenta, contraseña o rol.
  * `vuelos_personal_sanitario` — participación en un vuelo con baja lógica (`fecha_baja`, `id_usuario_baja`, `motivo_baja` ∈ `RETIRO|REEMPLAZO`); índice único filtrado
    `(vuelo, profesional)` para participaciones vigentes.
* **Dejaron de usarse (no se borran, historial):** `clasificaciones_tripulacion`, `habilitaciones_profesionales`, `documentos_habilitacion`, `decisiones_habilitacion`,
  `consultas_externas_habilitacion`, `politicas_habilitacion`. Siguen con sus disparadores de inmutabilidad y quedan marcadas con una descripción extendida
  («retirada del flujo funcional; sólo historial»). La aplicación ya no las lee ni las escribe. Se verificó que **ningún** FK o disparador del flujo vigente depende de ellas.
  Los datos del entorno habitual (2 clasificaciones y 1 habilitación de `maria123`) permanecen intactos.
* **Restricciones:** una persona no puede ser comandante principal y copiloto del mismo vuelo (índice único filtrado de V45 `(vuelo, usuario)` + validación explícita);
  el profesional sanitario pertenece a un único DTS y sólo el DTS solicitante del vuelo puede asignarlo (verificado en la misma transacción).
* **Datos históricos:** ninguna migración modifica ni borra filas. Las asignaciones antiguas de `MEDICO`/`ENFERMERO` como usuarios en `vuelos_tripulantes` se conservan y se
  muestran como historial (la evaluación de esas funciones históricas devuelve «HISTORICO»: ya no se reevalúan).
* **Pertenencia de DTS:** el modelo no tiene una entidad «organización» y no se inventó una. El catálogo es **de cada cuenta DTS**; otro DTS no lo ve ni lo modifica (404), igual que la
  solicitud (`solicitado_por`) ya era de una cuenta. Si en el futuro existe una institución compartida, el campo `id_usuario_dts` pasaría a una clave de organización.

## C. Backend

* `CrewManagementService` (simplificado): `evaluate(vuelo, usuario, función, disponibilidad)` es la **única** decisión de elegibilidad: cuenta activa, rol de acceso `COMANDANTE`,
  licencia registrada, informes finales al día (sólo comandante principal) y, con vuelo, disponibilidad horaria. `requirements(...)` explica cada condición. Se retiraron
  clasificación, política y habilitación.
* `CrewItineraryService` (nuevo): ubicación **prevista** de una persona al despegar un vuelo (último vuelo abierto, como comandante o copiloto, que llega antes); consulta masiva para listar
  candidatos; `revalidate` revisa los vuelos posteriores de las personas afectadas.
* `HealthStaffService` / `HealthStaffController` (nuevos): catálogo y asignación (ver E.5–E.7).
* `FlightService`: `assignCopilot` / `replaceCopilot`; candidatos por función (`/commander-candidates?funcion=COMANDANTE|COPILOTO`); la regla geográfica usa la ubicación prevista;
  al **finalizar** un vuelo, comandante y copiloto quedan ubicados en la jurisdicción de llegada (auditado); cancelar o cambiar aeropuertos revalida itinerarios; el aeropuerto/capacidad
  incluye al personal sanitario; los vuelos operativos usan la misma ubicación prevista.
* `CrewEligibilityMonitoringService`: barrido periódico (sólo avisos) de elegibilidad e itinerario.
* `AuthService`: el alta de un comandante acepta `provinciaId` (provincia o CABA de ubicación operativa inicial; no pisa una existente).
* **Endpoints:** nuevos `GET|POST /api/health-staff`, `PUT /api/health-staff/{id}`, `POST /api/health-staff/{id}/active`, `GET|POST /api/flights/{id}/health-staff`,
  `GET …/candidates`, `PUT|DELETE …/{asignación}`. Retirados: `/api/crew-qualifications/**`, `/api/users/{id}/professional-credentials`, `/api/professional-credentials/**`,
  `/api/professional-credential-documents/**`, `/api/credential-policies/**`, `/api/professional-credential-retention/**`, `/api/flights/{id}/crew/available|candidates`.
  `GET /api/admin/readiness` se conserva (sin los ítems de políticas, antivirus y vencimientos).
* **Eliminados:** entidades, repositorios y servicios de habilitaciones, políticas, documentos de habilitación, antivirus (clamd) y `PdfInspector` (sólo servían a esos documentos; el
  sistema de documentos de vuelo no los usa), avisos de vencimiento y la revisión masiva por cambio de política. Configuración `app.antimalware.*`, `app.credential-expiry.*` y retención retirada de `application.yml`.
* **Autorización por función:** el rol global (`COMANDANTE`) no basta; las operaciones del comandante exigen ser **el comandante asignado a ese vuelo** (`flight.comandante`). El copiloto no
  ve el vuelo en su lista, no lo abre (403), no planifica ruta, no registra clima, no responde la asignación ni toca la tripulación.

## D. Frontend

* **Eliminados:** pestaña «Habilitaciones» (políticas y activación), `credentials.jsx`, «Clasificación administrativa de tripulación», panel de requisitos pendientes, subida de PDF de habilitaciones.
* **Simplificados:** el alta de usuario con rol COMANDANTE pide **licencia y provincia/CABA** (sin trámites posteriores). La lista de requisitos de un candidato sólo muestra condiciones reales (cuenta, rol, licencia registrada, informes, disponibilidad).
* **Nuevos:**
  * DTS → **«Personal sanitario»**: formulario breve (tipo, nombre, apellido, DNI, matrícula) y tabla (editar, desactivar/reactivar). En «Mis solicitudes», panel «Personal sanitario del vuelo» (agregar, retirar, sustituir, historial) mientras el vuelo esté confirmado y no haya iniciado.
  * Centro de Operaciones → en «Asignación de recursos», tarjeta **Copiloto (opcional)** junto a Comandante y Aeronave, con la misma lista de candidatos (ubicación prevista visible), excepción justificada y retiro. Ve —sin modificar— el personal sanitario elegido por el DTS.
  * Comandante → ve el personal sanitario de su vuelo (sólo lectura). No hay pantalla de copiloto ni de médicos/enfermeros.

## E. Reglas de negocio definitivas

1. **Crear un comandante:** Administración crea el usuario con rol COMANDANTE, licencia y provincia/CABA. Queda asignable; no hay clasificación, política, documentos ni aprobaciones.
2. **Elegibilidad para un vuelo:** cuenta activa; rol COMANDANTE; licencia registrada; sin informes finales vencidos (comandante principal); sin conflicto horario; y la **ubicación prevista** al despegar
   (registrada, o la de llegada de su último vuelo anterior) debe ser la provincia/CABA del aeropuerto de salida — o excepción justificada de Centro de Operaciones.
3. **Copiloto:** CO elige a otro usuario COMANDANTE (nunca al principal) con las mismas condiciones, aplicadas a la función COPILOTO. Es **opcional**: el proyecto no tiene una política fundamentada de cuándo es obligatorio, y no se inventó una.
4. **Compromisos futuros:** se derivan de los vuelos asignados (comandante o copiloto, no terminales). Horarios: el vuelo evaluado y el existente se comparan por intervalo; si falta información (p. ej. el otro vuelo no tiene
   hora de llegada y podría seguir en curso) el resultado es **INDETERMINADO** y la asignación **no se confirma** (`HORARIO_INDETERMINADO`); no se inventaron tiempos de descanso ni de reposicionamiento.
   La ubicación actual no se adelanta; cambia sólo al finalizar el vuelo. Cancelación, cambio de aeropuerto, reasignación o retiro de copiloto revalidan los vuelos posteriores: Operaciones recibe un aviso (una vez por situación), queda un
   evento de auditoría `ITINERARY_REVIEW_REQUIRED`, la tripulación del vuelo muestra «ITINERARIO_INCOHERENTE» y **nada se elimina en silencio**.
5. **Registro de médicos y enfermeros:** cada DTS registra nombre, apellido, DNI, matrícula y tipo. Si el DNI ya corresponde a una persona (usuario, paciente u otro profesional) sólo se reutiliza la identidad cuando el nombre coincide; nunca se
   fusiona ni se corrige. Los datos personales se editan sólo si la identidad no pertenece a otra cuenta o registro. Matrícula y licencia son **un único dato** (`matricula`).
6. **Asignación al vuelo:** sólo el DTS solicitante, con la solicitud APROBADA (horario acordado) y el vuelo sin iniciar (sin estado, PLANIFICADO o pendiente de replanificación). Sin duplicados; sin participaciones simultáneas incompatibles cuando los horarios están definidos;
   retiro/sustitución con historial; no se desactiva a un profesional asignado a un vuelo abierto. No hay cantidad fija obligatoria; el personal sanitario ocupa lugar en la capacidad de tripulación de la aeronave (regla ya existente).
7. **Tripulación completa:** comandante y copiloto en `vuelos_tripulantes` (función por vuelo; una misma persona puede ser comandante en un vuelo y copiloto en otro); personal sanitario en `vuelos_personal_sanitario`.

## F. Pruebas

Ver el informe de cierre de la entrega (resultados reales de backend, frontend y E2E). Nuevos: `HealthStaffServiceTest`, `CrewItineraryServiceTest`, `CrewCompatibilityTest`, `CrewManagementServiceTest` (reescrita),
pruebas de copiloto/itinerario en `AircraftAssignmentFlightServiceTest`, `healthStaff.test.jsx`, `copilot.test.jsx`, y los E2E `e2e-simplificacion-tripulacion.cjs` (API, casos 1–15) y `e2e-personal-sanitario-ui.cjs` (Chrome).

## G. Alcance retirado de las pruebas E2E

Se retiraron los scripts que verificaban exclusivamente el modelo anterior (`e2e-habilitaciones*`, `e2e-politicas-documentos*`, `e2e-antimalware-produccion`, `e2e-requisitos-comandante*`, `e2e-roles-clasificaciones*`,
`e2e-elegibilidad-tripulacion*`, `e2e-tripulacion-actualizacion-ui`, `e2e-aeronaves-tripulacion*`, `e2e-contactos-tripulacion*`, `e2e-credential-ui`, `e2e-crew-ui` y los ensayos de migración V59/V60). La cobertura de capacidad de aeronave, historial de tripulación, conflictos y
concurrencia sigue en `AircraftCrewConcurrencyIntegrationTest` y `CrewManagementServiceTest`; los contactos laborales de la tripulación (comandante y copiloto) siguen cubiertos por `CrewContactIntegrationTest`.
