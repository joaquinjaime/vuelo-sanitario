package com.vuelossanitarios.backend.service;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
@Service public class FlightAuthorizationService { private final UserRepository users; public FlightAuthorizationService(UserRepository u){users=u;}
 /** Personal de Operaciones (no incluye a ADMINISTRADOR, que no opera vuelos). */
 public boolean operationsStaff(Long actor){User u=users.findWithRolesByUsername(users.findById(actor).orElseThrow().getUsername()).orElseThrow();return u.getUserRoles().stream().anyMatch(x->"OPERACIONES".equals(x.getRole().getCodigo())||"CENTRO_OPERACIONES".equals(x.getRole().getCodigo()));}
 /** Los documentos retirados (baja lógica) sólo los consulta Operaciones y el comandante del vuelo, no el DTS solicitante. */
 public void mayReadRetired(Flight f,Long actor){mayRead(f,actor);boolean commanded=f.getComandante()!=null&&f.getComandante().getId().equals(actor);if(!commanded&&!operationsStaff(actor))throw new ApiException(HttpStatus.FORBIDDEN,"No tiene acceso a los documentos retirados de este vuelo");}
 public void mayRead(Flight f,Long actor){User u=users.findWithRolesByUsername(users.findById(actor).orElseThrow().getUsername()).orElseThrow();boolean broad=u.getUserRoles().stream().anyMatch(x->"OPERACIONES".equals(x.getRole().getCodigo())||"CENTRO_OPERACIONES".equals(x.getRole().getCodigo())||"ADMINISTRADOR".equals(x.getRole().getCodigo()));if(broad)return;boolean requested=f.getSanitario()!=null&&f.getSanitario().getSolicitadoPor().getId().equals(actor);boolean commanded=f.getComandante()!=null&&f.getComandante().getId().equals(actor);if(!requested&&!commanded)throw new ApiException(HttpStatus.FORBIDDEN,"No tiene acceso a este vuelo");}
}
