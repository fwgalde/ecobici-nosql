#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")/../../.." && pwd)
PROYECTO_DIR="$ROOT_DIR/proyecto_final/ecobici"
DATOS_DIR="$PROYECTO_DIR/datos"
RAW_DIR="${ECOBICI_RAW_DIR:-$DATOS_DIR/raw}"
MANIFEST="$DATOS_DIR/manifest.sha256"
TRANSFORMADOR="$PROYECTO_DIR/scripts/transformar_datos.py"
RESTABLECER="$PROYECTO_DIR/scripts/restablecer_colecciones.js"
VERIFICAR="$PROYECTO_DIR/scripts/verificar_carga.js"
MONGOIMPORT_BIN="$ROOT_DIR/.tools/bin/mongoimport"
DATABASE_TOOLS_VERSION="100.17.0"
CARGA_INICIADA=false

CATALOGO="$RAW_DIR/cicloestaciones_ecobici.csv"
VIAJES_ENERO="$RAW_DIR/2026-01.csv"
VIAJES_FEBRERO="$RAW_DIR/2026-02.csv"
VIAJES_MARZO="$RAW_DIR/2026-03.csv"

# shellcheck disable=SC1091
. "$ROOT_DIR/setup/lib/mongodb_local.sh"

limpiar_carga_fallida() {
  codigo=$1
  trap - ERR INT TERM
  if [ "$CARGA_INICIADA" = true ]; then
    echo "ERROR: la carga no concluyó; se intentará eliminar la carga parcial de ECOBICI." >&2
    set +e
    if ! mongodb_ejecutar_archivo "$RESTABLECER" >/dev/null 2>&1; then
      echo "ADVERTENCIA: no fue posible eliminar las colecciones parciales; vuelve a ejecutar el cargador para restablecerlas." >&2
    fi
  fi
  exit "$codigo"
}
trap 'limpiar_carga_fallida "$?"' ERR
trap 'limpiar_carga_fallida 130' INT
trap 'limpiar_carga_fallida 143' TERM

echo "1/6 Comprobando herramientas y archivos de entrada..."

for herramienta in python3 sha256sum df; do
  if ! command -v "$herramienta" >/dev/null 2>&1; then
    echo "ERROR: la imagen de Learner Lab no incluye $herramienta." >&2
    exit 1
  fi
done

if ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 5) else 1)'; then
  echo "ERROR: se requiere Python 3.5 o posterior." >&2
  exit 1
fi

if [ ! -x "$MONGOIMPORT_BIN" ]; then
  echo "ERROR: mongoimport no está instalado en $MONGOIMPORT_BIN." >&2
  echo "Ejecuta: bash proyecto_final/ecobici/scripts/instalar_mongoimport.sh" >&2
  exit 1
fi

if ! salida_mongoimport=$("$MONGOIMPORT_BIN" --version 2>&1); then
  echo "ERROR: mongoimport existe, pero no puede ejecutarse en esta imagen." >&2
  exit 1
fi
case "$salida_mongoimport" in
  *"mongoimport version: $DATABASE_TOOLS_VERSION"*) ;;
  *)
    echo "ERROR: se requiere mongoimport $DATABASE_TOOLS_VERSION." >&2
    echo "Ejecuta: bash proyecto_final/ecobici/scripts/instalar_mongoimport.sh" >&2
    exit 1
    ;;
esac

for archivo in "$CATALOGO" "$VIAJES_ENERO" "$VIAJES_FEBRERO" "$VIAJES_MARZO"; do
  if [ ! -f "$archivo" ]; then
    echo "ERROR: falta el archivo $archivo" >&2
    echo "Coloca los cuatro CSV en $RAW_DIR o define ECOBICI_RAW_DIR." >&2
    exit 1
  fi
done

echo "Espacio disponible en el sistema de archivos del proyecto:"
df -h "$ROOT_DIR"

echo "2/6 Verificando la integridad SHA-256 de los cuatro CSV..."
(
  cd "$RAW_DIR"
  sha256sum -c "$MANIFEST"
)

echo "3/6 Iniciando MongoDB y restableciendo sólo las colecciones ECOBICI..."
mongodb_iniciar
CARGA_INICIADA=true
mongodb_ejecutar_archivo "$RESTABLECER"

echo "4/6 Transformando e importando 677 cicloestaciones..."
PYTHONIOENCODING=UTF-8 python3 "$TRANSFORMADOR" estaciones "$CATALOGO" | \
  "$MONGOIMPORT_BIN" \
    --uri="$(mongodb_database_url)" \
    --collection=ecobici_estaciones \
    --type=json \
    --stopOnError \
    --numInsertionWorkers=2

echo "5/6 Transformando e importando 4 707 285 viajes por streaming..."
PYTHONIOENCODING=UTF-8 python3 "$TRANSFORMADOR" viajes \
  --catalogo "$CATALOGO" \
  "$VIAJES_ENERO" \
  "$VIAJES_FEBRERO" \
  "$VIAJES_MARZO" | \
  "$MONGOIMPORT_BIN" \
    --uri="$(mongodb_database_url)" \
    --collection=ecobici_viajes \
    --type=json \
    --stopOnError \
    --numInsertionWorkers=2

echo "6/6 Verificando conteos, tipos, trazabilidad y reglas de transformación..."
mongodb_ejecutar_archivo "$VERIFICAR"

CARGA_INICIADA=false
echo "Carga ECOBICI completa y verificada en la base m6_nosql."
