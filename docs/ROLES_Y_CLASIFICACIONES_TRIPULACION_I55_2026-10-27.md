# I-5.5 — Roles de tripulación y clasificaciones (2026-10-27)

## 1. Qué es cada concepto

| Concepto | Dónde vive | Qué responde | Qué **no** hace |
|---|---|---|---|
| **Rol de acceso** | `roles` / `usuarios_roles` | Qué puede hacer la persona en la aplicación (endpoints y pantallas). | No la vuelve apta para integrar una tripulación. |
| **Función (rol) de tripulación** | `roles_tripulacion` — catálogo cerrado de 4 valores: `COMANDANTE`, `COPILOTO`, `MEDICO`, `ENFERMERO` | Qué lugar ocupa una persona en un vuelo (`vuelos_tripulantes.id_roles_tripulacion`) y qué requisitos exige ese lugar. | No es un permiso de seguridad. El código de cada función lo interpreta el servicio: por eso el catálogo es controlado y no tiene alta libre. |
| **Clasificación de tripulación** | `clasificaciones_tripulacion` — asociación persona ↔ función con quién, cuándo y (V58) la baja con actor y motivo | «El Centro autoriza administrativamente a esta persona para esa función.» Es la primera condición de la elegibilidad. | No acredita competencia (eso es la habilitación) ni concede permisos. |
| **Habilitación profesional** | `habilitaciones_profesionales` + `documentos_habilitacion` | Evidencia de competencia por función, revisada **manualmente** por un administrador distinto del titular. | No es una verificación oficial: no se consulta ANAC ni REFEPS/SISA (sin API demostrada). |

La elegibilidad (`CrewManagementService.evaluateOn`) combina, **siempre en este orden**: cuenta activa → clasificación vigente → (sólo comandante) licencia registrada, rol de acceso `COMANDANTE` y sin informes finales vencidos → habilitación verificada y vigente a la fecha de salida → (al asignar) ausencia de otro compromiso solapado. Las funciones y sus requisitos están declarados una sola vez (`CrewManagementService.RULES`) y la interfaz los lee de `GET /api/catalogs/crew-roles`.

Decisión sobre `roles_tripulacion`: es un catálogo **controlado y funcional sin CRUD**, igual que `prioridades_vuelo` o `estados_vuelo`. Agregar un valor por la API crearía una función que ninguna regla sabe evaluar. Su función operativa real es: catálogo de la clasificación, de la habilitación (`habilitaciones_profesionales.id_roles_tripulacion`) y de cada asignación, con historial interpretable porque los códigos son inmutables.

## 2. Qué se cambió

* **Brecha de seguridad cerrada.** Sólo el panel de disponibilidad evaluaba al comandante con la elegibilidad completa; `POST /flights/{id}/resources`, la creación y la replanificación operativas validaban cuenta, rol de acceso, licencia e informes, pero **no** la clasificación ni la habilitación (se detectaba recién al iniciar). Ahora `assign`, `createOperational`, `replanOperational` y la **aceptación** del comandante usan la misma evaluación (`assertCommanderEligible`) y responden `409` con el código real (`CLASIFICACION_INCOMPATIBLE`, `HABILITACION_*`). No se creó una segunda regla.
* **Clasificación con historial (V58).** Retirar ya no borra la fila: registra `fecha_baja`, `id_usuario_baja` y `motivo_baja` (restricción: los tres o ninguno); reclasificar crea una fila nueva; la unicidad pasa a un índice filtrado sobre las vigentes. No se tocó ninguna fila existente: todas quedan vigentes. El retiro se rechaza con `409 CLASIFICACION_EN_USO` (con los códigos de vuelo) mientras exista una asignación vigente en esa función en un vuelo **no terminal** — planificado o en curso —, incluido el comandante que sólo figura en el campo del vuelo.
* **Consulta.** `GET /api/crew-qualifications/{userId}[?history=true]` devuelve, por función, quién clasificó y cuándo, la elegibilidad de hoy con su motivo y el vencimiento de la habilitación, y (con `history`) las retiradas con su motivo. `DELETE …?motivo=` registra el motivo (por defecto `RETIRO_ADMINISTRATIVO`). Auditoría: `CREATE` y `RETIRE`.
* **Interfaz.** La sección de clasificación (Usuarios) toma las funciones del servidor, muestra requisitos, elegibilidad y historial, deshabilita mientras opera y recarga lo confirmado; un retiro rechazado muestra el motivo y no informa éxito. La tripulación del vuelo (ya existente) sigue mostrando candidatos disponibles y no disponibles con su motivo.

## 3. Concurrencia

* Orden de bloqueos sin cambios: **vuelo → persona**. Retirar y clasificar bloquean sólo a la persona; asignar (vuelo → persona) relee la clasificación **después** de bloquearla, y el retiro cuenta las asignaciones **después** de bloquearla. De dos operaciones incompatibles, la segunda observa lo confirmado por la primera.
* `ux_clasificacion_tripulacion_vigente` (filtrado) evita dos clasificaciones vigentes aunque se salte la API; `ck_clasificacion_baja` evita bajas incompletas. Los fallos residuales de concurrencia siguen traduciéndose a `409 CONCURRENT_MODIFICATION`.
* El comandante asignado ya no depende de una clasificación que pueda retirarse por debajo: el retiro lo ve (campo `comandante` del vuelo y fila de tripulación) y se rechaza.

## 4. Casos concurrentes y negativos verificados

Ver el informe de cierre y `scripts/e2e-roles-clasificaciones.cjs`: retiro contra asignación, retiro de la clasificación de comandante contra su asignación, dos retiros, dos usuarios reemplazando la misma asignación, revocación de la habilitación contra la asignación, y los negativos (función inválida, sin clasificación, habilitación ausente/no verificada/revocada/vencida, rol de acceso sin función, duplicado, solape, permisos).

## 5. Habilitaciones profesionales y documentos (evaluación posterior)

**Resuelto internamente (existente, reutilizado):** alta, adjunto PDF, edición que reinicia la revisión, decisión (`VERIFICADA`/`RECHAZADA`/`REVOCADA`) con prohibición de autoverificación aun para administradores, vencimiento, historial, reevaluación de vuelos al revocar/vencer, bloqueo del inicio y auditoría. La clasificación **no** la reemplaza ni la habilitación reemplaza a la clasificación (probado).

**Brechas que se resuelven internamente pero requieren una decisión de negocio** (no se inventaron): (a) suficiencia de una habilitación por tipo de operación/aeronave/equivalencias; (b) política de validación documental (formatos, antimalware, retención) más allá de PDF estructural; (c) renovación con anticipación y avisos (hoy hay aviso a 30 días).

**Dependen de organismos externos:** verificación de autenticidad/vigencia frente a ANAC o REFEPS/SISA. No hay API acreditada para esta instalación; la «verificación» del sistema es **revisión interna manual con evidencia** y así debe seguir presentándose. No se simuló ninguna consulta ni se hizo scraping.

Por lo anterior `habilitaciones_profesionales` y `documentos_habilitacion` permanecen **parciales**.

## 6. Evidencia (2026-10-27, base aislada en Flyway V58; la habitual sigue en V47)

* **Backend:** `mvn test` 519 pruebas, 0 fallos (antes 506): ciclo de la clasificación y comandante inelegible (unitarias), `CrewClassificationConcurrencyIntegrationTest` (5, con hilos reales en H2) y aceptación del comandante.
* **Frontend:** 227 pruebas, 0 fallos (antes 226); `npm run build` correcto.
* **E2E reales:** `e2e-roles-clasificaciones` (8 bloques en SQL Server: catálogo y permisos, ciclo con historial, restricciones SQL, comandante por todas las vías, negativos, uso protegido, 5 familias de carreras con ambos órdenes y vuelo sanitario) y `e2e-roles-clasificaciones-ui` (5 bloques en Chrome). Carreras: retiro/asignación, retiro/comandante, dos retiros, reemplazo simultáneo y revocación/asignación; en todas una sola operación incompatible confirma.
* **Suite completa:** el primer intento (44 scripts) quedó cortado a mitad de camino —se interrumpió el proceso en segundo plano al cancelarse una espera— tras 38 scripts aprobados y 1 fallo (`e2e-contactos-tripulacion`: una aserción obsoleta que fijaba «ninguna migración posterior a V57»; corregida y repetida: 8 bloques aprobados). Los 6 scripts siguientes se ejecutaron después en dos tandas (el segundo corte fue de nuevo del proceso en segundo plano, no del sistema) y los 8 restantes pasaron. Por lo tanto **no hubo una única ejecución continua y limpia de los 44 scripts**: cada uno terminó aprobado en una ejecución completa propia.
* **Defecto real corregido:** el comandante no se evaluaba con clasificación y habilitación al asignarlo directamente, al crear/replanificar un vuelo operativo ni al aceptar.
