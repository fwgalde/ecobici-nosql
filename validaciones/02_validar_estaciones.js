var curso = db.getSiblingDB("m6_nosql");
var nombreColeccion = "ecobici_estaciones";
var nombreColeccionPruebas = "ecobici_estaciones_validacion_prueba";
var cantidadEsperada = 677;
var estaciones = curso.getCollection(nombreColeccion);

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

if (curso.getCollectionInfos({ name: nombreColeccion }).length !== 1) {
  throw new Error("Ejecuta primero cargar_datos.sh para crear ecobici_estaciones.");
}

exigirCantidad(estaciones.countDocuments({}), cantidadEsperada, "Estaciones antes de aplicar el validador");

var esquema = {
  bsonType: "object",
  required: [
    "_id",
    "sistema",
    "direccion",
    "colonia",
    "alcaldia",
    "sitioInstalacion",
    "estatusEnCatalogo",
    "ubicacion",
    "fuente"
  ],
  properties: {
    _id: {
      bsonType: "string"
    },
    sistema: {
      bsonType: "string"
    },
    direccion: {
      bsonType: "object",
      required: ["callePrincipal", "calleSecundaria"],
      properties: {
        callePrincipal: {
          bsonType: "string"
        },
        calleSecundaria: {
          bsonType: "string"
        }
      }
    },
    colonia: {
      bsonType: "string"
    },
    alcaldia: {
      bsonType: "string"
    },
    sitioInstalacion: {
      bsonType: "string"
    },
    estatusEnCatalogo: {
      bsonType: "string"
    },
    ubicacion: {
      bsonType: "object",
      required: ["type", "coordinates"],
      properties: {
        type: {
          bsonType: "string",
          "enum": ["Point"]
        },
        coordinates: {
          bsonType: "array",
          minItems: 2,
          items: {
            bsonType: ["int", "long", "double", "decimal"],
            minimum: -180,
            maximum: 180
          }
        }
      }
    },
    fuente: {
      bsonType: "object",
      required: [
        "archivo",
        "url",
        "fechaActualizacionPublicada",
        "sha256"
      ],
      properties: {
        archivo: {
          bsonType: "string"
        },
        url: {
          bsonType: "string"
        },
        fechaActualizacionPublicada: {
          bsonType: "string"
        },
        sha256: {
          bsonType: "string"
        }
      }
    }
  }
};

var modificacion = curso.runCommand({
  collMod: nombreColeccion,
  validator: { $jsonSchema: esquema },
  validationLevel: "strict",
  validationAction: "error"
});

exigir(modificacion.ok === 1, "No fue posible aplicar el validador a ecobici_estaciones.");

var informacion = curso.getCollectionInfos({ name: nombreColeccion })[0];
var opciones = informacion.options;
exigir(opciones.validator && opciones.validator.$jsonSchema, "No se encontró el esquema geoespacial aplicado.");
exigir(opciones.validationLevel === "strict", "El nivel de validación de estaciones no es strict.");
exigir(opciones.validationAction === "error", "La acción de validación de estaciones no es error.");

estaciones.createIndex(
  { ubicacion: "2dsphere" },
  { name: "ubicacion_2dsphere" }
);

var indices = estaciones.getIndexes();
var indiceGeoespacial = indices.filter(function (indice) {
  return indice.name === "ubicacion_2dsphere" && indice.key.ubicacion === "2dsphere";
});
exigir(indiceGeoespacial.length === 1, "No se pudo crear y verificar ubicacion_2dsphere.");

curso[nombreColeccionPruebas].drop();
var creacionPruebas = curso.createCollection(nombreColeccionPruebas, {
  validator: { $jsonSchema: esquema },
  validationLevel: "strict",
  validationAction: "error"
});
exigir(creacionPruebas.ok === 1, "No fue posible crear la colección temporal de pruebas geográficas.");

var pruebas = curso.getCollection(nombreColeccionPruebas);
var resultados = [];
var inconsistencias = [];
var validasAceptadas = 0;
var invalidasRechazadas = 0;

function probarInsercion(etiqueta, documento, debeAceptarse, regla) {
  var aceptada = false;
  try {
    pruebas.insertOne(documento);
    aceptada = true;
  } catch (error) {
    aceptada = false;
  }

  resultados.push({
    prueba: etiqueta,
    esperado: debeAceptarse ? "aceptada" : "rechazada",
    resultado: aceptada ? "aceptada" : "rechazada",
    regla: regla
  });

  if (aceptada && debeAceptarse) {
    validasAceptadas += 1;
  }
  if (!aceptada && !debeAceptarse) {
    invalidasRechazadas += 1;
  }
  if (aceptada !== debeAceptarse) {
    inconsistencias.push(etiqueta);
  }
}

function estacionDePrueba(id, ubicacion) {
  return {
    _id: id,
    sistema: "Ecobici",
    direccion: {
      callePrincipal: "Calle pública de prueba",
      calleSecundaria: "Referencia pública de prueba"
    },
    colonia: "Colonia de prueba",
    alcaldia: "Cuauhtemoc",
    sitioInstalacion: "Banqueta",
    estatusEnCatalogo: "Instalada",
    ubicacion: ubicacion,
    fuente: {
      archivo: "cicloestaciones_ecobici.csv",
      url: "https://datos.cdmx.gob.mx/",
      fechaActualizacionPublicada: "2024-10-17",
      sha256: "prueba-estructural-sin-datos-personales"
    }
  };
}

print("=== Validación geoespacial de ecobici_estaciones ===");
print("Se aplica el esquema a la colección real y se aíslan cuatro geometrías en una colección temporal sin índice.");

probarInsercion(
  "1. Punto válido",
  estacionDePrueba("VAL-GEO-01", {
    type: "Point",
    coordinates: [-99.139705, 19.432024]
  }),
  true,
  "Cumple Point, arreglo, cantidad mínima, tipos numéricos e intervalos generales."
);

probarInsercion(
  "2. Tipo de geometría incorrecto",
  estacionDePrueba("VAL-GEO-02", {
    type: "LineString",
    coordinates: [-99.139705, 19.432024]
  }),
  false,
  "ubicacion.type sólo admite Point."
);

probarInsercion(
  "3. Arreglo de coordenadas incompleto",
  estacionDePrueba("VAL-GEO-03", {
    type: "Point",
    coordinates: [-99.139705]
  }),
  false,
  "ubicacion.coordinates exige minItems 2."
);

probarInsercion(
  "4. Longitud fuera de intervalo",
  estacionDePrueba("VAL-GEO-04", {
    type: "Point",
    coordinates: [200, 19.432024]
  }),
  false,
  "Cada componente del arreglo admite como máximo 180."
);

var documentosTemporales = pruebas.countDocuments({});
if (documentosTemporales !== 1) {
  inconsistencias.push("cantidad de geometrías almacenadas en la colección temporal");
}

curso[nombreColeccionPruebas].drop();
var coleccionTemporalEliminada = curso.getCollectionInfos({
  name: nombreColeccionPruebas
}).length === 0;
var cantidadFinal = estaciones.countDocuments({});

print("\nConfiguración comprobada:");
printjson({
  coleccion: nombreColeccion,
  validationLevel: opciones.validationLevel,
  validationAction: opciones.validationAction,
  indice: indiceGeoespacial[0].name
});

print("\nResultados de las pruebas geográficas:");
printjson(resultados);

print("\nResumen geoespacial:");
printjson({
  estacionesOriginales: cantidadEsperada,
  geometriasValidasAceptadas: validasAceptadas,
  geometriasInvalidasRechazadas: invalidasRechazadas,
  documentosTemporalesAntesDeLimpiar: documentosTemporales,
  coleccionTemporalEliminada: coleccionTemporalEliminada,
  estacionesFinales: cantidadFinal
});

exigirCantidad(cantidadFinal, cantidadEsperada, "Estaciones después de las pruebas");
exigir(coleccionTemporalEliminada, "La colección temporal no fue eliminada.");
exigir(inconsistencias.length === 0, "No coincidieron las pruebas geográficas: " + inconsistencias.join(", ") + ".");
exigirCantidad(validasAceptadas, 1, "Geometrías válidas aceptadas");
exigirCantidad(invalidasRechazadas, 3, "Geometrías inválidas rechazadas");

print("Validación geoespacial ECOBICI completa y verificada.");
