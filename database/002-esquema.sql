/*
  002 — Esquema: tablas, llaves, restricciones, índices, triggers de inmutabilidad y permisos.

  Se ejecuta con sqlcmd, como administrador, después de 001:
    sqlcmd -S <servidor> -U sa -P <clave> -C -f 65001 -i 002-esquema.sql

  Todo el script corre en una sola transacción: si algo falla, sqlcmd se detiene (:on error exit),
  la conexión se cierra y la transacción se revierte. No queda un esquema a medias.

  Justificación de cada decisión: docs/01-arquitectura/modelo-datos.md
*/
:on error exit

USE ModuloCreditos;
GO

-- Obligatorias para crear columnas calculadas indexadas e índices filtrados.
-- sqlcmd arranca con QUOTED_IDENTIFIER OFF, así que se fijan aquí y no dependen del cliente.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

/* ───────────── Catálogos ─────────────
   El código es la PK: es el mismo valor que viaja en la API (LIBRE_INVERSION, NOMINA…),
   así que Creditos lo guarda directo sin necesidad de joins para leerlo.
   activo permite retirar un valor sin borrarlo, porque los registros viejos lo siguen referenciando. */

CREATE TABLE dbo.TiposIdentificacion (
    codigo NVARCHAR(10)  NOT NULL,
    nombre NVARCHAR(100) NOT NULL,
    activo BIT           NOT NULL CONSTRAINT DF_TiposIdentificacion_activo DEFAULT (1),
    CONSTRAINT PK_TiposIdentificacion PRIMARY KEY (codigo)
);

CREATE TABLE dbo.TiposCredito (
    codigo NVARCHAR(30)  NOT NULL,
    nombre NVARCHAR(100) NOT NULL,
    activo BIT           NOT NULL CONSTRAINT DF_TiposCredito_activo DEFAULT (1),
    CONSTRAINT PK_TiposCredito PRIMARY KEY (codigo)
);

CREATE TABLE dbo.FormasPago (
    codigo NVARCHAR(30)  NOT NULL,
    nombre NVARCHAR(100) NOT NULL,
    activo BIT           NOT NULL CONSTRAINT DF_FormasPago_activo DEFAULT (1),
    CONSTRAINT PK_FormasPago PRIMARY KEY (codigo)
);

CREATE TABLE dbo.Roles (
    codigo NVARCHAR(20)  NOT NULL,
    nombre NVARCHAR(100) NOT NULL,
    CONSTRAINT PK_Roles PRIMARY KEY (codigo)
);

/* ───────────── Entidades ─────────────
   Patrón de llaves de Usuarios, Asociados y Creditos:
   - id (UNIQUEIDENTIFIER, NEWID()) es la PK NONCLUSTERED y el identificador público (API, webhook, FKs).
     Es aleatorio, así que no se puede adivinar.
   - consecutivo (INT IDENTITY) es el índice CLUSTERED: las inserciones van siempre al final,
     sin page splits ni fragmentación, y los índices secundarios cargan 4 bytes en lugar de 16. */

CREATE TABLE dbo.Usuarios (
    id                 UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Usuarios_id DEFAULT (NEWID()),
    consecutivo        INT IDENTITY(1, 1) NOT NULL,
    correo             NVARCHAR(254)    NOT NULL,
    nombre             NVARCHAR(150)    NOT NULL,
    hashContrasena     NVARCHAR(255)    NOT NULL,
    rol                NVARCHAR(20)     NOT NULL,
    activo             BIT              NOT NULL CONSTRAINT DF_Usuarios_activo DEFAULT (1),
    -- La contraseña que asigna un ADMIN es temporal: el usuario debe cambiarla en su primer login.
    debeCambiarContrasena BIT           NOT NULL CONSTRAINT DF_Usuarios_debeCambiarContrasena DEFAULT (0),
    fechaCreacion      DATETIME2(3)     NOT NULL CONSTRAINT DF_Usuarios_fechaCreacion DEFAULT (SYSUTCDATETIME()),
    fechaActualizacion DATETIME2(3)     NOT NULL CONSTRAINT DF_Usuarios_fechaActualizacion DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Usuarios PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT UX_Usuarios_consecutivo UNIQUE CLUSTERED (consecutivo),
    CONSTRAINT UX_Usuarios_correo UNIQUE (correo),
    CONSTRAINT FK_Usuarios_rol FOREIGN KEY (rol) REFERENCES dbo.Roles (codigo),
    CONSTRAINT CK_Usuarios_nombre CHECK (LEN(LTRIM(nombre)) > 0)
);

/* ───────────── Sesiones (ADR 0016) ─────────────
   Una sola sesión activa por usuario: un login nuevo revoca la anterior, y lo garantiza
   el índice único filtrado UX_Sesiones_activa aun con dos logins simultáneos.
   Cada petición autenticada verifica aquí que su sesión siga viva. */

CREATE TABLE dbo.Sesiones (
    id               BIGINT IDENTITY(1, 1) NOT NULL,
    usuarioId        UNIQUEIDENTIFIER NOT NULL,
    fechaInicio      DATETIME2(3)     NOT NULL CONSTRAINT DF_Sesiones_fechaInicio DEFAULT (SYSUTCDATETIME()),
    fechaExpiracion  DATETIME2(3)     NOT NULL,   -- 8 h desde el inicio; no se extiende con la rotación
    fechaRevocacion  DATETIME2(3)     NULL,
    motivoRevocacion NVARCHAR(30)     NULL,
    ip               NVARCHAR(45)     NOT NULL,   -- 45 caracteres: cabe una IPv6
    userAgent        NVARCHAR(300)    NULL,
    CONSTRAINT PK_Sesiones PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_Sesiones_usuarioId FOREIGN KEY (usuarioId) REFERENCES dbo.Usuarios (id),
    CONSTRAINT CK_Sesiones_expiracion CHECK (fechaExpiracion > fechaInicio),
    CONSTRAINT CK_Sesiones_revocacion CHECK (
        (fechaRevocacion IS NULL AND motivoRevocacion IS NULL)
        OR (fechaRevocacion IS NOT NULL AND motivoRevocacion IS NOT NULL)
    ),
    CONSTRAINT CK_Sesiones_motivoRevocacion CHECK (
        motivoRevocacion IN (N'LOGOUT', N'REUTILIZACION', N'NUEVA_SESION', N'USUARIO_DESACTIVADO',
                             N'ROL_CAMBIADO', N'CONTRASENA_CAMBIADA')
    )
);

CREATE UNIQUE NONCLUSTERED INDEX UX_Sesiones_activa
    ON dbo.Sesiones (usuarioId)
    WHERE fechaRevocacion IS NULL;

-- El refresh token es opaco: aquí solo se guarda su hash SHA-256. Rota en cada uso (fechaUso).
CREATE TABLE dbo.RefreshTokens (
    id            BIGINT IDENTITY(1, 1) NOT NULL,
    sesionId      BIGINT           NOT NULL,
    hashToken     BINARY(32)       NOT NULL,
    fechaCreacion DATETIME2(3)     NOT NULL CONSTRAINT DF_RefreshTokens_fechaCreacion DEFAULT (SYSUTCDATETIME()),
    fechaUso      DATETIME2(3)     NULL,
    requestId     NVARCHAR(100)    NULL,
    CONSTRAINT PK_RefreshTokens PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UX_RefreshTokens_hashToken UNIQUE (hashToken),
    CONSTRAINT FK_RefreshTokens_sesionId FOREIGN KEY (sesionId) REFERENCES dbo.Sesiones (id)
);

CREATE NONCLUSTERED INDEX IX_RefreshTokens_sesionId
    ON dbo.RefreshTokens (sesionId);

CREATE TABLE dbo.Asociados (
    id                 UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Asociados_id DEFAULT (NEWID()),
    consecutivo        INT IDENTITY(1, 1) NOT NULL,
    tipoIdentificacion NVARCHAR(10)     NOT NULL CONSTRAINT DF_Asociados_tipoIdentificacion DEFAULT (N'CC'),
    identificacion     NVARCHAR(20)     NOT NULL,
    nombre             NVARCHAR(150)    NOT NULL,
    fechaCreacion      DATETIME2(3)     NOT NULL CONSTRAINT DF_Asociados_fechaCreacion DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Asociados PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT UX_Asociados_consecutivo UNIQUE CLUSTERED (consecutivo),
    -- identificacion va primero: el filtro de la API por identificación (sin tipo) busca sobre este índice.
    CONSTRAINT UX_Asociados_identificacion UNIQUE (identificacion, tipoIdentificacion),
    CONSTRAINT FK_Asociados_tipoIdentificacion FOREIGN KEY (tipoIdentificacion) REFERENCES dbo.TiposIdentificacion (codigo),
    -- Formato por tipo. La collation binaria hace que los rangos sean ASCII estrictos
    -- (con la collation de la BD, [0-9] o [A-Z] podrían admitir otros caracteres).
    -- El NIT se guarda sin dígito de verificación. Un tipo nuevo necesita su regla aquí.
    CONSTRAINT CK_Asociados_identificacion CHECK (
        LEN(identificacion) >= 3
        AND (
            (tipoIdentificacion IN (N'CC', N'NIT')
                AND identificacion COLLATE Latin1_General_100_BIN2 NOT LIKE N'%[^0-9]%')
            OR (tipoIdentificacion IN (N'CE', N'PA', N'PPT')
                AND identificacion COLLATE Latin1_General_100_BIN2 NOT LIKE N'%[^0-9A-Za-z]%')
        )
    ),
    CONSTRAINT CK_Asociados_nombre CHECK (LEN(LTRIM(nombre)) > 0)
);

CREATE TABLE dbo.Creditos (
    id                   UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Creditos_id DEFAULT (NEWID()),
    consecutivo          INT IDENTITY(1, 1) NOT NULL,
    -- CR-{año de la solicitud en hora de Colombia}-{consecutivo con al menos 6 dígitos}.
    -- Colombia está en UTC-5 fijo (no tiene horario de verano), así que DATEADD es exacto y determinista,
    -- condición para que la columna pueda ser PERSISTED e indexarse.
    numeroCredito        AS CAST(
                             CONCAT(
                                 N'CR-',
                                 DATEPART(YEAR, DATEADD(HOUR, -5, fechaSolicitud)),
                                 N'-',
                                 RIGHT(CONCAT(N'000000', consecutivo), IIF(consecutivo > 999999, LEN(consecutivo), 6))
                             ) AS NVARCHAR(20)) PERSISTED NOT NULL,
    asociadoId           UNIQUEIDENTIFIER NOT NULL,
    tipoCredito          NVARCHAR(30)     NOT NULL,
    valorSolicitado      DECIMAL(18, 2)   NOT NULL,
    tasaInteres          DECIMAL(6, 4)    NOT NULL,   -- % mensual: 1.5000 = 1,5 % mes vencido
    numeroCuotas         SMALLINT         NOT NULL,
    formaPago            NVARCHAR(30)     NOT NULL,
    estado               NVARCHAR(20)     NOT NULL CONSTRAINT DF_Creditos_estado DEFAULT (N'SOLICITADO'),
    fechaSolicitud       DATETIME2(3)     NOT NULL CONSTRAINT DF_Creditos_fechaSolicitud DEFAULT (SYSUTCDATETIME()),
    fechaActualizacion   DATETIME2(3)     NOT NULL CONSTRAINT DF_Creditos_fechaActualizacion DEFAULT (SYSUTCDATETIME()),
    fechaEliminacion     DATETIME2(3)     NULL,
    usuarioEliminacionId UNIQUEIDENTIFIER NULL,
    version              ROWVERSION       NOT NULL,
    CONSTRAINT PK_Creditos PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT UX_Creditos_consecutivo UNIQUE CLUSTERED (consecutivo),
    CONSTRAINT UX_Creditos_numeroCredito UNIQUE (numeroCredito),
    CONSTRAINT FK_Creditos_asociadoId FOREIGN KEY (asociadoId) REFERENCES dbo.Asociados (id),
    CONSTRAINT FK_Creditos_tipoCredito FOREIGN KEY (tipoCredito) REFERENCES dbo.TiposCredito (codigo),
    CONSTRAINT FK_Creditos_formaPago FOREIGN KEY (formaPago) REFERENCES dbo.FormasPago (codigo),
    CONSTRAINT FK_Creditos_usuarioEliminacionId FOREIGN KEY (usuarioEliminacionId) REFERENCES dbo.Usuarios (id),
    CONSTRAINT CK_Creditos_valorSolicitado CHECK (valorSolicitado > 0),
    CONSTRAINT CK_Creditos_tasaInteres CHECK (tasaInteres BETWEEN 0 AND 100),
    CONSTRAINT CK_Creditos_numeroCuotas CHECK (numeroCuotas BETWEEN 1 AND 360),
    CONSTRAINT CK_Creditos_estado CHECK (
        estado IN (N'SOLICITADO', N'EN_ESTUDIO', N'APROBADO', N'RECHAZADO', N'DESEMBOLSADO', N'CANCELADO')
    ),
    CONSTRAINT CK_Creditos_eliminacion CHECK (
        (fechaEliminacion IS NULL AND usuarioEliminacionId IS NULL)
        OR (fechaEliminacion IS NOT NULL AND usuarioEliminacionId IS NOT NULL)
    )
);

-- Regla de duplicados: un solo crédito en curso por asociado y tipo.
-- Al ser un índice único, la BD la garantiza aunque lleguen dos peticiones simultáneas.
CREATE UNIQUE NONCLUSTERED INDEX UX_Creditos_enCurso
    ON dbo.Creditos (asociadoId, tipoCredito)
    WHERE estado IN (N'SOLICITADO', N'EN_ESTUDIO', N'APROBADO') AND fechaEliminacion IS NULL;

-- Listado filtrado por estado, ordenado por fecha (lo más reciente primero).
CREATE NONCLUSTERED INDEX IX_Creditos_estado_fechaSolicitud
    ON dbo.Creditos (estado, fechaSolicitud DESC)
    WHERE fechaEliminacion IS NULL;

-- Listado por defecto, sin filtro de estado.
CREATE NONCLUSTERED INDEX IX_Creditos_fechaSolicitud
    ON dbo.Creditos (fechaSolicitud DESC)
    WHERE fechaEliminacion IS NULL;

-- Créditos de un asociado (filtro por identificación, vía Asociados).
CREATE NONCLUSTERED INDEX IX_Creditos_asociadoId
    ON dbo.Creditos (asociadoId);

/* ───────────── Auditoría (inmutable) ───────────── */

CREATE TABLE dbo.HistorialCredito (
    id             BIGINT IDENTITY(1, 1) NOT NULL,
    creditoId      UNIQUEIDENTIFIER NOT NULL,
    estadoAnterior NVARCHAR(20)     NULL,
    estadoNuevo    NVARCHAR(20)     NOT NULL,
    observacion    NVARCHAR(500)    NULL,
    usuarioId      UNIQUEIDENTIFIER NOT NULL,
    requestId      NVARCHAR(100)    NULL,
    fecha          DATETIME2(3)     NOT NULL CONSTRAINT DF_HistorialCredito_fecha DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_HistorialCredito PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_HistorialCredito_creditoId FOREIGN KEY (creditoId) REFERENCES dbo.Creditos (id),
    CONSTRAINT FK_HistorialCredito_usuarioId FOREIGN KEY (usuarioId) REFERENCES dbo.Usuarios (id),
    CONSTRAINT CK_HistorialCredito_estadoAnterior CHECK (
        estadoAnterior IN (N'SOLICITADO', N'EN_ESTUDIO', N'APROBADO', N'RECHAZADO', N'DESEMBOLSADO', N'CANCELADO')
    ),
    CONSTRAINT CK_HistorialCredito_estadoNuevo CHECK (
        estadoNuevo IN (N'SOLICITADO', N'EN_ESTUDIO', N'APROBADO', N'RECHAZADO', N'DESEMBOLSADO', N'CANCELADO')
    ),
    -- Sin estado anterior solo en la creación (NULL → SOLICITADO).
    CONSTRAINT CK_HistorialCredito_creacion CHECK (estadoAnterior IS NOT NULL OR estadoNuevo = N'SOLICITADO'),
    -- Rechazar y cancelar exigen motivo. El IS NOT NULL es necesario: un CHECK que evalúa
    -- a UNKNOWN (LEN de NULL) se considera cumplido.
    CONSTRAINT CK_HistorialCredito_observacion CHECK (
        estadoNuevo NOT IN (N'RECHAZADO', N'CANCELADO')
        OR (observacion IS NOT NULL AND LEN(LTRIM(observacion)) > 0)
    )
);

CREATE NONCLUSTERED INDEX IX_HistorialCredito_creditoId_fecha
    ON dbo.HistorialCredito (creditoId, fecha);

CREATE TABLE dbo.CambiosCredito (
    id            BIGINT IDENTITY(1, 1) NOT NULL,
    operacionId   UNIQUEIDENTIFIER NOT NULL,   -- agrupa los campos de una misma edición
    creditoId     UNIQUEIDENTIFIER NOT NULL,
    campo         NVARCHAR(50)     NOT NULL,
    valorAnterior NVARCHAR(200)    NULL,
    valorNuevo    NVARCHAR(200)    NULL,
    motivo        NVARCHAR(500)    NULL,
    usuarioId     UNIQUEIDENTIFIER NOT NULL,
    requestId     NVARCHAR(100)    NULL,
    fecha         DATETIME2(3)     NOT NULL CONSTRAINT DF_CambiosCredito_fecha DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_CambiosCredito PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_CambiosCredito_creditoId FOREIGN KEY (creditoId) REFERENCES dbo.Creditos (id),
    CONSTRAINT FK_CambiosCredito_usuarioId FOREIGN KEY (usuarioId) REFERENCES dbo.Usuarios (id),
    CONSTRAINT CK_CambiosCredito_campo CHECK (
        campo IN (N'tipoCredito', N'valorSolicitado', N'tasaInteres', N'numeroCuotas', N'formaPago', N'fechaEliminacion')
    ),
    -- El borrado lógico exige motivo.
    CONSTRAINT CK_CambiosCredito_motivo CHECK (
        campo <> N'fechaEliminacion'
        OR (motivo IS NOT NULL AND LEN(LTRIM(motivo)) > 0)
    )
);

CREATE NONCLUSTERED INDEX IX_CambiosCredito_creditoId_fecha
    ON dbo.CambiosCredito (creditoId, fecha);

-- Eventos de seguridad (ADR 0016): sesiones, accesos denegados y gestión de usuarios.
-- usuarioId es quién hizo la acción; usuarioAfectadoId, a quién se le hizo.
CREATE TABLE dbo.EventosSeguridad (
    id                BIGINT IDENTITY(1, 1) NOT NULL,
    tipoEvento        NVARCHAR(30)     NOT NULL,
    usuarioId         UNIQUEIDENTIFIER NULL,
    usuarioAfectadoId UNIQUEIDENTIFIER NULL,
    sesionId          BIGINT           NULL,
    correoIntentado   NVARCHAR(254)    NULL,   -- login fallido: señal de enumeración de cuentas
    ruta              NVARCHAR(200)    NULL,   -- acceso denegado
    detalle           NVARCHAR(200)    NULL,   -- qué cambió, p. ej. "ANALISTA → ADMIN"
    ip                NVARCHAR(45)     NOT NULL,
    userAgent         NVARCHAR(300)    NULL,
    requestId         NVARCHAR(100)    NULL,
    fecha             DATETIME2(3)     NOT NULL CONSTRAINT DF_EventosSeguridad_fecha DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_EventosSeguridad PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_EventosSeguridad_usuarioId FOREIGN KEY (usuarioId) REFERENCES dbo.Usuarios (id),
    CONSTRAINT FK_EventosSeguridad_usuarioAfectadoId FOREIGN KEY (usuarioAfectadoId) REFERENCES dbo.Usuarios (id),
    CONSTRAINT FK_EventosSeguridad_sesionId FOREIGN KEY (sesionId) REFERENCES dbo.Sesiones (id),
    CONSTRAINT CK_EventosSeguridad_tipoEvento CHECK (
        tipoEvento IN (N'LOGIN_EXITOSO', N'LOGIN_FALLIDO', N'LOGOUT', N'REFRESH', N'REFRESH_REUTILIZADO',
                       N'SESION_REEMPLAZADA', N'ACCESO_DENEGADO', N'USUARIO_CREADO', N'USUARIO_DESACTIVADO',
                       N'USUARIO_ACTIVADO', N'USUARIO_ROL_CAMBIADO', N'CONTRASENA_CAMBIADA')
    )
);

CREATE NONCLUSTERED INDEX IX_EventosSeguridad_usuarioId_fecha
    ON dbo.EventosSeguridad (usuarioId, fecha);

CREATE NONCLUSTERED INDEX IX_EventosSeguridad_tipoEvento_fecha
    ON dbo.EventosSeguridad (tipoEvento, fecha);

/* ───────────── Webhook: outbox y traza ───────────── */

CREATE TABLE dbo.WebhookEventos (
    id             BIGINT IDENTITY(1, 1) NOT NULL,
    eventId        UNIQUEIDENTIFIER NOT NULL,   -- lo genera la API: va dentro del payload
    tipoEvento     NVARCHAR(50)     NOT NULL,
    creditoId      UNIQUEIDENTIFIER NOT NULL,
    payload        NVARCHAR(MAX)    NOT NULL,   -- snapshot exacto del cuerpo a enviar
    estado         NVARCHAR(20)     NOT NULL CONSTRAINT DF_WebhookEventos_estado DEFAULT (N'PENDIENTE'),
    intentos       SMALLINT         NOT NULL CONSTRAINT DF_WebhookEventos_intentos DEFAULT (0),
    proximoIntento DATETIME2(3)     NOT NULL CONSTRAINT DF_WebhookEventos_proximoIntento DEFAULT (SYSUTCDATETIME()),
    requestId      NVARCHAR(100)    NULL,
    fechaCreacion  DATETIME2(3)     NOT NULL CONSTRAINT DF_WebhookEventos_fechaCreacion DEFAULT (SYSUTCDATETIME()),
    fechaEntrega   DATETIME2(3)     NULL,
    CONSTRAINT PK_WebhookEventos PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UX_WebhookEventos_eventId UNIQUE (eventId),
    CONSTRAINT FK_WebhookEventos_creditoId FOREIGN KEY (creditoId) REFERENCES dbo.Creditos (id),
    CONSTRAINT CK_WebhookEventos_tipoEvento CHECK (tipoEvento IN (N'credito.creado')),
    CONSTRAINT CK_WebhookEventos_payload CHECK (ISJSON(payload) = 1),
    CONSTRAINT CK_WebhookEventos_estado CHECK (estado IN (N'PENDIENTE', N'ENTREGADO', N'FALLIDO'))
);

-- Lo que lee el worker: eventos pendientes cuyo próximo intento ya llegó.
CREATE NONCLUSTERED INDEX IX_WebhookEventos_pendientes
    ON dbo.WebhookEventos (proximoIntento)
    WHERE estado = N'PENDIENTE';

CREATE TABLE dbo.WebhookIntentos (
    id            BIGINT IDENTITY(1, 1) NOT NULL,
    eventoId      BIGINT           NOT NULL,
    numeroIntento SMALLINT         NOT NULL,
    resultado     NVARCHAR(20)     NOT NULL,
    statusHttp    SMALLINT         NULL,
    duracionMs    INT              NULL,
    error         NVARCHAR(1000)   NULL,
    fecha         DATETIME2(3)     NOT NULL CONSTRAINT DF_WebhookIntentos_fecha DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_WebhookIntentos PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UX_WebhookIntentos_evento_numero UNIQUE (eventoId, numeroIntento),
    CONSTRAINT FK_WebhookIntentos_eventoId FOREIGN KEY (eventoId) REFERENCES dbo.WebhookEventos (id),
    CONSTRAINT CK_WebhookIntentos_resultado CHECK (resultado IN (N'EXITOSO', N'ERROR_HTTP', N'TIMEOUT', N'ERROR_RED'))
);
GO

/* ───────────── Inmutabilidad ─────────────
   Dos capas: el login de la app no tiene UPDATE ni DELETE sobre estas tablas (ver permisos),
   y estos triggers rechazan UPDATE y DELETE incluso a un administrador. */

CREATE TRIGGER dbo.TR_HistorialCredito_inmutable
    ON dbo.HistorialCredito
    INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50001, N'HistorialCredito es inmutable: no admite UPDATE ni DELETE.', 1;
END;
GO

CREATE TRIGGER dbo.TR_CambiosCredito_inmutable
    ON dbo.CambiosCredito
    INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50002, N'CambiosCredito es inmutable: no admite UPDATE ni DELETE.', 1;
END;
GO

CREATE TRIGGER dbo.TR_WebhookIntentos_inmutable
    ON dbo.WebhookIntentos
    INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50003, N'WebhookIntentos es inmutable: no admite UPDATE ni DELETE.', 1;
END;
GO

CREATE TRIGGER dbo.TR_EventosSeguridad_inmutable
    ON dbo.EventosSeguridad
    INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50004, N'EventosSeguridad es inmutable: no admite UPDATE ni DELETE.', 1;
END;
GO

/* ───────────── Permisos del login de la app ─────────────
   Mínimo privilegio: lee, inserta y actualiza, pero no borra en ninguna tabla (todo borrado es
   lógico) ni actualiza las tablas de auditoría. */

GRANT SELECT, INSERT, UPDATE ON SCHEMA::dbo TO appCreditos;
DENY UPDATE ON dbo.HistorialCredito TO appCreditos;
DENY UPDATE ON dbo.CambiosCredito TO appCreditos;
DENY UPDATE ON dbo.WebhookIntentos TO appCreditos;
DENY UPDATE ON dbo.EventosSeguridad TO appCreditos;

-- Datos del crédito que nunca cambian después de crearlo: ni un error de la API puede modificarlos.
-- numeroCredito no necesita DENY, porque es una columna calculada.
DENY UPDATE ON dbo.Creditos (asociadoId, fechaSolicitud) TO appCreditos;
GO

COMMIT TRANSACTION;
GO
