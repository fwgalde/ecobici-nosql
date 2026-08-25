var base = db.getSiblingDB("m6_nosql");
var viajes = base.ecobici_viajes;
var estaciones = base.ecobici_estaciones;

var VIAJES_ESPERADOS = 4707285;
var ESTACIONES_ESPERADAS = 677;

function valorAbsoluto(valor) {
  return valor < 0 ? -valor : valor;
}

function obtenerResumen(mapa, estacionId) {
  if (!mapa[estacionId]) {
    mapa[estacionId] = {
      estacionId: estacionId,
      retiros: 0,
      arribos: 0
    };
  }
  return mapa[estacionId];
}

if (
  viajes.countDocuments({}) !== VIAJES_ESPERADOS ||
  estaciones.countDocuments({}) !== ESTACIONES_ESPERADAS
) {
  throw new Error("La carga ECOBICI no coincide con los conteos esperados. Ejecuta primero cargar_datos.sh.");
}

print("=== Consulta 1: balance del conjunto de viajes por estación ===");
print("Cada viaje aporta un retiro y un arribo. Balance = arribos - retiros.");

var pipelineRetiros = [
  {
    $group: {
      _id: "$retiro.estacionId",
      retiros: { $sum: 1 }
    }
  },
  {
    $project: {
      _id: 0,
      estacionId: "$_id",
      retiros: 1
    }
  },
  { $sort: { estacionId: 1 } }
];

var pipelineArribos = [
  {
    $group: {
      _id: "$arribo.estacionId",
      arribos: { $sum: 1 }
    }
  },
  {
    $project: {
      _id: 0,
      estacionId: "$_id",
      arribos: 1
    }
  },
  { $sort: { estacionId: 1 } }
];

var retirosPorEstacion = viajes.aggregate(pipelineRetiros).toArray();
var arribosPorEstacion = viajes.aggregate(pipelineArribos).toArray();

var resumenPorEstacion = {};
var i;

for (i = 0; i < retirosPorEstacion.length; i += 1) {
  obtenerResumen(resumenPorEstacion, retirosPorEstacion[i].estacionId).retiros = retirosPorEstacion[i].retiros;
}

for (i = 0; i < arribosPorEstacion.length; i += 1) {
  obtenerResumen(resumenPorEstacion, arribosPorEstacion[i].estacionId).arribos = arribosPorEstacion[i].arribos;
}

var documentosEstacion = estaciones.find(
  {},
  {
    _id: 1,
    colonia: 1,
    alcaldia: 1,
    "direccion.callePrincipal": 1,
    "direccion.calleSecundaria": 1
  }
).sort({ _id: 1 }).toArray();

var catalogo = {};
for (i = 0; i < documentosEstacion.length; i += 1) {
  catalogo[documentosEstacion[i]._id] = documentosEstacion[i];
  obtenerResumen(resumenPorEstacion, documentosEstacion[i]._id);
}

var filasCatalogadas = [];
var filasNoCatalogadas = [];
var totalRetiros = 0;
var totalArribos = 0;
var retirosCatalogados = 0;
var arribosCatalogados = 0;

Object.keys(resumenPorEstacion).forEach(function (estacionId) {
  var resumen = resumenPorEstacion[estacionId];
  var balance = resumen.arribos - resumen.retiros;
  var fila = {
    estacionId: estacionId,
    retiros: resumen.retiros,
    arribos: resumen.arribos,
    balance: balance,
    magnitud: valorAbsoluto(balance),
    movimientos: resumen.retiros + resumen.arribos
  };

  totalRetiros += resumen.retiros;
  totalArribos += resumen.arribos;

  if (catalogo[estacionId]) {
    fila.alcaldia = catalogo[estacionId].alcaldia;
    fila.colonia = catalogo[estacionId].colonia;
    fila.callePrincipal = catalogo[estacionId].direccion.callePrincipal;
    fila.calleSecundaria = catalogo[estacionId].direccion.calleSecundaria;
    retirosCatalogados += resumen.retiros;
    arribosCatalogados += resumen.arribos;
    filasCatalogadas.push(fila);
  } else {
    filasNoCatalogadas.push(fila);
  }
});

var estacionesEntrada = filasCatalogadas.filter(function (fila) {
  return fila.balance > 0;
}).sort(function (a, b) {
  if (b.balance !== a.balance) {
    return b.balance - a.balance;
  }
  if (b.movimientos !== a.movimientos) {
    return b.movimientos - a.movimientos;
  }
  if (a.estacionId < b.estacionId) {
    return -1;
  }
  if (a.estacionId > b.estacionId) {
    return 1;
  }
  return 0;
}).slice(0, 5);

var estacionesSalida = filasCatalogadas.filter(function (fila) {
  return fila.balance < 0;
}).sort(function (a, b) {
  if (a.balance !== b.balance) {
    return a.balance - b.balance;
  }
  if (b.movimientos !== a.movimientos) {
    return b.movimientos - a.movimientos;
  }
  if (a.estacionId < b.estacionId) {
    return -1;
  }
  if (a.estacionId > b.estacionId) {
    return 1;
  }
  return 0;
}).slice(0, 5);

function resumirBalance(fila) {
  return {
    estacionId: fila.estacionId,
    alcaldia: fila.alcaldia,
    colonia: fila.colonia,
    retiros: fila.retiros,
    arribos: fila.arribos,
    balance: fila.balance
  };
}

filasNoCatalogadas.sort(function (a, b) {
  if (a.estacionId < b.estacionId) {
    return -1;
  }
  if (a.estacionId > b.estacionId) {
    return 1;
  }
  return 0;
});

var control = {
  viajes: VIAJES_ESPERADOS,
  retiros: totalRetiros,
  arribos: totalArribos,
  balanceGlobal: totalArribos - totalRetiros,
  extremosCatalogados: retirosCatalogados + arribosCatalogados,
  retirosCatalogados: retirosCatalogados,
  arribosCatalogados: arribosCatalogados,
  balanceCatalogado: arribosCatalogados - retirosCatalogados,
  extremosNoCatalogados: totalRetiros + totalArribos - retirosCatalogados - arribosCatalogados
};

if (
  control.retiros !== VIAJES_ESPERADOS ||
  control.arribos !== VIAJES_ESPERADOS ||
  control.balanceGlobal !== 0
) {
  throw new Error("Cada viaje debe aportar exactamente un retiro y un arribo.");
}

if (
  filasNoCatalogadas.length !== 1 ||
  filasNoCatalogadas[0].estacionId !== "1000" ||
  filasNoCatalogadas[0].retiros !== 40 ||
  filasNoCatalogadas[0].arribos !== 78
) {
  throw new Error("Los extremos no catalogados no coinciden con la auditoría de la fuente.");
}

if (
  control.extremosCatalogados !== 9414452 ||
  control.balanceCatalogado !== -38 ||
  filasCatalogadas.length !== ESTACIONES_ESPERADAS
) {
  throw new Error("El resumen de estaciones catalogadas no coincide con el contrato auditado.");
}

print("\nControl del conjunto de viajes:");
printjson(control);
print("\nExtremo no catalogado conservado para control técnico:");
printjson(filasNoCatalogadas[0]);
print("\nCinco estaciones con mayor presión neta de entrada observada:");
printjson(estacionesEntrada.map(resumirBalance));
print("\nCinco estaciones con mayor presión neta de salida observada:");
printjson(estacionesSalida.map(resumirBalance));
print("\nLectura ejecutiva: valores positivos indican más arribos y valores negativos más retiros dentro del conjunto analizado.");
print("Estos balances priorizan monitoreo; no representan inventario, capacidad ni disponibilidad de bicicletas.");
