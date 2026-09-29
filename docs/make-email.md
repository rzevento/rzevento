# Configurar Make para enviar invitaciones por correo

WhatsApp se envía manualmente desde el panel. Make solo necesita este escenario:

**Custom webhook → Send an email → Webhook response**

## 1. Crear el escenario

En Make, abre **Scenarios → Create a new scenario**. Nómbralo **RZeventos - Enviar correo**.

## 2. Crear el webhook

Agrega **Webhooks → Custom webhook → Add** y usa el nombre `rz_enviar_correo`.
Activa **API Key authentication**, crea una clave y guárdala de forma segura junto con la URL generada. La integración enviará la clave en el encabezado `x-make-apikey`.

## 3. Definir los campos

En **Advanced settings → Data structure**, define los siguientes campos de texto:

| Campo | Contenido |
|---|---|
| `invitation_id` | ID de la invitación |
| `guest_name` | Nombre del invitado; usar “invitado” si falta |
| `email` | Correo del destinatario |
| `invitation_url` | URL publicada con el token personal |

También puedes usar **Run once** y una petición de prueba para detectarlos. Este ejemplo describe el contrato propuesto; los identificadores y la URL deben sustituirse por valores reales en la prueba integrada:

```json
{
  "invitation_id": "ID_REAL",
  "guest_name": "Ana",
  "email": "TU_CORREO_DE_PRUEBA",
  "invitation_url": "https://TU-DOMINIO/registro/TOKEN_REAL"
}
```

## 4. Conectar el correo

Si la cuenta remitente usa Gmail o Google Workspace, agrega **Gmail → Send an email → Create a connection** e inicia sesión con esa cuenta. Si utiliza otro proveedor, usa su módulo de correo equivalente.

| Campo | Configuración |
|---|---|
| To | Seleccionar `email` del webhook |
| Subject | `Tu invitación · Familias empresarias` |
| Body type | `Collection of contents` |
| Body contents | Texto de abajo, insertando nombre y enlace desde el selector de Make |

> Hola, [guest_name]:
>
> Te invitamos a Familias empresarias en la era de las turbulencias: retos y oportunidades.
>
> Consulta los detalles y confirma tu asistencia aquí:
> [invitation_url]
>
> Esta invitación es personal e intransferible.
>
> RZ Eventos

Los corchetes son referencias para insertar los campos dinámicos; no dejarlos como texto literal. Envía un mensaje por invitado, con su propio enlace.

## 5. Devolver el resultado

Después del módulo de correo agrega **Webhooks → Webhook response**:

- Status: `200`
- Body: `{"ok":true}`
- Custom headers: `Content-Type` = `application/json`

La respuesta debe ejecutarse después del envío exitoso. No configures una ruta de error que responda `ok: true`. El `Accepted` predeterminado de Make solo acredita recepción en la cola, no envío.

## 6. Guardar y probar

Guarda el escenario. Cuando esté conectada la función de Supabase, pulsa **Run once** y envía una invitación a tu propio correo. Comprueba la recepción, que el enlace funciona y que el panel registra el correo como enviado. Después activa el escenario para procesar solicitudes al webhook.

## Publicar la conexión con Supabase

La función `supabase/functions/send-invitation/index.ts` ya utiliza Make. En Supabase, crea o edita la Edge Function llamada exactamente `send-invitation`, sustituye todo el contenido de `index.ts` por el archivo del repositorio y pulsa Deploy. Conserva la verificación JWT habilitada; además, el código valida la sesión y el rol de administrador del evento.

La función envía los campos anteriores a Make y exige un JSON con `ok: true` antes de actualizar el correo. No vuelve a enviar una invitación que ya tiene `sent_at` o estado `sent`. Esto no constituye una cola ni garantiza exclusión entre dos solicitudes simultáneas; no ejecutar envíos concurrentes para el mismo invitado.

Si la conexión se interrumpe, la respuesta es `Accepted`, hay un error o se agota la espera de 25 segundos, no se marca como enviado. Revisa el historial de Make antes de volver a pulsar Enviar: el escenario podría haber continuado. Si el correo salió pero falló el guardado en Supabase, reconcilia su estado antes de reintentar.

Prueba desde el panel de RZeventos con sesión de administrador y tu propio correo, con Make en Run once. El botón Test de Supabase no sustituye la sesión de usuario que requiere esta función. Después activa el escenario de Make.

La URL y clave del webhook deben guardarse en secretos de Supabase como `MAKE_WEBHOOK_URL` y `MAKE_WEBHOOK_API_KEY`; nunca en variables `VITE_*`. `PUBLIC_SITE_URL` debe apuntar al dominio publicado. No compartas claves en el repositorio.

WhatsApp tiene un control separado: abrir el mensaje, enviarlo manualmente y pulsar **Marcar WhatsApp enviado**. No necesita Router, conexión con Meta ni un módulo de WhatsApp en Make.

## Documentación oficial

- [Webhooks y respuestas en Make](https://apps.make.com/gateway)
- [Módulos de Gmail](https://apps.make.com/gmail-modules)
- [Secretos de Supabase](https://supabase.com/docs/guides/functions/secrets)

## Correo de GoDaddy utilizado en este proyecto

En lugar de Gmail, usa **Email → Send an Email** con **Others (SMTP)**. Configura `smtpout.secureserver.net`, puerto `465`, conexión segura activada y STARTTLS explícito desactivado. Usa como usuario la dirección completa del buzón y su contraseña (o la contraseña de aplicación, si la cuenta la requiere). El destinatario es `{{1.email}}`; el contenido HTML utiliza `{{1.guest_name}}` y `{{1.invitation_url}}`. Comprueba que Make reconozca los campos como variables.

[Configuración oficial de GoDaddy](https://www.godaddy.com/en-ca/help/use-imap-settings-to-add-my-professional-email-to-a-client-32204).
