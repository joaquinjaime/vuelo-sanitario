/*
 * ACCESO A BASE DE DATOS
 * Trae datos de: usuarios, vuelos_tripulantes.
 * No carga ni modifica datos (sólo lectura).
 */
package com.vuelossanitarios.backend.service;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.FlightCrewRepository;
import com.vuelossanitarios.backend.repository.UserRepository;
import java.util.Collection;
import java.util.HashSet;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
@Service public class FlightAuthorizationService { private final UserRepository users; private final FlightCrewRepository crews; public FlightAuthorizationService(UserRepository u,FlightCrewRepository c){users=u;crews=c;}
 /** Commander of the flight (main crew member who operates it). */
 public static boolean commanderOf(Flight f,Long actor){return f.getComandante()!=null&&f.getComandante().getId().equals(actor);}
 /** Current copilot of an operational flight: a read-only spectator who never operates it. */
 // copilotOf: Verifica si el usuario tiene una asignación de tripulación vigente (sin baja) en el vuelo
 public boolean copilotOf(Flight f,Long actor){return f.getId()!=null&&f.getEstadoVuelo()!=null&&!commanderOf(f,actor)&&crews.existsByFlightIdAndUserIdAndFechaBajaIsNull(f.getId(),actor);}
 /** Commander or current copilot of the flight (read access of the assigned crew). */
 public boolean crewOf(Flight f,Long actor){return commanderOf(f,actor)&&f.getEstadoVuelo()!=null||copilotOf(f,actor);}
 /** Function of the actor on the flight: COMANDANTE, COPILOTO or null. */
 public String functionOf(Flight f,Long actor){return commanderOf(f,actor)?"COMANDANTE":copilotOf(f,actor)?"COPILOTO":null;}
 /**
  * Lectura global de vuelos: Operaciones siempre; ADMINISTRADOR sólo si la cuenta no es además DTS. Una cuenta que reúne DTS y ADMINISTRADOR
  * actúa como solicitante: ver las solicitudes de otros DTS por el rol administrativo rompería el aislamiento de cada DTS, por lo que sólo accede a las suyas.
  */
 public static boolean readsAllFlights(Collection<String> roleCodes){return operations(roleCodes)||adminWithoutDts(roleCodes);}
 /** ADMINISTRADOR que no es DTS: conserva la lectura administrativa de vuelos que ya tenía. */
 public static boolean adminWithoutDts(Collection<String> roleCodes){return roleCodes.contains("ADMINISTRADOR")&&!roleCodes.contains("DTS");}
 public static boolean operations(Collection<String> roleCodes){return roleCodes.contains("OPERACIONES")||roleCodes.contains("CENTRO_OPERACIONES");}
 public static Set<String> roleCodes(User u){Set<String> codes=new HashSet<>();u.getUserRoles().forEach(x->codes.add(x.getRole().getCodigo()));return codes;}
 // withRoles: Busca el usuario por su ID para obtener su nombre de usuario
 // withRoles: Carga el mismo usuario por su nombre de usuario junto con sus roles asignados
 private User withRoles(Long actor){return users.findWithRolesByUsername(users.findById(actor).orElseThrow().getUsername()).orElseThrow();}
 /** Personal de Operaciones (no incluye a ADMINISTRADOR, que no opera vuelos). */
 public boolean operationsStaff(Long actor){return operations(roleCodes(withRoles(actor)));}
 /** Los documentos retirados (baja lógica) sólo los consulta Operaciones y el comandante del vuelo, no el DTS solicitante. */
 public void mayReadRetired(Flight f,Long actor){mayRead(f,actor);boolean commanded=f.getComandante()!=null&&f.getComandante().getId().equals(actor);if(!commanded&&!operationsStaff(actor))throw new ApiException(HttpStatus.FORBIDDEN,"No tiene acceso a los documentos retirados de este vuelo");}
 /** Lectura de un vuelo: Operaciones (y el administrador que no es DTS) cualquiera; el DTS sólo las solicitudes que creó; el comandante y el copiloto sólo los vuelos que tienen asignados (el copiloto, sólo en consulta). */
 public void mayRead(Flight f,Long actor){User u=withRoles(actor);if(readsAllFlights(roleCodes(u)))return;boolean requested=f.getSanitario()!=null&&f.getSanitario().getSolicitadoPor().getId().equals(actor);if(!requested&&!crewOf(f,actor))throw new ApiException(HttpStatus.FORBIDDEN,"No tiene acceso a este vuelo");}
}
