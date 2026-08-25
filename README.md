[`Conceptos avanzados de bases de datos NoSQL`](../../README.md) > `Proyecto final ECOBICI`

# Patrones espacio-temporales de desequilibrio de flujo en ECOBICI

## Problema y objetivo

ECOBICI permite retirar una bicicleta en una cicloestación y devolverla en otra. Debido a que los viajes no regresan necesariamente al lugar de origen, algunas estaciones pueden registrar durante ciertos periodos más retiros que arribos, mientras que otras presentan el comportamiento contrario. Estas diferencias producen un desequilibrio de flujo observado que puede repetirse según la estación, la hora y el tipo de día.

El objetivo es analizar los viajes completados durante el primer trimestre de 2026 para identificar qué cicloestaciones presentan patrones recurrentes de desequilibrio, cuándo se concentran y si aparecen de manera aislada o junto con estaciones cercanas. El proyecto pertenece al dominio de movilidad urbana, micromovilidad y gestión operativa de sistemas públicos de bicicletas compartidas.

```mermaid
flowchart LR
    A[CSV mensuales de viajes] --> B[(ecobici_viajes)]
    C[Catálogo de cicloestaciones] --> D[(ecobici_estaciones)]
    B --> E[Análisis temporal]
    B --> F[Balance de retiros y arribos]
    B --> G[Análisis geoespacial]
    D --> G
    E --> H[Priorización del monitoreo]
    F --> H
    G --> H
```

## Personas usuarias y decisión apoyada

El usuario principal es el personal encargado del monitoreo y la operación de ECOBICI. SEMOVI y el personal de planeación de movilidad son usuarios secundarios, mientras que las personas usuarias del sistema son beneficiarias indirectas.

La solución apoyará la decisión de priorizar qué cicloestaciones y qué periodos deben someterse a mayor monitoreo o revisión debido a patrones recurrentes de desequilibrio de flujo. No decidirá cuántas bicicletas mover, qué vehículo utilizar ni qué ruta seguir.

## Preguntas del proyecto

**Pregunta principal:** ¿Qué cicloestaciones presentan los desequilibrios recurrentes de flujo más pronunciados entre retiros y arribos, y en qué días y franjas horarias se concentran?

**Preguntas secundarias:**

1. ¿Cómo cambia el balance de flujo entre horas pico y horas de menor utilización, así como entre días laborables y fines de semana?
2. ¿Existen zonas donde varias cicloestaciones cercanas presentan simultáneamente patrones semejantes de presión neta de entrada o salida?
3. ¿Qué cicloestaciones mantienen patrones de desequilibrio similares durante las semanas analizadas y cuáles presentan un comportamiento variable?

## Alcance y límites

- La unidad de origen es un viaje completado publicado por ECOBICI.
- El periodo se delimita mediante los archivos mensuales de enero a marzo de 2026, organizados por mes de arribo.
- Se utilizan identificadores de estación, fechas, horas y coordenadas oficiales.
- Se excluyen género, edad e identificador de bicicleta porque no son necesarios para las preguntas del proyecto.
- No se observan viajes intentados que no pudieron realizarse, inventarios históricos, movimientos internos del operador ni trayectorias GPS.
- Un desequilibrio de flujo no demuestra que una estación haya quedado vacía o llena.
- El resultado apoya la priorización del monitoreo, pero no constituye un algoritmo de redistribución ni una predicción de demanda.

Los CSV originales no se versionan. Sus fuentes, tamaños, conteos y hashes se documentan en [`datos/README.md`](datos/README.md).

## Carga y ejecución

La carga se realiza desde la terminal integrada de AWS Academy Learner Lab. Git transporta los scripts y la documentación; S3 transporta únicamente los cuatro CSV originales. No se guardan credenciales ni nombres de bucket, y los archivos descargados en `datos/raw/` no se versionan.

```mermaid
flowchart LR
    A[S3: cuatro CSV originales] --> B[datos/raw]
    B --> C[Verificación SHA-256]
    C --> D[Transformación por streaming]
    D --> E[mongoimport]
    E --> F[(m6_nosql)]
    F --> G[Verificación reproducible]
```

Desde la raíz del clon, prepara MongoDB e instala la versión fijada de `mongoimport`:

```bash
cd ~/m6-nosql
bash setup/setup.sh
bash proyecto_final/ecobici/scripts/instalar_mongoimport.sh
```

En la consola web de S3, crea un bucket de la sesión y dentro de él una carpeta llamada `ecobici`. Sube allí los cuatro objetos con estas claves exactas: `ecobici/2026-01.csv`, `ecobici/2026-02.csv`, `ecobici/2026-03.csv` y `ecobici/cicloestaciones_ecobici.csv`.

Después, desde la terminal de Learner Lab, crea la carpeta local de entrada y descarga ese prefijo. Sustituye `NOMBRE-DEL-BUCKET` por el nombre real; no escribas llaves de acceso en el comando ni en ningún archivo:

```bash
mkdir -p proyecto_final/ecobici/datos/raw

aws s3 cp \
  s3://NOMBRE-DEL-BUCKET/ecobici/ \
  proyecto_final/ecobici/datos/raw/ \
  --recursive \
  --only-show-errors
```

Los nombres dentro de `datos/raw/` deben ser exactamente `2026-01.csv`, `2026-02.csv`, `2026-03.csv` y `cicloestaciones_ecobici.csv`. Comprueba su integridad antes de modificar la base:

```bash
cd ~/m6-nosql/proyecto_final/ecobici/datos/raw
sha256sum -c ../manifest.sha256
cd ~/m6-nosql
```

Ejecuta la carga completa con un solo comando:

```bash
bash proyecto_final/ecobici/scripts/cargar_datos.sh
```

El cargador verifica nuevamente los hashes, restablece exclusivamente `ecobici_viajes` y `ecobici_estaciones`, procesa los archivos secuencialmente, importa Extended JSON mediante entrada estándar y ejecuta las comprobaciones finales. No genera una segunda copia transformada de los 4.7 millones de viajes en disco.

Una ejecución correcta termina con:

```text
Verificación correcta: la carga ECOBICI coincide con el contrato auditado.
Carga ECOBICI completa y verificada en la base m6_nosql.
```

El procedimiento se comprobó el 25 de agosto de 2026 en AWS Academy Learner Lab con MongoDB Server y MongoDB Shell 4.4.29, además de `mongoimport` 100.17.0. La ejecución terminó con código `0`, sin documentos fallidos, después de cargar 4 707 285 documentos en `ecobici_viajes` y 677 en `ecobici_estaciones`.

El verificador también comprueba los conteos mensuales, las banderas de calidad, la conversión de fechas, la geometría, la trazabilidad y la exclusión de género, edad e identificador de bicicleta. La comprobación final recorre la colección completa y ejecuta `validate`, por lo que puede tardar varios minutos y no debe interrumpirse.

La carga es repetible desde un estado conocido. Si la transformación, la importación o la verificación detectan un error, el cargador intenta eliminar los documentos ECOBICI parciales y advierte si no puede hacerlo. Un cierre abrupto del laboratorio todavía podría interrumpir esa limpieza; en cualquiera de esos casos, vuelve a ejecutar `cargar_datos.sh`, que restablecerá únicamente las dos colecciones del proyecto antes de comenzar.

El restablecimiento elimina también los índices secundarios y validadores que se añadan en fases posteriores. Por ello, el orden reproducible final será cargar los datos, ejecutar las consultas iniciales, obtener su medición base y después aplicar los futuros scripts de indexación y validación.

Para utilizar otra ubicación local sin mover los CSV, define una variable específica al ejecutar:

```bash
ECOBICI_RAW_DIR=/ruta/a/los/csv \
  bash proyecto_final/ecobici/scripts/cargar_datos.sh
```

## Consultas reproducibles

El universo principal es la cohorte de 4 707 285 viajes cuyos arribos pertenecen a los archivos de enero, febrero y marzo de 2026. La consulta de balance cuenta los dos extremos de todos esos viajes; por ello, el balance global de la cohorte debe ser cero. Los 104 viajes mayores de 24 horas permanecen incluidos y auditables, tal como se decidió durante el modelado.

Las consultas horaria y semanal utilizan el momento real de cada retiro o arribo y aplican intervalos semiabiertos en la zona `America/Mexico_City`. Como los archivos se seleccionaron por mes de arribo, no contienen los retiros de viajes que terminaron en abril. En consecuencia, estos resultados describen los extremos observados dentro de la cohorte cargada y no deben presentarse como un registro completo de todos los eventos del trimestre ni como inventario de bicicletas.

El identificador no catalogado `1000` se conserva en el control global, pero sólo se excluye el extremo correspondiente de los rankings operativos. El otro extremo de esos viajes sigue participando cuando pertenece a una estación catalogada. La dirección del balance se define siempre como `arribos - retiros`: un valor positivo indica presión neta de entrada observada y uno negativo indica presión neta de salida observada.

| Script | Pregunta y unidad | Igualdad o rango | Ordenamiento | Arreglos | Importancia y volumen |
|---|---|---|---|---|---|
| `consultas/01_balance_cohorte.js` | Prioriza estaciones por balance acumulado de la cohorte completa. | No aplica un rango adicional; agrupa los dos extremos de los viajes cargados. | Magnitud, movimientos e identificador. | Combina en JavaScript dos resúmenes pequeños por estación; no consulta campos de arreglo. | Es la consulta principal de priorización y procesa 4 707 285 retiros y 4 707 285 arribos. |
| `consultas/02_patrones_horarios.js` | Compara cada estación por día de semana y hora local, además de laborables frente a fines de semana. | `calidad.retiroEnCatalogo = true` o `calidad.arriboEnCatalogo = true`, con cada instante en `[2026-01-01, 2026-04-01)`. | Magnitud del balance medio direccional, movimientos e identificador; el resumen horario conserva orden cronológico. | Agrupa los extremos hasta obtener claves estación-día-hora y combina únicamente esos resúmenes. | Responde la parte temporal de la pregunta principal sobre millones de extremos observados. |
| `consultas/03_consistencia_semanal.js` | Identifica estaciones con dirección recurrente o cambiante durante doce intervalos semanales completos dentro de la cohorte observada. | Bandera de catálogo y cada instante en `[2026-01-05, 2026-03-30)`. | Recurrencia, consistencia y magnitud para la dirección dominante; evidencia, menor consistencia y mayor salto para estaciones que cambian de dirección. | Cada estación produce una serie final de doce semanas; no lee arreglos almacenados. | Responde la pregunta de recurrencia para las 677 estaciones catalogadas. |

Los controles esperados no fijan de antemano los rankings. La primera consulta exige 4 707 285 retiros, 4 707 285 arribos, balance global `0`, 9 414 452 extremos catalogados y balance catalogado `-38`; también comprueba los 40 retiros y 78 arribos asociados con `1000`. La segunda exige 4 707 132 retiros y 4 707 207 arribos catalogados dentro del trimestre, además de un resumen de 24 horas para cada tipo de día. La tercera exige 4 505 019 retiros, 4 504 990 arribos, 677 series de doce semanas y fechas conocidas en la primera, segunda y última semana. Los cuatro conteos temporales se contrastaron directamente contra los CSV auditados.

Para esta consulta, el pico observado se define de forma reproducible como las cinco horas con más movimientos promedio por día y se contrasta con las cinco de menor actividad, por separado para laborables y fines de semana. No se impone una franja externa. La magnitud del balance medio direccional se calcula como el valor absoluto del balance acumulado para una combinación estación-día-hora dividido entre la cantidad de días comparables; los cambios de signo se cancelan, por lo que no equivale al promedio de magnitudes diarias. En el análisis semanal, la recurrencia es la proporción de las doce semanas que repite la dirección dominante y la consistencia compara esa dirección sólo entre semanas con balance distinto de cero. Una estación se considera cambiante únicamente si presenta semanas de entrada y de salida; esos casos se priorizan por la cantidad de semanas con evidencia antes de comparar consistencia y salto máximo. El salto máximo consecutivo no se interpreta como toda la variabilidad.

La comparación semanal reutiliza la lógica de variaciones consecutivas practicada en el curso. Los pipelines se limitan a los patrones presentes en los ejemplos del repositorio: `$match`, `$group`, `$dateToString`, `$sum` y `$sort`, además de los intervalos temporales y cálculos pequeños en JavaScript empleados en los ejemplos 14, 15 y 16 de la semana 4. No crean índices, colecciones derivadas ni resúmenes permanentes.

Después de cargar y verificar los datos, ejecuta desde la raíz del clon:

```bash
bash proyecto_final/ecobici/scripts/ejecutar_consultas.sh
```

Cada consulta comprueba primero los conteos de la carga y después valida invariantes propios. Una ejecución correcta termina con:

```text
Consultas ECOBICI completas y verificadas.
```

En esta fase son esperables recorridos completos de `ecobici_viajes`; por eso cada pipeline puede tardar varios minutos. La fase siguiente medirá estos patrones con `explain("executionStats")` antes de proponer índices.
