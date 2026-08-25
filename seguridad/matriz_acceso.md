# Matriz de acceso y protección de ECOBICI

## Finalidad y clasificación

- Finalidad de la vista analítica: permitir el análisis de retiros, arribos y pertenencia de las estaciones al catálogo sin exponer la trazabilidad de cada fila ni campos que no participan en las preguntas del proyecto.
- Campos operativos necesarios: `retiro`, `arribo`, `calidad.retiroEnCatalogo` y `calidad.arriboEnCatalogo`.
- Campos de trazabilidad reservados para auditoría: `_id` y `fuente`.
- Campos no necesarios en la vista: `duracionSegundos`, `calidad.duracionMayor24h` y `calidad.retiroFueraMesArribo`.
- Datos personales excluidos desde la carga: género, edad e identificador de bicicleta.
- Datos que no deben aparecer en scripts ni evidencias: contraseñas, tokens, llaves de acceso y nombres particulares de buckets.

Los datos de origen son públicos. Esta clasificación limita el acceso por finalidad y no afirma que la información sea confidencial ni anónima.

## Matriz de acceso

| Perfil | Recurso | Acciones concedidas | Acción no concedida | Razón |
|---|---|---|---|---|
| Análisis | `ecobici_viajes_analitica` | `find` | Lectura de las colecciones fuente y escritura | El análisis requiere los extremos y las banderas de catálogo, no la trazabilidad completa. |
| Auditoría | `ecobici_viajes` y `ecobici_estaciones` | `find` | Escritura y administración de permisos | La auditoría debe contrastar los documentos con su fuente sin modificarlos. |
| Administración | `ecobici_viajes` y `ecobici_estaciones` | `listIndexes`, `createIndex`, `dropIndex` y `collMod` | `find` | La administración mantiene índices y validadores sin recibir lectura de negocio por implicación. |

## Pruebas de diseño

| Perfil | Prueba positiva esperada | Prueba negativa esperada |
|---|---|---|
| Análisis | Consultar cinco documentos de `ecobici_viajes_analitica`. | Una consulta directa de `ecobici_viajes` debe ser denegada en un entorno con autorización. |
| Auditoría | Consultar documentos de las dos colecciones fuente. | Una inserción o actualización debe ser denegada en un entorno con autorización. |
| Administración | Consultar o modificar la definición de índices y validadores de las colecciones fuente. | Una lectura de documentos mediante `find` debe ser denegada en un entorno con autorización. |

## Protección de campos

- Campos excluidos de la vista: `_id`, `fuente`, `duracionSegundos`, `calidad.duracionMayor24h` y `calidad.retiroFueraMesArribo`.
- Comprobación de utilidad: la salida conserva estación y momento de cada retiro y arribo, además de las banderas utilizadas para distinguir extremos catalogados.
- La salida no se denomina anónima porque conserva combinaciones de estación y fecha que podrían relacionarse con información externa.
- La proyección reduce la salida, pero sólo el rol que omite acceso a la fuente establece la frontera de autorización diseñada.

## Alcance del laboratorio

Las evidencias ejecutadas demuestran que la vista contiene cinco salidas minimizadas y que las definiciones de los tres roles existen con recursos y acciones explícitos.

La instancia local no habilita autorización. Por ello, no se crean usuarios ni contraseñas y las pruebas negativas permanecen como diseño pendiente para un entorno autenticado con identidades separadas. La definición de roles no prueba una denegación real. El cifrado, la conservación, los respaldos y la administración de credenciales requieren controles propios fuera de esta demostración.
