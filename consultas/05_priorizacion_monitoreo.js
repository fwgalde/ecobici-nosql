var base = db.getSiblingDB("m6_nosql");
var viajes = base.ecobici_viajes;
var estaciones = base.ecobici_estaciones;

var VIAJES_ESPERADOS = 4707285;
var ESTACIONES_ESPERADAS = 677;
var ZONA_HORARIA = "America/Mexico_City";
var INICIO_TRIMESTRE = new Date("2026-01-01T06:00:00Z");
var FIN_TRIMESTRE = new Date("2026-04-01T06:00:00Z");
var INICIO_SEMANAS = new Date("2026-01-05T06:00:00Z");
var FIN_SEMANAS = new Date("2026-03-30T06:00:00Z");
var MILISEGUNDOS_SEMANA = 7 * 24 * 60 * 60 * 1000;
var INICIO_LOCAL_MILISEGUNDOS = Date.UTC(2026, 0, 5);
var CANTIDAD_SEMANAS = 12;
var DISTANCIA_MAXIMA_METROS = 1000;
var VECINOS_MAXIMOS = 3;

var NOMBRES_DIA = {
  "1": "domingo",
  "2": "lunes",
  "3": "martes",
  "4": "miércoles",
  "5": "jueves",
  "6": "viernes",
  "7": "sábado"
};

var CANTIDAD_DIAS = {
  "1": 13,
  "2": 13,
  "3": 13,
  "4": 12,
  "5": 13,
  "6": 13,
  "7": 13
};

function valorAbsoluto(valor) {
  return valor < 0 ? -valor : valor;
}

function redondear(valor, decimales) {
  var factor = 1;
  var i;
  for (i = 0; i < decimales; i += 1) {
    factor *= 10;
  }
  return Math.round(valor * factor) / factor;
}

function compararTexto(a, b) {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function obtenerFila(mapa, estacionId, parte1, parte2) {
  var clave = estacionId + "|" + parte1 + (parte2 === null ? "" : "|" + parte2);
  if (!mapa[clave]) {
    mapa[clave] = {
      estacionId: estacionId,
      parte1: parte1,
      parte2: parte2,
      retiros: 0,
      arribos: 0
    };
  }
  return mapa[clave];
}

function indiceSemana(fechaLocal) {
  var fechaMilisegundos = new Date(fechaLocal + "T00:00:00Z").getTime();
  return Math.floor((fechaMilisegundos - INICIO_LOCAL_MILISEGUNDOS) / MILISEGUNDOS_SEMANA);
}

if (
  viajes.countDocuments({}) !== VIAJES_ESPERADOS ||
  estaciones.countDocuments({}) !== ESTACIONES_ESPERADAS
) {
  throw new Error("La carga ECOBICI no coincide con los conteos esperados. Ejecuta primero cargar_datos.sh.");
}

print("=== Consulta 5: priorización ejecutiva del monitoreo ===");
print("El orden usa recurrencia, consistencia y magnitud; no se calcula un puntaje ponderado.");

var pipelineHorarioRetiros = [
  {
    $match: {
      "calidad.retiroEnCatalogo": true,
      "retiro.ocurrioEn": {
        $gte: INICIO_TRIMESTRE,
        $lt: FIN_TRIMESTRE
      }
    }
  },
  {
    $addFields: {
      diaSemanaRetiro: {
        $dateToString: {
          format: "%w",
          date: "$retiro.ocurrioEn",
          timezone: ZONA_HORARIA
        }
      },
      horaRetiro: {
        $dateToString: {
          format: "%H",
          date: "$retiro.ocurrioEn",
          timezone: ZONA_HORARIA
        }
      }
    }
  },
  {
    $group: {
      _id: {
        estacionId: "$retiro.estacionId",
        diaSemana: "$diaSemanaRetiro",
        hora: "$horaRetiro"
      },
      retiros: { $sum: 1 }
    }
  },
  {
    $project: {
      _id: 0,
      estacionId: "$_id.estacionId",
      diaSemana: "$_id.diaSemana",
      hora: "$_id.hora",
      retiros: 1
    }
  },
  { $sort: { estacionId: 1, diaSemana: 1, hora: 1 } }
];

var pipelineHorarioArribos = [
  {
    $match: {
      "calidad.arriboEnCatalogo": true,
      "arribo.ocurrioEn": {
        $gte: INICIO_TRIMESTRE,
        $lt: FIN_TRIMESTRE
      }
    }
  },
  {
    $addFields: {
      diaSemanaArribo: {
        $dateToString: {
          format: "%w",
          date: "$arribo.ocurrioEn",
          timezone: ZONA_HORARIA
        }
      },
      horaArribo: {
        $dateToString: {
          format: "%H",
          date: "$arribo.ocurrioEn",
          timezone: ZONA_HORARIA
        }
      }
    }
  },
  {
    $group: {
      _id: {
        estacionId: "$arribo.estacionId",
        diaSemana: "$diaSemanaArribo",
        hora: "$horaArribo"
      },
      arribos: { $sum: 1 }
    }
  },
  {
    $project: {
      _id: 0,
      estacionId: "$_id.estacionId",
      diaSemana: "$_id.diaSemana",
      hora: "$_id.hora",
      arribos: 1
    }
  },
  { $sort: { estacionId: 1, diaSemana: 1, hora: 1 } }
];

var pipelineSemanalRetiros = [
  {
    $match: {
      "calidad.retiroEnCatalogo": true,
      "retiro.ocurrioEn": {
        $gte: INICIO_SEMANAS,
        $lt: FIN_SEMANAS
      }
    }
  },
  {
    $addFields: {
      fechaLocalRetiro: {
        $dateToString: {
          format: "%Y-%m-%d",
          date: "$retiro.ocurrioEn",
          timezone: ZONA_HORARIA
        }
      }
    }
  },
  {
    $group: {
      _id: {
        estacionId: "$retiro.estacionId",
        fechaLocal: "$fechaLocalRetiro"
      },
      retiros: { $sum: 1 }
    }
  },
  {
    $project: {
      _id: 0,
      estacionId: "$_id.estacionId",
      fechaLocal: "$_id.fechaLocal",
      retiros: 1
    }
  },
  { $sort: { estacionId: 1, fechaLocal: 1 } }
];

var pipelineSemanalArribos = [
  {
    $match: {
      "calidad.arriboEnCatalogo": true,
      "arribo.ocurrioEn": {
        $gte: INICIO_SEMANAS,
        $lt: FIN_SEMANAS
      }
    }
  },
  {
    $addFields: {
      fechaLocalArribo: {
        $dateToString: {
          format: "%Y-%m-%d",
          date: "$arribo.ocurrioEn",
          timezone: ZONA_HORARIA
        }
      }
    }
  },
  {
    $group: {
      _id: {
        estacionId: "$arribo.estacionId",
        fechaLocal: "$fechaLocalArribo"
      },
      arribos: { $sum: 1 }
    }
  },
  {
    $project: {
      _id: 0,
      estacionId: "$_id.estacionId",
      fechaLocal: "$_id.fechaLocal",
      arribos: 1
    }
  },
  { $sort: { estacionId: 1, fechaLocal: 1 } }
];

var horarioRetiros = viajes.aggregate(pipelineHorarioRetiros).toArray();
var horarioArribos = viajes.aggregate(pipelineHorarioArribos).toArray();
var semanalRetiros = viajes.aggregate(pipelineSemanalRetiros).toArray();
var semanalArribos = viajes.aggregate(pipelineSemanalArribos).toArray();
var horasPorClave = {};
var semanasPorClave = {};
var totalHorarioRetiros = 0;
var totalHorarioArribos = 0;
var totalSemanalRetiros = 0;
var totalSemanalArribos = 0;
var i;

for (i = 0; i < horarioRetiros.length; i += 1) {
  obtenerFila(horasPorClave, horarioRetiros[i].estacionId, horarioRetiros[i].diaSemana, horarioRetiros[i].hora).retiros = horarioRetiros[i].retiros;
  totalHorarioRetiros += horarioRetiros[i].retiros;
}

for (i = 0; i < horarioArribos.length; i += 1) {
  obtenerFila(horasPorClave, horarioArribos[i].estacionId, horarioArribos[i].diaSemana, horarioArribos[i].hora).arribos = horarioArribos[i].arribos;
  totalHorarioArribos += horarioArribos[i].arribos;
}

for (i = 0; i < semanalRetiros.length; i += 1) {
  var numeroSemanaRetiro = indiceSemana(semanalRetiros[i].fechaLocal);
  if (numeroSemanaRetiro < 0 || numeroSemanaRetiro >= CANTIDAD_SEMANAS) {
    throw new Error("Un retiro quedó fuera de las doce semanas completas.");
  }
  obtenerFila(semanasPorClave, semanalRetiros[i].estacionId, numeroSemanaRetiro, null).retiros += semanalRetiros[i].retiros;
  totalSemanalRetiros += semanalRetiros[i].retiros;
}

for (i = 0; i < semanalArribos.length; i += 1) {
  var numeroSemanaArribo = indiceSemana(semanalArribos[i].fechaLocal);
  if (numeroSemanaArribo < 0 || numeroSemanaArribo >= CANTIDAD_SEMANAS) {
    throw new Error("Un arribo quedó fuera de las doce semanas completas.");
  }
  obtenerFila(semanasPorClave, semanalArribos[i].estacionId, numeroSemanaArribo, null).arribos += semanalArribos[i].arribos;
  totalSemanalArribos += semanalArribos[i].arribos;
}

var documentosEstacion = estaciones.find(
  {},
  { _id: 1, colonia: 1, alcaldia: 1, ubicacion: 1 }
).sort({ _id: 1 }).toArray();
var catalogo = {};

for (i = 0; i < documentosEstacion.length; i += 1) {
  catalogo[documentosEstacion[i]._id] = documentosEstacion[i];
}

var patronesPorEstacion = {};

Object.keys(horasPorClave).forEach(function (clave) {
  var fila = horasPorClave[clave];
  var balance = fila.arribos - fila.retiros;
  var divisorDia = CANTIDAD_DIAS[fila.parte1];
  var direccion = balance > 0 ? "entrada" : balance < 0 ? "salida" : "neutral";
  var patron;
  var actual;

  if (!catalogo[fila.estacionId] || !divisorDia || direccion === "neutral") {
    return;
  }

  patron = {
    diaSemana: fila.parte1,
    dia: NOMBRES_DIA[fila.parte1],
    hora: fila.parte2,
    horaLocal: fila.parte2 + ":00",
    balancePromedio: redondear(balance / divisorDia, 3),
    magnitudBalancePromedio: redondear(valorAbsoluto(balance) / divisorDia, 3),
    movimientosPromedio: redondear((fila.retiros + fila.arribos) / divisorDia, 3)
  };

  if (!patronesPorEstacion[fila.estacionId]) {
    patronesPorEstacion[fila.estacionId] = {};
  }
  actual = patronesPorEstacion[fila.estacionId][direccion];

  if (
    !actual ||
    patron.magnitudBalancePromedio > actual.magnitudBalancePromedio ||
    (
      patron.magnitudBalancePromedio === actual.magnitudBalancePromedio &&
      patron.movimientosPromedio > actual.movimientosPromedio
    ) ||
    (
      patron.magnitudBalancePromedio === actual.magnitudBalancePromedio &&
      patron.movimientosPromedio === actual.movimientosPromedio &&
      patron.diaSemana + patron.hora < actual.diaSemana + actual.hora
    )
  ) {
    patronesPorEstacion[fila.estacionId][direccion] = patron;
  }
});

var resultados = [];

for (i = 0; i < documentosEstacion.length; i += 1) {
  var estacion = documentosEstacion[i];
  var semanasEntrada = 0;
  var semanasSalida = 0;
  var semanasNeutras = 0;
  var sumaBalance = 0;
  var sumaMagnitud = 0;
  var semana;

  for (semana = 0; semana < CANTIDAD_SEMANAS; semana += 1) {
    var claveSemana = estacion._id + "|" + semana;
    var filaSemana = semanasPorClave[claveSemana] || { retiros: 0, arribos: 0 };
    var balanceSemana = filaSemana.arribos - filaSemana.retiros;

    sumaBalance += balanceSemana;
    sumaMagnitud += valorAbsoluto(balanceSemana);

    if (balanceSemana > 0) {
      semanasEntrada += 1;
    } else if (balanceSemana < 0) {
      semanasSalida += 1;
    } else {
      semanasNeutras += 1;
    }
  }

  var semanasConDesequilibrio = semanasEntrada + semanasSalida;
  var semanasSentidoMasFrecuente = semanasEntrada > semanasSalida ? semanasEntrada : semanasSalida;
  var direccionPredominante;

  if (semanasConDesequilibrio === 0) {
    direccionPredominante = "neutral";
  } else if (semanasEntrada === semanasSalida) {
    direccionPredominante = "mixta";
  } else {
    direccionPredominante = semanasEntrada > semanasSalida ? "entrada" : "salida";
  }

  resultados.push({
    estacionId: estacion._id,
    alcaldia: estacion.alcaldia,
    colonia: estacion.colonia,
    semanasEntrada: semanasEntrada,
    semanasSalida: semanasSalida,
    semanasNeutras: semanasNeutras,
    direccionPredominante: direccionPredominante,
    recurrenciaDireccional: redondear(semanasSentidoMasFrecuente / CANTIDAD_SEMANAS, 3),
    consistenciaDireccion: semanasConDesequilibrio === 0 ? 0 : redondear(semanasSentidoMasFrecuente / semanasConDesequilibrio, 3),
    balanceDoceSemanas: sumaBalance,
    magnitudPromedioSemanal: redondear(sumaMagnitud / CANTIDAD_SEMANAS, 3),
    patronCritico: patronesPorEstacion[estacion._id] ? patronesPorEstacion[estacion._id][direccionPredominante] : null
  });
}

function ordenarPrioridad(a, b) {
  if (b.recurrenciaDireccional !== a.recurrenciaDireccional) {
    return b.recurrenciaDireccional - a.recurrenciaDireccional;
  }
  if (b.consistenciaDireccion !== a.consistenciaDireccion) {
    return b.consistenciaDireccion - a.consistenciaDireccion;
  }
  if (b.magnitudPromedioSemanal !== a.magnitudPromedioSemanal) {
    return b.magnitudPromedioSemanal - a.magnitudPromedioSemanal;
  }
  return compararTexto(a.estacionId, b.estacionId);
}

var prioridadEntrada = resultados.filter(function (fila) {
  return fila.direccionPredominante === "entrada" && fila.patronCritico !== null;
}).sort(ordenarPrioridad).slice(0, 5);

var prioridadSalida = resultados.filter(function (fila) {
  return fila.direccionPredominante === "salida" && fila.patronCritico !== null;
}).sort(ordenarPrioridad).slice(0, 5);

estaciones.createIndex(
  { ubicacion: "2dsphere" },
  { name: "ubicacion_2dsphere" }
);

var indiceGeografico = null;
var indicesEstaciones = estaciones.getIndexes();

for (i = 0; i < indicesEstaciones.length; i += 1) {
  if (
    indicesEstaciones[i].name === "ubicacion_2dsphere" &&
    indicesEstaciones[i].key &&
    indicesEstaciones[i].key.ubicacion === "2dsphere"
  ) {
    indiceGeografico = indicesEstaciones[i].name;
    break;
  }
}

if (indiceGeografico !== "ubicacion_2dsphere") {
  throw new Error("No se pudo confirmar el índice geoespacial requerido por la síntesis.");
}

function contarVecinosMismoSentido(fila) {
  var patron = fila.patronCritico;
  var cercanas = estaciones.aggregate([
    {
      $geoNear: {
        near: catalogo[fila.estacionId].ubicacion,
        key: "ubicacion",
        distanceField: "distanciaMetros",
        maxDistance: DISTANCIA_MAXIMA_METROS,
        spherical: true,
        query: { _id: { $ne: fila.estacionId } }
      }
    },
    { $project: { _id: 1 } }
  ]).toArray().slice(0, VECINOS_MAXIMOS);
  var coincidencias = 0;

  cercanas.forEach(function (vecina) {
    var clave = vecina._id + "|" + patron.diaSemana + "|" + patron.hora;
    var filaVecina = horasPorClave[clave] || { retiros: 0, arribos: 0 };
    var balanceVecina = filaVecina.arribos - filaVecina.retiros;

    if (
      (fila.direccionPredominante === "entrada" && balanceVecina > 0) ||
      (fila.direccionPredominante === "salida" && balanceVecina < 0)
    ) {
      coincidencias += 1;
    }
  });

  return {
    evaluados: cercanas.length,
    mismoSentido: coincidencias
  };
}

function resumirPrioridad(fila) {
  var vecindad = contarVecinosMismoSentido(fila);
  return {
    estacionId: fila.estacionId,
    alcaldia: fila.alcaldia,
    colonia: fila.colonia,
    direccionPredominante: fila.direccionPredominante,
    recurrenciaDireccional: fila.recurrenciaDireccional,
    consistenciaDireccion: fila.consistenciaDireccion,
    semanasEntrada: fila.semanasEntrada,
    semanasSalida: fila.semanasSalida,
    balanceDoceSemanas: fila.balanceDoceSemanas,
    patronCritico: {
      dia: fila.patronCritico.dia,
      horaLocal: fila.patronCritico.horaLocal,
      balancePromedio: fila.patronCritico.balancePromedio
    },
    vecindad: vecindad
  };
}

var resumenEntrada = prioridadEntrada.map(resumirPrioridad);
var resumenSalida = prioridadSalida.map(resumirPrioridad);

for (i = 0; i < resultados.length; i += 1) {
  if (
    resultados[i].semanasEntrada + resultados[i].semanasSalida + resultados[i].semanasNeutras !== CANTIDAD_SEMANAS ||
    resultados[i].recurrenciaDireccional < 0 ||
    resultados[i].recurrenciaDireccional > 1 ||
    resultados[i].consistenciaDireccion < 0 ||
    resultados[i].consistenciaDireccion > 1
  ) {
    throw new Error("Una estación no cumple los controles de recurrencia de la síntesis.");
  }
}

if (
  totalHorarioRetiros !== 4707132 ||
  totalHorarioArribos !== 4707207 ||
  totalSemanalRetiros !== 4505019 ||
  totalSemanalArribos !== 4504990 ||
  resultados.length !== ESTACIONES_ESPERADAS ||
  resumenEntrada.length !== 5 ||
  resumenSalida.length !== 5
) {
  throw new Error("La priorización ejecutiva no coincide con los controles auditados.");
}

print("\nControl de la síntesis:");
printjson({
  zonaHoraria: ZONA_HORARIA,
  semanasCompletas: CANTIDAD_SEMANAS,
  estacionesEvaluadas: resultados.length,
  retirosCatalogadosEnElTrimestre: totalHorarioRetiros,
  arribosCatalogadosEnElTrimestre: totalHorarioArribos,
  retirosCatalogadosEnDoceSemanas: totalSemanalRetiros,
  arribosCatalogadosEnDoceSemanas: totalSemanalArribos,
  distanciaMaximaMetros: DISTANCIA_MAXIMA_METROS,
  vecinosMaximos: VECINOS_MAXIMOS
});
print("\nCinco estaciones prioritarias con presión recurrente de entrada:");
printjson(resumenEntrada);
print("\nCinco estaciones prioritarias con presión recurrente de salida:");
printjson(resumenSalida);
print("\nLectura ejecutiva: la lista responde qué estaciones repiten un sentido de desequilibrio, cuándo alcanza su mayor expresión y cuántas vecinas cercanas coinciden.");
print("El orden no determina acciones de redistribución ni prueba disponibilidad; únicamente prioriza monitoreo con viajes observados.");
