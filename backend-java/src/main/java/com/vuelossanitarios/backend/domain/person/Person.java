package com.vuelossanitarios.backend.domain.person;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.OneToOne;
import jakarta.persistence.FetchType;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "personas")
public class Person extends BaseEntity {
    @Column(name = "nombre", nullable = false, length = 100) private String nombre;
    @Column(name = "apellido", nullable = false, length = 100) private String apellido;
    @Column(name = "dni", length = 20) private String dni;
    @Column(name = "fecha_nacimiento") private LocalDate fechaNacimiento;
    @OneToOne(mappedBy="person",fetch=FetchType.LAZY) private CommanderProfile commanderProfile;
@CreationTimestamp @Column(name = "fecha_creacion", nullable = false, updatable = false) private LocalDateTime createdAt;
@UpdateTimestamp @Column(name = "fecha_actualizacion", nullable = false) private LocalDateTime updatedAt;
    public String getNombre() { return nombre; } public void setNombre(String value) { nombre = value; }
    public String getApellido() { return apellido; } public void setApellido(String value) { apellido = value; }
    public String getDni() { return dni; } public void setDni(String value) { dni = value; }
    public LocalDate getFechaNacimiento() { return fechaNacimiento; } public void setFechaNacimiento(LocalDate value) { fechaNacimiento = value; }
    public CommanderProfile getCommanderProfile(){return commanderProfile;} public void setCommanderProfile(CommanderProfile value){commanderProfile=value;}
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
