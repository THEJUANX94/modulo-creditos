/*
  003 — Catálogos: datos obligatorios para que el sistema funcione.

  Se ejecuta con sqlcmd, como administrador, después de 002:
    sqlcmd -S <servidor> -U sa -P <clave> -C -f 65001 -v NOMBRE_BD=ModuloCreditos -i 003-catalogos.sql

  -f 65001 indica que el archivo es UTF-8; sin eso, las tildes llegan dañadas.
  Los usuarios iniciales se crean en el paso 4 (autenticación); los datos de demostración,
  con un script que usa la API (paso 8).
*/
:on error exit

USE [$(NOMBRE_BD)];
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

INSERT INTO dbo.TiposIdentificacion (codigo, nombre) VALUES
    (N'CC',  N'Cédula de ciudadanía'),
    (N'CE',  N'Cédula de extranjería'),
    (N'PA',  N'Pasaporte'),
    (N'PPT', N'Permiso por Protección Temporal'),
    (N'NIT', N'Número de Identificación Tributaria');

INSERT INTO dbo.TiposCredito (codigo, nombre) VALUES
    (N'LIBRE_INVERSION',     N'Libre inversión'),
    (N'EDUCATIVO',           N'Educativo'),
    (N'VIVIENDA',            N'Vivienda'),
    (N'VEHICULO',            N'Vehículo'),
    (N'CALAMIDAD_DOMESTICA', N'Calamidad doméstica'),
    (N'ROTATIVO',            N'Rotativo'),
    (N'COMPRA_CARTERA',      N'Compra de cartera'),
    (N'EMPRENDIMIENTO',      N'Emprendimiento');

INSERT INTO dbo.FormasPago (codigo, nombre) VALUES
    (N'NOMINA',            N'Descuento por nómina (libranza)'),
    (N'CAJA',              N'Pago en caja'),
    (N'DEBITO_AUTOMATICO', N'Débito automático'),
    (N'PSE',               N'PSE / transferencia');

INSERT INTO dbo.Roles (codigo, nombre) VALUES
    (N'ASESOR',    N'Asesor'),
    (N'ANALISTA',  N'Analista de crédito'),
    (N'TESORERIA', N'Tesorería'),
    (N'ADMIN',     N'Administrador');

COMMIT TRANSACTION;
GO
