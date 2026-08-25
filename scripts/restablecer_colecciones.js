// Ejecutar sólo desde cargar_datos.sh en la terminal integrada de Learner Lab.
// El script restablece exclusivamente las dos colecciones del proyecto ECOBICI.

var base = db.getSiblingDB("m6_nosql");

base.ecobici_viajes.drop();
base.ecobici_estaciones.drop();

print("Colecciones ECOBICI restablecidas: ecobici_viajes y ecobici_estaciones.");
