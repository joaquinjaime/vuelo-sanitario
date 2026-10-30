package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.domain.catalog.Airport;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.util.*;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Serializa, aeropuerto por aeropuerto, "dar de baja" contra "empezar a usar". Toda operación que hace que un registro operativo apunte a un
 * aeropuerto (origen, destino, alternativo, ubicación de aeronave, coordinación) lo bloquea ANTES de leer su estado y de escribir la referencia, y la
 * baja administrativa bloquea la misma fila antes de contar las referencias vigentes. Así, de dos operaciones incompatibles la segunda ve el resultado
 * confirmado de la primera: o la baja encuentra la referencia y falla con 409, o el uso encuentra el aeropuerto inactivo y se rechaza. El bloqueo es de
 * una fila (no global) y se toma en orden creciente de identificador para que dos operaciones con varios aeropuertos no se bloqueen entre sí.
 * Orden general de adquisición: vuelo → aeronave → aeropuertos (por id); en la administración geográfica: provincia → localidad → aeropuerto.
 * Es @Repository para que un bloqueo mutuo o un tiempo de espera agotado se traduzca a ConcurrencyFailureException, que el manejador de errores informa como 409 reintentable.
 */
@Repository public class AirportLocks {
 @PersistenceContext private EntityManager em;

 /** Bloquea y devuelve los aeropuertos con su estado confirmado (la relectura descarta una copia previa del contexto); los ausentes no figuran en el resultado. */
 @Transactional(propagation=Propagation.MANDATORY) public Map<Long,Airport> lockAll(Long... ids){
  Map<Long,Airport> out=new LinkedHashMap<>();
  Arrays.stream(ids).filter(Objects::nonNull).distinct().sorted().forEach(id->{
   Airport a=em.find(Airport.class,id,LockModeType.PESSIMISTIC_WRITE);
   if(a!=null){em.refresh(a,LockModeType.PESSIMISTIC_WRITE);out.put(id,a);}
  });
  return out;
 }
}
