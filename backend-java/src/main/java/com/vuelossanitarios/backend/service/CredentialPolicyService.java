package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.person.CredentialPolicy;
import com.vuelossanitarios.backend.repository.*;
import jakarta.validation.constraints.*;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Administración de la política de suficiencia (tabla {@code politicas_habilitacion}). Las políticas no se borran: se dan de baja con motivo,
 * y cada alta o baja se audita y dispara la revisión de los vuelos abiertos. Una política es configuración interna de la organización;
 * sólo la marcada FUENTE_OFICIAL_CITADA declara una fuente (que el administrador cita, el sistema no la verifica).
 */
@Service
public class CredentialPolicyService {
 public record PolicyChanged(Long policyId){}
 private final CredentialPolicyRepository policies; private final CrewRoleRepository roles; private final FlightTypeRepository flightTypes; private final UserRepository users; private final AuditService audit; private final Clock clock; private final ZoneId zone;
 @org.springframework.beans.factory.annotation.Autowired(required=false) private ApplicationEventPublisher publisher;
 public CredentialPolicyService(CredentialPolicyRepository p,CrewRoleRepository r,FlightTypeRepository t,UserRepository u,AuditService a,Clock clock,@Value("${app.business-time-zone:America/Argentina/Tucuman}") String zone){policies=p;roles=r;flightTypes=t;users=u;audit=a;this.clock=clock;this.zone=ZoneId.of(zone);}
 public record Input(@NotBlank @Size(max=30) String roleCode,@Size(max=40) String flightTypeCode,@Size(max=50) String aircraftCategory,@NotBlank @Size(max=100) String credentialType,Boolean requiresJurisdiction,Boolean requiresExternalCheck,
   @Size(max=30) String origin,@Size(max=500) String sourceReference,@Size(max=1000) String notes){}
 public record View(Long id,String roleCode,String flightTypeCode,String aircraftCategory,String credentialType,boolean requiresJurisdiction,boolean requiresExternalCheck,String origin,String sourceReference,String notes,boolean active,String createdBy,LocalDateTime createdAt,String retiredBy,LocalDateTime retiredAt,String retireReason){}
 private ApiException bad(String code,String m){return new ApiException(HttpStatus.BAD_REQUEST,code,m,Map.of());}
 private View view(CredentialPolicy p){return new View(p.getId(),p.role.getCodigo(),p.flightType==null?null:p.flightType.getCodigo(),p.aircraftCategory,p.credentialType,Boolean.TRUE.equals(p.requiresJurisdiction),Boolean.TRUE.equals(p.requiresExternalCheck),p.origin,p.sourceReference,p.notes,Boolean.TRUE.equals(p.active),
   p.createdBy.getUsername(),p.createdAt,p.retiredBy==null?null:p.retiredBy.getUsername(),p.retiredAt,p.retireReason);}
 private static String blank(String s){return s==null||s.isBlank()?null:s.trim();}
 private String snapshot(CredentialPolicy p){return "{\"role\":\""+p.role.getCodigo()+"\",\"flightType\":\""+(p.flightType==null?"":p.flightType.getCodigo())+"\",\"aircraftCategory\":\""+Objects.toString(p.aircraftCategory,"").replace("\"","'")+"\",\"credentialType\":\""+p.credentialType.replace("\"","'")+"\",\"origin\":\""+p.origin+"\",\"active\":"+p.active+"}";}
 @Transactional(readOnly=true) public List<View> list(){return policies.findAllByOrderByIdDesc().stream().map(this::view).toList();}
 @Transactional public View create(Input input,Long actor){
  if(!ProfessionalCredentialService.ROLES.contains(input.roleCode()))throw bad("FUNCION_INVALIDA","Función de tripulación inválida");
  String origin=input.origin()==null||input.origin().isBlank()?CredentialPolicy.INTERNAL:input.origin();
  if(!Set.of(CredentialPolicy.INTERNAL,CredentialPolicy.OFFICIAL).contains(origin))throw bad("ORIGEN_INVALIDO","Origen de la política inválido");
  if(CredentialPolicy.OFFICIAL.equals(origin)&&blank(input.sourceReference())==null)throw bad("FUENTE_REQUERIDA","Cite la fuente oficial en la que se basa la política");
  roles.lockByCodes(List.of(input.roleCode()));
  CredentialPolicy p=new CredentialPolicy();p.role=roles.findByCodigo(input.roleCode()).orElseThrow(()->bad("FUNCION_INVALIDA","Función inexistente"));
  p.flightType=blank(input.flightTypeCode())==null?null:flightTypes.findByCodigoAndActivoTrue(input.flightTypeCode().trim()).orElseThrow(()->bad("TIPO_VUELO_INVALIDO","Tipo de vuelo inexistente o inactivo"));
  p.aircraftCategory=blank(input.aircraftCategory());p.credentialType=input.credentialType().trim();p.requiresJurisdiction=Boolean.TRUE.equals(input.requiresJurisdiction());p.requiresExternalCheck=Boolean.TRUE.equals(input.requiresExternalCheck());
  p.origin=origin;p.sourceReference=blank(input.sourceReference());p.notes=blank(input.notes());p.createdBy=users.findById(actor).orElseThrow();p.createdAt=LocalDateTime.ofInstant(clock.instant(),zone);
  for(CredentialPolicy existing:policies.findActiveByRole(input.roleCode()))
   if(Objects.equals(existing.flightType==null?null:existing.flightType.getCodigo(),p.flightType==null?null:p.flightType.getCodigo())&&Objects.equals(CredentialSufficiency.norm(existing.aircraftCategory),CredentialSufficiency.norm(p.aircraftCategory))&&Objects.equals(CredentialSufficiency.norm(existing.credentialType),CredentialSufficiency.norm(p.credentialType)))
    throw new ApiException(HttpStatus.CONFLICT,"POLITICA_DUPLICADA","Ya existe una política activa para esa combinación",Map.of());
  try{policies.saveAndFlush(p);}catch(DataIntegrityViolationException e){throw new ApiException(HttpStatus.CONFLICT,"POLITICA_DUPLICADA","Ya existe una política activa para esa combinación",Map.of());}
  audit.record(null,p.createdBy,"CREDENTIAL_POLICY",p.getId(),"CREATE",null,snapshot(p));if(publisher!=null)publisher.publishEvent(new PolicyChanged(p.getId()));return view(p);
 }
 @Transactional public View deactivate(Long id,String reason,Long actor){
  if(reason==null||reason.isBlank())throw bad("MOTIVO_REQUERIDO","Indique el motivo de la baja");if(reason.trim().length()>500)throw bad("MOTIVO_INVALIDO","El motivo admite hasta 500 caracteres");
  roles.lockByCodes(List.of(policies.findRoleCodeById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Política inexistente"))));
  CredentialPolicy p=policies.findById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Política inexistente"));
  if(!Boolean.TRUE.equals(p.active))throw new ApiException(HttpStatus.CONFLICT,"POLITICA_YA_INACTIVA","La política ya fue dada de baja; actualice la pantalla",Map.of());
  String before=snapshot(p);p.active=false;p.retiredBy=users.findById(actor).orElseThrow();p.retiredAt=LocalDateTime.ofInstant(clock.instant(),zone);p.retireReason=reason.trim();policies.saveAndFlush(p);
  audit.record(null,p.retiredBy,"CREDENTIAL_POLICY",p.getId(),"DEACTIVATE",before,snapshot(p));if(publisher!=null)publisher.publishEvent(new PolicyChanged(p.getId()));return view(p);
 }
}
