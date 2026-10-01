/*
  001 — Base de datos y login de la aplicación.

  Se ejecuta con sqlcmd, como administrador, sobre una instancia donde la BD no existe:
    sqlcmd -S <servidor> -U sa -P <clave> -C -f 65001 -v APP_DB_PASSWORD="<clave app>" -i 001-crearBaseDatos.sql

  La contraseña del login de la app llega como variable de sqlcmd y no queda escrita en el repositorio.
  Los permisos del login se otorgan al final de 002-esquema.sql, cuando ya existen las tablas.
*/
:on error exit

-- Modern_Spanish_CI_AI: no distingue mayúsculas ni tildes ("perez" encuentra "Pérez")
-- y ordena según el alfabeto español.
CREATE DATABASE ModuloCreditos COLLATE Modern_Spanish_CI_AI;
GO

CREATE LOGIN appCreditos
    WITH PASSWORD = N'$(APP_DB_PASSWORD)',
         DEFAULT_DATABASE = ModuloCreditos,
         CHECK_POLICY = ON;
GO

USE ModuloCreditos;
GO

CREATE USER appCreditos FOR LOGIN appCreditos;
GO
