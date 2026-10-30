package com.vuelossanitarios.backend.api.dto;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonMappingException;
import java.io.IOException;

/**
 * Entero JSON sin truncamiento: Jackson acepta por omisión {@code 1.5} para un {@code Integer} y lo guarda como {@code 1}, es decir, un dato que el
 * usuario no escribió. Con esta anotación un número con parte decimal (o con exponente) se rechaza con 400 y un entero fuera del rango de {@code int}
 * también. Un texto numérico ("95") conserva el comportamiento habitual de la API.
 * Uso: {@code @JsonDeserialize(using = WholeNumber.class)} sobre el componente del registro.
 */
public final class WholeNumber extends JsonDeserializer<Integer> {
    @Override
    public Integer deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
        JsonToken token = p.currentToken();
        if (token == JsonToken.VALUE_NUMBER_INT) return p.getIntValue(); // fuera de rango: InputCoercionException (400)
        if (token == JsonToken.VALUE_STRING) {
            try { return Integer.valueOf(p.getText().trim()); }
            catch (NumberFormatException e) { throw JsonMappingException.from(p, "Se esperaba un número entero"); }
        }
        throw JsonMappingException.from(p, "Se esperaba un número entero sin parte decimal");
    }
}
