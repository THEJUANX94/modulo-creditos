import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

// Receptor temporal del webhook para las pruebas: verifica la firma (Standard Webhooks), guarda
// cada petición y responde según el escenario del asociado. El mock del sistema externo es otro
// componente (paso 6).

export type Accion =
  | number
  | { tipo: 'cuerpo'; status: number; texto: string }
  | { tipo: 'lento'; ms: number }
  | { tipo: 'redirigir' }
  | { tipo: 'cerrar' };

export interface PeticionRecibida {
  webhookId: string | undefined;
  timestamp: string | undefined;
  requestId: string | undefined;
  contentType: string | undefined;
  userAgent: string | undefined;
  cuerpo: string;
  datos: { eventId?: string; data?: { identificacionAsociado?: string } } | null;
  firmaValida: boolean;
}

const encabezado = (req: IncomingMessage, nombre: string) => {
  const valor = req.headers[nombre];
  return Array.isArray(valor) ? valor[0] : valor;
};

export class ReceptorWebhook {
  readonly recibidas: PeticionRecibida[] = [];
  // Respuestas en cola por identificación del asociado; sin cola, responde 200.
  readonly escenarios = new Map<string, Accion[]>();
  redireccionSeguida = false;
  alRecibir: ((peticion: PeticionRecibida) => void) | null = null;
  private servidor: Server | null = null;

  constructor(
    private readonly secreto: Buffer,
    private readonly puerto: number,
  ) {}

  iniciar(): Promise<void> {
    this.servidor = createServer((req, res) => this.atender(req, res));
    return new Promise((resolver) => this.servidor?.listen(this.puerto, resolver));
  }

  detener(): Promise<void> {
    const servidor = this.servidor;
    this.servidor = null;
    if (!servidor) return Promise.resolve();
    return new Promise((resolver) => {
      servidor.close(() => resolver());
      servidor.closeAllConnections();
    });
  }

  recibidasDe(eventId: string): PeticionRecibida[] {
    return this.recibidas.filter((peticion) => peticion.webhookId === eventId);
  }

  private atender(req: IncomingMessage, res: ServerResponse): void {
    let cuerpo = '';
    req.setEncoding('utf8');
    req.on('data', (parte: string) => (cuerpo += parte));
    req.on('end', () => {
      if (req.url === '/otro') {
        this.redireccionSeguida = true;
        res.writeHead(200).end();
        return;
      }
      const webhookId = encabezado(req, 'webhook-id');
      const timestamp = encabezado(req, 'webhook-timestamp');
      const esperada = `v1,${createHmac('sha256', this.secreto)
        .update(`${webhookId}.${timestamp}.${cuerpo}`)
        .digest('base64')}`;
      let datos: PeticionRecibida['datos'] = null;
      try {
        datos = JSON.parse(cuerpo) as PeticionRecibida['datos'];
      } catch {
        // Un cuerpo que no es JSON queda registrado tal cual.
      }
      const peticion: PeticionRecibida = {
        webhookId,
        timestamp,
        requestId: encabezado(req, 'x-request-id'),
        contentType: encabezado(req, 'content-type'),
        userAgent: encabezado(req, 'user-agent'),
        cuerpo,
        datos,
        firmaValida: encabezado(req, 'webhook-signature') === esperada,
      };
      this.recibidas.push(peticion);
      this.alRecibir?.(peticion);

      const cola = this.escenarios.get(datos?.data?.identificacionAsociado ?? '') ?? [];
      this.responder(cola.shift() ?? 200, req, res);
    });
  }

  private responder(accion: Accion, req: IncomingMessage, res: ServerResponse): void {
    if (typeof accion === 'number') {
      res.writeHead(accion, { 'content-type': 'text/plain' }).end(`rechazo ${accion}`);
      return;
    }
    switch (accion.tipo) {
      case 'cuerpo':
        res.writeHead(accion.status, { 'content-type': 'text/plain' }).end(accion.texto);
        break;
      case 'lento':
        setTimeout(() => {
          if (!res.destroyed) res.writeHead(200).end('ok tarde');
        }, accion.ms);
        break;
      case 'redirigir':
        res.writeHead(302, { location: `http://localhost:${this.puerto}/otro` }).end();
        break;
      case 'cerrar':
        req.socket.destroy();
        break;
    }
  }
}
