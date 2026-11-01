# APK Android para la presentación

La acción **Compilar APK Android** genera una aplicación autónoma: no requiere Expo Go ni que la computadora esté encendida. Necesita internet para iniciar sesión, consultar Supabase y cargar mapas y fotos.

## Generar y descargar

1. En GitHub, abrir el repositorio → Settings → Secrets and variables → Actions.
2. Configurar `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` con los valores públicos de `mobile/.env`. Nunca usar `service_role`, contraseñas ni claves `secret`.
3. Abrir Actions → Compilar APK Android → Run workflow.
4. Al finalizar, descargar **Barrio-Limpio-APK** desde Artifacts y extraer `app-release.apk` del ZIP.
5. En Android, abrir el APK y permitir la instalación desde esa fuente cuando el sistema lo solicite.

## Alcance de la firma

Se genera la variante release con JavaScript incluido y la firma de demostración que crea Expo Prebuild. Es para la entrega académica, no para publicar en Google Play. La firma puede cambiar entre compilaciones: si Android rechaza una actualización, desinstalar la versión anterior e instalar la nueva. Esto elimina la sesión local, pero conserva los datos de Supabase.

Para publicar formalmente se debe configurar una clave de firma propia y conservarla fuera de Git. Los archivos de firma, `.env`, APK y dependencias están excluidos del repositorio.

Aunque se suministren mediante GitHub Secrets, los valores `EXPO_PUBLIC_` se incluyen en el APK y son públicos por diseño. La autorización de los datos depende de las políticas RLS y RPC de Supabase.

La base de datos debe tener aplicadas las dos migraciones de `supabase/migrations/`. El flujo de compilación no cambia la base de datos.
