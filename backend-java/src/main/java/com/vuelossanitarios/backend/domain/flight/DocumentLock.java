/*
 * ACCESO A BASE DE DATOS
 * Entidad JPA de la tabla bloqueos_documento_vuelo: cada instancia es una fila.
 * Trae datos: la leen 1 clase(s) de servicio mediante sus repositorios (p. ej. DocumentService).
 * Carga o modifica datos: DocumentService.
 */
package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Tabla {@code bloqueos_documento_vuelo}. Bloqueo de edición de un documento de vuelo: un único usuario propietario por documento, con fecha de adquisición y de vencimiento. Se crea, se renueva y se elimina desde el servicio de documentos.
 */
@Entity
@AttributeOverride(name="id", column=@Column(name="id_bloqueos_documento_vuelo"))
@Table(name="bloqueos_documento_vuelo")
public class DocumentLock extends BaseEntity {
 @OneToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="id_documentos_vuelo", nullable=false, unique=true) private FlightDocumentItem documentItem;
 @ManyToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="id_usuario_propietario", nullable=false) private User owner;
 @Column(name="fecha_adquisicion", nullable=false) private LocalDateTime acquiredAt;
 @Column(name="fecha_vencimiento", nullable=false) private LocalDateTime expiresAt;
 public FlightDocumentItem getDocumentItem(){return documentItem;} public void setDocumentItem(FlightDocumentItem x){documentItem=x;}
 public User getOwner(){return owner;} public void setOwner(User x){owner=x;}
 public LocalDateTime getAcquiredAt(){return acquiredAt;} public void setAcquiredAt(LocalDateTime x){acquiredAt=x;}
 public LocalDateTime getExpiresAt(){return expiresAt;} public void setExpiresAt(LocalDateTime x){expiresAt=x;}
}
