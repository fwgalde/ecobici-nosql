var base = db.getSiblingDB("m6_nosql");
var viajes = base.ecobici_viajes;
var estaciones = base.ecobici_estaciones;

var VIAJES_ESPERADOS = 4707285;
var ESTACIONES_ESPERADAS = 677;
var ZONA_HORARIA = "America/Mexico_City";
var INICIO_TRIMESTRE = new Date("2026-01-01T06:00:00Z");
var FIN_TRIMESTRE = new Date("2026-04-01T06:00:00Z");
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

function obtenerFila(mapa, estacionId, diaSemana, hora) {
  var clave = estacionId + "|" + diaSemana + "|" + hora;
  if (!mapa[clave]) {
    mapa[clave] = {
      estacionId: estacionId,
      diaSemana: diaSemana,
      hora: hora,
      retiros: 0,
      arribos: 0
    };
  }
  return mapa[clave];
}

function seleccionarEstacionesDistintas(filas, cantidad) {
  var seleccionadas = [];
  var incluidas = {};
  var i;
  for (i = 0; i < filas.length && seleccionadas.length < cantidad; i += 1) {
    if (!incluidas[filas[i].estacionId]) {
      incluidas[filas[i].estacionId] = true;
      seleccionadas.push(filas[i]);
    }
  }
  return seleccionadas;
}

if (
  viajes.countDocuments({}) !== VIAJES_ESPERADOS ||
  estaciones.countDocuments({}) !== ESTACIONES_ESPERADAS
) {
  throw new Error("La carga ECOBICI no coincide con los conteos esperados. Ejecuta primero cargar_datos.sh.");
}

print("=== Consulta 4: concentración geográfica de patrones horarios ===");
print("Se comparan estaciones críticas con sus tres vecinas más próximas dentro de 1 km y en la misma combinación de día y hora.");

var pipelineRetiros = [
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

var pipelineArribos = [
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

var retirosAgrupados = viajes.aggregate(pipelineRetiros).toArray();
var arribosAgrupados = viajes.aggregate(pipelineArribos).toArray();
var filasPorClave = {};
var totalRetiros = 0;
var totalArribos = 0;
var i;

for (i = 0; i < retirosAgrupados.length; i += 1) {
  obtenerFila(
    filasPorClave,
    retirosAgrupados[i].estacionId,
    retirosAgrupados[i].diaSemana,
    retirosAgrupados[i].hora
  ).retiros = retirosAgrupados[i].retiros;
  totalRetiros += retirosAgrupados[i].retiros;
}

for (i = 0; i < arribosAgrupados.length; i += 1) {
  obtenerFila(
    filasPorClave,
    arribosAgrupados[i].estacionId,
    arribosAgrupados[i].diaSemana,
    arribosAgrupados[i].hora
  ).arribos = arribosAgrupados[i].arribos;
  totalArribos += arribosAgrupados[i].arribos;
}

var documentosEstacion = estaciones.find(
  {},
  { _id: 1, colonia: 1, alcaldia: 1, ubicacion: 1 }
).sort({ _id: 1 }).toArray();
var catalogo = {};

for (i = 0; i < documentosEstacion.length; i += 1) {
  catalogo[documentosEstacion[i]._id] = documentosEstacion[i];
}

var patronesEntrada = [];
var patronesSalida = [];

Object.keys(filasPorClave).forEach(function (clave) {
  var fila = filasPorClave[clave];
  var balance = fila.arribos - fila.retiros;
  var divisorDia = CANTIDAD_DIAS[fila.diaSemana];
  var patron;

  if (!catalogo[fila.estacionId] || !divisorDia) {
    throw new Error("El patrón geográfico contiene una estación o un día fuera del catálogo esperado.");
  }

  patron = {
    estacionId: fila.estacionId,
    diaSemana: fila.diaSemana,
    dia: NOMBRES_DIA[fila.diaSemana],
    hora: fila.hora,
    horaLocal: fila.hora + ":00",
    balancePromedio: redondear(balance / divisorDia, 3),
    magnitudBalancePromedio: redondear(valorAbsoluto(balance) / divisorDia, 3),
    movimientosPromedio: redondear((fila.retiros + fila.arribos) / divisorDia, 3)
  };

  if (balance > 0) {
    patronesEntrada.push(patron);
  } else if (balance < 0) {
    patronesSalida.push(patron);
  }
});

function ordenarPatrones(a, b) {
  if (b.magnitudBalancePromedio !== a.magnitudBalancePromedio) {
    return b.magnitudBalancePromedio - a.magnitudBalancePromedio;
  }
  if (b.movimientosPromedio !== a.movimientosPromedio) {
    return b.movimientosPromedio - a.movimientosPromedio;
  }
  if (a.estacionId !== b.estacionId) {
    return compararTexto(a.estacionId, b.estacionId);
  }
  if (a.diaSemana !== b.diaSemana) {
    return compararTexto(a.diaSemana, b.diaSemana);
  }
  return compararTexto(a.hora, b.hora);
}

patronesEntrada.sort(ordenarPatrones);
patronesSalida.sort(ordenarPatrones);

var anclasEntrada = seleccionarEstacionesDistintas(patronesEntrada, 5);
var anclasSalida = seleccionarEstacionesDistintas(patronesSalida, 5);

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
  throw new Error("No se pudo confirmar el índice geoespacial requerido por $geoNear.");
}

function construirEntorno(ancla, direccion) {
  var estacionAncla = catalogo[ancla.estacionId];
  var cercanas = estaciones.aggregate([
    {
      $geoNear: {
        near: estacionAncla.ubicacion,
        key: "ubicacion",
        distanceField: "distanciaMetros",
        maxDistance: DISTANCIA_MAXIMA_METROS,
        spherical: true,
        query: { _id: { $ne: ancla.estacionId } }
      }
    },
    {
      $project: {
        _id: 1,
        alcaldia: 1,
        colonia: 1,
        distanciaMetros: { $round: ["$distanciaMetros", 0] }
      }
    }
  ]).toArray().slice(0, VECINOS_MAXIMOS);
  var vecinosMismoSentido = [];
  var balanceConjunto = ancla.balancePromedio;

  cercanas.forEach(function (vecina) {
    var clave = vecina._id + "|" + ancla.diaSemana + "|" + ancla.hora;
    var fila = filasPorClave[clave] || { retiros: 0, arribos: 0 };
    var balance = redondear((fila.arribos - fila.retiros) / CANTIDAD_DIAS[ancla.diaSemana], 3);
    var mismoSentido = direccion === "entrada" ? balance > 0 : balance < 0;

    if (mismoSentido) {
      vecinosMismoSentido.push({
        estacionId: vecina._id,
        distanciaMetros: vecina.distanciaMetros,
        balancePromedio: balance
      });
      balanceConjunto += balance;
    }
  });

  return {
    estacionAncla: ancla.estacionId,
    alcaldia: estacionAncla.alcaldia,
    colonia: estacionAncla.colonia,
    direccion: direccion,
    dia: ancla.dia,
    horaLocal: ancla.horaLocal,
    balancePromedioAncla: ancla.balancePromedio,
    vecinosEvaluados: cercanas.length,
    vecinosMismoSentido: vecinosMismoSentido,
    balancePromedioConjunto: redondear(balanceConjunto, 3)
  };
}

var entornosEntrada = anclasEntrada.map(function (ancla) {
  return construirEntorno(ancla, "entrada");
});
var entornosSalida = anclasSalida.map(function (ancla) {
  return construirEntorno(ancla, "salida");
});

function ordenarEntornos(a, b) {
  if (b.vecinosMismoSentido.length !== a.vecinosMismoSentido.length) {
    return b.vecinosMismoSentido.length - a.vecinosMismoSentido.length;
  }
  if (valorAbsoluto(b.balancePromedioConjunto) !== valorAbsoluto(a.balancePromedioConjunto)) {
    return valorAbsoluto(b.balancePromedioConjunto) - valorAbsoluto(a.balancePromedioConjunto);
  }
  return compararTexto(a.estacionAncla, b.estacionAncla);
}

entornosEntrada.sort(ordenarEntornos);
entornosSalida.sort(ordenarEntornos);

entornosEntrada.concat(entornosSalida).forEach(function (entorno) {
  if (
    entorno.vecinosEvaluados < entorno.vecinosMismoSentido.length ||
    entorno.vecinosEvaluados > VECINOS_MAXIMOS
  ) {
    throw new Error("Un entorno geográfico no cumple el límite de vecinas evaluadas.");
  }
  entorno.vecinosMismoSentido.forEach(function (vecina) {
    if (
      vecina.estacionId === entorno.estacionAncla ||
      vecina.distanciaMetros < 0 ||
      vecina.distanciaMetros > DISTANCIA_MAXIMA_METROS
    ) {
      throw new Error("Un entorno geográfico contiene una vecina inválida.");
    }
  });
});

if (
  totalRetiros !== 4707132 ||
  totalArribos !== 4707207 ||
  documentosEstacion.length !== ESTACIONES_ESPERADAS ||
  anclasEntrada.length !== 5 ||
  anclasSalida.length !== 5 ||
  entornosEntrada.length !== 5 ||
  entornosSalida.length !== 5
) {
  throw new Error("La concentración geográfica no coincide con los controles temporales esperados.");
}

print("\nControl geoespacial:");
printjson({
  zonaHoraria: ZONA_HORARIA,
  distanciaMaximaMetros: DISTANCIA_MAXIMA_METROS,
  vecinosMaximos: VECINOS_MAXIMOS,
  estacionesCatalogadas: documentosEstacion.length,
  retirosCatalogadosEnElIntervalo: totalRetiros,
  arribosCatalogadosEnElIntervalo: totalArribos,
  indice: indiceGeografico
});
print("\nTres entornos con presión de entrada coincidente:");
printjson(entornosEntrada.slice(0, 3));
print("\nTres entornos con presión de salida coincidente:");
printjson(entornosSalida.slice(0, 3));
print("\nLectura ejecutiva: un entorno gana prioridad cuando varias de las tres estaciones cercanas comparten el sentido del balance en el mismo día y hora.");
print("La coincidencia describe patrones agregados del trimestre; no demuestra inventario simultáneo ni disponibilidad en tiempo real.");
