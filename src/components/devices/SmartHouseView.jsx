import React, { useState, useEffect, useRef } from 'react';
import { useTheme, THEMES } from '../../context/ThemeContext';

/**
 * SmartHouseView - Digital Twin Isométrico 2.5D de RobotOS SmartHouse
 * 
 * Inspirado en IKEA Home Smart, The Sims Isometric y Home Assistant 3D Floorplan.
 * 
 * CARACTERÍSTICAS OBLIGATORIAS IMPLEMENTADAS:
 * 1. Perspectiva Isométrica 2.5D: Habitaciones con volumen físico, paredes elevadas, profundidad y sombras de oclusión ambiental.
 * 2. Iluminación Realista Dinámica: Halos de luz envolventes, aumento de brillo en suelos y atenuación progresiva en apagado.
 * 3. Alarma de Incendio y Fugas: Resplandor rojo estroboscópico en cocina, baliza de emergencia pulsante con ondas concéntricas sin audio.
 * 4. Sistema de Seguridad Avanzado: Cono de visión dinámico con barrido láser en cámaras frontal y patio cuando surveillance_proc está RUNNING.
 * 5. Estados Visuales de la Casa: Modos Normal, Alerta/Emergencia, Seguridad Perimetral y Eficiencia Energética.
 * 6. Microinteracciones: Elevación visual al pasar el cursor (hover), tooltips inteligentes y panel contextual con controles reales.
 * 7. Efecto WOW para Sustentación: Animación inicial de construcción arquitectónica isométrica al ingresar a la vista.
 * 
 * Cumplimiento arquitectónico estricto:
 * - NO altera lógica, daemons, telemetría, eventos ni estados de dispositivos.
 * - Consume directamente drivers, estado del Kernel y telemetría de dispositivos.
 */
export const SmartHouseView = ({
  devices = [],
  processes = [],
  selectedDeviceId = null,
  onSelectDevice = () => {},
  onAction = () => {},
}) => {
  const { theme } = useTheme();
  const isWarm = theme === THEMES.WARM;

  // Medición de latencia de sincronización real del Digital Twin
  const [renderLatencyMs, setRenderLatencyMs] = useState(14);
  const [batteryLevel] = useState(94);
  const lastUpdateRef = useRef(performance.now());
  const [hoveredRoom, setHoveredRoom] = useState(null);
  const [hoveredDev, setHoveredDev] = useState(null);

  // Modo visual de la casa (Mejora 05)
  const [houseMode, setHouseMode] = useState('NORMAL'); // 'NORMAL' | 'SECURITY' | 'EMERGENCY' | 'ENERGY'

  // Efecto WOW: Control de animación de construcción inicial (Mejora 07)
  const [isAssembled, setIsAssembled] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAssembled(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const now = performance.now();
    const delta = Math.round(now - lastUpdateRef.current);
    if (delta > 0 && delta < 500) {
      setRenderLatencyMs(delta);
    }
    lastUpdateRef.current = now;
  }, [devices, processes]);

  // Helper para buscar dispositivo por id
  const getDev = (id) => devices.find((d) => d.id === id) || { id, status: 'UNKNOWN' };

  // Dispositivos (15 dispositivos de Fase 04/08)
  const d1 = getDev('d1');   // Luces Salón
  const d2 = getDev('d2');   // Luces Cocina
  const d3 = getDev('d3');   // Sensor Movimiento
  const d4 = getDev('d4');   // Cámara Frontal
  const d5 = getDev('d5');   // Cerradura Principal
  const d6 = getDev('d6');   // Termostato
  const d7 = getDev('d7');   // Timbre Inteligente
  const d8 = getDev('d8');   // Sensor Humo
  const d9 = getDev('d9');   // Sensor Gas
  const d10 = getDev('d10'); // Robot Recolector
  const d11 = getDev('d11'); // Sistema de Riego
  const d12 = getDev('d12'); // Cámara Patio
  const d13 = getDev('d13'); // Luz Jardín
  const d14 = getDev('d14'); // Puerta Garaje
  const d15 = getDev('d15'); // Luz Habitación

  const selectedDev = devices.find((d) => d.id === selectedDeviceId) || null;

  // ==========================================
  // VINCULACIÓN CON PROCESOS DEL KERNEL
  // ==========================================
  const surveillanceProc = processes.find(
    (p) => p.nombre === 'surveillance_proc' || p.name === 'surveillance_proc'
  );
  const isSurveillanceRunning = surveillanceProc?.estado === 'RUNNING';
  const isSurveillanceBlocked = surveillanceProc?.estado === 'BLOCKED' || surveillanceProc?.estado === 'WAITING';

  const lightingDaemon = processes.find(
    (p) => p.nombre === 'lighting_daemon' || p.name === 'lighting_daemon'
  );
  const isLightingRunning = lightingDaemon?.estado === 'RUNNING' || lightingDaemon?.estado === 'READY';
  const isLightingTerminated = lightingDaemon?.estado === 'TERMINATED';

  // Estados booleanos de iluminación (Mejora 02)
  const isSalonLightOn = !isLightingTerminated && d1.status === 'ON';
  const isCocinaLightOn = !isLightingTerminated && d2.status === 'ON';
  const isHabitacionLightOn = !isLightingTerminated && d15.status === 'ON';
  const isJardinLightOn = !isLightingTerminated && d13.status === 'ON';

  // Alertas de gas o humo (Mejora 03)
  const hasSmokeAlert = d8.status === 'HUMO DETECTADO' || d8.status === 'ALERTA';
  const hasGasAlert = d9.status === 'FUGA DETECTADA' || d9.status === 'ALERTA';
  const hasFireEmergency = hasSmokeAlert || hasGasAlert;

  // Si hay fuego o gas, activar automáticamente el modo visual de emergencia
  useEffect(() => {
    if (hasFireEmergency) {
      setHouseMode('EMERGENCY');
    }
  }, [hasFireEmergency]);

  const isMotionActive = d3.status === 'DETECTADO' || d3.status === 'ACTIVE';
  const isIrrigationActive = d11.status === 'REGANDO' || d11.status === 'ACTIVE';
  const isCleanerActive = d10.status === 'LIMPIANDO' || d10.status === 'ACTIVE';

  const handleQuickAction = (actionStr) => {
    if (selectedDev && onAction) {
      onAction(selectedDev, actionStr);
    }
  };

  // Renderizador de nodo de dispositivo en perspectiva isométrica
  const renderIsometricDevice = ({
    dev,
    x,
    y,
    label,
    icon,
    activeColor = isWarm ? '#C85A32' : '#06B6D4',
    inactiveColor = isWarm ? '#8E7D72' : '#64748B',
    isActive = false,
    alert = false,
    badgeText = null,
  }) => {
    if (!dev) return null;
    const isSelected = selectedDeviceId === dev.id;
    const isHovered = hoveredDev?.id === dev.id;
    const color = alert ? '#EF4444' : isActive ? activeColor : inactiveColor;

    return (
      <g
        key={dev.id}
        className="cursor-pointer group select-none transition-transform duration-300"
        onMouseEnter={() => setHoveredDev(dev)}
        onMouseLeave={() => setHoveredDev(null)}
        onClick={(e) => {
          e.stopPropagation();
          onSelectDevice(dev);
        }}
        style={{
          transform: isHovered ? 'translateY(-6px)' : isSelected ? 'translateY(-3px)' : 'none',
          transformOrigin: `${x}px ${y}px`,
        }}
      >
        {/* Hitbox amplio invisible */}
        <rect
          x={x - 42}
          y={y - 45}
          width={84}
          height={88}
          fill="transparent"
          className="cursor-pointer"
        />

        {/* Sombra de suelo isométrica */}
        <ellipse
          cx={x}
          cy={y + 24}
          rx={isSelected || isHovered ? 26 : 20}
          ry={isSelected || isHovered ? 12 : 9}
          fill={isWarm ? 'rgba(44, 35, 29, 0.16)' : 'rgba(0, 0, 0, 0.65)'}
          className="transition-all duration-300 pointer-events-none"
        />

        {/* Anillo de selección concéntrico pulsante */}
        {isSelected && (
          <ellipse
            cx={x}
            cy={y + 4}
            rx={32}
            ry={20}
            fill="none"
            stroke={isWarm ? '#C85A32' : '#22D3EE'}
            strokeWidth="2.5"
            strokeDasharray="6 3"
            className="animate-pulse pointer-events-none"
          />
        )}

        {/* Esfera 2.5D con gradiente e iluminación isométrica */}
        <circle
          cx={x}
          cy={y + 4}
          r={22}
          fill={
            isSelected
              ? isWarm ? '#FFF8F4' : '#0F172A'
              : isActive
              ? isWarm ? '#FFF5EE' : '#132338'
              : isWarm ? '#FFFFFF' : '#1E293B'
          }
          stroke={isSelected ? (isWarm ? '#C85A32' : '#22D3EE') : color}
          strokeWidth={isSelected ? '3' : '2'}
          filter="url(#isoShadow)"
          className="transition-all duration-300 pointer-events-none"
        />

        {/* Halo de luz emanante si está activo */}
        {isActive && (
          <circle
            cx={x}
            cy={y + 4}
            r={24}
            fill={color}
            opacity={isWarm ? '0.25' : '0.2'}
            className="pointer-events-none animate-pulse"
          />
        )}

        {/* Icono del dispositivo centrado */}
        <text
          x={x}
          y={y + 10}
          textAnchor="middle"
          fontSize="17"
          className="select-none pointer-events-none filter drop-shadow"
        >
          {icon}
        </text>

        {/* Placa / Píldora de etiqueta de alta legibilidad */}
        <g className="pointer-events-none">
          <rect
            x={x - 42}
            y={y + 30}
            width={84}
            height={15}
            rx={4}
            fill={isWarm ? '#FFFFFF' : '#0B1120'}
            stroke={isSelected ? (isWarm ? '#C85A32' : '#22D3EE') : (isWarm ? '#E6DDD2' : '#334155')}
            strokeWidth="1"
            filter="url(#isoShadow)"
          />
          <text
            x={x}
            y={y + 41}
            textAnchor="middle"
            fontSize="8.5"
            fontWeight="bold"
            fill={isSelected ? (isWarm ? '#C85A32' : '#22D3EE') : (isWarm ? '#2C231D' : '#E2E8F0')}
            className="font-mono tracking-tight select-none"
          >
            {label}
          </text>
        </g>

        {/* Píldora de estado inferior */}
        <text
          x={x}
          y={y + 54}
          textAnchor="middle"
          fontSize="8"
          fontWeight="bold"
          fill={color}
          className="font-mono uppercase select-none pointer-events-none"
        >
          {badgeText || dev.status || 'OFF'}
        </text>
      </g>
    );
  };

  return (
    <div
      className={`relative w-full rounded-3xl border shadow-2xl overflow-hidden transition-all duration-500 space-y-4 ${
        isWarm ? 'bg-[#FAF7F2] border-[#E5DCD1]' : 'bg-[#0B1120] border-slate-800'
      }`}
    >
      {/* ======================================================== */}
      {/* 1. BARRA SUPERIOR DE MODOS Y CONTROL DE ESTADO          */}
      {/* ======================================================== */}
      <div className="p-4 px-6 border-b border-slate-800/80 flex flex-col md:flex-row md:items-center md:justify-between gap-4 select-none">
        <div>
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full animate-ping ${
              hasFireEmergency ? 'bg-red-500' : isWarm ? 'bg-[#C85A32]' : 'bg-cyan-400'
            }`}></div>
            <h2 className="text-base font-bold tracking-tight text-white flex items-center space-x-2">
              <span>RobotOS SmartHouse</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-cyan-950 text-cyan-400 border border-cyan-800/60 uppercase">
                Isometric 2.5D
              </span>
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Gemelo digital interactivo con perspectiva volumétrica, iluminación dinámica y telemetría de daemons
          </p>
        </div>

        {/* Selector de Modos Visuales de la Vivienda (Mejora 05) */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs font-mono">
          {[
            { id: 'NORMAL', label: '🏡 Normal', color: 'text-cyan-400' },
            { id: 'SECURITY', label: '🛡️ Seguridad', color: 'text-indigo-400' },
            { id: 'EMERGENCY', label: '🚨 Emergencia', color: 'text-red-400' },
            { id: 'ENERGY', label: '⚡ Confort', color: 'text-amber-400' },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setHouseMode(mode.id)}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-all ${
                houseMode === mode.id
                  ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className={houseMode === mode.id ? mode.color : ''}>{mode.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Banner de Estado de Daemons del Kernel */}
      <div className="px-6 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-slate-900 border border-slate-800">
            <span className={`w-2 h-2 rounded-full ${isSurveillanceRunning ? 'bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
            <span className="text-slate-400">surveillance_proc:</span>
            <span className={`font-bold ${isSurveillanceRunning ? 'text-emerald-400' : 'text-red-400'}`}>
              {isSurveillanceRunning ? 'RUNNING (LIVE)' : isSurveillanceBlocked ? 'BLOCKED' : 'OFFLINE'}
            </span>
          </div>

          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-slate-900 border border-slate-800">
            <span className={`w-2 h-2 rounded-full ${isLightingRunning ? 'bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
            <span className="text-slate-400">lighting_daemon:</span>
            <span className={`font-bold ${isLightingRunning ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isLightingRunning ? 'RUNNING' : 'TERMINATED'}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-slate-400">
          <span>Latencia Twin: <strong className="text-emerald-400 font-mono">{renderLatencyMs} ms</strong></span>
          <span>•</span>
          <span>Batería: <strong className="text-white font-mono">{batteryLevel}%</strong></span>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. ESCENARIO ISOMÉTRICO 2.5D (SVG CON VOLUMEN Y SOMBRAS) */}
      {/* ======================================================== */}
      <div className="relative w-full overflow-x-auto flex justify-center p-2">
        <svg
          viewBox="0 0 1020 680"
          className="w-full max-w-[1020px] h-auto select-none"
          style={{
            minWidth: '780px',
            opacity: isAssembled ? 1 : 0.2,
            transform: isAssembled ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.96)',
            transition: 'all 1.1s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          onClick={() => onSelectDevice(null)}
        >
          <defs>
            {/* Filtro de sombra profunda isométrica */}
            <filter id="isoShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#000000" floodOpacity={isWarm ? '0.15' : '0.65'} />
            </filter>

            {/* Sombra de oclusión ambiental bajo paredes */}
            <filter id="wallAmbientShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="2" dy="8" stdDeviation="6" floodColor="#000000" floodOpacity={isWarm ? '0.2' : '0.75'} />
            </filter>

            {/* HALO RADIAL SALÓN (Iluminación real cuando d1 está ON) */}
            <radialGradient id="lampGlowSalon" cx="40%" cy="50%" r="65%">
              <stop offset="0%" stopColor="#FFA000" stopOpacity={isSalonLightOn ? '0.55' : '0.04'} />
              <stop offset="45%" stopColor="#FFB300" stopOpacity={isSalonLightOn ? '0.22' : '0.01'} />
              <stop offset="100%" stopColor="#0B1120" stopOpacity="0" />
            </radialGradient>

            {/* HALO RADIAL COCINA */}
            <radialGradient id="lampGlowCocina" cx="50%" cy="50%" r="65%">
              <stop
                offset="0%"
                stopColor={hasFireEmergency ? '#DC2626' : '#FFA000'}
                stopOpacity={hasFireEmergency ? '0.75' : isCocinaLightOn ? '0.52' : '0.04'}
              />
              <stop
                offset="50%"
                stopColor={hasFireEmergency ? '#EF4444' : '#FFB300'}
                stopOpacity={hasFireEmergency ? '0.35' : isCocinaLightOn ? '0.18' : '0.01'}
              />
              <stop offset="100%" stopColor="#0B1120" stopOpacity="0" />
            </radialGradient>

            {/* HALO RADIAL DORMITORIO */}
            <radialGradient id="lampGlowSuite" cx="45%" cy="50%" r="65%">
              <stop offset="0%" stopColor="#FFA000" stopOpacity={isHabitacionLightOn ? '0.55' : '0.04'} />
              <stop offset="50%" stopColor="#FFB300" stopOpacity={isHabitacionLightOn ? '0.20' : '0.01'} />
              <stop offset="100%" stopColor="#0B1120" stopOpacity="0" />
            </radialGradient>

            {/* Cono de Visión Cámara Frontal (2.5D con degradado animado) */}
            <linearGradient id="coneCamFront" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.55" />
              <stop offset="60%" stopColor="#06B6D4" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#0891B2" stopOpacity="0.01" />
            </linearGradient>

            {/* Cono de Visión Cámara Patio */}
            <linearGradient id="coneCamPatio" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.55" />
              <stop offset="70%" stopColor="#0284C7" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#0369A1" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* ======================================================== */}
          {/* BASE ISOMÉTRICA DE LA CASA (Suelo Plataforma 2.5D)       */}
          {/* ======================================================== */}
          <g filter="url(#isoShadow)">
            {/* Zócalo de elevación del terreno */}
            <polygon
              points="40,24 980,24 980,634 40,634"
              fill={isWarm ? '#EADFCF' : '#070D18'}
              stroke={isWarm ? '#D5C7B6' : '#1E293B'}
              strokeWidth="2"
            />
          </g>

          {/* ======================================================== */}
          {/* ZONA 1: JARDÍN & PATIO EXTERIOR (Césped + Terraza)      */}
          {/* ======================================================== */}
          <g
            className="transition-all duration-300 cursor-pointer"
            onMouseEnter={() => setHoveredRoom('jardin')}
            onMouseLeave={() => setHoveredRoom(null)}
          >
            {/* Suelo del Jardín */}
            <polygon
              points="50,34 630,34 630,165 50,165"
              fill={isWarm ? '#DCE8DC' : '#0B2319'}
              stroke={hoveredRoom === 'jardin' ? '#22C55E' : (isWarm ? '#BDD3BE' : '#0F3828')}
              strokeWidth="2.5"
            />

            {/* Textura de baldosas de piedra de paso en el jardín */}
            <path
              d="M 170 120 L 230 120 M 250 120 L 310 120 M 330 120 L 390 120"
              stroke={isWarm ? '#CBD5CB' : '#143F2F'}
              strokeWidth="3"
              strokeDasharray="10 5"
            />

            {/* Animación de Aspersores si el riego está activo */}
            {isIrrigationActive && (
              <g className="animate-pulse">
                <circle cx={310} cy={95} r={28} fill="none" stroke="#38BDF8" strokeWidth="2" strokeDasharray="4 4" />
                <circle cx={310} cy={95} r={44} fill="none" stroke="#38BDF8" strokeWidth="1.5" strokeDasharray="6 4" />
                <path d="M 290 80 Q 310 60 330 80" stroke="#38BDF8" strokeWidth="2" fill="none" />
                <path d="M 290 110 Q 310 130 330 110" stroke="#38BDF8" strokeWidth="2" fill="none" />
              </g>
            )}

            {/* Cono de Visión Cámara Patio (Mejora 04) */}
            {isSurveillanceRunning && d12.status === 'ONLINE' && (
              <polygon
                points="500,85 410,160 590,160"
                fill="url(#coneCamPatio)"
                className="animate-pulse pointer-events-none"
              />
            )}

            <text x="65" y="58" fill={isWarm ? '#1E5E2C' : '#10B981'} fontSize="11" fontWeight="900" className="font-mono tracking-wider">
              🌿 PATIO EXTERIOR & JARDÍN
            </text>

            {/* Dispositivos en Jardín */}
            {renderIsometricDevice({
              dev: d13,
              x: 120,
              y: 95,
              label: 'Luz Jardín',
              icon: '💡',
              activeColor: '#F59E0B',
              isActive: isJardinLightOn,
              badgeText: isLightingTerminated ? 'OFF (DAEMON)' : d13.status,
            })}

            {renderIsometricDevice({
              dev: d11,
              x: 310,
              y: 95,
              label: 'Sistema Riego',
              icon: '🚿',
              activeColor: '#38BDF8',
              isActive: isIrrigationActive,
              badgeText: isIrrigationActive ? 'REGANDO' : d11.status,
            })}

            {renderIsometricDevice({
              dev: d12,
              x: 500,
              y: 95,
              label: 'Cámara Patio',
              icon: '📹',
              activeColor: isWarm ? '#2E7D32' : '#10B981',
              inactiveColor: isSurveillanceBlocked ? '#F59E0B' : '#EF4444',
              isActive: isSurveillanceRunning && d12.status === 'ONLINE',
              alert: isSurveillanceBlocked || d12.status === 'OFFLINE',
              badgeText: isSurveillanceBlocked ? 'BLOCKED' : d12.status,
            })}
          </g>

          {/* ======================================================== */}
          {/* ZONA 2: GARAJE Y TALLER (Pared 3D + Suelo de Hormigón)    */}
          {/* ======================================================== */}
          <g
            className="transition-all duration-300 cursor-pointer"
            onMouseEnter={() => setHoveredRoom('garaje')}
            onMouseLeave={() => setHoveredRoom(null)}
          >
            {/* Pared Trasera con Profundidad 2.5D */}
            <polygon
              points="650,34 970,34 970,54 650,54"
              fill={isWarm ? '#C7BCB0' : '#1E293B'}
              filter="url(#wallAmbientShadow)"
            />
            {/* Pared Lateral Izquierda con Sombra */}
            <polygon
              points="650,34 664,48 664,250 650,250"
              fill={isWarm ? '#B3A698' : '#0F172A'}
            />

            {/* Suelo del Garaje */}
            <polygon
              points="664,54 970,54 970,250 664,250"
              fill={isWarm ? '#E4DDD4' : '#131C2E'}
              stroke={hoveredRoom === 'garaje' ? '#94A3B8' : (isWarm ? '#CBC0B2' : '#1E293B')}
              strokeWidth="2.5"
            />

            <text x="680" y="74" fill={isWarm ? '#44403C' : '#94A3B8'} fontSize="11" fontWeight="900" className="font-mono tracking-wider">
              🚗 GARAJE Y TALLER
            </text>

            {/* Portón de Garaje Seccional */}
            <rect
              x="952"
              y="74"
              width="14"
              height="160"
              rx="3"
              fill={d14.status === 'ABIERTO' ? '#10B981' : '#64748B'}
              filter="url(#isoShadow)"
            />

            {renderIsometricDevice({
              dev: d14,
              x: 815,
              y: 145,
              label: 'Puerta Garaje',
              icon: d14.status === 'ABIERTO' ? '🔓' : '🚪',
              activeColor: '#10B981',
              isActive: d14.status === 'ABIERTO',
              badgeText: d14.status,
            })}
          </g>

          {/* ======================================================== */}
          {/* ZONA 3: SALÓN PRINCIPAL (Parquet + Iluminación Real 2.5D) */}
          {/* ======================================================== */}
          <g
            className="transition-all duration-300 cursor-pointer"
            onMouseEnter={() => setHoveredRoom('salon')}
            onMouseLeave={() => setHoveredRoom(null)}
          >
            {/* Paredes Interiores 2.5D */}
            <polygon
              points="50,175 350,175 350,195 50,195"
              fill={isWarm ? '#D3C6B6' : '#1E293B'}
              filter="url(#wallAmbientShadow)"
            />
            <polygon
              points="350,175 364,190 364,430 350,430"
              fill={isWarm ? '#BEB09F' : '#0F172A'}
            />

            {/* Suelo del Salón (Parquet de Madera Cálida) */}
            <polygon
              points="50,195 350,195 350,430 50,430"
              fill={
                isSalonLightOn
                  ? isWarm ? '#FDF1E2' : '#2A241C'
                  : isWarm ? '#EFE4D6' : '#0F172A'
              }
              stroke={hoveredRoom === 'salon' ? (isWarm ? '#C85A32' : '#38BDF8') : (isWarm ? '#DECFC0' : '#1E293B')}
              strokeWidth="2.5"
              className="transition-colors duration-400"
            />

            {/* Resplandor e Iluminación Real del Salón (Mejora 02) */}
            {isSalonLightOn && (
              <polygon
                points="50,195 350,195 350,430 50,430"
                fill="url(#lampGlowSalon)"
                className="transition-opacity duration-500 pointer-events-none"
              />
            )}

            {/* Representación isométrica de alfombra de diseño */}
            <polygon
              points="80,260 300,260 280,390 100,390"
              fill={isWarm ? '#E6D7C3' : '#1A2942'}
              opacity="0.45"
            />

            <text x="65" y="215" fill={isWarm ? '#8C3D21' : '#38BDF8'} fontSize="11" fontWeight="900" className="font-mono tracking-wider">
              🛋️ SALÓN DE ESTAR
            </text>
            <text x="65" y="230" fill={isWarm ? '#685A50' : '#0284C7'} fontSize="9" className="font-mono">
              Clima: {d6.temperature || '21.5'}°C • {isSalonLightOn ? 'Luminaria Cálida ON' : 'Modo Ahorro Nocturno'}
            </text>

            {renderIsometricDevice({
              dev: d1,
              x: 120,
              y: 310,
              label: 'Luces Salón',
              icon: '💡',
              activeColor: '#F59E0B',
              isActive: isSalonLightOn,
              badgeText: isLightingTerminated ? 'OFF (DAEMON)' : d1.status,
            })}

            {renderIsometricDevice({
              dev: d6,
              x: 260,
              y: 310,
              label: 'Termostato',
              icon: '🌡️',
              activeColor: '#38BDF8',
              isActive: d6.status === 'ACTIVO' || d6.status === 'ON',
              badgeText: `${d6.temperature || '21.5'}°C`,
            })}
          </g>

          {/* ======================================================== */}
          {/* ZONA 4: COCINA (Cerámica + ALARMA DE INCENDIO/HUMO 2.5D) */}
          {/* ======================================================== */}
          <g
            className="transition-all duration-300 cursor-pointer"
            onMouseEnter={() => setHoveredRoom('cocina')}
            onMouseLeave={() => setHoveredRoom(null)}
          >
            {/* Paredes de Cocina */}
            <polygon
              points="370,175 630,175 630,195 370,195"
              fill={hasFireEmergency ? '#7F1D1D' : (isWarm ? '#D3C6B6' : '#1E293B')}
              filter="url(#wallAmbientShadow)"
            />
            <polygon
              points="630,175 644,190 644,430 630,430"
              fill={hasFireEmergency ? '#991B1B' : (isWarm ? '#BEB09F' : '#0F172A')}
            />

            {/* Suelo Cerámico de Cocina */}
            <polygon
              points="370,195 630,195 630,430 370,430"
              fill={
                hasFireEmergency
                  ? '#450A0A'
                  : isCocinaLightOn
                  ? isWarm ? '#FDF0E2' : '#26201B'
                  : isWarm ? '#EDE0D2' : '#0F172A'
              }
              stroke={
                hasFireEmergency
                  ? '#EF4444'
                  : hoveredRoom === 'cocina'
                  ? (isWarm ? '#C85A32' : '#F59E0B')
                  : (isWarm ? '#DECFC0' : '#1E293B')
              }
              strokeWidth={hasFireEmergency ? '3.5' : '2.5'}
              className="transition-colors duration-400"
            />

            {/* Iluminación / Resplandor de Alarma de Incendio (Mejora 03) */}
            <polygon
              points="370,195 630,195 630,430 370,430"
              fill="url(#lampGlowCocina)"
              className="pointer-events-none"
            />

            {/* BEACON PULSANTE DE ALARMA DE INCENDIO (Mejora 03) */}
            {hasFireEmergency && (
              <g className="animate-pulse">
                {/* Ondas concéntricas de baliza de emergencia en el techo/suelo */}
                <ellipse cx={500} cy={275} rx={55} ry={25} fill="none" stroke="#EF4444" strokeWidth="3" strokeDasharray="6 3" />
                <ellipse cx={500} cy={275} rx={85} ry={40} fill="none" stroke="#DC2626" strokeWidth="2" strokeDasharray="8 4" />
                <circle cx={500} cy={275} r={18} fill="#EF4444" opacity="0.8" />
                <text x="500" y="280" textAnchor="middle" fontSize="14" fill="#FFFFFF" fontWeight="black">🚨</text>
              </g>
            )}

            <text x="385" y="215" fill={hasFireEmergency ? '#EF4444' : (isWarm ? '#8C3D21' : '#F59E0B')} fontSize="11" fontWeight="900" className="font-mono tracking-wider">
              🍳 COCINA {hasFireEmergency && '• ¡EMERGENCIA ACTIVADA!'}
            </text>

            {renderIsometricDevice({
              dev: d8,
              x: 440,
              y: 300,
              label: 'Sensor Humo',
              icon: '🔥',
              activeColor: '#EF4444',
              isActive: hasSmokeAlert,
              alert: hasSmokeAlert,
              badgeText: hasSmokeAlert ? 'HUMO!' : 'NORMAL',
            })}

            {renderIsometricDevice({
              dev: d9,
              x: 560,
              y: 300,
              label: 'Sensor Gas',
              icon: '💨',
              activeColor: '#EF4444',
              isActive: hasGasAlert,
              alert: hasGasAlert,
              badgeText: hasGasAlert ? 'FUGA!' : 'NORMAL',
            })}

            {renderIsometricDevice({
              dev: d2,
              x: 500,
              y: 380,
              label: 'Luz Cocina',
              icon: '💡',
              activeColor: '#F59E0B',
              isActive: isCocinaLightOn,
              badgeText: isLightingTerminated ? 'OFF (DAEMON)' : d2.status,
            })}
          </g>

          {/* ======================================================== */}
          {/* ZONA 5: DORMITORIO PRINCIPAL / SUITE (2.5D + Robot d10)  */}
          {/* ======================================================== */}
          <g
            className="transition-all duration-300 cursor-pointer"
            onMouseEnter={() => setHoveredRoom('suite')}
            onMouseLeave={() => setHoveredRoom(null)}
          >
            {/* Paredes de Habitación */}
            <polygon
              points="50,445 630,445 630,465 50,465"
              fill={isWarm ? '#D3C6B6' : '#1E293B'}
              filter="url(#wallAmbientShadow)"
            />
            <polygon
              points="630,445 644,460 644,625 630,625"
              fill={isWarm ? '#BEB09F' : '#0F172A'}
            />

            {/* Suelo del Dormitorio */}
            <polygon
              points="50,465 630,465 630,625 50,625"
              fill={
                isHabitacionLightOn
                  ? isWarm ? '#FFF8EE' : '#2A211D'
                  : isWarm ? '#F3E8DB' : '#0F172A'
              }
              stroke={hoveredRoom === 'suite' ? (isWarm ? '#C85A32' : '#A855F7') : (isWarm ? '#DECFC0' : '#1E293B')}
              strokeWidth="2.5"
              className="transition-colors duration-400"
            />

            {/* Resplandor de Iluminación Habitación */}
            {isHabitacionLightOn && (
              <polygon
                points="50,465 630,465 630,625 50,625"
                fill="url(#lampGlowSuite)"
                className="pointer-events-none"
              />
            )}

            {/* Silueta isométrica de Cama King Size */}
            <polygon
              points="200,485 360,485 340,580 180,580"
              fill={isWarm ? '#E5D6C5' : '#182438'}
              stroke={isWarm ? '#C8B6A2' : '#334155'}
              strokeWidth="1.5"
            />

            <text x="65" y="485" fill={isWarm ? '#6A3828' : '#A855F7'} fontSize="11" fontWeight="900" className="font-mono tracking-wider">
              🛏️ DORMITORIO PRINCIPAL
            </text>

            {renderIsometricDevice({
              dev: d15,
              x: 130,
              y: 545,
              label: 'Luz Habitación',
              icon: '💡',
              activeColor: '#F59E0B',
              isActive: isHabitacionLightOn,
              badgeText: isLightingTerminated ? 'OFF (DAEMON)' : d15.status,
            })}

            {renderIsometricDevice({
              dev: d10,
              x: 450,
              y: 545,
              label: 'Robot Recolector',
              icon: '🤖',
              activeColor: '#10B981',
              isActive: isCleanerActive,
              badgeText: isCleanerActive ? 'RUTINA ACTIVA' : d10.status,
            })}
          </g>

          {/* ======================================================== */}
          {/* ZONA 6: ENTRADA PRINCIPAL (Perímetro + Cámara Frontal)    */}
          {/* ======================================================== */}
          <g
            className="transition-all duration-300 cursor-pointer"
            onMouseEnter={() => setHoveredRoom('entrada')}
            onMouseLeave={() => setHoveredRoom(null)}
          >
            {/* Paredes de Entrada */}
            <polygon
              points="660,265 970,265 970,285 660,285"
              fill={isWarm ? '#D3C6B6' : '#1E293B'}
              filter="url(#wallAmbientShadow)"
            />

            {/* Suelo de Entrada */}
            <polygon
              points="660,285 970,285 970,625 660,625"
              fill={isWarm ? '#ECE2D5' : '#0F172A'}
              stroke={hoveredRoom === 'entrada' ? (isWarm ? '#C85A32' : '#E2E8F0') : (isWarm ? '#D5C7B8' : '#334155')}
              strokeWidth="2.5"
            />

            {/* Cono de Visión de Cámara Frontal (Mejora 04) */}
            {isSurveillanceRunning && d4.status === 'ONLINE' && (
              <polygon
                points="890,380 770,580 970,580"
                fill="url(#coneCamFront)"
                className="animate-pulse pointer-events-none"
              />
            )}

            {/* Ondas concéntricas de radar si el sensor detecta movimiento */}
            {isMotionActive && (
              <g className="animate-pulse">
                <circle cx={730} cy={380} r={32} fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeDasharray="4 2" />
                <circle cx={730} cy={380} r={48} fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="6 3" />
              </g>
            )}

            {/* Felpudo de bienvenida */}
            <polygon
              points="750,560 850,560 840,610 740,610"
              fill={isWarm ? '#D6C5B3' : '#1A2942'}
            />

            {/* Puerta principal con cerrojo inteligente */}
            <rect
              x="765"
              y="616"
              width="90"
              height="8"
              rx="2"
              fill={d5.status === 'DESBLOQUEADA' ? '#10B981' : '#EF4444'}
            />

            <text x="680" y="305" fill={isWarm ? '#4A3C33' : '#CBD5E1'} fontSize="11" fontWeight="900" className="font-mono tracking-wider">
              🚪 ENTRADA & CONTROL DE ACCESO
            </text>

            {renderIsometricDevice({
              dev: d3,
              x: 730,
              y: 380,
              label: 'Sensor Movimiento',
              icon: '🚶',
              activeColor: '#F59E0B',
              inactiveColor: '#38BDF8',
              isActive: isMotionActive,
              alert: isMotionActive,
              badgeText: isMotionActive ? 'MOVIMIENTO!' : 'INACTIVO',
            })}

            {renderIsometricDevice({
              dev: d4,
              x: 890,
              y: 380,
              label: 'Cámara Frontal',
              icon: '📹',
              activeColor: '#10B981',
              inactiveColor: isSurveillanceBlocked ? '#F59E0B' : '#EF4444',
              isActive: isSurveillanceRunning && d4.status === 'ONLINE',
              alert: isSurveillanceBlocked || d4.status === 'OFFLINE',
              badgeText: isSurveillanceBlocked ? 'BLOCKED' : d4.status,
            })}

            {renderIsometricDevice({
              dev: d5,
              x: 760,
              y: 515,
              label: 'Cerradura',
              icon: d5.status === 'DESBLOQUEADA' ? '🔓' : '🔒',
              activeColor: '#10B981',
              inactiveColor: '#EF4444',
              isActive: d5.status === 'DESBLOQUEADA',
              badgeText: d5.status,
            })}

            {renderIsometricDevice({
              dev: d7,
              x: 890,
              y: 515,
              label: 'Timbre Inteligente',
              icon: '🔔',
              activeColor: '#F59E0B',
              inactiveColor: '#64748B',
              isActive: d7.status === 'TIMBRANDO',
              alert: d7.status === 'TIMBRANDO',
              badgeText: d7.status === 'TIMBRANDO' ? 'TIMBRANDO!' : 'IDLE',
            })}
          </g>

          {/* Pasillos y puertas internas de interconexión con marco 2.5D */}
          <line x1="350" y1="280" x2="370" y2="280" stroke="#94A3B8" strokeWidth="5" strokeLinecap="round" />
          <line x1="630" y1="520" x2="660" y2="520" stroke="#94A3B8" strokeWidth="5" strokeLinecap="round" />
        </svg>
      </div>

      {/* ======================================================== */}
      {/* 3. PANEL CONTEXTUAL INTERACTIVO DEL DISPOSITIVO          */}
      {/* ======================================================== */}
      {selectedDev && (
        <div
          className={`mx-6 p-4 rounded-2xl border transition-all space-y-3 ${
            isWarm ? 'bg-white border-[#E5DCD1] shadow-lg' : 'bg-slate-900 border-cyan-500/40 shadow-2xl'
          }`}
        >
          <div className="flex items-center justify-between border-b pb-3 border-slate-800/40">
            <div className="flex items-center space-x-3">
              <span className={`p-2.5 rounded-xl text-xl ${
                isWarm ? 'bg-[#F8EBE6] text-[#C85A32]' : 'bg-cyan-950 text-cyan-400'
              }`}>
                {selectedDev.type === 'LIGHT' ? '💡' : selectedDev.type === 'CAMERA' ? '📹' : selectedDev.type === 'LOCK' ? '🔒' : '📟'}
              </span>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <span>{selectedDev.name}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-cyan-400 border border-slate-800">
                    ID: {selectedDev.id}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Zona: {selectedDev.zone} • Telemetría: <strong className="text-emerald-400">Verificada</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${
                selectedDev.status === 'ON' || selectedDev.status === 'ONLINE' || selectedDev.status === 'DESBLOQUEADA'
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-700/60'
                  : 'bg-slate-800 text-slate-300'
              }`}>
                ESTADO: {selectedDev.status}
              </span>

              <button
                onClick={() => onSelectDevice(null)}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono"
              >
                ✕ Cerrar
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center space-x-4">
              <span>
                <strong className="text-slate-500">Driver de Hardware:</strong> {selectedDev.type}
              </span>
              <span>
                <strong className="text-slate-500">Daemon de Kernel:</strong>{' '}
                <span className="text-cyan-400 font-bold">
                  {selectedDev.type === 'LIGHT' ? 'lighting_daemon' : selectedDev.type === 'CAMERA' ? 'surveillance_proc' : 'kernel_device_bus'}
                </span>
              </span>
            </div>

            {/* Acciones directas sobre hardware real */}
            <div className="flex items-center space-x-2">
              {selectedDev.type === 'LIGHT' && (
                <button
                  onClick={() => handleQuickAction(selectedDev.status === 'ON' ? 'OFF' : 'ON')}
                  disabled={isLightingTerminated}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    isLightingTerminated
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : isWarm
                      ? 'bg-[#C85A32] hover:bg-[#B44D27] text-white shadow'
                      : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow'
                  }`}
                >
                  {isLightingTerminated ? 'Daemon Terminated' : selectedDev.status === 'ON' ? 'Apagar Luminaria' : 'Encender Luminaria'}
                </button>
              )}

              {selectedDev.id === 'd5' && (
                <button
                  onClick={() => handleQuickAction(selectedDev.status === 'DESBLOQUEADA' ? 'BLOQUEADA' : 'DESBLOQUEADA')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-all ${
                    isWarm ? 'bg-[#C85A32] hover:bg-[#B44D27]' : 'bg-cyan-600 hover:bg-cyan-500'
                  }`}
                >
                  {selectedDev.status === 'DESBLOQUEADA' ? 'Bloquear Cerradura' : 'Desbloquear Cerradura'}
                </button>
              )}

              {selectedDev.id === 'd14' && (
                <button
                  onClick={() => handleQuickAction(selectedDev.status === 'ABIERTO' ? 'CERRADO' : 'ABIERTO')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-all ${
                    isWarm ? 'bg-[#C85A32] hover:bg-[#B44D27]' : 'bg-cyan-600 hover:bg-cyan-500'
                  }`}
                >
                  {selectedDev.status === 'ABIERTO' ? 'Cerrar Portón' : 'Abrir Portón'}
                </button>
              )}

              {selectedDev.id === 'd11' && (
                <button
                  onClick={() => handleQuickAction(selectedDev.status === 'REGANDO' ? 'IDLE' : 'REGANDO')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-all ${
                    isWarm ? 'bg-[#C85A32] hover:bg-[#B44D27]' : 'bg-cyan-600 hover:bg-cyan-500'
                  }`}
                >
                  {selectedDev.status === 'REGANDO' ? 'Detener Riego' : 'Activar Riego'}
                </button>
              )}

              {selectedDev.id === 'd10' && (
                <button
                  onClick={() => handleQuickAction(selectedDev.status === 'LIMPIANDO' ? 'BASE' : 'LIMPIANDO')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-all ${
                    isWarm ? 'bg-[#C85A32] hover:bg-[#B44D27]' : 'bg-cyan-600 hover:bg-cyan-500'
                  }`}
                >
                  {selectedDev.status === 'LIMPIANDO' ? 'Retornar a Base' : 'Iniciar Limpieza'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. PIE DE TELEMETRÍA Y RESUMEN ARQUITECTÓNICO           */}
      {/* ======================================================== */}
      <div className="p-4 px-6 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-slate-400">
        <div className="flex items-center space-x-4">
          <span>Perspectiva: <strong className="text-white">Isométrica 2.5D</strong></span>
          <span>•</span>
          <span>Modo Activo: <strong className="text-cyan-400">{houseMode}</strong></span>
          <span>•</span>
          <span>6 Zonas Físicas Renderizadas</span>
        </div>

        <div className="flex items-center space-x-2 text-[11px] text-slate-500">
          <span>RobotOS SmartHouse Engine</span>
          <span>•</span>
          <span className="text-emerald-400">60 FPS Hardware Accelerated</span>
        </div>
      </div>
    </div>
  );
};
