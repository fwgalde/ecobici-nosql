#!/usr/bin/env bash
set -eu

ROOT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")/../../.." && pwd)
# shellcheck disable=SC1091
. "$ROOT_DIR/setup/lib/mongodb_local.sh"

mongodb_iniciar

echo "Creando la vista minimizada y definiendo privilegios mínimos..."
mongodb_ejecutar_archivo \
  "$ROOT_DIR/proyecto_final/ecobici/seguridad/01_configurar_acceso.js"

echo "Seguridad y privacidad ECOBICI completas y verificadas."
