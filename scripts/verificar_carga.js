// Verifica la carga completa sin materializar los 4.7 millones de viajes en memoria.
// Compatible con la consola clásica de MongoDB 4.4 y con mongosh en MongoDB 7.0.

var base = db.getSiblingDB("m6_nosql");

function exigir(condicion, mensaje) {
  if (!condicion) {
    throw new Error(mensaje);
  }
}

function exigirCantidad(actual, esperada, etiqueta) {
  if (Number(actual) !== esperada) {
    throw new Error(etiqueta + ": se obtuvo " + actual + " y se esperaba " + esperada + ".");
  }
}

var cantidadEstaciones = base.ecobici_estaciones.countDocuments({});
exigirCantidad(cantidadEstaciones, 677, "Cantidad de estaciones");

var estacionesConCoordenadas = base.ecobici_estaciones.countDocuments({
  "ubicacion.coordinates": { $type: "array" }
});
exigirCantidad(estacionesConCoordenadas, 677, "Estaciones con arreglo de coordenadas");

var resumenEstaciones = base.ecobici_estaciones.aggregate([
  {
    $group: {
      _id: null,
      total: { $sum: 1 },
      documentosInvalidos: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: [{ $type: "$_id" }, "string"] },
                { $eq: [{ $type: "$sistema" }, "string"] },
                { $eq: [{ $type: "$direccion" }, "object"] },
                { $eq: [{ $type: "$direccion.callePrincipal" }, "string"] },
                { $eq: [{ $type: "$direccion.calleSecundaria" }, "string"] },
                { $eq: [{ $type: "$colonia" }, "string"] },
                { $eq: [{ $type: "$alcaldia" }, "string"] },
                { $eq: [{ $type: "$sitioInstalacion" }, "string"] },
                { $eq: [{ $type: "$estatusEnCatalogo" }, "string"] },
                { $eq: [{ $type: "$ubicacion" }, "object"] },
                { $eq: ["$ubicacion.type", "Point"] },
                { $eq: [{ $type: "$ubicacion.coordinates" }, "array"] },
                { $eq: [{ $type: "$fuente" }, "object"] },
                { $eq: [{ $type: "$fuente.archivo" }, "string"] },
                { $eq: [{ $type: "$fuente.url" }, "string"] },
                { $eq: [{ $type: "$fuente.fechaActualizacionPublicada" }, "string"] },
                { $eq: [{ $type: "$fuente.sha256" }, "string"] }
              ]
            },
            0,
            1
          ]
        }
      }
    }
  }
]).toArray()[0];

exigirCantidad(resumenEstaciones.total, 677, "Resumen de estaciones");
exigirCantidad(resumenEstaciones.documentosInvalidos, 0, "Estaciones con estructura o tipos inválidos");

var resumenGeografico = base.ecobici_estaciones.aggregate([
  {
    $project: {
      longitud: { $arrayElemAt: ["$ubicacion.coordinates", 0] },
      latitud: { $arrayElemAt: ["$ubicacion.coordinates", 1] },
      cantidadCoordenadas: { $size: "$ubicacion.coordinates" }
    }
  },
  {
    $group: {
      _id: null,
      geometriasInvalidas: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$cantidadCoordenadas", 2] },
                { $in: [{ $type: "$longitud" }, ["double", "int", "long", "decimal"]] },
                { $in: [{ $type: "$latitud" }, ["double", "int", "long", "decimal"]] },
                { $gte: ["$longitud", -180] },
                { $lte: ["$longitud", 180] },
                { $gte: ["$latitud", -90] },
                { $lte: ["$latitud", 90] }
              ]
            },
            0,
            1
          ]
        }
      }
    }
  }
]).toArray()[0];

exigirCantidad(resumenGeografico.geometriasInvalidas, 0, "Geometrías inválidas");
exigirCantidad(base.ecobici_estaciones.countDocuments({ estatusEnCatalogo: { $ne: "Instalada" } }), 0, "Estaciones con estatus inesperado");
exigirCantidad(base.ecobici_estaciones.countDocuments({ "fuente.sha256": { $ne: "305cc954e25942f6f57528bd95d1f7f46dd9880ed564f2ff4a477aeaca7f1a9d" } }), 0, "Estaciones con hash de fuente inesperado");
exigir(base.ecobici_estaciones.findOne({ _id: "001" }) !== null, "No se conservó el identificador 001.");
exigir(base.ecobici_estaciones.findOne({ _id: "237-238" }) !== null, "No se conservó el identificador compuesto 237-238.");
exigir(base.ecobici_estaciones.findOne({ _id: "264-275" }) !== null, "No se conservó el identificador compuesto 264-275.");
exigir(base.ecobici_estaciones.findOne({ _id: "1000" }) === null, "Se creó indebidamente la estación no catalogada 1000.");
exigir(base.ecobici_estaciones.findOne({ _id: "021" }) !== null && base.ecobici_estaciones.findOne({ _id: "022" }) !== null, "Las estaciones 021 y 022 no se conservaron como documentos distintos.");

var resumenViajes = base.ecobici_viajes.aggregate([
  {
    $group: {
      _id: null,
      total: { $sum: 1 },
      enero: { $sum: { $cond: [{ $eq: ["$fuente.archivo", "2026-01.csv"] }, 1, 0] } },
      febrero: { $sum: { $cond: [{ $eq: ["$fuente.archivo", "2026-02.csv"] }, 1, 0] } },
      marzo: { $sum: { $cond: [{ $eq: ["$fuente.archivo", "2026-03.csv"] }, 1, 0] } },
      duracionesMayores24h: { $sum: { $cond: ["$calidad.duracionMayor24h", 1, 0] } },
      retirosFueraMes: { $sum: { $cond: ["$calidad.retiroFueraMesArribo", 1, 0] } },
      retirosNoCatalogados: { $sum: { $cond: [{ $eq: ["$calidad.retiroEnCatalogo", false] }, 1, 0] } },
      arribosNoCatalogados: { $sum: { $cond: [{ $eq: ["$calidad.arriboEnCatalogo", false] }, 1, 0] } },
      viajesNoCatalogados: {
        $sum: {
          $cond: [
            {
              $or: [
                { $eq: ["$calidad.retiroEnCatalogo", false] },
                { $eq: ["$calidad.arriboEnCatalogo", false] }
              ]
            },
            1,
            0
          ]
        }
      },
      documentosInvalidos: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: [{ $type: "$_id" }, "string"] },
                { $eq: [{ $type: "$retiro" }, "object"] },
                { $eq: [{ $type: "$retiro.estacionId" }, "string"] },
                { $eq: [{ $type: "$retiro.ocurrioEn" }, "date"] },
                { $eq: [{ $type: "$arribo" }, "object"] },
                { $eq: [{ $type: "$arribo.estacionId" }, "string"] },
                { $eq: [{ $type: "$arribo.ocurrioEn" }, "date"] },
                { $eq: [{ $type: "$duracionSegundos" }, "int"] },
                { $eq: [{ $type: "$fuente" }, "object"] },
                { $eq: [{ $type: "$fuente.archivo" }, "string"] },
                { $eq: [{ $type: "$fuente.filaCsv" }, "int"] },
                { $eq: [{ $type: "$calidad" }, "object"] },
                { $eq: [{ $type: "$calidad.duracionMayor24h" }, "bool"] },
                { $eq: [{ $type: "$calidad.retiroFueraMesArribo" }, "bool"] },
                { $eq: [{ $type: "$calidad.retiroEnCatalogo" }, "bool"] },
                { $eq: [{ $type: "$calidad.arriboEnCatalogo" }, "bool"] }
              ]
            },
            0,
            1
          ]
        }
      },
      identificadoresInvalidos: {
        $sum: {
          $cond: [
            {
              $regexMatch: {
                input: { $convert: { input: "$_id", to: "string", onError: "", onNull: "" } },
                regex: /^[0-9]{4}-[0-9]{2}:[0-9]{7}$/
              }
            },
            0,
            1
          ]
        }
      },
      duracionesNoPositivas: { $sum: { $cond: [{ $lte: ["$duracionSegundos", 0] }, 1, 0] } },
      duracionesInconsistentes: {
        $sum: {
          $cond: [
            {
              $ne: [
                { $subtract: ["$arribo.ocurrioEn", "$retiro.ocurrioEn"] },
                { $multiply: ["$duracionSegundos", 1000] }
              ]
            },
            1,
            0
          ]
        }
      },
      banderasDuracionInconsistentes: {
        $sum: {
          $cond: [
            { $ne: ["$calidad.duracionMayor24h", { $gt: ["$duracionSegundos", 86400] }] },
            1,
            0
          ]
        }
      },
      banderasMesInconsistentes: {
        $sum: {
          $cond: [
            {
              $ne: [
                "$calidad.retiroFueraMesArribo",
                {
                  $ne: [
                    { $dateToString: { format: "%Y-%m", date: "$retiro.ocurrioEn", timezone: "America/Mexico_City" } },
                    { $dateToString: { format: "%Y-%m", date: "$arribo.ocurrioEn", timezone: "America/Mexico_City" } }
                  ]
                }
              ]
            },
            1,
            0
          ]
        }
      },
      mesesFuenteInvalidos: {
        $sum: {
          $cond: [
            {
              $ne: [
                "$fuente.archivo",
                {
                  $concat: [
                    { $dateToString: { format: "%Y-%m", date: "$arribo.ocurrioEn", timezone: "America/Mexico_City" } },
                    ".csv"
                  ]
                }
              ]
            },
            1,
            0
          ]
        }
      },
      referenciasCatalogoInconsistentes: {
        $sum: {
          $cond: [
            {
              $or: [
                { $ne: ["$calidad.retiroEnCatalogo", { $ne: ["$retiro.estacionId", "1000"] }] },
                { $ne: ["$calidad.arriboEnCatalogo", { $ne: ["$arribo.estacionId", "1000"] }] }
              ]
            },
            1,
            0
          ]
        }
      },
      camposPersonalesConservados: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: [{ $type: "$Genero_Usuario" }, "missing"] },
                { $eq: [{ $type: "$Edad_Usuario" }, "missing"] },
                { $eq: [{ $type: "$Bici" }, "missing"] },
                { $eq: [{ $type: "$genero" }, "missing"] },
                { $eq: [{ $type: "$edad" }, "missing"] },
                { $eq: [{ $type: "$bici" }, "missing"] }
              ]
            },
            0,
            1
          ]
        }
      }
    }
  }
], { allowDiskUse: true }).toArray()[0];

exigir(resumenViajes !== undefined, "No se obtuvo el resumen de viajes.");
exigirCantidad(resumenViajes.total, 4707285, "Cantidad total de viajes");
exigirCantidad(resumenViajes.enero, 1525302, "Viajes de enero");
exigirCantidad(resumenViajes.febrero, 1528610, "Viajes de febrero");
exigirCantidad(resumenViajes.marzo, 1653373, "Viajes de marzo");
exigirCantidad(resumenViajes.duracionesMayores24h, 104, "Duraciones mayores de 24 horas");
exigirCantidad(resumenViajes.retirosFueraMes, 440, "Retiros fuera del mes de arribo");
exigirCantidad(resumenViajes.retirosNoCatalogados, 40, "Retiros no catalogados");
exigirCantidad(resumenViajes.arribosNoCatalogados, 78, "Arribos no catalogados");
exigirCantidad(resumenViajes.viajesNoCatalogados, 114, "Viajes con al menos un extremo no catalogado");
exigirCantidad(resumenViajes.documentosInvalidos, 0, "Viajes con estructura o tipos inválidos");
exigirCantidad(resumenViajes.identificadoresInvalidos, 0, "Viajes con _id inválido");
exigirCantidad(resumenViajes.duracionesNoPositivas, 0, "Viajes con duración no positiva");
exigirCantidad(resumenViajes.duracionesInconsistentes, 0, "Viajes con duración derivada inconsistente");
exigirCantidad(resumenViajes.banderasDuracionInconsistentes, 0, "Banderas de duración inconsistentes");
exigirCantidad(resumenViajes.banderasMesInconsistentes, 0, "Banderas mensuales inconsistentes");
exigirCantidad(resumenViajes.mesesFuenteInvalidos, 0, "Viajes fuera del mes declarado por su fuente");
exigirCantidad(resumenViajes.referenciasCatalogoInconsistentes, 0, "Referencias de catálogo inconsistentes");
exigirCantidad(resumenViajes.camposPersonalesConservados, 0, "Viajes con campos personales no autorizados");

var muestraViaje = base.ecobici_viajes.findOne({ _id: "2026-01:0000044" });
exigir(muestraViaje !== null, "No se encontró el viaje representativo 2026-01:0000044.");
exigir(muestraViaje.retiro.estacionId === "087", "La estación de retiro del viaje representativo no coincide.");
exigir(muestraViaje.arribo.estacionId === "099", "La estación de arribo del viaje representativo no coincide.");
exigir(muestraViaje.retiro.ocurrioEn.valueOf() === ISODate("2026-01-01T06:06:57Z").valueOf(), "La fecha de retiro del viaje representativo no coincide.");
exigir(muestraViaje.arribo.ocurrioEn.valueOf() === ISODate("2026-01-01T06:11:21Z").valueOf(), "La fecha de arribo del viaje representativo no coincide.");
exigir(Number(muestraViaje.duracionSegundos) === 264, "La duración del viaje representativo no coincide.");
exigir(Number(muestraViaje.fuente.filaCsv) === 45, "La línea fuente del viaje representativo no coincide.");

var muestraEstacion = base.ecobici_estaciones.findOne({ _id: "087" });
exigir(muestraEstacion !== null, "No se encontró la estación representativa 087.");
exigir(muestraEstacion.ubicacion.type === "Point", "La geometría de la estación 087 no es Point.");
exigir(muestraEstacion.ubicacion.coordinates[0] === -99.139705 && muestraEstacion.ubicacion.coordinates[1] === 19.432024, "Las coordenadas de la estación 087 no coinciden.");

var validacionEstaciones = base.runCommand({ validate: "ecobici_estaciones", full: false });
var validacionViajes = base.runCommand({ validate: "ecobici_viajes", full: false });
exigir(validacionEstaciones.ok === 1 && validacionEstaciones.valid === true, "MongoDB no validó correctamente el almacenamiento de ecobici_estaciones.");
exigir(validacionViajes.ok === 1 && validacionViajes.valid === true, "MongoDB no validó correctamente el almacenamiento de ecobici_viajes.");

printjson({
  ecobici_estaciones: cantidadEstaciones,
  ecobici_viajes: resumenViajes.total,
  porArchivo: {
    "2026-01.csv": resumenViajes.enero,
    "2026-02.csv": resumenViajes.febrero,
    "2026-03.csv": resumenViajes.marzo
  },
  calidad: {
    duracionesMayores24h: resumenViajes.duracionesMayores24h,
    retirosFueraMes: resumenViajes.retirosFueraMes,
    retirosNoCatalogados: resumenViajes.retirosNoCatalogados,
    arribosNoCatalogados: resumenViajes.arribosNoCatalogados,
    viajesNoCatalogados: resumenViajes.viajesNoCatalogados
  }
});

print("Verificación correcta: la carga ECOBICI coincide con el contrato auditado.");
