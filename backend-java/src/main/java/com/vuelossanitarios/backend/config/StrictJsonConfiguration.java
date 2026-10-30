package com.vuelossanitarios.backend.config;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.deser.DeserializationProblemHandler;
import com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException;
import com.vuelossanitarios.backend.api.dto.StrictJson;
import java.io.IOException;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Aplica {@link StrictJson}: un campo desconocido en un cuerpo marcado produce un 400 que lo nombra, sin cambiar el resto de la API. */
@Configuration
public class StrictJsonConfiguration {
    @Bean
    Jackson2ObjectMapperBuilderCustomizer strictJsonBodies() {
        return builder -> builder.postConfigurer(mapper -> mapper.addHandler(new DeserializationProblemHandler() {
            @Override
            public boolean handleUnknownProperty(DeserializationContext ctxt, JsonParser p, JsonDeserializer<?> deserializer, Object beanOrClass, String propertyName) throws IOException {
                Class<?> type = beanOrClass instanceof Class<?> c ? c : beanOrClass.getClass();
                if (type.isAnnotationPresent(StrictJson.class)) throw UnrecognizedPropertyException.from(p, beanOrClass, propertyName, java.util.List.of());
                return false;
            }
        }));
    }
}
