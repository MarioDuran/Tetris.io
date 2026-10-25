# QUADRIFT.IO — Edición 003 · Movimiento responsivo

Juego de arena multijugador en tiempo real. **Código fuente completo de un MVP jugable**, preparado para publicarse en Render como un único Web Service. Sin framework de interfaz, sin base de datos y sin dependencias npm de ejecución.

![Visual de la marca](public/favicon.svg)

## Idea y reglas

1. Apareces con **una sola celda**. Te mueves en cualquier dirección por una arena cuadriculada.
2. Las piezas libres tienen entre 1 y 4 celdas (incluidas formas T, L y Z). **La cantidad es deliberadamente reducida y cada pieza desaparece aproximadamente entre 14.5 y 27.5 segundos después de aparecer; aparecen nuevas de forma gradual.** Para **unir** una pieza debe estar tocando lateralmente alguna celda de tu figura, no superponerse y **caber en tu siguiente cuadrado objetivo**. Puedes unir al caminar hacia ella o pulsando **F / Espacio** al estar junto a ella.
3. Puedes rotar tu figura incompleta con **R** (sentido horario) o **Q** (antihorario). La rotación intenta conservar el centro geométrico sin atravesar paredes, piezas ni rivales. Cuando una pieza está al alcance se destaca en **verde** si encaja o en **rojo** si no cabe; se dibuja una previsualización de las celdas que se van a incorporar.
4. Empiezas con objetivo **2×2**. Al completar exactamente 4 celdas sin huecos, se convierte en **un bloque de color sólido** y asciendes a rango 2. Tu siguiente objetivo es 3×3 (9 celdas), luego 4×4 (16), y así hasta 9×9.
5. **Solo estando completo y sólido puedes absorber por choque a un rival de rango estrictamente menor.** Sus celdas se incorporan a tu perímetro y puede que completes directamente tu siguiente cuadrado. Normalmente esa absorción deja tu figura incompleta: deberás volver a cerrar el cuadrado para capturar. Si capturas suficiente masa como para completar la siguiente etapa inmediatamente, puedes volver a capturar.
6. **Sprint:** desde un cuadrado sólido de al menos **2×2**, pulsa **Shift** o el botón **SPRINT** para acelerar durante **1.65 segundos**, a cambio de sacrificar **el último anillo de crecimiento**: 2×2 pasa a 1×1 (−3 celdas), 3×3 pasa a 2×2 (−5), 4×4 pasa a 3×3 (−7), etc. Recarga de **11.5 segundos**. Un cuadrado incompleto no puede activar el sprint. Los cuadrados grandes caminan más despacio.
7. Si te captura un rival mayor, puedes reaparecer tras una breve pausa. Cada partida conserva tus progresos solo mientras sigas conectado y vivo; no hay cuentas persistentes.
8. El radar de la interfaz señala al rival más cercano y las flechas indican enemigos fuera del encuadre. Los bots siempre aparecen identificados con **BOT**.

La interacción con piezas y jugadores la decide siempre el servidor, no el navegador.

## Controles

| Dispositivo | Controles |
|---|---|
| Escritorio | **W A S D** o flechas para moverse, combinaciones para diagonal |
| Escritorio | **Q** girar antihorario; **R / E** girar horario |
| Escritorio | **F / Espacio** unir fragmento cercano |
| Escritorio | **Shift** activar sprint si el cuadrado está completo (consume un anillo) |
| Escritorio | Clic y arrastre sobre la arena para moverte hacia ese lugar |
| Móvil | Cruceta inferior izquierda; botones **SPRINT**, **GIRAR** y **UNIR** a la derecha |

## Arquitectura

- **Node.js 22**, servidor HTTP integrado y transporte WebSocket RFC 6455 sin dependencias externas.
- **20 ciclos/segundo** de simulación autoritativa; **14.3 actualizaciones/segundo** para cada cliente (cada 70 ms).
- Instantáneas específicas de cada jugador (**interest management**) y **deltas de fragmentos**: se envían solo piezas nuevas/desaparecidas, con resincronización íntegra cada 5 segundos.
- **Canvas 2D** con predicción conservadora de movimiento local e inputs secuenciados, confirmados por el servidor (**reconciliación**). No se predicen uniones, ataques ni rotaciones; los demás jugadores siguen interpolados.
- Bots con planificación de posiciones de ensamblaje, rotación deliberada, rutas reutilizadas, búsqueda de caminos limitada y decisiones repartidas entre ciclos de simulación, evasión de cuadrados mayores, persecución cuando están completos y diferentes tiempos de reacción/estrategias. Pueden usar sprint cuando huyen de peligros. **Los bots están claramente marcados como BOT**; el contador de personas reales es independiente.
- Arena única de **76×56 celdas**, con hasta **40 conexiones humanas** por defecto y 8 entidades totales como objetivo de población en Render Free (rellenadas con bots). **Aproximadamente 55 a 95 fragmentos simultáneos**, según la población; inicialmente alrededor de 72, en lugar de 240 como en la edición anterior. Índices espaciales en memoria para detectar ocupación y colisiones.
- Datos de partida en memoria. No hay Redis ni PostgreSQL en esta versión.

> **Escalado:** despliega **solo 1 instancia** de este servicio. Varias instancias sin coordinador de salas implicarían mundos separados y clasificaciones inconsistentes. Para escalar después se necesita un servicio de matchmaking y múltiples salas asignadas a procesos fijos; no basta con aumentar el contador de instancias de Render.

## Ejecutar localmente

Requisitos: Node.js **22** o posterior.

```bash
npm install
npm test
npm start
```

Abre `http://localhost:10000`. Para probar múltiples jugadores abre dos pestañas o dos navegadores. Para cambiar de puerto:

```bash
PORT=3000 npm start
```

`npm install` no descarga librerías de producción: el proyecto utiliza solo módulos integrados en Node.

## Desplegar en Render paso a paso

1. Descomprime el ZIP y sube **el contenido** de `quadrift-io/` a la raíz de un repositorio de GitHub. `package.json` y `render.yaml` deben estar en la raíz.
2. Entra a [Render Dashboard](https://dashboard.render.com) y selecciona **New → Blueprint**.
3. Conecta tu cuenta de GitHub y selecciona el repositorio.
4. Usa el archivo `render.yaml` de la raíz y aplica el Blueprint. Este crea un **Web Service** con runtime Node, build `npm ci --omit=dev`, start `npm start` y health check `/health`.
5. Render asignará una URL como `https://quadrift-io.onrender.com` (la real podría ser diferente). Ábrela, introduce un alias y entra.
6. Comprueba `https://<tu-dirección-real>/health`. Devuelve `ok:true`, personas reales, bots, fragmentos y tiempo de actividad. Abre dos pestañas y verifica ambos jugadores en la clasificación.
7. **No habilites 2 o más instancias** hasta implementar salas coordinadas. Para producción, cambia el servicio a un plan con disponibilidad continua; los servidores gratuitos pueden quedarse dormidos.

También puedes usar **New → Web Service** y configurar manualmente Node, build `npm ci --omit=dev`, start `npm start`, health `/health`.

### Variables de entorno

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `PORT` | `10000` | Puerto HTTP + WebSocket (Render lo define automáticamente). |
| `MIN_POPULATION` | `8` | Población objetivo de personas + bots, máximo 26. Pon `0` para desactivar bots. |
| `MAX_HUMANS` | `40` | Máximo de conexiones humanas por servicio, hasta 80. |
| `NODE_ENV` | `production` en Render | Modo de ejecución. |
| `ADSENSE_CLIENT` | vacío | Cliente `ca-pub-...` (anuncios inactivos inicialmente). |
| `ADSENSE_SLOT` | vacío | Identificador numérico de unidad publicitaria (anuncios inactivos inicialmente). |

## Monetización: AdSense

Se incluye una integración **preparada, pero intencionalmente desactivada**: `public/ads.js` y un contenedor fuera del tablero en la pantalla de derrota. No hay anuncios reales en el ZIP. **No basta con poner los identificadores**: la carga publicitaria espera una señal `window.QUADRIFT_AD_CONSENT===true`, que debe provenir de una integración real de gestión de consentimiento antes de habilitarla. La pantalla de privacidad también contiene texto de plantilla que deberá personalizarse.

Para intersticiales a pantalla completa en juegos HTML5, Google ofrece el programa **H5 Games Ads** y su **Ad Placement API**. Requiere aprobación específica y las interrupciones se deben colocar en pausas naturales, nunca durante el movimiento. Documentación: https://support.google.com/adsense/answer/9959170?hl=es y https://developers.google.com/ad-placement/docs/signup .

Si configuras `ADSENSE_CLIENT`, el servidor también proporciona un archivo `/ads.txt` con el formato de Google; consulta los requisitos de Google antes de publicar. Para servir anuncios personalizados en el EEE, Reino Unido o Suiza, Google requiere una CMP certificada que cumpla sus reglas de consentimiento aplicables.

**Importante:** los bots **no generan solicitudes de anuncios**; solo los navegadores humanos pueden cargar anuncios. No se generan impresiones ni clics sintéticos.

## Diseño visual

Dirección de arte **editorial arcade**: papel cálido, tinta oscura, cuadrícula técnica, bloques de color primario, bordes duros y rotulación de manual impreso. Toda la estética se realiza con CSS y Canvas, sin bancos de imágenes, texturas de stock, gradientes neón ni recursos generados por IA.

## Estructura

```text
quadrift-io/
├── render.yaml
├── package.json
├── package-lock.json
├── README.md
├── .gitignore
├── server/
│   ├── index.js       Servidor HTTP, sincronización, validación de controles
│   ├── net.js         Transporte WebSocket sin dependencias
│   └── world.js       Motor, colisiones, bots, sprint y fragmentos temporales
├── public/
│   ├── index.html     Interfaz y pantallas
│   ├── styles.css     Identidad visual y responsive
│   ├── client.js      Canvas, HUD, teclado/mouse/táctil, predicción y sincronización
│   ├── prediction.js  Colisiones locales conservadoras y reproducción de inputs
│   ├── ads.js         Punto de integración publicitaria desactivado
│   ├── favicon.svg
│   ├── privacy.html   Aviso inicial que deberás completar
│   └── robots.txt
└── tests/
    ├── world.test.js  18 pruebas unitarias de reglas
    └── server.test.js Prueba de 2 clientes WebSocket reales
```

## Edición 003 — rendimiento y baja latencia

- El movimiento propio se muestra al recibir el input en el navegador, **sin esperar la próxima respuesta de Render**, siempre que el paso parezca libre; el servidor sigue decidiendo las colisiones y verifica todos los movimientos. Puede existir una corrección visual al chocar con piezas o rivales.
- Cada comando de desplazamiento lleva `seq`; el servidor procesa los pasos en orden a un máximo de uno por tick, devuelve `ack` en la instantánea y el cliente reproduce solo inputs aún pendientes. La cola está limitada para evitar acumulaciones indefinidas.
- Actualizaciones de 125 a **70 ms**; fragmentos del mapa enviados por diferencias. Cada 5 s se reenvía una copia completa para evitar inconsistencias.
- IA optimizada: planificación de rutas con cache, límite de búsqueda y máximo de tres decisiones de bot por tick para evitar picos de procesamiento.
- Indicadores en cabecera: **PING** = ida/vuelta WebSocket (RTT), **SRV** = duración promedio de simulación de un tick, **LOOP** = retraso aproximado del temporizador del servidor. El ping de red no mide directamente la latencia de entrada al juego, pero permite detectar conexiones deficientes.
- Render Free: población objetivo por defecto reducida de 16 a **8** participantes (humanos + bots). Si ya tenías `MIN_POPULATION=16` definido manualmente en Render, cámbialo en **Environment** a `8` (o `4` para diagnosticar carga). La configuración de despliegue no garantiza que Render sobrescriba una variable personalizada existente.
- **23 pruebas automáticas**: reglas, geometría, predicción local, reconciliación conceptual, confirmación de inputs WebSocket, fragmentos diferenciales y telemetría. Se verificó un servidor HTTP/WebSocket real con Node.js. En este entorno Chromium impidió abrir URLs locales, por lo que no se certifica todavía la experiencia visual completa conectada al servidor.

### Publicar la actualización en Render

1. Sustituye el contenido del repositorio GitHub por los archivos de esta edición, manteniendo `render.yaml` y `package.json` en la raíz.
2. Realiza commit y espera al despliegue automático de Render (o selecciona **Manual Deploy → Deploy latest commit**).
3. En Render → Environment, deja `MIN_POPULATION=8` (para diagnóstico puedes usar `4`) y confirma que exista **una única instancia** del servicio.
4. Fuerza recarga del navegador para obtener el nuevo `client.js` y `prediction.js`.
5. Una vez dentro del juego, revisa **PING / SRV / LOOP**, prueba caminar con WASD y compara con la versión 0.2. Comprueba que al unirte a piezas o chocar con rivales se respeta la posición del servidor.

**Interpretación práctica:** PING alto sugiere un problema de red/distancia; SRV alto, CPU de simulación; LOOP alto, saturación del proceso o instancia. Estas métricas son indicativas, no sustituyen un perfilador ni instrumentación de percentiles.

## Edición 002 — cambios y validación

- Motor de piezas temporales con desaparición, renovación gradual, tipos de cuatro celdas y menor densidad.
- Sistema de vista previa de unión, colores verde/rojo, contorno de destino y sonido breve al cerrar un cuadrado.
- Sprint táctico de 1.65 segundos con pérdida de un anillo y recarga de 11.5 segundos; velocidad base dependiente del tamaño.
- Radar y flechas de enemigos fuera de pantalla.
- Rotación alrededor del centro geométrico, solución de bloqueos diagonales e incorporación de masa que respeta huecos, límites y otras piezas.
- IA con selección de objetivos por encaje real, ruta de cuadrícula acotada, amenaza/evasión y caza.
- **19 pruebas** automatizadas aprobadas: 18 del motor y 1 de integración HTTP + dos conexiones WebSocket concurrentes. Se realizó una simulación de 75 segundos de juego (tiempo simulado) con 16 bots y verificación periódica de límites, no superposición y geometría.
- **Interfaz:** renderizada en Chromium para escritorio y móvil con estados de partida *simulados*, sin errores JavaScript durante esa inspección. El navegador de este entorno bloqueó las conexiones HTTP locales directas, por lo que la prueba completa de jugar en Chromium contra el servidor real queda pendiente de repetirse en Render.

## Límites conocidos del MVP

- No hay persistencia de cuentas, logros ni clasificaciones históricas.
- Ante reinicio/despliegue/suspensión del servicio se reinicia la arena; se intenta reconectar al navegador, pero se reentra como jugador nuevo.
- La física de piezas es de casillas enteras, no movimiento analógico continuo; esto favorece encajes precisos y baja latencia.
- Los bots son heurísticos con búsqueda de rutas y no modelos generativos: varían velocidad, estrategia y tiempos de reacción, y pueden quedarse atascados si las piezas forman un obstáculo imposible de rodear. Las rutas y la geometría se calculan de forma determinista en el servidor.
- No existe matchmaking multirregión, moderación completa de apodos, telemetría persistente ni protección profesional anti-DDoS; son trabajo previo a un lanzamiento a gran escala.
- Por seguridad de marca, **no utilices “Tetris” en el nombre comercial**: es una marca registrada de terceros. “QUADRIFT” es nombre provisional y requiere búsqueda formal de marcas/dominio antes de comercializar.

Licencia: código original de este proyecto, reservado para quien lo recibe; no incluye licencias de marcas de terceros.
