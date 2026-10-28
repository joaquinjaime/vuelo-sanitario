# Auditoría funcional automatizada de tablas (I-5.8)

Base: vuelos_sanitarios_e2e · Tablas físicas: 46 (negocio 45, infraestructura 1) · Integradas por evidencia estática: **45/45** · A revisar: ninguna

Criterio: mapeo JPA + escritor de producción + lector de producción + prueba JUnit o E2E + relación FK. Las filas de prueba no cuentan.

| Tabla | Mapeo | Escritores de producción | Lectores (muestra) | JUnit | E2E | FK sal/ent | CHECK | Únicos | Triggers | Veredicto |
|---|---|---|---|---:|---:|---|---:|---:|---:|---|
| activaciones_cuenta | entidad: AccountActivation | AuthService | AuthService | 4 | 5 | 2/0 | 1 | 1 | 0 | INTEGRADA |
| aeronaves | entidad: Aircraft | AircraftAdminService, CredentialPolicyActivationService, FlightService | AircraftAdminService, CredentialPolicyActivationService, CrewManagementService | 15 | 8 | 1/2 | 1 | 1 | 0 | INTEGRADA |
| aeropuertos | entidad: Airport | CatalogController, Aa2000CoordinationService, AircraftAdminService | CatalogController, Aa2000CoordinationService, AircraftAdminService | 15 | 11 | 2/6 | 0 | 0 | 0 | INTEGRADA |
| bitacora_vuelos | entidad: FlightAuditLog | FlightLogService | FlightLogService | 1 | 2 | 3/1 | 1 | 1 | 1 | INTEGRADA |
| bloqueos_documento_vuelo | entidad: DocumentLock | DocumentService | DocumentService, UserResponsibilityService | 1 | 3 | 2/0 | 1 | 1 | 0 | INTEGRADA |
| clasificaciones_tripulacion | entidad: CrewQualification | CredentialPolicyActivationService, CrewManagementService | CredentialPolicyActivationService, CrewManagementService | 8 | 2 | 4/0 | 1 | 1 | 0 | INTEGRADA |
| consultas_externas_habilitacion | entidad: ExternalCredentialCheck | ProfessionalCredentialService | ProfessionalCredentialService | 1 | 3 | 3/0 | 2 | 0 | 1 | INTEGRADA |
| contactos_coordinacion_traslado | entidad: TransferContact | TransferContactService | TransferContactService | 1 | 6 | 3/0 | 5 | 2 | 0 | INTEGRADA |
| coordinaciones_aa2000 | entidad: Aa2000Coordination | Aa2000CoordinationService | Aa2000CoordinationService, GeographicDependencyService | 1 | 1 | 3/0 | 2 | 2 | 0 | INTEGRADA |
| correos_electronicos | entidad: EmailContact | AuthService, EmailVerificationService, PersonContactService | AuthService, CrewContactService, EmailVerificationService | 5 | 9 | 2/1 | 2 | 2 | 0 | INTEGRADA |
| decisiones_habilitacion | entidad: CredentialDecision | ProfessionalCredentialService | ProfessionalCredentialService | 2 | 4 | 3/0 | 1 | 0 | 1 | INTEGRADA |
| documentos_habilitacion | entidad: CredentialDocument | CredentialDocumentService, LegacyDocumentService, ProfessionalCredentialService | CredentialDocumentService, LegacyDocumentService, ProfessionalCredentialService | 3 | 4 | 5/3 | 8 | 0 | 1 | INTEGRADA |
| documentos_vuelo | entidad: FlightDocumentItem | DocumentService | DocumentService | 1 | 2 | 3/2 | 1 | 0 | 0 | INTEGRADA |
| estados_solicitud_sanitaria | entidad: SanitaryRequestStatus | FlightService | FlightService | 10 | 4 | 0/1 | 0 | 1 | 0 | INTEGRADA |
| estados_vuelo | entidad: FlightStatus | FinalReportWorkflowService, FlightService | FinalReportWorkflowService, FlightService | 23 | 23 | 0/1 | 0 | 1 | 0 | INTEGRADA |
| eventos_auditoria | entidad: AuditEvent | AircraftAdminService, AuditService, ProfessionalCredentialService | AircraftAdminService, AuditService, FlightService | 15 | 38 | 2/0 | 1 | 0 | 1 | INTEGRADA |
| flyway_schema_history | — | — | — | 0 | 48 | 0/0 | 0 | 0 | 0 | INFRAESTRUCTURA |
| habilitaciones_profesionales | entidad: ProfessionalCredential | CredentialDocumentService, CredentialPolicyActivationService, LegacyDocumentService | CredentialDocumentService, CredentialExpiryNoticeService, CredentialPolicyActivationService | 4 | 3 | 5/4 | 2 | 0 | 0 | INTEGRADA |
| informacion_hangar | entidad: HangarInfo | HangarInfoService | GeographicDependencyService, HangarInfoService | 1 | 1 | 5/0 | 0 | 2 | 0 | INTEGRADA |
| informacion_medica_vuelo | entidad: FlightMedicalInfo | AircraftAdminService, FlightService | AircraftAdminService, FlightService | 5 | 3 | 1/0 | 0 | 1 | 0 | INTEGRADA |
| informes_finales_vuelo | entidad: FlightFinalReport | FinalReportWorkflowService, FlightService | FinalReportWorkflowService, FlightService | 6 | 3 | 3/1 | 4 | 3 | 0 | INTEGRADA |
| instantaneas_clima | entidad: WeatherSnapshot | FlightService | FlightService | 4 | 1 | 2/0 | 0 | 0 | 0 | INTEGRADA |
| localidades | entidad: Locality | CatalogController, FlightService, GeographicCatalogService | CatalogController, FlightService, GeographicCatalogService | 9 | 7 | 1/3 | 0 | 1 | 0 | INTEGRADA |
| motivos_cancelacion | entidad: CancellationReason | CatalogController, FlightService | CatalogController, FlightService | 7 | 1 | 0/1 | 0 | 2 | 0 | INTEGRADA |
| negociaciones_horario_vuelo | entidad: FlightScheduleNegotiation | FlightService | FlightService | 4 | 3 | 3/1 | 1 | 1 | 0 | INTEGRADA |
| notificaciones | entidad: Notification | NotificationService | NotificationService | 4 | 13 | 2/0 | 0 | 1 | 0 | INTEGRADA |
| obligaciones_informe_final | entidad: FinalReportObligation | FinalReportWorkflowService | CommanderReportAccessService, FinalReportDeadlineService, FinalReportWorkflowService | 4 | 5 | 6/0 | 3 | 2 | 1 | INTEGRADA |
| pacientes | entidad: Patient | AuthService, FlightService, PatientService | AuthService, FlightService, PatientDirectoryService | 16 | 20 | 1/1 | 0 | 1 | 0 | INTEGRADA |
| perfiles_comandante | entidad: CommanderProfile | CatalogController, AuthService | CatalogController, AuthService, FlightService | 11 | 1 | 2/0 | 1 | 2 | 0 | INTEGRADA |
| personas | entidad: Person | AuthService, EmailVerificationService, PatientService | AuthService, EmailVerificationService, PatientDirectoryService | 33 | 27 | 0/6 | 1 | 1 | 0 | INTEGRADA |
| politicas_habilitacion | entidad: CredentialPolicy | CredentialPolicyActivationService, CredentialPolicyService, ProfessionalCredentialService | CredentialPolicyActivationService, CredentialPolicyService, CredentialSufficiency | 4 | 4 | 4/0 | 3 | 1 | 1 | INTEGRADA |
| prioridades_vuelo | entidad: FlightPriority | CatalogController, FlightService | CatalogController, FlightService | 7 | 1 | 0/1 | 0 | 1 | 0 | INTEGRADA |
| provincias | entidad: Province | CatalogController, GeographicCatalogService, ProfessionalCredentialService | CatalogController, GeographicCatalogService, ProfessionalCredentialService | 15 | 1 | 0/4 | 0 | 2 | 0 | INTEGRADA |
| roles | entidad: Role | AuthService | AuthService | 30 | 26 | 0/1 | 0 | 1 | 0 | INTEGRADA |
| roles_tripulacion | entidad: CrewRole | CatalogController, CredentialPolicyActivationService, CredentialPolicyService | CatalogController, CredentialPolicyActivationService, CredentialPolicyService | 16 | 5 | 0/4 | 0 | 1 | 0 | INTEGRADA |
| rutas_vuelo | entidad: FlightRoute | FlightRouteService | FlightRouteService, GeographicDependencyService | 3 | 7 | 5/0 | 7 | 2 | 0 | INTEGRADA |
| telefonos | entidad: PhoneContact | AuthService, PersonContactService | AuthService, CrewContactService, PersonContactService | 8 | 22 | 2/0 | 3 | 2 | 0 | INTEGRADA |
| tipos_documento | entidad: DocumentType | CatalogController, DocumentService | CatalogController, DocumentService | 2 | 2 | 0/1 | 0 | 1 | 0 | INTEGRADA |
| tipos_vuelo | entidad: FlightType | CatalogController, CredentialPolicyActivationService, CredentialPolicyService | CatalogController, CredentialPolicyActivationService, CredentialPolicyService | 20 | 4 | 0/2 | 0 | 1 | 0 | INTEGRADA |
| usuarios | entidad: User | CatalogController, Aa2000CoordinationService, AircraftAdminService | CatalogController, JwtAuthenticationFilter, Aa2000CoordinationService | 44 | 35 | 2/48 | 2 | 2 | 0 | INTEGRADA |
| usuarios_roles | entidad: UserRole | AuthService | AuthService | 25 | 9 | 2/0 | 0 | 1 | 0 | INTEGRADA |
| verificaciones_correo | entidad: EmailVerification | EmailVerificationService | EmailVerificationService, PersonContactService | 1 | 2 | 2/0 | 3 | 1 | 0 | INTEGRADA |
| versiones_documento_vuelo | entidad: FlightDocument | DocumentService | DocumentService | 1 | 3 | 2/0 | 1 | 2 | 0 | INTEGRADA |
| vuelos | entidad: Flight | Aa2000CoordinationService, AircraftAdminService, CredentialPolicyActivationService | Aa2000CoordinationService, AircraftAdminService, AuditQueryService | 28 | 44 | 9/14 | 3 | 1 | 3 | INTEGRADA |
| vuelos_sanitarios | entidad: SanitaryFlight | FinalReportWorkflowService, FlightService, TransferContactService | AircraftAdminService, FinalReportWorkflowService, FlightService | 12 | 21 | 8/1 | 1 | 1 | 1 | INTEGRADA |
| vuelos_tripulantes | entidad: FlightCrew | AircraftAdminService, CredentialPolicyActivationService, CrewManagementService | AircraftAdminService, CredentialExpiryNoticeService, CredentialPolicyActivationService | 11 | 10 | 5/0 | 1 | 1 | 0 | INTEGRADA |
