package com.vuelossanitarios.backend.domain.patient;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.person.Person;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "pacientes")
public class Patient extends BaseEntity {

    @OneToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "persona_id", nullable = false, unique = true)
    private Person person;

    @CreationTimestamp
@Column(name = "fecha_creacion", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
@Column(name = "fecha_actualizacion", nullable = false)
    private LocalDateTime updatedAt;

    public Patient() {
    }

    public Person getPerson() { return person; }
    public void setPerson(Person person) { this.person = person; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
