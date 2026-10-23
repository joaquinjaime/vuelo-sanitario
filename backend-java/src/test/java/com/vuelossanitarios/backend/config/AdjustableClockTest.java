package com.vuelossanitarios.backend.config;

import static org.junit.jupiter.api.Assertions.*;

import com.vuelossanitarios.backend.api.E2eControlController;
import java.time.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

/** El reloj ajustable y sus controles sólo existen cuando se habilitan explícitamente (entornos E2E aislados). */
class AdjustableClockTest {
 @Configuration @Import(BusinessTimeConfiguration.class) static class Base {}

 @Test void productionConfigurationUsesTheSystemClockAndExposesNoControls(){
  new ApplicationContextRunner().withUserConfiguration(Base.class).run(ctx->{
   Clock clock=ctx.getBean(Clock.class); assertFalse(clock instanceof AdjustableClock); assertEquals(ZoneId.of("America/Argentina/Tucuman"),clock.getZone());
   assertEquals(0,ctx.getBeansOfType(E2eControlController.class).size());
  });
  assertEquals("true",E2eControlController.class.getAnnotation(ConditionalOnProperty.class).havingValue(),"el controlador exige activarse explícitamente");
  assertEquals("app.e2e-controls.enabled",E2eControlController.class.getAnnotation(ConditionalOnProperty.class).name()[0]);
 }
 @Test void theFlagAloneNeverActivatesTheAdjustableClockAndTheApplicationRefusesToStart(){
  new ApplicationContextRunner().withUserConfiguration(Base.class).withPropertyValues("app.e2e-controls.enabled=true").run(ctx->{
   assertNotNull(ctx.getStartupFailure(),"un flag suelto debe impedir el arranque, no activar el reloj"); assertTrue(String.valueOf(ctx.getStartupFailure().getMessage()+rootMessage(ctx.getStartupFailure())).contains("perfil Spring 'e2e'"));
  });
  new ApplicationContextRunner().withUserConfiguration(Base.class).withPropertyValues("app.e2e-controls.enabled=true").withInitializer(c->c.getEnvironment().setActiveProfiles("docker")).run(ctx->assertNotNull(ctx.getStartupFailure()));
  new ApplicationContextRunner().withUserConfiguration(Base.class).withInitializer(c->c.getEnvironment().setActiveProfiles("e2e")).run(ctx->{assertNull(ctx.getStartupFailure());assertFalse(ctx.getBean(Clock.class) instanceof AdjustableClock,"el perfil solo, sin flag, tampoco lo activa");});
 }
 @Test void flagPlusE2eProfileSwitchesToAnAdjustableClockThatKeepsTheBusinessZone(){
  new ApplicationContextRunner().withUserConfiguration(Base.class).withInitializer(c->c.getEnvironment().setActiveProfiles("e2e")).withPropertyValues("app.e2e-controls.enabled=true","app.business-time-zone=Europe/Madrid").run(ctx->{
   Clock clock=ctx.getBean(Clock.class); assertTrue(clock instanceof AdjustableClock); assertEquals(ZoneId.of("Europe/Madrid"),clock.getZone());
  });
 }
 @Test void theControlEndpointsRequireTheE2eProfileAndTheFlag(){
  assertArrayEquals(new String[]{"e2e"},E2eControlController.class.getAnnotation(org.springframework.context.annotation.Profile.class).value());
 }
 private static String rootMessage(Throwable t){while(t.getCause()!=null)t=t.getCause();return String.valueOf(t.getMessage());}
 @Test void settingTheClockMovesBothDirectionsAndTimeKeepsFlowing()throws Exception{
  AdjustableClock clock=new AdjustableClock(Clock.fixed(Instant.parse("2026-10-20T12:00:00Z"),ZoneOffset.UTC));
  clock.setNow(Instant.parse("2026-10-22T02:30:00Z")); assertEquals(Instant.parse("2026-10-22T02:30:00Z"),clock.instant()); assertEquals(Duration.ofHours(38).plusMinutes(30),clock.getOffset());
  clock.setOffset(Duration.ofHours(-1)); assertEquals(Instant.parse("2026-10-20T11:00:00Z"),clock.instant()); clock.setOffset(Duration.ZERO); assertEquals(Instant.parse("2026-10-20T12:00:00Z"),clock.instant());
  Clock madrid=clock.withZone(ZoneId.of("Europe/Madrid")); clock.setOffset(Duration.ofHours(5)); assertEquals(clock.instant(),madrid.instant(),"las vistas por zona comparten el desplazamiento"); assertEquals(ZoneId.of("Europe/Madrid"),madrid.getZone());
  AdjustableClock live=new AdjustableClock(Clock.systemUTC()); Instant first=live.instant(); Thread.sleep(5); assertTrue(live.instant().isAfter(first));
 }
}
