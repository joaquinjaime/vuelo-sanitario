package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.FlightDtos.*;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.patient.Patient;
import com.vuelossanitarios.backend.domain.person.CommanderProfile;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/** State machine for common operational flights and their optional sanitary request. */
@Service public class FlightService {
 private final FlightRepository flights; private final SanitaryFlightRepository sanitaryFlights; private final FlightTypeRepository types; private final SanitaryRequestStatusRepository sanitaryStatuses; private final PatientRepository patients; private final UserRepository users; private final FlightStatusRepository statuses; private final FlightPriorityRepository priorities; private final AircraftRepository aircraft; private final AirportRepository airports; private final LocalityRepository localities; private final CrewRoleRepository crewRoles; private final FlightCrewRepository crews; private final FlightMedicalInfoRepository medical; private final FlightFinalReportRepository reports; private final FlightScheduleNegotiationRepository negotiations; private final CancellationReasonRepository cancellationReasons; private final WeatherSnapshotRepository weather; private final AuditService audit; private final FlightAuthorizationService access; private final NotificationService notifications; private final FlightUrgencyPolicy urgencyPolicy; private final FinalReportWorkflowService reportWorkflow; private final CommanderReportAccessService commanderAccess; private final CrewManagementService crewManagement; private final FlightLogService flightLog; private final FlightRouteService routeReview; private final AirportLocks airportLocks; private final CommanderGeographicExceptionRepository geoExceptions; private final CrewItineraryService itinerary; private final Clock clock;
 @org.springframework.beans.factory.annotation.Autowired(required=false) private FlightHealthStaffRepository healthStaff;
 public FlightService(FlightRepository f,SanitaryFlightRepository sf,FlightTypeRepository t,SanitaryRequestStatusRepository ss,PatientRepository p,UserRepository u,FlightStatusRepository s,FlightPriorityRepository pr,AircraftRepository a,AirportRepository ap,LocalityRepository l,CrewRoleRepository cr,FlightCrewRepository c,FlightMedicalInfoRepository m,FlightFinalReportRepository r,FlightScheduleNegotiationRepository n,CancellationReasonRepository cancelReasons,WeatherSnapshotRepository w,AuditService au,FlightAuthorizationService ac,NotificationService ns,FlightUrgencyPolicy up,FinalReportWorkflowService rw,CommanderReportAccessService ca,CrewManagementService cm,FlightLogService log,FlightRouteService rr,AirportLocks al,CommanderGeographicExceptionRepository ge,CrewItineraryService it,Clock clock){flights=f;sanitaryFlights=sf;types=t;sanitaryStatuses=ss;patients=p;users=u;statuses=s;priorities=pr;aircraft=a;airports=ap;localities=l;crewRoles=cr;crews=c;medical=m;reports=r;negotiations=n;cancellationReasons=cancelReasons;weather=w;audit=au;access=ac;notifications=ns;urgencyPolicy=up;reportWorkflow=rw;commanderAccess=ca;crewManagement=cm;flightLog=log;routeReview=rr;airportLocks=al;geoExceptions=ge;itinerary=it;this.clock=clock;}

 @Transactional public FlightView create(CreateFlight req,Long actorId){
  urgencyPolicy.validate(req.fechaSolicitada(),req.extremaUrgencia(),req.justificacionExtremaUrgencia(),req.fechaLimiteTraslado()); validateMedical(req.medical()); User actor=user(actorId); requireRole(actor,"DTS"); Patient patient=patients.findById(req.patientId()).orElseThrow(()->notFound("Paciente")); lockLocalities(req.localidadOrigenId(),req.localidadDestinoId());Locality origin=locality(req.localidadOrigenId(),"origen"), destination=locality(req.localidadDestinoId(),"destino"); if(origin.getId().equals(destination.getId()))throw bad("La localidad de origen y destino deben ser distintas.");
  Flight f=new Flight(); f.setCodigo(code());f.setTipoVuelo(type("SANITARIO"));f.setMotivoVuelo(required(req.motivoVuelo(),"El motivo del vuelo es obligatorio"));f.setCreadoPor(actor);flights.save(f);
  SanitaryFlight s=new SanitaryFlight();s.setFlight(f);s.setPatient(patient);s.setSolicitadoPor(actor);s.setFechaSolicitada(req.fechaSolicitada());s.setPrioridad(priority(req.priorityCode()));s.setExtremaUrgencia(req.extremaUrgencia());s.setJustificacionExtremaUrgencia(req.extremaUrgencia()?required(req.justificacionExtremaUrgencia(),"La extrema urgencia requiere justificación"):null);s.setFechaLimiteTraslado(req.extremaUrgencia()?req.fechaLimiteTraslado():null);s.setLocalidadOrigenSolicitada(origin);s.setLocalidadDestinoSolicitada(destination);s.setEstadoSolicitud(sanitaryStatus("SOLICITADO"));sanitaryFlights.save(s);f.setSanitario(s);
  FlightMedicalInfo info=new FlightMedicalInfo();info.setFlight(f);info.setDiagnostico(req.medical().diagnostico());info.setCondicionMedica(req.medical().condicionMedica());info.setRequiereEquipamientoEspecial(req.medical().requiereEquipamientoEspecial());info.setObservaciones(req.medical().observaciones());medical.save(info);
  negotiation(f,"DTS_PROPUESTA",req.fechaSolicitada(),null,actor);audit.record(f,actor,"FLIGHT",f.getId(),"CREATE_SANITARY",null,"{\"tipo\":\"SANITARIO\",\"estado\":\"SOLICITADO\",\"salida\":"+json(req.fechaSolicitada().toString())+"}");notifyOps(f,"NEW_SANITARY_REQUEST","Nueva solicitud sanitaria "+f.getCodigo()+" para el "+req.fechaSolicitada(),"NEW_SANITARY_REQUEST:"+f.getId());if(Boolean.TRUE.equals(s.getExtremaUrgencia()))notifyOps(f,"EXTREME_URGENCY_REQUEST","EXTREMA URGENCIA: solicitud "+f.getCodigo()+", horario límite "+s.getFechaLimiteTraslado(),"EXTREME_URGENCY_REQUEST:"+f.getId());return view(f);
 }

 @Transactional(isolation=Isolation.SERIALIZABLE) public FlightView createOperational(CreateOperationalFlight req,Long actorId){
  User actor=user(actorId);requireOperationsOrAdmin(actor); FlightType type=type(req.tipoVueloCode());if("SANITARIO".equals(type.getCodigo()))throw bad("DTS es el único canal para crear vuelos sanitarios");if(!req.llegada().isAfter(req.salida()))throw bad("La llegada debe ser posterior a la salida");Aircraft plane=activeAircraft(req.aircraftId());airportLocks.lockAll(req.destinoId());Airport destination=activeAirport(req.destinoId(),"destino");Airport origin=plane.getAeropuertoActual();if(origin.getId().equals(destination.getId()))throw bad("Origen y destino deben ser distintos");User commander=eligibleCommander(req.comandanteId());{Flight probe=new Flight();probe.setTipoVuelo(type);assertCommanderEligible(probe,commander,req.salida().toLocalDate(),plane);}assertCommanderInProvince(commander,req.salida(),origin,null);
  Flight f=new Flight();f.setCodigo(code());f.setTipoVuelo(type);f.setMotivoVuelo(required(req.motivoVuelo(),"El motivo del vuelo es obligatorio"));f.setCreadoPor(actor);f.setAircraft(plane);f.setComandante(commander);f.setOrigen(origin);f.setDestino(destination);f.setFechaPlanificadaSalida(req.salida());f.setFechaPlanificadaLlegada(req.llegada());f.setEstadoVuelo(status("PENDIENTE_CONFIRMACION_COMANDANTE"));assertNoOverlap(f);assertCrewNoOverlap(f);flights.save(f);ensureCommanderCrew(f,commander,actor);audit.record(f,actor,"FLIGHT",f.getId(),"CREATE_OPERATIONAL",null,"{\"tipo\":"+json(type.getCodigo())+"}");notifications.create(commander,f,"COMMANDER_ASSIGNMENT_PENDING","Fue asignado al vuelo "+f.getCodigo()+". Debe aceptar, rechazar o proponer horario.");return view(f);
 }

 @Transactional(isolation=Isolation.SERIALIZABLE) public FlightView replanOperational(Long id,ReplanOperationalFlight req,Long actorId){
  Flight f=locked(id);requireOperations(actorId);requireOperationalStatus(f,"PENDIENTE_REPLANIFICACION");if(f.getSanitario()!=null)throw bad("La replanificación operacional no aplica a vuelos sanitarios");if(!req.llegada().isAfter(req.salida()))throw bad("La llegada debe ser posterior a la salida");Aircraft plane=activeAircraft(req.aircraftId());airportLocks.lockAll(req.destinoId());Airport origin=plane.getAeropuertoActual();Airport destination=activeAirport(req.destinoId(),"destino");if(origin.getId().equals(destination.getId()))throw bad("Origen y destino deben ser distintos");User commander=eligibleCommander(req.comandanteId());assertCommanderEligible(f,commander,req.salida().toLocalDate(),plane);assertCommanderInProvince(commander,req.salida(),origin,id);f.setAircraft(plane);f.setComandante(commander);f.setOrigen(origin);f.setDestino(destination);f.setFechaPlanificadaSalida(req.salida());f.setFechaPlanificadaLlegada(req.llegada());f.setEstadoVuelo(status("PENDIENTE_CONFIRMACION_COMANDANTE"));assertNoOverlap(f);assertCrewNoOverlap(f);ensureCommanderCrew(f,commander,user(actorId));routeReview.reassess(f,user(actorId));audit.record(f,user(actorId),"FLIGHT",f.getId(),"REPLAN_OPERATIONAL",null,"{\"aeronaveId\":"+json(plane.getId().toString())+"}");notifications.create(commander,f,"COMMANDER_ASSIGNMENT_PENDING","Fue asignado nuevamente al vuelo "+f.getCodigo()+". Debe aceptar, rechazar o proponer horario.");return view(f);
 }

 @Transactional public FlightView evaluate(Long id,Evaluation req,Long actor){return Boolean.TRUE.equals(req.aprobar())?acceptRequestedSchedule(id,actor):rejectDirectly(id,new Cancel(req.motivoCancelacionId(),req.motivoCancelacionPersonalizado()),actor);}
 @Transactional public FlightView acceptRequestedSchedule(Long id,Long actorId){
  Flight f=locked(id);requireOperations(actorId);SanitaryFlight s=sanitary(f);requireSanitaryStatus(s,"SOLICITADO");User actor=user(actorId);
  requireFuture(s.getFechaSolicitada(),"La fecha y hora solicitadas ya pasaron; proponga un nuevo horario o rechace la solicitud");
  fixSanitarySchedule(f,s,s.getFechaSolicitada(),"CO_ACEPTA_PROPUESTA",null,actor,lastOrNull(f,"DTS_PROPUESTA"));
  audit.record(f,actor,"SANITARY_REQUEST",s.getId(),"APPROVE","{\"estado\":\"SOLICITADO\"}","{\"estado\":\"APROBADO\",\"salida\":"+json(s.getFechaSolicitada().toString())+"}");
  notifyRequester(s,f,"SCHEDULE_ACCEPTED","Centro de Operaciones aprobó la solicitud "+f.getCodigo()+" para el "+s.getFechaSolicitada(),"SCHEDULE_ACCEPTED:"+f.getId());return view(f);
 }
 /** Operaciones propone otro horario; una propuesta posterior reemplaza a la anterior (que queda obsoleta) mientras el DTS no haya respondido. */
 @Transactional public FlightView counterproposal(Long id,CounterProposal req,Long actorId){
  Flight f=locked(id);requireOperations(actorId);SanitaryFlight s=sanitary(f);String state=s.getEstadoSolicitud().getCodigo();
  if(!"SOLICITADO".equals(state)&&!"PENDIENTE_RESPUESTA_DTS".equals(state))throw bad("Transición sanitaria no permitida desde "+state);
  requireFuture(req.salida(),"La propuesta debe ser posterior al momento actual");validateSanitaryHour(s,req.salida());
  if(req.salida().equals(s.getFechaSolicitada()))throw bad("La propuesta debe diferir de la fecha solicitada; si el horario es factible apruebe la solicitud");
  String reason=required(req.motivo(),"La contrapropuesta requiere motivo");User actor=user(actorId);
  FlightScheduleNegotiation previous="PENDIENTE_RESPUESTA_DTS".equals(state)?openProposal(f,"CO_CONTRAPROPUESTA"):null;
  FlightScheduleNegotiation answers=previous!=null?previous:lastOrNull(f,"DTS_PROPUESTA");
  s.setEvaluadoPor(actor);s.setFechaEvaluacion(LocalDateTime.now(clock));s.setEstadoSolicitud(sanitaryStatus("PENDIENTE_RESPUESTA_DTS"));
  FlightScheduleNegotiation n=negotiation(f,"CO_CONTRAPROPUESTA",req.salida(),null,reason,actor,answers);
  audit.record(f,actor,"SANITARY_REQUEST",s.getId(),previous==null?"COUNTERPROPOSE":"REPLACE_COUNTERPROPOSAL",previous==null?"{\"estado\":\"SOLICITADO\"}":"{\"propuestaId\":"+previous.getId()+"}","{\"estado\":\"PENDIENTE_RESPUESTA_DTS\",\"propuestaId\":"+n.getId()+",\"salida\":"+json(req.salida().toString())+"}");
  notifyRequester(s,f,"SCHEDULE_COUNTERPROPOSAL","Centro de Operaciones propuso un nuevo horario ("+req.salida()+") para la solicitud "+f.getCodigo()+". Debe aceptarlo o rechazarlo.","SCHEDULE_COUNTERPROPOSAL:"+n.getId());return view(f);
 }
 @Transactional public FlightView respondToCounterproposal(Long id,NegotiationResponse req,Long actorId){
  Flight f=locked(id);SanitaryFlight s=sanitary(f);requireSanitaryStatus(s,"PENDIENTE_RESPUESTA_DTS");
  if(!s.getSolicitadoPor().getId().equals(actorId))throw forbidden("Sólo DTS solicitante puede responder la contrapropuesta");
  User actor=user(actorId);FlightScheduleNegotiation proposal=requireCurrentProposal(f,"CO_CONTRAPROPUESTA",req.propuestaId());
  if(req.aceptar()){
   requireFuture(proposal.getFechaHoraPropuesta(),"La propuesta venció: el horario propuesto ya pasó. Solicite a Operaciones una nueva propuesta");
   fixSanitarySchedule(f,s,proposal.getFechaHoraPropuesta(),"DTS_ACEPTA_CONTRAPROPUESTA",null,actor,proposal);
   audit.record(f,actor,"SANITARY_REQUEST",s.getId(),"ACCEPT_COUNTERPROPOSAL","{\"estado\":\"PENDIENTE_RESPUESTA_DTS\",\"propuestaId\":"+proposal.getId()+"}","{\"estado\":\"APROBADO\",\"salida\":"+json(proposal.getFechaHoraPropuesta().toString())+"}");
   notifyOps(f,"SCHEDULE_PROPOSAL_ACCEPTED","DTS aceptó el horario propuesto para la solicitud "+f.getCodigo()+" ("+proposal.getFechaHoraPropuesta()+").","SCHEDULE_PROPOSAL_ACCEPTED:"+proposal.getId());
  }else{
   Cancel cancel=new Cancel(req.motivoCancelacionId(),req.motivoCancelacionPersonalizado());String label=cancellationLabel(cancel);
   negotiation(f,"DTS_RECHAZA_CONTRAPROPUESTA",null,null,label,actor,proposal);
   cancelFlight(f,s,actor,cancel,"{\"estado\":\"PENDIENTE_RESPUESTA_DTS\",\"propuestaId\":"+proposal.getId()+"}");
   notifyOps(f,"SCHEDULE_PROPOSAL_REJECTED","DTS rechazó el horario propuesto y la solicitud "+f.getCodigo()+" quedó cancelada: "+label,"SCHEDULE_PROPOSAL_REJECTED:"+proposal.getId());
  }
  return view(f);
 }
 @Transactional public FlightView rejectDirectly(Long id,Cancel req,Long actorId){
  Flight f=locked(id);requireOperations(actorId);SanitaryFlight s=sanitary(f);requireSanitaryStatus(s,"SOLICITADO");User actor=user(actorId);String label=cancellationLabel(req);
  rejectSanitary(f,s,actor,"CO_RECHAZO_DIRECTO",req);
  audit.record(f,actor,"SANITARY_REQUEST",s.getId(),"REJECT","{\"estado\":\"SOLICITADO\"}","{\"estado\":\"RECHAZADO\",\"motivo\":"+json(label)+"}");
  notifyRequester(s,f,"REQUEST_REJECTED","Su solicitud "+f.getCodigo()+" fue rechazada por Operaciones: "+label,"REQUEST_REJECTED:"+f.getId());return view(f);
 }

 @Transactional public FlightView respondToOperationalAssignment(Long id,CommanderResponse req,Long actorId){
  Flight f=locked(id);requireActiveCommander(f,actorId);requireOperationalStatus(f,"PENDIENTE_CONFIRMACION_COMANDANTE");User commander=user(actorId);FlightScheduleNegotiation n;String type,text;
  if(req.aceptar()){
   requireFuture(f.getFechaPlanificadaSalida(),"La salida planificada ya pasó; Operaciones debe replanificar el vuelo");assertCommanderEligible(f,commander,f.getFechaPlanificadaSalida().toLocalDate(),f.getAircraft());
   f.setEstadoVuelo(status("PLANIFICADO"));n=negotiation(f,"COMANDANTE_ACEPTA_ASIGNACION",f.getFechaPlanificadaSalida(),null,null,commander,null);type="COMMANDER_ASSIGNMENT_ACCEPTED";text="El comandante aceptó "+f.getCodigo();
  }else if(req.salidaPropuesta()!=null||req.llegadaPropuesta()!=null){
   if(req.salidaPropuesta()==null||req.llegadaPropuesta()==null||!req.llegadaPropuesta().isAfter(req.salidaPropuesta()))throw bad("La propuesta de horario debe incluir salida y llegada válidas");
   requireFuture(req.salidaPropuesta(),"La propuesta debe ser posterior al momento actual");
   f.setEstadoVuelo(status("PENDIENTE_RESPUESTA_OPERACIONES"));n=negotiation(f,"COMANDANTE_PROPONE_HORARIO",req.salidaPropuesta(),req.llegadaPropuesta(),required(req.motivo(),"La propuesta requiere motivo"),commander,null);type="COMMANDER_SCHEDULE_PROPOSED";text="El comandante propuso un horario para "+f.getCodigo()+" ("+req.salidaPropuesta()+")";
  }else{
   String reason=required(req.motivo(),"El rechazo del comandante requiere motivo");
   f.setEstadoVuelo(status("PENDIENTE_REPLANIFICACION"));n=negotiation(f,"COMANDANTE_RECHAZA_ASIGNACION",null,null,reason,commander,null);type="COMMANDER_ASSIGNMENT_REJECTED";text="El comandante rechazó "+f.getCodigo()+": "+reason;
  }
  audit.record(f,commander,"FLIGHT",f.getId(),"COMMANDER_ASSIGNMENT_RESPONSE",null,"{\"estado\":"+json(f.getEstadoVuelo().getCodigo())+",\"negociacionId\":"+n.getId()+"}");
  notifyOps(f,type,text,type+":"+n.getId());return view(f);
 }
 /** Autoridad: Operaciones (CO u OPERACIONES) responde las propuestas del comandante en vuelos operativos; no interviene el DTS. */
 @Transactional public FlightView respondToCommanderProposal(Long id,NegotiationResponse req,Long actorId){
  Flight f=locked(id);requireOperations(actorId);requireOperationalStatus(f,"PENDIENTE_RESPUESTA_OPERACIONES");User actor=user(actorId);
  FlightScheduleNegotiation proposal=requireCurrentProposal(f,"COMANDANTE_PROPONE_HORARIO",req.propuestaId());FlightScheduleNegotiation n;String type,text;
  if(req.aceptar()){
   requireFuture(proposal.getFechaHoraPropuesta(),"La propuesta venció: el horario propuesto ya pasó");
   if(f.getAircraft()!=null)aircraft.lockById(f.getAircraft().getId());
   f.setFechaPlanificadaSalida(proposal.getFechaHoraPropuesta());f.setFechaPlanificadaLlegada(proposal.getFechaHoraLlegadaPropuesta());f.setEstadoVuelo(status("PLANIFICADO"));assertNoOverlap(f);assertCrewNoOverlap(f);routeReview.reassess(f,actor);
   n=negotiation(f,"CO_ACEPTA_PROPUESTA_COMANDANTE",proposal.getFechaHoraPropuesta(),proposal.getFechaHoraLlegadaPropuesta(),null,actor,proposal);type="COMMANDER_SCHEDULE_ACCEPTED";text="Operaciones aceptó su propuesta para "+f.getCodigo()+" ("+proposal.getFechaHoraPropuesta()+").";
  }else{
   String reason=blank(req.motivo())!=null?blank(req.motivo()):blank(req.motivoCancelacionPersonalizado());if(reason==null)throw bad("El rechazo de la propuesta requiere motivo");
   f.setEstadoVuelo(status("PENDIENTE_CONFIRMACION_COMANDANTE"));n=negotiation(f,"CO_RECHAZA_PROPUESTA_COMANDANTE",null,null,reason,actor,proposal);type="COMMANDER_SCHEDULE_REJECTED";text="Operaciones rechazó su propuesta para "+f.getCodigo()+": "+reason;
  }
  audit.record(f,actor,"FLIGHT",f.getId(),"COMMANDER_SCHEDULE_RESPONSE","{\"propuestaId\":"+proposal.getId()+"}","{\"aceptar\":"+req.aceptar()+",\"estado\":"+json(f.getEstadoVuelo().getCodigo())+",\"negociacionId\":"+n.getId()+"}");
  if(f.getComandante()!=null)notifications.createOnce(f.getComandante(),f,type,text,type+":"+n.getId());return view(f);
 }

 @Transactional(readOnly=true) public List<AvailableAircraftView> availableAircraft(Long id,Long actorId){return aircraftCandidates(id,actorId).stream().filter(AvailableAircraftView::disponible).toList();}
 /**
  * Aeronaves activas compatibles con el vuelo (sanitario: jurisdicción del aeropuerto de salida —o, mientras no haya, la provincia del paciente— y, si ya hay aeropuerto de salida, ese aeropuerto;
  * operativo: provincia actual del comandante), con el motivo cuando no están disponibles. La disponibilidad por horario usa
  * FlightRepository.aircraftBusyIn, la misma consulta que las asignaciones; la aeronave actual del vuelo no se ofrece.
  */
 @Transactional(readOnly=true) public List<AvailableAircraftView> aircraftCandidates(Long id,Long actorId){
  Flight f=flights.findById(id).orElseThrow(()->notFound("Vuelo"));requireOperations(actorId);requireAircraftAssignable(f);
  SanitaryFlight s=f.getSanitario()!=null?f.getSanitario():sanitaryFlights.findByFlightId(f.getId()).orElse(null);
  Long province=s!=null?departure(f,s).provinceId():commanderProvince(f);
  List<Aircraft> pool=province!=null?aircraft.findActiveLocatedInProvince(province):aircraft.findAllWithCurrentAirportOrderByMatricula().stream().filter(a->Boolean.TRUE.equals(a.getActivo())&&a.getAeropuertoActual()!=null).toList();
  List<AvailableAircraftView> out=new ArrayList<>();
  for(Aircraft a:pool){
   if(f.getAircraft()!=null&&f.getAircraft().getId().equals(a.getId()))continue;
   if(s!=null&&f.getOrigen()!=null&&!a.getAeropuertoActual().getId().equals(f.getOrigen().getId()))continue;
   List<Flight> inFlight=flights.activeAircraftAssignments(a.getId(),List.of("EN_CURSO")).stream().filter(x->!x.getId().equals(f.getId())).toList();
   List<Flight> busy=aircraftBusy(a,f);
   Map<Long,Flight> conflicts=new LinkedHashMap<>();inFlight.forEach(x->conflicts.put(x.getId(),x));busy.forEach(x->conflicts.put(x.getId(),x));
   String reason=!inFlight.isEmpty()?"Actualmente en vuelo":!busy.isEmpty()?"Tiene un vuelo comprometido en el horario de este vuelo":crewSize(f)>a.getCapacidadTripulacion()?"Su capacidad de tripulación ("+a.getCapacidadTripulacion()+") es menor que la tripulación asignada":s==null&&f.getDestino()!=null&&f.getDestino().getId().equals(a.getAeropuertoActual().getId())?"Origen y destino del vuelo coincidirían":null;
   out.add(new AvailableAircraftView(a.getId(),a.getMatricula(),a.getModelo(),a.getTipo(),a.getAeropuertoActual().getId(),a.getAeropuertoActual().getNombre(),reason==null,reason,conflicts.values().stream().map(this::flightSummary).toList()));
  }
  return out;
 }
 private Long commanderProvince(Flight f){CommanderProfile p=f.getComandante()==null?null:f.getComandante().getPerson().getCommanderProfile();return p==null||p.getProvinciaActual()==null?null:p.getProvinciaActual().getId();}
 private com.vuelossanitarios.backend.api.dto.AircraftDtos.FlightSummary flightSummary(Flight x){return new com.vuelossanitarios.backend.api.dto.AircraftDtos.FlightSummary(x.getId(),x.getCodigo(),x.getTipoVuelo().getCodigo(),x.getEstadoVuelo()==null?null:x.getEstadoVuelo().getCodigo(),x.getFechaPlanificadaSalida(),x.getFechaPlanificadaLlegada(),x.getOrigen()==null?null:x.getOrigen().getNombre(),x.getDestino()==null?null:x.getDestino().getNombre());}
 /** Vuelos comprometidos de la aeronave en la ventana del vuelo: [salida, llegada) o, sin llegada planificada, el instante de salida. */
 private List<Flight> aircraftBusy(Aircraft a,Flight f){if(f.getFechaPlanificadaSalida()==null)return List.of();LocalDateTime end=f.getFechaPlanificadaLlegada()!=null&&f.getFechaPlanificadaLlegada().isAfter(f.getFechaPlanificadaSalida())?f.getFechaPlanificadaLlegada():f.getFechaPlanificadaSalida().plusMinutes(1);List<Flight> busy=new ArrayList<>(flights.aircraftBusyIn(a.getId(),f.getFechaPlanificadaSalida(),end));busy.addAll(flights.aircraftReservedIn(a.getId(),f.getFechaPlanificadaSalida(),end));return busy.stream().filter(x->!x.getId().equals(f.getId())).distinct().toList();}
 private void assertAircraftFree(Aircraft a,Flight f){List<Flight> busy=aircraftBusy(a,f);if(!busy.isEmpty())throw new ApiException(HttpStatus.CONFLICT,"La aeronave "+a.getMatricula()+" tiene un vuelo comprometido en ese horario ("+busy.get(0).getCodigo()+")");}
 private int crewSize(Flight f){if(f.getId()==null)return f.getComandante()==null?0:1;int n=0;boolean commander=false;for(FlightCrew c:crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f.getId())){n++;if(f.getComandante()!=null&&c.getUser().getId().equals(f.getComandante().getId()))commander=true;}if(healthStaff!=null)n+=healthStaff.findCurrentByFlightId(f.getId()).size();return n+(f.getComandante()!=null&&!commander?1:0);}
 private void assertAircraftCapacity(Aircraft a,Flight f){int size=crewSize(f);if(a.getCapacidadTripulacion()!=null&&size>a.getCapacidadTripulacion())throw new ApiException(HttpStatus.CONFLICT,"La aeronave "+a.getMatricula()+" admite "+a.getCapacidadTripulacion()+" tripulantes y el vuelo tiene "+size+" asignados");}
 /** La aeronave sólo se asigna o cambia mientras el vuelo no haya iniciado: solicitud sanitaria aprobada (vuelo sin estado o PLANIFICADO) o vuelo operativo pendiente de confirmación / planificado. */
 private void requireAircraftAssignable(Flight f){SanitaryFlight s=f.getSanitario()!=null?f.getSanitario():sanitaryFlights.findByFlightId(f.getId()).orElse(null);String state=f.getEstadoVuelo()==null?null:f.getEstadoVuelo().getCodigo();if(s!=null){requireSanitaryStatus(s,"APROBADO");if(state!=null&&!"PLANIFICADO".equals(state))throw bad("El vuelo ya no admite cambios de aeronave en su estado actual");}else if(state==null||!Set.of("PENDIENTE_CONFIRMACION_COMANDANTE","PLANIFICADO").contains(state))throw bad("El vuelo operativo sólo admite cambio de aeronave pendiente de confirmación o planificado; en otros estados corresponde cancelar o replanificar");}
 /** Comandantes ordinariamente elegibles: ubicados en la jurisdicción de salida y aptos. Para el detalle (no aptos, excepciones, causas) se usa {@link #commanderCandidates}. */
 @Transactional(readOnly=true) public List<AvailableCommanderView> availableCommanders(Long id,Long actorId){
  return commanderCandidates(id,actorId,"").ordinarios().stream().map(c->new AvailableCommanderView(c.id(),c.username(),c.nombre(),c.apellido(),c.licencia(),c.provincia())).toList();
 }
 static final int EXCEPTION_CANDIDATES=50;
 /**
  * Jurisdicción desde la que despegará el vuelo. Con aeropuerto de salida (propuesto o confirmado) es la provincia o CABA de ese aeropuerto; sin aeropuerto es, de forma
  * preliminar, la provincia donde se encuentra el paciente. La localidad del paciente nunca se toma como la del aeropuerto. Un aeropuerto sin provincia conocida bloquea la decisión.
  */
 CommanderGeography.Departure departure(Flight f,SanitaryFlight s){
  Airport a=f.getOrigen();
  if(a!=null){
   Province p=a.getProvinciaReferencial();
   if(p==null)throw airportProvinceUnknown(a);
   boolean confirmed=f.origenConfirmado();
   return new CommanderGeography.Departure(p.getId(),p.getNombre(),a.getId(),a.getNombre(),confirmed?CommanderGeography.SOURCE_CONFIRMED_AIRPORT:CommanderGeography.SOURCE_PROPOSED_AIRPORT,!confirmed);
  }
  Province p=s.getLocalidadOrigenSolicitada().getProvincia();
  return new CommanderGeography.Departure(p.getId(),p.getNombre(),null,null,CommanderGeography.SOURCE_PATIENT_PROVINCE,true);
 }
 private ApiException airportProvinceUnknown(Airport a){return new ApiException(HttpStatus.CONFLICT,"AIRPORT_PROVINCE_UNKNOWN","No se pudo determinar la provincia del aeropuerto "+a.getNombre()+": no puede usarse para confirmar una decisión geográfica hasta que se corrija el catálogo geográfico",Map.of("aeropuertoId",a.getId()));}
 private static CommanderGeography.Departure proposedDeparture(Airport a){Province p=a.getProvinciaReferencial();return new CommanderGeography.Departure(p.getId(),p.getNombre(),a.getId(),a.getNombre(),CommanderGeography.SOURCE_PROPOSED_AIRPORT,true);}
 private static CommanderGeography.Departure confirmedDeparture(Airport a){Province p=a.getProvinciaReferencial();return new CommanderGeography.Departure(p.getId(),p.getNombre(),a.getId(),a.getNombre(),CommanderGeography.SOURCE_CONFIRMED_AIRPORT,false);}
 private static DepartureView departureView(CommanderGeography.Departure d){return new DepartureView(d.provinceId(),d.province(),d.airportId(),d.airport(),d.source(),d.preliminary());}
 /**
  * Comandantes evaluados para la jurisdicción del aeropuerto de salida (preliminar mientras no esté confirmado). Ordinarios: registrados en esa provincia o CABA y aptos con la misma evaluación que
  * la asignación (cuenta, clasificación, habilitación vigente y disponibilidad horaria). Los de la jurisdicción que no lo son se informan con su causa. Fuera de la jurisdicción sólo se evalúan
  * (y devuelven, como candidatos a excepción) los primeros {@value #EXCEPTION_CANDIDATES} que coinciden con {@code q}; el resto se resume por situación.
  */
 @Transactional(readOnly=true) public CommanderCandidates commanderCandidates(Long id,Long actorId,String q){return commanderCandidates(id,actorId,q,null);}
 /**
  * Igual que {@link #commanderCandidates(Long,Long,String)}, pero evaluando contra un aeropuerto de salida hipotético ({@code airportId}, tratado como propuesto): sirve para elegir de antemano
  * al comandante que corresponde a un aeropuerto que todavía no se propuso. No modifica nada.
  */
 @Transactional(readOnly=true) public CommanderCandidates commanderCandidates(Long id,Long actorId,String q,Long airportId){return commanderCandidates(id,actorId,q,airportId,CommanderGeographicException.FUNCTION_COMMANDER);}
 /**
  * Candidatos para la función indicada (COMANDANTE o COPILOTO): el copiloto se elige del mismo conjunto de usuarios COMANDANTE. Cada uno se ubica donde se prevé que estará al despegar el vuelo
  * (su ubicación registrada o, si ya tiene un vuelo anterior que termina antes de la salida, la jurisdicción de llegada de ese vuelo). Ordinarios: en la jurisdicción del aeropuerto de salida y aptos
  * con la misma evaluación que la asignación (cuenta, perfil, informes y disponibilidad horaria). Los de la jurisdicción que no lo son se informan con su causa. Fuera de la jurisdicción sólo se
  * evalúan (y devuelven, como candidatos a excepción) los primeros {@value #EXCEPTION_CANDIDATES} que coinciden con {@code q}; el resto se resume por situación.
  */
 @Transactional(readOnly=true) public CommanderCandidates commanderCandidates(Long id,Long actorId,String q,Long airportId,String function){
  Flight f=flights.findById(id).orElseThrow(()->notFound("Vuelo"));requireOperations(actorId);
  boolean copilot=CommanderGeographicException.FUNCTION_COPILOT.equals(function);String role=copilot?"COPILOTO":"COMANDANTE";
  SanitaryFlight s=sanitaryFlights.findByFlightId(f.getId()).orElse(null);if(s!=null)requireAssignableSanitary(f,s);else if(!copilot)throw bad("El vuelo no posee solicitud sanitaria");
  var departure=airportId==null?departureOf(f,s):proposedDeparture(activeAirport(airportId,"de salida"));String text=q==null?"":q.trim().toLowerCase(Locale.ROOT).replace("%","").replace("_","");
  Set<Long> taken=new HashSet<>();if(copilot){if(f.getComandante()!=null)taken.add(f.getComandante().getId());for(FlightCrew c:crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f.getId()))taken.add(c.getUser().getId());}
  Map<Long,CrewItineraryService.Position> projections=itinerary.projectionsAt(f.getFechaPlanificadaSalida(),f.getId());
  List<User> inside=new ArrayList<>(),outside=new ArrayList<>();
  for(User u:users.findActiveCommanderAccounts("",org.springframework.data.domain.PageRequest.of(0,5000))){
   if(taken.contains(u.getId()))continue;
   var pos=projections.get(u.getId());Province province=pos!=null?pos.province():u.getPerson().getCommanderProfile()==null?null:u.getPerson().getCommanderProfile().getProvinciaActual();
   (province!=null&&province.getId().equals(departure.provinceId())?inside:outside).add(u);
  }
  List<CommanderCandidateView> ordinary=new ArrayList<>(),blocked=new ArrayList<>(),exceptional=new ArrayList<>();
  for(User u:inside){
   var pos=projections.get(u.getId());var geo=geoOf(u,pos,departure);var result=crewManagement.evaluate(f,u,role,true);
   (result.eligible()?ordinary:blocked).add(candidate(f,u,geo,pos,result.eligible()?"ORDINARIA":"NO_ELEGIBLE",result,role));
  }
  List<User> matching=outside.stream().filter(u->text.isEmpty()||(u.getPerson().getApellido()+" "+u.getPerson().getNombre()).toLowerCase(Locale.ROOT).contains(text)||(u.getPerson().getNombre()+" "+u.getPerson().getApellido()).toLowerCase(Locale.ROOT).contains(text)||(u.getUsername()!=null&&u.getUsername().toLowerCase(Locale.ROOT).contains(text))).toList();
  boolean incomplete=matching.size()>EXCEPTION_CANDIDATES;
  for(User u:matching.stream().limit(EXCEPTION_CANDIDATES).toList()){
   var result=crewManagement.evaluate(f,u,role,true);
   if(result.eligible()){var pos=projections.get(u.getId());exceptional.add(candidate(f,u,geoOf(u,pos,departure),pos,"EXCEPCION",result,role));}
  }
  Map<String,Long> outsideCounts=new LinkedHashMap<>();
  for(User u:outside){var pos=projections.get(u.getId());boolean known=pos!=null||(u.getPerson().getCommanderProfile()!=null&&u.getPerson().getCommanderProfile().getProvinciaActual()!=null);outsideCounts.merge(known?CommanderGeographicException.OTHER_PROVINCE:CommanderGeographicException.UNKNOWN,1L,Long::sum);}
  boolean canAuthorize=hasRole(user(actorId),"CENTRO_OPERACIONES");
  return new CommanderCandidates(departureView(departure),f.getComandante()==null?null:f.getComandante().getId(),ordinary,blocked,exceptional,incomplete,outsideCounts,canAuthorize,
   ordinary.isEmpty()?noCandidatesMessage(departure,blocked.size(),outsideCounts,!exceptional.isEmpty(),canAuthorize):null,departure.warning());
 }
 private CommanderGeography.Assessment geoOf(User u,CrewItineraryService.Position pos,CommanderGeography.Departure departure){
  if(pos!=null)return CommanderGeography.assess(pos.provinceId(),pos.provinceName(),departure,pos.afterFlight());
  var profile=u.getPerson().getCommanderProfile();var province=profile==null?null:profile.getProvinciaActual();
  return CommanderGeography.assess(province==null?null:province.getId(),province==null?null:province.getNombre(),departure,null);
 }
 private String noCandidatesMessage(CommanderGeography.Departure departure,int blocked,Map<String,Long> outside,boolean exceptionsAvailable,boolean canAuthorize){
  StringBuilder m=new StringBuilder("No se encontraron comandantes disponibles en ").append(departure.province()).append(departure.preliminary()?" (jurisdicción prevista para la salida).":", jurisdicción del aeropuerto de salida.");
  if(blocked>0)m.append(' ').append(blocked).append(blocked==1?" comandante de la jurisdicción no cumple las condiciones operativas (ver el motivo de cada uno).":" comandantes de la jurisdicción no cumplen las condiciones operativas (ver el motivo de cada uno).");
  List<String> causes=new ArrayList<>();
  long unknown=outside.getOrDefault(CommanderGeographicException.UNKNOWN,0L),otherProvince=outside.getOrDefault(CommanderGeographicException.OTHER_PROVINCE,0L);
  if(unknown>0)causes.add(unknown+" sin ubicación registrada");if(otherProvince>0)causes.add(otherProvince+" en otra provincia o jurisdicción");
  if(!causes.isEmpty())m.append(" Comandantes activos fuera de la jurisdicción: ").append(String.join(", ",causes)).append('.');
  if(exceptionsAvailable)m.append(canAuthorize?" Puede asignar uno de ellos como excepción geográfica, con una justificación.":" Asignar un comandante fuera de la jurisdicción requiere la autorización de Centro de Operaciones.");
  return m.toString();
 }
 private CommanderCandidateView candidate(Flight f,User u,CommanderGeography.Assessment geo,CrewItineraryService.Position pos,String eligibility,CrewManagementService.Eligibility result,String role){
  CommanderProfile p=u.getPerson().getCommanderProfile();
  return new CommanderCandidateView(u.getId(),u.getUsername(),u.getPerson().getNombre(),u.getPerson().getApellido(),p.getLicenseNumber(),geo.provinceId(),geo.province(),pos==null?null:pos.afterFlight(),p.getUbicacionActualizadaEn(),eligibility,geo.code(),geo.message(),result.eligible()?null:result.code(),result.eligible()?null:result.message(),result.eligible()?java.util.List.of():crewManagement.requirements(f,u,role).stream().filter(r->!r.cumplido()).toList());
 }
 /** Estado de la solicitud y del vuelo que admiten reservar o asignar recursos: solicitud aprobada con horario definitivo y vuelo aún sin iniciar (sin estado o PLANIFICADO). */
 private void requireAssignableSanitary(Flight f,SanitaryFlight s){
  requireSanitaryStatus(s,"APROBADO");
  if(f.getEstadoVuelo()!=null&&!"PLANIFICADO".equals(f.getEstadoVuelo().getCodigo()))throw bad("El vuelo ya no admite cambios de recursos en su estado actual");
  if(f.getFechaPlanificadaSalida()==null)throw bad("Primero debe fijarse la fecha definitiva");
 }
 private void requireAircraftInDeparture(Aircraft plane,Flight f,SanitaryFlight s){
  var departure=departure(f,s);
  if(!provinceId(plane.getAeropuertoActual()).equals(departure.provinceId()))throw bad("La aeronave debe estar en la jurisdicción del aeropuerto de salida ("+departure.province()+(departure.preliminary()&&departure.airportId()==null?", provincia donde se encuentra el paciente mientras no haya aeropuerto de salida":"")+")");
  if(f.getOrigen()!=null&&!plane.getAeropuertoActual().getId().equals(f.getOrigen().getId()))throw bad("La aeronave debe encontrarse en el aeropuerto de salida del vuelo ("+f.getOrigen().getNombre()+")");
 }
 /**
  * Regla geográfica de la asignación: el comandante debe encontrarse en la jurisdicción (provincia o CABA) del aeropuerto de salida; mientras no haya aeropuerto confirmado se usa, de forma
  * preliminar, la del aeropuerto propuesto o la provincia del paciente, y se vuelve a verificar al confirmarlo. Si no lo está, sólo puede asignarse con una excepción expresa, justificada y
  * autorizada por Centro de Operaciones, que se registra; ninguna excepción omite las demás validaciones (cuenta, clasificación, habilitación, disponibilidad), que se comprueban antes.
  * Devuelve la excepción a registrar (null si la asignación es ordinaria o ya la cubre una excepción vigente para esta misma jurisdicción).
  */
 private CommanderGeographicException decideGeography(Flight f,SanitaryFlight s,User commander,GeographicExceptionRequest request,User actor){return decideGeography(f,s,commander,request,actor,CommanderGeographicException.FUNCTION_COMMANDER);}
 /** Ubicación de la persona al despegar este vuelo según su itinerario (véase {@link CrewItineraryService}), no necesariamente la registrada en su perfil. */
 private CommanderGeography.Assessment geoFor(Flight f,User u,CommanderGeography.Departure departure){var pos=itinerary.positionAt(u,f.getFechaPlanificadaSalida(),f.getId());return CommanderGeography.assess(pos.provinceId(),pos.provinceName(),departure,pos.afterFlight());}
 /** Jurisdicción de salida de cualquier vuelo: la del sanitario (aeropuerto o provincia del paciente) o, en un vuelo operativo, la de su aeropuerto de origen. */
 private CommanderGeography.Departure departureOf(Flight f,SanitaryFlight s){if(s!=null)return departure(f,s);Airport a=f.getOrigen();if(a==null)throw bad("El vuelo no tiene aeropuerto de salida definido");if(a.getProvinciaReferencial()==null)throw airportProvinceUnknown(a);return confirmedDeparture(a);}
 private CommanderGeographicException decideGeography(Flight f,SanitaryFlight s,User commander,GeographicExceptionRequest request,User actor,String function){
  var departure=departureOf(f,s);var pos=itinerary.positionAt(commander,f.getFechaPlanificadaSalida(),f.getId());var geo=CommanderGeography.assess(pos.provinceId(),pos.provinceName(),departure,pos.afterFlight());
  if(geo.ordinary()){
   if(request!=null)throw new ApiException(HttpStatus.BAD_REQUEST,"GEOGRAPHIC_EXCEPTION_NOT_NEEDED","La persona está (o estará) en la jurisdicción del aeropuerto de salida: no corresponde una excepción geográfica",Map.of("tipo",geo.code()));
   return null;
  }
  Map<String,Object> details=Map.of("tipo",geo.code(),"provinciaSalida",departure.province(),"comandanteId",commander.getId(),"funcion",function);
  if(request==null){
   if(coveredByException(f,commander,departure,function))return null;
   throw new ApiException(HttpStatus.CONFLICT,"COMMANDER_OUTSIDE_DEPARTURE_JURISDICTION",geo.message()+". Sólo puede asignarse mediante una excepción geográfica justificada y autorizada por Centro de Operaciones.",details);
  }
  if(!hasRole(actor,"CENTRO_OPERACIONES"))throw new ApiException(HttpStatus.FORBIDDEN,"GEOGRAPHIC_EXCEPTION_NOT_AUTHORIZED","Sólo Centro de Operaciones puede autorizar la asignación de una persona fuera de la jurisdicción del aeropuerto de salida",details);
  String reason=request.motivo()==null?"":request.motivo().trim();
  if(reason.length()<15)throw new ApiException(HttpStatus.BAD_REQUEST,"GEOGRAPHIC_EXCEPTION_REASON_REQUIRED","La excepción geográfica requiere una justificación de al menos 15 caracteres",details);
  CommanderGeographicException e=new CommanderGeographicException();e.setCommander(commander);e.setDepartureProvince(departureProvinceEntity(f,s));e.setType(geo.code());e.setReason(reason);e.setAuthorizedBy(actor);e.setFunction(function);
  if(f.getOrigen()!=null)e.setDepartureAirport(f.getOrigen());
  e.setCommanderProvince(pos.province());return e;
 }
 private Province departureProvinceEntity(Flight f,SanitaryFlight s){return f.getOrigen()!=null?f.getOrigen().getProvinciaReferencial():s.getLocalidadOrigenSolicitada().getProvincia();}
 /** Una excepción vigente del mismo comandante, autorizada para esta misma jurisdicción de salida, lo cubre; si el aeropuerto pasa a otra provincia la excepción deja de aplicar. */
 private boolean coveredByException(Flight f,User commander,CommanderGeography.Departure departure){return coveredByException(f,commander,departure,CommanderGeographicException.FUNCTION_COMMANDER);}
 private boolean coveredByException(Flight f,User person,CommanderGeography.Departure departure,String function){
  return f.getId()!=null&&geoExceptions.findCurrentByFlightId(f.getId()).stream().anyMatch(e->e.getCommander().getId().equals(person.getId())&&function.equals(e.getFunction())&&e.getDepartureProvince()!=null&&e.getDepartureProvince().getId().equals(departure.provinceId()));
 }
 /** Al completar una reserva: si el comandante ya no está en la jurisdicción de salida y no tiene una excepción vigente para ella, la ubicación cambió desde que se lo eligió. */
 private void requireGeographyStillValid(Flight f,SanitaryFlight s,User commander){
  var departure=departureOf(f,s);var geo=geoFor(f,commander,departure);
  if(geo.ordinary()||coveredByException(f,commander,departure))return;
  throw new ApiException(HttpStatus.CONFLICT,"COMMANDER_OUTSIDE_DEPARTURE_JURISDICTION",geo.message()+". La ubicación cambió desde que se eligió al comandante; vuelva a seleccionarlo.",Map.of("tipo",geo.code(),"comandanteId",commander.getId()));
 }
 /**
  * Cierra las excepciones vigentes de comandantes reemplazados, las del mismo comandante que ya no aplican (otra jurisdicción de salida o reemplazadas por una nueva) y registra (con su
  * auditoría) la nueva, si la hay. Se invoca dentro de la transacción de la asignación.
  */
 private void recordGeography(Flight f,User actor,User commander,CommanderGeographicException exception){recordGeography(f,actor,commander,exception,CommanderGeographicException.FUNCTION_COMMANDER);}
 private void recordGeography(Flight f,User actor,User commander,CommanderGeographicException exception,String function){
  LocalDateTime now=LocalDateTime.now(clock);SanitaryFlight s=sanitaryFlights.findByFlightId(f.getId()).orElse(null);Long province=null;
  try{province=departureOf(f,s).provinceId();}catch(ApiException unknown){province=null;}
  for(CommanderGeographicException old:geoExceptions.findCurrentByFlightId(f.getId())){
   if(!function.equals(old.getFunction()))continue;
   boolean sameCommander=old.getCommander().getId().equals(commander.getId());
   boolean stale=!sameCommander||exception!=null||old.getDepartureProvince()==null||province==null||!old.getDepartureProvince().getId().equals(province);
   if(stale){old.setReplacedAt(now);geoExceptions.save(old);}
  }
  if(exception==null)return;
  exception.setFlight(f);exception.setAuthorizedAt(now);geoExceptions.saveAndFlush(exception);
  audit.record(f,actor,"COMMANDER_GEOGRAPHIC_EXCEPTION",exception.getId(),"CREATE",null,"{\"comandanteId\":"+commander.getId()+",\"funcion\":"+json(function)+",\"tipo\":"+json(exception.getType())+",\"provinciaSalida\":"+json(exception.getDepartureProvince().getNombre())+",\"aeropuertoSalida\":"+json(exception.getDepartureAirport()==null?null:exception.getDepartureAirport().getNombre())+",\"provinciaActual\":"+json(exception.getCommanderProvince()==null?null:exception.getCommanderProvince().getNombre())+",\"motivo\":"+json(exception.getReason())+"}");
 }
 /** Cierra las excepciones vigentes de una persona para una función (al retirarla del vuelo, una excepción pasada no debe cubrir una asignación futura). */
 private void closeExceptions(Flight f,Long userId,String function){
  LocalDateTime now=LocalDateTime.now(clock);
  for(CommanderGeographicException old:geoExceptions.findCurrentByFlightId(f.getId()))if(old.getCommander().getId().equals(userId)&&function.equals(old.getFunction())){old.setReplacedAt(now);geoExceptions.save(old);}
 }
 /** Pasa el vuelo a PLANIFICADO con aeronave y comandante ya fijados: revalida a toda la tripulación, vincula al comandante, reevalúa la ruta, audita y avisa. */
 private FlightView completeAssignment(Flight f,SanitaryFlight s,User actor,User commander,Aircraft previousPlane,User previousCommander,CommanderGeographicException exception){
  f.setEstadoVuelo(status("PLANIFICADO"));assertCrewNoOverlap(f);ensureCommanderCrew(f,commander,actor);routeReview.reassess(f,actor);recordGeography(f,actor,commander,exception);
  AuditEvent assigned=audit.record(f,actor,"FLIGHT",f.getId(),"ASSIGN_RESOURCES",previousPlane==null&&previousCommander==null?null:"{\"aeronaveId\":"+json(previousPlane==null?null:previousPlane.getId().toString())+",\"comandanteId\":"+json(previousCommander==null?null:previousCommander.getId().toString())+"}","{\"aeronaveId\":"+json(f.getAircraft().getId().toString())+",\"comandanteId\":"+json(commander.getId().toString())+(exception==null?"":",\"excepcionGeograficaId\":"+exception.getId())+",\"salidaPreliminar\":"+departure(f,s).preliminary()+"}");
  if(previousCommander!=null&&!previousCommander.getId().equals(commander.getId())&&assigned!=null)notifications.createOnce(previousCommander,f,"COMMANDER_UNASSIGNED","Fue desasignado del vuelo "+f.getCodigo()+".","COMMANDER_UNASSIGNED:"+assigned.getId());
  notifications.create(commander,f,"COMMANDER_ASSIGNED",(Boolean.TRUE.equals(s.getExtremaUrgencia())?"EXTREMA URGENCIA (límite "+s.getFechaLimiteTraslado()+"): ":"")+"Fue asignado al vuelo "+f.getCodigo());
  return view(f);
 }

 /**
  * Centro de Operaciones propone o cambia el aeropuerto de salida y/o el de llegada de una solicitud sanitaria con horario acordado (antes del inicio). Es la ejecución aeronáutica: no modifica ni
  * reemplaza las localidades del paciente de la solicitud. Cada aeropuerto cambiado queda PROPUESTO hasta que el comandante lo confirma. Se bloquea todo aeropuerto sin provincia conocida.
  * Si el cambio deja al comandante asignado fuera de la jurisdicción del nuevo aeropuerto de salida no se mantiene la asignación en silencio: se exige otro comandante (nuevoComandanteId, que se
  * valida contra la jurisdicción nueva) o una excepción geográfica justificada; si no, se rechaza todo el cambio. Una ruta ya presentada o aprobada pasa a requerir nueva revisión.
  */
 @Transactional(isolation=Isolation.SERIALIZABLE) public FlightView setAirports(Long id,SetAirports req,Long actorId){
  Flight f=locked(id);requireOperations(actorId);SanitaryFlight s=sanitary(f);requireAssignableSanitary(f,s);User actor=user(actorId);
  if(req.origenId()==null&&req.destinoId()==null)throw bad("Indique el aeropuerto de salida, el de llegada o ambos");
  airportLocks.lockAll(req.origenId(),req.destinoId());
  Aircraft plane=f.getAircraft();if(plane!=null)aircraft.lockById(plane.getId());
  Airport origin=req.origenId()==null?f.getOrigen():activeAirport(req.origenId(),"de salida"),destination=req.destinoId()==null?f.getDestino():activeAirport(req.destinoId(),"de llegada");
  if(origin!=null&&destination!=null&&origin.getId().equals(destination.getId()))throw bad("Los aeropuertos de salida y llegada deben ser distintos");
  boolean originChanged=req.origenId()!=null&&(f.getOrigen()==null||!f.getOrigen().getId().equals(origin.getId())),destinationChanged=req.destinoId()!=null&&(f.getDestino()==null||!f.getDestino().getId().equals(destination.getId()));
  if(!originChanged&&!destinationChanged)throw bad("Los aeropuertos indicados ya están registrados en el vuelo");
  String reason=blank(req.justificacion());
  boolean outsidePatient=(originChanged&&!provinceId(origin).equals(s.getLocalidadOrigenSolicitada().getProvincia().getId()))||(destinationChanged&&!provinceId(destination).equals(s.getLocalidadDestinoSolicitada().getProvincia().getId()));
  if(outsidePatient&&(reason==null||reason.length()<10))throw new ApiException(HttpStatus.BAD_REQUEST,"AIRPORT_OUTSIDE_PATIENT_PROVINCE_REASON_REQUIRED","El aeropuerto elegido está en una provincia distinta de la que figura en la solicitud del paciente: indique la justificación operativa (al menos 10 caracteres)",Map.of());
  String before=airportsJson(f);User commander=f.getComandante();boolean replacing=commander!=null&&req.nuevoComandanteId()!=null&&!req.nuevoComandanteId().equals(commander.getId());
  if(originChanged&&commander!=null&&!replacing){
   // Se verifica antes de modificar nada: un cambio que deja inelegible al comandante asignado no se acepta en silencio.
   var next=proposedDeparture(origin);var geo=geoFor(f,commander,next);
   if(!geo.ordinary()&&req.excepcionGeografica()==null&&!coveredByException(f,commander,next))
    throw new ApiException(HttpStatus.CONFLICT,"AIRPORT_CHANGE_REQUIRES_COMMANDER_REVALIDATION","La modificación del aeropuerto requiere volver a verificar la elegibilidad del comandante: "+geo.message()+". Indique otro comandante elegible para "+next.province()+" o autorice una excepción geográfica justificada.",Map.of("tipo",geo.code(),"provinciaSalida",next.province(),"comandanteId",commander.getId()));
  }
  if(originChanged){f.setOrigen(origin);f.setEstadoAeropuertoOrigen(Flight.PROPOSED);}
  if(destinationChanged){f.setDestino(destination);f.setEstadoAeropuertoDestino(Flight.PROPOSED);}
  f.setAeropuertosFijadosPor(actor);f.setAeropuertosFijadosEn(LocalDateTime.now(clock));flights.saveAndFlush(f);
  boolean commanderReplaced=false;
  if(originChanged&&commander!=null){
   if(replacing){assignCommander(id,new AssignCommander(req.nuevoComandanteId(),req.excepcionGeografica()),actorId);commanderReplaced=true;commander=f.getComandante();}
   else recordGeography(f,actor,commander,decideGeography(f,s,commander,req.excepcionGeografica(),actor));
  }else if(commander!=null&&req.excepcionGeografica()!=null)throw new ApiException(HttpStatus.BAD_REQUEST,"GEOGRAPHIC_EXCEPTION_NOT_NEEDED","El aeropuerto de salida no cambió: no corresponde una excepción geográfica",Map.of());
  routeReview.reassess(f,actor);
  AuditEvent event=audit.record(f,actor,"FLIGHT",f.getId(),"SET_AIRPORTS",before,airportsJson(f).replaceFirst("\\}$",",\"justificacion\":"+json(reason)+",\"comandanteReemplazado\":"+commanderReplaced+"}"));
  if(commander!=null&&!commanderReplaced&&event!=null)notifications.createOnce(commander,f,"AIRPORTS_PROPOSED","Centro de Operaciones propuso aeropuertos para el vuelo "+f.getCodigo()+": salida "+(f.getOrigen()==null?"sin definir":f.getOrigen().getNombre())+", llegada "+(f.getDestino()==null?"sin definir":f.getDestino().getNombre())+". Revíselos y confírmelos en su planificación.","AIRPORTS_PROPOSED:"+event.getId());
  itinerary.revalidate(crewIds(f),actor);
  return view(f);
 }
 private String airportsJson(Flight f){return "{\"origenId\":"+json(f.getOrigen()==null?null:f.getOrigen().getId().toString())+",\"origen\":"+json(f.getOrigen()==null?null:f.getOrigen().getNombre())+",\"estadoOrigen\":"+json(f.getEstadoAeropuertoOrigen())+",\"destinoId\":"+json(f.getDestino()==null?null:f.getDestino().getId().toString())+",\"destino\":"+json(f.getDestino()==null?null:f.getDestino().getNombre())+",\"estadoDestino\":"+json(f.getEstadoAeropuertoDestino())+"}";}
 private AirportSlotView slot(Airport a,String state){return a==null?new AirportSlotView(null,null,null,null,null,"PENDIENTE"):new AirportSlotView(a.getId(),a.getNombre(),a.getCodigoOaci(),a.getProvinciaReferencial()==null?null:a.getProvinciaReferencial().getId(),a.getProvinciaReferencial()==null?null:a.getProvinciaReferencial().getNombre(),state==null?"CONFIRMADO":state);}
 /** Planificación aeronáutica (aeropuertos de salida y llegada y lo que falta) de un vuelo sanitario; null si el vuelo no es sanitario. */
 private AirportPlanView airportPlan(Flight f,SanitaryFlight s){
  if(s==null)return null;List<String> pending=new ArrayList<>();
  String state=s.getEstadoSolicitud().getCodigo();
  boolean open=!Set.of("RECHAZADO","CANCELADO").contains(state)&&(f.getEstadoVuelo()==null||Set.of("PLANIFICADO").contains(f.getEstadoVuelo().getCodigo()));
  CommanderGeography.Departure departure=null;String warning=null;
  if(f.getOrigen()==null){if(open)pending.add("Aeropuerto de salida sin definir");}
  else{
   if(f.getOrigen().getProvinciaReferencial()==null)pending.add("No se pudo determinar la provincia del aeropuerto de salida");
   else{departure=departure(f,s);if(!f.origenConfirmado())pending.add("Aeropuerto de salida propuesto: falta la confirmación del comandante");}
  }
  if(departure==null&&f.getOrigen()==null){departure=departure(f,s);}
  if(f.getDestino()==null){if(open)pending.add("Aeropuerto de llegada sin definir");}
  else{if(f.getDestino().getProvinciaReferencial()==null)pending.add("No se pudo determinar la provincia del aeropuerto de llegada");else if(!f.destinoConfirmado())pending.add("Aeropuerto de llegada propuesto: falta la confirmación del comandante");}
  if(open&&f.getOrigen()!=null&&f.getAircraft()!=null&&f.getAircraft().getAeropuertoActual()!=null&&!f.getAircraft().getAeropuertoActual().getId().equals(f.getOrigen().getId()))pending.add("La aeronave asignada está en "+f.getAircraft().getAeropuertoActual().getNombre()+", no en el aeropuerto de salida: asigne una aeronave ubicada allí");
  if(open&&f.getComandante()!=null&&departure!=null){var geo=geoFor(f,f.getComandante(),departure);if(!geo.ordinary()&&!coveredByException(f,f.getComandante(),departure))pending.add("El comandante asignado se encuentra en una jurisdicción diferente a la del aeropuerto de salida: "+geo.message());}
  if(departure!=null&&departure.preliminary()&&open)warning=departure.warning();
  User by=f.getAeropuertosFijadosPor();
  return new AirportPlanView(slot(f.getOrigen(),f.getEstadoAeropuertoOrigen()),slot(f.getDestino(),f.getEstadoAeropuertoDestino()),by==null?null:by.getPerson().getNombre()+" "+by.getPerson().getApellido(),f.getAeropuertosFijadosEn(),departure!=null&&departure.preliminary()&&open,warning,pending);
 }

 /** Asignación combinada de aeronave y comandante (contrato original). Aplica las mismas reglas que las asignaciones por separado, incluida la geográfica. */
 @Transactional(isolation=Isolation.SERIALIZABLE) public FlightView assign(Long id,AssignResources req,Long actorId){
  Flight f=locked(id);requireOperations(actorId);SanitaryFlight s=sanitary(f);requireAssignableSanitary(f,s);User actor=user(actorId);
  Aircraft plane=activeAircraft(req.aircraftId());requireAircraftInDeparture(plane,f,s);
  User commander=eligibleCommander(req.comandanteId());assertCommanderEligible(f,commander,f.getFechaPlanificadaSalida().toLocalDate(),plane);
  CommanderGeographicException exception=decideGeography(f,s,commander,req.excepcionGeografica(),actor);
  assertAircraftFree(plane,f);Aircraft previousPlane=f.getAircraft();User previousCommander=f.getComandante();
  f.setComandante(commander);assertAircraftCapacity(plane,f);f.setAircraft(plane);
  return completeAssignment(f,s,actor,commander,previousPlane,previousCommander,exception);
 }

 /**
  * Asigna (o reemplaza) el comandante. Mientras falte la aeronave la elección queda reservada sin cambiar el estado del vuelo (sigue APROBADO, el comandante todavía no la ve);
  * con la aeronave ya elegida, o con el vuelo PLANIFICADO, es la asignación operativa definitiva.
  */
 @Transactional(isolation=Isolation.SERIALIZABLE) public FlightView assignCommander(Long id,AssignCommander req,Long actorId){
  Flight f=locked(id);requireOperations(actorId);SanitaryFlight s=sanitary(f);requireAssignableSanitary(f,s);User actor=user(actorId);
  Aircraft plane=f.getAircraft();if(plane!=null)aircraft.lockById(plane.getId());
  User previous=f.getComandante();User commander=eligibleCommander(req.comandanteId());
  if(previous!=null&&previous.getId().equals(commander.getId()))throw bad("El comandante seleccionado ya está asignado al vuelo");
  assertCommanderEligible(f,commander,f.getFechaPlanificadaSalida().toLocalDate(),plane);
  CommanderGeographicException exception=decideGeography(f,s,commander,req.excepcionGeografica(),actor);
  f.setComandante(commander);
  if(plane!=null){assertAircraftCapacity(plane,f);return completeAssignment(f,s,actor,commander,plane,previous,exception);}
  assertCrewNoOverlap(f);recordGeography(f,actor,commander,exception);
  audit.record(f,actor,"FLIGHT",f.getId(),"ASSIGN_FLIGHT_COMMANDER",previous==null?null:"{\"comandanteId\":"+previous.getId()+"}","{\"comandanteId\":"+commander.getId()+",\"estado\":\"RESERVADO\",\"salidaPreliminar\":"+departure(f,s).preliminary()+(exception==null?"":",\"excepcionGeograficaId\":"+exception.getId())+"}");
  return view(f);
 }

 /**
  * Asigna la aeronave. Sin comandante elegido la elección queda reservada (el vuelo sigue APROBADO y la aeronave deja de ofrecerse para horarios incompatibles); con el comandante ya
  * elegido es la asignación definitiva y se revalida su habilitación para esa aeronave. Con el vuelo PLANIFICADO es el cambio de aeronave.
  */
 @Transactional(isolation=Isolation.SERIALIZABLE) public FlightView assignAircraft(Long id,AssignAircraft req,Long actorId){
  Flight f=locked(id);requireOperations(actorId);SanitaryFlight s=sanitary(f);requireAssignableSanitary(f,s);User actor=user(actorId);
  if(f.getEstadoVuelo()!=null)return changeAircraft(id,new ChangeAircraft(req.aircraftId(),req.motivo()),actorId);
  Aircraft plane=activeAircraft(req.aircraftId());requireAircraftInDeparture(plane,f,s);
  Aircraft previous=f.getAircraft();if(previous!=null&&previous.getId().equals(plane.getId()))throw bad("La aeronave seleccionada ya está asignada al vuelo");
  assertAircraftFree(plane,f);User commander=f.getComandante();
  if(commander!=null){users.lockById(commander.getId());assertCommanderEligible(f,commander,f.getFechaPlanificadaSalida().toLocalDate(),plane);requireGeographyStillValid(f,s,commander);}
  f.setAircraft(plane);assertAircraftCapacity(plane,f);
  if(commander!=null)return completeAssignment(f,s,actor,commander,previous,commander,null);
  audit.record(f,actor,"FLIGHT",f.getId(),"ASSIGN_FLIGHT_AIRCRAFT",previous==null?null:"{\"aeronaveId\":"+previous.getId()+"}","{\"aeronaveId\":"+plane.getId()+",\"estado\":\"RESERVADO\"}");
  return view(f);
 }
 /**
  * Cambio de aeronave con el vuelo aún sin iniciar (sanitario aprobado o vuelo operativo pendiente de confirmación / planificado).
  * Comparte con la asignación inicial las validaciones de aeronave activa, fuera de vuelo, horario libre, capacidad y ubicación.
  * En un vuelo operativo el origen es la ubicación de la nueva aeronave; si cambia y el comandante ya había aceptado, debe confirmar de nuevo.
  * Ruta, hangar y coordinaciones quedan en REQUIERE_REVISION por su contexto (incluye la aeronave) sin perder versiones.
  */
 @Transactional(isolation=Isolation.SERIALIZABLE) public FlightView changeAircraft(Long id,ChangeAircraft req,Long actorId){
  Flight f=locked(id);requireOperations(actorId);User actor=user(actorId);requireAircraftAssignable(f);
  Aircraft old=f.getAircraft();if(old==null||f.getEstadoVuelo()==null)throw bad("El vuelo todavía no tiene recursos asignados; utilice la asignación de recursos");
  Aircraft plane=activeAircraft(req.aircraftId());if(plane.getId().equals(old.getId()))throw bad("La aeronave seleccionada ya está asignada al vuelo");
  SanitaryFlight s=f.getSanitario()!=null?f.getSanitario():sanitaryFlights.findByFlightId(f.getId()).orElse(null);Airport planeAirport=plane.getAeropuertoActual();boolean originChanged=false;
  if(s!=null){
   requireAircraftInDeparture(plane,f,s);
  }else{
   if(f.getDestino()!=null&&planeAirport.getId().equals(f.getDestino().getId()))throw bad("Origen y destino deben ser distintos");
   CommanderProfile profile=f.getComandante()==null?null:f.getComandante().getPerson().getCommanderProfile();
   if(profile==null||profile.getProvinciaActual()==null||!profile.getProvinciaActual().getId().equals(provinceId(planeAirport)))throw bad("El comandante debe encontrarse en la provincia de origen");
   originChanged=f.getOrigen()==null||!f.getOrigen().getId().equals(planeAirport.getId());
  }
  assertAircraftFree(plane,f);assertAircraftCapacity(plane,f);f.setAircraft(plane);
  String previousState=f.getEstadoVuelo().getCodigo();
  if(s==null){f.setOrigen(planeAirport);if(originChanged&&"PLANIFICADO".equals(previousState))f.setEstadoVuelo(status("PENDIENTE_CONFIRMACION_COMANDANTE"));assertNoOverlap(f);}
  boolean reconfirm=!previousState.equals(f.getEstadoVuelo().getCodigo());routeReview.reassess(f,actor);
  AuditEvent event=audit.record(f,actor,"FLIGHT",f.getId(),"CHANGE_AIRCRAFT","{\"aeronaveId\":"+old.getId()+",\"matricula\":"+json(old.getMatricula())+",\"estado\":"+json(previousState)+"}","{\"aeronaveId\":"+plane.getId()+",\"matricula\":"+json(plane.getMatricula())+",\"estado\":"+json(f.getEstadoVuelo().getCodigo())+",\"motivo\":"+json(blank(req.motivo()))+",\"requiereConfirmacionComandante\":"+reconfirm+"}");
  if(f.getComandante()!=null&&event!=null)notifications.createOnce(f.getComandante(),f,"AIRCRAFT_CHANGED","La aeronave del vuelo "+f.getCodigo()+" cambió a "+plane.getMatricula()+(reconfirm?". Debe confirmar nuevamente la asignación.":"."),"AIRCRAFT_CHANGED:"+event.getId());
  return view(f);
 }
 @Transactional public FlightView configurePlanning(Long id,Plan req,Long actor){throw bad("La planificación operativa corresponde al comandante asignado");}
 /**
  * El comandante asignado define (o confirma) los aeropuertos de salida y llegada y la llegada planificada. Es la planificación existente: no es una segunda. Para un vuelo sanitario los aeropuertos son
  * los de la ejecución aeronáutica y pueden estar en una provincia distinta de la del paciente si se justifica; quedan CONFIRMADOS por el comandante, pero una ruta presentada o aprobada pasa a requerir nueva
  * revisión (reassess) y Centro de Operaciones es notificado si el comandante cambió los aeropuertos que había propuesto. El comandante sólo puede confirmar una salida en su propia jurisdicción (o cubierta
  * por una excepción vigente): no puede autorizarse a sí mismo una excepción.
  */
 @Transactional public FlightView configureOperationalPlanning(Long id,OperationalPlan req,Long actorId){
  Flight f=locked(id);requireActiveCommander(f,actorId);requireOperationalStatus(f,"PLANIFICADO");
  if(f.getFechaPlanificadaSalida()==null||!req.llegada().isAfter(f.getFechaPlanificadaSalida()))throw bad("La llegada debe ser posterior a la salida");
  airportLocks.lockAll(req.origenId(),req.destinoId());
  Airport origin=activeAirport(req.origenId(),"origen"), destination=activeAirport(req.destinoId(),"destino");
  if(origin.getId().equals(destination.getId()))throw bad("Origen y destino deben ser distintos");
  User actor=user(actorId);SanitaryFlight s=f.getSanitario()!=null?f.getSanitario():sanitaryFlights.findByFlightId(f.getId()).orElse(null);String reason=blank(req.justificacion());
  if(s!=null){
   boolean outsidePatient=!provinceId(origin).equals(s.getLocalidadOrigenSolicitada().getProvincia().getId())||!provinceId(destination).equals(s.getLocalidadDestinoSolicitada().getProvincia().getId());
   if(outsidePatient&&(reason==null||reason.length()<10))throw new ApiException(HttpStatus.BAD_REQUEST,"AIRPORT_OUTSIDE_PATIENT_PROVINCE_REASON_REQUIRED","El aeropuerto elegido está en una provincia distinta de la que figura en la solicitud del paciente: indique la justificación operativa (al menos 10 caracteres)",Map.of());
   var departure=confirmedDeparture(origin);var geo=geoFor(f,f.getComandante(),departure);
   if(!geo.ordinary()&&!coveredByException(f,f.getComandante(),departure))throw new ApiException(HttpStatus.CONFLICT,"COMMANDER_OUTSIDE_DEPARTURE_JURISDICTION","El aeropuerto de salida "+origin.getNombre()+" está en "+departure.province()+" y usted figura en otra jurisdicción: "+geo.message()+". La modificación del aeropuerto requiere volver a verificar la elegibilidad del comandante: solicite a Centro de Operaciones que lo reasigne o autorice una excepción geográfica.",Map.of("tipo",geo.code(),"provinciaSalida",departure.province(),"comandanteId",f.getComandante().getId()));
  }else if(f.getAircraft()!=null&&!origin.getId().equals(f.getAircraft().getAeropuertoActual().getId()))throw bad("El origen debe coincidir con la ubicación actual de la aeronave");
  String before=airportsJson(f);
  boolean changedProposal=(f.getOrigen()!=null&&Flight.PROPOSED.equals(f.getEstadoAeropuertoOrigen())&&!f.getOrigen().getId().equals(origin.getId()))||(f.getDestino()!=null&&Flight.PROPOSED.equals(f.getEstadoAeropuertoDestino())&&!f.getDestino().getId().equals(destination.getId()));
  f.setOrigen(origin);f.setDestino(destination);f.setEstadoAeropuertoOrigen(Flight.CONFIRMED);f.setEstadoAeropuertoDestino(Flight.CONFIRMED);f.setAeropuertosFijadosPor(actor);f.setAeropuertosFijadosEn(LocalDateTime.now(clock));f.setFechaPlanificadaLlegada(req.llegada());
  assertNoOverlap(f);assertCrewNoOverlap(f);if(s!=null)recordGeography(f,actor,f.getComandante(),null);routeReview.reassess(f,actor);
  AuditEvent event=audit.record(f,actor,"FLIGHT",f.getId(),"OPERATIONAL_PLANNING",before,airportsJson(f).replaceFirst("\\}$",",\"llegada\":"+json(req.llegada().toString())+",\"justificacion\":"+json(reason)+"}"));
  if(changedProposal&&event!=null)notifyOps(f,"AIRPORTS_CHANGED_BY_COMMANDER","El comandante cambió los aeropuertos propuestos para "+f.getCodigo()+": salida "+origin.getNombre()+", llegada "+destination.getNombre()+".","AIRPORTS_CHANGED_BY_COMMANDER:"+event.getId());
  return view(f);
 }
 @Transactional public FlightView start(Long id,Long actor){Flight f=locked(id);requireOperations(actor);requireOperationalStatus(f,"PLANIFICADO");if(f.getAircraft()==null||f.getOrigen()==null||f.getDestino()==null||f.getFechaPlanificadaSalida()==null||f.getFechaPlanificadaLlegada()==null)throw bad("Faltan datos de planificación operativa");if(f.getComandante()==null)throw bad("El vuelo no tiene comandante asignado");if((f.getSanitario()!=null||sanitaryFlights.findByFlightId(f.getId()).isPresent())&&(!f.origenConfirmado()||!f.destinoConfirmado()))throw new ApiException(HttpStatus.CONFLICT,"AEROPUERTOS_SIN_CONFIRMAR","Los aeropuertos de salida y llegada deben estar confirmados por el comandante antes de iniciar el vuelo",Map.of());commanderAccess.requireOperationalAccess(f.getComandante().getId());assertCurrentCrew(f);Aircraft plane=activeAircraft(f.getAircraft().getId());if(!plane.getAeropuertoActual().getId().equals(f.getOrigen().getId()))throw new ApiException(HttpStatus.CONFLICT,"La aeronave ya no se encuentra en el aeropuerto de origen planificado");routeReview.requireApprovedForStart(f);f.setFechaSalidaReal(LocalDateTime.now(clock));f.setEstadoVuelo(status("EN_CURSO"));flightLog.automatic(f,user(actor),"INICIO","Inicio efectivo del vuelo");audit.record(f,user(actor),"FLIGHT",f.getId(),"START","{\"estado\":\"PLANIFICADO\"}","{\"estado\":\"EN_CURSO\",\"salidaReal\":"+json(f.getFechaSalidaReal().toString())+"}");return view(f);}
 /** El vuelo ya está bloqueado. Las filas de usuario se bloquean en el mismo orden que al asignar la tripulación. */
 private void assertCurrentCrew(Flight f){
  Map<Long,String> assigned=new TreeMap<>();assigned.put(f.getComandante().getId(),"COMANDANTE");
  for(FlightCrew c:crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f.getId()))if(!"COMANDANTE".equals(c.getCrewRole().getCodigo()))assigned.put(c.getUser().getId(),c.getCrewRole().getCodigo());
  for(Long id:assigned.keySet())users.lockById(id).orElseThrow(()->notFound("Usuario"));
  for(var entry:assigned.entrySet()){
   User member=user(entry.getKey());String role=entry.getValue();
   var result=crewManagement.evaluate(f,member,role,true);
   if(!result.eligible())throw result.conflict(member.getId(),role);
  }
 }
 /** El inicio rechazado por la ruta revirtió su transacción; el rechazo se registra en una propia. */
 @Transactional public void auditRejectedRouteStart(Long id,Long actor,String code,String message){routeReview.auditRejectedStart(id,actor,code,message);}
 @Transactional public void auditRejectedStart(Long id,Long actor,String code,Map<String,Object> details){
  Flight f=flights.findById(id).orElseThrow(()->notFound("Vuelo"));requireOperations(actor);
  audit.record(f,user(actor),"FLIGHT",id,"START_REJECTED_ELIGIBILITY",null,"{\"code\":"+json(code)+",\"userId\":"+details.get("userId")+",\"crewRoleCode\":"+json(String.valueOf(details.get("crewRoleCode")))+"}");
 }
 @Transactional public FlightView finish(Long id,Long actorId){Flight f=locked(id);requireOperations(actorId);requireOperationalStatus(f,"EN_CURSO");if(f.getAircraft()==null||f.getDestino()==null)throw bad("Faltan datos de planificación operativa");Aircraft plane=aircraft.lockById(f.getAircraft().getId()).orElseThrow(()->notFound("Aeronave"));if(!Boolean.TRUE.equals(plane.getActivo())||plane.getAeropuertoActual()==null)throw bad("La aeronave no está activa o no tiene ubicación");airportLocks.lockAll(f.getDestino().getId());Airport before=plane.getAeropuertoActual();plane.setAeropuertoActual(f.getDestino());relocateAfterFinish(f,user(actorId));f.setFechaLlegadaReal(LocalDateTime.now(clock));f.setEstadoVuelo(status("FINALIZADO"));User actor=user(actorId);reportWorkflow.createObligationAfterFinish(f,actor);flightLog.automatic(f,actor,"FINALIZACION","Finalización efectiva del vuelo");audit.record(f,actor,"FLIGHT",f.getId(),"FINISH","{\"estado\":\"EN_CURSO\"}","{\"estado\":\"FINALIZADO\",\"llegadaReal\":"+json(f.getFechaLlegadaReal().toString())+"}");audit.record(f,actor,"AIRCRAFT",plane.getId(),"UPDATE_LOCATION_AFTER_FINISH","{\"aeropuertoActualId\":"+json(before.getId().toString())+"}","{\"aeropuertoActualId\":"+json(f.getDestino().getId().toString())+"}");return view(f);}
 /** Cancelación antes de la ejecución: Operaciones en cualquier vuelo; el DTS sólo su propia solicitud. El comandante rechaza asignaciones, no cancela vuelos. */
 @Transactional public FlightView cancel(Long id,Cancel req,Long actorId){
  Flight f=locked(id);User actor=user(actorId);SanitaryFlight s=sanitaryFlights.findByFlightId(f.getId()).orElse(null);
  if(!hasOperationsRole(actor)&&(s==null||!hasRole(actor,"DTS")||!s.getSolicitadoPor().getId().equals(actorId)))throw forbidden("Sólo Operaciones, o el DTS solicitante de su propia solicitud, pueden cancelar un vuelo");
  String flightState=f.getEstadoVuelo()==null?null:f.getEstadoVuelo().getCodigo();
  if(s!=null&&s.getEstadoSolicitud()!=null&&"RECHAZADO".equals(s.getEstadoSolicitud().getCodigo()))throw bad("Una solicitud rechazada no puede cancelarse: el rechazo es definitivo");
  boolean cancellable=s!=null?Set.of("SOLICITADO","PENDIENTE_RESPUESTA_DTS","APROBADO").contains(s.getEstadoSolicitud().getCodigo())&&(flightState==null||"PLANIFICADO".equals(flightState)):flightState!=null&&Set.of("PENDIENTE_CONFIRMACION_COMANDANTE","PENDIENTE_RESPUESTA_OPERACIONES","PENDIENTE_REPLANIFICACION","PLANIFICADO").contains(flightState);
  if(!cancellable)throw bad("El vuelo no puede cancelarse en su estado actual");
  String label=cancellationLabel(req);String before="{\"estado\":"+json(flightState!=null?flightState:s==null?null:s.getEstadoSolicitud().getCodigo())+"}";
  Set<Long> released=crewIds(f);cancelFlight(f,s,actor,req,before);
  itinerary.revalidate(released,actor);
  Map<Long,User> recipients=new LinkedHashMap<>();if(s!=null)recipients.put(s.getSolicitadoPor().getId(),s.getSolicitadoPor());if(f.getComandante()!=null&&flightState!=null)recipients.put(f.getComandante().getId(),f.getComandante());for(FlightCrew c:crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f.getId()))recipients.putIfAbsent(c.getUser().getId(),c.getUser());recipients.remove(actorId);
  for(User u:recipients.values())notifications.createOnce(u,f,"FLIGHT_CANCELLED","El vuelo "+f.getCodigo()+" fue cancelado: "+label,"FLIGHT_CANCELLED:"+f.getId());
  if(!hasOperationsRole(actor))notifyOps(f,"FLIGHT_CANCELLED","El DTS canceló la solicitud "+f.getCodigo()+": "+label,"FLIGHT_CANCELLED:"+f.getId());
  return view(f);
 }
 @Transactional public WeatherView registerWeather(Long id,Weather req,Long actor){Flight f=locked(id);requireActiveCommander(f,actor);requireOperationalStatus(f,"PLANIFICADO");WeatherSnapshot w=new WeatherSnapshot();w.setFlight(f);w.setRegistradoPor(user(actor));w.setCondiciones(required(req.condiciones(),"Las condiciones meteorológicas son obligatorias"));w.setFavorable(req.favorable());w.setObservaciones(blank(req.observaciones()));weather.saveAndFlush(w);audit.record(f,w.getRegistradoPor(),"WEATHER",w.getId(),"CREATE",null,null);return weatherView(w);}
 @Transactional(readOnly=true) public List<WeatherView> weatherHistory(Long id,Long actor){Flight f=flights.findById(id).orElseThrow(()->notFound("Vuelo"));access.mayRead(f,actor);return weather.findByFlightIdOrderByFechaRegistroDescIdDesc(id).stream().map(this::weatherView).toList();}
 @Transactional(readOnly=true) public List<CrewView> crew(Long id,Long actor){return crew(id,actor,false);}
 /** history=true agrega las asignaciones dadas de baja (retiros, reemplazos y cambios de comandante), que se conservan como historial. */
 @Transactional(readOnly=true) public List<CrewView> crew(Long id,Long actor,boolean history){Flight f=flights.findById(id).orElseThrow(()->notFound("Vuelo"));User u=user(actor);boolean operations=hasOperationsRole(u);if(!operations)requireCommander(f,actor);return (history?crews.findByFlightIdOrderByIdAsc(id):crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(id)).stream().map(c->{
  boolean commander=c.isVigente()&&f.getComandante()!=null&&f.getComandante().getId().equals(c.getUser().getId());
  boolean inspect=c.isVigente()&&(f.getEstadoVuelo()==null||!FlightStates.TERMINAL.contains(f.getEstadoVuelo().getCodigo()));
  CrewManagementService.Eligibility status=inspect&& (operations||commander||c.getUser().getId().equals(actor))?withItinerary(f,c.getUser(),crewManagement.evaluate(f,c.getUser(),c.getCrewRole().getCodigo(),false)):null;
  return new CrewView(c.getId(),c.getUser().getId(),c.getUser().getUsername(),c.getUser().getPerson().getNombre(),c.getUser().getPerson().getApellido(),c.getCrewRole().getCodigo(),c.getCrewRole().getNombre(),commander,c.isVigente(),c.getCreatedAt(),c.getAsignadoPor()==null?null:c.getAsignadoPor().getUsername(),c.getFechaBaja(),c.getBajaPor()==null?null:c.getBajaPor().getUsername(),c.getMotivoBaja(),status==null?null:status.code(),status==null?null:status.message());}).toList();}
 /** Una persona apta sigue marcada para revisión si, según su itinerario, ya no estará en la jurisdicción del aeropuerto de salida (y ninguna excepción lo cubre). No modifica la asignación. */
 private CrewManagementService.Eligibility withItinerary(Flight f,User u,CrewManagementService.Eligibility base){
  if(base==null||!base.eligible()||f.getOrigen()==null||f.getFechaPlanificadaSalida()==null||f.getOrigen().getProvinciaReferencial()==null)return base;
  var dep=confirmedDeparture(f.getOrigen());var geo=geoFor(f,u,dep);
  if(geo.ordinary()||coveredByException(f,u,dep,CrewItineraryService.functionIn(f,u.getId())))return base;
  return new CrewManagementService.Eligibility(false,"ITINERARIO_INCOHERENTE",geo.message()+": revise la asignación");
 }
 private Set<Long> crewIds(Flight f){Set<Long> ids=new TreeSet<>();if(f.getComandante()!=null)ids.add(f.getComandante().getId());for(FlightCrew c:crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f.getId()))ids.add(c.getUser().getId());return ids;}
 /** Tras terminar un vuelo, el comandante y el copiloto quedan ubicados en la jurisdicción del aeropuerto de llegada (ubicación real, con su auditoría). */
 private void relocateAfterFinish(Flight f,User actor){
  Map<Long,User> people=new LinkedHashMap<>();if(f.getComandante()!=null)people.put(f.getComandante().getId(),f.getComandante());
  for(FlightCrew c:crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f.getId()))if("COPILOTO".equals(c.getCrewRole().getCodigo()))people.putIfAbsent(c.getUser().getId(),c.getUser());
  Province arrival=f.getDestino().getProvinciaReferencial();
  for(User u:people.values()){
   CommanderProfile profile=u.getPerson().getCommanderProfile();if(profile==null)continue;
   String before=profile.getProvinciaActual()==null?null:profile.getProvinciaActual().getNombre();
   profile.setProvinciaActual(arrival);profile.setUbicacionActualizadaEn(LocalDateTime.now(clock));profile.setUbicacionActualizadaPor(actor);
   audit.record(f,actor,"COMMANDER_PROFILE",u.getPerson().getId(),"UPDATE_LOCATION_AFTER_FINISH","{\"provincia\":"+json(before)+"}","{\"provincia\":"+json(arrival==null?null:arrival.getNombre())+"}");
  }
 }
 private void assertCommanderInProvince(User commander,LocalDateTime departure,Airport origin,Long excludeFlight){
  var pos=itinerary.positionAt(commander,departure,excludeFlight);
  if(pos.provinceId()==null||!pos.provinceId().equals(origin.getProvinciaReferencial().getId()))throw bad("El comandante debe encontrarse en la provincia de origen"+(pos.projected()?" (según su itinerario estará en "+pos.provinceName()+" al terminar el vuelo "+pos.afterFlight()+")":""));
 }
 /**
  * Asigna al copiloto: un usuario COMANDANTE distinto del comandante principal. La elegibilidad (cuenta, perfil, disponibilidad horaria) se verifica antes que la geográfica, que es la misma del
  * comandante: jurisdicción del aeropuerto de salida según la ubicación prevista por el itinerario, con la excepción justificada de Centro de Operaciones. No crea ningún rol ni cuenta nueva.
  */
 @Transactional(isolation=Isolation.SERIALIZABLE) public void assignCopilot(Long id,Crew req,Long actorId){
  requireCopilotRole(req);Flight f=locked(id);requireOperations(actorId);User actor=user(actorId);SanitaryFlight s=sanitaryFlights.findByFlightId(f.getId()).orElse(null);if(s!=null)requireAssignableSanitary(f,s);
  User copilot=eligibleCopilot(f,req.userId());
  CommanderGeographicException exception=decideGeography(f,s,copilot,req.excepcionGeografica(),actor,CommanderGeographicException.FUNCTION_COPILOT);
  crewManagement.assign(id,new Crew(req.userId(),"COPILOTO"),actorId);
  recordGeography(f,actor,copilot,exception,CommanderGeographicException.FUNCTION_COPILOT);
  itinerary.revalidate(List.of(copilot.getId()),actor);
 }
 /** Sustituye al copiloto de la asignación indicada por otro usuario COMANDANTE (o actualiza su excepción), con las mismas reglas que la asignación. */
 @Transactional(isolation=Isolation.SERIALIZABLE) public void replaceCopilot(Long id,Long crewId,Crew req,Long actorId){
  requireCopilotRole(req);Flight f=locked(id);requireOperations(actorId);User actor=user(actorId);SanitaryFlight s=sanitaryFlights.findByFlightId(f.getId()).orElse(null);if(s!=null)requireAssignableSanitary(f,s);
  FlightCrew old=crews.findById(crewId).filter(x->x.getFlight().getId().equals(id)).orElseThrow(()->bad("Asignación inexistente"));
  if(!"COPILOTO".equals(old.getCrewRole().getCodigo()))throw bad("Sólo el copiloto se sustituye por este medio; el comandante se cambia mediante recursos");
  User copilot=eligibleCopilot(f,req.userId());
  CommanderGeographicException exception=decideGeography(f,s,copilot,req.excepcionGeografica(),actor,CommanderGeographicException.FUNCTION_COPILOT);
  Long previous=old.getUser().getId();
  crewManagement.replace(id,crewId,new Crew(req.userId(),"COPILOTO"),actorId);
  if(!previous.equals(copilot.getId()))closeExceptions(f,previous,CommanderGeographicException.FUNCTION_COPILOT);
  recordGeography(f,actor,copilot,exception,CommanderGeographicException.FUNCTION_COPILOT);
  itinerary.revalidate(List.of(previous,copilot.getId()),actor);
 }
 /** Sólo el copiloto se asigna como tripulación con cuenta (junto al comandante): médicos y enfermeros son registros del DTS sin cuenta y se asignan por el catálogo sanitario. */
 private void requireCopilotRole(Crew req){if(!"COPILOTO".equals(req.crewRoleCode()))throw bad("Sólo el copiloto se asigna como tripulación con cuenta; el personal sanitario lo asigna el DTS");}
 private User eligibleCopilot(Flight f,Long userId){
  users.lockById(userId);User u=user(userId);
  if(f.getComandante()!=null&&f.getComandante().getId().equals(userId))throw new ApiException(HttpStatus.CONFLICT,"COPILOT_IS_COMMANDER","El comandante principal del vuelo no puede ser también su copiloto",Map.of("userId",userId));
  var result=crewManagement.evaluate(f,u,"COPILOTO",true);if(!result.eligible())throw result.conflict(userId,"COPILOTO");
  return u;
 }
 @Transactional public void removeCrew(Long id,Long crewId,Long actor){
  requireOperations(actor);FlightCrew row=crews.findById(crewId).filter(x->x.getFlight().getId().equals(id)).orElse(null);
  crewManagement.remove(id,crewId,actor);
  if(row!=null&&"COPILOTO".equals(row.getCrewRole().getCodigo())){closeExceptions(row.getFlight(),row.getUser().getId(),CommanderGeographicException.FUNCTION_COPILOT);itinerary.revalidate(List.of(row.getUser().getId()),user(actor));}
 }

 @Transactional(readOnly=true) public FlightDetailView get(Long id,Long actor){Flight f=flights.findById(id).orElseThrow(()->notFound("Vuelo"));access.mayRead(f,actor);return detail(f);}
 /** Orden de atención: solicitudes de extrema urgencia abiertas primero (por horario límite), luego el resto, más recientes primero. */
 @Transactional(readOnly=true) public List<FlightView> list(Long actor){User u=user(actor);List<Flight> rows=new ArrayList<>(hasOperationsOrAdmin(u)?flights.findAll():hasRole(u,"COMANDANTE")?flights.findByComandanteId(actor).stream().filter(x->x.getEstadoVuelo()!=null).toList():flights.findSanitaryBySolicitadoPorId(actor));List<FlightView> views=rows.stream().map(this::view).collect(java.util.stream.Collectors.toCollection(ArrayList::new));views.sort(Comparator.comparing((FlightView v)->openUrgent(v)?0:1).thenComparing((FlightView v)->openUrgent(v)&&v.datosSanitarios().fechaLimiteTraslado()!=null?v.datosSanitarios().fechaLimiteTraslado():LocalDateTime.MAX).thenComparing(FlightView::id,Comparator.reverseOrder()));return views;}
 private boolean openUrgent(FlightView v){return v.datosSanitarios()!=null&&v.datosSanitarios().extremaUrgencia()&&Set.of("SOLICITADO","PENDIENTE_RESPUESTA_DTS","APROBADO").contains(v.datosSanitarios().estadoSolicitud())&&(v.estadoVuelo()==null||"PLANIFICADO".equals(v.estadoVuelo()));}

 private void fixSanitarySchedule(Flight f,SanitaryFlight s,LocalDateTime departure,String event,String reason,User actor,FlightScheduleNegotiation answers){validateSanitaryHour(s,departure);if(event.startsWith("CO_")){s.setEvaluadoPor(actor);s.setFechaEvaluacion(LocalDateTime.now(clock));}s.setEstadoSolicitud(sanitaryStatus("APROBADO"));f.setFechaPlanificadaSalida(departure);routeReview.reassess(f,actor);negotiation(f,event,departure,null,reason,actor,answers);}
 private void rejectSanitary(Flight f,SanitaryFlight s,User actor,String event,Cancel req){String label=cancellationLabel(req);s.setEvaluadoPor(actor);s.setFechaEvaluacion(LocalDateTime.now(clock));s.setMotivoRechazo(label);s.setEstadoSolicitud(sanitaryStatus("RECHAZADO"));negotiation(f,event,null,null,label,actor,lastOrNull(f,"DTS_PROPUESTA"));}
 private void validateSanitaryHour(SanitaryFlight s,LocalDateTime hour){if(hour==null)throw bad("La fecha propuesta es obligatoria");if(Boolean.TRUE.equals(s.getExtremaUrgencia())&&hour.isAfter(s.getFechaLimiteTraslado()))throw bad("La propuesta supera el límite de extrema urgencia");}
 /** Deja al comandante como único integrante vigente con la función COMANDANTE; el comandante anterior (o una función previa de la misma persona) se da de baja y se conserva en el historial. */
 private void ensureCommanderCrew(Flight f,User commander,User actor){
  CrewRole role=crewRoles.findByCodigo("COMANDANTE").orElseThrow(()->bad("Rol COMANDANTE inexistente"));FlightCrew current=null;
  for(FlightCrew c:crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f.getId())){
   boolean sameUser=c.getUser().getId().equals(commander.getId());
   if(sameUser&&"COMANDANTE".equals(c.getCrewRole().getCodigo())){current=c;continue;}
   if(sameUser||"COMANDANTE".equals(c.getCrewRole().getCodigo())){
    String before="{\"userId\":"+c.getUser().getId()+",\"crewRoleCode\":"+json(c.getCrewRole().getCodigo())+"}";
    c.darDeBaja(LocalDateTime.now(clock),actor,sameUser?FlightCrew.BAJA_REEMPLAZO:FlightCrew.BAJA_CAMBIO_COMANDANTE);crews.saveAndFlush(c);
    audit.record(f,actor,"FLIGHT_CREW",c.getId(),"REMOVE",before,"{\"userId\":"+c.getUser().getId()+",\"crewRoleCode\":"+json(c.getCrewRole().getCodigo())+",\"motivoBaja\":"+json(c.getMotivoBaja())+"}");
   }
  }
  if(current==null){current=new FlightCrew();current.setFlight(f);current.setUser(commander);current.setCrewRole(role);current.setAsignadoPor(actor);crews.saveAndFlush(current);audit.record(f,actor,"FLIGHT_CREW",current.getId(),"CREATE",null,"{\"userId\":"+commander.getId()+",\"crewRoleCode\":\"COMANDANTE\"}");}
 }
 private void assertCrewNoOverlap(Flight f){
  Map<Long,String> assigned=new TreeMap<>();if(f.getComandante()!=null)assigned.put(f.getComandante().getId(),"COMANDANTE");
  if(f.getId()!=null)for(FlightCrew c:crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f.getId()))if(!"COMANDANTE".equals(c.getCrewRole().getCodigo()))assigned.put(c.getUser().getId(),c.getCrewRole().getCodigo());
  for(Long id:assigned.keySet())users.lockById(id).orElseThrow(()->notFound("Usuario"));
  for(var member:assigned.entrySet()){
   var result=crewManagement.evaluate(f,user(member.getKey()),member.getValue(),true);
   if(!result.eligible())throw result.conflict(member.getKey(),member.getValue());
  }
 }
 private void checkCrewConflict(Flight f,Flight other){if(Objects.equals(f.getId(),other.getId())||other.getEstadoVuelo()!=null&&Set.of("FINALIZADO","COMPLETADO","CANCELADO","RECHAZADO").contains(other.getEstadoVuelo().getCodigo()))return;if(f.getFechaPlanificadaSalida()==null||f.getFechaPlanificadaLlegada()==null||other.getFechaPlanificadaSalida()==null||other.getFechaPlanificadaLlegada()==null||!f.getFechaPlanificadaLlegada().isAfter(f.getFechaPlanificadaSalida())||!other.getFechaPlanificadaLlegada().isAfter(other.getFechaPlanificadaSalida())||f.getFechaPlanificadaSalida().isBefore(other.getFechaPlanificadaLlegada())&&other.getFechaPlanificadaSalida().isBefore(f.getFechaPlanificadaLlegada()))throw new ApiException(HttpStatus.CONFLICT,"El tripulante tiene otro compromiso incompatible o sin horario completo");}
 private void assertNoOverlap(Flight f){if(f.getAircraft()==null||f.getComandante()==null||f.getFechaPlanificadaSalida()==null||f.getFechaPlanificadaLlegada()==null)return;boolean conflict=flights.overlappingAircraft(f.getAircraft().getId(),f.getFechaPlanificadaSalida(),f.getFechaPlanificadaLlegada()).stream().anyMatch(x->!x.getId().equals(f.getId()))||flights.overlappingCommander(f.getComandante().getId(),f.getFechaPlanificadaSalida(),f.getFechaPlanificadaLlegada()).stream().anyMatch(x->!x.getId().equals(f.getId()));if(conflict)throw new ApiException(HttpStatus.CONFLICT,"Existe una asignación con horario incompatible");}
 private FlightScheduleNegotiation negotiation(Flight f,String type,LocalDateTime time,String reason,User actor){return negotiation(f,type,time,null,reason,actor,null);} private FlightScheduleNegotiation negotiation(Flight f,String type,LocalDateTime departure,LocalDateTime arrival,String reason,User actor,FlightScheduleNegotiation answers){FlightScheduleNegotiation n=new FlightScheduleNegotiation();n.setFlight(f);n.setTipo(type);n.setFechaHoraPropuesta(departure);n.setFechaHoraLlegadaPropuesta(arrival);n.setMotivo(reason);n.setActor(actor);n.setRespondida(answers);n.setFechaOcurrencia(LocalDateTime.now(clock));return negotiations.saveAndFlush(n);} private FlightScheduleNegotiation lastOrNull(Flight f,String type){return negotiations.findByFlightIdOrderByFechaOcurrenciaAscIdAsc(f.getId()).stream().filter(n->type.equals(n.getTipo())).reduce((a,b)->b).orElse(null);} private FlightScheduleNegotiation last(Flight f,String type){FlightScheduleNegotiation n=lastOrNull(f,type);if(n==null)throw bad("No existe propuesta pendiente");return n;}
 /** La propuesta vigente es la última del tipo y todavía sin respuesta; si el interesado respondió a otra (reemplazada o ya respondida) la respuesta es obsoleta. */
 private FlightScheduleNegotiation openProposal(Flight f,String type){FlightScheduleNegotiation n=lastOrNull(f,type);return n==null||negotiations.existsByRespondidaId(n.getId())?null:n;}
 private FlightScheduleNegotiation requireCurrentProposal(Flight f,String type,Long proposalId){FlightScheduleNegotiation n=openProposal(f,type);if(n==null)throw new ApiException(HttpStatus.CONFLICT,"No hay una propuesta pendiente de respuesta");if(proposalId==null||!n.getId().equals(proposalId))throw new ApiException(HttpStatus.CONFLICT,"La propuesta ya no está vigente: fue reemplazada o respondida. Actualice la ficha para ver la propuesta actual");return n;}
 private void requireFuture(LocalDateTime t,String message){if(t==null||!t.isAfter(LocalDateTime.now(clock)))throw bad(message);}
 private void validateMedical(Medical m){if(m==null||m.diagnostico()==null||m.diagnostico().isBlank()||m.condicionMedica()==null||m.condicionMedica().isBlank())throw bad("La información sanitaria (diagnóstico y condición médica) es obligatoria");}
 private List<User> opsPreferred(Flight f){SanitaryFlight s=sanitaryFlights.findByFlightId(f.getId()).orElse(null);User u=s!=null?s.getEvaluadoPor():f.getCreadoPor();return u==null?List.of():List.of(u);}
 /** Avisos de gestión: al responsable (evaluador de la solicitud o creador del vuelo operativo) y, si no hay uno elegible, a la cola compartida de Operaciones. */
 private void notifyOps(Flight f,String type,String text,String key){notifications.createOncePreferred(f,type,text,key,opsPreferred(f),"OPERACIONES","CENTRO_OPERACIONES");}
 private void notifyRequester(SanitaryFlight s,Flight f,String type,String text,String key){notifications.createOnce(s.getSolicitadoPor(),f,type,text,key);}
 /** Cancelación común: primero la solicitud (el trigger SQL exige ese orden), luego el vuelo. Los recursos quedan libres porque CANCELADO no cuenta en las validaciones de disponibilidad; se audita qué se liberó. */
 private void cancelFlight(Flight f,SanitaryFlight s,User actor,Cancel req,String before){
  cancellationReason(req);if(s!=null){s.setEstadoSolicitud(sanitaryStatus("CANCELADO"));sanitaryFlights.saveAndFlush(s);}setCancellation(f,req);
  f.setFechaCancelacion(LocalDateTime.now(clock));f.setCanceladoPor(actor);f.setEstadoVuelo(status("CANCELADO"));
  flightLog.automatic(f,actor,"CANCELACION","Cancelación del vuelo");
  audit.record(f,actor,"FLIGHT",f.getId(),"CANCEL",before,"{\"motivo\":"+json(cancellationLabel(f))+",\"recursosLiberados\":{\"aeronaveId\":"+(f.getAircraft()==null?"null":f.getAircraft().getId())+",\"comandanteId\":"+(f.getComandante()==null?"null":f.getComandante().getId())+",\"tripulantesLiberados\":"+releasedCrewIds(f)+"}}");
 }
 /** La tripulación no se borra al cancelar: el estado CANCELADO no cuenta en la disponibilidad, por lo que las personas quedan libres y su participación se conserva. */
 private String releasedCrewIds(Flight f){return crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f.getId()).stream().filter(c->f.getComandante()==null||!c.getUser().getId().equals(f.getComandante().getId())).map(c->c.getUser().getId().toString()).collect(java.util.stream.Collectors.joining(",","[","]"));}
 private SanitaryFlight sanitary(Flight f){return sanitaryFlights.findByFlightId(f.getId()).orElseThrow(()->bad("El vuelo no posee solicitud sanitaria"));}
 private void setCancellation(Flight f,Cancel req){CancellationReason r=cancellationReason(req);f.setMotivoCancelacion(r);f.setMotivoCancelacionPersonalizado(blank(req.motivoCancelacionPersonalizado()));} private CancellationReason cancellationReason(Cancel req){CancellationReason r=cancellationReasons.findByIdAndActivoTrue(req.motivoCancelacionId()).orElseThrow(()->bad("Seleccione un motivo de cancelación válido"));String custom=blank(req.motivoCancelacionPersonalizado());if("OTRO".equals(r.getCodigo())&&custom==null)throw bad("Especifique el motivo personalizado");if(!"OTRO".equals(r.getCodigo())&&custom!=null)throw bad("El motivo personalizado sólo se permite para OTRO");return r;} private String cancellationLabel(Cancel req){CancellationReason r=cancellationReason(req);String custom=blank(req.motivoCancelacionPersonalizado());return "OTRO".equals(r.getCodigo())?custom:r.getNombre();} private String cancellationLabel(Flight f){return "OTRO".equals(f.getMotivoCancelacion().getCodigo())?f.getMotivoCancelacionPersonalizado():f.getMotivoCancelacion().getNombre();}private String cancellationAudit(Flight f){return "{\"motivo\":"+json(cancellationLabel(f))+"}";}
 private Aircraft activeAircraft(Long id){Aircraft a=aircraft.lockById(id).orElseThrow(()->notFound("Aeronave"));if(!Boolean.TRUE.equals(a.getActivo())||a.getAeropuertoActual()==null)throw bad("La aeronave no está activa o no tiene ubicación");if(!flights.activeAircraftAssignments(a.getId(),List.of("EN_CURSO")).isEmpty())throw new ApiException(HttpStatus.CONFLICT,"La aeronave seleccionada se encuentra en vuelo");return a;} /** Clasificación como COMANDANTE y habilitación verificada y vigente: la misma evaluación que la tripulación, el panel de disponibilidad y el inicio (no hay una segunda regla). La disponibilidad horaria la comprueba assertCrewNoOverlap. */
private void assertCommanderEligible(Flight f,User commander,java.time.LocalDate on,Aircraft aircraft){var result=crewManagement.evaluate(f,commander,"COMANDANTE",false);if(!result.eligible())throw result.conflict(commander.getId(),"COMANDANTE");}private User eligibleCommander(Long id){users.lockById(id);User u=user(id);CommanderProfile p=u.getPerson().getCommanderProfile();if(!Boolean.TRUE.equals(u.getActivo())||!"ACTIVO".equals(u.getEstadoCuenta()))throw bad("El comandante debe tener una cuenta activa");if(!hasRole(u,"COMANDANTE")||p==null||p.getLicenseNumber()==null||p.getLicenseNumber().isBlank())throw bad("El comandante debe tener licencia registrada");if(commanderAccess.isBlocked(u.getId()))throw new ApiException(HttpStatus.CONFLICT,"El comandante tiene informes finales vencidos y no puede recibir nuevas asignaciones");return u;}
 /** La solicitud pasa a referenciar las localidades: se bloquean (en orden de id) antes de leer su estado, como la baja administrativa lo hace antes de contar solicitudes abiertas. */
private void lockLocalities(Long... ids){Arrays.stream(ids).filter(Objects::nonNull).distinct().sorted().forEach(localities::lockById);}private Locality locality(Long id,String label){return localities.findByIdAndActivoTrue(id).orElseThrow(()->bad("Seleccione una localidad de "+label+" válida."));}private Airport activeAirport(Long id,String label){Airport a=airports.findById(id).orElseThrow(()->notFound("Aeropuerto "+label));if(!Boolean.TRUE.equals(a.getActivo()))throw bad("El aeropuerto "+label+" debe estar activo");if(a.getProvinciaReferencial()==null)throw airportProvinceUnknown(a);return a;}private Long provinceId(Airport a){return a.getProvinciaReferencial().getId();}
 private FlightType type(String code){return types.findByCodigoAndActivoTrue(code).orElseThrow(()->types.findByCodigo(code).isPresent()?new ApiException(HttpStatus.CONFLICT,"TIPO_VUELO_INACTIVO","El tipo de vuelo está inactivo y no puede usarse en vuelos nuevos",Map.of()):new ApiException(HttpStatus.BAD_REQUEST,"TIPO_VUELO_INEXISTENTE","Tipo de vuelo inexistente",Map.of()));}private SanitaryRequestStatus sanitaryStatus(String code){return sanitaryStatuses.findByCodigo(code).orElseThrow(()->new IllegalStateException("Catálogo sanitario incompleto"));}private FlightStatus status(String code){return statuses.findByCodigo(code).orElseThrow(()->new IllegalStateException("Catálogo operativo incompleto"));}private FlightPriority priority(String code){return priorities.findByCodigoAndActivoTrue(code).orElseThrow(()->bad("Prioridad inexistente"));}
 private void requireSanitaryStatus(SanitaryFlight s,String code){if(!code.equals(s.getEstadoSolicitud().getCodigo()))throw bad("Transición sanitaria no permitida desde "+s.getEstadoSolicitud().getCodigo());}private void requireOperationalStatus(Flight f,String code){if(f.getEstadoVuelo()==null||!code.equals(f.getEstadoVuelo().getCodigo()))throw bad("Transición operativa no permitida");}/** Operaciones del comandante asignado: se rechazan mientras tenga informes finales vencidos. */ private void requireActiveCommander(Flight f,Long id){requireCommander(f,id);commanderAccess.requireOperationalAccess(id);}private void requireCommander(Flight f,Long id){if(f.getComandante()==null||!f.getComandante().getId().equals(id))throw forbidden("Sólo el comandante asignado puede realizar esta operación");}private void requireOperations(Long id){if(!hasOperationsRole(user(id)))throw forbidden("Sólo Centro de Operaciones puede ejecutar esta transición");}private void requireOperationsOrAdmin(User u){if(!hasOperationsOrAdmin(u))throw forbidden("Sólo Operaciones o Administrador puede crear este vuelo");}private void requireRole(User u,String code){if(!hasRole(u,code))throw forbidden("Rol no autorizado");}
 private boolean hasRole(User u,String code){return users.findWithRolesByUsername(u.getUsername()).orElseThrow().getUserRoles().stream().anyMatch(x->code.equals(x.getRole().getCodigo()));}private boolean hasOperationsRole(User u){return hasRole(u,"OPERACIONES")||hasRole(u,"CENTRO_OPERACIONES");}private boolean hasOperationsOrAdmin(User u){return hasOperationsRole(u)||hasRole(u,"ADMINISTRADOR");}private void notifyOperations(Flight f,String type,String text){Map<Long,User> recipients=new LinkedHashMap<>();for(String role:List.of("OPERACIONES","CENTRO_OPERACIONES"))for(User u:users.findActiveByRoleCode(role))recipients.putIfAbsent(u.getId(),u);for(User u:recipients.values())notifications.create(u,f,type,text);}
 private User user(Long id){return users.findById(id).orElseThrow(()->notFound("Usuario"));}private Flight locked(Long id){return flights.lockById(id).orElseThrow(()->notFound("Vuelo"));}private String code(){return "V-"+java.util.UUID.randomUUID().toString().substring(0,8).toUpperCase();}private String required(String value,String message){if(value==null||value.isBlank())throw bad(message);return value.trim();}private String blank(String value){return value==null||value.isBlank()?null:value.trim();}private String cancellationReason(NegotiationResponse r){return r.motivoCancelacionPersonalizado()==null?"Propuesta rechazada":r.motivoCancelacionPersonalizado();}private ApiException bad(String x){return new ApiException(HttpStatus.BAD_REQUEST,x);}private ApiException forbidden(String x){return new ApiException(HttpStatus.FORBIDDEN,x);}private ApiException notFound(String x){return new ApiException(HttpStatus.NOT_FOUND,x+" inexistente");}private String json(String x){return x==null?"null":"\""+x.replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\r","\\r").replace("\t","\\t")+"\"";}
 private CancellationView cancellationView(Flight f){if(f.getMotivoCancelacion()==null)return null;return new CancellationView(cancellationLabel(f),f.getMotivoCancelacion().getCodigo(),f.getFechaCancelacion(),f.getCanceladoPor()==null?null:f.getCanceladoPor().getUsername());}private PlaceView placeView(Airport a){return a==null?null:new PlaceView(a.getId(),a.getNombre(),a.getProvinciaReferencial()==null?null:a.getProvinciaReferencial().getNombre(),a.getProvinciaReferencial()==null?null:a.getProvinciaReferencial().getId());}private LocalityView localityView(Locality l){return l==null?null:new LocalityView(l.getId(),l.getNombre(),l.getProvincia().getNombre(),l.getProvincia().getId());}private FlightView view(Flight f){SanitaryFlight s=f.getSanitario();if(s==null) s=sanitaryFlights.findByFlightId(f.getId()).orElse(null);SanitaryDataView data=null;if(s!=null){var p=s.getPatient().getPerson();data=new SanitaryDataView(s.getPatient().getId(),p.getNombre()+" "+p.getApellido(),s.getPrioridad()==null?null:s.getPrioridad().getCodigo(),localityView(s.getLocalidadOrigenSolicitada()),localityView(s.getLocalidadDestinoSolicitada()),s.getFechaSolicitada(),Boolean.TRUE.equals(s.getExtremaUrgencia()),s.getJustificacionExtremaUrgencia(),s.getFechaLimiteTraslado(),s.getEstadoSolicitud().getCodigo(),s.getMotivoRechazo(),AuditService.toLocal(f.getCreatedAt(),clock.getZone()));}return new FlightView(f.getId(),f.getCodigo(),new FlightTypeView(f.getTipoVuelo().getCodigo(),f.getTipoVuelo().getNombre()),f.getMotivoVuelo(),f.getEstadoVuelo()==null?null:f.getEstadoVuelo().getCodigo(),data,f.getFechaPlanificadaSalida(),f.getFechaPlanificadaLlegada(),f.getOrigen()==null?null:f.getOrigen().getNombre(),f.getDestino()==null?null:f.getDestino().getNombre(),placeView(f.getOrigen()),placeView(f.getDestino()),cancellationView(f));}
 private FlightDetailView detail(Flight f){SanitaryFlight s=f.getSanitario();if(s==null)s=sanitaryFlights.findByFlightId(f.getId()).orElse(null);PatientDetail patient=s==null?null:new PatientDetail(s.getPatient().getId(),s.getPatient().getPerson().getNombre(),s.getPatient().getPerson().getApellido(),s.getPatient().getPerson().getDni());FlightMedicalInfo info=medical.findByFlightId(f.getId()).orElse(null);User c=f.getComandante();CommanderProfile p=c==null?null:c.getPerson().getCommanderProfile();ResourceAssignment resources=new ResourceAssignment(f.getAircraft()==null?null:f.getAircraft().getId(),f.getAircraft()==null?null:f.getAircraft().getMatricula(),f.getAircraft()==null?null:f.getAircraft().getModelo(),f.getAircraft()==null?null:f.getAircraft().getTipo(),f.getAircraft()==null||f.getAircraft().getAeropuertoActual()==null?null:f.getAircraft().getAeropuertoActual().getNombre(),f.getAircraft()==null?null:f.getAircraft().getCapacidadTripulacion(),c==null?null:c.getId(),c==null?null:c.getUsername(),c==null?null:c.getPerson().getNombre(),c==null?null:c.getPerson().getApellido(),p==null?null:p.getLicenseNumber(),p==null||p.getProvinciaActual()==null?null:p.getProvinciaActual().getNombre(),p==null?null:p.getUbicacionActualizadaEn(),geographicException(f));List<NegotiationEventView> timeline=negotiations.findByFlightIdOrderByFechaOcurrenciaAscIdAsc(f.getId()).stream().map(n->new NegotiationEventView(n.getId(),n.getRespondida()==null?null:n.getRespondida().getId(),n.getTipo(),n.getFechaHoraPropuesta(),n.getFechaHoraLlegadaPropuesta(),n.getMotivo(),n.getActor()==null?"Sistema":n.getActor().getUsername(),n.getFechaOcurrencia())).toList();return new FlightDetailView(view(f),patient,info==null?null:new Medical(info.getDiagnostico(),info.getCondicionMedica(),Boolean.TRUE.equals(info.getRequiereEquipamientoEspecial()),info.getObservaciones()),resources,airportPlan(f,s),timeline,reportWorkflow.closure(f));}private GeographicExceptionView geographicException(Flight f){if(f.getComandante()==null)return null;return geoExceptions.findCurrentByFlightId(f.getId()).stream().filter(e->e.getCommander().getId().equals(f.getComandante().getId())).findFirst().map(e->new GeographicExceptionView(e.getId(),e.getType(),e.getReason(),e.getAuthorizedBy().getPerson().getNombre()+" "+e.getAuthorizedBy().getPerson().getApellido(),e.getAuthorizedAt(),e.getCommanderProvince()==null?null:e.getCommanderProvince().getNombre(),e.getDepartureProvince()==null?null:e.getDepartureProvince().getNombre(),e.getDepartureAirport()==null?null:e.getDepartureAirport().getNombre())).orElse(null);}private WeatherView weatherView(WeatherSnapshot w){return new WeatherView(w.getId(),w.getCondiciones(),w.getFavorable(),w.getObservaciones(),w.getFechaRegistro(),w.getRegistradoPor().getUsername());}
}
