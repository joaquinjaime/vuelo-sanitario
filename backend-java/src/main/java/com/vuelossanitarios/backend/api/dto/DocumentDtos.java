package com.vuelossanitarios.backend.api.dto;
import java.time.LocalDateTime;

public final class DocumentDtos {
 private DocumentDtos() {}
 public record DocumentTypeView(String codigo, String nombre) {}
 public record DocumentVersionView(String id, int numeroVersion, boolean esVersionActual,
                                   String nombreArchivoOriginal, long tamanioBytes,
                                   LocalDateTime fechaCreacion, String urlDescarga) {}
 public record DocumentView(String id, String nombreDocumento, DocumentTypeView tipoDocumento,
                            DocumentVersionView versionActual) {}
 public record DocumentHistoryView(String id, String nombreDocumento, DocumentTypeView tipoDocumento,
                                   java.util.List<DocumentVersionView> versiones) {}
 public record DocumentLockView(String documentId, Long ownerId, String ownerUsername,
                                LocalDateTime acquiredAt, LocalDateTime expiresAt, boolean mine, boolean active) {}
}
