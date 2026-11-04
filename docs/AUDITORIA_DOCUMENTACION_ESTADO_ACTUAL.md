# Auditoría documental del estado actual de Vuelos Sanitarios

**Fecha de corte:** 3 de noviembre de 2026, Argentina.

## 1. Resumen ejecutivo

Los informes describen la versión correcta del repositorio y el inventario físico coincide con SQL Server. La revisión identificó **7 errores documentales agrupados por causa**, **3 contradicciones cruzadas** dentro de esos hallazgos y **2 inconsistencias funcionales** demostrables por el código. Las cifras cuentan hallazgos, no líneas modificadas. El catálogo de CHECK se corrigió como un hallazgo único aunque afectaba 75 definiciones repetidas en dos lugares.

La inconsistencia de mayor gravedad es el exceso de plazas de tripulación: el DTS puede producirlo después de asignar una aeronave y la operación de inicio permite que llegue a EN_CURSO si se cumplen sus demás controles. La otra inconsistencia es un aviso de asignación al copiloto que enlaza a un detalle que su asignación por sí sola no autoriza.

## 2. Versión y entornos

| Aspecto | Resultado |
|---|---|
| Rama y revisión | `codex/auditoria-ux-vuelos`, `ef9bb09`. |
| Diferencia con `main` local | `21d42e3`, 0 commits exclusivos de `main` y 18 exclusivos de la rama, 345 archivos cambiados. `origin/main` local apunta a `01497e5`. No se consultó ni actualizó el remoto. |
| Historial determinante | `0257f32` V63 y reservas, `a51bb26` V64/V65 y geografía, `b1c9d02` modelo intermedio, `d3aab49` V66 backend, `cadceab` UI V66, `090cdfe` E2E específicos, `6d2fa45` rutas, `c6abc93` etapas y `ef9bb09` consulta y edición. |
| Árbol antes de la auditoría | Sin cambios rastreados. Ya existían sin seguimiento los dos informes, `docs/informe-base-datos/`, `docs/taller-iii-entrega/` y `tmp/`. Los dos informes se tomaron como insumos aportados, sin atribuirles fecha de introducción en Git. |
| Última migración en código | [V66, simplificación de tripulación y personal sanitario](../backend-java/src/main/resources/db/migration/V66__simplificacion_tripulacion_y_personal_sanitario.sql). |
| Flyway aplicado | Base habitual `vuelos_sanitarios` y base aislada `vuelos_sanitarios_e2e`: 66 entradas exitosas y versión máxima 66 en cada una. Los recuentos estructurales de esta auditoría corresponden a la habitual. |
| Backend habitual en ejecución | Contenedor saludable, versión de aplicación `0.0.1-SNAPSHOT` según arranque, imagen `274cccd4fb91`. Los logs registran la aplicación de V66. El contenedor se creó el 2 de noviembre, antes de `ef9bb09`, que modifica el frontend. La imagen carece de etiqueta de revisión, así que no se atribuye el binario a un commit exacto. |
| Frontend habitual en ejecución | Contenedor saludable, imagen `02351a3093c8`, con contenedor creado el 3 de noviembre. La versión del manifiesto en el árbol es `0.1.0`. La imagen carece de etiqueta de revisión, por lo que la versión y el commit del bundle servido quedan pendientes. |

## 3. Método y cobertura

Se usaron el árbol actual y el historial local como referencia del código. Para los flujos críticos se siguieron ruta y componente React, controlador y autorización, servicio, repositorio y restricciones aplicables. Para el esquema se hicieron consultas SELECT a `sys.tables`, `sys.columns`, `sys.types`, `sys.default_constraints`, `sys.key_constraints`, `sys.foreign_key_columns`, `sys.check_constraints`, `sys.indexes`, `sys.index_columns`, `sys.triggers` y `flyway_schema_history`. Se consultaron recuentos de historial sin recuperar datos personales. No se levantó una base nueva ni se repitieron suites.

| Unidad | Cobertura y límite |
|---|---|
| Funcionalidades | 40 fichas F01–F40, incluidas 39 vigentes y una retirada. La matriz siguiente distingue el alcance de la revisión estática. No acredita cada combinación de rol, entrada y transición. |
| Tablas y columnas | 50 fichas y 534 entradas C.1/C.2 conservadas. Comparación automatizada de nombre, tipo, nulabilidad y valor predeterminado de las 534 columnas, con equivalencia de mayúsculas y paréntesis exteriores de defaults. 217 columnas admiten NULL. |
| Restricciones | 50 PK contrastadas por tabla y columna. 126 FK contrastadas por origen, destino, nombre y regla de borrado. 75 CHECK contrastados por definición y 11 triggers por identidad, con lectura dirigida de sus reglas. 56 índices únicos no PK contrastados por nombre, tipo de unicidad, columnas y filtro. 63 grupos duplicados por firma y siete nombres de migraciones ausentes. Queda pendiente el contraste individual de los índices no únicos ajenos a los duplicados. |
| Trazabilidad funcional de BD | Contraste dirigido de actores, pantallas, escrituras y ciclo de vida en identidad/OTP, solicitud y horario, recursos, tripulación, preparación, inicio, cierre e historial. El contraste estructural de 534 columnas no certifica los textos funcionales de cada una. Las reglas secundarias de llenado, borrado y concurrencia de las 50 fichas quedan sujetas a revisión exhaustiva. |
| Enlaces | Verificación de rutas locales Markdown en ambos informes. Las anclas de línea no se certificaron una por una. |

### Cobertura de las 40 fichas

| Fichas | Ruta funcional y evidencia principal | Resultado |
|---|---|---|
| F01–F05 | `AuthController` → `AuthService` y filtro JWT; activación por DNI y OTP, regeneración, cambio de contraseña, administración y contactos mediante `PersonContactService` y `EmailVerificationService`. | El OTP de activación se genera con seis dígitos, se guarda con BCrypt y vence a los diez minutos con un máximo de cinco intentos. La activación y la verificación de correo son flujos distintos. Administración gestiona cuentas, roles y reactivación con clave temporal; `UserResponsibilityService` protege asignaciones vigentes. |
| F06–F10 | `CommanderLocationController`, `CatalogController`, `AircraftAdminService`, `GeographicCatalogAdminController`, `PatientController` y sus servicios. | Licencia y ubicación de comandante separadas del catálogo sanitario. Se contrastaron las entradas de aeronaves, geografía, catálogos y pacientes. El alta heredada de aeropuertos y su efecto sobre la provincia se mantiene consignado como deuda de integración. |
| F11–F14 | `SanitaryRequestRegistrationService` → `FlightService.create`, `TransferContactService`, aceptación/contrapropuesta/respuesta/rechazo y cancelación en `FlightService`. | La solicitud y el vuelo tienen estados separados. Contactos se validan en la operación de alta. Operaciones evalúa, el DTS responde a contrapropuesta y sólo cancela su solicitud antes del inicio. |
| F15–F16 | `DocumentScheduleGate`, `PreparationStageGate`, `AirportPlanningController`, `setAirports`, `configureOperationalPlanning`. | Antes del acuerdo se bloquean documentos y preparación en servidor, además de su visibilidad por etapa. CO propone y el comandante principal confirma o ajusta según estado. |
| F17–F21 | `FlightService` asigna/reserva recursos; `CrewManagementService` y `CrewItineraryService` validan personal con cuenta. `HealthStaffController` → `HealthStaffService` gestiona el catálogo y la participación del DTS. | Corregidas las reglas de capacidad, ámbito geográfico, datos visibles, edición del tipo y elegibilidad del copiloto. |
| F22–F26 | `FlightService.createOperational` y sus respuestas/replanificación; `registerWeather`, `FlightRouteService`, `HangarInfoService`, `Aa2000CoordinationService`. | Vuelo operativo separado de solicitud sanitaria. En planificación, comandante registra clima y prepara/presenta ruta; CO revisa ruta y mantiene hangar y coordinaciones. El comandante aporta observaciones de hangar conforme a la etapa. |
| F27–F31 | `FlightLogService`, `DocumentService`, `FlightService.start/finish`, `FinalReportWorkflowService`. | Bitácora y auditoría separadas; versiones documentales y compuerta de horario; inicio con ruta y aeropuertos confirmados en sanitarios, con la brecha de capacidad C01; fin actualiza ubicaciones y abre la obligación de informe. |
| F32–F36 | `NotificationService`, `AuditQueryService`, `CrewContactService`, barridos de informes e itinerario, `ReadinessService` y `E2eControlController`. | Avisos y auditoría tienen propósitos distintos. Los contactos laborales y readiness se rigen por sus guardas propias. La notificación del copiloto tiene la inconsistencia C02. |
| F37–F40 | Rutas y navegación en `App.jsx` y `navigation.js`, `FlightDetailPage`, `PlanningTab`, `PlanningPanel`, `useFlightDraftGuard`; retiro en V66. | Lectura compartida de recursos, aeropuertos y preparación para CO y comandante principal autorizado. Los resúmenes muestran datos registrados; los formularios son explícitos, la carga es por módulo y los catálogos de edición se difieren. Los permisos de escritura dependen de área, estado y capacidades del servidor. F40 es historial. |

Fuentes para los flujos modificados: [servicio de vuelos](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java), [servicio de personal sanitario](../backend-java/src/main/java/com/vuelossanitarios/backend/service/HealthStaffService.java), [detalle React](../frontend-react/src/features/flights/detail/FlightDetailPage.jsx), [planificación React](../frontend-react/src/features/flights/tabs/PlanningTab.jsx), [auditoría UX de origen](AUDITORIA_UX_DETALLE_VUELOS.md).

## 4. Hallazgos y matriz de cambios

Las categorías son **A** error documental, **B** desactualización posterior, **C** inconsistencia funcional, **D** simplificación intencional, **E** estructura histórica, **F** posible mejora y **G** pendiente.

| Documento | Sección | Afirmación anterior | Evidencia | Corrección | Clasificación |
|---|---|---|---|---|---|
| Implementaciones | Arquitectura §3.2 | Entrada con `BrowserRouter`. | `App.jsx:16–17`. | Se documentan `createBrowserRouter(routes)` y `RouterProvider`. | A01 · A · baja · D3 |
| Implementaciones y BD | F19, BD §8.20 | La frase «no se cambia el tipo ni se desactiva con vuelos abiertos» permitía entender una prohibición general. La ficha de BD ya enumeraba el tipo entre los campos editables. | `HealthStaffService.update/setActive/committed`, selector de tipo en `healthStaff.jsx`. | Se explicita cambio MEDICO ↔ ENFERMERO, salvo participación vigente en vuelo abierto, y control de versión. | A02 · A · media · D1 |
| BD | Fichas §6.H y catálogo §13 | CHECK copiados con corchetes eliminados y algunas expresiones cortadas. El DNI figuraba como `N'%^0-9%'`. | `sys.check_constraints.definition`, V13 para la regla de DNI. | Se restauraron 75 definiciones en catálogo y fichas, 150 referencias. El patrón correcto es `N'%[^0-9]%'`. Se normalizó el espacio de presentación. | A03 · A · media · D2 |
| Implementaciones y BD | F20, BD §8.20 | En el listado del vuelo el DTS veía el DNI. | `HealthStaffService.flightView`, `HealthStaffDtos.FlightStaffView` y `StaffView`. | La respuesta de participación omite DNI para todos. El catálogo del DTS propietario sí lo incluye. | A04 · A · media |
| Implementaciones y BD | F17, BD §8.7 | Aeropuerto exacto en un informe y aeropuerto o jurisdicción indistintamente en el otro. | `FlightService.departure/requireAircraftInDeparture`. | Provincia de la localidad de origen solicitada como referencia preliminar cuando falta aeropuerto. Si existe aeropuerto de salida, se exige coincidencia exacta. | A05 · A · media |
| Implementaciones y BD | F18, BD §8.7 | Mismas reglas de elegibilidad para comandante y copiloto. | `CrewManagementService.evaluate`, rutas de `assignCopilot/replaceCopilot`. | Se separa la regla de informes vencidos, que bloquea al principal; se conserva la regla geográfica común. | A06 · A · media |
| Implementaciones y BD | P9, fichas 43–48 y BD §8.18 | Descripciones en presente podían leerse como escrituras vigentes y la referencia general a triggers no distinguía qué tablas los tienen. | V66, `sys.triggers` y búsqueda de referencias en Java/React. | Se encuadra el ciclo funcional completo de las seis fichas como histórico y se identifican las cuatro tablas con triggers. | A07 · A · media |
| Implementaciones y BD | F29/P3, BD §8.10/B6 y conclusiones | Se detectaba la falta de control en el alta del DTS, con alcance incompleto en el inicio. | `HealthStaffService.add`, `FlightService.start/assertCurrentCrew/assertAircraftCapacity`. | Se documentan ambos puntos de omisión. | C01 · C · alta · D5 |
| Implementaciones | §7/P4 | Se dejaba pendiente comprobar la falta de lectura. | `FlightService.list/get`, `FlightAuthorizationService.mayRead`, aviso en `CrewManagementService` y enlace en `NotificationsPage`. | Se distingue el rechazo demostrable por código de su reproducción HTTP pendiente. | C02 · C · media · D6 |
| Implementaciones y BD | F19, BD §8.20 | Matrícula descrita sin aclarar si había otra credencial. | DTO, formulario, V66 y nota de alcance §E.5. | Se explicita que hay un solo dato de credencial sanitaria, matrícula declarada. | D01 · D · informativa · D4 |
| BD | A2, B12 y §13 | Efecto de rendimiento atribuido directamente a los nombres ausentes; roles operativos descritos como equivalentes en general. | Catálogo de índices y validación de `decideGeography`. | Se acota el impacto a hipótesis que requiere planes y la equivalencia a los permisos examinados. | F01 · F · baja · D7/D8 |
| Implementaciones y BD | Encabezado y pruebas | Las corridas pertenecían a los informes de origen. | Informe UX, nota V66 y metadatos de Git. | Se añade la referencia a esta revalidación y se distingue la evidencia previa de la ejecución de esta revisión. | G01 · G · media |

## 5. Desactualización y evidencia de pruebas

No se identificaron hallazgos **B** en los dos informes por commits posteriores a su referencia. HEAD sigue en `ef9bb09`. Las fichas previas de V62 y los documentos que describen habilitaciones son antecedentes. El informe auditado de BD contiene las fichas V66 consolidadas y la carpeta preexistente `docs/informe-base-datos/` queda fuera de los dos entregables solicitados.

La nota de UX de origen registra 646 pruebas de backend, 357 de frontend y un pase de Chrome con API simulada. Los XML de Surefire con fecha 3 de noviembre corroboran 646 pruebas, sin fallos, errores ni omisiones. Otros XML del 2 de noviembre corresponden a 78 pruebas y se excluyeron del total. Los XML corroboran los recuentos, pero no identifican el commit. La nota V66 identifica `e2e-simplificacion-tripulacion.cjs` y `e2e-personal-sanitario-ui.cjs`. Las cifras de una corrida completa anterior, incluida la de 58 scripts, corresponden a su propio commit y stack. Las suites no se volvieron a ejecutar ni se usaron esos resultados para acreditar el binario desplegado.

## 6. Simplificaciones intencionales y estructuras históricas

- **D01, personal sanitario.** Nombre, apellido, DNI, tipo y matrícula declarada. El DTS propietario administra el catálogo, selecciona participantes y conserva las bajas lógicas. V66 reutiliza `personas` y evita una cuenta propia para participar. El requisito acordado trata licencia sanitaria y matrícula como un único dato. [Decisión V66](SIMPLIFICACION_TRIPULACION_Y_PERSONAL_SANITARIO_V66_2026-11-02.md)
- **D02, elegibilidad con cuenta.** Un comandante activo con perfil y licencia registrada puede evaluarse sin clasificación ni habilitación. Mantiene controles de disponibilidad, jurisdicción, restricciones de operación y, para el principal, informes vencidos. El copiloto es otro usuario COMANDANTE con función COPILOTO, no un rol de acceso nuevo. [Servicio de tripulación](../backend-java/src/main/java/com/vuelossanitarios/backend/service/CrewManagementService.java)
- **D03, retiro del circuito profesional anterior.** Se retiraron clasificación, políticas de suficiencia, verificación externa, aprobaciones, PDF de respaldo de habilitación y su antivirus. Continúa el flujo distinto de documentos operativos del vuelo. [Migración V66](../backend-java/src/main/resources/db/migration/V66__simplificacion_tripulacion_y_personal_sanitario.sql)
- **E01, historial de habilitaciones, gravedad informativa.** V66 preserva seis tablas y las rotula con `MS_Description`. Base habitual: dos clasificaciones, una habilitación, cero documentos, una decisión, cero consultas externas y cero políticas. Cuatro triggers activos protegen decisiones, consultas, documentos y políticas. Clasificaciones y habilitaciones tienen FK y CHECK sin trigger propio. Las FK hacia usuarios, funciones y otros catálogos, y las referencias de decisiones, consultas y documentos a la habilitación preservan el contexto. El catálogo de funciones conserva MEDICO y ENFERMERO; en la habitual sólo se observó una fila de tripulación con cuenta y su función era COMANDANTE. Conservar estas estructuras mantiene los registros existentes y su integridad referencial.
- **E02, campos heredados, gravedad baja.** V64 desplazó la geografía de localidad a provincia/CABA. Se conservan las dos FK de localidad de excepciones para contexto histórico y el servicio actual rellena provincia y función. Los campos de origen/destino de texto y los valores anterior/nuevo de bitácora se deben interpretar en el contexto de su flujo anterior. La revisión dirigida confirma esos ejemplos. La ausencia de cada escritor de los demás campos de la lista A4 de BD requiere un barrido independiente.

## 7. Problemas funcionales y decisiones de alcance

### C01 · Capacidad de tripulación, alta

`HealthStaffService.assign` toma el bloqueo del vuelo y `add` valida pertenencia, actividad, duplicado y solapamiento. Permite agregar después de seleccionar la aeronave sin comparar el total con `capacidad_tripulacion`. `replace` comparte `add`, pero sustituir una participación por otra conserva el total. Las asignaciones de aeronave y comandante en el flujo sanitario y el alta de copiloto tienen controles de capacidad. `start` verifica el estado, los datos operativos, los aeropuertos confirmados, el acceso del principal, la elegibilidad de tripulantes con cuenta, ubicación de la aeronave y aprobación de ruta. Esa secuencia carece de un recuento final y el esquema no impone esa comparación entre tablas. Un sanitario planificado con todos los demás controles satisfechos puede superar el cupo y pasar a EN_CURSO.

Prioridad alta. Centralizar el recuento de plazas en los caminos que alteran la ocupación y aplicar un control de salida dentro de la transacción de inicio. La regresión aislada debe cubrir una aeronave llena seguida de un alta del DTS, un reemplazo con ocupación estable y un vuelo previamente sobredimensionado. [Servicio sanitario](../backend-java/src/main/java/com/vuelossanitarios/backend/service/HealthStaffService.java) · [Inicio y asignaciones](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java)

### C02 · Enlace de notificación del copiloto, media

Para un usuario cuyo único fundamento de acceso sería la participación como copiloto, el listado de comandante filtra por `vuelos.id_usuario_comandante` y el detalle falla en `mayRead` con 403. Una autorización independiente, como un rol operativo, puede habilitar la lectura. `CREW_ASSIGNED` incluye código y hora de salida, pero el enlace general de notificaciones en el área Comandante apunta a `/app/vuelos/{id}`. La inconsistencia es ofrecer ese enlace a quien no tiene autorización de detalle. La necesidad de dar acceso operativo adicional queda para decisión del responsable.

Definir si alcanza un aviso sin enlace o si se requiere una ficha de lectura acotada al copiloto vigente. En este último caso, definir como mínimo código, horario, aeropuertos y estado, y decidir qué otros datos puede ver antes de ampliar el contrato. Mantener las escrituras del comandante principal bajo sus guardas actuales. [Autorización del vuelo](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightAuthorizationService.java) · [Enlace del aviso](../frontend-react/src/features/notifications/NotificationsPage.jsx)

### F02/G02 · Roles operativos, media

V1 sembró `OPERACIONES`. V12 incorporó `CENTRO_OPERACIONES` cuando amplió el modelo de roles, y V25 resembró ambos con el mismo rótulo. Ese historial explica la coexistencia técnica. El motivo de negocio original de mantener ambos códigos no queda establecido. Comparten área React y los controles operativos examinados, incluidos consulta, planificación y asignaciones ordinarias. `decideGeography` exige específicamente `CENTRO_OPERACIONES` al autorizar una excepción nueva y devuelve 403 para `OPERACIONES` solo. Una excepción vigente para la misma persona, función y jurisdicción puede cubrir la asignación sin emitir otra. Conservar la separación documentada y confirmar qué usuarios deben cubrir la autorización excepcional. No hay evidencia de que esta regla contradiga el alcance V66.

### F03 · Índices y deuda de integración, baja

Se reprodujeron los 63 grupos equivalentes por tabla, tipo, columnas de clave ordenadas y dirección, INCLUDE y filtro. El patrón de nombres concuerda con el índice anterior al renombre y su equivalente con la FK renombrada. Los siete nombres de índices identificados en el informe provienen de V18–V23 y faltan en la base habitual; la reconstrucción de V24 explica la pérdida de los originales, que no prueba la falta de cobertura equivalente. Hay costo potencial de mantenimiento para los duplicados y efecto de rendimiento indeterminado para los ausentes. Medir uso y planes antes de consolidar o reponer índices. El endpoint operativo disponible a Administración y sin opción de menú se conserva como diferencia de alcance UI/API; falta confirmar si esa operación debería estar expuesta en su área.

## 8. Matriz de contradicciones cruzadas

Se cuentan tres diferencias directas de alcance o interpretación. Las omisiones compartidas y los errores exclusivos de un informe se registran en la matriz de cambios.

| ID | Implementaciones | Base de datos | Resolución |
|---|---|---|---|
| X01 | F19, la redacción podía leerse como prohibición de cambio de tipo. | Ficha de `personal_sanitario`, el tipo se incluye en la edición. | El cambio existe y se rechaza al haber participación vigente en un vuelo abierto. A02. |
| X02 | F17, aeronave en el aeropuerto de salida. | §8.7, aeropuerto «o» jurisdicción. | Antes de fijar aeropuerto se aplica jurisdicción; con aeropuerto, coincidencia exacta. A05. |
| X03 | F40, circuito retirado. | Fichas 43–48 rotuladas históricas, pero conservaban frases de dependencia y acciones en presente. | Se explicita que actores, endpoints y dependencias eran de V65 o anterior; el esquema sigue presente en V66. A07. |

## 9. Pendientes, prioridad y confiabilidad

1. **Alta:** resolver C01 y verificarlo con SQL Server aislado. La validación estática demuestra el camino y la prueba debe reproducirlo con las demás condiciones de inicio satisfechas.
2. **Media:** decidir la información operativa del copiloto y resolver C02. Confirmar la cobertura del rol `CENTRO_OPERACIONES` para excepciones geográficas.
3. **Media:** verificar revisión de las imágenes activas y ejecutar los recorridos reales CO/comandante/DTS con SQL Server aislado. Verificar la suite completa en el detalle por rutas y los casos de carga previa al acuerdo. El estado saludable de Docker sólo acredita su control de salud.
4. **Baja:** completar el contraste individual de índices no únicos fuera del conjunto duplicado, el análisis de planes para D8 y la revisión funcional campo por campo de las operaciones secundarias. Decidir si la creación operativa por API de Administración debe aparecer en su interfaz.

**Evaluación:** Coinciden parcialmente; se corrigieron las diferencias documentales. El informe de implementaciones es confiable para los flujos principales contrastados y explicita las brechas de capacidad y del aviso al copiloto. El de BD es confiable para el inventario y las restricciones cotejadas en la base habitual V66, con las reservas de cobertura funcional y de rendimiento indicadas. Los tres archivos trabajados son documentación.
