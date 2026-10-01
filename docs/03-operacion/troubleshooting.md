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

Última actualización: 2026-09-30
