package com.vuelossanitarios.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.catalog.Airport;
import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

@Service
public class Aa2000CoordinationService {
    public record Input(@NotNull @Min(0) Integer version, @NotNull Long aeropuertoId,
        @NotBlank @Size(max=200) String finalidad, @NotBlank @Size(max=4000) String descripcion,
        @NotBlank String estado, LocalDateTime fechaSlot, @Size(max=150) String contacto,
        @Size(max=100) String canal, LocalDateTime fechaComunicacion, LocalDateTime fechaRespuesta,
        @Size(max=250) String fuenteRespuesta, @Size(max=250) String referenciaExterna,
        @Size(max=4000) String observaciones, @Size(max=1000) String motivoCambio) {}
    public record Version(UUID gestionId,Long id,int version,boolean actual,Long aeropuertoId,String aeropuerto,
        String finalidad,String descripcion,String estado,String estadoVigencia,LocalDateTime fechaSlot,String contacto,
        String canal,LocalDateTime fechaComunicacion,LocalDateTime fechaRespuesta,String fuenteRespuesta,
        String referenciaExterna,String observaciones,String contextoPlanificacion,String motivoCambio,
        String responsable,LocalDateTime fechaCreacion) {}
    public record View(boolean puedeGestionar,String motivo,String origen,String destino,String aeronave,
        LocalDateTime salida,LocalDateTime llegada,List<Version> versiones) {}
    private static final Set<String> STATES=Set.of("PENDIENTE","EN_SEGUIMIENTO","CONFIRMADO","RECHAZADO","CANCELADO");
    private final FlightRepository flights; private final Aa2000CoordinationRepository records;
    private final AirportRepository airports; private final UserRepository users; private final AuditService audit;
    private final ObjectMapper json; private final Clock clock;
    public Aa2000CoordinationService(FlightRepository flights,Aa2000CoordinationRepository records,AirportRepository airports,UserRepository users,AuditService audit,ObjectMapper json,Clock clock){this.flights=flights;this.records=records;this.airports=airports;this.users=users;this.audit=audit;this.json=json;this.clock=clock;}

    @Transactional(readOnly=true) public View get(Long id,Long actor){Flight f=flight(id,false);User u=user(actor);if(!canRead(f,u))throw forbidden();return view(f,u);}

    @Transactional public Version create(Long id,Long actor,Input input){
        Flight f=flight(id,true);User u=user(actor);if(!operations(u))throw forbidden();requireMutable(f);validate(input);
        if(input.version()!=0||!"PENDIENTE".equals(input.estado()))throw bad("Una gestión nueva comienza pendiente con versión cero");
        Airport airport=activeAirport(input.aeropuertoId());
        checkDuplicate(f,airport,input.finalidad(),null);
        Aa2000Coordination r=new Aa2000Coordination();r.setGestionId(UUID.randomUUID());r.setFlight(f);r.setVersion(1);
        fill(r,f,u,airport,input);records.saveAndFlush(r);audit.record(f,u,"AA2000_COORDINATION",r.getId(),"CREATE",null,serialize(snapshot(r,f)));
        return snapshot(r,f);
    }

    @Transactional public Version update(Long id,UUID group,Long actor,Input input){
        Aa2000Coordination preview=records.findByFlightIdAndGestionIdAndEsVersionActualTrue(id,group).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Gestión inexistente"));
        boolean legacy=preview.getAeropuerto()==null||preview.getFinalidad()==null;
        Flight f=(legacy?flights.lockById(id):flights.readLockedById(id)).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Vuelo inexistente"));User u=user(actor);if(!operations(u))throw forbidden();requireMutable(f);validate(input);
        Aa2000Coordination old=records.lockCurrent(id,group).orElseThrow(()->new ApiException(HttpStatus.CONFLICT,"La gestión cambió o ya no existe; vuelva a cargarla"));
        if(input.version()!=old.getVersion())throw new ApiException(HttpStatus.CONFLICT,"La gestión cambió; vuelva a cargarla antes de guardar");
        Airport airport;
        if(old.getAeropuerto()==null||old.getFinalidad()==null){if(!legacy)throw new ApiException(HttpStatus.CONFLICT,"La gestión cambió; vuelva a cargarla");airport=activeAirport(input.aeropuertoId());checkDuplicate(f,airport,input.finalidad(),group);}
        else {airport=old.getAeropuerto();if(!Objects.equals(airport.getId(),input.aeropuertoId())||!old.getFinalidad().equalsIgnoreCase(input.finalidad().trim()))throw bad("El aeropuerto y la finalidad identifican la gestión; registre otra si cambian");}
        if(!transition(old.getEstadoAutorizacion(),input.estado()))throw bad("Transición de seguimiento no permitida");
        if(input.motivoCambio()==null||input.motivoCambio().isBlank())throw bad("Indique el motivo del cambio");
        String before=serialize(snapshot(old,f));old.setEsVersionActual(false);records.saveAndFlush(old);
        Aa2000Coordination r=new Aa2000Coordination();r.setFlight(f);r.setGestionId(group);r.setVersion(old.getVersion()+1);
        fill(r,f,u,airport,input);records.saveAndFlush(r);
        audit.record(f,u,"AA2000_COORDINATION",r.getId(),"UPDATE",before,serialize(snapshot(r,f)));return snapshot(r,f);
    }
    private void validate(Input i){
        if(i.version()==null||i.aeropuertoId()==null||i.finalidad()==null||i.finalidad().isBlank()||i.descripcion()==null||i.descripcion().isBlank()||!STATES.contains(i.estado()))throw bad("Complete aeropuerto, finalidad, descripción y estado válido");
        LocalDateTime now=LocalDateTime.now(clock);
        if(i.fechaComunicacion()!=null&&i.fechaComunicacion().isAfter(now)||i.fechaRespuesta()!=null&&i.fechaRespuesta().isAfter(now))throw bad("Las comunicaciones y respuestas no pueden estar en el futuro");
        if(i.fechaRespuesta()!=null&&(i.fechaComunicacion()==null||i.fechaRespuesta().isBefore(i.fechaComunicacion())))throw bad("La respuesta debe ser posterior o igual a la comunicación");
        if(i.fechaComunicacion()!=null&&(blank(i.canal())||blank(i.contacto())))throw bad("La comunicación requiere canal y contacto");
        if("EN_SEGUIMIENTO".equals(i.estado())&&(i.fechaComunicacion()==null||blank(i.canal())||blank(i.contacto())))throw bad("El seguimiento requiere una comunicación documentada");
        if(Set.of("CONFIRMADO","RECHAZADO").contains(i.estado())&&(i.fechaRespuesta()==null||i.fechaComunicacion()==null||blank(i.canal())||blank(i.contacto())||blank(i.fuenteRespuesta())))throw bad("La respuesta declarada requiere comunicación, fecha y fuente verificable");
        if(!Set.of("CONFIRMADO","RECHAZADO").contains(i.estado())&&(i.fechaRespuesta()!=null||!blank(i.fuenteRespuesta())))throw bad("La respuesta corresponde a una confirmación o rechazo declarado");
    }
    private void fill(Aa2000Coordination r,Flight f,User u,Airport airport,Input i){r.setAeropuerto(airport);r.setFinalidad(i.finalidad().trim());r.setDescripcion(i.descripcion().trim());r.setEstadoAutorizacion(i.estado());r.setFechaSlot(i.fechaSlot());r.setContactoAa2000(clean(i.contacto()));r.setCanal(clean(i.canal()));r.setFechaComunicacion(i.fechaComunicacion());r.setFechaRespuesta(i.fechaRespuesta());r.setFuenteRespuesta(clean(i.fuenteRespuesta()));r.setReferenciaExterna(clean(i.referenciaExterna()));r.setObservaciones(clean(i.observaciones()));r.setMotivoCambio(clean(i.motivoCambio()));r.setContexto(context(f));r.setRegistradoPor(u);}
    private View view(Flight f,User u){boolean writable=mutable(f);return new View(operations(u)&&writable,writable?null:"El vuelo finalizado o cancelado conserva las gestiones en consulta",f.getOrigen()==null?null:f.getOrigen().getNombre(),f.getDestino()==null?null:f.getDestino().getNombre(),f.getAircraft()==null?null:f.getAircraft().getMatricula(),f.getFechaPlanificadaSalida(),f.getFechaPlanificadaLlegada(),records.findByFlightIdOrderByCreatedAtDesc(f.getId()).stream().map(r->snapshot(r,f)).toList());}
    private Version snapshot(Aa2000Coordination r,Flight f){boolean current=Boolean.TRUE.equals(r.getEsVersionActual());String validity=!current?"HISTORICA":r.getContexto()==null||!Objects.equals(r.getContexto(),context(f))?"REQUIERE_REVISION":"VIGENTE";return new Version(r.getGestionId(),r.getId(),r.getVersion(),current,id(r.getAeropuerto()),r.getAeropuerto()==null?null:r.getAeropuerto().getNombre(),r.getFinalidad(),r.getDescripcion(),r.getEstadoAutorizacion(),validity,r.getFechaSlot(),r.getContactoAa2000(),r.getCanal(),r.getFechaComunicacion(),r.getFechaRespuesta(),r.getFuenteRespuesta(),r.getReferenciaExterna(),r.getObservaciones(),r.getContexto(),r.getMotivoCambio(),r.getRegistradoPor().getUsername(),r.getCreatedAt());}
    private void checkDuplicate(Flight f,Airport a,String purpose,UUID except){boolean exists=records.findByFlightIdAndEsVersionActualTrue(f.getId()).stream().anyMatch(r->!Objects.equals(r.getGestionId(),except)&&r.getAeropuerto()!=null&&Objects.equals(id(r.getAeropuerto()),id(a))&&r.getFinalidad()!=null&&r.getFinalidad().equalsIgnoreCase(purpose.trim())&&!Set.of("CANCELADO","RECHAZADO").contains(r.getEstadoAutorizacion()));if(exists)throw new ApiException(HttpStatus.CONFLICT,"Ya existe una gestión activa con ese aeropuerto y finalidad");}
    private boolean transition(String from,String to){if(Objects.equals(from,to))return !"CANCELADO".equals(from);return switch(from){case "PENDIENTE" -> Set.of("EN_SEGUIMIENTO","CONFIRMADO","RECHAZADO","CANCELADO").contains(to);case "EN_SEGUIMIENTO" -> Set.of("CONFIRMADO","RECHAZADO","CANCELADO").contains(to);case "CONFIRMADO" -> Set.of("EN_SEGUIMIENTO","CANCELADO").contains(to);case "RECHAZADO" -> "CANCELADO".equals(to);default -> false;};}
    private String context(Flight f){return String.join("|",String.valueOf(id(f.getAircraft())),String.valueOf(id(f.getOrigen())),String.valueOf(id(f.getDestino())),String.valueOf(f.getFechaPlanificadaSalida()),String.valueOf(f.getFechaPlanificadaLlegada()));}
    private Long id(BaseEntity e){return e==null?null:e.getId();}
    private Airport activeAirport(Long id){return airports.findById(id).filter(a->Boolean.TRUE.equals(a.getActivo())).orElseThrow(()->bad("Aeropuerto inexistente o inactivo"));}
    private Flight flight(Long id,boolean lock){return (lock?flights.lockById(id):flights.findById(id)).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Vuelo inexistente"));}
    private boolean mutable(Flight f){if(f.getEstadoVuelo()!=null)return !Set.of("CANCELADO","FINALIZADO","COMPLETADO").contains(f.getEstadoVuelo().getCodigo());return f.getSanitario()!=null&&f.getSanitario().getEstadoSolicitud()!=null&&!"RECHAZADO".equals(f.getSanitario().getEstadoSolicitud().getCodigo());}
    private void requireMutable(Flight f){if(!mutable(f))throw bad("El vuelo no admite cambios en su estado actual");}
    private User user(Long id){User u=users.findById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Usuario inexistente"));return users.findWithRolesByUsername(u.getUsername()).orElseThrow();}
    private boolean role(User u,String... codes){return u.getUserRoles().stream().anyMatch(r->Arrays.asList(codes).contains(r.getRole().getCodigo()));}
    private boolean operations(User u){return role(u,"OPERACIONES","CENTRO_OPERACIONES");}
    private boolean canRead(Flight f,User u){return operations(u)||role(u,"ADMINISTRADOR")||role(u,"COMANDANTE")&&f.getComandante()!=null&&Objects.equals(id(f.getComandante()),id(u));}
    private boolean blank(String s){return s==null||s.isBlank();} private String clean(String s){return blank(s)?null:s.trim();}
    private String serialize(Object o){try{return json.writeValueAsString(o);}catch(JsonProcessingException e){throw new IllegalStateException(e);}}
    private ApiException bad(String s){return new ApiException(HttpStatus.BAD_REQUEST,s);}private ApiException forbidden(){return new ApiException(HttpStatus.FORBIDDEN,"No tiene permiso para las coordinaciones de este vuelo");}
}
