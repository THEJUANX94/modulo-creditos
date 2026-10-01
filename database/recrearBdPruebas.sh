#!/bin/bash
# Borra y vuelve a crear la BD de las pruebas de integración con los mismos scripts 001 → 003
# (ADR 0008). Lo corre el setup global de Vitest, dentro del contenedor de dbInit:
#   docker compose run --rm -e NOMBRE_BD=ModuloCreditosPruebas --entrypoint /bin/bash dbInit /database/recrearBdPruebas.sh
# Se niega a tocar una BD cuyo nombre no termine en "Pruebas": nunca borra la de desarrollo.
set -euo pipefail

nombreBd="${NOMBRE_BD:-}"
if [[ ! "$nombreBd" =~ ^[A-Za-z][A-Za-z0-9]*Pruebas$ ]]; then
  echo "NOMBRE_BD tiene que terminar en 'Pruebas' (recibido: '$nombreBd'). No se borra nada." >&2
  exit 1
fi

export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"
# ROLLBACK IMMEDIATE corta las conexiones que hayan quedado abiertas de una corrida anterior.
/opt/mssql-tools18/bin/sqlcmd -S sqlserver -U sa -C -b -Q "
  IF DB_ID('$nombreBd') IS NOT NULL
  BEGIN
    ALTER DATABASE [$nombreBd] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [$nombreBd];
  END"

exec /bin/bash /database/inicializar.sh
