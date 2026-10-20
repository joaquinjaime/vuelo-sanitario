package com.vuelossanitarios.backend.domain.flight;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.*;
/** Entradas históricas por campo y acontecimientos operativos inmutables. */
@Entity @Table(name="bitacora_vuelos")
public class FlightAuditLog {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) @Column(name="id_bitacora_vuelos") private Long id;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_vuelos",nullable=false) private Flight flight;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_usuarios") private User usuario;
 @Column(name="campo",nullable=false,length=100) private String campo;
 @Column(name="valor_anterior",columnDefinition="NVARCHAR(MAX)") private String valorAnterior;
 @Column(name="valor_nuevo",columnDefinition="NVARCHAR(MAX)") private String valorNuevo;
 @CreationTimestamp @Column(name="fecha_cambio",nullable=false,updatable=false) private LocalDateTime fechaCambio;
 @Column(name="tipo_acontecimiento",length=40,updatable=false) private String tipo;
 @Column(name="descripcion_operativa",length=4000,updatable=false) private String descripcion;
 @Column(name="fecha_acontecimiento",columnDefinition="DATETIMEOFFSET(3)",updatable=false) private OffsetDateTime ocurrido;
 @Column(name="fecha_registro_operativo",columnDefinition="DATETIMEOFFSET(3)",updatable=false) private OffsetDateTime registrado;
 @Column(name="origen_acontecimiento",length=12,updatable=false) private String origen;
 @Column(name="importancia",length=12,updatable=false) private String importancia;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_entrada_corregida",updatable=false) private FlightAuditLog correccionDe;
 @Column(name="motivo_correccion",length=1000,updatable=false) private String motivoCorreccion;
 public Long getId(){return id;} public Flight getFlight(){return flight;} public void setFlight(Flight x){flight=x;}
 public User getUsuario(){return usuario;} public void setUsuario(User x){usuario=x;}
 public String getCampo(){return campo;} public void setCampo(String x){campo=x;}
 public String getValorAnterior(){return valorAnterior;} public void setValorAnterior(String x){valorAnterior=x;}
 public String getValorNuevo(){return valorNuevo;} public void setValorNuevo(String x){valorNuevo=x;}
 public LocalDateTime getFechaCambio(){return fechaCambio;} public void setFechaCambio(LocalDateTime x){fechaCambio=x;}
 public String getTipo(){return tipo;} public void setTipo(String x){tipo=x;}
 public String getDescripcion(){return descripcion;} public void setDescripcion(String x){descripcion=x;}
 public OffsetDateTime getOcurrido(){return ocurrido;} public void setOcurrido(OffsetDateTime x){ocurrido=x;}
 public OffsetDateTime getRegistrado(){return registrado;} public void setRegistrado(OffsetDateTime x){registrado=x;}
 public String getOrigen(){return origen;} public void setOrigen(String x){origen=x;}
 public String getImportancia(){return importancia;} public void setImportancia(String x){importancia=x;}
 public FlightAuditLog getCorreccionDe(){return correccionDe;} public void setCorreccionDe(FlightAuditLog x){correccionDe=x;}
 public String getMotivoCorreccion(){return motivoCorreccion;} public void setMotivoCorreccion(String x){motivoCorreccion=x;}
}
