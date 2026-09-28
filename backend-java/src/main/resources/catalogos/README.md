# Catálogos geográficos versionados

Los archivos de esta carpeta son snapshots locales consumidos exclusivamente por la migración Flyway V16; el arranque no descarga datos de Internet.

| Archivo | Fuente | Fecha de consulta | Registros usados |
| --- | --- | --- | --- |
| `provincias-georef-2026-09-28.json` | [Georef / Datos Argentina](https://apis.datos.gob.ar/georef/api/provincias) | 2026-09-28 | 24 jurisdicciones |
| `localidades-georef-2026-09-28.json` | [Georef / Datos Argentina](https://apis.datos.gob.ar/georef/api/localidades?max=5000) | 2026-09-28 | 4.037 localidades |
| `aerodromos-mintrans-2026-09-28.csv` | [Lista de aeropuertos / Datos Argentina](https://datos.gob.ar/dataset/transporte-lista-aeropuertos) | 2026-09-28 | 566 aeródromos |

El CSV descargado contiene 693 filas de datos efectivas: 566 con tipo `Aeródromo` y 127 con tipo `Helipuerto`. V16 incorpora sólo las 566 primeras; no se fuerza `localidad_id` de una instalación cuando la relación no es inequívoca. Las columnas heredadas `ciudad` y `provincia` se conservan temporalmente para trazabilidad.

V16 intenta convertir los textos históricos de `vuelos` sólo si, tras trim/caso/tildes, existe exactamente una localidad oficial coincidente. Las filas ambiguas o sin coincidencia conservan el texto legacy y el FK permanece nulo.
