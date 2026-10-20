# Plan de cierre funcional — auditoría V41

Fecha: 2026-10-20. Alcance auditado: esquema `dbo` E2E en Flyway V41, 40 tablas de aplicación. La base habitual permanece en V32 y no fue modificada.

## Prioridad crítica

| Funcionalidad | Tablas | Problema concreto | Solución requerida | Dependencias | Prueba y aceptación |
|---|---|---|---|---|---|
| Cierre de ejecución de vuelos | `vuelos`, `vuelos_sanitarios`, `estados_vuelo`, `informes_finales_vuelo`, `obligaciones_informe_final`, `notificaciones`, `eventos_auditoria` | La evidencia está fragmentada: creación, planificación e informe existen, pero no hay E2E único que recorra inicio, finalización, presentación, devolución y cierre para vuelo sanitario y operativo. | Definir y hacer cumplir las transiciones terminales y la obligación de informe; exponerlas en cada pantalla responsable. | Reglas de `FlightService` y `FinalReportWorkflowService`. | Dos vuelos E2E completos; SQL verifica estado, informe, obligación, notificación y auditoría tras reinicio. Ninguna transición fuera de orden debe persistir. |
| Autorización documental contextual | `documentos_vuelo`, `versiones_documento_vuelo`, `bloqueos_documento_vuelo`, `tipos_documento` | Cerrado en esta ejecución: faltaba lista, alta e historial desde el vuelo. | Mantener E2E de regresión y no reintroducir controles por ID manual. | Flujo del vuelo y almacenamiento de PDF. | `e2e_documentos.py` y navegador; alta, versión, bloqueo, 403 ajeno, auditoría y reinicio. |

## Prioridad alta

| Funcionalidad | Tablas | Problema concreto | Solución requerida | Dependencias | Prueba y aceptación |
|---|---|---|---|---|---|
| Solicitud sanitaria completa | `pacientes`, `personas`, `informacion_medica_vuelo`, `vuelos_sanitarios`, `negociaciones_horario_vuelo`, `motivos_cancelacion` | No hay evidencia E2E de selección/alta de paciente, evaluación, negociación, cancelación y extremo urgente en una única trazabilidad. | Recorrer el flujo DTS→OPS→COM y mostrar errores de transición. | Catálogos geográficos, prioridades, autorizaciones. | E2E SQL/API/Chrome con trazabilidad por vuelo y denegación para solicitante ajeno. |
| Administración de seguridad | `usuarios`, `usuarios_roles`, `roles`, `activaciones_cuenta`, `personas`, `correos_electronicos`, `telefonos`, `perfiles_comandante` | Hay pruebas por servicio, pero no una evidencia persistida del ciclo alta→activación→cambio obligatorio→baja/reactivación y permisos efectivos. | Crear E2E de administración y revisar el estado de cambio obligatorio en todas las rutas. | JWT y `AuthService`. | API/Chrome/SQL: permisos de cada rol, baja sin perder datos y reactivación con contraseña temporal. |
| Informe final | `informes_finales_vuelo`, `obligaciones_informe_final`, `documentos_vuelo`, `notificaciones` | Carga, devolución, plazos y cierre no están corroborados conjuntamente en SQL Server. | Integrar el estado del informe en detalle de vuelo y cierre. | Proceso terminal del vuelo. | E2E con entrega, devolución, reentrega, plazo vencido y auditoría. |
| Catálogos operativos | `tipos_vuelo`, `estados_vuelo`, `estados_solicitud_sanitaria`, `prioridades_vuelo`, `motivos_cancelacion`, `roles_tripulacion` | Algunos selectores contienen valores fijos y no hay evidencia de administración o de que cada catálogo sea deliberadamente estático. | Sustituir valores fijos por consulta cuando corresponda, o documentar catálogo inmutable y validarlo en backend. | Formularios de vuelo y tripulación. | API y UI consumen el mismo catálogo; valores inactivos son rechazados. |

## Prioridad media

| Funcionalidad | Tablas | Problema concreto | Solución requerida | Dependencias | Prueba y aceptación |
|---|---|---|---|---|---|
| Contactos, pacientes y geografía | `provincias`, `localidades`, `aeropuertos`, `pacientes`, `personas`, `correos_electronicos`, `telefonos` | El alta está cubierta parcialmente; faltan cambios controlados y persistencia E2E de identidad. | Completar pantallas/endpoints que falten y validar unicidad/formato en servidor. | Administración y DTS. | E2E que actualiza y consulta sin duplicar identidades. |
| Notificaciones y auditoría | `notificaciones`, `eventos_auditoria` | Se generan en varios servicios, sin matriz de eventos obligatorios ni E2E transversal. | Enumerar eventos por transición y comprobar destinatario/lectura. | Todos los flujos críticos. | SQL y API muestran evento, actor, vuelo y destinatario correctos. |
| Compatibilidad V32→V41 | Migraciones V33–V41 | No se puede afirmar sobre datos históricos sin una copia restaurada de la base habitual. | Respaldar la base habitual, restaurar bajo otro nombre, ejecutar Flyway y preflight de duplicados. | Backup autorizado y espacio SQL Server. | Copia llega a V41 sin alterar original; informes de filas afectadas y conflictos resueltos explícitamente. |

## Prioridad baja

| Funcionalidad | Tablas | Problema concreto | Solución requerida | Dependencias | Prueba y aceptación |
|---|---|---|---|---|---|
| Presentación y observabilidad | todas las ya funcionales | Mensajes y cobertura visual no son uniformes. | Mejorar textos de error y refresco puntual sólo después de cerrar los flujos críticos. | Pruebas de interfaz existentes. | Navegador muestra error del servidor y datos persistidos sin recarga manual. |

## Procedimiento seguro V32→V41

1. Obtener un backup consistente de la base habitual con SQL Server, restaurarlo bajo un nombre aislado y con credenciales de prueba.
2. Ejecutar preflight sin escritura: contar duplicados de versión actual en `informacion_hangar`; revisar `coordinaciones_aa2000` por vuelo/versión, FKs nulas que V41 complete por grupo y tamaños de columnas V37–V41.
3. Ejecutar Flyway desde la aplicación contra la copia. V33 crea clasificación; V34 sólo inserta el estado ausente; V35/V36 agregan habilitaciones; V37 agrega columnas/ruta e índice filtrado; V38 agrega bitácora y trigger; V39 agrega contexto de hangar; V40 exige como máximo una versión vigente por vuelo; V41 agrupa coordinaciones existentes y reemplaza las restricciones por gestión.
4. Comparar conteos, FKs huérfanas, índices filtrados, vuelos y usuarios antes/después; ejecutar pruebas de lectura y de los flujos nuevos contra la copia.
5. Sólo con informe de la copia, ventana aprobada y backup verificado se podrá planificar la actualización habitual. No aplicar migraciones manualmente ni sobre la base original.

