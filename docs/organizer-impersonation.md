# Ver como usuario

Implementación preparada, pendiente de aprobación para activar en producción.

- Solo un administrador real del evento puede iniciar una sesión para otro miembro de ese mismo evento.
- La sesión dura 30 minutos. La franja superior muestra el nombre, el perfil, que los cambios se guardan y el botón para volver.
- Se conserva la autenticación del administrador; la identidad efectiva se valida en PostgreSQL, incluyendo pertenencia, rol vigente, evento, sesión de autenticación y vencimiento.
- Se mantienen los permisos actuales de RZ. No se redefinen los roles Equipo y Consulta. El envío de correo y la gestión de miembros exigen un administrador efectivo.
- El historial conserva administrador real, usuario efectivo, sesión, tabla y operación. Los intentos de correo se registran antes de llamar a Make.
- El identificador solo vive en la pestaña. Recargar o salir del panel devuelve a la cuenta real; las sesiones sin uso vencen automáticamente.
- Las acciones en curso impiden cambiar de usuario. Las respuestas de una vista anterior no pueden poblar la nueva vista.

## Validación

`node --test tests/*.test.mjs tests/*.test.ts` — 44 pruebas.

`npm run build` — compilación correcta.

La suite `tests/impersonation.database.mjs` aplica las migraciones en PostgreSQL aislado (PGlite), con usuarios y sesiones ficticios. Valida denegación a no administradores y anónimos, eventos distintos, identidad efectiva, auditoría, sesión robada o de otro inicio de sesión, vencimiento, revocación del administrador, eliminación del miembro y regreso a la identidad real.

Para ejecutarla, instalar `@electric-sql/pglite@0.3.14` en una carpeta temporal y usar:

```sh
PGLITE_MODULE=/ruta/temporal/node_modules/@electric-sql/pglite/dist/index.js node tests/impersonation.database.mjs
```

Se verificó en navegador local: entrada como Equipo, ausencia de los controles exclusivos de administrador, registro de llegada de un invitado ficticio y regreso a la cuenta real. Las pruebas no enviaron correos ni modificaron invitados reales.

## Activación pendiente

1. Aplicar exclusivamente `supabase/migrations/20261002001902_organizer_impersonation.sql` al proyecto RZ `klhonixkiveafbuqaqim`.
2. Validar el contexto del organizador y los asesores de seguridad.
3. Desplegar `supabase/functions/send-invitation/index.ts`, manteniendo `verify_jwt=true`.
4. Publicar el frontend y verificar el control en `/admin`.

La revisión automática rechazó la migración de producción por requerir aprobación explícita del cambio concreto de autorización y auditoría. No fue aplicada. Actualmente el evento tiene un solo miembro; el selector requiere otro usuario asociado para una prueba real entre cuentas.
