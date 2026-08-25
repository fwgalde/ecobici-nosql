# Bitácora de desarrollo

> Este archivo registra el proceso de trabajo interno y no forma parte del entregable final.

## 2026-08-24

- Se definieron el problema, las personas usuarias, la decisión apoyada y cuatro preguntas del proyecto.
- Se seleccionaron y auditaron tres archivos mensuales de viajes y el catálogo de cicloestaciones.
- Se verificaron 4 707 285 viajes, 677 estaciones catalogadas y un identificador no catalogado (`1000`).
- Se diseñaron las colecciones `ecobici_viajes` y `ecobici_estaciones`.
- Se documentaron las decisiones de anidamiento, referencia, temporalidad, geografía, trazabilidad y minimización.
- Se eliminaron encabezados internos que no corresponden a requisitos explícitos del proyecto.
- Se sustituyeron los cortes manuales de párrafo y el diagrama ASCII por diagramas Mermaid.

## 2026-08-25

- Se diseñó una carga reproducible por streaming para los cuatro CSV auditados.
- Se añadió la instalación local y versionada de `mongoimport` sin privilegios administrativos.
- Se implementó la transformación de fechas, identificadores, geometrías, trazabilidad y banderas de calidad.
- Se incorporó una verificación reproducible de conteos, tipos BSON, referencias contra la instantánea auditada y minimización de datos.
- Se documentó el traslado de los CSV mediante S3 y el orden de ejecución en Learner Lab.
- Se ejecutó la carga en Learner Lab con MongoDB Server y MongoDB Shell 4.4.29 y `mongoimport` 100.17.0.
- Se importaron 4 707 285 viajes y 677 estaciones sin documentos fallidos; la verificación integral terminó con código `0`.
- Se corrigió la línea vacía final del manifiesto de hashes detectada durante la ejecución.

## Próximas fases

- Consultas y pipelines.
- Medición e índices.
- Validación mediante JSON Schema.
- Análisis temporal y geoespacial.
- Seguridad, evidencias, reporte y exposición.
