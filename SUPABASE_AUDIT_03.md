# Auditoría de integración real con Supabase — RobotOS 03A/03B

**Fecha:** 2026-11-20  
**Alcance:** trazabilidad de persistencia y recuperación para procesos, CPU, memoria física/virtual, VFS y eventos. Auditoría de solo lectura del código; el único archivo creado es este informe.

## Resumen ejecutivo

La integración con Supabase funciona para `kernel_events`: se verificó una inserción y lectura remotas desde un cliente nuevo, y también un evento originado desde la interfaz de la aplicación que siguió disponible en Supabase después de recargar la página. El evento de la interfaz se guardó con `origin=sandbox`; por tanto, el modo sandbox de origen **no equivale** a almacenamiento exclusivamente local.

Esto no implica que el estado operativo de las etapas 03A/03B se guarde o se recupere. Procesos, memoria física y virtual, sistema de archivos, dispositivos, logs, timeline visible y configuración del planificador se mantienen en memoria del navegador/Core o en estado React. El adaptador Supabase delega varias de esas operaciones en `InMemoryPersistenceAdapter`; tampoco se encontró una llamada de la aplicación a `loadHistory()` para rehidratar las vistas.

**Conclusión:** hay persistencia remota real de eventos, pero no persistencia integral ni restauración del estado 03A/03B. La mayoría de las operaciones tiene una ruta de emisión al adaptador, pero sus eventos específicos no se probaron individualmente contra el proyecto remoto.

## 1. Arquitectura actual y recorrido de datos

1. **Configuración y adaptador:** [SystemContext.jsx](./src/context/SystemContext.jsx#L103) crea `SupabasePersistenceAdapter` cuando Supabase está configurado y lo asigna a `syscalls.persistence`; si no lo está, usa directamente `InMemoryPersistenceAdapter`. La selección no está condicionada al rol local mostrado por React.
2. **Operaciones del Core:** [syscalls.js](./src/core/syscalls.js#L78) normaliza y emite eventos al Event Engine y llama a `persist('saveEvent', event)`. Sus constructores conectan las emisiones del [MemoryManager](./src/core/memoryManager.js#L240) y del [VirtualFileSystem](./src/core/virtualFileSystem.js#L27) a la misma ruta.
3. **Event Engine:** [eventEngine.js](./src/core/eventEngine.js) crea eventos estructurados y conserva una bitácora local limitada. Esa bitácora no es el almacenamiento remoto ni la fuente de restauración.
4. **Adaptador Supabase:** [SupabasePersistenceAdapter.js](./src/core/persistence/SupabasePersistenceAdapter.js#L116) convierte y encola eventos para `kernel_events`. `saveEvent()` confirma que el elemento fue aceptado en la cola, no que la escritura remota ya terminó. `flush()` realiza el envío; el indicador y estado del adaptador reflejan ese proceso.
5. **Esquema y políticas:** [002_robotos_telemetry.sql](./supabase/migrations/002_robotos_telemetry.sql#L52) define `kernel_events`, RLS y políticas para lectura e inserción. [003_robotos_processes_config.sql](./supabase/migrations/003_robotos_processes_config.sql) define además la tabla `processes`, pero el adaptador no la usa para guardar procesos.
6. **Estado operativo y React:** [ProcessManager](./src/core/processManager.js), CPU/Scheduler, MemoryManager y VFS conservan su estado en memoria. [SystemContext.jsx](./src/context/SystemContext.jsx#L195) refleja parte de esos datos en React. Reflejar una instantánea del Core en React no la hace durable.
7. **Recuperación:** `loadHistory()` existe en el adaptador, pero no se encontró un consumidor en `SystemContext` ni en las páginas. [getSystemSnapshot](./src/context/SystemContext.jsx#L1306) devuelve explícitamente el snapshot del adaptador en memoria. Al recargar se vuelven a crear procesos, memoria y VFS a partir del estado inicial/mock.

## 2. Matriz de trazabilidad y clasificación

La clasificación indica hasta dónde llega el recorrido verificable. **C no significa que la escritura remota esté garantizada para cada operación**: significa que el código la envía al adaptador configurado, pero esa operación concreta no tuvo una prueba remota individual.

| Operación | Recorrido encontrado | Clasificación | Resultado y limitación |
|---|---|---:|---|
| Prueba técnica directa del adaptador (no es operación 03A/03B) | `SupabasePersistenceAdapter.saveEvent` → cola → `flush` → `kernel_events` → consulta con cliente nuevo | **Evidencia auxiliar** | Inserción y lectura remota verificadas. ID `bfe5853d-c3bb-49ec-a676-1a54fe503c29`. Esta prueba valida el transporte, no la integración de una operación del Core. |
| Evento `ROBOT_GREETING` desde UI | botón Saludar → rutina → Event Engine/syscalls → adaptador → Supabase | **A** | Consultado en Supabase después de emitirlo y de recargar la app. ID `f45f02a6-7bc2-4767-8654-6d428ba9dfbc`; `source=ROUTINE_ENGINE`, `origin=sandbox`. Es una prueba del flujo de eventos, no de todos los tipos de evento. |
| Creación de proceso | `ProcessesPage`/Context → `syscalls.createProcess` → `PROCESS_CREATED` → `saveEvent`; además `saveProcess` | **C** para el evento; **B** para el snapshot | El evento usa la ruta Supabase, pero no se probó remotamente un `PROCESS_CREATED`. `saveProcess` delega en memoria; la tabla `processes` no se escribe desde el adaptador. La tabla remota es legible y devolvió 0 filas en esta auditoría. |
| Cambios de estado | ProcessManager/CPU → evento `PROCESS_STATE_CHANGED` → adaptador | **C** | Ruta de evento existente; el estado actual y el historial de procesos no se rehidratan. No se verificó este tipo de evento en remoto. |
| Terminación de proceso | `syscalls.terminateProcess` → eventos de estado/terminación y liberación → adaptador; `saveProcess` | **C** para eventos; **B** para estado | No hay escritura remota del estado final del proceso. La liberación de recursos cambia el Core local. No se realizó una terminación de prueba contra Supabase. |
| Ejecución de CPU y cambios de contexto | ticks/cambios de contexto en `SystemContext` → `CPU_EXECUTION`/`CPU_CONTEXT_SWITCH` → adaptador | **C** | El envío de eventos está conectado; el timeline renderizado se conserva en React y no se recupera tras reload. No se probó cada tipo en remoto. |
| Métricas de planificación | `saveMetric` → evento `CPU_METRICS_RECORDED` → `kernel_events` | **C** | El adaptador transforma métricas en evento y las envía por la misma cola. No hay tabla de métricas dedicada ni rehidratación del resultado. Prueba unitaria usa cliente falso; no se verificó una métrica real del simulador en Supabase. |
| Asignación/liberación de memoria física | MemoryManager/Syscalls → `MEMORY_ALLOCATED`/`MEMORY_RELEASED` → adaptador | **C** para eventos; **B** para bloques y propietarios | La memoria física y su mapa son locales. Eventos conectados al adaptador, sin prueba remota por tipo ni recuperación del mapa tras recarga. |
| Creación de espacio virtual y tabla de páginas | MemoryManager crea tablas, entradas y marcos en memoria | **E** para persistencia | No se encontró evento ni escritura de snapshot al crear el espacio/tabla. Las tablas y estadísticas se pierden al reiniciar la app. |
| Page fault y reemplazo FIFO/LRU en acceso real | `accessVirtualAddress` → MemoryManager emite `PAGE_FAULT` con datos de página/marco/algoritmo/víctima → Event Engine/syscalls → adaptador | **C** | Ruta de envío existente. No se validó un `PAGE_FAULT` real en la base durante esta prueba. No se guarda el estado resultante de la tabla de páginas. |
| Liberación de páginas residentes | `releaseAddressSpace` emite `PAGE_RELEASED` para marcos residentes; al terminar se libera el espacio local | **C** para los eventos emitidos; **E** para el estado durable | No se emiten equivalentes para cada página no residente/eliminación total de tabla. La liberación no queda reconstruible desde Supabase. |
| Laboratorio comparativo FIFO/LRU | `simulateReferenceString` y comparación en MemoryManager; resultados temporales en React | **B** | El cálculo es del Core, pero no se registra ni persiste como ejecución. El control “Siguiente paso” avanza la presentación sobre el resultado calculado; no ejecuta un paso de reemplazo en el Core. |
| Selección del algoritmo/quantum de CPU y reemplazo | `algorithm`, `quantum` y configuración en React/Core | **B** | Afecta la ejecución local, pero no se persiste como configuración recuperable ni se emite un evento de configuración dedicado. |
| Operaciones CRUD del VFS | Contexto → Syscalls/VFS en `Map` → eventos VFS → adaptador | **C** para eventos; **B** para archivos/contenido | Los eventos se envían por la ruta común, sin verificación remota individual. Contenido, estructura y permisos son locales y parten de `INITIAL_FILE_SYSTEM`; no existe restauración desde Supabase. |
| Estado de dispositivos y logs | Core/Context → métodos `saveDeviceState`/`saveLog` | **B** para los datos | En `SupabasePersistenceAdapter` esos métodos delegan en `InMemoryPersistenceAdapter`; la emisión eventual de algún evento de operación no persiste el snapshot del dispositivo/log. |
| Gráfica de CPU/potencia y métricas de almacenamiento/batería | Componentes React reciben valores fijos o calculados sobre constantes | **D** | Son indicadores visuales, no consulta histórica de Supabase ni telemetría completa del hardware/simulador. |
| Historial visible después de recargar | `loadHistory()` existe; ninguna página/Context lo invoca para poblar la interfaz | **E** | La fila remota sobrevive, pero la aplicación no restaura el historial en la UI. `getSystemSnapshot()` entrega datos locales. |

## 3. Evidencia por subsistema

### Eventos y adaptador

- [syscalls.js](./src/core/syscalls.js#L78) construye el evento y en la línea 90 invoca `saveEvent`. Las emisiones de memoria y VFS se enlazan al mismo publisher en las líneas 26–31.
- [SupabasePersistenceAdapter.js](./src/core/persistence/SupabasePersistenceAdapter.js#L116) encola y programa el envío; las líneas 275–326 implementan `flush()` y reintentos de errores transitorios (hasta `MAX_ATTEMPTS=5`, línea 29). La cola es memoria del proceso, no una outbox durable ante cierre abrupto.
- [SupabasePersistenceAdapter.js](./src/core/persistence/SupabasePersistenceAdapter.js#L159) consulta `kernel_events` mediante `loadHistory()`. En caso de error, el método conserva fallback local; un consumidor tendría que exponer el error/estado para no presentar ese fallback como historial remoto confirmado.
- [saveProcess](./src/core/persistence/SupabasePersistenceAdapter.js#L182), `saveDeviceState`, `saveLog` y `getSystemSnapshot` delegan en el adaptador en memoria (líneas 197–210). `saveMetric()` (líneas 185–195) sí lo traduce a `CPU_METRICS_RECORDED` y lo envía por `saveEvent`.
- El comentario de `saveProcess` indica que no hay tabla, aunque la migración 003 sí crea `processes`; el problema práctico es que el adaptador no escribe en ella.

### Procesos y CPU

- [processManager.js](./src/core/processManager.js) mantiene procesos y relaciones en memoria; [cpu.js](./src/core/cpu.js) y [scheduler.js](./src/core/scheduler.js) calculan ejecuciones localmente.
- [syscalls.js](./src/core/syscalls.js#L127) crea el proceso; las líneas 195–235 emiten eventos y llaman `saveProcess`. La terminación está en las líneas 244–310. El evento no sustituye al snapshot de proceso ni permite restaurar el estado actual.
- [SystemContext.jsx](./src/context/SystemContext.jsx#L240) guarda algoritmo y quantum en estado React; timeline y métricas también se alojan en React (líneas 247–248). CPU emite eventos y llama a `saveMetric` (líneas 331–405 y 563–588), pero no existe la ruta de lectura para reconstruirlos.
- [ProcessesPage.jsx](./src/pages/ProcessesPage.jsx#L222) conecta los selectores de algoritmos y quantum al Context. La carga se ejecuta en el motor local; la configuración desaparece al recargar.

### Memoria física y virtual

- [memoryManager.js](./src/core/memoryManager.js#L570) asigna bloques y [freeProcessMemory](./src/core/memoryManager.js#L628) los libera por PID; los eventos asociados salen por el publisher configurado. El estado de bloques, propietario, páginas, marcos y estadísticas vive en estructuras locales.
- `createAddressSpace()` (línea 131) crea el espacio y la tabla sin evento de creación. Los accesos pueden emitir `PAGE_FAULT` (líneas 314 y 353); `releaseAddressSpace()` (línea 375) emite `PAGE_RELEASED` solo para páginas residentes. El laboratorio de referencias usa `simulateReferenceString()` (línea 403) y no la ruta persistente.
- [MemoryPage.jsx](./src/pages/MemoryPage.jsx#L337) y líneas 431 en adelante presentan snapshots reales del MemoryManager actual, no datos recuperados de Supabase. Los resultados siguen siendo volátiles.

### Sistema de archivos

- [virtualFileSystem.js](./src/core/virtualFileSystem.js#L27) mantiene el VFS y emite eventos; las operaciones pasan por Syscalls (por ejemplo, lectura en [syscalls.js](./src/core/syscalls.js#L398), escritura/creación en línea 463 y eliminación en línea 580).
- La estructura y contenidos parten de `INITIAL_FILE_SYSTEM` en [SystemContext.jsx](./src/context/SystemContext.jsx#L209). No se encontró adaptador de archivos ni migración para contenido/directorios/permisos, ni un camino de carga desde Supabase.

## 4. Prueba real contra Supabase

No se imprimieron valores de credenciales. Se verificó únicamente que `.env.local` contiene `VITE_SUPABASE_URL` y una clave publicable (`VITE_SUPABASE_PUBLISHABLE_KEY`).

| Comprobación | Resultado |
|---|---|
| Inserción de evento de prueba mediante `SupabasePersistenceAdapter` | Correcta; evento `SUPABASE_AUDIT_PROBE`, ID `bfe5853d-c3bb-49ec-a676-1a54fe503c29`. |
| Lectura posterior con un cliente/adaptador nuevo | Correcta; se encontró el evento en `kernel_events`. |
| Emisión desde la aplicación | Correcta; botón Saludar produjo `ROBOT_GREETING`, ID `f45f02a6-7bc2-4767-8654-6d428ba9dfbc`, `origin=sandbox`. |
| Persistencia después de recargar el navegador | Correcta; una nueva consulta remota encontró el mismo evento. La UI, en cambio, no lo volvió a mostrar como historial. |
| Tabla `processes` | La consulta remota fue legible y devolvió 0 filas. Confirma la disponibilidad de la tabla, no la persistencia de procesos. |
| Alcance | La prueba demuestra el camino real de `kernel_events` y su lectura. **No** demuestra que cada tipo de evento 03A/03B, los procesos, métricas, páginas, memoria o VFS se hayan guardado. |

Consulta de verificación que puede ejecutarse desde el SQL Editor de Supabase:

```sql
select event_id, occurred_at, source, type, origin, payload
from public.kernel_events
where event_id in (
  'bfe5853d-c3bb-49ec-a676-1a54fe503c29',
  'f45f02a6-7bc2-4767-8654-6d428ba9dfbc'
);

select count(*) as process_rows from public.processes;
```

La primera consulta permite comprobar los dos registros de auditoría. La segunda solo informa el estado actual de la tabla; un resultado cero no invalida que la tabla exista.

## 5. Problemas de interfaz y recuperación

1. **Descripción de sandbox confusa:** [OverviewPage.jsx](./src/pages/OverviewPage.jsx#L114) y línea 143 presentan el perfil USER como “SANDBOX LOCAL” y el adaptador como `InMemory/Sandbox`. Sin embargo, con Supabase configurado el adaptador usado por `SystemContext` puede escribir eventos con `origin=sandbox` en Supabase; la prueba real de `ROBOT_GREETING` lo confirmó. Conviene distinguir origen/rol de destino de almacenamiento.
2. **No hay restauración del historial:** el evento permanece en la base tras el reload, pero ninguna vista consulta `loadHistory()`. La lista que muestra la aplicación se reconstruye de estado inicial/local.
3. **Métricas no equivalentes:** `SystemContext` fija almacenamiento en 26.8/64 GB y batería en 84%; potencia deriva de una constante (líneas 631–634). [ResourceCharts.jsx](./src/components/overview/ResourceCharts.jsx#L16) alimenta el gráfico de CPU con una serie predefinida. No son mediciones guardadas ni recuperadas desde Supabase.
4. **Estado inicial de UI local:** procesos, VFS, dispositivos y logs parten de `INITIAL_*`/`mockData` ([SystemContext.jsx](./src/context/SystemContext.jsx#L209), líneas 215–233). Logs y dispositivos no quedan guardados en tablas Supabase por el adaptador actual.
5. **Timeline y métricas de CPU volátiles:** se calculan y muestran a partir de la ejecución actual, pero se guardan como eventos sin una ruta de lectura/reconstrucción. Un nuevo mount no recupera la comparación ni el último resultado.
6. **Paso del laboratorio:** el botón de avance recorre una línea de tiempo ya calculada y revela pasos; no representa una transacción de memoria/reemplazo ejecutada individualmente en cada clic.
7. **Indicador de sincronización:** `SYNCED` describe el estado de la cola de eventos, no que procesos, archivos, páginas o snapshots hayan sido persistidos.

## 6. Pruebas existentes y resultados

- `npm test`: **67 aprobadas, 0 fallidas**. Incluye pruebas de procesos, scheduler, CPU, memoria, VFS, syscalls y memoria virtual.
- [supabase-adapter.test.js](./test/supabase-adapter.test.js#L1) declara que usa un cliente falso sin red. Sus pruebas validan serialización, cola, `saveMetric`, reintentos y errores de adaptador, pero no demuestran conectividad remota.
- La salida incluye el aviso `23514: check violation` de la prueba intencional de error permanente; la suite terminó con código 0.
- La prueba remota descrita arriba se ejecutó por separado contra el proyecto configurado, sin mocks.
- No se ejecutó `npm run build` en esta auditoría.

## 7. Plan de corrección priorizado

1. **P0 — Definir y mostrar correctamente el destino del sandbox.** Acordar si los eventos USER con `origin=sandbox` deben persistirse en Supabase o permanecer solo locales. Alinear `AuthContext`, etiquetas y estado del adaptador con esa política; no inferir “local” únicamente por `origin=sandbox`.
2. **P1 — Completar persistencia/lectura de procesos.** Implementar el uso real de la tabla `processes` existente o documentar una decisión distinta; definir cómo se guardan transiciones, asociaciones con dispositivos y restauración por sesión. Evitar que el evento de creación sea el único rastro.
3. **P1 — Persistir y rehidratar la ejecución CPU.** Acordar un contrato durable para eventos/timeline/métricas, asociarlos a sesión/carga/algoritmo/quantum y reconstruir la UI usando `loadHistory()` o una consulta dedicada.
4. **P1 — Definir persistencia del VFS y memoria virtual.** Crear almacenamiento versionado para archivos/directorios/permisos y, si el requisito es recuperar el estado tras recarga, para espacios/tablas de página. Añadir eventos de creación/eliminación de espacio y cubrir páginas no residentes; conservar la memoria física como estado derivado consistente.
5. **P2 — Clarificar estado de dispositivos, logs y snapshots.** Los métodos actuales del adaptador Supabase son delegaciones en memoria; decidir si son efímeros o persistentes, y evitar presentarlos como guardados remotamente.
6. **P2 — Hacer observable la confirmación remota.** Distinguir “encolado”, “sincronizado” y “error”; conservar/reintentar de manera durable si ese es un requisito; propagar fallos de lectura en vez de permitir que el fallback local parezca historial remoto.
7. **P3 — Automatizar pruebas de integración remota optativas.** Mantener pruebas unitarias con clientes falsos y añadir un grupo de smoke tests reales opt-in para inserción/lectura de los tipos críticos, con credenciales no impresas y limpieza segura. Añadir pruebas de rehidratación luego de reload.
8. **P3 — Reemplazar o rotular datos visuales simulados.** Conectar métricas de almacenamiento/batería/potencia a fuentes reales del simulador o etiquetarlas explícitamente; usar datos de CPU reales para la gráfica histórica.

## 8. Relación con los requisitos de 03A/03B

| Requisito | Estado auditado |
|---|---|
| Evento estructurado creado y enviado al adaptador | **Parcial:** los caminos principales de procesos/CPU/memoria/VFS emiten eventos, pero no todos los ciclos tienen eventos (por ejemplo, creación de espacio virtual); la cola no equivale por sí misma a confirmación remota. |
| Persistencia real de cada evento requerido | **Parcial:** confirmada para `ROBOT_GREETING` y la prueba de auditoría; no verificada operación por operación. |
| Persistir historial, timeline y métricas CPU | **Parcial:** `saveMetric` serializa métricas como evento; falta restauración de métricas/timeline en UI y prueba remota específica. |
| Guardar/restaurar procesos | **Incompleto:** existe tabla remota, pero `saveProcess` delega en memoria y la consulta remota de la tabla devolvió 0 filas. |
| Guardar/restaurar memoria y páginas | **Incompleto:** estado en MemoryManager local; eventos de algunos fallos/liberaciones no son snapshots recuperables; creación de espacio no se emite. |
| Guardar/restaurar VFS | **Incompleto:** CRUD local y eventos encaminados al adaptador; contenido/estructura no se persisten ni rehidratan. |
| Reintentos | **Parcial:** hay reintentos en memoria para fallos transitorios; no hay cola durable ante cierre y errores permanentes se registran como fallidos. |
| No declarar éxito sin evidencia | **Cumplido para esta auditoría:** solo se declara comprobado el flujo de eventos que tuvo lectura remota real. La etiqueta de sincronización de la UI necesita un alcance más explícito. |

## Inventario principal inspeccionado

- Core: [processManager.js](./src/core/processManager.js), [proceso.js](./src/core/proceso.js), [cpu.js](./src/core/cpu.js), [scheduler.js](./src/core/scheduler.js), [memoryManager.js](./src/core/memoryManager.js), [virtualFileSystem.js](./src/core/virtualFileSystem.js), [eventEngine.js](./src/core/eventEngine.js), [syscalls.js](./src/core/syscalls.js), [index.js](./src/core/index.js).
- Persistencia: [IPersistenceAdapter.js](./src/core/persistence/IPersistenceAdapter.js), [InMemoryPersistenceAdapter.js](./src/core/persistence/InMemoryPersistenceAdapter.js), [SupabasePersistenceAdapter.js](./src/core/persistence/SupabasePersistenceAdapter.js), migraciones 002 y 003.
- React/UI: [SystemContext.jsx](./src/context/SystemContext.jsx), [AuthContext.jsx](./src/context/AuthContext.jsx), [OverviewPage.jsx](./src/pages/OverviewPage.jsx), [ProcessesPage.jsx](./src/pages/ProcessesPage.jsx), [MemoryPage.jsx](./src/pages/MemoryPage.jsx), [ResourceCharts.jsx](./src/components/overview/ResourceCharts.jsx).
- Validación: [package.json](./package.json), [core.test.js](./test/core.test.js), [supabase-adapter.test.js](./test/supabase-adapter.test.js), [etapa-03a.test.js](./test/etapa-03a.test.js), [memoria-virtual.test.js](./test/memoria-virtual.test.js).

**Cambios de código:** ninguno. El informe es el único archivo nuevo de esta auditoría.
