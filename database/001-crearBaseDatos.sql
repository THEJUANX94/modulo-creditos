/*
  001 — Base de datos y login de la aplicación.

  Se ejecuta con sqlcmd, como administrador, sobre una instancia donde la BD no existe:
    sqlcmd -S <servidor> -U sa -P <clave> -C -f 65001 -v NOMBRE_BD=ModuloCreditos APP_DB_PASSWORD="<clave app>" -i 001-crearBaseDatos.sql

  NOMBRE_BD es ModuloCreditos; las pruebas crean ModuloCreditosPruebas con los mismos scripts.
  La contraseña del login de la app llega como variable de sqlcmd y no queda escrita en el repositorio.
  El login es del servidor, no de la BD: si ya existe (lo creó la otra BD), se reutiliza.
  Los permisos del login se otorgan al final de 002-esquema.sql, cuando ya existen las tablas.
*/
:on error exit

-- Modern_Spanish_CI_AI: no distingue mayúsculas ni tildes ("perez" encuentra "Pérez")
-- y ordena según el alfabeto español.
CREATE DATABASE [$(NOMBRE_BD)] COLLATE Modern_Spanish_CI_AI;
GO

IF SUSER_ID(N'appCreditos') IS NULL
    CREATE LOGIN appCreditos
        WITH PASSWORD = N'$(APP_DB_PASSWORD)',
             DEFAULT_DATABASE = [$(NOMBRE_BD)],
             CHECK_POLICY = ON;
GO

USE [$(NOMBRE_BD)];
GO

CREATE USER appCreditos FOR LOGIN appCreditos;
GO
