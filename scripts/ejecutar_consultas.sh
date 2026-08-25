#!/usr/bin/env bash
set -eu

ROOT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")/../../.." && pwd)
# shellcheck disable=SC1091
. "$ROOT_DIR/setup/lib/mongodb_local.sh"

mongodb_iniciar

echo "1/5 Calculando el balance del conjunto de viajes por estación..."
mongodb_ejecutar_archivo \
  "$ROOT_DIR/proyecto_final/ecobici/consultas/01_balance_viajes.js"

echo "2/5 Comparando patrones por día y hora local..."
mongodb_ejecutar_archivo \
  "$ROOT_DIR/proyecto_final/ecobici/consultas/02_patrones_horarios.js"

echo "3/5 Comparando la consistencia entre semanas completas..."
mongodb_ejecutar_archivo \
  "$ROOT_DIR/proyecto_final/ecobici/consultas/03_consistencia_semanal.js"

echo "4/5 Identificando concentraciones geográficas de patrones horarios..."
mongodb_ejecutar_archivo \
  "$ROOT_DIR/proyecto_final/ecobici/consultas/04_concentracion_geografica.js"

echo "5/5 Integrando la priorización ejecutiva del monitoreo..."
mongodb_ejecutar_archivo \
  "$ROOT_DIR/proyecto_final/ecobici/consultas/05_priorizacion_monitoreo.js"

echo "Consultas ECOBICI completas y verificadas."
