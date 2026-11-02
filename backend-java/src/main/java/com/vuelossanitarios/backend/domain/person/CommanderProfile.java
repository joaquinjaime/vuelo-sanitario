package com.vuelossanitarios.backend.domain.person;
import jakarta.persistence.*;
import com.vuelossanitarios.backend.domain.catalog.Locality;
import com.vuelossanitarios.backend.domain.catalog.Province;
import com.vuelossanitarios.backend.domain.user.User;
import java.time.LocalDateTime;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
/**
 * Perfil del comandante. La ubicación operativa actual (dónde se encuentra para ser asignado) es distinta del domicilio habitual, que no se registra aquí:
 * {@code provinciaActual} es la provincia de la localidad (la base impide que difieran) y {@code localidadActual} NULL significa localidad desconocida
 * (perfiles anteriores a V63 con sólo provincia, o sin ubicación). Quién y cuándo la fijó consta en {@code ubicacionActualizadaPor/En}.
 */
@Entity @Table(name="perfiles_comandante") public class CommanderProfile {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) @Column(name="id_perfiles_comandante") private Long id;
 @OneToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_personas", unique=true) private Person person;
 @Column(name="numero_licencia",nullable=false,length=50) private String licenseNumber;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_provincias") private Province provinciaActual;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_localidades_actual") private Locality localidadActual;
 @Column(name="fecha_ubicacion_actual") private LocalDateTime ubicacionActualizadaEn;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_usuario_ubicacion") private User ubicacionActualizadaPor;
 @CreationTimestamp @Column(name="fecha_creacion",nullable=false,updatable=false) private LocalDateTime createdAt;
 @UpdateTimestamp @Column(name="fecha_actualizacion",nullable=false) private LocalDateTime updatedAt;
 public Long getId(){return id;}
 public Person getPerson(){return person;} public void setPerson(Person v){person=v;} public String getLicenseNumber(){return licenseNumber;} public void setLicenseNumber(String v){licenseNumber=v;}
 public Province getProvinciaActual(){return provinciaActual;} public void setProvinciaActual(Province v){provinciaActual=v;}
 public Locality getLocalidadActual(){return localidadActual;} public void setLocalidadActual(Locality v){localidadActual=v;}
 public LocalDateTime getUbicacionActualizadaEn(){return ubicacionActualizadaEn;} public void setUbicacionActualizadaEn(LocalDateTime v){ubicacionActualizadaEn=v;}
 public User getUbicacionActualizadaPor(){return ubicacionActualizadaPor;} public void setUbicacionActualizadaPor(User v){ubicacionActualizadaPor=v;}
}
