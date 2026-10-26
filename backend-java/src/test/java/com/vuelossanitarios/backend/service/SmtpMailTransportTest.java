package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.vuelossanitarios.backend.mail.MailTransport.MailDeliveryException;
import com.vuelossanitarios.backend.mail.SmtpMailTransport;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

/** Sin servidor SMTP y remitente no hay envío ni simulación; con ellos, sólo se entrega al servidor y los fallos no filtran el contenido. */
class SmtpMailTransportTest {
 @SuppressWarnings("unchecked") private static ObjectProvider<JavaMailSender> provider(JavaMailSender sender){ObjectProvider<JavaMailSender> p=mock(ObjectProvider.class);when(p.getIfAvailable()).thenReturn(sender);return p;}

 @Test void withoutAServerOrASenderAddressNothingIsConfiguredAndSendingFailsExplicitly(){
  SmtpMailTransport none=new SmtpMailTransport(provider(null),"no-reply@example.test");
  assertFalse(none.configured());assertThrows(MailDeliveryException.class,()->none.send("a@example.test","asunto","cuerpo"));
  SmtpMailTransport noFrom=new SmtpMailTransport(provider(mock(JavaMailSender.class)),"  ");
  assertFalse(noFrom.configured());assertThrows(MailDeliveryException.class,()->noFrom.send("a@example.test","asunto","cuerpo"));
 }

 @Test void withAServerTheMessageIsHandedOverWithTheConfiguredSender(){
  JavaMailSender sender=mock(JavaMailSender.class);SmtpMailTransport transport=new SmtpMailTransport(provider(sender),"no-reply@example.test");
  assertTrue(transport.configured());transport.send("ana@example.test","Asunto","Cuerpo");
  ArgumentCaptor<SimpleMailMessage> captor=ArgumentCaptor.forClass(SimpleMailMessage.class);verify(sender).send(captor.capture());
  assertEquals("no-reply@example.test",captor.getValue().getFrom());assertArrayEquals(new String[]{"ana@example.test"},captor.getValue().getTo());assertEquals("Cuerpo",captor.getValue().getText());
 }

 @Test void aRejectionIsReportedWithoutTheMessageContents(){
  JavaMailSender sender=mock(JavaMailSender.class);doThrow(new MailSendException("535 credenciales inválidas para ana@example.test código ABCD-EFGH")).when(sender).send(any(SimpleMailMessage.class));
  SmtpMailTransport transport=new SmtpMailTransport(provider(sender),"no-reply@example.test");
  MailDeliveryException e=assertThrows(MailDeliveryException.class,()->transport.send("ana@example.test","Asunto","Su código es ABCD-EFGH"));
  assertFalse(e.getMessage().contains("ABCD")||e.getMessage().contains("ana@"),e.getMessage());
 }
}
