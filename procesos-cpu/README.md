# Módulo Procesos y CPU — RobotOS SmartHome

> ⚠️ **AVISO DE UNIFICACIÓN ARQUITECTÓNICA (FASE 1B):**  
> La lógica central de este módulo ha sido migrada y consolidada en **`src/core/`** (`src/core/proceso.js`, `src/core/scheduler.js`, `src/core/cpu.js`), la cual constituye la **única fuente de verdad** del sistema operativo para evitar duplicación de código y divergencias de estado. Los archivos en `procesos-cpu/src/` re-exportan directamente desde `src/core/` para mantener compatibilidad con las pruebas existentes.

Lógica del módulo Procesos y CPU del Equipo 3, con una página web de prototipo para verla y usarla. Esta versión **no usa Supabase todavía** y la página es **independiente**: no es el dashboard del equipo, solo muestra este módulo.

## Cómo ejecutarlo

Requisito: Node.js (versión LTS). Abre la carpeta en VS Code, abre la terminal (Terminal > New Terminal) y escribe:

```
npm run web      # abre la página web del módulo (luego entra a http://localhost:3000)
npm run demo     # muestra la simulación en la terminal
npm test         # ejecuta las pruebas automáticas
```

Con `npm run web` la terminal queda "ocupada" mostrando que el servidor está encendido; eso es normal. Para apagarlo, pulsa `Control + C` en esa terminal.

No hace falta instalar nada más (no hay dependencias externas).

## Qué hace cada archivo

| Archivo | Para qué sirve |
|---|---|
| `src/proceso.js` | Re-exporta desde `src/core/proceso.js` (clase Proceso, 5 estados y transiciones). |
| `src/scheduler.js` | Re-exporta desde `src/core/scheduler.js` (planificador: PRIORIDAD y ROUND_ROBIN). |
| `src/cpu.js` | Re-exporta desde `src/core/cpu.js` (simula CPU, métricas y línea de tiempo). |
| `src/index.js` | Demo en la terminal con procesos de ejemplo de la casa inteligente. |
| `server.js` | Servidor local mínimo que entrega la página al navegador. |
| `web/index.html` | Estructura de la página: formulario, tabla de procesos, CPU y simulación. |
| `web/app.js` | Conecta los botones de la página con `src/proceso.js` y `src/cpu.js`. |
| `web/estilos.css` | Colores, tipografía y aspecto de la página. |
| `test/proceso.test.js` | Pruebas de creación, estados y transiciones. |
| `test/cpu.test.js` | Pruebas del scheduler y la simulación. |
