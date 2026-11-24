/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla notificaciones.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository y consultas @Modifying, usados desde
 *   NotificationService.
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.notification.Notification;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import java.util.*;
// Obtiene las notificaciones paginadas del usuario, de la más reciente a la más antigua.
// Cuenta las notificaciones no leídas del usuario.
// Verifica si el usuario ya tiene una notificación con la clave de evento indicada.
// Marca como leídas todas las notificaciones no leídas del usuario (actualización masiva).
public interface NotificationRepository extends JpaRepository<Notification,Long>{Page<Notification> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);long countByUserIdAndLeidoFalse(Long userId);boolean existsByUserIdAndClaveEvento(Long userId,String claveEvento);@Modifying @Query("update Notification n set n.leido=true where n.user.id=:userId and n.leido=false") int markAllRead(Long userId);}
