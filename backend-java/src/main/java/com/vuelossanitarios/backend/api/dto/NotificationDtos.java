package com.vuelossanitarios.backend.api.dto;
import java.time.LocalDateTime;import java.util.UUID;
public final class NotificationDtos {private NotificationDtos(){}public record NotificationView(UUID id,UUID flightId,String tipo,String mensaje,boolean leido,LocalDateTime createdAt){}public record NotificationPage(java.util.List<NotificationView> items,long unread,long total){}}
