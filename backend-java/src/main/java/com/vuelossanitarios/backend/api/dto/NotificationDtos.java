package com.vuelossanitarios.backend.api.dto;
import java.time.LocalDateTime;
public final class NotificationDtos {private NotificationDtos(){}public record NotificationView(Long id,Long flightId,String tipo,String mensaje,boolean leido,LocalDateTime createdAt){}public record NotificationPage(java.util.List<NotificationView> items,long unread,long total){}}
