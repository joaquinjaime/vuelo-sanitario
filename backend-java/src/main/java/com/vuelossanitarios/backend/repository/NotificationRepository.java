package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.notification.Notification;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import java.util.*;
public interface NotificationRepository extends JpaRepository<Notification,Long>{Page<Notification> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);long countByUserIdAndLeidoFalse(Long userId);@Modifying @Query("update Notification n set n.leido=true where n.user.id=:userId and n.leido=false") int markAllRead(Long userId);}
