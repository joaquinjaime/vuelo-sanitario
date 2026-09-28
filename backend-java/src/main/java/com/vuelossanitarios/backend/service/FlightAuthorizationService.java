package com.vuelossanitarios.backend.service;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import java.util.UUID;
@Service public class FlightAuthorizationService { private final UserRepository users; public FlightAuthorizationService(UserRepository u){users=u;}
 public void mayRead(Flight f,UUID actor){User u=users.findWithRolesByUsername(users.findById(actor).orElseThrow().getUsername()).orElseThrow();boolean broad=u.getUserRoles().stream().anyMatch(x->"OPERACIONES".equals(x.getRole().getCodigo())||"CENTRO_OPERACIONES".equals(x.getRole().getCodigo()));if(broad)return;boolean requested=f.getSolicitadoPor().getId().equals(actor);boolean commanded=f.getComandante()!=null&&f.getComandante().getId().equals(actor);if(!requested&&!commanded)throw new ApiException(HttpStatus.FORBIDDEN,"No tiene acceso a este vuelo");}
}
