# CB Studios Bot

Bot administrativo oficial del servidor de Discord de **CB Studios**. Incluye moderación, tickets, anuncios, autoroles, salas de voz temporales, bienvenida, registros y monitorización del equipo donde se ejecuta.

Este documento explica qué hace el bot, qué decisiones debes tomar y cómo ponerlo en funcionamiento.

## Decisiones antes de usarlo

1. **Entorno:** usa `development` mientras configuras y pruebas; cambia a `production` cuando esté listo.
2. **Rangos:** decide qué roles representarán a Founder, Administrator, Developer, Support, Customer y Member.
3. **Canales:** elige dónde irán bienvenidas, anuncios, tickets, paneles y cada tipo de registro.
4. **Módulos:** decide si activarás bienvenidas, despedidas, moderación, logs de mensajes, seguridad y mensajes privados de bienvenida.
5. **Message Content:** mantenlo apagado salvo que necesites leer el contenido de mensajes.
6. **System Monitor:** actívalo solo si quieres publicar el estado abstracto del servicio y ofrecer métricas privadas al personal autorizado.
7. **Salas temporales:** decide qué canales serán generadores PUBLIC, SUPPORT y STAFF, dónde crearán salas y quién podrá administrarlas.

Configuración recomendada para empezar: desarrollo, monitor VPS apagado, Message Content apagado y comandos registrados solamente en el servidor de pruebas.

## Requisitos e instalación

- Windows 10/11 o Windows Server.
- Node.js 20 o superior y npm.
- Una aplicación propia en Discord Developer Portal.

```powershell
npm.cmd install
npm.cmd run db:migrate
npm.cmd run build
```

## Configuración de `.env`

El archivo `.env` ya está creado y excluido de Git. Nunca compartas `DISCORD_TOKEN` ni publiques el archivo completo.

Variables obligatorias en desarrollo:

```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
```

- `DISCORD_TOKEN`: token secreto del bot.
- `DISCORD_CLIENT_ID`: Application ID de la aplicación.
- `DISCORD_GUILD_ID`: ID del servidor de desarrollo.

Opciones generales:

```env
DATABASE_PATH=./data/cb_studios_bot.sqlite
NODE_ENV=development
LOG_LEVEL=info
COMMAND_DEPLOYMENT_MODE=guild
BOT_PRESENCE=CB Studios
ENABLE_MESSAGE_CONTENT_INTENT=false
ENABLE_SYSTEM_MONITOR=false
STATUS_DEFAULT_INTERVAL_SECONDS=300
STATUS_PUBLIC_CPU_WARN=85
STATUS_PUBLIC_RAM_WARN=85
STATUS_PUBLIC_DISK_WARN=90
```

En producción cambia `NODE_ENV=production`, pero conserva `COMMAND_DEPLOYMENT_MODE=guild` para CB Studios. Los comandos solo se vuelven globales si eliges explícitamente `COMMAND_DEPLOYMENT_MODE=global`; ese modo requiere una decisión consciente porque la propagación puede tardar y el bot actualmente es single-guild.

## Arranque en Windows

- `start.bat`: inicia el bot en segundo plano y evita duplicados.
- `status.bat`: muestra si está activo, su PID y el tiempo de ejecución.
- `stop.bat`: detiene únicamente la instancia registrada.
- `deploy-commands.bat`: registra o actualiza comandos slash.
- `test.bat`: ejecuta migraciones, compilación, lint y pruebas.

Primera puesta en marcha:

```text
1. Completar .env
2. Ejecutar deploy-commands.bat
3. Ejecutar start.bat
4. Comprobar status.bat
5. Configurar el servidor con /config
```

Los logs están en `logs/cb_studios_bot.log`. La salida del proceso se guarda en `logs/bot-output.log` y `logs/bot-error.log`.

## Rangos y acceso

```text
Founder > Administrator > Developer > Support > Customer > Member
```

El propietario real del servidor se reconoce como Founder. Server Booster y Bots son roles organizativos y no conceden acceso administrativo. Los permisos no son totalmente acumulativos: Developer no recibe las herramientas de Support automáticamente.

| Rango | Acceso actual |
| --- | --- |
| Member | Información, estado público y control de su sala temporal |
| Customer | Igual que Member |
| Support | Comandos públicos y gestión de tickets |
| Developer | Comandos públicos y diagnóstico técnico seguro con `/dev` |
| Administrator | Configuración, moderación, tickets, anuncios, roles, voz y monitorización |
| Founder | Todo lo anterior y operaciones internas reservadas |

Discord también exige permisos nativos. El bot no puede administrar miembros o roles situados por encima de su propio rol.

## Comandos públicos

- `/help`: muestra los comandos disponibles para el usuario.
- `/bot-info`: estado, versión y tiempo activo.
- `/server-info`: información del servidor.
- `/user-info [usuario]`: información de un usuario.
- `/role-info rol`: información de un rol.
- `/channel-info canal`: información de un canal.
- `/status [detalle:publico]`: estado abstracto (`Operational`, `Degraded` o `Unavailable`) sin CPU, RAM, disco ni datos del host.
- `/voice-help`: ayuda del sistema de voz.
- `/voice-bot-info`: estado del sistema de voz.
- `/voice`: gestiona la sala temporal propia con `info`, `name`, `limit`, `lock`, `unlock`, `private`, `public`, `permit`, `block`, `unblock`, `kick`, `transfer` y `delete`.

## Comandos de Developer

- `/dev status`: versión, entorno, uptime, latencia, salud de SQLite, build, memoria del proceso y resumen de voz.
- `/dev modules`: estado enabled/disabled de los módulos, sin IDs ni secretos.
- `/dev health`: comprobaciones internas no destructivas.

Developer no hereda tickets, moderación ni configuración administrativa. Las respuestas son privadas y nunca incluyen `.env`, tokens, rutas internas o stack traces.

## Comandos de Support

- `/ticket claim`: reclama el ticket actual.
- `/ticket close [motivo]`: cierra el ticket.
- `/ticket reopen`: reabre el ticket.
- `/ticket transcript`: genera un archivo HTML con datos del ticket, participantes y hasta 100 mensajes recientes; registra el evento en el log de tickets.

Support puede cerrar y reabrir tickets, pero no publicar el panel ni eliminar canales.

Categorías incluidas actualmente:

- General Support
- Customer Support
- Technical Support
- Bug Report
- Purchase Question
- Development Inquiry
- Partnership
- Other

`customer_role_id` queda disponible para futuras reglas de Customer Support, pero todavía no existe integración con compras, licencias o CB Members.

## Comandos de Administrator y Founder

### Configuración

- `/config channel|role|toggle`: asigna canales, roles internos y módulos. Cambiar `founder_role_id` o `administrator_role_id` requiere Founder.
- `/config presence`: cambia la presencia guardada.
- `/config role-panel`: enlaza el panel de personalización.
- `/config status-thresholds`: cambia alertas de CPU, RAM y disco.
- `/config show`: muestra la configuración.

`/config show` utiliza estados `configured`, `not configured`, `enabled` y `disabled`. Puede mostrar IDs de Discord a Administrator/Founder, pero nunca lee ni presenta secretos del `.env`.

### Moderación

- `/warn add|remove` y `/warnings`: administra advertencias.
- `/timeout` y `/untimeout`: aplica o retira aislamiento.
- `/kick`, `/ban` y `/unban`: expulsiones y bloqueos.
- `/purge`: elimina entre 1 y 100 mensajes.
- `/slowmode`: configura el modo lento.
- `/lock` y `/unlock`: bloquea o restaura la escritura.
- `/nickname`: cambia o elimina apodos.
- `/role add|remove`: administra roles respetando la jerarquía.
- `/case`: consulta un caso como `CB-000042`.
- `/user-history`: consulta el historial de un usuario.

### Anuncios y paneles

- `/announce`: previsualiza y confirma un anuncio antes de publicarlo.
- `/embed create|send|delete`: administra plantillas.
- `/roles-panel seed|preview|regenerate-palettes|publish|list`: prepara y publica el panel.
- `/roles-panel option-add|option-remove|option-enable`: administra sus opciones.
- `/ticket panel`: publica o actualiza la entrada estructural de tickets.
- `/ticket delete`: elimina definitivamente un canal tras confirmación.

El panel de autoroles rechaza Founder, Administrator, Developer, Support, Customer, Member, Bots, Server Booster, roles managed, el rol del bot y roles fuera de su jerarquía. Solo publica opciones guardadas explícitamente. El banner de `assets/branding` se utiliza en bienvenidas, anuncios, tickets y paneles compatibles.

### Voz administrativa

- `/voice-config channel|settings|show`: configura el sistema.
- `/voice-config role`: configura roles de voz; requiere Founder.
- `/voice-generator create|edit|delete|list|info|enable|disable`: administra generadores.
- `/voice-admin info|transfer|delete|cleanup|reconcile|refresh-permissions|stats`: administra salas temporales.

Tipos recomendados de generador: PUBLIC (`🔊│general`), SUPPORT (`🎫│support`) y STAFF (`🛡️│staff`). Los nombres no son requisitos funcionales ni se usan como IDs. SUPPORT utiliza los roles configurados de soporte/administración; STAFF queda limitado al personal autorizado. Los propietarios solo reciben controles sobre su propia sala.

### Monitorización

- `/status detalle:admin`: métricas privadas del host; requiere Administrator o Founder.
- `/status-channel`: configura el canal público.
- `/status-loop activar|apagar|publicar|ver`: administra publicaciones automáticas.

El monitor está apagado por defecto. Cuando está deshabilitado, sus comandos responden de forma controlada y no intentan recopilar o publicar métricas. Las publicaciones automáticas utilizan siempre el embed público sanitizado.

## Opciones de configuración del servidor

Claves para `/config channel`:

- `welcome_channel_id`, `rules_channel_id`, `announcements_channel_id`
- `moderation_log_channel_id`, `member_log_channel_id`, `message_log_channel_id`
- `role_log_channel_id`, `channel_log_channel_id`, `ticket_log_channel_id`
- `security_log_channel_id`, `bot_log_channel_id`, `voice_log_channel_id`
- `role_panel_channel_id`, `support_alert_channel_id`, `ticket_category_id`

Claves para `/config role`:

- `member_role_id`, `customer_role_id`, `support_role_id`
- `developer_role_id`, `administrator_role_id`, `founder_role_id`
- `server_booster_role_id`, `bots_role_id`

Módulos para `/config toggle`:

- `welcome_enabled`: bienvenida pública y autorol Member.
- `goodbye_enabled`: eventos de salida.
- `moderation_enabled`: moderación.
- `message_logs_enabled`: registros de mensajes.
- `security_enabled`: seguridad.
- `welcome_dm_enabled`: bienvenida por mensaje privado.

El autorol utiliza `member_role_id`; el rol del bot debe estar por encima para poder asignarlo.

## Decisiones manuales pendientes

Antes de considerar el servidor listo para producción, debes decidir y configurar:

- Los roles exactos para Founder, Administrator, Developer, Support, Customer y Member.
- Los canales de bienvenida, reglas, anuncios y cada clase de log.
- La categoría y el canal del panel de tickets.
- Si activarás mensajes privados de bienvenida y logs de mensajes.
- Si necesitas System Monitor y qué umbrales utilizarás.
- Los tres generadores de voz y sus categorías PUBLIC, SUPPORT y STAFF.
- Las opciones cosméticas permitidas en el panel de autoroles.
- Si el despliegue continuará siendo `guild` —recomendado— o se hará global en el futuro.

No asignes manualmente Server Booster mediante `/role`; Discord continúa siendo la fuente de verdad. `bots_role_id` tampoco concede permisos administrativos a otras aplicaciones.

## Intents y permisos de Discord

Intents: Guilds, GuildMembers, GuildModeration y GuildMessages. Message Content solo se solicita con `ENABLE_MESSAGE_CONTENT_INTENT=true` y también debe activarse en Developer Portal.

Scopes OAuth: `bot` y `applications.commands`.

Permisos recomendados:

- View Channels, Send Messages, Embed Links y Attach Files.
- Read Message History y Use Application Commands.
- Manage Messages, Moderate Members, Kick Members y Ban Members.
- Manage Roles, Manage Channels y Manage Nicknames.

No es obligatorio conceder `Administrator`. Es más seguro usar solo los permisos necesarios y colocar el rol del bot por encima de los roles administrados.

## Datos y copias de seguridad

La base es `data/cb_studios_bot.sqlite`. Usa SQLite con WAL, claves foráneas y migraciones explícitas.

Para una copia consistente:

1. Ejecuta `stop.bat`.
2. Copia el archivo SQLite y los archivos `-wal` o `-shm` presentes.
3. Guarda la copia fuera del proyecto.
4. Ejecuta `start.bat`.

`.env`, la base, los logs y `bot.pid` están excluidos del repositorio.

## Diagnóstico

- **No inicia:** completa las tres variables obligatorias y revisa `logs/cb_studios_bot.log`.
- **No aparecen comandos:** ejecuta `deploy-commands.bat` y revisa Client ID y Guild ID.
- **Un rango no ve un comando:** revisa `/config role`, permisos de Discord y redespliega.
- **Falla una moderación:** coloca el rol del bot por encima del objetivo.
- **No hay bienvenida:** configura canal, `member_role_id` y `welcome_enabled`.
- **No aparece el banner:** verifica `assets/branding/cbstudios-banner.png`.
- **No funciona el monitor:** activa `ENABLE_SYSTEM_MONITOR=true`, reinicia y configura el canal.
- **SQLite está bloqueado:** usa `status.bat` para comprobar otra instancia.

Validación completa:

```powershell
test.bat
```

## Estado de la auditoría final

La última validación local completó correctamente:

- Migraciones SQLite.
- Compilación TypeScript.
- ESLint sin errores ni warnings.
- 156 tests aprobados en 19 archivos.

Se verificaron explícitamente la separación Support/Developer, las operaciones Founder-only, el bloqueo de escalamiento por roles, el estado público sanitizado, PUBLIC/SUPPORT/STAFF en voz y la ausencia de secretos en las respuestas técnicas.

Queda deliberadamente fuera de esta fase: integración con CB Members, compras, productos, licencias, beneficios Customer/Booster, comandos mutables para Developer y transcripts históricos de más de 100 mensajes.
