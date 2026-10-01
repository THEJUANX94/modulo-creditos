/* global document, localStorage, matchMedia */
// Aplica el tema guardado (o el del sistema) antes de pintar, para que no parpadee. Es un archivo y no
// un script inline para que la CSP de Nginx no necesite excepciones (ADR 0022). Lo carga index.html
// en el <head>, sin defer: tiene que correr antes del primer render.
(function () {
  var tema = null;
  try {
    tema = localStorage.getItem('tema');
  } catch {
    // Sin acceso al almacenamiento (modo privado estricto): se usa el tema del sistema.
  }
  var oscuro =
    tema === 'dark' || (tema !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', oscuro);
  document.documentElement.style.colorScheme = oscuro ? 'dark' : 'light';
})();
