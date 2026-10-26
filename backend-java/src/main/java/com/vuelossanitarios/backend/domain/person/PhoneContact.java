package com.vuelossanitarios.backend.domain.person;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity @jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_telefonos"))
@Table(name = "telefonos")
public class PhoneContact extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "id_personas", nullable = false) private Person person;
    @Column(name = "numero", nullable = false, length = 30) private String numero;
    @Column(name = "numero_normalizado", nullable = false, length = 30) private String numeroNormalizado;
    @Column(name = "tipo_telefono", nullable = false, length = 30) private String tipo = "PERSONAL";
    /** País (ISO 3166-1 alfa-2) con el que se validó el número; nulo en los teléfonos anteriores a V54, que no están validados. */
    @Column(name = "codigo_pais", length = 2) private String codigoPais;
    @Column(name = "es_principal", nullable = false) private Boolean principal = false;
    @Version @Column(name = "version_contacto", nullable = false) private Long version;
    @Column(name = "fecha_creacion", nullable = false, updatable = false) private LocalDateTime createdAt;
    @Column(name = "fecha_actualizacion", nullable = false) private LocalDateTime updatedAt;
    @Column(name = "fecha_baja") private LocalDateTime fechaBaja;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "id_usuario_baja") private User bajaPor;
    @Column(name = "motivo_baja", length = 30) private String motivoBaja;
    @PrePersist void created(){ createdAt=LocalDateTime.now(); updatedAt=createdAt; }
    @PreUpdate void updated(){ updatedAt=LocalDateTime.now(); }
    public Person getPerson(){return person;} public void setPerson(Person v){person=v;}
    public String getNumero(){return numero;} public void setNumero(String v){numero=v;numeroNormalizado=ContactNormalizer.phone(v);}
    public String getNumeroNormalizado(){return numeroNormalizado;}
    public String getCodigoPais(){return codigoPais;}
    /** Validado con las reglas de numeración de un país (no implica verificación por SMS). */
    public boolean isValidado(){return codigoPais!=null;}
    /** Guarda un número validado: formato internacional legible en {@code numero}, E.164 en {@code numero_normalizado} y el país elegido. */
    public void setValidated(PhoneNumbers.Parsed p){numero=p.international();numeroNormalizado=p.e164();codigoPais=p.region();}
    public String getTipo(){return tipo;} public void setTipo(String v){tipo=v;}
    public Boolean getPrincipal(){return principal;} public void setPrincipal(Boolean v){principal=v;}
    public Long getVersion(){return version;}
    public LocalDateTime getFechaBaja(){return fechaBaja;}
    public User getBajaPor(){return bajaPor;} public String getMotivoBaja(){return motivoBaja;}
    public void darDeBaja(LocalDateTime fecha,User responsable,String motivo){fechaBaja=fecha;bajaPor=responsable;motivoBaja=motivo;principal=false;}
}
