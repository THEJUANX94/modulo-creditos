// Página del mock (ADR 0020): lo que recibió, el modo actual y botones para cambiarlo en vivo.
// Se refresca sola cada 2 s desde /recibidos. Colores de docs/05-frontend/design-system.md.
// El contenido se pinta con textContent: nada de lo recibido se interpreta como HTML.

export const pagina = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sistema externo (mock)</title>
<style>
  :root {
    --fondo: #F8FAFC; --texto: #020617; --tarjeta: #FFFFFF; --borde: #E2E8F0;
    --suave: #475569; --primario: #0F172A; --sobre-primario: #FFFFFF;
    --exito: #15803D; --aviso: #A16207; --error: #DC2626;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --fondo: #020617; --texto: #F8FAFC; --tarjeta: #0F172A; --borde: #334155;
      --suave: #94A3B8; --primario: #E2E8F0; --sobre-primario: #0F172A;
      --exito: #4ADE80; --aviso: #CA8A04; --error: #EF4444;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px 16px; background: var(--fondo); color: var(--texto);
    font: 15px/1.5 "IBM Plex Sans", system-ui, sans-serif; }
  main { max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  p { margin: 0; color: var(--suave); }
  section { background: var(--tarjeta); border: 1px solid var(--borde); border-radius: 8px;
    padding: 16px; margin-top: 16px; }
  h2 { font-size: 16px; margin: 0 0 12px; }
  .modos { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  button { font: inherit; padding: 8px 14px; border-radius: 6px; border: 1px solid var(--borde);
    background: transparent; color: var(--texto); cursor: pointer; min-height: 44px; }
  button[aria-pressed="true"] { background: var(--primario); color: var(--sobre-primario);
    border-color: var(--primario); }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--primario); outline-offset: 2px; }
  label { display: inline-flex; gap: 8px; align-items: center; margin-left: 8px; }
  input { font: inherit; width: 64px; padding: 8px; border-radius: 6px; border: 1px solid var(--borde);
    background: var(--tarjeta); color: var(--texto); min-height: 44px; }
  .totales { display: flex; flex-wrap: wrap; gap: 24px; }
  .totales strong { display: block; font-size: 22px; font-variant-numeric: tabular-nums; }
  .tabla { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--borde); white-space: nowrap; }
  th { color: var(--suave); font-weight: 500; }
  .estado { font-weight: 600; }
  .ok { color: var(--exito); } .aviso { color: var(--aviso); } .mal { color: var(--error); }
  code { font-size: 13px; }
</style>
</head>
<body>
<main>
  <h1>Sistema externo (mock)</h1>
  <p>Recibe <code>credito.creado</code>, verifica la firma con la librería oficial de Standard Webhooks y deduplica por <code>webhook-id</code>.</p>

  <section aria-labelledby="t-modo">
    <h2 id="t-modo">Comportamiento</h2>
    <div class="modos" id="modos"></div>
    <p id="descripcion" style="margin-top:8px"></p>
  </section>

  <section aria-labelledby="t-totales">
    <h2 id="t-totales">Totales</h2>
    <div class="totales" id="totales"></div>
  </section>

  <section aria-labelledby="t-recibidos">
    <h2 id="t-recibidos">Últimas peticiones</h2>
    <div class="tabla">
      <table>
        <thead><tr><th>#</th><th>Hora</th><th>Respuesta</th><th>Crédito</th><th>Valor</th><th>Envío</th><th>webhook-id</th><th>requestId</th><th>Detalle</th></tr></thead>
        <tbody id="filas"></tbody>
      </table>
    </div>
  </section>
</main>
<script>
  const descripciones = {
    acepta: 'Responde 200: el evento queda ENTREGADO.',
    falla: 'Responde 503: el worker reintenta con backoff y, al agotar los intentos, queda FALLIDO.',
    rechaza: 'Responde 400: es un rechazo definitivo, el evento queda FALLIDO sin reintentos.',
    lento: 'Procesa el evento pero responde tarde: el worker corta por TIMEOUT y su reintento llega como duplicado.',
    intermitente: 'Falla al azar la mitad de las veces (503).',
    fallaPrimeros: 'Falla los primeros N envíos de cada evento (503) y después acepta.',
  };
  const clase = { aceptado: 'ok', duplicado: 'ok', falla: 'aviso', rechazo: 'mal', 'firma inválida': 'mal', 'payload inválido': 'mal' };

  function celda(fila, texto, clases) {
    const td = document.createElement('td');
    td.textContent = texto ?? '—';
    if (clases) td.className = clases;
    fila.appendChild(td);
  }

  async function cambiar(cambios) {
    await fetch('/control', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cambios) });
    await actualizar();
  }

  // Los controles se crean una sola vez: si se rehicieran en cada refresco, quien navega con el
  // teclado perdería el foco cada 2 s. Después solo se actualiza su estado.
  const botones = new Map();
  let entrada = null;

  function crearControles(listaModos) {
    const modos = document.getElementById('modos');
    for (const modo of listaModos) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.textContent = modo;
      boton.addEventListener('click', () => cambiar({ modo }));
      botones.set(modo, boton);
      modos.appendChild(boton);
    }
    const etiqueta = document.createElement('label');
    etiqueta.textContent = 'N fallas por evento';
    entrada = document.createElement('input');
    entrada.type = 'number'; entrada.min = '1'; entrada.max = '10';
    entrada.addEventListener('change', () => cambiar({ fallasPorEvento: Number(entrada.value) }));
    etiqueta.appendChild(entrada);
    modos.appendChild(etiqueta);
  }

  function pintar(datos) {
    if (botones.size === 0) crearControles(datos.modos);
    for (const [modo, boton] of botones) boton.setAttribute('aria-pressed', String(modo === datos.modo));
    // No se pisa lo que alguien está escribiendo.
    if (document.activeElement !== entrada) entrada.value = String(datos.fallasPorEvento);
    document.getElementById('descripcion').textContent = descripciones[datos.modo];

    const totales = document.getElementById('totales');
    totales.replaceChildren(...Object.entries(datos.totales).map(([nombre, valor]) => {
      const div = document.createElement('div');
      const numero = document.createElement('strong');
      numero.textContent = String(valor);
      div.append(numero, nombre);
      return div;
    }));

    document.getElementById('filas').replaceChildren(...datos.recepciones.map((r) => {
      const fila = document.createElement('tr');
      celda(fila, String(r.numero));
      celda(fila, new Date(r.fecha).toLocaleTimeString('es-CO'));
      celda(fila, r.status + ' ' + r.resultado, 'estado ' + (clase[r.resultado] ?? ''));
      celda(fila, r.numeroCredito);
      celda(fila, r.valorSolicitado);
      celda(fila, String(r.envio));
      celda(fila, r.webhookId);
      celda(fila, r.requestId);
      celda(fila, r.detalle);
      return fila;
    }));
  }

  async function actualizar() {
    try {
      const respuesta = await fetch('/recibidos');
      pintar(await respuesta.json());
    } catch {
      // El mock se reinició: el próximo ciclo lo vuelve a intentar.
    }
  }

  actualizar();
  setInterval(actualizar, 2000);
</script>
</body>
</html>
`;
