package com.vuelossanitarios.backend.domain.flight;
import com.vuelossanitarios.backend.domain.catalog.Locality;
import com.vuelossanitarios.backend.domain.catalog.Province;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;
/** Asignación excepcional de un comandante fuera de la localidad de salida (V63): quién la autorizó, por qué y en qué situación geográfica estaba. Historial: no se borra. */
@Entity @Table(name="excepciones_geograficas_comandante") public class CommanderGeographicException {
 public static final String UNKNOWN="UBICACION_DESCONOCIDA", INCOMPLETE="UBICACION_INCOMPLETA", DISABLED="LOCALIDAD_DESHABILITADA", OTHER_LOCALITY="OTRA_LOCALIDAD", OTHER_PROVINCE="OTRA_PROVINCIA";
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) @Column(name="id_excepciones_geograficas") private Long id;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_vuelos") private Flight flight;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_usuario_comandante") private User commander;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_localidad_salida") private Locality departureLocality;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_localidad_comandante") private Locality commanderLocality;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_provincia_comandante") private Province commanderProvince;
 @Column(name="tipo_excepcion",nullable=false,length=40) private String type;
 @Column(name="motivo",nullable=false,length=500) private String reason;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_usuario_autoriza") private User authorizedBy;
 @Column(name="fecha_autorizacion",nullable=false) private LocalDateTime authorizedAt;
 @Column(name="fecha_reemplazo") private LocalDateTime replacedAt;
 public Long getId(){return id;} public Flight getFlight(){return flight;} public void setFlight(Flight v){flight=v;} public User getCommander(){return commander;} public void setCommander(User v){commander=v;}
 public Locality getDepartureLocality(){return departureLocality;} public void setDepartureLocality(Locality v){departureLocality=v;} public Locality getCommanderLocality(){return commanderLocality;} public void setCommanderLocality(Locality v){commanderLocality=v;}
 public Province getCommanderProvince(){return commanderProvince;} public void setCommanderProvince(Province v){commanderProvince=v;} public String getType(){return type;} public void setType(String v){type=v;}
 public String getReason(){return reason;} public void setReason(String v){reason=v;} public User getAuthorizedBy(){return authorizedBy;} public void setAuthorizedBy(User v){authorizedBy=v;}
 public LocalDateTime getAuthorizedAt(){return authorizedAt;} public void setAuthorizedAt(LocalDateTime v){authorizedAt=v;} public LocalDateTime getReplacedAt(){return replacedAt;} public void setReplacedAt(LocalDateTime v){replacedAt=v;}
}
