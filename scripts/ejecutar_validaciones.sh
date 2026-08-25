#!/usr/bin/env bash
set -eu

ROOT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")/../../.." && pwd)
# shellcheck disable=SC1091
. "$ROOT_DIR/setup/lib/mongodb_local.sh"

mongodb_iniciar

echo "1/2 Aplicando y probando el validador de la colección principal..."
mongodb_ejecutar_archivo \
  "$ROOT_DIR/proyecto_final/ecobici/validaciones/01_validar_viajes.js"

echo "2/2 Aplicando y probando el validador geoespacial..."
mongodb_ejecutar_archivo \
  "$ROOT_DIR/proyecto_final/ecobici/validaciones/02_validar_estaciones.js"

echo "Validaciones JSON Schema ECOBICI completas y verificadas."
