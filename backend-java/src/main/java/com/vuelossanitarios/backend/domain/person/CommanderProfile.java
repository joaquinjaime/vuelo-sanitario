package com.vuelossanitarios.backend.domain.person;
import jakarta.persistence.*;
import com.vuelossanitarios.backend.domain.catalog.Province;
import java.time.LocalDateTime;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
@Entity @Table(name="perfiles_comandante") public class CommanderProfile {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) @Column(name="id_perfiles_comandante") private Long id;
 @OneToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_personas", unique=true) private Person person;
 @Column(name="numero_licencia",nullable=false,length=50) private String licenseNumber;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_provincias") private Province provinciaActual;
 @CreationTimestamp @Column(name="fecha_creacion",nullable=false,updatable=false) private LocalDateTime createdAt;
 @UpdateTimestamp @Column(name="fecha_actualizacion",nullable=false) private LocalDateTime updatedAt;
 public Person getPerson(){return person;} public void setPerson(Person v){person=v;} public String getLicenseNumber(){return licenseNumber;} public void setLicenseNumber(String v){licenseNumber=v;}
 public Province getProvinciaActual(){return provinciaActual;} public void setProvinciaActual(Province v){provinciaActual=v;}
}
