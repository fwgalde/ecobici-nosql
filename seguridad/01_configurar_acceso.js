var curso = db.getSiblingDB("m6_nosql");
var viajes = curso.ecobici_viajes;
var nombreVista = "ecobici_viajes_analitica";

if (
  viajes.countDocuments({}) !== 4707285 ||
  curso.ecobici_estaciones.countDocuments({}) !== 677
) {
  throw new Error("Ejecuta primero cargar_datos.sh para preparar las colecciones ECOBICI.");
}

curso[nombreVista].drop();

var pipelineVista = [
  {
    $project: {
      _id: 0,
      retiro: 1,
      arribo: 1,
      "calidad.retiroEnCatalogo": 1,
      "calidad.arriboEnCatalogo": 1
    }
  }
];

curso.createView(
  nombreVista,
  "ecobici_viajes",
  pipelineVista
);

var especificacionesRoles = [
  {
    role: "analista_ecobici",
    privileges: [
      {
        resource: { db: "m6_nosql", collection: nombreVista },
        actions: ["find"]
      }
    ],
    roles: []
  },
  {
    role: "auditor_ecobici",
    privileges: [
      {
        resource: { db: "m6_nosql", collection: "ecobici_viajes" },
        actions: ["find"]
      },
      {
        resource: { db: "m6_nosql", collection: "ecobici_estaciones" },
        actions: ["find"]
      }
    ],
    roles: []
  },
  {
    role: "administrador_ecobici",
    privileges: [
      {
        resource: { db: "m6_nosql", collection: "ecobici_viajes" },
        actions: ["listIndexes", "createIndex", "dropIndex", "collMod"]
      },
      {
        resource: { db: "m6_nosql", collection: "ecobici_estaciones" },
        actions: ["listIndexes", "createIndex", "dropIndex", "collMod"]
      }
    ],
    roles: []
  }
];

especificacionesRoles.forEach(function (especificacion) {
  if (curso.getRole(especificacion.role)) {
    curso.updateRole(especificacion.role, {
      privileges: especificacion.privileges,
      roles: especificacion.roles
    });
  } else {
    curso.createRole(especificacion);
  }
});

print("=== Seguridad y acceso mínimo de ECOBICI ===");
print("La vista conserva sólo los extremos del viaje y las dos banderas de catálogo necesarias para el análisis.");

print("\nMuestra minimizada de cinco documentos:");
var salida = curso[nombreVista].find({}).limit(5).toArray();
printjson(salida);

print("\nMatriz de responsabilidades:");
printjson([
  {
    perfil: "analisis",
    permitido: "find en ecobici_viajes_analitica",
    noConcedido: "lectura de las colecciones fuente o escritura"
  },
  {
    perfil: "auditoria",
    permitido: "find en ecobici_viajes y ecobici_estaciones",
    noConcedido: "modificar datos o administrar permisos"
  },
  {
    perfil: "administracion",
    permitido: "gestionar índices y validación de las dos colecciones fuente",
    noConcedido: "find sobre los datos"
  }
]);

print("\nRoles definidos:");
var roles = especificacionesRoles.map(function (especificacion) {
  return curso.getRole(especificacion.role, { showPrivileges: true });
});
printjson(roles.map(function (rol) {
  return {
    role: rol.role,
    privileges: rol.privileges,
    roles: rol.roles
  };
}));

var camposProhibidos = ["_id", "duracionSegundos", "fuente"];
var vistaExponeCampos = salida.some(function (documento) {
  return camposProhibidos.some(function (campo) {
    return Object.prototype.hasOwnProperty.call(documento, campo);
  });
});

if (
  salida.length !== 5 ||
  vistaExponeCampos ||
  roles.some(function (rol) { return !rol; })
) {
  throw new Error("La vista o los roles no cumplen la especificación de seguridad.");
}

print("Seguridad y acceso mínimo ECOBICI completos y verificados.");
