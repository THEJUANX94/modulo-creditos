import { Prisma } from '../../generated/prisma/client';

// Violación de un índice o restricción única (P2002), por ejemplo un correo repetido o una
// segunda sesión activa creada por dos logins simultáneos.
export function esViolacionUnica(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
