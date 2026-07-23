// ==========================================
// utils.js
// ==========================================

// --- CONSTANTES ---
export const API_BASE_URL = "https://horno-backend.onrender.com/api";
//export const API_BASE_URL = "http://localhost:4000/api";

export const REGISTROS_API_URL = `${API_BASE_URL}/registros`;
export const PRODUCCION_API_URL = `${API_BASE_URL}/produccion`;
export const PEDIDOS_API_URL = `${API_BASE_URL}/pedidos-analisis`;
export const SUGERENCIAS_PLAN_URL = `${API_BASE_URL}/planificacion/sugerencias-produccion`;
export const AUTH_API_URL = `${API_BASE_URL}/auth`;
export const UPDATE_FCM_TOKEN_URL = `${AUTH_API_URL}/update-fcm`;

export const POLLING_INTERVAL = 10000;
export const HORAS_TIMEOUT_ENFRIADO = 2;
export const MAX_HORAS_CICLO_PROMEDIO = 4;
export const ALARMA_WINDOW_HOURS = 24;

// --- FUNCIÓN FETCH UNIFICADA CON SEGURIDAD (JWT) ---
export const authFetch = async (url, options = {}) => {
  const token = localStorage.getItem("mrp_token");

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // Si hay token en el navegador, lo inyectamos en la cabecera
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Si el backend nos dice 401 (No autorizado / Token vencido)
  if (response.status === 401) {
    console.error("⛔ EL BACKEND RECHAZÓ EL TOKEN. RUTA:", url);
    localStorage.removeItem("mrp_token");
    localStorage.removeItem("mrp_user");
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }

  return response;
};

// --- FUNCIONES AUXILIARES DE TIEMPOS (Horno) ---
export function formatDuration(ms) {
  if (isNaN(ms) || ms < 0) return "N/A";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function getStationStatus(stationId, allRecords) {
  const lastEvent = allRecords.find(
    (reg) =>
      reg.accion.includes(`Estacion ${stationId}`) && reg.tipo !== "PRODUCCION",
  );

  let status = "INACTIVA";
  if (lastEvent) {
    if (lastEvent.accion.includes("Se inicio ciclo")) status = "COCINANDO";
    else if (lastEvent.accion.includes("Enfriando")) status = "ENFRIANDO";
  }

  const cycleStartEvents = allRecords.filter(
    (reg) =>
      reg.tipo === "EVENTO" &&
      reg.accion.includes(`Se inicio ciclo Estacion ${stationId}`),
  );

  let cycleDuration = "N/A";
  let averageCycleTime = "N/A";
  let averageCycleTimeMs = null;
  const allCycleDurationsMs = [];

  if (cycleStartEvents.length >= 2) {
    for (let i = 0; i < cycleStartEvents.length - 1; i++) {
      try {
        const date1 = new Date(cycleStartEvents[i].timestamp);
        const date2 = new Date(cycleStartEvents[i + 1].timestamp);
        const diffMs = date1.getTime() - date2.getTime();
        if (i === 0) cycleDuration = formatDuration(diffMs);
        allCycleDurationsMs.push(diffMs);
      } catch (e) {
        console.error(e);
      }
    }
    const last10Durations = allCycleDurationsMs.slice(0, 10);
    const maxMs = MAX_HORAS_CICLO_PROMEDIO * 60 * 60 * 1000;
    const validDurations = last10Durations.filter((ms) => ms < maxMs);
    if (validDurations.length > 0) {
      const totalMs = validDurations.reduce((sum, ms) => sum + ms, 0);
      const avgMs = totalMs / validDurations.length;
      averageCycleTime = formatDuration(avgMs);
      averageCycleTimeMs = avgMs;
    }
  }

  let liveCycleStartTime = null;
  if (status === "COCINANDO" || status === "ENFRIANDO") {
    if (cycleStartEvents[0]) {
      try {
        liveCycleStartTime = new Date(cycleStartEvents[0].timestamp);
      } catch (e) {
        console.error(e);
      }
    }
  }

  let cyclesToday = 0;
  try {
    const todayStr = new Date().toISOString().substring(0, 10);
    cyclesToday = cycleStartEvents.filter((reg) => {
      const eventDate = new Date(reg.timestamp);
      eventDate.setMinutes(
        eventDate.getMinutes() - eventDate.getTimezoneOffset(),
      );
      return eventDate.toISOString().substring(0, 10) === todayStr;
    }).length;
  } catch (e) {
    console.error(e);
  }

  if (status === "ENFRIANDO" && lastEvent) {
    try {
      const enfriandoStartTime = new Date(lastEvent.timestamp);
      const diffHours = (new Date() - enfriandoStartTime) / (1000 * 60 * 60);
      if (diffHours > HORAS_TIMEOUT_ENFRIADO) {
        status = "INACTIVA";
        liveCycleStartTime = null;
      }
    } catch (e) {
      console.error(e);
    }
  }

  return {
    status,
    lastEvent: lastEvent || null,
    cycleDuration,
    liveCycleStartTime,
    cyclesToday,
    averageCycleTime,
    averageCycleTimeMs,
  };
}
