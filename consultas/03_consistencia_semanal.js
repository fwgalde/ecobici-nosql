var base = db.getSiblingDB("m6_nosql");
var viajes = base.ecobici_viajes;
var estaciones = base.ecobici_estaciones;

var VIAJES_ESPERADOS = 4707285;
var ESTACIONES_ESPERADAS = 677;
var ZONA_HORARIA = "America/Mexico_City";
var INICIO_SEMANAS = new Date("2026-01-05T06:00:00Z");
var FIN_SEMANAS = new Date("2026-03-30T06:00:00Z");
var MILISEGUNDOS_SEMANA = 7 * 24 * 60 * 60 * 1000;
var INICIO_LOCAL_MILISEGUNDOS = Date.UTC(2026, 0, 5);
var ETIQUETAS_SEMANA = [
  "2026-01-05",
  "2026-01-12",
  "2026-01-19",
  "2026-01-26",
  "2026-02-02",
  "2026-02-09",
  "2026-02-16",
  "2026-02-23",
  "2026-03-02",
  "2026-03-09",
  "2026-03-16",
  "2026-03-23"
];

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

function indiceSemana(fechaLocal) {
  var fechaMilisegundos = new Date(fechaLocal + "T00:00:00Z").getTime();
  return Math.floor((fechaMilisegundos - INICIO_LOCAL_MILISEGUNDOS) / MILISEGUNDOS_SEMANA);
}

function obtenerSemana(mapa, estacionId, numeroSemana) {
  var clave = estacionId + "|" + numeroSemana;
  if (!mapa[clave]) {
    mapa[clave] = {
      estacionId: estacionId,
      numeroSemana: numeroSemana,
      retiros: 0,
      arribos: 0
    };
  }
  return mapa[clave];
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

if (
  viajes.countDocuments({}) !== VIAJES_ESPERADOS ||
  estaciones.countDocuments({}) !== ESTACIONES_ESPERADAS
) {
  throw new Error("La carga ECOBICI no coincide con los conteos esperados. Ejecuta primero cargar_datos.sh.");
}

if (
  indiceSemana("2026-01-05") !== 0 ||
  indiceSemana("2026-01-11") !== 0 ||
  indiceSemana("2026-01-12") !== 1 ||
  indiceSemana("2026-03-29") !== 11
) {
  throw new Error("La asignación de fechas a semanas completas no pasó la prueba conocida.");
}

print("=== Consulta 3: consistencia entre semanas completas ===");
print("Se comparan doce intervalos semanales locales completos dentro del periodo observado, desde el 5 de enero hasta antes del 30 de marzo de 2026.");

var pipelineRetiros = [
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

var pipelineArribos = [
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

var retirosPorFecha = viajes.aggregate(pipelineRetiros).toArray();
var arribosPorFecha = viajes.aggregate(pipelineArribos).toArray();

var documentosEstacion = estaciones.find(
  {},
  { _id: 1, colonia: 1, alcaldia: 1 }
).sort({ _id: 1 }).toArray();
var catalogo = {};
var i;

for (i = 0; i < documentosEstacion.length; i += 1) {
  catalogo[documentosEstacion[i]._id] = true;
}

var semanasPorClave = {};

for (i = 0; i < retirosPorFecha.length; i += 1) {
  var semanaRetiro = indiceSemana(retirosPorFecha[i].fechaLocal);
  if (semanaRetiro < 0 || semanaRetiro >= ETIQUETAS_SEMANA.length) {
    throw new Error("Un retiro quedó fuera de las doce semanas completas.");
  }
  if (!catalogo[retirosPorFecha[i].estacionId]) {
    throw new Error("Un retiro marcado como catalogado no existe en ecobici_estaciones.");
  }
  obtenerSemana(
    semanasPorClave,
    retirosPorFecha[i].estacionId,
    semanaRetiro
  ).retiros += retirosPorFecha[i].retiros;
}

for (i = 0; i < arribosPorFecha.length; i += 1) {
  var semanaArribo = indiceSemana(arribosPorFecha[i].fechaLocal);
  if (semanaArribo < 0 || semanaArribo >= ETIQUETAS_SEMANA.length) {
    throw new Error("Un arribo quedó fuera de las doce semanas completas.");
  }
  if (!catalogo[arribosPorFecha[i].estacionId]) {
    throw new Error("Un arribo marcado como catalogado no existe en ecobici_estaciones.");
  }
  obtenerSemana(
    semanasPorClave,
    arribosPorFecha[i].estacionId,
    semanaArribo
  ).arribos += arribosPorFecha[i].arribos;
}

var resultados = [];
var totalRetiros = 0;
var totalArribos = 0;
var clavesConsumidas = 0;

for (i = 0; i < documentosEstacion.length; i += 1) {
  var estacion = documentosEstacion[i];
  var serie = [];
  var semanasEntrada = 0;
  var semanasSalida = 0;
  var semanasNeutras = 0;
  var semanasConMovimientos = 0;
  var sumaBalance = 0;
  var sumaMagnitud = 0;
  var balanceMinimo = null;
  var balanceMaximo = null;
  var saltoMaximo = 0;
  var semana;

  for (semana = 0; semana < ETIQUETAS_SEMANA.length; semana += 1) {
    var clave = estacion._id + "|" + semana;
    var fila = semanasPorClave[clave] || {
      retiros: 0,
      arribos: 0
    };
    var balance = fila.arribos - fila.retiros;
    var magnitud = valorAbsoluto(balance);

    totalRetiros += fila.retiros;
    totalArribos += fila.arribos;
    sumaBalance += balance;
    sumaMagnitud += magnitud;

    if (semanasPorClave[clave]) {
      clavesConsumidas += 1;
    }
    if (fila.retiros + fila.arribos > 0) {
      semanasConMovimientos += 1;
    }

    if (balance > 0) {
      semanasEntrada += 1;
    } else if (balance < 0) {
      semanasSalida += 1;
    } else {
      semanasNeutras += 1;
    }

    if (balanceMinimo === null || balance < balanceMinimo) {
      balanceMinimo = balance;
    }
    if (balanceMaximo === null || balance > balanceMaximo) {
      balanceMaximo = balance;
    }
    if (serie.length > 0) {
      var variacion = valorAbsoluto(balance - serie[serie.length - 1].balance);
      if (variacion > saltoMaximo) {
        saltoMaximo = variacion;
      }
    }

    serie.push({
      semanaDesde: ETIQUETAS_SEMANA[semana],
      retiros: fila.retiros,
      arribos: fila.arribos,
      balance: balance
    });
  }

  var semanasSentidoMasFrecuente = semanasEntrada > semanasSalida ? semanasEntrada : semanasSalida;
  var semanasConDesequilibrio = semanasEntrada + semanasSalida;
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
    semanas: ETIQUETAS_SEMANA.length,
    semanasEntrada: semanasEntrada,
    semanasSalida: semanasSalida,
    semanasNeutras: semanasNeutras,
    semanasConMovimientos: semanasConMovimientos,
    semanasConDesequilibrio: semanasConDesequilibrio,
    direccionPredominante: direccionPredominante,
    consistenciaDireccion: semanasConDesequilibrio === 0 ? 0 : redondear(semanasSentidoMasFrecuente / semanasConDesequilibrio, 3),
    recurrenciaDireccional: redondear(semanasSentidoMasFrecuente / ETIQUETAS_SEMANA.length, 3),
    balancePromedio: redondear(sumaBalance / ETIQUETAS_SEMANA.length, 3),
    magnitudPromedio: redondear(sumaMagnitud / ETIQUETAS_SEMANA.length, 3),
    balanceMinimo: balanceMinimo,
    balanceMaximo: balanceMaximo,
    rangoBalance: balanceMaximo - balanceMinimo,
    saltoMaximoConsecutivo: saltoMaximo
  });
}

var recurrentes = resultados.filter(function (fila) {
  return fila.semanasConDesequilibrio > 0;
}).sort(function (a, b) {
  if (b.recurrenciaDireccional !== a.recurrenciaDireccional) {
    return b.recurrenciaDireccional - a.recurrenciaDireccional;
  }
  if (b.consistenciaDireccion !== a.consistenciaDireccion) {
    return b.consistenciaDireccion - a.consistenciaDireccion;
  }
  if (b.magnitudPromedio !== a.magnitudPromedio) {
    return b.magnitudPromedio - a.magnitudPromedio;
  }
  return compararTexto(a.estacionId, b.estacionId);
});

var recurrentesEntrada = recurrentes.filter(function (fila) {
  return fila.direccionPredominante === "entrada";
}).slice(0, 5);

var recurrentesSalida = recurrentes.filter(function (fila) {
  return fila.direccionPredominante === "salida";
}).slice(0, 5);

var variables = resultados.filter(function (fila) {
  return fila.semanasEntrada > 0 && fila.semanasSalida > 0;
}).sort(function (a, b) {
  if (b.semanasConDesequilibrio !== a.semanasConDesequilibrio) {
    return b.semanasConDesequilibrio - a.semanasConDesequilibrio;
  }
  if (a.consistenciaDireccion !== b.consistenciaDireccion) {
    return a.consistenciaDireccion - b.consistenciaDireccion;
  }
  if (b.saltoMaximoConsecutivo !== a.saltoMaximoConsecutivo) {
    return b.saltoMaximoConsecutivo - a.saltoMaximoConsecutivo;
  }
  if (b.magnitudPromedio !== a.magnitudPromedio) {
    return b.magnitudPromedio - a.magnitudPromedio;
  }
  return compararTexto(a.estacionId, b.estacionId);
});

function resumirConsistencia(fila) {
  return {
    estacionId: fila.estacionId,
    alcaldia: fila.alcaldia,
    colonia: fila.colonia,
    semanasEntrada: fila.semanasEntrada,
    semanasSalida: fila.semanasSalida,
    semanasNeutras: fila.semanasNeutras,
    direccionPredominante: fila.direccionPredominante,
    recurrenciaDireccional: fila.recurrenciaDireccional,
    consistenciaDireccion: fila.consistenciaDireccion,
    balancePromedio: fila.balancePromedio,
    saltoMaximoConsecutivo: fila.saltoMaximoConsecutivo
  };
}

for (i = 0; i < resultados.length; i += 1) {
  if (
    resultados[i].semanas !== 12 ||
    resultados[i].semanasEntrada + resultados[i].semanasSalida + resultados[i].semanasNeutras !== 12 ||
    resultados[i].semanasConMovimientos < 0 ||
    resultados[i].semanasConMovimientos > 12 ||
    resultados[i].rangoBalance < 0 ||
    resultados[i].saltoMaximoConsecutivo < 0
  ) {
    throw new Error("Una serie semanal no cumple los controles de consistencia.");
  }
}

if (
  resultados.length !== ESTACIONES_ESPERADAS ||
  totalRetiros !== 4505019 ||
  totalArribos !== 4504990 ||
  clavesConsumidas !== Object.keys(semanasPorClave).length
) {
  throw new Error("El resumen semanal no coincide con los conteos auditados de los CSV.");
}

print("\nControl del intervalo:");
printjson({
  zonaHoraria: ZONA_HORARIA,
  inicioIncluido: INICIO_SEMANAS,
  finExcluido: FIN_SEMANAS,
  semanasCompletas: ETIQUETAS_SEMANA.length,
  retirosCatalogadosEnElIntervalo: totalRetiros,
  arribosCatalogadosEnElIntervalo: totalArribos,
  balanceDeExtremosObservados: totalArribos - totalRetiros
});
print("\nCinco estaciones con patrón de entrada más recurrente:");
printjson(recurrentesEntrada.map(resumirConsistencia));
print("\nCinco estaciones con patrón de salida más recurrente:");
printjson(recurrentesSalida.map(resumirConsistencia));
print("\nCinco estaciones con mayor evidencia de cambio de dirección:");
printjson(variables.slice(0, 5).map(resumirConsistencia));
print("\nLectura ejecutiva: la recurrencia es la mayor proporción alcanzada por entrada o salida respecto de las doce semanas.");
print("La consistencia usa sólo semanas no neutras; un empate de seis semanas de entrada y seis de salida se clasifica como mixto y obtiene 0.5 en ambos indicadores.");
print("El salto máximo consecutivo es el mayor cambio entre dos semanas adyacentes y no representa por sí solo toda la variabilidad.");
print("Estos indicadores describen extremos observados en los viajes cargados y no inventarios de bicicletas.");
