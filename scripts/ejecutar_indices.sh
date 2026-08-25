#!/usr/bin/env bash
set -eu

ROOT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")/../../.." && pwd)
# shellcheck disable=SC1091
. "$ROOT_DIR/setup/lib/mongodb_local.sh"

mongodb_iniciar

echo "Comparando planes antes y después de crear dos índices secundarios..."
mongodb_ejecutar_archivo \
  "$ROOT_DIR/proyecto_final/ecobici/indices/01_comparar_planes.js"

echo "Medición e índices ECOBICI completos y verificados."
