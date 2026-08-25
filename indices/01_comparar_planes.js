var curso = db.getSiblingDB("m6_nosql");
var viajes = curso.ecobici_viajes;

var VIAJES_ESPERADOS = 4707285;
var RETIROS_CATALOGADOS_TRIMESTRE = 4707132;
var INICIO_TRIMESTRE = ISODate("2026-01-01T06:00:00Z");
var FIN_TRIMESTRE = ISODate("2026-04-01T06:00:00Z");
var LIMITE_MONITOREO = 100;

var NOMBRE_INDICE_RETIRO = "retiro_estacion_catalogo_fecha_desc";
var NOMBRE_INDICE_ARRIBO = "arribo_estacion_catalogo_fecha_desc";

if (viajes.countDocuments({}) !== VIAJES_ESPERADOS) {
  throw new Error("La carga ECOBICI no coincide con el conteo esperado. Ejecuta primero cargar_datos.sh.");
}

var consultas = [
  {
    id: "A",
    finalidad: "Últimos cien retiros observados de la estación prioritaria 208 durante el trimestre.",
    filtro: {
      "retiro.estacionId": "208",
      "calidad.retiroEnCatalogo": true,
      "retiro.ocurrioEn": { $gte: INICIO_TRIMESTRE, $lt: FIN_TRIMESTRE }
    },
    orden: { "retiro.ocurrioEn": -1 },
    limite: LIMITE_MONITOREO,
    indiceEsperado: NOMBRE_INDICE_RETIRO
  },
  {
    id: "B",
    finalidad: "Todos los retiros observados de la estación 208 para comprobar el prefijo del índice.",
    filtro: { "retiro.estacionId": "208" },
    orden: null,
    limite: null,
    indiceEsperado: NOMBRE_INDICE_RETIRO
  },
  {
    id: "C",
    finalidad: "Últimos cien arribos observados de la estación prioritaria 271-272 durante el trimestre.",
    filtro: {
      "arribo.estacionId": "271-272",
      "calidad.arriboEnCatalogo": true,
      "arribo.ocurrioEn": { $gte: INICIO_TRIMESTRE, $lt: FIN_TRIMESTRE }
    },
    orden: { "arribo.ocurrioEn": -1 },
    limite: LIMITE_MONITOREO,
    indiceEsperado: NOMBRE_INDICE_ARRIBO
  },
  {
    id: "D",
    finalidad: "Filtro amplio de retiros catalogados usado como control del análisis horario.",
    filtro: {
      "calidad.retiroEnCatalogo": true,
      "retiro.ocurrioEn": { $gte: INICIO_TRIMESTRE, $lt: FIN_TRIMESTRE }
    },
    orden: null,
    limite: null,
    indiceEsperado: null
  }
];

function reunirPlan(nodo, etapas, indices) {
  if (nodo === null || typeof nodo !== "object") {
    return;
  }
  if (nodo.stage) {
    etapas.push(nodo.stage);
  }
  if (nodo.indexName) {
    indices.push(nodo.indexName);
  }
  Object.keys(nodo).forEach(function (clave) {
    reunirPlan(nodo[clave], etapas, indices);
  });
}

function unicos(valores) {
  return valores.filter(function (valor, posicion) {
    return valores.indexOf(valor) === posicion;
  });
}

function medir(consulta) {
  var cursor = viajes.find(consulta.filtro);
  var explicacion;
  var etapas = [];
  var indices = [];

  if (consulta.orden !== null) {
    cursor = cursor.sort(consulta.orden);
  }
  if (consulta.limite !== null) {
    cursor = cursor.limit(consulta.limite);
  }

  explicacion = cursor.explain("executionStats");
  reunirPlan(explicacion.queryPlanner.winningPlan, etapas, indices);

  etapas = unicos(etapas);
  indices = unicos(indices);

  return {
    etapas: etapas,
    indices: indices,
    requiereSort: etapas.indexOf("SORT") !== -1,
    nReturned: explicacion.executionStats.nReturned,
    totalKeysExamined: explicacion.executionStats.totalKeysExamined,
    totalDocsExamined: explicacion.executionStats.totalDocsExamined,
    executionTimeMillis: explicacion.executionStats.executionTimeMillis
  };
}

function medirTodas() {
  return consultas.map(function (consulta) {
    return medir(consulta);
  });
}

function buscarIndice(nombre) {
  var encontrados = viajes.getIndexes().filter(function (indice) {
    return indice.name === nombre;
  });
  return encontrados.length === 1 ? encontrados[0] : null;
}

function contiene(valor, valores) {
  return valores.indexOf(valor) !== -1;
}

function validarIndiceRetiro() {
  var indice = buscarIndice(NOMBRE_INDICE_RETIRO);
  return indice !== null &&
    indice.key["retiro.estacionId"] === 1 &&
    indice.key["calidad.retiroEnCatalogo"] === 1 &&
    indice.key["retiro.ocurrioEn"] === -1;
}

function validarIndiceArribo() {
  var indice = buscarIndice(NOMBRE_INDICE_ARRIBO);
  return indice !== null &&
    indice.key["arribo.estacionId"] === 1 &&
    indice.key["calidad.arriboEnCatalogo"] === 1 &&
    indice.key["arribo.ocurrioEn"] === -1;
}

print("=== Medición e índices de ECOBICI ===");
print("Se repiten las mismas cuatro consultas antes y después de crear dos índices secundarios.");

viajes.dropIndexes();

if (viajes.getIndexes().length !== 1 || viajes.getIndexes()[0].name !== "_id_") {
  throw new Error("La medición inicial debe conservar únicamente el índice _id_.");
}

print("\n1/3 Midiendo planes iniciales...");
var medicionesAntes = medirTodas();

medicionesAntes.forEach(function (medicion) {
  if (!contiene("COLLSCAN", medicion.etapas) || medicion.totalDocsExamined !== VIAJES_ESPERADOS) {
    throw new Error("Una medición inicial no recorrió la colección completa como se esperaba.");
  }
});

print("2/3 Creando dos índices dirigidos por los patrones operativos...");
viajes.createIndex(
  {
    "retiro.estacionId": 1,
    "calidad.retiroEnCatalogo": 1,
    "retiro.ocurrioEn": -1
  },
  { name: NOMBRE_INDICE_RETIRO }
);
viajes.createIndex(
  {
    "arribo.estacionId": 1,
    "calidad.arriboEnCatalogo": 1,
    "arribo.ocurrioEn": -1
  },
  { name: NOMBRE_INDICE_ARRIBO }
);

if (viajes.getIndexes().length !== 3 || !validarIndiceRetiro() || !validarIndiceArribo()) {
  throw new Error("Los índices creados no coinciden con la estrategia aprobada.");
}

print("3/3 Repitiendo las mismas mediciones...");
var medicionesDespues = medirTodas();
var comparaciones = [];
var i;

for (i = 0; i < consultas.length; i += 1) {
  if (medicionesAntes[i].nReturned !== medicionesDespues[i].nReturned) {
    throw new Error("El índice cambió la cantidad de resultados de la Consulta " + consultas[i].id + ".");
  }
  if (consultas[i].indiceEsperado !== null) {
    if (!contiene(consultas[i].indiceEsperado, medicionesDespues[i].indices)) {
      throw new Error("La Consulta " + consultas[i].id + " no utilizó el índice esperado.");
    }
    if (medicionesDespues[i].totalDocsExamined >= medicionesAntes[i].totalDocsExamined) {
      throw new Error("La Consulta " + consultas[i].id + " no redujo los documentos examinados.");
    }
  }
  if ((consultas[i].id === "A" || consultas[i].id === "C") && medicionesDespues[i].requiereSort) {
    throw new Error("La Consulta " + consultas[i].id + " todavía requiere una etapa SORT independiente.");
  }

  comparaciones.push({
    consulta: consultas[i].id,
    finalidad: consultas[i].finalidad,
    indiceEsperado: consultas[i].indiceEsperado,
    antes: medicionesAntes[i],
    despues: medicionesDespues[i],
    resultadosConservados: true,
    documentosEvitados: medicionesAntes[i].totalDocsExamined - medicionesDespues[i].totalDocsExamined
  });
}

if (
  medicionesAntes[0].nReturned !== LIMITE_MONITOREO ||
  medicionesAntes[2].nReturned !== LIMITE_MONITOREO ||
  medicionesAntes[3].nReturned !== RETIROS_CATALOGADOS_TRIMESTRE
) {
  throw new Error("Las consultas de control no devolvieron las cantidades auditadas.");
}

print("\nÍndices secundarios comprobados:");
printjson(viajes.getIndexes().filter(function (indice) {
  return indice.name !== "_id_";
}).map(function (indice) {
  return { name: indice.name, key: indice.key };
}));

print("\nComparación compacta antes y después:");
printjson(comparaciones);

print("\nInterpretación:");
print("Las consultas A y C usan igualdades antes del campo temporal y ya no requieren SORT independiente.");
print("La consulta B reutiliza el prefijo retiro.estacionId del índice de retiros.");
print("La consulta D conserva como evidencia el comportamiento de un filtro amplio; no se supone que todo índice mejore toda consulta.");
print("executionTimeMillis puede variar; la evidencia principal está en las etapas y en las claves y documentos examinados.");
print("Medición e índices ECOBICI completos y verificados.");
