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

## El login responde 429 en desarrollo

**Causa.** El rate limit (5 fallos por IP + correo y 20 logins por IP, en ventanas de 15 minutos) vive en la memoria del proceso. Probar muchos logins seguidos lo agota.

**Solución.** Esperar a que pase la ventana (el header `Retry-After` dice cuántos segundos faltan) o **reiniciar la API**, que reinicia los contadores. En producción, con varias réplicas, el almacén iría a Redis.

## Después de un login, la otra pestaña o el otro equipo responde 401 `SESION_INVALIDA`

**No es un error.** Hay una sola sesión por usuario ([ADR 0016](../01-arquitectura/decisions/0016-autenticacion-sesiones-y-permisos.md)): un login nuevo cierra la sesión anterior al instante. Lo mismo pasa si un ADMIN desactiva al usuario o le cambia el rol, o si un refresh token rotado se reusa pasados 10 segundos. Cada caso queda en `EventosSeguridad`.

## La API responde 500 "Failed to connect to localhost:1433"

**Causa.** SQL Server no está arriba. Con Docker Desktop, pasa cuando está cerrado o todavía arrancando: puede tardar varios minutos, con la distro WSL `docker-desktop` en `Stopped` y `docker info` sin responder.

**Solución.** Esperar a que Docker Desktop termine de arrancar (`docker version` muestra la versión del servidor) y correr `docker compose up -d`. **La API no necesita reiniciarse**: el readiness vuelve a 200 apenas la BD responde.

## La búsqueda con `%` o `_` devuelve todo

**Causa.** El `contains` de Prisma arma un `LIKE` y en SQL Server no escapa los comodines.

**Solución.** Ya está resuelto en `creditosRepository.ts` (`escaparLike`), que los escapa con corchetes (`[%]`). Cualquier búsqueda nueva con `contains` debe pasar por esa función.

## Prisma inserta `N'PENDIENTE'` literal, o no genera `create` para `Creditos`

**Causa.** Son limitaciones de la introspección de Prisma 7 con SQL Server: no soporta `ROWVERSION`, trata las columnas calculadas como campos normales y lee los `DEFAULT (N'...')` como texto literal.

**Solución.** No se cambia el esquema. Las escrituras de `Creditos` van con SQL parametrizado, y la app no depende de esos defaults en Prisma. Ver el [ADR 0003](../01-arquitectura/decisions/0003-sql-primero-prisma-por-introspeccion.md).

Última actualización: 2026-10-01
