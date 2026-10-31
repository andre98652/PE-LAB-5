# Instalación y conexión — Barrio Limpio

Esta guía prepara un proyecto Supabase nuevo y la aplicación móvil. Ejecutar la migración y crear cuentas son pasos pendientes hasta disponer del proyecto del usuario.

## 1. Preparar Supabase

1. Abrir el proyecto `barrio-limpio` en el panel de Supabase. Mantener la organización en Free.
2. Entrar a **SQL Editor**, crear una consulta y copiar el contenido completo de `supabase/migrations/202610310001_barrio_limpio.sql`.
3. Ejecutar una sola vez en el proyecto nuevo. El script es transaccional: si hay un error, no deja una instalación parcial. No volver a ejecutarlo si ya terminó correctamente; no es un script de reinicio ni borra tablas anteriores.
4. Comprobar que existen las tablas `profiles`, `reference_points`, `incidents` y `notifications`, entre otras, y el bucket privado `evidencias`.

El script incluye tres puntos ficticios marcados DEMO. Se pueden cambiar administrativamente por ubicaciones del barrio una vez definidas. No se insertan incidencias ni fotografías simuladas como si fueran denuncias reales.

## 2. Preparar cuentas para la exposición

En **Authentication → Users**, usar la opción de agregar usuario para crear dos vecinos y un responsable, con correo y contraseña propios de la demostración. Confirmar sus correos mediante la opción administrativa disponible; la app usa acceso por contraseña y no depende del envío de invitaciones durante la exposición.

Cada usuario nuevo obtiene un perfil de vecino automáticamente. Para asignar el responsable, ejecutar desde SQL Editor, sustituyendo únicamente el correo:

Para mantener el piloto limitado a estas cuentas, desactivar el registro público de usuarios en la configuración de Auth después de prepararlas. El inicio de sesión por contraseña de las cuentas existentes debe permanecer habilitado. Verificar este ajuste en el panel del proyecto antes de usar datos reales.

```sql
update public.profiles
set role = 'responsable', display_name = 'Responsable del piloto'
where id = (
  select id from auth.users where email = 'CORREO_DEL_RESPONSABLE'
);
```

Verificar que se actualizó exactamente una fila. No cambiar permisos desde `user_metadata` ni entregar privilegios de administración a los vecinos. Las contraseñas de prueba se comparten fuera del repositorio.

## 3. Conectar la app sin secretos privilegiados

1. Abrir **Connect** en el proyecto y localizar su URL; también se encuentra en la configuración de API del proyecto.
2. En **Settings → API Keys**, copiar la clave **Publishable**. Si el proyecto usa claves antiguas, la equivalente es **anon public**.
3. Copiar `mobile/.env.example` como `mobile/.env` y sustituir las dos líneas:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://REFERENCIA_DEL_PROYECTO.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=CLAVE_PUBLICABLE_DEL_PROYECTO
```

No usar `secret`, `service_role`, contraseña de base de datos ni tokens de administración en estas variables. Las variables `EXPO_PUBLIC_` serán visibles en el paquete móvil; los permisos del script son la barrera de acceso.

## 4. Ejecutar en Android

Desde PowerShell:

```powershell
Set-Location -LiteralPath 'D:\plataformas lab 4\mobile'
npm.cmd install
npm.cmd start
```

Instalar **Expo Go** en un teléfono Android y escanear el QR que muestre la terminal. Usar la versión de Expo Go compatible con el SDK fijado en `mobile/package.json`. El teléfono y la computadora deben poder comunicarse en la red; ambos necesitan internet para acceder a Supabase.

El teléfono del piloto tiene Expo Go para **SDK 58**, por lo que el proyecto debe usar Expo SDK 58 y sus dependencias compatibles. Si aparece «Project is incompatible with this version of Expo Go», comprobar primero esa coincidencia; cambiar de Wi-Fi o de enlace no resuelve una diferencia de SDK.

Para una segunda sesión en el navegador:

```powershell
npm.cmd run web
```

Si cambia `.env`, reiniciar el servidor de Expo. Si persiste una configuración antigua, usar `npx.cmd expo start --clear`. La app muestra una explicación de configuración pendiente cuando todavía no se definieron valores válidos.

## 5. Verificación previa

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
```

Las pruebas automatizadas locales de base de datos usan un PostgreSQL embebido con esquemas mínimos de Auth y Storage para probar reglas y permisos. No reemplazan las pruebas reales de cámara, subida, sesión, red y Realtime en Supabase y Android.

Después completar PA-01 a PA-10 de `REQUERIMIENTOS.md`. No declarar la integración lista hasta ejecutar el recorrido con las cuentas del proyecto real.

## 6. Recorrido de exposición

1. Vecino A crea un reporte en un punto DEMO y adjunta una foto de prueba apropiada.
2. Vecino B intenta reportar en el mismo punto y tipo, ve la coincidencia y suma su aporte.
3. Responsable consulta Avisos, abre el caso y acepta su atención.
4. Responsable registra observación y fotografía de solución.
5. Los dos vecinos consultan el aviso de cierre y el historial filtrado por solucionados.

Expo Go es el contenedor de ejecución del prototipo. Si el docente exige APK propio, se debe preparar y comprobar una compilación independiente antes de la entrega; no se considera entregada por escanear el QR.
