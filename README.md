# QUADRIFT.IO — Edición 001

Juego de arena multijugador en tiempo real. **Código fuente completo de un MVP jugable**, preparado para publicarse en Render como un único Web Service. Sin framework de interfaz, sin base de datos y sin dependencias npm de ejecución.

![Visual de la marca](public/favicon.svg)

## Idea y reglas

1. Apareces con **una sola celda**. Te mueves en cualquier dirección por una arena cuadriculada.
2. Las piezas libres tienen entre 1 y 3 celdas. Para **unir** una pieza debe estar tocando lateralmente alguna celda de tu figura, no superponerse y **caber en tu siguiente cuadrado objetivo**. Puedes unir al caminar hacia ella o pulsando **F / Espacio** al estar junto a ella.
3. Puedes rotar tu figura incompleta con **R** (sentido horario) o **Q** (antihorario). Hay piezas que no caben hasta orientar correctamente la figura.
4. Empiezas con objetivo **2×2**. Al completar exactamente 4 celdas sin huecos, se convierte en **un bloque de color sólido** y asciendes a rango 2. Tu siguiente objetivo es 3×3 (9 celdas), luego 4×4 (16), y así hasta 9×9.
5. **Solo estando completo y sólido puedes absorber por choque a un rival de rango estrictamente menor.** Sus celdas se incorporan a tu perímetro y puede que completes directamente tu siguiente cuadrado. Tras esa absorción quedas incompleto y tienes que cerrar el cuadrado para volver a capturar.
6. Si te captura un rival mayor, puedes reaparecer tras una breve pausa. Cada partida conserva tus progresos solo mientras sigas conectado y vivo; no hay cuentas persistentes.

La interacción con piezas y jugadores la decide siempre el servidor, no el navegador.

## Controles

| Dispositivo | Controles |
|---|---|
| Escritorio | **W A S D** o flechas para moverse, combinaciones para diagonal |
| Escritorio | **Q** girar antihorario; **R / E** girar horario |
| Escritorio | **F / Espacio** unir fragmento cercano |
| Escritorio | Clic y arrastre sobre la arena para moverte hacia ese lugar |
| Móvil | Cruceta inferior izquierda, botones **GIRAR** y **UNIR** a la derecha |

## Arquitectura

- **Node.js 22**, servidor HTTP integrado y transporte WebSocket RFC 6455 sin dependencias externas.
- **20 ciclos/segundo** de simulación autoritativa; **8 actualizaciones/segundo** para cada cliente.
- Instantáneas específicas de cada jugador (**interest management**) para no enviar todo el mapa.
- **Canvas 2D** con interpolación en cliente y renderizado a la frecuencia del dispositivo.
- Bots con personalidades diferenciadas: recolectan piezas, evaden a rivales grandes, persiguen objetivos cuando son cuadrados completos y cometen errores de navegación. **Los bots están claramente marcados como BOT**; el contador de personas reales es independiente.
- Arena única de **76×56 celdas**, con hasta **40 conexiones humanas** por defecto y 16 entidades totales como objetivo de población (rellenadas con bots).
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
| `MIN_POPULATION` | `16` | Población objetivo de personas + bots, máximo 26. Pon `0` para desactivar bots. |
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
│   └── world.js       Motor, formas, cuadrados, colisiones, bots
├── public/
│   ├── index.html     Interfaz y pantallas
│   ├── styles.css     Identidad visual y responsive
│   ├── client.js      Canvas, HUD, teclado/mouse/táctil, interpolación
│   ├── ads.js         Punto de integración publicitaria desactivado
│   ├── favicon.svg
│   ├── privacy.html   Aviso inicial que deberás completar
│   └── robots.txt
└── tests/
    ├── world.test.js  10 pruebas unitarias de reglas
    └── server.test.js Prueba de 2 clientes WebSocket reales
```

## Límites conocidos del MVP

- No hay persistencia de cuentas, logros ni clasificaciones históricas.
- Ante reinicio/despliegue/suspensión del servicio se reinicia la arena; se intenta reconectar al navegador, pero se reentra como jugador nuevo.
- La física de piezas es de casillas enteras, no movimiento analógico continuo; esto favorece encajes precisos y baja latencia.
- Los bots son heurísticos, no modelos generativos: varían velocidad, estrategia y fallos, y pueden quedar atascados brevemente.
- No existe matchmaking multirregión, moderación completa de apodos, telemetría persistente ni protección profesional anti-DDoS; son trabajo previo a un lanzamiento a gran escala.
- Por seguridad de marca, **no utilices “Tetris” en el nombre comercial**: es una marca registrada de terceros. “QUADRIFT” es nombre provisional y requiere búsqueda formal de marcas/dominio antes de comercializar.

Licencia: código original de este proyecto, reservado para quien lo recibe; no incluye licencias de marcas de terceros.
