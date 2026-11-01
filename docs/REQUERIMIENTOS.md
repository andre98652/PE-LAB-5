# Especificación de requisitos — Barrio Limpio

Versión: 0.2. Fecha: 31/10/2026. Entrega objetivo: 01/11/2026, zona horaria America/Lima.

Ampliación geográfica implementada en código: [UBICACION.md](UBICACION.md). Sus reglas sustituyen la selección por puntos DEMO descrita en la línea base original de este documento. La activación en Supabase real y las pruebas de teléfono correspondientes siguen pendientes de ejecutar la segunda migración.

Estado: propuesta de diseño para un prototipo académico; no constituye evidencia de funciones implementadas ni de requisitos ya validados en campo.

## 1. Problema y objetivo

En el escenario planteado, los vecinos no cuentan con un registro compartido de los puntos donde se acumula basura. Los avisos pueden repetirse y resulta difícil saber si fueron atendidos.

El objetivo es centralizar incidencias de residuos de un barrio, reunir evidencia aportada por varios vecinos y permitir el seguimiento de su atención por un responsable identificado. El software organiza y comunica el trabajo; la recolección depende de una organización que acepte participar.

Resultados que se medirán en el piloto: incidencias abiertas y solucionadas, vecinos participantes por incidencia y tiempo entre creación y solución. Son métricas propuestas; no existen resultados medidos todavía.

## 2. Alcance de la entrega

### Incluido, prioridad P0

- App móvil Android, interfaz en español y uso con conexión a internet.
- Inicio de sesión con cuentas preparadas para vecinos y responsables.
- Coordenadas confirmadas del problema mediante GPS, mapa o entrada manual; distrito y provincia declarados por el vecino.
- Crear incidencias, consultar sus detalles y agregar una fotografía opcional.
- Buscar casos abiertos a 30 m antes de crear y confirmar una incidencia existente, aunque tenga otra categoría.
- Consultar por radio y por distrito; ubicar reportes antiguos sin coordenadas y fusionar duplicados por decisión de un responsable, conservando evidencias.
- Responsable que acepta casos y registra su solución con evidencia.
- Historial de incidencias, filtros por estado y tipo, y bitácora de estados.
- Avisos persistentes dentro de la app y actualización de la bandeja mientras está abierta.

### Ampliaciones, prioridad P1

Filtro por fecha, registro autónomo de usuarios con verificación de correo, rechazo con motivo, solicitud de reapertura, asignación a múltiples cuadrillas y notificaciones push con la app cerrada. La validación de distrito con polígonos oficiales y el reconocimiento de imágenes quedan fuera del alcance actual.

### Fuera de esta entrega

Reconocimiento de imágenes, optimización de rutas, seguimiento de camiones, funcionamiento completamente sin conexión, publicación en tiendas e integración automática con sistemas municipales. iOS es una posibilidad de la tecnología elegida, pero no se promete como plataforma probada en esta entrega.

## 3. Actores y permisos

**Vecino:** inicia sesión, consulta las incidencias del barrio piloto, crea una incidencia, confirma otra existente, adjunta evidencia y consulta sus avisos. No cambia estados operativos ni roles.

**Responsable de limpieza:** consulta la bandeja del piloto, acepta una incidencia pendiente y registra su solución. En el prototipo representa tanto la coordinación como la atención de una cuadrilla. El rol se asigna de forma administrativa; no se selecciona libremente desde la app.

**Administrador técnico:** prepara cuentas, roles y puntos de referencia desde herramientas de administración. No se construirá una interfaz administrativa independiente.

Para la exposición se necesitan al menos dos cuentas de vecino y una de responsable. Las cuentas del piloto no implican que exista personal municipal conectado.

## 4. Conceptos y reglas de negocio

### RN-01. Incidencia y aporte

Una incidencia representa un episodio concreto de acumulación de residuos. Los aportes representan a vecinos que lo observaron. Cuatro vecinos del mismo episodio deben producir una incidencia y cuatro participantes, no cuatro órdenes de atención.

El creador cuenta como primer participante. Una cuenta solo puede tener un aporte por incidencia, aunque reintente el envío. Se admite como máximo una fotografía de reporte por participante en el MVP.

### RN-02. Duplicados probables

Antes de guardar se muestran incidencias abiertas a 30 m o menos del punto confirmado. El tipo puede diferir. La coincidencia es una sugerencia: el usuario puede confirmar la existente o declarar que es un problema distinto, aportando una referencia concreta que lo diferencie.

La comprobación se repite en el servidor. Si apareció una coincidencia después de la consulta inicial, el servidor solicita confirmación en vez de crear silenciosamente otro registro. No se promete detección perfecta ni validación automática de fotografías.

Una incidencia solucionada no bloquea un nuevo episodio en ese lugar. Si dos residuos diferentes coinciden en un área pequeña, se preservan separados con su explicación. Los puntos DEMO existentes solo se conservan como referencias de registros antiguos; no determinan la cercanía de los nuevos.

### RN-03. Estados

Flujo del MVP: pendiente → en_proceso → solucionado.

- Toda incidencia se crea como pendiente y sin responsable asignado.
- Aceptar el caso asigna al responsable actual y lo pasa a en_proceso en una sola operación.
- Solo el responsable asignado puede cerrarlo, con observación y fotografía de solución obligatorias.
- No se permite saltar de pendiente a solucionado, retroceder de estado ni editar un cierre desde el cliente.
- Cada transición conserva actor, fecha, estado anterior y nuevo estado.

### RN-04. Avisos

Una nueva incidencia genera un aviso para cada responsable del piloto. Agregar confirmaciones no repite ese aviso. Los vecinos participantes reciben un aviso cuando cambia el estado.

La notificación dentro de la app es persistente. Un evento en tiempo real solo acelera su visualización: al iniciar o volver a la app se consultan los avisos almacenados. Marcar como leído no significa aceptar una tarea.

### RN-05. Evidencia y privacidad

Las fotografías de reporte son opcionales; la de solución es obligatoria. Se admiten JPEG y PNG de hasta 2 MB por imagen, después del procesamiento en el dispositivo. Se pide evitar rostros, placas y datos personales en la evidencia.

Los vecinos ven el problema y su estado, pero no correos, credenciales ni identificadores personales de otros vecinos. La fotografía no demuestra por sí sola que el lugar o el cierre sean auténticos; existe responsabilidad humana en la revisión.

## 5. Requisitos funcionales y aceptación

### RF-01. Acceso y sesión — P0

Permitir acceso con correo y contraseña y cierre de sesión. La app recupera una sesión vigente y obtiene el rol desde una fuente protegida.

Aceptación: una cuenta válida accede; una contraseña incorrecta muestra un mensaje comprensible; cerrar sesión impide seguir consultando datos protegidos. Las contraseñas no aparecen en registros ni documentos.

### RF-02. Inicio y listado — P0

Mostrar tarjetas con punto de referencia, tipo, fecha, estado, foto cuando exista y cantidad de participantes únicos. Ofrecer carga, error con reintento y estado vacío con acción para reportar. Cargar en páginas de hasta 20 incidencias, ordenadas por fecha descendente.

Aceptación: una incidencia creada desde un dispositivo aparece al actualizar el listado en otro; la cantidad de participantes incluye al creador una sola vez.

### RF-03. Crear incidencia — P0

Solicitar coordenadas confirmadas, distrito y provincia de 3 a 120 caracteres, ubicación escrita de 5 a 160 caracteres, descripción de 10 a 1000 caracteres y un tipo del catálogo: basura acumulada, contenedor desbordado o desmonte. La referencia escrita complementa las coordenadas. La foto es opcional.

Aceptación: no guardar campos vacíos ni textos fuera de límites; registrar fecha del servidor y estado pendiente. Una respuesta fallida no debe borrar el formulario ni anunciar éxito.

### RF-04. Coincidencias y confirmaciones — P0

Mostrar candidatos a 30 m o menos en estado pendiente o en_proceso, con distancia, tipo, descripción y foto disponible. Permitir abrir el detalle, confirmar el mismo problema o crear uno distinto con explicación de 10 a 300 caracteres.

Aceptación: dos vecinos confirman un caso y se mantienen una incidencia y dos participantes. Confirmar dos veces desde la misma cuenta no aumenta el contador. Crear un problema distinto conserva su explicación.

### RF-05. Fotografías — P0

Permitir seleccionar una imagen de galería o tomarla con cámara en Android, con vista previa y opción de retirar la selección antes de enviar. Gestionar cancelación, permiso denegado y límite de archivo.

Aceptación: un reporte sin imagen se guarda. Si falla la subida, se informa que la foto no se adjuntó y se permite reintentar sin duplicar la incidencia. No guardar como imagen de nube una ruta temporal del teléfono.

### RF-06. Detalle de incidencia — P0

Mostrar ubicación, descripción, estado, fecha, participantes, imágenes autorizadas y movimientos de estado. Las acciones disponibles dependen del rol y del estado vigente.

Aceptación: el vecino puede confirmar una incidencia abierta; no puede aceptar tareas ni cerrar casos, incluso intentando invocar directamente la operación del servidor.

### RF-07. Bandeja y aceptación — P0

Mostrar pendientes y casos en proceso, con filtros por estado y tipo. Permitir a un responsable aceptar un pendiente.

Aceptación: se guardan responsable y estado juntos. Si dos responsables aceptan simultáneamente, solo uno obtiene la asignación; el otro recibe el estado actualizado.

### RF-08. Solución — P0

Permitir al responsable asignado cerrar un caso en proceso con observación de 10 a 1000 caracteres y fotografía de solución.

Aceptación: no cerrar sin evidencia. Un vecino o responsable distinto no puede cerrar el caso. La transición y los avisos se guardan junto con el cierre; si falla esa operación no queda un caso cerrado parcialmente.

### RF-09. Historial — P0

Consultar incidencias actuales y anteriores, incluyendo solucionadas, con filtros por estado y tipo. El inicio y el historial consultan la misma fuente de datos; no se duplican registros para archivarlos.

Aceptación: filtrar solucionados muestra el caso cerrado y su evidencia; retirar el filtro vuelve a mostrar el conjunto correspondiente.

### RF-10. Avisos internos — P0

Mostrar contador de no leídos, listado y enlace al detalle. Solo el destinatario consulta o marca sus avisos como leídos.

Aceptación: el aviso sobrevive al cierre y reapertura de la app. Si se pierde la conexión en tiempo real, se recupera al actualizar. Cuatro confirmaciones del mismo caso no producen cuatro avisos nuevos de trabajo.

### RF-11. Bitácora — P0

Conservar el evento de creación y las transiciones posteriores, con hora del servidor y actor interno. Exponer al vecino solo el rol del actor, estado y fecha.

Aceptación: el detalle muestra creación, aceptación y solución en orden; el cliente no puede reescribir ni borrar movimientos.

## 6. Requisitos no funcionales

- **RNF-01, plataforma:** completar el flujo en un teléfono Android con Expo Go y verificar el acceso secundario desde navegador. Registrar modelos y versiones reales al probar; no declarar compatibilidad sin verificación.
- **RNF-02, seguridad:** exigir sesión y aplicar autorización en base de datos y almacenamiento. Ocultar botones no es control de acceso suficiente. Ninguna clave privilegiada debe incluirse en la app.
- **RNF-03, integridad:** restricciones únicas y operaciones transaccionales para participantes, asignación y estados. Los reintentos de la misma operación deben devolver el resultado existente.
- **RNF-04, conectividad:** no prometer envío sin internet. Conservar el formulario ante errores durante la sesión, mostrar resultado y reintentar de forma explícita. Los borradores no sobrevivirán necesariamente a desinstalar o terminar el proceso.
- **RNF-05, usabilidad:** español, estados identificados con texto además de color, controles táctiles de al menos 44 unidades lógicas, etiquetas accesibles y formulario desplazable con teclado visible.
- **RNF-06, respuesta:** objetivo de mostrar una primera página o un error recuperable en 5 segundos con red estable de prueba, sin incluir la transferencia de fotos. Es una meta pendiente de medición; no un resultado verificado.
- **RNF-07, costo:** usar únicamente Supabase Free y ejecución local de Expo en el piloto; comprimir imágenes y evitar suscripciones en tiempo real innecesarias. No activar servicios de pago para cumplir la exposición.
- **RNF-08, mantenibilidad:** TypeScript, separar interfaz, reglas y acceso a Supabase; centralizar catálogos y validaciones; fijar dependencias mediante archivo de bloqueo.

## 7. Relación con el problema y las interfaces

Estas relaciones son hipótesis derivadas del enunciado y deben contrastarse con el árbol de problemas anterior:

- Falta de registro organizado → RF-02, RF-03 y RF-05 → Inicio y Nuevo reporte.
- Repetición de avisos → RF-04 → Coincidencias y Detalle.
- Falta de un responsable visible → RF-07 y RF-08 → Bandeja y Atención.
- Poco seguimiento → RF-09, RF-10 y RF-11 → Historial, Avisos y Detalle.

Pantallas propuestas: Acceso, Inicio, Nuevo reporte con coincidencias, Detalle, Historial, Avisos y Bandeja del responsable. La misma app presenta funciones distintas según el perfil.

Pendiente: identificar cada requisito de los trabajos anteriores y vincularlo con los identificadores RF de este documento; conservar los diseños ya aprobados donde corresponda.

## 8. Pruebas de aceptación de la entrega

Todas están pendientes de ejecución. No se consideran aprobadas por aparecer en el documento.

1. **PA-01, recorrido completo:** vecino A crea un caso; vecino B confirma; responsable acepta y cierra con foto; ambos consultan la solución. Verifica RF-01 a RF-11.
2. **PA-02, duplicado y reintento:** confirmar dos veces, pulsar guardar repetidamente y repetir una petición tras una interrupción. Esperado: una participación y una operación lógica por identificador.
3. **PA-03, creación simultánea:** dos vecinos guardan en el mismo punto y tipo. Esperado: el segundo encuentra la coincidencia creada y decide; no aparece otro caso automáticamente.
4. **PA-04, diferencia real:** dos casos distintos en el mismo punto. Esperado: se conservan separados solo tras declaración explícita y explicación.
5. **PA-05, autorización:** vecino intenta cambiar estado o rol; cuenta ajena intenta leer avisos personales; responsable distinto intenta cerrar. Esperado: rechazo en servidor.
6. **PA-06, concurrencia:** dos responsables aceptan el mismo pendiente. Esperado: una sola asignación y bitácora consistente.
7. **PA-07, fotografías y red:** cancelar cámara, denegar permiso, enviar archivo inválido y cortar conexión durante subida. Esperado: mensaje recuperable, sin éxito falso ni incidencia duplicada.
8. **PA-08, cierre válido:** intentar cerrar sin foto y luego con evidencia. Esperado: primer intento rechazado; segundo crea un único cierre con sus avisos.
9. **PA-09, historial y recurrencia:** filtrar el caso solucionado y reportar un episodio nuevo en su ubicación. Esperado: historial preservado y nuevo caso pendiente independiente.
10. **PA-10, recuperación de avisos:** desconectar un dispositivo durante un cambio de estado y reconectar. Esperado: aviso recuperado desde la base de datos y contador correcto.

## 9. Validación social y condiciones de entrega

Antes de declarar requisitos reales validados, registrar fecha, perfil y hallazgos de una conversación con vecinos y un responsable de limpieza, con autorización de los participantes. Confirmar quién atiende, qué residuos acepta y cómo acredita el cierre. Hasta entonces, describir el producto como prototipo basado en el escenario propuesto.

Entregables previstos: código fuente, configuración de ejemplo sin secretos, estructura y políticas de base de datos, instrucciones de ejecución, estos documentos y evidencias de pruebas. Confirmar con el docente si se requiere además un APK; la ejecución mediante Expo Go no satisface por sí sola ese formato.

## 10. Referencias técnicas

Los requisitos de negocio y los límites de formulario son decisiones propuestas del proyecto. La siguiente fuente respalda únicamente las cuotas del servicio:

- [Supabase Free: precios y límites](https://supabase.com/pricing), consultado el 31/10/2026: 500 MB de base de datos, 1 GB de archivos y pausa por una semana de inactividad. La cuota gratuita no sustituye las pruebas ni garantiza disponibilidad permanente.
