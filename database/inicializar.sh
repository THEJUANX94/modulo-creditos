#!/bin/bash
# Inicializa la BD ejecutando 001 → 003. Lo corre el servicio dbInit del docker-compose.
# Si la BD ya está completa, no hace nada. Si quedó a medias (un fallo en un arranque anterior),
# se detiene y explica cómo recrearla, en lugar de seguir sobre un esquema incompleto.
# NOMBRE_BD es ModuloCreditos por defecto; las pruebas usan ModuloCreditosPruebas (ADR 0008).
set -euo pipefail

nombreBd="${NOMBRE_BD:-ModuloCreditos}"
# El nombre se inserta en el SQL: solo letras y dígitos.
if [[ ! "$nombreBd" =~ ^[A-Za-z][A-Za-z0-9]*$ ]]; then
  echo "NOMBRE_BD inválido: '$nombreBd' (solo letras y dígitos)." >&2
  exit 1
fi

# sqlcmd toma la clave de esta variable, así no aparece en la lista de procesos.
export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"
sqlcmd=(/opt/mssql-tools18/bin/sqlcmd -S sqlserver -U sa -C -f 65001 -b)

consultar() {
  "${sqlcmd[@]}" -h -1 -W -Q "SET NOCOUNT ON; $1" | tr -d '[:space:]'
}

# Dos consultas separadas: si la BD no existe, SQL Server no puede ni compilar una consulta
# que mencione <BD>.dbo.Roles.
if [ "$(consultar "SELECT IIF(DB_ID('$nombreBd') IS NULL, 0, 1)")" = "0" ]; then
  estado=NO_EXISTE
elif [ "$(consultar "SELECT IIF(OBJECT_ID('$nombreBd.dbo.Roles') IS NULL, 0, 1)")" = "1" ] \
  && [ "$(consultar "SELECT COUNT(*) FROM $nombreBd.dbo.Roles")" != "0" ]; then
  estado=COMPLETA
else
  estado=INCOMPLETA
fi

case "$estado" in
  COMPLETA)
    echo "$nombreBd ya existe y está completa: no se ejecutan los scripts."
    ;;
  NO_EXISTE)
    echo "Creando $nombreBd..."
    "${sqlcmd[@]}" -v NOMBRE_BD="$nombreBd" APP_DB_PASSWORD="$APP_DB_PASSWORD" \
      -i /database/001-crearBaseDatos.sql
    "${sqlcmd[@]}" -v NOMBRE_BD="$nombreBd" -i /database/002-esquema.sql
    "${sqlcmd[@]}" -v NOMBRE_BD="$nombreBd" -i /database/003-catalogos.sql
    echo "$nombreBd creada."
    ;;
  *)
    echo "$nombreBd existe pero está incompleta (un arranque anterior falló a mitad)." >&2
    echo "Para recrearla desde cero: docker compose down -v && docker compose up -d" >&2
    exit 1
    ;;
esac
