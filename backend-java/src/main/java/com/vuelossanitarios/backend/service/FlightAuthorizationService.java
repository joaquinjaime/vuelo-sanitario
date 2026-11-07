package com.vuelossanitarios.backend.service;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.UserRepository;
import java.util.Collection;
import java.util.HashSet;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
@Service public class FlightAuthorizationService { private final UserRepository users; public FlightAuthorizationService(UserRepository u){users=u;}
 /**
  * Lectura global de vuelos: Operaciones siempre; ADMINISTRADOR sólo si la cuenta no es además DTS. Una cuenta que reúne DTS y ADMINISTRADOR
  * actúa como solicitante: ver las solicitudes de otros DTS por el rol administrativo rompería el aislamiento de cada DTS, por lo que sólo accede a las suyas.
  */
 public static boolean readsAllFlights(Collection<String> roleCodes){return operations(roleCodes)||adminWithoutDts(roleCodes);}
 /** ADMINISTRADOR que no es DTS: conserva la lectura administrativa de vuelos que ya tenía. */
 public static boolean adminWithoutDts(Collection<String> roleCodes){return roleCodes.contains("ADMINISTRADOR")&&!roleCodes.contains("DTS");}
 public static boolean operations(Collection<String> roleCodes){return roleCodes.contains("OPERACIONES")||roleCodes.contains("CENTRO_OPERACIONES");}
 public static Set<String> roleCodes(User u){Set<String> codes=new HashSet<>();u.getUserRoles().forEach(x->codes.add(x.getRole().getCodigo()));return codes;}
 private User withRoles(Long actor){return users.findWithRolesByUsername(users.findById(actor).orElseThrow().getUsername()).orElseThrow();}
 /** Personal de Operaciones (no incluye a ADMINISTRADOR, que no opera vuelos). */
 public boolean operationsStaff(Long actor){return operations(roleCodes(withRoles(actor)));}
 /** Los documentos retirados (baja lógica) sólo los consulta Operaciones y el comandante del vuelo, no el DTS solicitante. */
 public void mayReadRetired(Flight f,Long actor){mayRead(f,actor);boolean commanded=f.getComandante()!=null&&f.getComandante().getId().equals(actor);if(!commanded&&!operationsStaff(actor))throw new ApiException(HttpStatus.FORBIDDEN,"No tiene acceso a los documentos retirados de este vuelo");}
 /** Lectura de un vuelo: Operaciones (y el administrador que no es DTS) cualquiera; el DTS sólo las solicitudes que creó; el comandante sólo los vuelos que tiene asignados. */
 public void mayRead(Flight f,Long actor){User u=withRoles(actor);if(readsAllFlights(roleCodes(u)))return;boolean requested=f.getSanitario()!=null&&f.getSanitario().getSolicitadoPor().getId().equals(actor);boolean commanded=f.getComandante()!=null&&f.getComandante().getId().equals(actor)&&f.getEstadoVuelo()!=null;if(!requested&&!commanded)throw new ApiException(HttpStatus.FORBIDDEN,"No tiene acceso a este vuelo");}
}
