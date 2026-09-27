package com.vuelossanitarios.backend.service;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.AuthDtos.*;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.*;
import com.vuelossanitarios.backend.repository.*;
import com.vuelossanitarios.backend.security.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
@Service public class AuthService {
 private final UserRepository users; private final PersonRepository persons; private final RoleRepository roles; private final UserRoleRepository userRoles; private final PasswordEncoder encoder; private final JwtService jwt;
 public AuthService(UserRepository u,PersonRepository p,RoleRepository r,UserRoleRepository ur,PasswordEncoder e,JwtService j){users=u;persons=p;roles=r;userRoles=ur;encoder=e;jwt=j;}
 @Transactional(readOnly=true) public TokenResponse login(LoginRequest request){ User u=users.findWithRolesByUsername(request.username()).orElseThrow(()->new ApiException(HttpStatus.UNAUTHORIZED,"Credenciales inválidas")); if(!Boolean.TRUE.equals(u.getActivo())||!encoder.matches(request.password(),u.getPasswordHash()))throw new ApiException(HttpStatus.UNAUTHORIZED,"Credenciales inválidas"); Set<String> rs=new TreeSet<>(); for(UserRole ur:u.getUserRoles())if(Boolean.TRUE.equals(ur.getRole().getActivo()))rs.add(ur.getRole().getCodigo()); return new TokenResponse(jwt.create(new CurrentUser(u.getId(),u.getUsername()),rs),"Bearer",u.getUsername(),rs); }
 @Transactional public User createUser(CreateUserRequest r){if(users.existsByUsername(r.username())||users.existsByEmail(r.email()))throw new ApiException(HttpStatus.CONFLICT,"El usuario o email ya existe");if(r.roles().contains("COMANDANTE")&&(r.licenciaAeronautica()==null||r.licenciaAeronautica().isBlank()))throw new ApiException(HttpStatus.BAD_REQUEST,"La licencia aeronáutica es obligatoria para COMANDANTE"); Person p=new Person();p.setNombre(r.nombre());p.setApellido(r.apellido());p.setDni(blankToNull(r.dni()));p.setFechaNacimiento(r.fechaNacimiento());p.setTelefono(blankToNull(r.telefono()));persons.save(p); User u=new User();u.setUsername(r.username());u.setEmail(r.email());u.setPasswordHash(encoder.encode(r.password()));u.setPerson(p);u.setLicenciaAeronautica(blankToNull(r.licenciaAeronautica()));users.save(u); for(String code:r.roles()){Role role=roles.findByCodigo(code).orElseThrow(()->new ApiException(HttpStatus.BAD_REQUEST,"Rol inexistente: "+code));userRoles.save(new UserRole(u,role));}return u;}
 @Transactional(readOnly=true) public List<Map<String,Object>> listUsers(){return users.findAll().stream().map(u->{Set<String> codes=new TreeSet<>();for(UserRole role:u.getUserRoles())codes.add(role.getRole().getCodigo());return Map.<String,Object>of("id",u.getId(),"username",u.getUsername(),"email",u.getEmail(),"activo",u.getActivo(),"roles",codes);}).toList();}
 private String blankToNull(String value){return value==null||value.isBlank()?null:value.trim();}
}
