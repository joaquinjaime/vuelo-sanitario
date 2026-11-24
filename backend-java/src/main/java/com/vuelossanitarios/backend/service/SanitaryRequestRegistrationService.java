/*
 * ACCESO A BASE DE DATOS
 * Trae datos de: usuarios, vuelos.
 * Carga o modifica datos en: eventos_auditoria (vía AuditService).
 */
package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.dto.FlightDtos.CreateFlight;
import com.vuelossanitarios.backend.api.dto.FlightDtos.CreateFlightWithPatient;
import com.vuelossanitarios.backend.api.dto.FlightDtos.FlightView;
import com.vuelossanitarios.backend.repository.FlightRepository;
import com.vuelossanitarios.backend.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Coordinates the existing patient and flight services in one transaction: a failure at any step leaves neither a patient file
 * nor a flight behind.
 */
@Service
public class SanitaryRequestRegistrationService {
 private final PatientService patients;
 private final FlightService flights;
 private final FlightRepository flightRepository;
 private final UserRepository users;
 private final AuditService audit;

 public SanitaryRequestRegistrationService(PatientService patients,FlightService flights,FlightRepository flightRepository,UserRepository users,AuditService audit){
  this.patients=patients;this.flights=flights;this.flightRepository=flightRepository;this.users=users;this.audit=audit;
 }

 /** Solicitud para un paciente ya registrado (seleccionado por búsqueda). */
 @Transactional
 public FlightView createForExistingPatient(CreateFlight request,Long actorId){
  return flights.create(request,actorId);
 }

 @Transactional
 public FlightView createWithPatient(CreateFlightWithPatient request,Long actorId){
  PatientService.Registration registration=patients.registerForSanitaryRequest(request.patient(),request.identidadConfirmada());
  var patient=registration.patient();
  FlightView flight=flights.create(new CreateFlight(patient.id(),request.localidadOrigenId(),request.localidadDestinoId(),request.priorityCode(),request.motivoVuelo(),request.fechaSolicitada(),request.extremaUrgencia(),request.justificacionExtremaUrgencia(),request.fechaLimiteTraslado(),request.medical()),actorId);
  String operation=registration.linkedExistingPerson()?"LINK_EXISTING_PERSON_WITH_REQUEST":"CREATE_WITH_SANITARY_REQUEST";
  String evidence=registration.linkedExistingPerson()?"{\"identityAttestedByDts\":true}":"{\"identitySource\":\"NEW_PERSON\"}";
  // Obtiene una referencia diferida al vuelo creado por su ID, sin consultarlo, para registrar la auditoría
  // Obtiene una referencia diferida al usuario actor por su ID, sin consultarlo, para registrar la auditoría
  audit.record(flightRepository.getReferenceById(flight.id()),users.getReferenceById(actorId),"PATIENT",patient.id(),operation,null,evidence);
  return flight;
 }
}
