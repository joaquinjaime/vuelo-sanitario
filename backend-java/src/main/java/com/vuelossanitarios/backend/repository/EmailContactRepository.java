package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.EmailContact;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface EmailContactRepository extends JpaRepository<EmailContact, Long> { List<EmailContact> findByPersonIdOrderByPrincipalDesc(Long personId); long countByPersonId(Long personId); }
