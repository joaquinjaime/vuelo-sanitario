package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.dto.FlightDtos.CreateFlight;
import com.vuelossanitarios.backend.api.dto.FlightDtos.CreateFlightWithPatient;
import com.vuelossanitarios.backend.api.dto.FlightDtos.FlightView;
import com.vuelossanitarios.backend.repository.FlightRepository;
import com.vuelossanitarios.backend.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Coordinates the existing patient, flight and transfer-contact services in one transaction. Contacts are validated before anything
 * is written and persisted with the request: a failure at any step leaves neither a patient file, a flight nor a contact behind.
 */
@Service
public class SanitaryRequestRegistrationService {
 private final PatientService patients;
 private final FlightService flights;
 private final FlightRepository flightRepository;
 private final UserRepository users;
 private final AuditService audit;
 private final TransferContactService transferContacts;

 public SanitaryRequestRegistrationService(PatientService patients,FlightService flights,FlightRepository flightRepository,UserRepository users,AuditService audit,TransferContactService transferContacts){
  this.patients=patients;this.flights=flights;this.flightRepository=flightRepository;this.users=users;this.audit=audit;this.transferContacts=transferContacts;
 }

 /** Solicitud para un paciente ya registrado (seleccionado por búsqueda). */
 @Transactional
 public FlightView createForExistingPatient(CreateFlight request,Long actorId){
  var contacts=transferContacts.validate(request.contactos());
  FlightView flight=flights.create(request,actorId);
  transferContacts.registerAtRequest(flight.id(),actorId,contacts);
  return flight;
 }

 @Transactional
 public FlightView createWithPatient(CreateFlightWithPatient request,Long actorId){
  var contacts=transferContacts.validate(request.contactos());
  PatientService.Registration registration=patients.registerForSanitaryRequest(request.patient(),request.identidadConfirmada());
  var patient=registration.patient();
  FlightView flight=flights.create(new CreateFlight(patient.id(),request.localidadOrigenId(),request.localidadDestinoId(),request.priorityCode(),request.motivoVuelo(),request.fechaSolicitada(),request.extremaUrgencia(),request.justificacionExtremaUrgencia(),request.fechaLimiteTraslado(),request.medical()),actorId);
  transferContacts.registerAtRequest(flight.id(),actorId,contacts);
  String operation=registration.linkedExistingPerson()?"LINK_EXISTING_PERSON_WITH_REQUEST":"CREATE_WITH_SANITARY_REQUEST";
  String evidence=registration.linkedExistingPerson()?"{\"identityAttestedByDts\":true}":"{\"identitySource\":\"NEW_PERSON\"}";
  audit.record(flightRepository.getReferenceById(flight.id()),users.getReferenceById(actorId),"PATIENT",patient.id(),operation,null,evidence);
  return flight;
 }
}
