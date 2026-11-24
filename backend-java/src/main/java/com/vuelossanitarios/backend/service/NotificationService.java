/*
 * ACCESO A BASE DE DATOS
 * Trae datos de: notificaciones, usuarios.
 * Carga o modifica datos en: notificaciones.
 */
package com.vuelossanitarios.backend.service;
import com.vuelossanitarios.backend.api.ApiException;import com.vuelossanitarios.backend.api.dto.NotificationDtos.*;import com.vuelossanitarios.backend.domain.flight.Flight;import com.vuelossanitarios.backend.domain.notification.Notification;import com.vuelossanitarios.backend.domain.user.User;import com.vuelossanitarios.backend.repository.*;import org.springframework.data.domain.*;import org.springframework.http.HttpStatus;import org.springframework.stereotype.Service;import org.springframework.transaction.annotation.Transactional;import java.util.*;
// create: Guarda la nueva notificación para el usuario destinatario
// createOnce: Verifica si el usuario destinatario ya tiene una notificación con la misma clave de evento
// createOnce: Guarda la nueva notificación con su clave de evento
@Service public class NotificationService {private final NotificationRepository notifications;private final UserRepository users;public NotificationService(NotificationRepository n,UserRepository u){notifications=n;users=u;}@Transactional public void create(User recipient,Flight flight,String type,String message){Notification n=new Notification();n.setUser(recipient);n.setFlight(flight);n.setTipo(type);n.setMensaje(message);notifications.save(n);}/** Crea la notificación sólo si ese usuario aún no recibió el mismo hecho (clave de evento). */@Transactional public boolean createOnce(User recipient,Flight flight,String type,String message,String key){if(notifications.existsByUserIdAndClaveEvento(recipient.getId(),key))return false;Notification n=new Notification();n.setUser(recipient);n.setFlight(flight);n.setTipo(type);n.setMensaje(message);n.setClaveEvento(key);notifications.save(n);return true;}/**
  * Aviso de gestión para Operaciones: va a los responsables concretos indicados (p. ej. quien finalizó el vuelo o devolvió el informe)
  * mientras sigan activos y con rol de Operaciones; si ninguno es elegible (histórico sin responsable, baja o cambio de rol),
  * cae a todos los usuarios activos de los roles indicados, porque la cola de revisión es compartida. Una sola vez por usuario y clave.
  */
 @Transactional public int createOncePreferred(Flight flight,String type,String message,String key,Collection<User> preferred,String... fallbackRoles){
  // Obtiene los usuarios activos que tienen el rol indicado
  Map<Long,User> authorized=new LinkedHashMap<>();for(String role:fallbackRoles)for(User u:users.findActiveByRoleCode(role))authorized.putIfAbsent(u.getId(),u);
  Map<Long,User> targets=new LinkedHashMap<>();for(User u:preferred)if(u!=null&&authorized.containsKey(u.getId()))targets.putIfAbsent(u.getId(),authorized.get(u.getId()));
  if(targets.isEmpty())targets=authorized;
  int created=0;for(User u:targets.values())if(createOnce(u,flight,type,message,key))created++;return created;
 }
 // list: Obtiene una página de notificaciones del usuario, de la más reciente a la más antigua
 // list: Cuenta las notificaciones no leídas del usuario
 // read: Busca la notificación por su ID
 // read: Marca la notificación como leída (entidad gestionada); el cambio se actualiza en la base de datos al confirmar la transacción
 // readAll: Marca como leídas todas las notificaciones no leídas del usuario mediante una actualización masiva
 @Transactional(readOnly=true) public NotificationPage list(Long user,int page,int size){Page<Notification> result=notifications.findByUserIdOrderByCreatedAtDesc(user,PageRequest.of(Math.max(0,page),Math.min(100,Math.max(1,size))));return new NotificationPage(result.getContent().stream().map(this::view).toList(),notifications.countByUserIdAndLeidoFalse(user),result.getTotalElements());}@Transactional public void read(Long id,Long user){Notification n=notifications.findById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Notificación inexistente"));if(!n.getUser().getId().equals(user))throw new ApiException(HttpStatus.FORBIDDEN,"Notificación ajena");n.setLeido(true);}@Transactional public int readAll(Long user){return notifications.markAllRead(user);}private NotificationView view(Notification n){return new NotificationView(n.getId(),n.getFlight()==null?null:n.getFlight().getId(),n.getTipo(),n.getMensaje(),n.getLeido(),n.getCreatedAt());}}
