package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "versiones_documento_vuelo")
public class FlightDocument extends BaseEntity {
@ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "documento_vuelo_id", nullable = false) private FlightDocumentItem documentItem;
    @Column(name = "version", nullable = false) private Integer version;
    @Column(name = "es_version_actual", nullable = false) private Boolean esVersionActual = true;
    @Column(name = "nombre_archivo", length = 255) private String nombreArchivo;
@Column(name = "clave_almacenamiento", length = 255) private String storageKey;
@Column(name = "tipo_mime", length = 100) private String mimeType;
    @Column(name = "tamanio_bytes") private Long tamanioBytes;
    @Column(name = "contenido_texto", columnDefinition = "NVARCHAR(MAX)") private String contenidoTexto;
@ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "creado_por_usuario_id", nullable = false) private User creadoPor;
@CreationTimestamp @Column(name = "fecha_creacion", nullable = false, updatable = false) private LocalDateTime createdAt;
    public FlightDocumentItem getDocumentItem() { return documentItem; } public void setDocumentItem(FlightDocumentItem v) { documentItem = v; }
    public Integer getVersion() { return version; } public void setVersion(Integer v) { version = v; }
    public Boolean getEsVersionActual() { return esVersionActual; } public void setEsVersionActual(Boolean v) { esVersionActual = v; }
    public String getNombreArchivo() { return nombreArchivo; } public void setNombreArchivo(String v) { nombreArchivo = v; }
    public String getStorageKey() { return storageKey; } public void setStorageKey(String v) { storageKey = v; }
    public String getMimeType() { return mimeType; } public void setMimeType(String v) { mimeType = v; }
    public Long getTamanioBytes() { return tamanioBytes; } public void setTamanioBytes(Long v) { tamanioBytes = v; }
    public String getContenidoTexto() { return contenidoTexto; } public void setContenidoTexto(String v) { contenidoTexto = v; }
    public User getCreadoPor() { return creadoPor; } public void setCreadoPor(User v) { creadoPor = v; }
}
