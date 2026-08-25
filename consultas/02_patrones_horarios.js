var base = db.getSiblingDB("m6_nosql");
var viajes = base.ecobici_viajes;
var estaciones = base.ecobici_estaciones;

var VIAJES_ESPERADOS = 4707285;
var ESTACIONES_ESPERADAS = 677;
var ZONA_HORARIA = "America/Mexico_City";
var INICIO_TRIMESTRE = new Date("2026-01-01T06:00:00Z");
var FIN_TRIMESTRE = new Date("2026-04-01T06:00:00Z");

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

print("=== Consulta 2: patrones por día y hora local ===");
print("Se usan los momentos reales de cada extremo dentro de [2026-01-01, 2026-04-01) en America/Mexico_City.");

var retirosAgrupados = viajes.aggregate([
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
    $group: {
      _id: {
        estacionId: "$retiro.estacionId",
        diaSemana: {
          $dateToString: {
            format: "%w",
            date: "$retiro.ocurrioEn",
            timezone: ZONA_HORARIA
          }
        },
        hora: {
          $dateToString: {
            format: "%H",
            date: "$retiro.ocurrioEn",
            timezone: ZONA_HORARIA
          }
        }
      },
      retiros: { $sum: 1 }
    }
  }
]).toArray();

var arribosAgrupados = viajes.aggregate([
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
    $group: {
      _id: {
        estacionId: "$arribo.estacionId",
        diaSemana: {
          $dateToString: {
            format: "%w",
            date: "$arribo.ocurrioEn",
            timezone: ZONA_HORARIA
          }
        },
        hora: {
          $dateToString: {
            format: "%H",
            date: "$arribo.ocurrioEn",
            timezone: ZONA_HORARIA
          }
        }
      },
      arribos: { $sum: 1 }
    }
  }
]).toArray();

var filasPorClave = {};
var i;

for (i = 0; i < retirosAgrupados.length; i += 1) {
  obtenerFila(
    filasPorClave,
    retirosAgrupados[i]._id.estacionId,
    retirosAgrupados[i]._id.diaSemana,
    retirosAgrupados[i]._id.hora
  ).retiros = retirosAgrupados[i].retiros;
}

for (i = 0; i < arribosAgrupados.length; i += 1) {
  obtenerFila(
    filasPorClave,
    arribosAgrupados[i]._id.estacionId,
    arribosAgrupados[i]._id.diaSemana,
    arribosAgrupados[i]._id.hora
  ).arribos = arribosAgrupados[i].arribos;
}

var documentosEstacion = estaciones.find(
  {},
  { _id: 1, colonia: 1, alcaldia: 1 }
).sort({ _id: 1 }).toArray();
var catalogo = {};

for (i = 0; i < documentosEstacion.length; i += 1) {
  catalogo[documentosEstacion[i]._id] = documentosEstacion[i];
}

var patronesEstacion = [];
var resumenPorTipoHora = {};
var totalRetiros = 0;
var totalArribos = 0;

Object.keys(filasPorClave).forEach(function (clave) {
  var fila = filasPorClave[clave];
  var numeroDia = parseInt(fila.diaSemana, 10);
  var numeroHora = parseInt(fila.hora, 10);
  var tipoDia = numeroDia === 1 || numeroDia === 7 ? "fin_semana" : "laborable";
  var diasDeEseTipo = tipoDia === "laborable" ? 64 : 26;
  var balance = fila.arribos - fila.retiros;
  var movimientos = fila.retiros + fila.arribos;
  var divisorDia = CANTIDAD_DIAS[fila.diaSemana];
  var claveResumen = tipoDia + "|" + fila.hora;

  if (!catalogo[fila.estacionId]) {
    throw new Error("La consulta horaria produjo una estación marcada como catalogada que no existe en el catálogo.");
  }

  if (numeroDia < 1 || numeroDia > 7 || numeroHora < 0 || numeroHora > 23) {
    throw new Error("$dateToString produjo una clave de día u hora fuera del dominio esperado.");
  }

  totalRetiros += fila.retiros;
  totalArribos += fila.arribos;

  patronesEstacion.push({
    estacionId: fila.estacionId,
    alcaldia: catalogo[fila.estacionId].alcaldia,
    colonia: catalogo[fila.estacionId].colonia,
    dia: NOMBRES_DIA[fila.diaSemana],
    horaLocal: fila.hora + ":00",
    retirosPromedio: redondear(fila.retiros / divisorDia, 3),
    arribosPromedio: redondear(fila.arribos / divisorDia, 3),
    balancePromedio: redondear(balance / divisorDia, 3),
    magnitudBalanceMedioDireccional: redondear(valorAbsoluto(balance) / divisorDia, 3),
    movimientosPromedio: redondear(movimientos / divisorDia, 3)
  });

  if (!resumenPorTipoHora[claveResumen]) {
    resumenPorTipoHora[claveResumen] = {
      tipoDia: tipoDia,
      horaLocal: fila.hora + ":00",
      dias: diasDeEseTipo,
      retiros: 0,
      arribos: 0,
      magnitudBalanceDireccional: 0
    };
  }

  resumenPorTipoHora[claveResumen].retiros += fila.retiros;
  resumenPorTipoHora[claveResumen].arribos += fila.arribos;
  resumenPorTipoHora[claveResumen].magnitudBalanceDireccional += valorAbsoluto(balance);
});

patronesEstacion.sort(function (a, b) {
  if (b.magnitudBalanceMedioDireccional !== a.magnitudBalanceMedioDireccional) {
    return b.magnitudBalanceMedioDireccional - a.magnitudBalanceMedioDireccional;
  }
  if (b.movimientosPromedio !== a.movimientosPromedio) {
    return b.movimientosPromedio - a.movimientosPromedio;
  }
  if (a.estacionId !== b.estacionId) {
    return compararTexto(a.estacionId, b.estacionId);
  }
  if (a.dia !== b.dia) {
    return compararTexto(a.dia, b.dia);
  }
  return compararTexto(a.horaLocal, b.horaLocal);
});

var resumenHorario = [];
Object.keys(resumenPorTipoHora).forEach(function (clave) {
  var fila = resumenPorTipoHora[clave];
  resumenHorario.push({
    tipoDia: fila.tipoDia,
    horaLocal: fila.horaLocal,
    dias: fila.dias,
    retirosPromedioPorDia: redondear(fila.retiros / fila.dias, 3),
    arribosPromedioPorDia: redondear(fila.arribos / fila.dias, 3),
    balancePromedioPorDia: redondear((fila.arribos - fila.retiros) / fila.dias, 3),
    magnitudBalanceMedioDireccionalPorDia: redondear(fila.magnitudBalanceDireccional / fila.dias, 3),
    movimientosPromedioPorDia: redondear((fila.retiros + fila.arribos) / fila.dias, 3)
  });
});

resumenHorario.sort(function (a, b) {
  if (a.tipoDia !== b.tipoDia) {
    return compararTexto(a.tipoDia, b.tipoDia);
  }
  return compararTexto(a.horaLocal, b.horaLocal);
});

var horasLaborablesMayorActividad = resumenHorario.filter(function (fila) {
  return fila.tipoDia === "laborable";
}).sort(function (a, b) {
  if (b.movimientosPromedioPorDia !== a.movimientosPromedioPorDia) {
    return b.movimientosPromedioPorDia - a.movimientosPromedioPorDia;
  }
  return compararTexto(a.horaLocal, b.horaLocal);
}).slice(0, 5);

var horasLaborablesMenorActividad = resumenHorario.filter(function (fila) {
  return fila.tipoDia === "laborable";
}).sort(function (a, b) {
  if (a.movimientosPromedioPorDia !== b.movimientosPromedioPorDia) {
    return a.movimientosPromedioPorDia - b.movimientosPromedioPorDia;
  }
  return compararTexto(a.horaLocal, b.horaLocal);
}).slice(0, 5);

var horasFinSemanaMayorActividad = resumenHorario.filter(function (fila) {
  return fila.tipoDia === "fin_semana";
}).sort(function (a, b) {
  if (b.movimientosPromedioPorDia !== a.movimientosPromedioPorDia) {
    return b.movimientosPromedioPorDia - a.movimientosPromedioPorDia;
  }
  return compararTexto(a.horaLocal, b.horaLocal);
}).slice(0, 5);

var horasFinSemanaMenorActividad = resumenHorario.filter(function (fila) {
  return fila.tipoDia === "fin_semana";
}).sort(function (a, b) {
  if (a.movimientosPromedioPorDia !== b.movimientosPromedioPorDia) {
    return a.movimientosPromedioPorDia - b.movimientosPromedioPorDia;
  }
  return compararTexto(a.horaLocal, b.horaLocal);
}).slice(0, 5);

if (
  totalRetiros !== 4707132 ||
  totalArribos !== 4707207 ||
  patronesEstacion.length === 0 ||
  resumenHorario.length !== 48
) {
  throw new Error("El resumen horario no coincide con los conteos auditados de los CSV.");
}

print("\nControl del intervalo:");
printjson({
  zonaHoraria: ZONA_HORARIA,
  inicioIncluido: INICIO_TRIMESTRE,
  finExcluido: FIN_TRIMESTRE,
  retirosCatalogadosEnElIntervalo: totalRetiros,
  arribosCatalogadosEnElIntervalo: totalArribos,
  balanceDeExtremosObservados: totalArribos - totalRetiros
});
print("\nQuince patrones estación-día-hora con mayor magnitud de balance medio direccional:");
printjson(patronesEstacion.slice(0, 15));
print("\nCinco horas laborables con mayor actividad observada:");
printjson(horasLaborablesMayorActividad);
print("\nCinco horas laborables con menor actividad observada:");
printjson(horasLaborablesMenorActividad);
print("\nCinco horas de fin de semana con mayor actividad observada:");
printjson(horasFinSemanaMayorActividad);
print("\nCinco horas de fin de semana con menor actividad observada:");
printjson(horasFinSemanaMenorActividad);
print("\nResumen completo por tipo de día y hora:");
printjson(resumenHorario);
print("\nInterpretación: las cinco horas de mayor actividad constituyen el pico observado y las cinco de menor actividad forman su contraste; ambas se derivan de los datos.");
print("La magnitud del balance medio direccional es el valor absoluto del balance acumulado dividido entre los días comparables; los cambios de signo se cancelan y por eso no equivale al promedio de magnitudes diarias.");
print("El balance del intervalo puede diferir de cero porque los archivos se seleccionan por mes de arribo y no forman un registro completo de todos los eventos del trimestre.");
