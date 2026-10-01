import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import path from 'node:path';
import type { TestProject } from 'vitest/node';

// Una vez por corrida, antes de los archivos de integración (ADR 0008).
const dirApi = path.resolve(import.meta.dirname, '../../..');
const raiz = path.resolve(dirApi, '../..');

function ejecutar(
  descripcion: string,
  comando: string,
  args: string[],
  opciones: ExecFileSyncOptions,
): void {
  try {
    execFileSync(comando, args, { ...opciones, stdio: 'pipe', encoding: 'utf8' });
  } catch (error) {
    const salida = error as { stdout?: string; stderr?: string };
    throw new Error(`${descripcion} falló:\n${salida.stdout ?? ''}${salida.stderr ?? ''}`, {
      cause: error,
    });
  }
}

export default function setup(project: TestProject): void {
  const entorno = project.config.env;
  // La misma BD a la que se conectan las pruebas (vitest.integracion.config.ts).
  const nombreBd = /database=(\w+)/i.exec(entorno.DATABASE_URL ?? '')?.[1];
  if (!nombreBd) throw new Error('El entorno de pruebas no tiene DATABASE_URL');

  // La BD de pruebas desde cero, con los mismos scripts y el mismo sqlcmd que en desarrollo.
  // El script se niega a borrar una BD cuyo nombre no termine en "Pruebas".
  ejecutar(
    'Recrear la BD de pruebas (¿está corriendo Docker?)',
    'docker',
    [
      'compose',
      'run',
      '--rm',
      '-e',
      `NOMBRE_BD=${nombreBd}`,
      '--entrypoint',
      '/bin/bash',
      'dbInit',
      '/database/recrearBdPruebas.sh',
    ],
    { cwd: raiz },
  );

  // Un usuario por rol, con el mismo script de los usuarios demo y una contraseña aleatoria.
  ejecutar(
    'Crear los usuarios de prueba',
    process.execPath,
    ['--import', 'tsx', 'src/scripts/crearUsuariosDemo.ts'],
    { cwd: dirApi, env: { ...process.env, ...entorno } },
  );
}
