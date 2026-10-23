package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.PhoneContact;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface PhoneContactRepository extends JpaRepository<PhoneContact, Long> { List<PhoneContact> findByPersonIdOrderByPrincipalDesc(Long personId); long countByPersonId(Long personId); }
