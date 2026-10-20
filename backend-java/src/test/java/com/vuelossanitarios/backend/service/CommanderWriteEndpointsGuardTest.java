package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Method;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * Inventario de los endpoints de escritura alcanzables por un COMANDANTE. Cualquier endpoint nuevo rompe esta prueba hasta que
 * se decida si exige el control de bloqueo por informe vencido (CommanderReportAccessService) o es una acción de regularización.
 */
class CommanderWriteEndpointsGuardTest {
 /** Acciones que un comandante bloqueado debe seguir pudiendo ejecutar: regularizar sus informes y gestionar sus avisos. */
 private static final Set<String> REGULARIZATION=Set.of("FinalReportController.submit","FinalReportController.submitWithFile","FinalReportController.extension","NotificationController.read","NotificationController.readAll");
 /** Acciones operativas del comandante: cada una está cubierta por requireOperationalAccess en su servicio y por el E2E de bloqueo. */
 private static final Set<String> GUARDED=Set.of(
  "FlightController.respondCommanderAssignment","FlightController.operationalPlanning","FlightController.cancel","FlightController.weather",
  "FlightLogController.create","FlightRouteController.save","HangarInfoController.observe",
  "DocumentController.createPdf","DocumentController.replacePdf","DocumentController.acquireLock","DocumentController.releaseLock");

 @Test void everyCommanderWriteEndpointIsEitherGuardedOrAnExplicitRegularizationAction()throws Exception{
  Set<String> found=new TreeSet<>();
  var scanner=new ClassPathScanningCandidateComponentProvider(false);scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
  for(var bd:scanner.findCandidateComponents("com.vuelossanitarios.backend.api")){
   Class<?> c=Class.forName(bd.getBeanClassName());
   for(Method m:c.getDeclaredMethods()){
    boolean write=m.isAnnotationPresent(PostMapping.class)||m.isAnnotationPresent(PutMapping.class)||m.isAnnotationPresent(PatchMapping.class)||m.isAnnotationPresent(DeleteMapping.class);
    PreAuthorize pre=m.getAnnotation(PreAuthorize.class);
    if(write&&pre!=null&&pre.value().contains("COMANDANTE"))found.add(c.getSimpleName()+"."+m.getName());
   }
  }
  Set<String> expected=new TreeSet<>(GUARDED);expected.addAll(REGULARIZATION);
  assertEquals(expected,found,"Revise el control de bloqueo del nuevo endpoint de escritura del comandante");
 }
}
