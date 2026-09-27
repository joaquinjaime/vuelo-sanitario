package com.vuelossanitarios.backend.domain.user;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.person.Person;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "usuarios")
public class User extends BaseEntity {

@Column(name = "nombre_usuario", nullable = false, unique = true, length = 50)
    private String username;

@Column(name = "correo_electronico", nullable = false, unique = true, length = 150)
    private String email;

@Column(name = "hash_contrasena", nullable = false, length = 255)
    private String passwordHash;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "persona_id", nullable = false, unique = true)
    private Person person;

    @Column(name = "licencia_aeronautica", length = 50)
    private String licenciaAeronautica;

    @Column(name = "activo", nullable = false)
    private Boolean activo = true;

    @CreationTimestamp
@Column(name = "fecha_creacion", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
@Column(name = "fecha_actualizacion", nullable = false)
    private LocalDateTime updatedAt;

    @OneToMany(mappedBy = "user", fetch = FetchType.LAZY)
    private Set<UserRole> userRoles = new HashSet<>();

    public User() {
    }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }

    public Person getPerson() { return person; }
    public void setPerson(Person person) { this.person = person; }

    public String getLicenciaAeronautica() { return licenciaAeronautica; }
    public void setLicenciaAeronautica(String licenciaAeronautica) { this.licenciaAeronautica = licenciaAeronautica; }

    public Boolean getActivo() { return activo; }
    public void setActivo(Boolean activo) { this.activo = activo; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public Set<UserRole> getUserRoles() { return userRoles; }
    public void setUserRoles(Set<UserRole> userRoles) { this.userRoles = userRoles; }
}
