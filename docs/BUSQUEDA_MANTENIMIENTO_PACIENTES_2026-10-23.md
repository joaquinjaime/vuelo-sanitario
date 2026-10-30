# Búsqueda y mantenimiento contextual de pacientes — 23 de octubre de 2026

## Diagnóstico y modelo

Antes del incremento, `GET /api/patients` devolvía todas las fichas y el área DTS las descargaba al abrir. `pacientes` sólo contiene la relación única con `personas`; no dispone de atributos editables propios. Nombre, apellido, DNI y fecha de nacimiento son datos de la identidad compartida en `personas`. Una misma persona puede tener cuenta en `usuarios` y ficha en `pacientes`. `vuelos_sanitarios` conserva la referencia a la ficha; la solicitud, prioridad y estado pertenecen al vuelo. `informacion_medica_vuelo` guarda el diagnóstico y condición de ese vuelo. `eventos_auditoria` es el historial técnico existente.

El detalle histórico de un vuelo resuelve el nombre actual desde `personas`. Por eso, una corrección de nombre cambia su presentación actual, pero no modifica los identificadores del vuelo ni crea una instantánea histórica de identidad. Diagnósticos, documentos e informes finales no se recalculan.

## Política y funcionalidad

- DTS y ADMINISTRADOR pueden buscar fichas con DNI completo exacto o con nombre y apellido simultáneos, ambos con al menos dos letras. No hay listado global, búsqueda por apellido solo ni consulta automática al abrir. OPERACIONES, CENTRO_OPERACIONES, COMANDANTE y usuarios anónimos carecen de acceso a la búsqueda.
- La búsqueda usa `Slice` de Spring Data con prefijos, orden por apellido, nombre e ID, hasta 20 registros por página y profundidad máxima de 1000 posiciones. La respuesta sólo contiene ID de ficha, nombre, apellido, terminación enmascarada del DNI y año de nacimiento. No contiene ID de persona, vínculos de cuenta, contactos ni datos médicos. No se afirma una mejora de rendimiento sin medición.
- DTS busca y selecciona expresamente una ficha dentro de la nueva solicitud. Al registrar usa el `patientId` existente; el flujo previo de alta/enlace seguro sigue disponible. Los cambios de criterio invalidan la selección y las respuestas tardías no reemplazan resultados recientes.
- Sólo ADMINISTRADOR puede consultar la identidad completa y corregir nombre, apellido y fecha de nacimiento, con motivo obligatorio y versión esperada. DTS no recibe autorización de corrección por su acceso de identificación. Un DNI suministrado en la solicitud de corrección se rechaza; su rectificación precisa una política propia de adjudicación de identidad y unicidad. No hay editor general de diagnóstico, estado o prioridad desde la ficha.
- La versión optimista reside en `personas`, de modo que una modificación concurrente hecha desde administración de usuarios también se detecta. V48 agrega `version_identidad` a esa tabla sin crear tablas nuevas. Un conflicto devuelve 409 y requiere recargar. La auditoría `PATIENT_IDENTITY/CORRECT` guarda actor, instante UTC, motivo y campos modificados con valores anteriores y nuevos; sólo ADMINISTRADOR consulta este historial. No se copian DNI, datos de cuenta ni información médica al evento.

## API e interfaz

| Método y ruta | Perfil | Uso |
|---|---|---|
| `GET /api/patients/search` | DTS, ADMINISTRADOR | Buscar con `dni` exacto o `nombre` y `apellido`; `page`, `size`. |
| `GET /api/patients/{id}` | ADMINISTRADOR | Identidad completa y versión para corrección. |
| `PUT /api/patients/{id}/identity` | ADMINISTRADOR | Corrección de nombre, apellido, fecha y motivo; DNI excluido. |
| `GET /api/patients/{id}/corrections` | ADMINISTRADOR | Historial paginado de correcciones. |
| `GET /api/patients` | Nadie | Retirado el listado sin filtro; `POST /api/patients` continúa disponible. |

La nueva sección “Pacientes” del panel ADMINISTRADOR se centra en revisar y corregir la identidad compartida. La búsqueda contextual es un componente reutilizable, con carga, error, sin resultados, paginación y selección explícita. La sección no muestra vuelos ni expedientes clínicos por el mero permiso de encontrar una ficha.

## Integridad y despliegue

V48 se aplica sólo en la base `vuelos_sanitarios_e2e` durante este incremento. El código que mapea `Person.version` requiere esa migración antes de desplegarse en otro entorno. La base habitual se preserva y no se migra. No se modifica ninguna migración existente, no se borran volúmenes y no se hace commit ni push.

La corrección ocurre en una transacción: se actualiza `personas` con control de versión y se inserta su auditoría obligatoria. No modifica `usuarios`, relaciones de roles, hashes, credenciales ni sesiones; tampoco cambia las referencias de `vuelos_sanitarios` o `informacion_medica_vuelo`.

## Verificación

`mvn test` pasó **311 pruebas**, sin fallas ni errores. H2 emitió avisos de DDL por tipos propios de SQL Server; la evidencia del esquema y de las transacciones proviene de SQL Server E2E. `npm test -- --run` pasó **112 pruebas**. Los builds de backend y frontend terminaron correctamente.

El escenario [API](../scripts/e2e-patient-directory.cjs) creó 23 fichas de una misma combinación de prefijos y recorrió tres páginas de 10, 10 y 3 registros en orden determinista, sin duplicados. Verificó DTO mínimo y DNI enmascarado, filtros y tamaños inválidos, página sin coincidencias, roles, búsqueda exacta, selección DTS y solicitud con la ficha existente. La corrección ADMIN rechazó un DNI enviado, una versión obsoleta con 409 y dos correcciones simultáneas de la misma versión: una se confirmó y la otra devolvió 409, con un solo evento adicional. El historial y la auditoría se verificaron en SQL; un trigger temporal hizo fallar la auditoría y confirmó el rollback de persona y evento, tras lo cual se retiró. SQL conservó el vínculo del vuelo y su diagnóstico. Otra corrección sobre una persona con cuenta mantuvo hash, estado, roles, versión de credenciales, sesión y unicidad de identidad.

El escenario [Chrome](../scripts/e2e-patient-directory-ui.cjs) recorrió búsqueda y selección DTS sin descarga inicial del padrón, creó un vuelo y realizó una corrección ADMIN desde el panel, comprobando el resultado en SQL. Las regresiones [alta atómica](../scripts/e2e-paciente-solicitud.cjs), [identidad compartida](../scripts/e2e-identidad-compartida.cjs) y sus recorridos [Chrome de alta](../scripts/e2e-paciente-solicitud-ui.cjs) y [Chrome de enlace](../scripts/e2e-identidad-compartida-ui.cjs) pasaron. Esto cubre los tres escenarios anteriores: persona nueva, paciente ya registrado y persona preexistente con cuenta.

La base `vuelos_sanitarios_e2e` llegó a V48. Una consulta SQL de sólo lectura confirmó que la base habitual permanece en **V47**. Las comprobaciones con escritura estuvieron dirigidas exclusivamente al contenedor y base E2E declarados por el soporte de pruebas.

## Cobertura restante y siguiente incremento

`personas` y `pacientes` siguen parcialmente funcionales. La corrección de DNI, los contactos de la identidad compartida y reglas de adjudicación ante datos contradictorios requieren un proceso de negocio separado. No hay instantánea histórica del nombre para vuelos anteriores. Tras cerrar la verificación de este incremento, la siguiente brecha vertical recomendada es la gestión contextual de contactos de personas, porque afecta la identidad compartida sin reabrir el ciclo documental ya funcional.

El historial de la ficha presenta las correcciones efectuadas por esta ruta administrativa. Si se cambia el nombre de una persona con cuenta desde la administración de usuarios, esa operación conserva su evento `USER` en la auditoría global, pero no aparece como corrección `PATIENT_IDENTITY` de esta ficha. Unificar ambas vistas requiere acordar una política de presentación de cambios compartidos.
