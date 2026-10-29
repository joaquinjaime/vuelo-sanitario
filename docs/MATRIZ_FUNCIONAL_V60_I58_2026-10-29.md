# Matriz funcional del esquema V60 (I-5.8)

Generada de `docs/evidencia-i58/auditoria-tablas.json` (`scripts/auditoria-funcional-tablas-i58.cjs`) sobre SQL Server V60, más las calificaciones honestas de §A del informe. **45 tablas de negocio, todas integradas por evidencia estática y ejercidas por la corrida continua E2E 54/54** (`INFORME_CERTIFICACION_FINAL_I58`). Las filas de prueba no cuentan como evidencia.

| Tabla | Escritores de producción | Lectores (muestra) | JUnit | E2E | FK sal/ent | CHECK | Triggers | Veredicto | Calificación |
|---|---|---|---:|---:|---|---:|---:|---|---|
| activaciones_cuenta | AuthService | AuthService | 4 | 5 | 2/0 | 1 | 0 | INTEGRADA | Funcional |
| aeronaves | AircraftAdminService, CredentialPolicyActivationService, FlightService | AircraftAdminService, CredentialPolicyActivationService, CrewManagementService | 15 | 8 | 1/2 | 1 | 0 | INTEGRADA | Funcional |
| aeropuertos | CatalogController, Aa2000CoordinationService, AircraftAdminService | CatalogController, Aa2000CoordinationService, AircraftAdminService | 15 | 11 | 2/6 | 0 | 0 | INTEGRADA | Funcional |
| bitacora_vuelos | FlightLogService | FlightLogService | 1 | 2 | 3/1 | 1 | 1 | INTEGRADA | Funcional |
| bloqueos_documento_vuelo | DocumentService | DocumentService, UserResponsibilityService | 1 | 3 | 2/0 | 1 | 0 | INTEGRADA | Funcional |
| clasificaciones_tripulacion | CredentialPolicyActivationService, CrewManagementService | CredentialPolicyActivationService, CrewManagementService | 8 | 2 | 4/0 | 1 | 0 | INTEGRADA | Funcional |
| consultas_externas_habilitacion | ProfessionalCredentialService | ProfessionalCredentialService | 1 | 3 | 3/0 | 2 | 1 | INTEGRADA | Funcional; constancia MANUAL, no validación oficial. |
| contactos_coordinacion_traslado | TransferContactService | TransferContactService | 1 | 6 | 3/0 | 5 | 0 | INTEGRADA | Funcional |
| coordinaciones_aa2000 | Aa2000CoordinationService | Aa2000CoordinationService, GeographicDependencyService | 1 | 1 | 3/0 | 2 | 0 | INTEGRADA | Funcional |
| correos_electronicos | AuthService, EmailVerificationService, PersonContactService | AuthService, CrewContactService, EmailVerificationService | 5 | 9 | 2/1 | 2 | 0 | INTEGRADA | Funcional |
| decisiones_habilitacion | ProfessionalCredentialService | ProfessionalCredentialService | 2 | 4 | 3/0 | 1 | 1 | INTEGRADA | Funcional; insert-only (trigger V60). |
| documentos_habilitacion | CredentialDocumentService, LegacyDocumentService, ProfessionalCredentialService | CredentialDocumentService, LegacyDocumentService, ProfessionalCredentialService | 3 | 4 | 5/3 | 8 | 1 | INTEGRADA | Funcional; probada con ClamAV real y base mínima; análisis completo pendiente de recursos. |
| documentos_vuelo | DocumentService | DocumentService | 1 | 2 | 3/2 | 1 | 0 | INTEGRADA | Funcional |
| estados_solicitud_sanitaria | FlightService | FlightService | 10 | 4 | 0/1 | 0 | 0 | INTEGRADA | Funcional |
| estados_vuelo | FinalReportWorkflowService, FlightService | FinalReportWorkflowService, FlightService | 23 | 23 | 0/1 | 0 | 0 | INTEGRADA | Funcional |
| eventos_auditoria | AircraftAdminService, AuditService, ProfessionalCredentialService | AircraftAdminService, AuditService, FlightService | 15 | 38 | 2/0 | 1 | 1 | INTEGRADA | Funcional; inmutable (trigger V46). |
| habilitaciones_profesionales | CredentialDocumentService, CredentialPolicyActivationService, LegacyDocumentService | CredentialDocumentService, CredentialExpiryNoticeService, CredentialPolicyActivationService | 4 | 3 | 5/4 | 2 | 0 | INTEGRADA | Funcional |
| informacion_hangar | HangarInfoService | GeographicDependencyService, HangarInfoService | 1 | 1 | 5/0 | 0 | 0 | INTEGRADA | Funcional |
| informacion_medica_vuelo | AircraftAdminService, FlightService | AircraftAdminService, FlightService | 5 | 3 | 1/0 | 0 | 0 | INTEGRADA | Funcional |
| informes_finales_vuelo | FinalReportWorkflowService, FlightService | FinalReportWorkflowService, FlightService | 6 | 3 | 3/1 | 4 | 0 | INTEGRADA | Funcional |
| instantaneas_clima | FlightService | FlightService | 4 | 1 | 2/0 | 0 | 0 | INTEGRADA | Funcional |
| localidades | CatalogController, FlightService, GeographicCatalogService | CatalogController, FlightService, GeographicCatalogService | 9 | 7 | 1/3 | 0 | 0 | INTEGRADA | Funcional |
| motivos_cancelacion | CatalogController, FlightService | CatalogController, FlightService | 7 | 1 | 0/1 | 0 | 0 | INTEGRADA | Funcional |
| negociaciones_horario_vuelo | FlightService | FlightService | 4 | 3 | 3/1 | 1 | 0 | INTEGRADA | Funcional |
| notificaciones | NotificationService | NotificationService | 4 | 13 | 2/0 | 0 | 0 | INTEGRADA | Funcional |
| obligaciones_informe_final | FinalReportWorkflowService | CommanderReportAccessService, FinalReportDeadlineService, FinalReportWorkflowService | 4 | 5 | 6/0 | 3 | 1 | INTEGRADA | Funcional |
| pacientes | AuthService, FlightService, PatientService | AuthService, FlightService, PatientDirectoryService | 16 | 20 | 1/1 | 0 | 0 | INTEGRADA | Funcional |
| perfiles_comandante | CatalogController, AuthService | CatalogController, AuthService, FlightService | 11 | 1 | 2/0 | 1 | 0 | INTEGRADA | Funcional |
| personas | AuthService, EmailVerificationService, PatientService | AuthService, EmailVerificationService, PatientDirectoryService | 33 | 27 | 0/6 | 1 | 0 | INTEGRADA | Funcional |
| politicas_habilitacion | CredentialPolicyActivationService, CredentialPolicyService, ProfessionalCredentialService | CredentialPolicyActivationService, CredentialPolicyService, CredentialSufficiency | 4 | 4 | 4/0 | 3 | 1 | INTEGRADA | Funcional; contenido VACÍO por diseño hasta aprobar D1–D8 (decisión de negocio). |
| prioridades_vuelo | CatalogController, FlightService | CatalogController, FlightService | 7 | 1 | 0/1 | 0 | 0 | INTEGRADA | Funcional |
| provincias | CatalogController, GeographicCatalogService, ProfessionalCredentialService | CatalogController, GeographicCatalogService, ProfessionalCredentialService | 15 | 1 | 0/4 | 0 | 0 | INTEGRADA | Funcional |
| roles | AuthService | AuthService | 30 | 27 | 0/1 | 0 | 0 | INTEGRADA | Funcional |
| roles_tripulacion | CatalogController, CredentialPolicyActivationService, CredentialPolicyService | CatalogController, CredentialPolicyActivationService, CredentialPolicyService | 16 | 5 | 0/4 | 0 | 0 | INTEGRADA | Funcional |
| rutas_vuelo | FlightRouteService | FlightRouteService, GeographicDependencyService | 3 | 7 | 5/0 | 7 | 0 | INTEGRADA | Funcional |
| telefonos | AuthService, PersonContactService | AuthService, CrewContactService, PersonContactService | 8 | 23 | 2/0 | 3 | 0 | INTEGRADA | Funcional |
| tipos_documento | CatalogController, DocumentService | CatalogController, DocumentService | 2 | 2 | 0/1 | 0 | 0 | INTEGRADA | Funcional |
| tipos_vuelo | CatalogController, CredentialPolicyActivationService, CredentialPolicyService | CatalogController, CredentialPolicyActivationService, CredentialPolicyService | 20 | 4 | 0/2 | 0 | 0 | INTEGRADA | Funcional |
| usuarios | CatalogController, Aa2000CoordinationService, AircraftAdminService | CatalogController, JwtAuthenticationFilter, Aa2000CoordinationService | 44 | 36 | 2/48 | 2 | 0 | INTEGRADA | Funcional |
| usuarios_roles | AuthService | AuthService | 25 | 9 | 2/0 | 0 | 0 | INTEGRADA | Funcional |
| verificaciones_correo | EmailVerificationService | EmailVerificationService, PersonContactService | 1 | 2 | 2/0 | 3 | 0 | INTEGRADA | Funcional con transporte controlado (Mailpit); entrega real pendiente de proveedor SMTP. |
| versiones_documento_vuelo | DocumentService | DocumentService | 1 | 3 | 2/0 | 1 | 0 | INTEGRADA | Funcional |
| vuelos | Aa2000CoordinationService, AircraftAdminService, CredentialPolicyActivationService | Aa2000CoordinationService, AircraftAdminService, AuditQueryService | 28 | 44 | 9/14 | 3 | 3 | INTEGRADA | Funcional |
| vuelos_sanitarios | FinalReportWorkflowService, FlightService, TransferContactService | AircraftAdminService, FinalReportWorkflowService, FlightService | 12 | 21 | 8/1 | 1 | 1 | INTEGRADA | Funcional |
| vuelos_tripulantes | AircraftAdminService, CredentialPolicyActivationService, CrewManagementService | AircraftAdminService, CredentialExpiryNoticeService, CredentialPolicyActivationService | 11 | 10 | 5/0 | 1 | 0 | INTEGRADA | Funcional |

Infraestructura (fuera del conteo de negocio): `flyway_schema_history` (gestionada por Flyway; la cuenta de la aplicación no puede escribirla); en la base habitual migrada además `sysdiagrams` (SSMS).
