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
- Se implementaron tres consultas reproducibles para el balance de la cohorte, los patrones por día y hora local y la consistencia durante doce semanas completas.
- Se limitaron los pipelines a operadores y patrones practicados en los ejemplos del repositorio, sin índices, validadores ni colecciones derivadas.
- Se documentó la diferencia entre la cohorte seleccionada por mes de arribo y un registro completo de eventos del trimestre.
- Se ejecutaron las tres consultas en Learner Lab; los controles de la cohorte, los intervalos horarios y las doce semanas terminaron correctamente con código `0`.
- Se refactorizaron las consultas para declarar pipelines con las secuencias de etapas utilizadas en los retos y ejemplos del curso.
- Se redujo la salida a rankings ejecutivos: cinco estaciones por sentido en el balance, cinco patrones horarios únicos con contrastes de tres horas y cinco estaciones por categoría semanal.
- Se reservó JavaScript para combinar resultados agregados, completar los doce intervalos conocidos y calcular cambios consecutivos, de acuerdo con los ejemplos temporales del curso.
- Se corrigió la interpretación de los empates semanales: seis semanas de entrada y seis de salida forman un patrón mixto, no una dirección dominante.
- Se amplió la comparación horaria para mostrar los periodos laborables y de fin de semana de mayor y menor actividad para cada estación prioritaria.
- Se añadió una consulta geoespacial basada en `2dsphere` y `$geoNear` que contrasta las tres estaciones más cercanas dentro de 1 km en el mismo día y hora del patrón crítico.
- Se añadió una priorización ejecutiva sin puntuaciones ponderadas, ordenada por recurrencia, consistencia y magnitud semanal.
- Se integraron cinco consultas reproducibles en el ejecutor de la fase y se mantuvieron únicamente patrones presentes en los retos y ejemplos del curso.
- Se corrigió la comprobación del índice geoespacial para consultar el catálogo de índices en MongoDB Shell 4.4.29.

## Próximas fases

- Medición e índices.
- Validación mediante JSON Schema.
- Medición y evidencia temporal especializada, además del análisis geoespacial.
- Seguridad, evidencias, reporte y exposición.
