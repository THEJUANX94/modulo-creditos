---
type: decision
tags: [adr, despliegue, ci-cd, backup, monitoreo, readme, diagramas]
---

# ADR 0023: Entregables finales — README, diagramas y propuesta de despliegue

## Estado

Aceptado (2026-10-01). Implementado en el paso 9. Es documentación: no cambia el comportamiento del sistema.

## Contexto

El enunciado pide como entregables un README con instrucciones de instalación y ejecución, un diagrama de arquitectura y un documento corto con las decisiones técnicas (sección 15), y una propuesta de despliegue (sección 16) que cubra como mínimo HTTPS, variables y secretos, backup de SQL Server, logs, health checks, monitoreo y CI/CD, y qué componentes son stateless y cuáles conservan estado.

El 50 % de la nota es la socialización y la justificación: cada decisión de la propuesta tiene que poder defenderse con su alternativa y su costo.

## Decisión

| Pieza | Elección | Por qué |
|---|---|---|
| README | **Corto, la puerta de entrada**: qué es, el arranque con Docker en dos comandos, los usuarios demo, un recorrido de 5 minutos, las pruebas, el mapa de cada entregable del enunciado a su ubicación, la estructura y el stack | Quien evalúa llega al sistema funcionando en minutos y encuentra cada entregable sin buscar. El detalle vive en `docs/` y no se mantiene en dos sitios |
| Diagramas | **Mermaid dentro de los documentos**: componentes y secuencia de creación de un crédito en `architecture.md`, y la topología de producción en `deploy.md` | Es texto versionado: se revisa en un diff y GitHub lo dibuja solo. Se validó que los tres se renderizan |
| Plataforma de la propuesta | **Neutral, con Azure como referencia**: cada pieza se describe por su función y se mapea a un servicio (Container Apps, Managed Instance, Key Vault, Front Door) | SQL Server es nativo en Azure, así que la propuesta es concreta sin atarse a un proveedor. Con alternativas neutrales en la misma tabla |
| Base de datos productiva | **Azure SQL Managed Instance**, no Azure SQL Database | `001-crearBaseDatos.sql` crea un `LOGIN` a nivel de instancia y usa `USE`, que Azure SQL Database no admite |
| Recuperación | **RPO de 5 minutos y RTO de 1 hora**, con un mecanismo por tipo de falla: zona redundante, grupo de conmutación por error entre regiones, PITR para errores humanos y geo-restore como último recurso | Ninguno cumple el objetivo solo. Los backups automáticos dan un RPO de unos 10 minutos y un RTO de "menos de 12 horas": se verificó en la documentación de Microsoft |
| Monitoreo | **OpenTelemetry con Grafana, Loki, Prometheus y Tempo**, y alertas definidas por condición y severidad | Neutral al proveedor, y con las tres señales correlacionadas por `trace_id` y `requestId`. No está instrumentado todavía: se dice así en el documento |
| CI/CD | **GitHub Actions** (el repo está en GitHub): CI con los comandos que ya existen, imágenes con escaneo y etiqueta por SHA, y despliegue a staging automático y a producción con aprobación manual y vuelta atrás. Se **documenta, sin crear archivos** en el repositorio | Cada paso es un comando que se verificó en local. Quien evalúa ve el diseño sin un workflow que nadie ejecutó |
| Honestidad | Una sección de **brechas conocidas** al final de `deploy.md` | Lo que no se hizo se dice, para no defender en la socialización algo que el código no tiene |

### Lo que se decidió no hacer

- **La respuesta de escalabilidad** (la sección 17 del enunciado: de 500 a 500.000 créditos al mes y varias entidades) **no se documenta** en el repositorio, por decisión del 2026-10-01. Las piezas de partida del [ADR 0009](0009-una-entidad-multi-entidad-como-propuesta.md) quedan como están.
- **Cambiar el código por la propuesta de despliegue.** Las brechas que esta propuesta encuentra (el primer administrador, las migraciones, OpenTelemetry, el rate limit compartido) quedan documentadas, no implementadas.
- **Que el healthcheck de la API no escriba en el log.** Una línea cada 10 s en Docker; se acepta como costo conocido.

## Alternativas consideradas

- **README completo y autosuficiente** (desarrollo con pnpm, variables y ejemplos de la API): quien evalúa no abriría `docs/`, pero el contenido quedaría duplicado.
- **Diagrama como PNG**, hecho a mano o exportado de Mermaid: se ve en cualquier parte, pero no se revisa en un diff y se desactualiza; exportarlo exige instalar un Chromium.
- **Plataforma**: solo neutral (más abstracta y más difícil de defender), una VM con Docker Compose (realista para una entidad pequeña, pero no se escala) o Kubernetes (más de lo que 500 créditos al mes justifican).
- **RPO de 24 horas y RTO de 4 horas**: un completo diario, simple y barato, pero hasta un día de créditos y auditoría perdidos. **RPO casi cero con réplica sincrónica**: lo más robusto, pero muy caro para el volumen.
- **Monitoreo con los servicios de la plataforma** (Azure Monitor y Log Analytics): sin montar infraestructura, pero atado al proveedor.
- **Solo la tabla de etapas del CI**, sin el workflow: más corto, menos concreto.
- **Crear `.github/workflows/ci.yml` en el repositorio**: se decidió documentarlo en el paso 5 ([ADR 0019](0019-implementacion-de-las-pruebas.md)); un workflow que nadie ejecutó puede fallar en el primer uso.

## Consecuencias

- **Positivas**:
  - Cada requisito de la sección 16 tiene su respuesta concreta, con su alternativa y su costo.
  - El README lleva a cada entregable, y todo lo demás se encuentra desde el índice de `docs/`.
  - La propuesta separa lo que existe y está verificado de lo que se diseña: no promete lo que el código no hace.
- **Costos aceptados**:
  - **La propuesta no se ejecutó en Azure.** Sus comportamientos salen de la documentación de los servicios. Un ambiente de pruebas tiene que confirmarlos antes de depender de ellos.
  - **El workflow de GitHub Actions no se ejecutó.** Los pasos de verificación sí corren en local con los mismos comandos; lo propio de GitHub (OIDC, el *environment* con aprobación, Trivy) está sin probar.
  - **Cumplir el RPO y el RTO ante una caída regional exige una segunda instancia** en otra región, con su costo.
  - **El README duplica unos pocos comandos** de `setup-local.md`, a propósito, para que se pueda arrancar sin salir de él.

## Verificación (2026-10-01)

- Los tres diagramas de Mermaid se renderizan sin errores (con la versión 11 de Mermaid).
- Los dos bloques YAML (el workflow y Dependabot) se parsean como YAML válido. El workflow no se ejecutó en GitHub.
- Las cifras de recuperación de Managed Instance (RPO y RTO por mecanismo, retención de 35 días y de hasta 10 años, frecuencia de los backups) se contrastaron con la documentación de Microsoft.
- Los enlaces entre los documentos y desde el README no están rotos.

Última actualización: 2026-10-01
