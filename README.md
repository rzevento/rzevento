# Registro de evento RZ

SPA para invitaciones, confirmaciones y registro de entrada del evento **Familias empresarias en la era de las turbulencias: retos y oportunidades**.

## Stack

- React + Vite
- TanStack Router y TanStack Query
- Supabase (Postgres, Auth y RLS)
- Vercel como hosting estático

No se usa SSR ni Server Components. La aplicación se publica como una SPA; `vercel.json` redirige las rutas internas a `index.html` para que funcionen al recargar.

## Desarrollo

```bash
npm install
cp .env.example .env.local
npm run dev
```

Las variables públicas son `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. La clave `service_role` o cualquier clave secreta nunca debe entrar al frontend. Para revisar el panel sin Supabase, define una contraseña local en `VITE_ORGANIZER_PASSWORD`; no se incluye una contraseña por defecto.

## Supabase

Ejecutar `supabase/migrations/0001_event_registration.sql` en el proyecto de Supabase. La migración crea eventos, invitados, invitaciones, respuestas, cancelaciones, check-in, miembros y bitácora de actividad, junto con RLS y la función pública segura `submit_rsvp`. Después ejecutar `supabase/seed.sql` para cargar los datos de esta invitación.

La interfaz pública funciona con datos demo cuando no hay variables de Supabase configuradas. El panel de organizador sigue protegido por `VITE_ORGANIZER_PASSWORD` en ese modo. Con Supabase, el acceso usa `signInWithPassword` y las filas de `event_members.user_id` deben contener el mismo UUID que `auth.users.id` del organizador; ese es el `auth id` que también usa RLS mediante `auth.uid()`.

El enlace individual también permite cancelar una confirmación; la operación se registra como `cancelled` y deja una entrada en `activity_log`.

## Importar invitados

Desde `Admin > Invitados > Importar CSV` se acepta una lista con encabezados `nombre`, `correo`, `telefono`, `empresa` y `ciudad` (también reconoce sus equivalentes en inglés). En producción, cada fila se guarda en el evento activo y crea un token de invitación por persona.

## Invitaciones manuales por WhatsApp

Antes de publicar esta versión, aplicar en Supabase la migración
`supabase/migrations/20260929132423_manual_whatsapp_invitations.sql` después de las migraciones existentes.
Agrega `invitations.whatsapp_sent_at` y la función `mark_whatsapp_invitation_sent`, que conserva la primera fecha del servidor y respeta las políticas RLS de las invitaciones. No cambia `status` ni `sent_at`, que siguen correspondiendo al correo.

En `Admin > Invitados`, cada invitación muestra Correo y WhatsApp por separado:

1. Pulsa **Abrir WhatsApp** para abrir el mensaje con el enlace personal `/registro/{token}`.
2. Envía el mensaje dentro de WhatsApp.
3. Regresa y pulsa **Marcar WhatsApp enviado**. Se guarda la fecha y hora, que también se incluye en la exportación CSV.

Abrir el enlace nunca registra el envío. La marca manual no acredita entrega, lectura ni confirmación de asistencia.
Se aceptan celulares mexicanos de 10 dígitos (se agrega 52) y números internacionales con `+` y código de país.
Configura `VITE_PUBLIC_SITE_URL` con la URL publicada para trabajar desde un dominio de desarrollo; de lo contrario se usa el dominio actual. No se generan enlaces compartibles hacia localhost.
En modo demo la marca es temporal y no se abren mensajes reales.

El correo se envía a través de Make con la función `send-invitation`. Configura los secretos `MAKE_WEBHOOK_URL`, `MAKE_WEBHOOK_API_KEY` y `PUBLIC_SITE_URL` en Supabase y publica la función actualizada. Los controles manuales de WhatsApp no requieren Make ni Meta Business.

Guía de configuración: [Make para correos](docs/make-email.md).

Pruebas de enlaces (Node 22.6+): `node --experimental-strip-types --test tests/invitations.test.ts`.

Pruebas del envío (Make y Supabase simulados, sin correos reales): `node --test tests/send-invitation.test.mjs`.
