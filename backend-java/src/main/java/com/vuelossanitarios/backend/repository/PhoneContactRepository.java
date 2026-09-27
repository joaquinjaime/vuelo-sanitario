package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.PhoneContact;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface PhoneContactRepository extends JpaRepository<PhoneContact, UUID> { List<PhoneContact> findByPersonIdOrderByPrincipalDesc(UUID personId); long countByPersonId(UUID personId); }
