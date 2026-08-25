#!/usr/bin/env bash
set -eu

ROOT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")/../../.." && pwd)
# shellcheck disable=SC1091
. "$ROOT_DIR/setup/lib/mongodb_local.sh"

mongodb_iniciar

echo "1/3 Calculando el balance de la cohorte por estación..."
mongodb_ejecutar_archivo \
  "$ROOT_DIR/proyecto_final/ecobici/consultas/01_balance_cohorte.js"

echo "2/3 Identificando patrones por día y hora local..."
mongodb_ejecutar_archivo \
  "$ROOT_DIR/proyecto_final/ecobici/consultas/02_patrones_horarios.js"

echo "3/3 Comparando la consistencia entre semanas completas..."
mongodb_ejecutar_archivo \
  "$ROOT_DIR/proyecto_final/ecobici/consultas/03_consistencia_semanal.js"

echo "Consultas ECOBICI completas y verificadas."
