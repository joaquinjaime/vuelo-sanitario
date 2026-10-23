package com.vuelossanitarios.backend.domain.person;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity @jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_correos_electronicos"))
@Table(name = "correos_electronicos")
public class EmailContact extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "id_personas", nullable = false) private Person person;
    @Column(name = "direccion", nullable = false, length = 150) private String direccion;
    @Column(name = "tipo_correo_electronico", nullable = false, length = 30) private String tipo = "PERSONAL";
    @Column(name = "es_principal", nullable = false) private Boolean principal = false;
    @Column(name = "fecha_creacion", nullable = false, updatable = false) private LocalDateTime createdAt;
    @Column(name = "fecha_actualizacion", nullable = false) private LocalDateTime updatedAt;
    @PrePersist void created(){ createdAt=LocalDateTime.now(); updatedAt=createdAt; }
    @PreUpdate void updated(){ updatedAt=LocalDateTime.now(); }
    public Person getPerson(){return person;} public void setPerson(Person v){person=v;}
    public String getDireccion(){return direccion;} public void setDireccion(String v){direccion=v;}
    public String getTipo(){return tipo;} public void setTipo(String v){tipo=v;}
    public Boolean getPrincipal(){return principal;} public void setPrincipal(Boolean v){principal=v;}
}
