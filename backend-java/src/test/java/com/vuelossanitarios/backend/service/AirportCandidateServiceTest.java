package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.AirportPlanningDtos.*;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.person.*;
import com.vuelossanitarios.backend.domain.user.*;
import com.vuelossanitarios.backend.repository.*;
import java.math.BigDecimal;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;

/** Selección asistida de aeropuertos: la localidad del paciente no es el aeropuerto, el orden es por distancia en línea recta aproximada y nunca se inventan tiempos de traslado. */
class AirportCandidateServiceTest {
 private final FlightRepository flights=mock(FlightRepository.class); private final SanitaryFlightRepository sanitary=mock(SanitaryFlightRepository.class);
 private final AirportRepository airports=mock(AirportRepository.class); private final UserRepository users=mock(UserRepository.class);
 private AirportCandidateService service; private Province tucuman,cordoba,caba,pba; private Locality yerbaBuena,carlosPaz;
 private User ops,commander,dts; private Flight flight; private Airport matienzo,benjamin,cordobaAirport,aeroparque,ezeiza,sinProvincia,inactivo;
 private static long next=500;
 private static Province province(String name){Province p=new Province();p.setId(++next);p.setNombre(name);p.setActivo(true);return p;}
 private static Locality locality(String name,Province p,String lat,String lon){Locality l=new Locality();l.setId(++next);l.setNombre(name);l.setProvincia(p);l.setActivo(true);if(lat!=null){l.setLatitud(new BigDecimal(lat));l.setLongitud(new BigDecimal(lon));}return l;}
 private static Airport airport(String name,Province p,String lat,String lon){Airport a=new Airport();a.setId(++next);a.setNombre(name);a.setCodigoOaci("S"+next);a.setActivo(true);a.setProvinciaReferencial(p);a.setTipo("AEROPUERTO");if(lat!=null){a.setLatitud(new BigDecimal(lat));a.setLongitud(new BigDecimal(lon));}return a;}
 private static User user(String role){User u=new User();u.setId(++next);u.setUsername(role.toLowerCase());Person person=new Person();person.setNombre("N");person.setApellido("A");CommanderProfile cp=new CommanderProfile();cp.setLicenseNumber("L");person.setCommanderProfile(cp);u.setPerson(person);Role r=new Role();r.setCodigo(role);UserRole link=new UserRole();link.setRole(r);u.setUserRoles(Set.of(link));return u;}

 @BeforeEach void setUp(){
  service=new AirportCandidateService(flights,sanitary,airports,users);
  tucuman=province("Tucumán");cordoba=province("Córdoba");caba=province("Ciudad Autónoma de Buenos Aires");pba=province("Buenos Aires");
  yerbaBuena=locality("Yerba Buena",tucuman,"-26.81","-65.28");carlosPaz=locality("Villa Carlos Paz",cordoba,"-31.42","-64.49");
  matienzo=airport("Teniente Benjamín Matienzo",tucuman,"-26.84","-65.10");benjamin=airport("Aeródromo Lejano de Tucumán",tucuman,"-27.50","-65.50");
  cordobaAirport=airport("Ingeniero Taravella",cordoba,"-31.32","-64.21");aeroparque=airport("Jorge Newbery",caba,"-34.56","-58.41");ezeiza=airport("Ministro Pistarini",pba,"-34.82","-58.54");
  sinProvincia=airport("Sin provincia",null,"-26.9","-65.2");inactivo=airport("Inactivo",tucuman,"-26.82","-65.29");inactivo.setActivo(false);
  when(airports.findAllDetailedOrderByNombre()).thenReturn(List.of(benjamin,matienzo,cordobaAirport,aeroparque,ezeiza,sinProvincia,inactivo));
  ops=user("OPERACIONES");commander=user("COMANDANTE");dts=user("DTS");commander.getPerson().getCommanderProfile().setProvinciaActual(tucuman);
  for(User u:List.of(ops,commander,dts))when(users.findWithRolesById(u.getId())).thenReturn(Optional.of(u));
  flight=new Flight();flight.setId(900L);flight.setCodigo("V-1");
  SanitaryRequestStatus approved=new SanitaryRequestStatus();approved.setCodigo("APROBADO");
  SanitaryFlight s=new SanitaryFlight();s.setLocalidadOrigenSolicitada(yerbaBuena);s.setLocalidadDestinoSolicitada(carlosPaz);s.setEstadoSolicitud(approved);flight.setSanitario(s);
  when(flights.findById(900L)).thenReturn(Optional.of(flight));when(sanitary.findByFlightId(900L)).thenReturn(Optional.of(s));
 }

 @Test void theDepartureCandidatesStartInThePatientProvinceOrderedByStraightLineDistanceWithoutRequiringAirportInTheLocality(){
  AirportCandidates r=service.candidates(900L,ops.getId(),"SALIDA","");
  assertEquals("SALIDA",r.tipo());assertEquals("Yerba Buena",r.localidadPaciente().nombre());assertTrue(r.coordenadasPaciente());
  assertEquals(List.of("Teniente Benjamín Matienzo","Aeródromo Lejano de Tucumán"),r.enProvinciaDelPaciente().stream().map(AirportCandidate::nombre).toList());
  assertTrue(r.enProvinciaDelPaciente().get(0).distanciaRectaKm()<r.enProvinciaDelPaciente().get(1).distanciaRectaKm());assertTrue(r.enProvinciaDelPaciente().stream().allMatch(AirportCandidate::mismaProvinciaQueElPaciente));
  assertTrue(r.aviso().contains("no equivale a distancia ni a tiempo de traslado por tierra"));assertNull(r.mensaje());
 }
 @Test void airportsOfOtherJurisdictionsAreOfferedWithoutBeingBlockedAndNeverIncludeInactiveOrProvincelessOnes(){
  List<String> all=new ArrayList<>();AirportCandidates r=service.candidates(900L,ops.getId(),"SALIDA","");
  r.enProvinciaDelPaciente().forEach(c->all.add(c.nombre()));r.enOtrasJurisdicciones().forEach(c->all.add(c.nombre()));
  assertTrue(all.contains("Ingeniero Taravella"));assertFalse(all.contains("Sin provincia"));assertFalse(all.contains("Inactivo"));
  assertTrue(r.enOtrasJurisdicciones().stream().noneMatch(AirportCandidate::mismaProvinciaQueElPaciente));
 }
 @Test void theArrivalCandidatesUseTheDestinationLocalityNotTheOriginAndKeepThemAsDifferentConcepts(){
  AirportCandidates r=service.candidates(900L,ops.getId(),"LLEGADA","");
  assertEquals("Villa Carlos Paz",r.localidadPaciente().nombre());assertEquals(List.of("Ingeniero Taravella"),r.enProvinciaDelPaciente().stream().map(AirportCandidate::nombre).toList());
  assertEquals("Villa Carlos Paz",flight.getSanitario().getLocalidadDestinoSolicitada().getNombre(),"la localidad del paciente no se modifica");assertNull(flight.getDestino());
 }
 @Test void cabaAndTheProvinceOfBuenosAiresAreSeparateJurisdictionsInTheCandidates(){
  yerbaBuena=locality("La Plata",pba,"-34.92","-57.95");flight.getSanitario().setLocalidadOrigenSolicitada(yerbaBuena);
  AirportCandidates r=service.candidates(900L,ops.getId(),"SALIDA","");
  assertEquals(List.of("Ministro Pistarini"),r.enProvinciaDelPaciente().stream().map(AirportCandidate::nombre).toList());
  AirportCandidate aep=r.enOtrasJurisdicciones().stream().filter(c->c.nombre().equals("Jorge Newbery")).findFirst().orElseThrow();
  assertFalse(aep.mismaProvinciaQueElPaciente());assertEquals("Ciudad Autónoma de Buenos Aires",aep.provincia());assertTrue(aep.distanciaRectaKm()<80);
 }
 @Test void withoutCoordinatesThereAreNoInventedDistancesAndOtherJurisdictionsNeedASearch(){
  yerbaBuena.setLatitud(null);yerbaBuena.setLongitud(null);
  AirportCandidates r=service.candidates(900L,ops.getId(),"SALIDA","");
  assertFalse(r.coordenadasPaciente());assertTrue(r.enProvinciaDelPaciente().stream().allMatch(c->c.distanciaRectaKm()==null));assertTrue(r.enOtrasJurisdicciones().isEmpty());
  assertEquals(List.of("Aeródromo Lejano de Tucumán","Teniente Benjamín Matienzo"),r.enProvinciaDelPaciente().stream().map(AirportCandidate::nombre).toList(),"sin distancias se ordena por nombre");
  AirportCandidates found=service.candidates(900L,ops.getId(),"SALIDA","newbery");
  assertEquals(1,found.enOtrasJurisdicciones().size());assertNull(found.enOtrasJurisdicciones().get(0).distanciaRectaKm());
 }
 @Test void theSearchIgnoresAccentsAndSaysWhenNothingIsSuitable(){
  assertEquals("Teniente Benjamín Matienzo",service.candidates(900L,ops.getId(),"SALIDA","benjamin matienzo").enProvinciaDelPaciente().get(0).nombre());
  AirportCandidates none=service.candidates(900L,ops.getId(),"SALIDA","zzzz");
  assertTrue(none.enProvinciaDelPaciente().isEmpty()&&none.enOtrasJurisdicciones().isEmpty());assertTrue(none.mensaje().contains("No existen aeropuertos operativamente adecuados"));
 }
 @Test void itFlagsTheCurrentSelectionTheAircraftAirportAndWhetherTheAssignedCommanderIsInTheJurisdiction(){
  Aircraft plane=new Aircraft();plane.setId(1L);plane.setAeropuertoActual(matienzo);flight.setAircraft(plane);flight.setComandante(commander);flight.setOrigen(matienzo);flight.setEstadoAeropuertoOrigen(Flight.PROPOSED);
  AirportCandidates r=service.candidates(900L,ops.getId(),"SALIDA","");
  AirportCandidate current=r.enProvinciaDelPaciente().stream().filter(AirportCandidate::seleccionActual).findFirst().orElseThrow();
  assertEquals("PROPUESTO",current.estadoSeleccion());assertTrue(current.aeronaveAsignadaAqui());assertEquals(Boolean.TRUE,current.comandanteEnJurisdiccion());
  assertEquals(Boolean.FALSE,r.enOtrasJurisdicciones().stream().filter(c->c.nombre().equals("Ingeniero Taravella")).findFirst().orElseThrow().comandanteEnJurisdiccion());
  assertNull(service.candidates(900L,ops.getId(),"LLEGADA","").enProvinciaDelPaciente().get(0).comandanteEnJurisdiccion(),"sólo aplica a la salida");
 }
 @Test void onlyOperationsAndTheAssignedCommanderMayConsultAndOnlyBeforeTheFlightStarts(){
  assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.candidates(900L,dts.getId(),"SALIDA","")).status());
  assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.candidates(900L,commander.getId(),"SALIDA","")).status(),"un comandante que no es el asignado");
  flight.setComandante(commander);assertNotNull(service.candidates(900L,commander.getId(),"SALIDA",""));
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.candidates(900L,ops.getId(),"OTRO","")).status());
  FlightStatus running=new FlightStatus();running.setCodigo("EN_CURSO");flight.setEstadoVuelo(running);
  assertEquals(HttpStatus.CONFLICT,assertThrows(ApiException.class,()->service.candidates(900L,ops.getId(),"SALIDA","")).status());
 }
}
