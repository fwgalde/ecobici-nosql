#!/usr/bin/env bash
set -eu

ROOT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")/../../.." && pwd)
# shellcheck disable=SC1091
. "$ROOT_DIR/setup/lib/mongodb_local.sh"

mongodb_iniciar

echo "Aplicando y probando el validador de la colección principal..."
mongodb_ejecutar_archivo \
  "$ROOT_DIR/proyecto_final/ecobici/validaciones/01_validar_viajes.js"

echo "Validación JSON Schema ECOBICI completa y verificada."
