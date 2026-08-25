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
print("Se comparan doce intervalos semanales locales completos dentro de la cohorte observada, desde el 5 de enero hasta antes del 30 de marzo de 2026.");

var retirosPorFecha = viajes.aggregate([
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
    $group: {
      _id: {
        estacionId: "$retiro.estacionId",
        fechaLocal: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$retiro.ocurrioEn",
            timezone: ZONA_HORARIA
          }
        }
      },
      retiros: { $sum: 1 }
    }
  }
]).toArray();

var arribosPorFecha = viajes.aggregate([
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
    $group: {
      _id: {
        estacionId: "$arribo.estacionId",
        fechaLocal: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$arribo.ocurrioEn",
            timezone: ZONA_HORARIA
          }
        }
      },
      arribos: { $sum: 1 }
    }
  }
]).toArray();

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
  var semanaRetiro = indiceSemana(retirosPorFecha[i]._id.fechaLocal);
  if (semanaRetiro < 0 || semanaRetiro >= ETIQUETAS_SEMANA.length) {
    throw new Error("Un retiro quedó fuera de las doce semanas completas.");
  }
  if (!catalogo[retirosPorFecha[i]._id.estacionId]) {
    throw new Error("Un retiro marcado como catalogado no existe en ecobici_estaciones.");
  }
  obtenerSemana(
    semanasPorClave,
    retirosPorFecha[i]._id.estacionId,
    semanaRetiro
  ).retiros += retirosPorFecha[i].retiros;
}

for (i = 0; i < arribosPorFecha.length; i += 1) {
  var semanaArribo = indiceSemana(arribosPorFecha[i]._id.fechaLocal);
  if (semanaArribo < 0 || semanaArribo >= ETIQUETAS_SEMANA.length) {
    throw new Error("Un arribo quedó fuera de las doce semanas completas.");
  }
  if (!catalogo[arribosPorFecha[i]._id.estacionId]) {
    throw new Error("Un arribo marcado como catalogado no existe en ecobici_estaciones.");
  }
  obtenerSemana(
    semanasPorClave,
    arribosPorFecha[i]._id.estacionId,
    semanaArribo
  ).arribos += arribosPorFecha[i].arribos;
}

var resultados = [];
var seriesPorEstacion = {};
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

  var semanasDominantes = semanasEntrada > semanasSalida ? semanasEntrada : semanasSalida;
  var semanasConDesequilibrio = semanasEntrada + semanasSalida;
  var direccion;
  if (semanasConDesequilibrio === 0) {
    direccion = "neutral";
  } else if (semanasEntrada === semanasSalida) {
    direccion = "mixta";
  } else {
    direccion = semanasEntrada > semanasSalida ? "entrada" : "salida";
  }

  seriesPorEstacion[estacion._id] = serie;
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
    direccionDominante: direccion,
    consistenciaDireccion: semanasConDesequilibrio === 0 ? 0 : redondear(semanasDominantes / semanasConDesequilibrio, 3),
    recurrenciaDireccional: redondear(semanasDominantes / ETIQUETAS_SEMANA.length, 3),
    balancePromedio: redondear(sumaBalance / ETIQUETAS_SEMANA.length, 3),
    magnitudPromedio: redondear(sumaMagnitud / ETIQUETAS_SEMANA.length, 3),
    balanceMinimo: balanceMinimo,
    balanceMaximo: balanceMaximo,
    rangoBalance: balanceMaximo - balanceMinimo,
    saltoMaximoConsecutivo: saltoMaximo
  });
}

var estables = resultados.filter(function (fila) {
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

var seriesDestacadas = [];
estables.slice(0, 3).forEach(function (fila) {
  seriesDestacadas.push({
    estacionId: fila.estacionId,
    clasificacion: "recurrente",
    serie: seriesPorEstacion[fila.estacionId]
  });
});
variables.slice(0, 3).forEach(function (fila) {
  seriesDestacadas.push({
    estacionId: fila.estacionId,
    clasificacion: "cambio_direccion",
    serie: seriesPorEstacion[fila.estacionId]
  });
});

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
print("\nQuince estaciones con mayor recurrencia direccional, consistencia y magnitud:");
printjson(estables.slice(0, 15));
print("\nQuince estaciones que cambian de dirección, priorizadas por evidencia, menor consistencia y mayor salto consecutivo:");
printjson(variables.slice(0, 15));
print("\nSeries semanales de tres casos recurrentes y tres con cambio de dirección:");
printjson(seriesDestacadas);
print("\nInterpretación: la recurrencia es la proporción de las doce semanas que repite la dirección dominante; la consistencia compara esa dirección sólo entre semanas no neutras.");
print("Las semanas neutras no se tratan como cambios de dirección, y los casos cambiantes se priorizan por la cantidad de semanas con desequilibrio.");
print("El salto máximo consecutivo es el mayor cambio entre dos semanas adyacentes y no representa por sí solo toda la variabilidad.");
print("Estos indicadores describen extremos observados en los viajes cargados y no inventarios de bicicletas.");
