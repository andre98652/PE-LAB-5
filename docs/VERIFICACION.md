# Verificación local — 31/10/2026

## Actualización del piloto móvil

El proyecto se actualizó a Expo SDK 58 para coincidir con Expo Go del teléfono. Tras el ajuste de navegación, TypeScript y lint pasan. La exportación Android con SDK 58 también se completó; la ejecución en teléfono fue confirmada posteriormente por el usuario.

Se corrigió el área segura inferior de las pantallas sin pestañas, incluido el detalle, para reservar el espacio de la navegación del sistema. Las pantallas dentro de pestañas mantienen el margen que gestiona su navegador, sin duplicarlo. Pendiente confirmar visualmente esta corrección en el teléfono del usuario.

La última ejecución local registra 21 resultados aprobados. Incluye el escenario de un creador y diez vecinos adicionales: al intentar crear casos del mismo punto y tipo, reciben la coincidencia y se suman al existente, con una incidencia y once participantes. Es una prueba local secuencial; no constituye reconocimiento de imágenes ni una prueba de concurrencia en Supabase real.

El comportamiento de duplicados se basa en punto, tipo, estado abierto y confirmación humana. No compara el contenido de los archivos de imagen. Elegir otro punto o declarar que es otro problema puede producir un caso separado y requiere revisión humana cuando hay errores.

## Resultados comprobados

- TypeScript: `npm.cmd run typecheck`, sin errores.
- Análisis estático: `npm.cmd run lint`, sin errores ni advertencias después de las correcciones.
- Pruebas: `npm.cmd test`, 20 resultados aprobados según el ejecutor, contando el contenedor de pruebas de PostgreSQL.
- Exportación web: `npm.cmd run export:web`, completada.
- Paquete JavaScript Android: `npx.cmd expo export --platform android --output-dir dist-android`, completado con bytecode Hermes. El primer intento falló por permisos de escritura temporal en el aislamiento; se repitió fuera del aislamiento y terminó correctamente. Esta exportación no genera un APK ni acredita una prueba en teléfono.
- Compatibilidad de versiones: `npx.cmd expo install --check`, sin cambios requeridos según el manifiesto local del SDK. Esta consulta se ejecutó sin red; no equivale a comprobar actualizaciones remotas.

Las pruebas de PostgreSQL ejecutan la migración en PGlite con esquemas mínimos de Auth y Storage. Verifican permisos, restricciones, duplicados, recibos de reintento, versiones antiguas, evidencia y avisos. Las aceptaciones competidoras se verifican de forma secuencial con versiones antiguas; no se ejecutó una prueba de carga ni concurrencia sobre conexiones reales a Supabase.

## Comprobaciones pendientes

- Ejecutar la migración en el proyecto Supabase del usuario y preparar cuentas.
- Configurar la URL y clave publicable, sin incluir claves privilegiadas en la app.
- Probar inicio de sesión, sesión restaurada, subida y descarga real de archivos y eventos Realtime.
- Completar las pruebas PA-01 a PA-10 en Android y con una segunda cuenta.
- Revisar visualmente las pantallas. El navegador integrado no pudo acceder al servidor local, aunque la exportación web terminó; no se declara verificación visual aprobada.
- Confirmar con el docente si se exige APK propio y, si corresponde, compilar y comprobar su instalación.

## Dependencias

La consulta `npm audit --json` encontró 29 avisos en el árbol de dependencias instalado: 5 altos, 22 moderados y 2 bajos. Entre los avisos altos hay dependencias transitivas de Expo Router (`query-string` / `decode-uri-component`) y del CLI (`zod`). Se conservaron las versiones compatibles con Expo Go / SDK 57; no se aplicó `npm audit fix --force`, pues propone cambios mayores o versiones de SDK incompatibles con este entorno.

Queda pendiente revisar actualizaciones compatibles antes de distribuir la app fuera del piloto. Este registro no afirma que los avisos se hayan corregido. La presentación con cuentas y datos ficticios no sustituye esa revisión.

Referencias concretas de los avisos consultados por npm:

- [decode-uri-component: denegación de servicio](https://github.com/advisories/GHSA-qr28-fpjm-wq7f).
- [Zod: consumo de memoria con colecciones grandes](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
