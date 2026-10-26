package com.vuelossanitarios.backend.domain.person;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity @jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_correos_electronicos"))
@Table(name = "correos_electronicos")
public class EmailContact extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "id_personas", nullable = false) private Person person;
    @Column(name = "direccion", nullable = false, length = 150) private String direccion;
    @Column(name = "direccion_normalizada", nullable = false, length = 150) private String direccionNormalizada;
    @Column(name = "tipo_correo_electronico", nullable = false, length = 30) private String tipo = "PERSONAL";
    @Column(name = "es_principal", nullable = false) private Boolean principal = false;
    @Version @Column(name = "version_contacto", nullable = false) private Long version;
    @Column(name = "fecha_creacion", nullable = false, updatable = false) private LocalDateTime createdAt;
    @Column(name = "fecha_actualizacion", nullable = false) private LocalDateTime updatedAt;
    /** Instante en que se confirmó la recepción de un código enviado a esta dirección; nulo = sin verificar (incluye los correos anteriores a V54). */
    @Column(name = "fecha_verificacion") private LocalDateTime fechaVerificacion;
    @Column(name = "fecha_baja") private LocalDateTime fechaBaja;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "id_usuario_baja") private User bajaPor;
    @Column(name = "motivo_baja", length = 30) private String motivoBaja;
    @PrePersist void created(){ createdAt=LocalDateTime.now(); updatedAt=createdAt; }
    @PreUpdate void updated(){ updatedAt=LocalDateTime.now(); }
    public Person getPerson(){return person;} public void setPerson(Person v){person=v;}
    public String getDireccion(){return direccion;} public void setDireccion(String v){direccion=v;direccionNormalizada=ContactNormalizer.email(v);}
    public String getDireccionNormalizada(){return direccionNormalizada;}
    public String getTipo(){return tipo;} public void setTipo(String v){tipo=v;}
    public Boolean getPrincipal(){return principal;} public void setPrincipal(Boolean v){principal=v;}
    public Long getVersion(){return version;}
    public LocalDateTime getFechaVerificacion(){return fechaVerificacion;} public void setFechaVerificacion(LocalDateTime v){fechaVerificacion=v;}
    public boolean isVerificado(){return fechaVerificacion!=null;}
    public LocalDateTime getFechaBaja(){return fechaBaja;}
    public User getBajaPor(){return bajaPor;} public String getMotivoBaja(){return motivoBaja;}
    public void darDeBaja(LocalDateTime fecha,User responsable,String motivo){fechaBaja=fecha;bajaPor=responsable;motivoBaja=motivo;principal=false;}
}
