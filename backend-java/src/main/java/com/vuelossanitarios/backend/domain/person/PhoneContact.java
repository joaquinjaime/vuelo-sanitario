package com.vuelossanitarios.backend.domain.person;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity @jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_telefonos"))
@Table(name = "telefonos")
public class PhoneContact extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "id_personas", nullable = false) private Person person;
    @Column(name = "numero", nullable = false, length = 30) private String numero;
    @Column(name = "tipo_telefono", nullable = false, length = 30) private String tipo = "PERSONAL";
    @Column(name = "es_principal", nullable = false) private Boolean principal = false;
    @Column(name = "fecha_creacion", nullable = false, updatable = false) private LocalDateTime createdAt;
    @Column(name = "fecha_actualizacion", nullable = false) private LocalDateTime updatedAt;
    @PrePersist void created(){ createdAt=LocalDateTime.now(); updatedAt=createdAt; }
    @PreUpdate void updated(){ updatedAt=LocalDateTime.now(); }
    public Person getPerson(){return person;} public void setPerson(Person v){person=v;}
    public String getNumero(){return numero;} public void setNumero(String v){numero=v;}
    public String getTipo(){return tipo;} public void setTipo(String v){tipo=v;}
    public Boolean getPrincipal(){return principal;} public void setPrincipal(Boolean v){principal=v;}
}
