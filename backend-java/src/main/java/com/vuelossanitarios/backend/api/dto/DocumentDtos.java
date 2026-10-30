package com.vuelossanitarios.backend.api.dto;
import java.time.LocalDateTime;

public final class DocumentDtos {
 private DocumentDtos() {}
 public record DocumentTypeView(String codigo, String nombre) {}
 public record DocumentVersionView(String id, int numeroVersion, boolean esVersionActual,
                                   String nombreArchivoOriginal, long tamanioBytes,
                                   LocalDateTime fechaCreacion, String urlDescarga, String creadoPor) {}
 /** {@code puedeRetirar} lo calcula el servidor para quien consulta (rol, creador, estado del vuelo): la interfaz no recompone la política. */
 public record DocumentView(String id, String nombreDocumento, DocumentTypeView tipoDocumento,
                            DocumentVersionView versionActual, boolean puedeRetirar) {}
 public record RetiredDocumentView(String id, String nombreDocumento, DocumentTypeView tipoDocumento, DocumentVersionView ultimaVersion,
                                   long totalVersiones, LocalDateTime fechaBaja, String retiradoPor, String motivoBaja) {}
 @com.vuelossanitarios.backend.api.dto.StrictJson
 public record DeactivateRequest(String motivo) {}
 public record DocumentHistoryView(String id, String nombreDocumento, DocumentTypeView tipoDocumento,
                                   java.util.List<DocumentVersionView> versiones) {}
 public record DocumentLockView(String documentId, Long ownerId, String ownerUsername,
                                LocalDateTime acquiredAt, LocalDateTime expiresAt, boolean mine, boolean active,
                                Long remainingSeconds) {}
}
