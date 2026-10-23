package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.flight.Aa2000Coordination;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;

public interface Aa2000CoordinationRepository extends JpaRepository<Aa2000Coordination,Long> {
    List<Aa2000Coordination> findByFlightIdOrderByCreatedAtDesc(Long id);
    List<Aa2000Coordination> findByFlightIdAndEsVersionActualTrue(Long id);
    // SQL Server puede elegir un escaneo de la tabla pequeña y esperar por
    // otra gestión. La clave por gestión acota ambas lecturas al grupo pedido.
    @Query(value="select * from dbo.coordinaciones_aa2000 with (updlock, rowlock, index(uq_coordinacion_gestion_version)) where id_vuelos=:flight and identificador_gestion=:group and es_version_actual=1",nativeQuery=true)
    Optional<Aa2000Coordination> lockCurrent(@Param("flight") Long flight,@Param("group") UUID group);
    @Query(value="select * from dbo.coordinaciones_aa2000 with (index(uq_coordinacion_gestion_version)) where id_vuelos=:flight and identificador_gestion=:group and es_version_actual=1",nativeQuery=true)
    Optional<Aa2000Coordination> findByFlightIdAndGestionIdAndEsVersionActualTrue(@Param("flight") Long flight,@Param("group") UUID group);
}
