package com.vuelossanitarios.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.flight.HangarInfo;
import com.vuelossanitarios.backend.domain.catalog.Aircraft;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.FlightRepository;
import com.vuelossanitarios.backend.repository.AircraftRepository;
import com.vuelossanitarios.backend.repository.HangarInfoRepository;
import com.vuelossanitarios.backend.repository.UserRepository;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;

@Service
public class HangarInfoService {
    public record OperationsInput(@NotNull @Min(0) Integer version, @NotNull Boolean requiereHangar,
                                  @NotNull Boolean preparacionCompleta, @Size(max=4000) String observaciones) {}
    public record CommanderInput(@NotNull @Min(1) Integer version, @NotBlank @Size(max=4000) String observaciones) {}
    public record Version(Long id, Integer version, Boolean requiereHangar, Boolean preparacionCompleta,
                          String observaciones, String observacionesComandante, BigDecimal combustibleHistorico,
                          Long aeronaveContextoId, Long origenContextoId, Long comandanteContextoId, String responsable,
                          LocalDateTime fechaCreacion, boolean actual) {}
    public record View(String estado, boolean puedeGestionar, boolean puedeObservar, String motivo,
                       String aeronave, String origenPlanificado, String ubicacionConfirmada,
                       List<Version> versiones) {}

    private final CommanderReportAccessService commanderAccess;
    private final FlightRepository flights;
    private final HangarInfoRepository records;
    private final AircraftRepository aircraft;
    private final UserRepository users;
    private final AuditService audit;
    private final ObjectMapper json;

    public HangarInfoService(FlightRepository flights, HangarInfoRepository records, AircraftRepository aircraft, UserRepository users, AuditService audit, ObjectMapper json, CommanderReportAccessService commanderAccess) {
        this.commanderAccess=commanderAccess;
        this.flights=flights; this.records=records; this.aircraft=aircraft; this.users=users; this.audit=audit; this.json=json;
    }

    @Transactional(readOnly=true)
    public View get(Long id, Long actor) {
        Flight flight=flight(id, false); User user=user(actor);
        if (!operations(user) && !role(user,"ADMINISTRADOR") && !commander(flight,user)) throw forbidden();
        return view(flight,user);
    }

    @Transactional
    public View save(Long id, Long actor, OperationsInput input) {
        Flight flight=flight(id, true); User user=user(actor);
        if (!operations(user)) throw forbidden();
        requireMutable(flight);
        if (input.version()==null || input.requiereHangar()==null || input.preparacionCompleta()==null) throw bad("Faltan datos de preparación");
        if (!input.requiereHangar() && input.preparacionCompleta()) throw bad("No corresponde marcar preparación completa si no se requiere hangar");
        if (input.requiereHangar() && input.preparacionCompleta()) {
            if (flight.getEstadoVuelo()!=null && "EN_CURSO".equals(flight.getEstadoVuelo().getCodigo())) throw bad("La preparación de salida sólo puede completarse antes del inicio");
            if (flight.getAircraft()==null || flight.getOrigen()==null) throw bad("La preparación completa requiere aeronave y aeropuerto de origen");
            Aircraft plane=aircraft.lockById(flight.getAircraft().getId()).orElseThrow(()->bad("Aeronave inexistente"));
            if (plane.getAeropuertoActual()==null || !flight.getOrigen().getId().equals(plane.getAeropuertoActual().getId()))
                throw new ApiException(HttpStatus.CONFLICT,"La ubicación confirmada de la aeronave no coincide con el origen planificado");
        }
        HangarInfo old=current(id); checkVersion(old,input.version());
        HangarInfo next=next(flight,user,old);
        if (old!=null && !contextMatches(flight,old)) next.setObservacionesComandante(null);
        next.setRequiereHangar(input.requiereHangar()); next.setPreparacionCompleta(input.preparacionCompleta());
        next.setObservaciones(clean(input.observaciones()));
        persist(flight,user,old,next,old==null?"CREATE":"UPDATE");
        return view(flight,user);
    }

    @Transactional
    public View observe(Long id, Long actor, CommanderInput input) {
        Flight flight=flight(id,true); User user=user(actor);
        if (!commander(flight,user)) throw forbidden();
        commanderAccess.requireOperationalAccess(actor);
        requireMutable(flight);
        HangarInfo old=current(id); checkVersion(old,input.version());
        if (old==null || old.getRequiereHangar()==null || !contextMatches(flight,old)) throw bad("Operaciones debe registrar o revisar primero la información de hangar");
        if (input.observaciones()==null || input.observaciones().isBlank()) throw bad("Ingrese una observación");
        HangarInfo next=next(flight,user,old); next.setObservacionesComandante(input.observaciones().trim());
        persist(flight,user,old,next,"COMMANDER_OBSERVATION"); return view(flight,user);
    }

    private HangarInfo next(Flight f,User u,HangarInfo old) {
        HangarInfo n=new HangarInfo(); n.setFlight(f); n.setRegistradoPor(u); n.setVersion(old==null?1:old.getVersion()+1);
        n.setAeronaveContexto(f.getAircraft()); n.setOrigenContexto(f.getOrigen()); n.setComandanteContexto(f.getComandante());
        if(old!=null){n.setRequiereHangar(old.getRequiereHangar()); n.setPreparacionCompleta(old.getPreparacionCompleta());
            n.setObservaciones(old.getObservaciones()); n.setObservacionesComandante(old.getObservacionesComandante()); n.setCombustibleLitros(old.getCombustibleLitros());}
        return n;
    }
    private void persist(Flight f,User u,HangarInfo old,HangarInfo n,String op) {
        String before=old==null?null:serialize(snapshot(old));
        if(old!=null){old.setEsVersionActual(false); records.saveAndFlush(old);}
        records.saveAndFlush(n); audit.record(f,u,"HANGAR_INFO",n.getId(),op,before,serialize(snapshot(n)));
    }
    private View view(Flight f,User u) {
        List<HangarInfo> history=records.findByFlightIdOrderByVersionDesc(f.getId());
        HangarInfo current=history.stream().filter(x->Boolean.TRUE.equals(x.getEsVersionActual())).findFirst().orElse(null);
        boolean beforeDeparture=f.getFechaSalidaReal()==null&&f.getFechaCancelacion()==null;
        boolean locationMismatch=current!=null&&Boolean.TRUE.equals(current.getRequiereHangar())&&Boolean.TRUE.equals(current.getPreparacionCompleta())&&beforeDeparture&&(f.getAircraft()==null||f.getOrigen()==null||f.getAircraft().getAeropuertoActual()==null||!Objects.equals(id(f.getOrigen()),id(f.getAircraft().getAeropuertoActual())));
        String state=current==null?"SIN_REGISTRO":current.getRequiereHangar()==null||!contextMatches(f,current)||locationMismatch?"REQUIERE_REVISION":!current.getRequiereHangar()?"NO_REQUERIDO":Boolean.TRUE.equals(current.getPreparacionCompleta())?"PREPARACION_COMPLETA":"PREPARACION_PENDIENTE";
        boolean mutable=mutable(f);
        String aircraft=f.getAircraft()==null?null:f.getAircraft().getMatricula();
        String origin=f.getOrigen()==null?null:f.getOrigen().getNombre();
        String location=f.getAircraft()==null||f.getAircraft().getAeropuertoActual()==null?null:f.getAircraft().getAeropuertoActual().getNombre();
        return new View(state,operations(u)&&mutable,commander(f,u)&&mutable&&current!=null&&current.getRequiereHangar()!=null&&contextMatches(f,current),mutable?null:"La información se conserva sin cambios tras la cancelación o finalización",aircraft,origin,location,history.stream().map(this::snapshot).toList());
    }
    private Version snapshot(HangarInfo r) {return new Version(r.getId(),r.getVersion(),r.getRequiereHangar(),r.getPreparacionCompleta(),r.getObservaciones(),r.getObservacionesComandante(),r.getCombustibleLitros(),id(r.getAeronaveContexto()),id(r.getOrigenContexto()),id(r.getComandanteContexto()),r.getRegistradoPor().getUsername(),r.getCreatedAt(),Boolean.TRUE.equals(r.getEsVersionActual()));}
    private Long id(com.vuelossanitarios.backend.domain.common.BaseEntity e){return e==null?null:e.getId();}
    private boolean contextMatches(Flight f,HangarInfo r){return Objects.equals(id(f.getAircraft()),id(r.getAeronaveContexto()))&&Objects.equals(id(f.getOrigen()),id(r.getOrigenContexto()))&&Objects.equals(id(f.getComandante()),id(r.getComandanteContexto()));}
    private boolean mutable(Flight f){if(f.getEstadoVuelo()!=null)return !Set.of("CANCELADO","FINALIZADO","COMPLETADO").contains(f.getEstadoVuelo().getCodigo());return f.getSanitario()!=null&&f.getSanitario().getEstadoSolicitud()!=null&&!"RECHAZADO".equals(f.getSanitario().getEstadoSolicitud().getCodigo());}
    private void requireMutable(Flight f){if(!mutable(f))throw bad("El vuelo no admite cambios en su estado actual");}
    private void checkVersion(HangarInfo r,Integer version){if(version==null||version!=(r==null?0:r.getVersion()))throw new ApiException(HttpStatus.CONFLICT,"La información cambió; vuelva a cargarla antes de guardar");}
    private HangarInfo current(Long id){return records.findByFlightIdAndEsVersionActualTrue(id).orElse(null);}
    private Flight flight(Long id,boolean lock){return (lock?flights.lockById(id):flights.findById(id)).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Vuelo inexistente"));}
    private User user(Long id){User u=users.findById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Usuario inexistente"));return users.findWithRolesByUsername(u.getUsername()).orElseThrow();}
    private boolean role(User u,String... roles){return u.getUserRoles().stream().anyMatch(r->Arrays.asList(roles).contains(r.getRole().getCodigo()));}
    private boolean operations(User u){return role(u,"OPERACIONES","CENTRO_OPERACIONES");}
    private boolean commander(Flight f,User u){return role(u,"COMANDANTE")&&f.getComandante()!=null&&Objects.equals(f.getComandante().getId(),u.getId());}
    private String clean(String s){return s==null||s.isBlank()?null:s.trim();}
    private String serialize(Object value){try{return json.writeValueAsString(value);}catch(JsonProcessingException e){throw new IllegalStateException(e);}}
    private ApiException bad(String message){return new ApiException(HttpStatus.BAD_REQUEST,message);}
    private ApiException forbidden(){return new ApiException(HttpStatus.FORBIDDEN,"No tiene permiso para esta operación de hangar");}
}
