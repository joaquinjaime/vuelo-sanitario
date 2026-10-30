package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.StrictJson;
import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import com.vuelossanitarios.backend.domain.catalog.FlightType;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.flight.FlightCrew;
import com.vuelossanitarios.backend.domain.person.CredentialPolicy;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Procedimiento de carga, simulación y activación de la política de suficiencia por lotes aprobados.
 * <p>
 * La simulación no escribe nada: valida la propuesta, calcula su huella (SHA-256 de su contenido canónico) y compara, con las mismas reglas que usa la
 * elegibilidad real, qué pasaría con las personas clasificadas y con las tripulaciones de los vuelos abiertos. La activación sólo se acepta si la
 * huella presentada es la de la propuesta que se envía (lo aprobado es exactamente lo que se activa), si no hay errores bloqueantes y si el administrador reconoce
 * las incompatibilidades detectadas. Se aplica de forma atómica por función: las políticas idénticas se conservan, las ausentes se dan de baja con motivo y las
 * nuevas o modificadas se crean con la referencia de aprobación. Una función sin ninguna política propuesta queda no elegible: nada se infiere ni se completa.
 */
@Service
public class CredentialPolicyActivationService {
 @StrictJson public record PolicyRow(String roleCode,String flightTypeCode,String aircraftCategory,String credentialType,Boolean requiresJurisdiction,Boolean requiresExternalCheck,String origin,String sourceReference,String notes){}
 /** Decisión de negocio todavía sin resolver: se informa, no se activa y mantiene a la función no elegible hasta que se cargue una política. */
 @StrictJson public record PendingDecision(String roleCode,String topic,String question){}
 @StrictJson public record Proposal(String name,List<String> roles,List<PolicyRow> policies,List<PendingDecision> pendingDecisions){}
 @StrictJson public record ActivationRequest(@NotNull @Valid Proposal proposal,@NotBlank @Size(max=64) String approvedFingerprint,@NotBlank @Size(max=500) String approvalReference,Boolean acknowledgeIncompatibilities){}
 public record Issue(String severity,String code,String message,Integer row,String roleCode){}
 public record RolePlan(String roleCode,int currentActive,int proposed,int keep,int create,int retire,boolean eligibleAfterActivation){}
 public record Uncovered(String roleCode,String flightType,String aircraftCategory){}
 public record Transition(String roleCode,long becomeIneligible,long becomeEligible,long stayEligible,long stayIneligible,Map<String,Long> codesAfter){}
 public record FlightImpact(Long flightId,String flightCode,String flightState,Long userId,String username,String roleCode,String before,String after,String message){}
 public record Report(String fingerprint,boolean canActivate,boolean requiresAcknowledgement,List<Issue> issues,List<RolePlan> plan,List<Uncovered> uncovered,List<String> aircraftTypesInUse,List<Transition> people,
   long flightsExamined,long newIncompatibilities,long resolvedIncompatibilities,List<FlightImpact> flightImpacts,List<String> pendingDecisions,String note){}
 public record Activation(String batchId,boolean changed,int created,int retired,int kept,List<Long> createdIds,List<Long> retiredIds,Report report){}

 private static final int IMPACT_LIST_LIMIT=200;
 private static final List<String> OPEN_STATES=List.of("PENDIENTE_CONFIRMACION_COMANDANTE","PENDIENTE_RESPUESTA_OPERACIONES","PENDIENTE_REPLANIFICACION","PLANIFICADO","EN_CURSO");
 private final CredentialPolicyRepository policies; private final CrewRoleRepository roles; private final FlightTypeRepository flightTypes; private final UserRepository users; private final CrewQualificationRepository qualifications;
 private final FlightRepository flights; private final FlightCrewRepository crews; private final AircraftRepository aircraft; private final ProfessionalCredentialRepository credentials; private final ProfessionalCredentialService assessor;
 private final AuditService audit; private final Clock clock; private final ZoneId zone;
 @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager em;
 @org.springframework.beans.factory.annotation.Autowired(required=false) private ApplicationEventPublisher publisher;
 public CredentialPolicyActivationService(CredentialPolicyRepository p,CrewRoleRepository r,FlightTypeRepository t,UserRepository u,CrewQualificationRepository q,FlightRepository f,FlightCrewRepository c,AircraftRepository a,ProfessionalCredentialRepository cr,
   ProfessionalCredentialService assessor,AuditService audit,Clock clock,@Value("${app.business-time-zone:America/Argentina/Tucuman}") String zone){
  policies=p;roles=r;flightTypes=t;users=u;qualifications=q;flights=f;crews=c;aircraft=a;credentials=cr;this.assessor=assessor;this.audit=audit;this.clock=clock;this.zone=ZoneId.of(zone);
 }
 private ApiException conflict(String code,String m){return new ApiException(HttpStatus.CONFLICT,code,m,Map.of());}
 private static String blank(String s){return s==null||s.isBlank()?null:s.trim();}
 private static String n(String s){return CredentialSufficiency.norm(s);}
 private static String sha256(String text){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}

 /** Clave de equivalencia de una política: función, tipo de vuelo, categoría y tipo de habilitación (sin tildes ni mayúsculas). */
 private static String key(PolicyRow r){return String.join("|",n(r.roleCode()),Objects.toString(n(r.flightTypeCode()),"*"),Objects.toString(n(r.aircraftCategory()),"*"),Objects.toString(n(r.credentialType()),""));}
 private static String content(PolicyRow r){
  return String.join("|",key(r),String.valueOf(Boolean.TRUE.equals(r.requiresJurisdiction())),String.valueOf(Boolean.TRUE.equals(r.requiresExternalCheck())),Objects.toString(blank(r.origin()),CredentialPolicy.INTERNAL),Objects.toString(blank(r.sourceReference()),""),Objects.toString(blank(r.notes()),""));
 }
 private static String content(CredentialPolicy p){
  PolicyRow r=new PolicyRow(p.role.getCodigo(),p.flightType==null?null:p.flightType.getCodigo(),p.aircraftCategory,p.credentialType,p.requiresJurisdiction,p.requiresExternalCheck,p.origin,p.sourceReference,p.notes);return content(r);
 }
 /** Huella canónica: las funciones del alcance y el contenido de cada política, en orden estable e independiente del orden en que se escribieron. */
 public static String fingerprint(Proposal proposal){
  List<String> scope=scope(proposal);List<String> lines=new ArrayList<>();lines.add("ALCANCE:"+String.join(",",scope));
  List<String> rows=new ArrayList<>();for(PolicyRow r:Optional.ofNullable(proposal.policies()).orElse(List.of()))if(r!=null)rows.add(content(r));Collections.sort(rows);lines.addAll(rows);
  return sha256(String.join("\n",lines));
 }
 private static List<String> scope(Proposal p){return Optional.ofNullable(p.roles()).orElse(List.of()).stream().filter(Objects::nonNull).map(CredentialSufficiency::norm).filter(Objects::nonNull).distinct().sorted().toList();}

 private record Prepared(List<String> scope,Map<String,List<PolicyRow>> byRole,List<Issue> issues,Map<String,CrewRole> roleEntities,Map<String,FlightType> flightTypeEntities){}
 private Issue error(String code,String message,Integer row,String role){return new Issue("ERROR",code,message,row,role);}
 private Issue warning(String code,String message,Integer row,String role){return new Issue("WARNING",code,message,row,role);}
 private Issue info(String code,String message,Integer row,String role){return new Issue("INFO",code,message,row,role);}

 private Prepared prepare(Proposal proposal){
  List<Issue> issues=new ArrayList<>();List<String> scope=scope(proposal);
  if(proposal==null||scope.isEmpty())throw new ApiException(HttpStatus.BAD_REQUEST,"ALCANCE_REQUERIDO","Indique las funciones que abarca la propuesta (roles)",Map.of());
  Map<String,CrewRole> roleEntities=new LinkedHashMap<>();
  for(String code:scope){
   if(!ProfessionalCredentialService.ROLES.contains(code)){issues.add(error("FUNCION_INVALIDA","Función de tripulación inválida en el alcance: "+code,null,code));continue;}
   roles.findByCodigo(code).ifPresentOrElse(r->roleEntities.put(code,r),()->issues.add(error("FUNCION_INEXISTENTE","La función "+code+" no existe en el catálogo",null,code)));
  }
  Map<String,List<PolicyRow>> byRole=new LinkedHashMap<>();for(String code:scope)byRole.put(code,new ArrayList<>());
  Map<String,FlightType> types=new HashMap<>();
  List<PolicyRow> rows=Optional.ofNullable(proposal.policies()).orElse(List.of());Map<String,Integer> firstRow=new HashMap<>();
  for(int i=0;i<rows.size();i++){
   PolicyRow r=rows.get(i);int line=i+1;
   if(r==null){issues.add(error("FILA_VACIA","La fila "+line+" está vacía",line,null));continue;}
   String role=n(r.roleCode());
   if(role==null||!scope.contains(role)){issues.add(error("FUNCION_FUERA_DE_ALCANCE","La fila "+line+" indica una función ("+Objects.toString(r.roleCode(),"-")+") que no figura en el alcance de la propuesta",line,role));continue;}
   if(blank(r.credentialType())==null){issues.add(error("TIPO_HABILITACION_REQUERIDO","La fila "+line+" no indica el tipo de habilitación aceptado",line,role));continue;}
   if(r.credentialType().trim().length()>100)issues.add(error("TIPO_HABILITACION_LARGO","El tipo de habilitación de la fila "+line+" excede 100 caracteres",line,role));
   if(blank(r.aircraftCategory())!=null&&r.aircraftCategory().trim().length()>50)issues.add(error("CATEGORIA_LARGA","La categoría de la fila "+line+" excede 50 caracteres",line,role));
   if(blank(r.notes())!=null&&r.notes().trim().length()>1000)issues.add(error("OBSERVACIONES_LARGAS","Las observaciones de la fila "+line+" exceden 1000 caracteres",line,role));
   String origin=blank(r.origin())==null?CredentialPolicy.INTERNAL:r.origin().trim();
   if(!Set.of(CredentialPolicy.INTERNAL,CredentialPolicy.OFFICIAL).contains(origin))issues.add(error("ORIGEN_INVALIDO","El origen de la fila "+line+" debe ser CONFIGURACION_INTERNA o FUENTE_OFICIAL_CITADA",line,role));
   if(CredentialPolicy.OFFICIAL.equals(origin)&&blank(r.sourceReference())==null)issues.add(error("FUENTE_REQUERIDA","La fila "+line+" declara una fuente oficial pero no la cita",line,role));
   if(blank(r.sourceReference())!=null&&r.sourceReference().trim().length()>500)issues.add(error("FUENTE_LARGA","La fuente de la fila "+line+" excede 500 caracteres",line,role));
   if(blank(r.flightTypeCode())!=null&&!types.containsKey(r.flightTypeCode().trim())){
    var ft=flightTypes.findByCodigoAndActivoTrue(r.flightTypeCode().trim());
    if(ft.isPresent())types.put(r.flightTypeCode().trim(),ft.get());else{issues.add(error("TIPO_VUELO_INVALIDO","El tipo de vuelo de la fila "+line+" no existe o está inactivo: "+r.flightTypeCode(),line,role));continue;}
   }
   Integer previous=firstRow.putIfAbsent(key(r),line);
   if(previous!=null){issues.add(error("FILA_DUPLICADA","La fila "+line+" repite la combinación de la fila "+previous+" (función, tipo de vuelo, categoría y tipo de habilitación)",line,role));continue;}
   byRole.get(role).add(r);
  }
  for(var e:byRole.entrySet()){
   List<PolicyRow> list=e.getValue();
   for(PolicyRow a:list)for(PolicyRow b:list){
    if(a==b||!Objects.equals(n(a.credentialType()),n(b.credentialType())))continue;
    boolean broader=(n(a.flightTypeCode())==null||Objects.equals(n(a.flightTypeCode()),n(b.flightTypeCode())))&&(n(a.aircraftCategory())==null||Objects.equals(n(a.aircraftCategory()),n(b.aircraftCategory())));
    boolean notStricter=(!Boolean.TRUE.equals(a.requiresJurisdiction())||Boolean.TRUE.equals(b.requiresJurisdiction()))&&(!Boolean.TRUE.equals(a.requiresExternalCheck())||Boolean.TRUE.equals(b.requiresExternalCheck()));
    boolean sameScope=Objects.equals(n(a.flightTypeCode()),n(b.flightTypeCode()))&&Objects.equals(n(a.aircraftCategory()),n(b.aircraftCategory()));
    if(broader&&notStricter&&!sameScope)issues.add(warning("POLITICA_REDUNDANTE","Una política de "+e.getKey()+" para «"+b.credentialType().trim()+"» limitada a "+scopeText(b)+" ya está comprendida por otra más amplia ("+scopeText(a)+"): no restringe nada adicional",null,e.getKey()));
   }
   long wide=list.stream().filter(r->n(r.aircraftCategory())==null).count();
   if(wide>0)issues.add(info("SIN_CATEGORIA_EXIGIDA",wide+" política(s) de "+e.getKey()+" no indican categoría de aeronave: aceptan la habilitación sin comprobar para qué categoría fue otorgada",null,e.getKey()));
   if(list.isEmpty())issues.add(warning("FUNCION_SIN_POLITICA","La propuesta deja a "+e.getKey()+" sin ninguna política: nadie podrá ser elegible para esa función (POLITICA_HABILITACION_NO_CONFIGURADA)",null,e.getKey()));
  }
  for(PendingDecision d:Optional.ofNullable(proposal.pendingDecisions()).orElse(List.of()))if(d!=null)issues.add(warning("DECISION_PENDIENTE","Decisión pendiente"+(d.roleCode()==null?"":" ("+d.roleCode()+")")+": "+Objects.toString(d.topic(),"")+(blank(d.question())==null?"":" — "+d.question().trim()),null,n(d.roleCode())));
  return new Prepared(scope,byRole,issues,roleEntities,types);
 }
 private static String scopeText(PolicyRow r){return (n(r.flightTypeCode())==null?"cualquier tipo de vuelo":"vuelos "+r.flightTypeCode().trim())+" y "+(n(r.aircraftCategory())==null?"cualquier categoría":"categoría "+r.aircraftCategory().trim());}

 private CredentialPolicy transientPolicy(PolicyRow r,Prepared prepared){
  CredentialPolicy p=new CredentialPolicy();p.role=prepared.roleEntities().get(n(r.roleCode()));p.flightType=blank(r.flightTypeCode())==null?null:prepared.flightTypeEntities().get(r.flightTypeCode().trim());
  p.aircraftCategory=blank(r.aircraftCategory());p.credentialType=r.credentialType().trim();p.requiresJurisdiction=Boolean.TRUE.equals(r.requiresJurisdiction());p.requiresExternalCheck=Boolean.TRUE.equals(r.requiresExternalCheck());
  p.origin=blank(r.origin())==null?CredentialPolicy.INTERNAL:r.origin().trim();p.sourceReference=blank(r.sourceReference());p.notes=blank(r.notes());return p;
 }

 /** Simula la propuesta sobre los datos actuales. Sólo lee. */
 @Transactional(readOnly=true) public Report simulate(Proposal proposal){return analyze(proposal,prepare(proposal));}

 private Report analyze(Proposal proposal,Prepared prepared){
  List<Issue> issues=new ArrayList<>(prepared.issues());
  Map<String,List<CredentialPolicy>> proposedRules=new LinkedHashMap<>(),currentRules=new LinkedHashMap<>();List<RolePlan> plan=new ArrayList<>();
  for(String code:prepared.scope()){
   List<PolicyRow> rows=prepared.byRole().get(code);List<CredentialPolicy> active=policies.findActiveByRole(code);currentRules.put(code,active);
   List<CredentialPolicy> proposedList=new ArrayList<>();if(prepared.roleEntities().containsKey(code))for(PolicyRow r:rows)if(blank(r.flightTypeCode())==null||prepared.flightTypeEntities().containsKey(r.flightTypeCode().trim()))proposedList.add(transientPolicy(r,prepared));
   proposedRules.put(code,proposedList);
   Set<String> activeContent=new HashSet<>();for(CredentialPolicy p:active)activeContent.add(content(p));Set<String> proposedContent=new HashSet<>();for(PolicyRow r:rows)proposedContent.add(content(r));
   int keep=(int)rows.stream().filter(r->activeContent.contains(content(r))).count();
   int retire=(int)active.stream().filter(p->!proposedContent.contains(content(p))).count();
   plan.add(new RolePlan(code,active.size(),rows.size(),keep,rows.size()-keep,retire,!rows.isEmpty()));
  }
  // Cobertura: para cada función con política propuesta, cada tipo de vuelo activo y cada tipo de aeronave en uso debe tener al menos una política aplicable.
  List<String> aircraftTypes=new ArrayList<>();for(Object[] row:aircraft.countActiveByType())aircraftTypes.add((String)row[0]);
  List<Uncovered> uncovered=new ArrayList<>();
  List<FlightType> activeFlightTypes=flightTypes.findAll().stream().filter(t->Boolean.TRUE.equals(t.getActivo())).sorted(Comparator.comparing(FlightType::getCodigo)).toList();
  for(String code:prepared.scope()){
   List<CredentialPolicy> rules=proposedRules.get(code);if(rules.isEmpty())continue;
   for(FlightType ft:activeFlightTypes){
    if(aircraftTypes.isEmpty()){if(rules.stream().noneMatch(r->r.flightType==null||r.flightType.getCodigo().equals(ft.getCodigo())))uncovered.add(new Uncovered(code,ft.getCodigo(),null));continue;}
    for(String type:aircraftTypes)
     if(rules.stream().noneMatch(r->(r.flightType==null||r.flightType.getCodigo().equals(ft.getCodigo()))&&(r.aircraftCategory==null||Objects.equals(n(r.aircraftCategory),n(type)))))uncovered.add(new Uncovered(code,ft.getCodigo(),type));
   }
  }
  if(aircraftTypes.isEmpty())issues.add(info("SIN_AERONAVES","No hay aeronaves activas registradas: la cobertura por categoría de aeronave no puede comprobarse hasta cargarlas",null,null));
  else issues.add(info("CATEGORIAS_EN_USO","Categorías de aeronave en uso (valor libre de «tipo» de la aeronave): "+String.join(", ",aircraftTypes)+". Una política por categoría sólo se aplica si coincide con ese valor (sin tildes ni mayúsculas)",null,null));
  if(!uncovered.isEmpty())issues.add(warning("SIN_COBERTURA",uncovered.size()+" combinación(es) de función, tipo de vuelo y categoría de aeronave no tendrían ninguna política aplicable: esas operaciones quedarían no elegibles",null,null));
  // Tipos de habilitación verificados que ninguna política propuesta reconoce.
  Map<String,Long> unrecognized=new TreeMap<>();
  for(Object[] row:credentials.countVerifiedByRoleAndType()){
   String role=(String)row[0],type=(String)row[1];if(!prepared.scope().contains(role)||proposedRules.get(role).isEmpty())continue;
   if(proposedRules.get(role).stream().noneMatch(p->Objects.equals(n(p.credentialType),n(type))))unrecognized.merge(role+" / "+type,(Long)row[2],Long::sum);
  }
  if(!unrecognized.isEmpty())issues.add(warning("TIPOS_NO_RECONOCIDOS","Habilitaciones verificadas cuyo tipo ninguna política propuesta acepta (dejarían de ser suficientes): "+unrecognized,null,null));
  // Personas clasificadas: elegibilidad por suficiencia con la política vigente y con la propuesta (misma regla, sin contexto de vuelo).
  List<Transition> people=new ArrayList<>();
  for(String code:prepared.scope()){
   long becomeIneligible=0,becomeEligible=0,stayEligible=0,stayIneligible=0;Map<String,Long> codesAfter=new TreeMap<>();
   for(var q:qualifications.findByRoleCodigo(code)){
    User u=q.getUser();var before=assessor.assess(u,code,null,CredentialSufficiency.Context.ANY,currentRules.get(code));var after=assessor.assess(u,code,null,CredentialSufficiency.Context.ANY,proposedRules.get(code));
    if(before.eligible()&&!after.eligible())becomeIneligible++;else if(!before.eligible()&&after.eligible())becomeEligible++;else if(after.eligible())stayEligible++;else stayIneligible++;
    codesAfter.merge(after.code(),1L,Long::sum);
   }
   people.add(new Transition(code,becomeIneligible,becomeEligible,stayEligible,stayIneligible,codesAfter));
  }
  // Vuelos abiertos: cada integrante asignado, con el contexto real del vuelo (tipo y aeronave).
  long examined=0,newIncompat=0,resolved=0;List<FlightImpact> impacts=new ArrayList<>();
  // La misma persona figura en muchos vuelos con el mismo contexto: se evalúa una vez por (persona, función, fecha, tipo de vuelo, categoría).
  Map<String,ProfessionalCredentialService.Assessment[]> memo=new HashMap<>();
  Map<Long,List<FlightCrew>> crewByFlight=new HashMap<>();for(FlightCrew c:crews.activeCrewOfFlightsInStates(OPEN_STATES))crewByFlight.computeIfAbsent(c.getFlight().getId(),k->new ArrayList<>()).add(c);
  for(Flight f:flights.findByEstadoVueloCodigoIn(OPEN_STATES)){
   examined++;LocalDate on=f.getFechaPlanificadaSalida()==null?null:f.getFechaPlanificadaSalida().toLocalDate();var ctx=CrewManagementService.context(f,null);
   Map<Long,String> members=new TreeMap<>();if(f.getComandante()!=null)members.put(f.getComandante().getId(),"COMANDANTE");
   for(FlightCrew c:crewByFlight.getOrDefault(f.getId(),List.of()))if(!"COMANDANTE".equals(c.getCrewRole().getCodigo()))members.put(c.getUser().getId(),c.getCrewRole().getCodigo());
   for(var m:members.entrySet()){
    if(!prepared.scope().contains(m.getValue()))continue;
    User u=users.findById(m.getKey()).orElse(null);if(u==null)continue;
    String memoKey=u.getId()+"|"+m.getValue()+"|"+on+"|"+ctx.flightTypeCode()+"|"+ctx.aircraftCategory();
    ProfessionalCredentialService.Assessment[] pair=memo.computeIfAbsent(memoKey,k->new ProfessionalCredentialService.Assessment[]{assessor.assess(u,m.getValue(),on,ctx,currentRules.get(m.getValue())),assessor.assess(u,m.getValue(),on,ctx,proposedRules.get(m.getValue()))});
    var before=pair[0];var after=pair[1];
    boolean worse=before.eligible()&&!after.eligible(),better=!before.eligible()&&after.eligible();
    if(worse)newIncompat++;if(better)resolved++;
    if((worse||better||(!after.eligible()&&!before.eligible()))&&impacts.size()<IMPACT_LIST_LIMIT)impacts.add(new FlightImpact(f.getId(),f.getCodigo(),f.getEstadoVuelo().getCodigo(),u.getId(),u.getUsername(),m.getValue(),before.code(),after.code(),after.message()));
   }
  }
  if(newIncompat>0)issues.add(warning("INCOMPATIBILIDADES_EN_VUELOS",newIncompat+" integrante(s) de vuelos abiertos pasarían de elegibles a no elegibles; se emitirán alertas de revisión a Operaciones al activar",null,null));
  boolean errors=issues.stream().anyMatch(i->"ERROR".equals(i.severity()));
  List<String> pending=Optional.ofNullable(proposal.pendingDecisions()).orElse(List.of()).stream().filter(Objects::nonNull).map(d->Objects.toString(d.roleCode(),"-")+": "+Objects.toString(d.topic(),"")).toList();
  return new Report(fingerprint(proposal),!errors,newIncompat>0,issues,plan,uncovered,aircraftTypes,people,examined,newIncompat,resolved,impacts,pending,
   "Simulación: no se modificó ninguna política. La elegibilidad real exige además clasificación, perfil, disponibilidad y vigencia; aquí sólo se compara la suficiencia profesional.");
 }

 /** Activa el lote: atómico, sólo con la huella aprobada y sin errores; aplica la diferencia por función. */
 @Transactional public Activation activate(ActivationRequest request,Long actor){
  Proposal proposal=request.proposal();
  Prepared prepared=prepare(proposal);
  roles.lockByCodes(prepared.scope());
  String fingerprint=fingerprint(proposal);
  if(!fingerprint.equalsIgnoreCase(request.approvedFingerprint().trim()))throw conflict("HUELLA_NO_COINCIDE","La propuesta enviada no es la que se aprobó (la huella difiere): vuelva a simularla y aprobarla");
  if(blank(request.approvalReference())==null)throw new ApiException(HttpStatus.BAD_REQUEST,"APROBACION_REQUERIDA","Indique la referencia de la aprobación (acta, expediente o responsable)",Map.of());
  // El análisis sólo lee: sin volcados automáticos no se revisan cientos de entidades cargadas antes de cada consulta (costo cuadrático en una transacción de escritura).
  em.setFlushMode(jakarta.persistence.FlushModeType.COMMIT);
  Report report=analyze(proposal,prepared);
  em.setFlushMode(jakarta.persistence.FlushModeType.AUTO);
  if(!report.canActivate())throw new ApiException(HttpStatus.CONFLICT,"PROPUESTA_INVALIDA","La propuesta tiene errores que impiden activarla: "+report.issues().stream().filter(i->"ERROR".equals(i.severity())).map(Issue::code).distinct().toList(),Map.of("issues",report.issues().stream().filter(i->"ERROR".equals(i.severity())).toList()));
  if(report.requiresAcknowledgement()&&!Boolean.TRUE.equals(request.acknowledgeIncompatibilities()))throw conflict("INCOMPATIBILIDADES_SIN_RECONOCER",report.newIncompatibilities()+" integrante(s) de vuelos abiertos dejarían de ser elegibles; reconozca expresamente las incompatibilidades para activar");
  User by=users.findById(actor).orElseThrow();LocalDateTime now=LocalDateTime.ofInstant(clock.instant(),zone);String batch=UUID.randomUUID().toString();String approval=request.approvalReference().trim();
  List<Long> createdIds=new ArrayList<>(),retiredIds=new ArrayList<>();int kept=0;
  for(String code:prepared.scope()){
   List<PolicyRow> rows=prepared.byRole().get(code);Map<String,PolicyRow> wanted=new LinkedHashMap<>();for(PolicyRow r:rows)wanted.put(content(r),r);
   Set<String> alreadyActive=new HashSet<>();
   for(CredentialPolicy p:policies.findActiveByRole(code)){
    String c=content(p);
    if(wanted.containsKey(c)&&alreadyActive.add(c)){kept++;continue;}
    String before=snapshot(p);p.active=false;p.retiredBy=by;p.retiredAt=now;String why="Reemplazada por el lote "+batch+" ("+approval+")";p.retireReason=why.length()>500?why.substring(0,500):why;policies.saveAndFlush(p);retiredIds.add(p.getId());
    audit.record(null,by,"CREDENTIAL_POLICY",p.getId(),"DEACTIVATE",before,snapshot(p));
   }
   for(var entry:wanted.entrySet()){
    if(alreadyActive.contains(entry.getKey()))continue;
    CredentialPolicy p=transientPolicy(entry.getValue(),prepared);p.createdBy=by;p.createdAt=now;p.activationBatch=batch;p.approvalReference=approval.length()>500?approval.substring(0,500):approval;
    policies.saveAndFlush(p);createdIds.add(p.getId());audit.record(null,by,"CREDENTIAL_POLICY",p.getId(),"CREATE",null,snapshot(p));
   }
  }
  boolean changed=!createdIds.isEmpty()||!retiredIds.isEmpty();
  if(changed){
   Long anchor=!createdIds.isEmpty()?createdIds.get(0):retiredIds.get(0);
   audit.record(null,by,"CREDENTIAL_POLICY_BATCH",anchor,"ACTIVATE",null,"{\"batch\":\""+batch+"\",\"fingerprint\":\""+fingerprint+"\",\"roles\":\""+String.join(",",prepared.scope())+"\",\"created\":"+createdIds.size()+",\"retired\":"+retiredIds.size()+",\"kept\":"+kept+",\"approval\":\""+approval.replace("\\","\\\\").replace("\"","'")+"\",\"acknowledgedIncompatibilities\":"+Boolean.TRUE.equals(request.acknowledgeIncompatibilities())+"}");
   if(publisher!=null)publisher.publishEvent(new CredentialPolicyService.PolicyChanged(anchor));
  }
  return new Activation(batch,changed,createdIds.size(),retiredIds.size(),kept,createdIds,retiredIds,report);
 }
 private String snapshot(CredentialPolicy p){return "{\"role\":\""+p.role.getCodigo()+"\",\"flightType\":\""+(p.flightType==null?"":p.flightType.getCodigo())+"\",\"aircraftCategory\":\""+Objects.toString(p.aircraftCategory,"").replace("\"","'")+"\",\"credentialType\":\""+p.credentialType.replace("\"","'")+"\",\"origin\":\""+p.origin+"\",\"active\":"+p.active+(p.activationBatch==null?"":",\"batch\":\""+p.activationBatch+"\"")+"}";}
}
