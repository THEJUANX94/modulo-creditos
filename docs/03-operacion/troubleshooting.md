---
type: reference
tags: [operacion, troubleshooting, errores, pnpm, windows]
---

# Diagnóstico y problemas conocidos

## pnpm 12 no arranca en Windows: "no se reconoce como un comando"

**Síntoma.** Con pnpm 11 instalado, `pnpm install` en el repositorio falla así:

```
""C:\Users\<usuario>\AppData\Local\pnpm\store\v11\links\@\pnpm\12.8.1\...\bin\\..\node_modules\pnpm\pnpm"" no se reconoce como un comando interno o externo
```

**Causa.** El `package.json` fija `packageManager: pnpm@12.8.1`, y desde la 9.7 pnpm descarga y usa esa versión automáticamente. Pero pnpm 12 se distribuye como **binario nativo**: su paquete trae un archivo `pnpm` provisional (un script `sh`, sin extensión), que el script `install.js` reemplaza por el ejecutable durante una instalación normal. El cambio automático de versión **no ejecuta scripts de instalación**, así que en Windows el lanzador `pnpm.CMD` termina invocando el script `sh`, que `cmd` no puede ejecutar.

**Solución.** Instalar pnpm 12 globalmente con npm, que sí ejecuta `install.js`:

```bash
npm install -g pnpm@12.8.1
```

Verificar con `pnpm -v` (debe mostrar `12.8.1`) y volver a correr `pnpm install`.

Si pnpm se había instalado con `npm install -g`, actualizar con `pnpm add -g` deja dos instalaciones distintas en el PATH. Hay que usar el mismo gestor con el que se instaló.

## `002-esquema.sql` falla: "SET options have incorrect settings: 'QUOTED_IDENTIFIER'"

**Síntoma.**

```
Msg 1934 … CREATE TABLE failed because the following SET options have incorrect settings: 'QUOTED_IDENTIFIER'.
```

**Causa.** SQL Server exige `QUOTED_IDENTIFIER ON` para crear columnas calculadas indexadas (`numeroCredito`) e índices filtrados (`UX_Creditos_enCurso`), y `sqlcmd` arranca con esa opción en OFF.

**Solución.** Ya está resuelto en el script, que fija `SET ANSI_NULLS ON` y `SET QUOTED_IDENTIFIER ON` al inicio. Si alguien quita esas líneas, vuelve a fallar. Como el script corre en una sola transacción, un fallo no deja tablas a medias. Para reintentar después de un fallo en el 002 basta con volver a ejecutarlo; si el que falló fue el 001, hay que borrar la BD y el login.

## Las tildes de los catálogos aparecen dañadas ("CÃ©dula")

**Causa.** `sqlcmd` leyó el script UTF-8 con otra página de códigos.

**Solución.** Ejecutar los scripts con `-f 65001`.

## `docker exec … /opt/mssql-tools18/bin/sqlcmd` falla en Git Bash: "no such file or directory"

**Síntoma.** El error muestra una ruta como `D:/Git/opt/mssql-tools18/bin/sqlcmd`.

**Causa.** Git Bash (MSYS) convierte las rutas que empiezan con `/` en rutas de Windows antes de pasarlas a `docker`.

**Solución.** Desactivar la conversión en ese comando con `MSYS_NO_PATHCONV=1 docker exec …`, o ejecutarlo desde PowerShell.

## Prisma inserta `N'PENDIENTE'` literal, o no genera `create` para `Creditos`

**Causa.** Son limitaciones de la introspección de Prisma 7 con SQL Server: no soporta `ROWVERSION`, trata las columnas calculadas como campos normales y lee los `DEFAULT (N'...')` como texto literal.

**Solución.** No se cambia el esquema. Las escrituras de `Creditos` van con SQL parametrizado, y la app no depende de esos defaults en Prisma. Ver el [ADR 0003](../01-arquitectura/decisions/0003-sql-primero-prisma-por-introspeccion.md).

Última actualización: 2026-09-30
