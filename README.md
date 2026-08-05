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
