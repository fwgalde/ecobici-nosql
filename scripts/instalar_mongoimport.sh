#!/usr/bin/env bash
set -eu

ROOT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")/../../.." && pwd)
TOOLS_DIR="$ROOT_DIR/.tools/bin"
MONGOIMPORT_BIN="$TOOLS_DIR/mongoimport"
DATABASE_TOOLS_VERSION="100.17.0"

if [ -x "$MONGOIMPORT_BIN" ]; then
  if salida_existente=$("$MONGOIMPORT_BIN" --version 2>&1); then
    case "$salida_existente" in
      *"mongoimport version: $DATABASE_TOOLS_VERSION"*)
        echo "mongoimport $DATABASE_TOOLS_VERSION ya está instalado dentro del clon."
        printf '%s\n' "$salida_existente"
        exit 0
        ;;
    esac
  fi
fi

if [ ! -r /etc/os-release ]; then
  echo "ERROR: no se pudo identificar el sistema operativo." >&2
  exit 1
fi

# shellcheck disable=SC1091
. /etc/os-release

if ! command -v uname >/dev/null 2>&1; then
  echo "ERROR: la imagen de Learner Lab no incluye uname." >&2
  exit 1
fi

arquitectura=$(uname -m)
if [ "$arquitectura" != "x86_64" ]; then
  echo "ERROR: este instalador requiere arquitectura x86_64." >&2
  echo "Arquitectura detectada: $arquitectura" >&2
  exit 1
fi

plataforma=""
tools_sha256=""
case "${ID:-}:${VERSION_ID:-}" in
  ubuntu:16.04)
    plataforma="ubuntu1604"
    tools_sha256="40de1f862995912a45ec7bd158422335184d50add045f6854015bc0191eb81fd"
    ;;
  ubuntu:20.04)
    plataforma="ubuntu2004"
    tools_sha256="cac92d138114eae405e0eec2f553b94ef63014f34d566331e63dffddb52ca7fc"
    ;;
  ubuntu:22.04)
    plataforma="ubuntu2204"
    tools_sha256="f30d0b3115cc31b1f360af2341a794d890c74ceb41e5a4931d3b945efeeb628e"
    ;;
  debian:11)
    plataforma="debian11"
    tools_sha256="275d6707eb35d02a507331d91cfc0751ebcdc52988034bf887bfbff741aace5e"
    ;;
  debian:12)
    plataforma="debian12"
    tools_sha256="15b3562b13ff9aac3baa2594c705ea0ac3597f4b85c7653f17efcd36e8588678"
    ;;
  amzn:2)
    plataforma="amazon2"
    tools_sha256="a6e2f9561c5d1022cc6da49b359e4b1095c4c299647c01dc6c5850b5695a0c81"
    ;;
  amzn:2023)
    plataforma="amazon2023"
    tools_sha256="2f71e3c97aa78378bf0fed19a77664540c930abdd87d03ec07775ab5bae7a12a"
    ;;
esac

if [ -z "$plataforma" ]; then
  echo "ERROR: mongoimport no está configurado para esta imagen." >&2
  echo "Sistema detectado: ${PRETTY_NAME:-desconocido}" >&2
  exit 1
fi

for herramienta in curl tar gzip sha256sum install mktemp mkdir rm mv; do
  if ! command -v "$herramienta" >/dev/null 2>&1; then
    echo "ERROR: la imagen de Learner Lab no incluye $herramienta." >&2
    exit 1
  fi
done

mkdir -p "$TOOLS_DIR"
TMP_DIR=$(mktemp -d)
STAGED_BIN="$TOOLS_DIR/.mongoimport-${DATABASE_TOOLS_VERSION}-$$"

cleanup() {
  rm -f "$STAGED_BIN"
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT HUP INT TERM

paquete="mongodb-database-tools-${plataforma}-x86_64-${DATABASE_TOOLS_VERSION}.tgz"
url="https://fastdl.mongodb.org/tools/db/$paquete"
ruta_paquete="$TMP_DIR/${paquete%.tgz}"

echo "Descargando MongoDB Database Tools $DATABASE_TOOLS_VERSION para $plataforma..."
curl -fsSL --retry 3 --retry-delay 2 "$url" -o "$TMP_DIR/$paquete"
# Los hashes fijados se comprobaron previamente contra las firmas oficiales
# de la clave MongoDB CLI Tools Release Signing Key.
(
  cd "$TMP_DIR"
  printf '%s  %s\n' "$tools_sha256" "$paquete" | sha256sum -c -
)
tar -xzf "$TMP_DIR/$paquete" -C "$TMP_DIR"

CANDIDATO="$ruta_paquete/bin/mongoimport"
if [ ! -x "$CANDIDATO" ]; then
  echo "ERROR: el paquete descargado no contiene bin/mongoimport." >&2
  exit 1
fi

if ! salida_candidato=$("$CANDIDATO" --version 2>&1); then
  echo "ERROR: el mongoimport descargado no puede ejecutarse en esta imagen." >&2
  exit 1
fi
case "$salida_candidato" in
  *"mongoimport version: $DATABASE_TOOLS_VERSION"*) ;;
  *)
    echo "ERROR: el paquete no contiene mongoimport $DATABASE_TOOLS_VERSION." >&2
    exit 1
    ;;
esac

install -m 0755 "$CANDIDATO" "$STAGED_BIN"
if ! salida_staged=$("$STAGED_BIN" --version 2>&1); then
  echo "ERROR: no se pudo ejecutar la copia preparada de mongoimport." >&2
  exit 1
fi
case "$salida_staged" in
  *"mongoimport version: $DATABASE_TOOLS_VERSION"*) ;;
  *)
    echo "ERROR: la copia preparada no informa la versión esperada." >&2
    exit 1
    ;;
esac

mv -f "$STAGED_BIN" "$MONGOIMPORT_BIN"

if ! salida_final=$("$MONGOIMPORT_BIN" --version 2>&1); then
  echo "ERROR: mongoimport quedó instalado pero no puede ejecutarse." >&2
  exit 1
fi
case "$salida_final" in
  *"mongoimport version: $DATABASE_TOOLS_VERSION"*) ;;
  *)
    echo "ERROR: mongoimport no informa la versión esperada después de instalarse." >&2
    exit 1
    ;;
esac

echo "mongoimport quedó instalado en $MONGOIMPORT_BIN."
printf '%s\n' "$salida_final"
