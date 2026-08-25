var curso = db.getSiblingDB("m6_nosql");
var nombreColeccion = "ecobici_viajes";
var cantidadEsperada = 4707285;
var viajes = curso.getCollection(nombreColeccion);
var idsPrueba = [
  "2026-01:9999998",
  "2026-01:9999999",
  "2026-02:9999996",
  "2026-02:9999997",
  "2026-02:9999998",
  "2026-03:9999999"
];

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
  throw new Error("Ejecuta primero cargar_datos.sh para crear ecobici_viajes.");
}

viajes.deleteMany({ _id: { $in: idsPrueba } });
exigirCantidad(viajes.countDocuments({}), cantidadEsperada, "Viajes antes de aplicar el validador");

var esquema = {
  bsonType: "object",
  required: [
    "_id",
    "retiro",
    "arribo",
    "duracionSegundos",
    "fuente",
    "calidad"
  ],
  properties: {
    _id: {
      bsonType: "string"
    },
    retiro: {
      bsonType: "object",
      required: ["estacionId", "ocurrioEn"],
      properties: {
        estacionId: {
          bsonType: "string"
        },
        ocurrioEn: {
          bsonType: "date"
        }
      }
    },
    arribo: {
      bsonType: "object",
      required: ["estacionId", "ocurrioEn"],
      properties: {
        estacionId: {
          bsonType: "string"
        },
        ocurrioEn: {
          bsonType: "date"
        }
      }
    },
    duracionSegundos: {
      bsonType: "int",
      minimum: 1
    },
    fuente: {
      bsonType: "object",
      required: ["archivo", "filaCsv"],
      properties: {
        archivo: {
          bsonType: "string",
          "enum": ["2026-01.csv", "2026-02.csv", "2026-03.csv"]
        },
        filaCsv: {
          bsonType: "int",
          minimum: 2
        }
      }
    },
    calidad: {
      bsonType: "object",
      required: [
        "duracionMayor24h",
        "retiroFueraMesArribo",
        "retiroEnCatalogo",
        "arriboEnCatalogo"
      ],
      properties: {
        duracionMayor24h: {
          bsonType: "bool"
        },
        retiroFueraMesArribo: {
          bsonType: "bool"
        },
        retiroEnCatalogo: {
          bsonType: "bool"
        },
        arriboEnCatalogo: {
          bsonType: "bool"
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

exigir(modificacion.ok === 1, "No fue posible aplicar el validador a ecobici_viajes.");

var informacion = curso.getCollectionInfos({ name: nombreColeccion })[0];
var opciones = informacion.options;
exigir(opciones.validator && opciones.validator.$jsonSchema, "No se encontró el esquema aplicado.");
exigir(opciones.validationLevel === "strict", "El nivel de validación no es strict.");
exigir(opciones.validationAction === "error", "La acción de validación no es error.");

var resultados = [];
var inconsistencias = [];
var validosAceptados = 0;
var invalidosRechazados = 0;

function probarInsercion(etiqueta, documento, debeAceptarse, regla) {
  var aceptada = false;
  try {
    viajes.insertOne(documento);
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
    validosAceptados += 1;
  }
  if (!aceptada && !debeAceptarse) {
    invalidosRechazados += 1;
  }
  if (aceptada !== debeAceptarse) {
    inconsistencias.push(etiqueta);
  }
}

print("=== Validación de ecobici_viajes ===");
print("Se aplicó $jsonSchema mediante collMod y se ejecutan dos casos válidos y cuatro inválidos.");

probarInsercion("1. Viaje ordinario completo", {
  _id: "2026-01:9999998",
  retiro: {
    estacionId: "087",
    ocurrioEn: ISODate("2026-01-15T14:00:00Z")
  },
  arribo: {
    estacionId: "099",
    ocurrioEn: ISODate("2026-01-15T14:10:00Z")
  },
  duracionSegundos: NumberInt(600),
  fuente: {
    archivo: "2026-01.csv",
    filaCsv: NumberInt(9999999)
  },
  calidad: {
    duracionMayor24h: false,
    retiroFueraMesArribo: false,
    retiroEnCatalogo: true,
    arriboEnCatalogo: true
  }
}, true, "Cumple presencia, tipos, mínimo y dominio.");

probarInsercion("2. Viaje largo con retiro no catalogado", {
  _id: "2026-01:9999999",
  retiro: {
    estacionId: "1000",
    ocurrioEn: ISODate("2026-01-15T06:00:00Z")
  },
  arribo: {
    estacionId: "099",
    ocurrioEn: ISODate("2026-01-16T07:00:00Z")
  },
  duracionSegundos: NumberInt(90000),
  fuente: {
    archivo: "2026-01.csv",
    filaCsv: NumberInt(10000000)
  },
  calidad: {
    duracionMayor24h: true,
    retiroFueraMesArribo: false,
    retiroEnCatalogo: false,
    arriboEnCatalogo: true
  }
}, true, "Las anomalías auditadas se conservan cuando mantienen la estructura requerida.");

probarInsercion("3. Falta retiro", {
  _id: "2026-02:9999996",
  arribo: {
    estacionId: "099",
    ocurrioEn: ISODate("2026-02-10T14:10:00Z")
  },
  duracionSegundos: NumberInt(600),
  fuente: {
    archivo: "2026-02.csv",
    filaCsv: NumberInt(9999997)
  },
  calidad: {
    duracionMayor24h: false,
    retiroFueraMesArribo: false,
    retiroEnCatalogo: true,
    arriboEnCatalogo: true
  }
}, false, "retiro aparece en required en la raíz.");

probarInsercion("4. Fecha de retiro como cadena", {
  _id: "2026-02:9999997",
  retiro: {
    estacionId: "087",
    ocurrioEn: "2026-02-10T14:00:00Z"
  },
  arribo: {
    estacionId: "099",
    ocurrioEn: ISODate("2026-02-10T14:10:00Z")
  },
  duracionSegundos: NumberInt(600),
  fuente: {
    archivo: "2026-02.csv",
    filaCsv: NumberInt(9999998)
  },
  calidad: {
    duracionMayor24h: false,
    retiroFueraMesArribo: false,
    retiroEnCatalogo: true,
    arriboEnCatalogo: true
  }
}, false, "retiro.ocurrioEn exige bsonType date.");

probarInsercion("5. Duración igual a cero", {
  _id: "2026-02:9999998",
  retiro: {
    estacionId: "087",
    ocurrioEn: ISODate("2026-02-10T14:00:00Z")
  },
  arribo: {
    estacionId: "099",
    ocurrioEn: ISODate("2026-02-10T14:10:00Z")
  },
  duracionSegundos: NumberInt(0),
  fuente: {
    archivo: "2026-02.csv",
    filaCsv: NumberInt(9999999)
  },
  calidad: {
    duracionMayor24h: false,
    retiroFueraMesArribo: false,
    retiroEnCatalogo: true,
    arriboEnCatalogo: true
  }
}, false, "duracionSegundos exige minimum 1.");

probarInsercion("6. Archivo fuera del dominio", {
  _id: "2026-03:9999999",
  retiro: {
    estacionId: "087",
    ocurrioEn: ISODate("2026-03-10T14:00:00Z")
  },
  arribo: {
    estacionId: "099",
    ocurrioEn: ISODate("2026-03-10T14:10:00Z")
  },
  duracionSegundos: NumberInt(600),
  fuente: {
    archivo: "2026-04.csv",
    filaCsv: NumberInt(10000000)
  },
  calidad: {
    duracionMayor24h: false,
    retiroFueraMesArribo: false,
    retiroEnCatalogo: true,
    arriboEnCatalogo: true
  }
}, false, "fuente.archivo sólo admite los tres CSV cargados.");

var documentosPrueba = viajes.countDocuments({ _id: { $in: idsPrueba } });
if (documentosPrueba !== 2) {
  inconsistencias.push("cantidad de documentos de prueba almacenados");
}

viajes.deleteMany({ _id: { $in: idsPrueba } });
var cantidadFinal = viajes.countDocuments({});

print("\nConfiguración comprobada:");
printjson({
  coleccion: nombreColeccion,
  validationLevel: opciones.validationLevel,
  validationAction: opciones.validationAction
});

print("\nResultados de las pruebas:");
printjson(resultados);

print("\nResumen:");
printjson({
  documentosOriginales: cantidadEsperada,
  validosAceptados: validosAceptados,
  invalidosRechazados: invalidosRechazados,
  documentosPruebaAlmacenadosAntesDeLimpiar: documentosPrueba,
  documentosFinales: cantidadFinal
});

exigirCantidad(cantidadFinal, cantidadEsperada, "Viajes después de limpiar las pruebas");
exigir(inconsistencias.length === 0, "No coincidieron las pruebas esperadas: " + inconsistencias.join(", ") + ".");
exigirCantidad(validosAceptados, 2, "Documentos válidos aceptados");
exigirCantidad(invalidosRechazados, 4, "Documentos inválidos rechazados");

print("Validación JSON Schema ECOBICI completa y verificada.");
