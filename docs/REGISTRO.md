# Registro de vecinos

En el acceso, elegir **Soy nuevo · Crear cuenta**. Se solicita nombre, correo, contraseña de al menos ocho caracteres y confirmación de contraseña. Cada persona debe usar su propia cuenta para contarse como un vecino diferente.

La app usa `supabase.auth.signUp` con la clave publicable y únicamente el nombre como metadato. El trigger existente de PostgreSQL crea el perfil como `vecino`, ignorando roles enviados por el cliente. No se requieren migraciones nuevas. Los responsables se asignan desde la administración.

## Ajustes de Supabase

- Authentication → Sign In / Providers: permitir registros nuevos y proveedor Email habilitado.
- Si **Confirm email** está activado, el vecino debe confirmar su correo antes de ingresar. La app muestra instrucciones y vuelve al ingreso sin dar por iniciada una sesión.
- Para el piloto académico se puede desactivar **Confirm email** si el administrador decide permitir cuentas sin verificar; entonces Supabase devuelve sesión y la app entra directamente. Ese ajuste afecta a todo el proyecto.
- Para registros externos con confirmación, configurar SMTP propio y la URL de redirección en Authentication → URL Configuration. El servicio de correo de prueba de Supabase tiene restricciones de destinatarios y límites; no asumir que envía a cualquier dirección.
- No agregar contraseñas ni claves administrativas a GitHub o al APK.

Prueba de aceptación pendiente en el proyecto conectado: registrar un correo nuevo, comprobar que el perfil sea vecino, salir, ingresar con sus credenciales y confirmar una incidencia desde una cuenta diferente. No usar direcciones inventadas si se exige confirmación.
