package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_versiones_documento_vuelo"))
@Table(name = "versiones_documento_vuelo")
public class FlightDocument extends BaseEntity {
@ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "id_documentos_vuelo", nullable = false) private FlightDocumentItem documentItem;
    @Column(name = "numero_version", nullable = false) private Integer numeroVersion;
    @Column(name = "es_version_actual", nullable = false) private Boolean esVersionActual = true;
    /** Nombre recibido al cargar esta versión; nunca es el nombre lógico. */
    @Column(name = "nombre_archivo_original", nullable = false, length = 255) private String nombreArchivoOriginal;
    /** Clave relativa del archivo dentro del almacenamiento de documentos. */
@Column(name = "ubicacion_almacenamiento", nullable = false, length = 255) private String ubicacionAlmacenamiento;
    @Column(name = "tamanio_bytes", nullable = false) private Long tamanioBytes;
@ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "id_usuario_creador", nullable = false) private User creadoPor;
@CreationTimestamp @Column(name = "fecha_creacion", nullable = false, updatable = false) private LocalDateTime createdAt;
    public FlightDocumentItem getDocumentItem() { return documentItem; } public void setDocumentItem(FlightDocumentItem v) { documentItem = v; }
    public Integer getNumeroVersion() { return numeroVersion; } public void setNumeroVersion(Integer v) { numeroVersion = v; }
    public Boolean getEsVersionActual() { return esVersionActual; } public void setEsVersionActual(Boolean v) { esVersionActual = v; }
    public String getNombreArchivoOriginal() { return nombreArchivoOriginal; } public void setNombreArchivoOriginal(String v) { nombreArchivoOriginal = v; }
    public String getUbicacionAlmacenamiento() { return ubicacionAlmacenamiento; } public void setUbicacionAlmacenamiento(String v) { ubicacionAlmacenamiento = v; }
    public Long getTamanioBytes() { return tamanioBytes; } public void setTamanioBytes(Long v) { tamanioBytes = v; }
    public User getCreadoPor() { return creadoPor; } public void setCreadoPor(User v) { creadoPor = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
