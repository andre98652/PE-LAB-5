# Barrio Limpio

Aplicación móvil para que los vecinos registren acumulaciones de residuos, confirmen problemas existentes y consulten su atención por un responsable de limpieza.

## Estado del proyecto

Versión inicial del proyecto, preparada el 31 de octubre de 2026. El código de la aplicación está en `mobile/` y la migración de base de datos en `supabase/migrations/`. La conexión y la prueba con el proyecto Supabase del usuario todavía están pendientes. Entrega objetivo: 1 de noviembre de 2026, hora de Lima.

## Plataforma y tecnologías acordadas

- Producto principal: aplicación móvil Android con React Native, Expo y TypeScript.
- Demostración inicial en un dispositivo Android mediante Expo Go. Esto requiere el entorno de desarrollo en ejecución y no equivale a un APK independiente.
- Navegador web como apoyo para pruebas con una segunda cuenta.
- Supabase Free para autenticación, PostgreSQL, fotografías y actualizaciones de datos.
- Avisos persistentes dentro de la aplicación. Las notificaciones con la app cerrada quedan para una ampliación.

## Documentación

- [Especificación de requisitos](docs/REQUERIMIENTOS.md): alcance, actores, reglas, criterios de aceptación y pruebas de demostración.
- [Arquitectura de software](docs/ARQUITECTURA.md): componentes, modelo de datos, operaciones, permisos y decisiones técnicas.
- [Instalación y conexión](docs/INSTALACION.md): preparar Supabase, cuentas de demostración y ejecución en Android.
- [Verificación local](docs/VERIFICACION.md): pruebas realizadas y limitaciones pendientes.

## Ejecución local

```powershell
Set-Location -LiteralPath 'D:\plataformas lab 4\mobile'
npm.cmd install
npm.cmd start
```

Sin configuración de Supabase se muestra el acceso con un aviso de conexión pendiente. No se permite iniciar sesión contra un proyecto ficticio. La demostración completa requiere ejecutar la migración, preparar cuentas y configurar `mobile/.env`, según la guía de instalación.

## Condiciones pendientes de validar

1. Confirmar si el docente exige un APK propio o admite la demostración móvil con Expo Go.
2. Incorporar los diseños y el árbol de problemas de los trabajos anteriores; todavía no fueron proporcionados.
3. Elegir el barrio y sus puntos de referencia. Los datos preparados para exposición deben identificarse como ficticios.
4. Validar el flujo con vecinos y un responsable real de limpieza. No se han realizado entrevistas ni existe un acuerdo de atención municipal acreditado.

La creación del proyecto Supabase está a cargo del usuario. No se deben incluir contraseñas, claves secretas ni credenciales de prueba en estos documentos.

## Configuración y credenciales

Guardar los valores de configuración en archivos `.env`, sin incrustarlos en el código. Git ignora todos los archivos `.env*`, excepto `.env.example`, que contiene únicamente marcadores sin credenciales reales. La app lee `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` desde `mobile/.env`.

Las variables `EXPO_PUBLIC_` son visibles en la app compilada. Las claves privilegiadas (`secret`, `service_role`), contraseñas y tokens administrativos pertenecen exclusivamente a un entorno de servidor; no deben agregarse al proyecto móvil, aunque se guarden en un archivo `.env`.
