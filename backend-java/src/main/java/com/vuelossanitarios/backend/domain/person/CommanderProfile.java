package com.vuelossanitarios.backend.domain.person;
import jakarta.persistence.*;
import com.vuelossanitarios.backend.domain.catalog.Province;
import java.time.LocalDateTime;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
@Entity @Table(name="perfiles_comandante") public class CommanderProfile {
 @Id @Column(name="persona_id") private UUID id;
 @OneToOne(fetch=FetchType.LAZY) @MapsId @JoinColumn(name="persona_id") private Person person;
 @Column(name="numero_licencia",nullable=false,length=50) private String licenseNumber;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="provincia_actual_id") private Province provinciaActual;
 @CreationTimestamp @Column(name="fecha_creacion",nullable=false,updatable=false) private LocalDateTime createdAt;
 @UpdateTimestamp @Column(name="fecha_actualizacion",nullable=false) private LocalDateTime updatedAt;
 public Person getPerson(){return person;} public void setPerson(Person v){person=v;} public String getLicenseNumber(){return licenseNumber;} public void setLicenseNumber(String v){licenseNumber=v;}
 public Province getProvinciaActual(){return provinciaActual;} public void setProvinciaActual(Province v){provinciaActual=v;}
}
