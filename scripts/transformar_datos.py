#!/usr/bin/env python3
"""Transforma los CSV oficiales de ECOBICI a Extended JSON por streaming."""

from __future__ import print_function

import argparse
import csv
import json
import math
import os
import re
import sys
from datetime import datetime, timedelta


ENCABEZADO_VIAJES = [
    "Genero_Usuario",
    "Edad_Usuario",
    "Bici",
    "Ciclo_Estacion_Retiro",
    "Fecha_Retiro",
    "Hora_Retiro",
    "Ciclo_EstacionArribo",
    "Fecha_Arribo",
    "Hora_Arribo",
]

ENCABEZADO_ESTACIONES = [
    "sistema",
    "num_cicloe",
    "calle_prin",
    "calle_secu",
    "colonia",
    "alcaldia",
    "latitud",
    "longitud",
    "sitio_de_e",
    "estatus",
]

REGISTROS_ESPERADOS = {
    "2026-01.csv": 1525302,
    "2026-02.csv": 1528610,
    "2026-03.csv": 1653373,
}

ARCHIVO_ESTACIONES = "cicloestaciones_ecobici.csv"
ESTACIONES_ESPERADAS = 677
FILAS_VACIAS_ESTACIONES_ESPERADAS = 312
DURACION_LARGA_SEGUNDOS = 86400
PROGRESO_CADA = 250000
FORMATO_FECHA_HORA = "%d/%m/%Y %H:%M:%S"
PATRON_ARCHIVO_VIAJES = re.compile(r"^(\d{4})-(\d{2})\.csv$")

# México eliminó el horario estacional en 2022. Todos los instantes presentes
# en los archivos auditados son posteriores y corresponden a UTC-06:00.
INICIO_PERIODO_UTC_MENOS_6 = datetime(2022, 10, 30)
AJUSTE_A_UTC = timedelta(hours=6)

FUENTE_ESTACIONES_URL = "https://datos.cdmx.gob.mx/dataset/a1d7c132-fb1b-4e8c-bb74-4bb618563eb2/resource/5fbacfcc-f677-406c-9356-6ced541240fe/download/cicloestaciones_ecobici.csv"
FUENTE_ESTACIONES_ACTUALIZACION = "2024-10-17"
FUENTE_ESTACIONES_SHA256 = "305cc954e25942f6f57528bd95d1f7f46dd9880ed564f2ff4a477aeaca7f1a9d"


class ErrorDatos(Exception):
    """Indica que un archivo no cumple el contrato auditado."""


def informar(mensaje):
    print(mensaje, file=sys.stderr)


def emitir(documento, sin_salida):
    if not sin_salida:
        sys.stdout.write(json.dumps(documento, ensure_ascii=True, separators=(",", ":")))
        sys.stdout.write("\n")


def exigir_archivo(ruta, nombre_esperado=None):
    if not os.path.isfile(ruta):
        raise ErrorDatos("no se encontró el archivo: {0}".format(ruta))
    if nombre_esperado is not None and os.path.basename(ruta) != nombre_esperado:
        raise ErrorDatos(
            "se esperaba el archivo {0}, pero se recibió {1}".format(
                nombre_esperado, os.path.basename(ruta)
            )
        )


def exigir_encabezado(encabezado, esperado, ruta):
    if encabezado != esperado:
        raise ErrorDatos(
            "el encabezado de {0} no coincide con el contrato esperado".format(ruta)
        )


def convertir_instante(fecha, hora, ruta, linea_fisica):
    try:
        instante_local = datetime.strptime(
            "{0} {1}".format(fecha, hora), FORMATO_FECHA_HORA
        )
    except ValueError:
        raise ErrorDatos(
            "fecha u hora inválida en {0}, línea {1}: {2} {3}".format(
                ruta, linea_fisica, fecha, hora
            )
        )

    if instante_local < INICIO_PERIODO_UTC_MENOS_6:
        raise ErrorDatos(
            "el instante de {0}, línea {1}, queda fuera del periodo con UTC-06:00 documentado".format(
                ruta, linea_fisica
            )
        )

    instante_utc = instante_local + AJUSTE_A_UTC
    return instante_local, instante_utc.strftime("%Y-%m-%dT%H:%M:%SZ")


def iterar_documentos_estaciones(ruta):
    exigir_archivo(ruta, ARCHIVO_ESTACIONES)
    identificadores = set()
    filas_utiles = 0
    filas_vacias = 0
    comenzo_tramo_vacio = False

    with open(ruta, "r", encoding="cp1252", newline="") as archivo:
        lector = csv.reader(archivo, strict=True)
        try:
            encabezado = next(lector)
        except StopIteration:
            raise ErrorDatos("el catálogo está vacío: {0}".format(ruta))
        exigir_encabezado(encabezado, ENCABEZADO_ESTACIONES, ruta)

        for linea_fisica, fila in enumerate(lector, 2):
            if not fila or all(not valor.strip() for valor in fila):
                filas_vacias += 1
                comenzo_tramo_vacio = True
                continue

            if comenzo_tramo_vacio:
                raise ErrorDatos(
                    "se encontró una fila útil después del tramo vacío en {0}, línea {1}".format(
                        ruta, linea_fisica
                    )
                )
            if len(fila) != len(ENCABEZADO_ESTACIONES):
                raise ErrorDatos(
                    "cantidad de columnas inválida en {0}, línea {1}".format(
                        ruta, linea_fisica
                    )
                )
            if any(not valor.strip() for valor in fila):
                raise ErrorDatos(
                    "campo vacío en {0}, línea {1}".format(ruta, linea_fisica)
                )

            valores = dict(zip(ENCABEZADO_ESTACIONES, fila))
            estacion_id = valores["num_cicloe"]
            if estacion_id in identificadores:
                raise ErrorDatos(
                    "identificador de estación duplicado en {0}, línea {1}: {2}".format(
                        ruta, linea_fisica, estacion_id
                    )
                )

            try:
                latitud = float(valores["latitud"])
                longitud = float(valores["longitud"])
            except ValueError:
                raise ErrorDatos(
                    "coordenada no numérica en {0}, línea {1}".format(
                        ruta, linea_fisica
                    )
                )

            if not math.isfinite(latitud) or not math.isfinite(longitud):
                raise ErrorDatos(
                    "coordenada no finita en {0}, línea {1}".format(
                        ruta, linea_fisica
                    )
                )
            if not -90 <= latitud <= 90 or not -180 <= longitud <= 180:
                raise ErrorDatos(
                    "coordenada fuera de rango en {0}, línea {1}".format(
                        ruta, linea_fisica
                    )
                )

            identificadores.add(estacion_id)
            filas_utiles += 1
            yield {
                "_id": estacion_id,
                "sistema": valores["sistema"],
                "direccion": {
                    "callePrincipal": valores["calle_prin"],
                    "calleSecundaria": valores["calle_secu"],
                },
                "colonia": valores["colonia"],
                "alcaldia": valores["alcaldia"],
                "sitioInstalacion": valores["sitio_de_e"],
                "estatusEnCatalogo": valores["estatus"],
                "ubicacion": {
                    "type": "Point",
                    "coordinates": [longitud, latitud],
                },
                "fuente": {
                    "archivo": ARCHIVO_ESTACIONES,
                    "url": FUENTE_ESTACIONES_URL,
                    "fechaActualizacionPublicada": FUENTE_ESTACIONES_ACTUALIZACION,
                    "sha256": FUENTE_ESTACIONES_SHA256,
                },
            }

    if filas_utiles != ESTACIONES_ESPERADAS:
        raise ErrorDatos(
            "el catálogo contiene {0} estaciones útiles; se esperaban {1}".format(
                filas_utiles, ESTACIONES_ESPERADAS
            )
        )
    if filas_vacias != FILAS_VACIAS_ESTACIONES_ESPERADAS:
        raise ErrorDatos(
            "el catálogo contiene {0} filas vacías finales; se esperaban {1}".format(
                filas_vacias, FILAS_VACIAS_ESTACIONES_ESPERADAS
            )
        )


def cargar_identificadores_catalogo(ruta):
    return set(documento["_id"] for documento in iterar_documentos_estaciones(ruta))


def transformar_fila_viaje(
    fila,
    archivo_fuente,
    anio_archivo,
    mes_archivo,
    ruta,
    linea_fisica,
    numero_registro,
    catalogo,
):
    retiro_id = fila[3]
    fecha_retiro = fila[4]
    hora_retiro = fila[5]
    arribo_id = fila[6]
    fecha_arribo = fila[7]
    hora_arribo = fila[8]
    retiro_local, retiro_utc = convertir_instante(
        fecha_retiro,
        hora_retiro,
        ruta,
        linea_fisica,
    )
    arribo_local, arribo_utc = convertir_instante(
        fecha_arribo,
        hora_arribo,
        ruta,
        linea_fisica,
    )

    duracion_segundos = int((arribo_local - retiro_local).total_seconds())
    if duracion_segundos <= 0:
        raise ErrorDatos(
            "duración no positiva en {0}, línea {1}".format(ruta, linea_fisica)
        )

    if arribo_local.year != anio_archivo or arribo_local.month != mes_archivo:
        raise ErrorDatos(
            "el arribo de {0}, línea {1}, no pertenece al mes del archivo".format(
                ruta, linea_fisica
            )
        )

    retiro_en_catalogo = retiro_id in catalogo
    arribo_en_catalogo = arribo_id in catalogo
    retiro_fuera_mes = (
        retiro_local.year != arribo_local.year
        or retiro_local.month != arribo_local.month
    )
    duracion_larga = duracion_segundos > DURACION_LARGA_SEGUNDOS

    documento = {
        "_id": "{0}:{1:07d}".format(archivo_fuente[:-4], numero_registro),
        "retiro": {
            "estacionId": retiro_id,
            "ocurrioEn": {"$date": retiro_utc},
        },
        "arribo": {
            "estacionId": arribo_id,
            "ocurrioEn": {"$date": arribo_utc},
        },
        "duracionSegundos": {"$numberInt": str(duracion_segundos)},
        "fuente": {
            "archivo": archivo_fuente,
            "filaCsv": {"$numberInt": str(linea_fisica)},
        },
        "calidad": {
            "duracionMayor24h": duracion_larga,
            "retiroFueraMesArribo": retiro_fuera_mes,
            "retiroEnCatalogo": retiro_en_catalogo,
            "arriboEnCatalogo": arribo_en_catalogo,
        },
    }

    return (
        documento,
        duracion_larga,
        retiro_fuera_mes,
        retiro_id,
        arribo_id,
        retiro_en_catalogo,
        arribo_en_catalogo,
    )


def transformar_estaciones(argumentos):
    cantidad = 0
    for documento in iterar_documentos_estaciones(argumentos.archivo):
        emitir(documento, argumentos.sin_salida)
        cantidad += 1
    informar(
        "Catálogo validado y transformado: {0} estaciones; {1} filas vacías finales omitidas.".format(
            cantidad, FILAS_VACIAS_ESTACIONES_ESPERADAS
        )
    )


def transformar_viajes(argumentos):
    exigir_archivo(argumentos.catalogo, ARCHIVO_ESTACIONES)
    catalogo = cargar_identificadores_catalogo(argumentos.catalogo)
    nombres = [os.path.basename(ruta) for ruta in argumentos.archivos]
    if len(nombres) != len(REGISTROS_ESPERADOS) or set(nombres) != set(
        REGISTROS_ESPERADOS
    ):
        raise ErrorDatos(
            "deben proporcionarse exactamente 2026-01.csv, 2026-02.csv y 2026-03.csv"
        )

    totales = {
        "viajes": 0,
        "duracionMayor24h": 0,
        "retiroFueraMesArribo": 0,
        "retiroNoCatalogado": 0,
        "arriboNoCatalogado": 0,
        "viajeNoCatalogado": 0,
    }
    identificadores_no_catalogados = set()

    for ruta in argumentos.archivos:
        exigir_archivo(ruta)
        nombre = os.path.basename(ruta)
        coincidencia = PATRON_ARCHIVO_VIAJES.match(nombre)
        if coincidencia is None:
            raise ErrorDatos("nombre de archivo mensual inválido: {0}".format(nombre))
        anio_archivo = int(coincidencia.group(1))
        mes_archivo = int(coincidencia.group(2))
        registros_archivo = 0
        with open(ruta, "r", encoding="utf-8-sig", newline="") as archivo:
            lector = csv.reader(archivo, strict=True)
            try:
                encabezado = next(lector)
            except StopIteration:
                raise ErrorDatos("el archivo está vacío: {0}".format(ruta))
            exigir_encabezado(encabezado, ENCABEZADO_VIAJES, ruta)

            for numero_registro, fila in enumerate(lector, 1):
                linea_fisica = lector.line_num
                if len(fila) != len(ENCABEZADO_VIAJES):
                    raise ErrorDatos(
                        "cantidad de columnas inválida en {0}, línea {1}".format(
                            ruta, linea_fisica
                        )
                    )
                if any(not valor.strip() for valor in fila):
                    raise ErrorDatos(
                        "campo vacío en {0}, línea {1}".format(ruta, linea_fisica)
                    )

                (
                    documento,
                    duracion_larga,
                    retiro_fuera_mes,
                    retiro_id,
                    arribo_id,
                    retiro_en_catalogo,
                    arribo_en_catalogo,
                ) = transformar_fila_viaje(
                    fila,
                    nombre,
                    anio_archivo,
                    mes_archivo,
                    ruta,
                    linea_fisica,
                    numero_registro,
                    catalogo,
                )
                emitir(documento, argumentos.sin_salida)
                registros_archivo += 1
                totales["viajes"] += 1
                if duracion_larga:
                    totales["duracionMayor24h"] += 1
                if retiro_fuera_mes:
                    totales["retiroFueraMesArribo"] += 1
                if not retiro_en_catalogo:
                    totales["retiroNoCatalogado"] += 1
                    identificadores_no_catalogados.add(retiro_id)
                if not arribo_en_catalogo:
                    totales["arriboNoCatalogado"] += 1
                    identificadores_no_catalogados.add(arribo_id)
                if not retiro_en_catalogo or not arribo_en_catalogo:
                    totales["viajeNoCatalogado"] += 1

                if registros_archivo % PROGRESO_CADA == 0:
                    informar(
                        "{0}: {1} viajes procesados...".format(
                            nombre, registros_archivo
                        )
                    )

        esperado = REGISTROS_ESPERADOS[nombre]
        if registros_archivo != esperado:
            raise ErrorDatos(
                "{0} contiene {1} viajes; se esperaban {2}".format(
                    nombre, registros_archivo, esperado
                )
            )
        informar("{0}: {1} viajes validados.".format(nombre, registros_archivo))

    esperados = {
        "viajes": 4707285,
        "duracionMayor24h": 104,
        "retiroFueraMesArribo": 440,
        "retiroNoCatalogado": 40,
        "arriboNoCatalogado": 78,
        "viajeNoCatalogado": 114,
    }
    for clave, esperado in esperados.items():
        if totales[clave] != esperado:
            raise ErrorDatos(
                "el indicador {0} produjo {1}; se esperaba {2}".format(
                    clave, totales[clave], esperado
                )
            )
    if identificadores_no_catalogados != set(["1000"]):
        raise ErrorDatos(
            "identificadores no catalogados inesperados: {0}".format(
                sorted(identificadores_no_catalogados)
            )
        )

    informar(
        "Viajes validados y transformados: {0}; duraciones >24 h: {1}; retiros fuera del mes: {2}; extremos no catalogados: {3} retiros y {4} arribos.".format(
            totales["viajes"],
            totales["duracionMayor24h"],
            totales["retiroFueraMesArribo"],
            totales["retiroNoCatalogado"],
            totales["arriboNoCatalogado"],
        )
    )


def construir_parser():
    parser = argparse.ArgumentParser(
        description="Transforma los CSV auditados de ECOBICI a Extended JSON."
    )
    subparsers = parser.add_subparsers(dest="modo")

    parser_estaciones = subparsers.add_parser(
        "estaciones", help="transforma el catálogo de cicloestaciones"
    )
    parser_estaciones.add_argument("archivo")
    parser_estaciones.add_argument(
        "--sin-salida",
        action="store_true",
        help="valida todos los registros sin emitir Extended JSON",
    )
    parser_estaciones.set_defaults(funcion=transformar_estaciones)

    parser_viajes = subparsers.add_parser(
        "viajes", help="transforma los tres archivos mensuales de viajes"
    )
    parser_viajes.add_argument("--catalogo", required=True)
    parser_viajes.add_argument(
        "--sin-salida",
        action="store_true",
        help="valida todos los registros sin emitir Extended JSON",
    )
    parser_viajes.add_argument("archivos", nargs="+")
    parser_viajes.set_defaults(funcion=transformar_viajes)
    return parser


def main():
    parser = construir_parser()
    argumentos = parser.parse_args()
    if not hasattr(argumentos, "funcion"):
        parser.print_help(sys.stderr)
        return 2
    try:
        argumentos.funcion(argumentos)
        return 0
    except BrokenPipeError:
        informar("ERROR: el consumidor cerró la salida antes de completar la transformación.")
        descriptor_nulo = os.open(os.devnull, os.O_WRONLY)
        os.dup2(descriptor_nulo, sys.stdout.fileno())
        os.close(descriptor_nulo)
        return 1
    except (ErrorDatos, csv.Error, OSError, ValueError) as error:
        informar("ERROR: {0}".format(error))
        return 1


if __name__ == "__main__":
    sys.exit(main())
