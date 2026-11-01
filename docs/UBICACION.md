# Ubicación, cercanía y duplicados — versión 0.2

Fecha: 31/10/2026. Esta ampliación sustituye la coincidencia por puntos DEMO de la versión 0.1 para los reportes nuevos. Requiere la migración `202610310002_ubicacion.sql` después de la instalación inicial.

## Comportamiento implementado

- La app propone una coordenada mediante GPS, permite tocar el mapa o introducir coordenadas y exige pulsar **Confirmar este punto**. Editar el punto invalida la confirmación anterior.
- El lugar corresponde a la basura; no se asume que sea la ubicación actual del vecino. No hay seguimiento continuo ni solicitudes de ubicación en segundo plano.
- El distrito y provincia se confirman manualmente. Las sugerencias proceden de etiquetas de reportes existentes, no de un catálogo oficial ni de polígonos administrativos. El filtro ignora mayúsculas, espacios repetidos y las tildes españolas normalizadas.
- Inicio busca cerca de un centro elegido, con radio inicial de 1 km y opciones de 500 m, 1 km, 2 km y 5 km. No muestra todos los registros del país cuando aún no se eligió un centro.
- Historial y Bandeja permiten además consultar todos los casos o los antiguos sin coordenadas. El centro se mantiene en memoria del cliente para explorar otra zona; no se registra un historial de desplazamientos del vecino.
- La selección por radio se ejecuta en PostgreSQL antes de paginar, ordenada por distancia. El filtro por distrito es independiente y puede abarcar casos lejanos dentro de la misma localidad.

## Coincidencias de reportes

Se consultan los casos pendientes o en proceso a **30 metros o menos**, de cualquier tipo. Se muestra distancia, descripción, categoría y foto disponible. El tipo orienta la comparación, pero no descarta un montón clasificado de otra forma por otra persona.

El vecino confirma que es el mismo caso o explica por qué se trata de otro problema. Antes de insertar, el servidor repite la consulta dentro de una transacción. Si apareció un candidato no revisado, devuelve coincidencias en vez de crear automáticamente otro caso. Un bloqueo transaccional compartido serializa la breve creación geográfica del piloto, evitando carreras entre coordenadas vecinas que caerían en celdas distintas. Un despliegue de gran volumen requeriría revisar esta estrategia.

El radio de 30 m es una decisión inicial para validar en campo, no una garantía de identidad. GPS impreciso, lugares mal elegidos y declaraciones incorrectas todavía pueden generar duplicados. No se usa reconocimiento de imágenes ni se bloquean archivos idénticos entre cuentas.

## Fusión por el responsable

Un responsable puede buscar otros casos abiertos a 30 m y unir uno al caso que está revisando, explicando por qué representan el mismo episodio. El servidor acepta solo casos abiertos, con ubicaciones confirmadas, a un máximo de 100 m, y rechaza casos que esté atendiendo otro responsable. La interfaz propone candidatos a 30 m; el límite de 100 m es una defensa adicional del servidor, no un radio automático de agrupación.

El caso principal reúne participantes únicos. Los originales se archivan con `merged_into_id`, conservando registros, fotografías, recibos e historial. Las fotos se muestran desde sus asociaciones originales; no se borran ni se descargan y vuelven a subir. Abrir un enlace al duplicado lleva al principal. Se rechazan nuevos aportes o cambios operativos en el original archivado.

El cierre del caso principal avisa a todos sus participantes. Un cambio de fusión genera un aviso interno `fusionado`; no equivale a una recolección realizada. La bandeja deja de mostrar el caso archivado como otra tarea.

## Recurrencias y reportes antiguos

Un episodio solucionado no participa en la búsqueda de duplicados abiertos. Un nuevo caso puede enlazar como antecedente un caso solucionado del mismo tipo a 30 m o menos. Esto indica un antecedente cercano, no que se haya probado la identidad entre episodios.

Los registros existentes conservan coordenadas nulas; no se les inventa un punto GPS. Se consultan mediante **Antiguos sin ubicación** o Historial. Su creador o un responsable puede ubicarlos una sola vez; se conserva una entrada en `location_events` y se mantiene su estado. Si al ubicar un antiguo coincide con otro abierto, el responsable puede revisar y fusionar ambos.

## Arquitectura y costo

Se usan columnas latitud/longitud y una función Haversine con radio terrestre medio para distancias aproximadas en metros. Una selección previa por latitud aprovecha un índice; después se calcula la distancia. Este enfoque para el piloto no instala PostGIS ni depende de un proveedor de geocodificación. PostGIS es una alternativa para una futura ampliación con geometrías, límites oficiales y mayor escala.

El mapa usa Leaflet 1.9.4 y teselas de OpenStreetMap. Android lo presenta en `react-native-webview` y web en un iframe aislado; solo se aceptan coordenadas válidas del puente. No se pasan sesiones ni claves al documento del mapa. Se mantiene atribución visible, identificador de app en el navegador nativo, caché HTTP y descarga limitada a la vista; no se incluyen descargas masivas ni mapas sin conexión. Los servicios del mapa son externos a Supabase y su disponibilidad es de mejor esfuerzo.

GPS y el mapa son ayudas alternativas. Si se deniega el permiso o falla el mapa, se pueden introducir coordenadas válidas y confirmarlas. Las incidencias requieren conexión a Supabase para guardarse. Las cuotas de almacenamiento y transferencia siguen aplicando, especialmente a las fotografías.

Los responsables siguen siendo las cuentas del piloto. Seleccionar un distrito no crea una integración municipal ni asigna automáticamente una cuadrilla administrativa de esa jurisdicción.

## Activación en el proyecto existente

1. Conservar el proyecto y sus cuentas actuales.
2. Abrir SQL Editor → New query.
3. Ejecutar una sola vez el contenido completo de `supabase/migrations/202610310002_ubicacion.sql`.
4. Si termina con Success, recargar la app en Expo Go SDK 58.
5. En Inicio, elegir centro y radio; para ver el reporte anterior, abrir Antiguos sin ubicación y añadirle coordenadas desde una cuenta autorizada.

No volver a ejecutar la migración inicial ni borrar tablas. La nueva migración se ejecuta dentro de una transacción. Si aparece un error, compartir el mensaje y revisar antes de reintentar. La clave publicable del cliente no permite aplicar cambios de esquema; la activación se hace desde SQL Editor con la cuenta administradora del proyecto.

## Pruebas manuales pendientes en el proyecto real

1. Confirmar que una cuenta sin permiso GPS puede marcar un punto o escribir coordenadas; comprobar cámara, mapa y botones inferiores en Android.
2. Crear A y luego intentar B a unos 10 m, incluso con otro tipo; revisar coincidencia y confirmar. Resultado: una incidencia y dos participantes.
3. Crear otro caso a más de 30 m y comprobar radios de 500 m y 2 km y filtros por distrito.
4. Declarar explícitamente dos casos distintos cercanos y luego unirlos con el responsable; comprobar fotos, participantes únicos y enlaces anteriores.
5. Cerrar el principal con foto y reportar una nueva acumulación en el mismo lugar; verificar historial y antecedente.
6. Verificar que los reportes antiguos no desaparecieron y que otro vecino no puede asignarles coordenadas.

## Referencias

- [Expo Location SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/location/).
- [Expo WebView SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/webview/).
- [Leaflet](https://leafletjs.com/reference.html).
- [Política de teselas OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/).
- [Supabase Free](https://supabase.com/pricing).
