package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.CommanderProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface CommanderProfileRepository extends JpaRepository<CommanderProfile,UUID>{ boolean existsByLicenseNumberIgnoreCase(String licenseNumber); }
