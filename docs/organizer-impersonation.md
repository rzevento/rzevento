# Ver como usuario

Acceso temporal para que el administrador actúe con el perfil de otro miembro del mismo evento.

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

## Orden de publicación

1. Aplicar exclusivamente `supabase/migrations/20261002004914_organizer_impersonation.sql` al proyecto RZ `klhonixkiveafbuqaqim`.
2. Validar el contexto del organizador y los asesores de seguridad.
3. Desplegar `supabase/functions/send-invitation/index.ts`, manteniendo `verify_jwt=true`.
4. Publicar el frontend y verificar el control en `/admin`.

El usuario autorizó explícitamente la activación en producción el 1 de octubre de 2026. La migración y la versión 6 de la función de envío se activaron con verificación JWT. La consulta posterior confirmó el contexto de administrador, el bloqueo de acceso anónimo a la impersonación y la privacidad de la tabla de sesiones; se conservaron los 157 invitados y el único miembro existente. El selector necesita otro usuario asociado para realizar una prueba real entre cuentas.

El asesor de seguridad informa que la tabla privada no tiene políticas: es intencional, porque el acceso directo está revocado y solo las funciones autorizadas pueden consultarla. Véase [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Los avisos sobre funciones públicas de registro y [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) corresponden a la configuración existente y no se modificaron en este cambio.
