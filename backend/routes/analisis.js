// backend/routes/analisis.js
const express = require("express");
const router = express.Router();
const db = require("../db");
const { protect } = require("../middleware/auth");

router.use(protect);

// --- COMPRESOR DE ENCABEZADOS ULTRA-TOLERANTE ---
function normalizarEncabezado(txt) {
  if (!txt) return "";
  return txt
    .toString()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quita acentos
    .replace(/[^A-Z0-9]/g, ""); // Elimina puntos, espacios, \n, \r y símbolos
}

// 🛡️ LIMPIADOR NUMÉRICO EVOLUCIONADO: Elimina los errores #N/D de fórmulas rotas
function limpiarNumero(val) {
  if (
    val === undefined ||
    val === null ||
    val === "" ||
    val === "NaN" ||
    val === "-"
  )
    return 0;
  if (typeof val === "number") return val;

  const textoStr = val.toString().trim().toUpperCase();
  if (
    textoStr.includes("N/D") ||
    textoStr.includes("N/A") ||
    textoStr.includes("#")
  )
    return 0;

  let limpio = textoStr.replace(/[^0-9.,-]/g, "");
  if (limpio.includes(",") && limpio.includes(".")) {
    limpio = limpio.replace(/\./g, "").replace(",", ".");
  } else if (limpio.includes(",")) {
    limpio = limpio.replace(",", ".");
  }
  const numero = parseFloat(limpio);
  return isNaN(numero) ? 0 : numero;
}

// --- EXTRACTOR DE MESES SEGURO ---
function extraerMesAnio(valor) {
  if (!valor) return "Otros";

  if (typeof valor === "number") {
    const fechaBase = new Date(1899, 11, 30);
    const fechaObj = new Date(fechaBase.getTime() + valor * 86400000);
    if (!isNaN(fechaObj.getTime())) {
      const meses = [
        "Enero",
        "Febrero",
        "Marzo",
        "Abril",
        "Mayo",
        "Junio",
        "Julio",
        "Agosto",
        "Septiembre",
        "Octubre",
        "Noviembre",
        "Diciembre",
      ];
      return meses[fechaObj.getMonth()];
    }
  }

  const txt = valor.toString().toLowerCase().trim();
  if (txt.includes("ene")) return "Enero";
  if (txt.includes("feb")) return "Febrero";
  if (txt.includes("mar")) return "Marzo";
  if (txt.includes("abr")) return "Abril";
  if (txt.includes("may")) return "Mayo";
  if (txt.includes("jun")) return "Junio";
  if (txt.includes("jul")) return "Julio";
  if (txt.includes("ago")) return "Agosto";
  if (txt.includes("sep")) return "Septiembre";
  if (txt.includes("oct")) return "Octubre";
  if (txt.includes("nov")) return "Noviembre";
  if (txt.includes("dic")) return "Diciembre";

  if (txt.includes("-") || txt.includes("/")) {
    const partes = txt.split(/[\/\-]/);
    if (partes.length >= 2) {
      const mesIdx = parseInt(partes[1], 10);
      const meses = [
        "Enero",
        "Febrero",
        "Marzo",
        "Abril",
        "Mayo",
        "Junio",
        "Julio",
        "Agosto",
        "Septiembre",
        "Octubre",
        "Noviembre",
        "Diciembre",
      ];
      return meses[mesIdx - 1] || "Otros";
    }
  }
  return "Otros";
}

// --- HELPERS MATEMÁTICOS HISTÓRICOS ---
function calcularPendiente(valores) {
  const n = valores.length;
  if (n < 2) return 0;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;
  valores.forEach((y, x) => {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  });
  const denominador = n * sumXX - sumX * sumX;
  if (denominador === 0) return 0;
  return (n * sumXY - sumX * sumY) / denominador;
}

function calcularEstabilidad(valores) {
  const n = valores.length;
  if (n < 2) return 0;
  const media = valores.reduce((a, b) => a + b, 0) / n;
  if (media === 0) return 0;
  const variance = valores.reduce((a, b) => a + Math.pow(b - media, 2), 0) / n;
  return Math.sqrt(variance) / media;
}

// --- RUTA GET BASE DE CONTROL ---
router.get("/", async (req, res) => {
  try {
    res.json({
      global: {
        eficienciaGral: 0,
        scrap: 0,
        piezasBuenas: 0,
        piezasFallas: 0,
        kgTotales: 0,
        kgFallas: 0,
      },
      plantas: [],
      topArticulos: [],
      meses: [],
    });
  } catch (error) {
    res.status(500).json({ error: "Fallo inicialización de la ruta." });
  }
});

// ====================================================================
// 📊 ENDPOINT DE PROCESAMIENTO ANALÍTICO PARA CARGA (100% MEMORIA BI)
// ====================================================================
router.post("/procesar-planilla-produccion", async (req, res) => {
  try {
    const filas = req.body.filas || req.body.rows;
    if (!filas || !Array.isArray(filas) || filas.length === 0) {
      return res.status(400).json({ error: "Datos de planilla no válidos." });
    }

    const filaEncabezados = filas.find((f) =>
      Object.values(f).some(
        (v) => v && v.toString().toUpperCase().includes("FECHA"),
      ),
    );

    const mapaColumnas = {};
    if (filaEncabezados) {
      Object.keys(filaEncabezados).forEach((key) => {
        mapaColumnas[key] = normalizarEncabezado(filaEncabezados[key]);
      });
    }

    const registrosProcesados = [];
    const setMeses = new Set();
    const setMateriales = new Set();
    const setProductos = new Set();

    filas.forEach((fila) => {
      const filaLimpia = {};
      Object.keys(fila).forEach((key) => {
        const dest = mapaColumnas[key] || normalizarEncabezado(key);
        filaLimpia[dest] = fila[key];
      });

      if (
        filaLimpia["FECHA"] === "FECHA" ||
        (!filaLimpia["KGTOTAL"] && !filaLimpia["CANTBUENOS"])
      )
        return;

      const mes = extraerMesAnio(filaLimpia["PERIODO"] || filaLimpia["FECHA"]);
      if (mes === "Otros") return;

      const loteProd = String(filaLimpia["LOTEPRODUCCION"] || "").trim();
      const articulo = String(filaLimpia["ARTICULO"] || "OTROS")
        .trim()
        .toUpperCase();

      const kgTotal = limpiarNumero(filaLimpia["KGTOTAL"]);
      const kgScrap = limpiarNumero(filaLimpia["KGFALLAS"]);
      const buenos = limpiarNumero(filaLimpia["CANTBUENOS"]);
      const fallas = limpiarNumero(filaLimpia["CANTFALLAS"]);

      let planta = "Otras";
      if (loteProd.startsWith("01")) planta = "Planta 26 de Abril";
      else if (loteProd.startsWith("02")) planta = "Planta Bagnat 37";

      // Extraer dinámicamente la lista de materiales usados en la fila
      const materialesFila = [];
      [
        "MATERIAPRIMA1",
        "MATERIAPRIMA2",
        "MATERIAPRIMA3",
        "MATERIAPRIMA4",
      ].forEach((colKey) => {
        if (
          filaLimpia[colKey] &&
          filaLimpia[colKey].toString().trim() !== "" &&
          filaLimpia[colKey].toString().trim() !== "-"
        ) {
          const matNombre = filaLimpia[colKey].toString().trim().toUpperCase();
          materialesFila.push(matNombre);
          setMateriales.add(matNombre);
        }
      });

      setMeses.add(mes);
      setProductos.add(articulo);

      registrosProcesados.push({
        mes,
        planta,
        articulo,
        materiales: materialesFila,
        kgTotal,
        kgScrap,
        buenos,
        fallas,
      });
    });

    res.json({
      meses: Array.from(setMeses),
      materiales: Array.from(setMateriales).sort(),
      productos: Array.from(setProductos).sort(),
      registros: registrosProcesados,
    });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ error: "Fallo en el procesamiento analítico del servidor." });
  }
});

// ====================================================================
// 📈 TENDENCIAS HISTÓRICAS DE PEDIDOS (MANTENIDA INTEGRAL)
// ====================================================================
router.get("/tendencias", async (req, res) => {
  try {
    const queryMensualProd = `
      SELECT 
        to_char(fecha::DATE, 'YYYY-MM') as periodo,
        modelo,
        SUM(REGEXP_REPLACE(cantidad, '[^0-9.]', '', 'g')::NUMERIC) as total
      FROM pedidos_clientes
      WHERE fecha::DATE >= date_trunc('month', NOW() - INTERVAL '6 months')
        AND (estado IS NULL OR UPPER(estado) NOT LIKE '%CANCELADO%')
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `;

    const querySemanal = `
      SELECT 
        to_char(fecha::DATE, 'IYYY-IW') as periodo,
        modelo,
        SUM(REGEXP_REPLACE(cantidad, '[^0-9.]', '', 'g')::NUMERIC) as total
      FROM pedidos_clientes
      WHERE fecha::DATE >= date_trunc('week', NOW() - INTERVAL '12 weeks')
        AND (estado IS NULL OR UPPER(estado) NOT LIKE '%CANCELADO%')
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `;

    const queryGlobal = `
      SELECT 
        to_char(fecha::DATE, 'YYYY-MM') as mes_key,
        to_char(fecha::DATE, 'TMMon') as mes_nombre,
        COALESCE(SUM(REGEXP_REPLACE(cantidad, '[^0-9.]', '', 'g')::NUMERIC), 0) as total,
        COALESCE(SUM(CASE WHEN detalles ILIKE '%MercadoLibre%' OR cliente ILIKE '%MercadoLibre%' THEN REGEXP_REPLACE(cantidad, '[^0-9.]', '', 'g')::NUMERIC ELSE 0 END), 0) as ml
      FROM pedidos_clientes
      WHERE fecha::DATE >= date_trunc('month', NOW() - INTERVAL '11 months')
        AND (estado IS NULL OR UPPER(estado) NOT LIKE '%CANCELADO%')
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `;

    const queryMTD = `
      SELECT 
        COALESCE(SUM(CASE WHEN date_trunc('month', fecha::DATE) = date_trunc('month', NOW()) THEN REGEXP_REPLACE(cantidad, '[^0-9.]', '', 'g')::NUMERIC ELSE 0 END), 0) as actual_total,
        COALESCE(SUM(CASE WHEN date_trunc('month', fecha::DATE) = date_trunc('month', NOW() - INTERVAL '1 month') AND EXTRACT(DAY FROM fecha::DATE) <= EXTRACT(DAY FROM NOW()) THEN REGEXP_REPLACE(cantidad, '[^0-9.]', '', 'g')::NUMERIC ELSE 0 END), 0) as anterior_mismo_dia,
        COALESCE(SUM(CASE WHEN date_trunc('month', fecha::DATE) = date_trunc('month', NOW() - INTERVAL '1 month') THEN REGEXP_REPLACE(cantidad, '[^0-9.]', '', 'g')::NUMERIC ELSE 0 END), 0) as anterior_total_final
      FROM pedidos_clientes
      WHERE fecha::DATE >= date_trunc('month', NOW() - INTERVAL '1 month')
      AND (estado IS NULL OR UPPER(estado) NOT LIKE '%CANCELADO%')
    `;

    const [resMensual, resSemanal, resGlobal, resMTD] = await Promise.all([
      db.query(queryMensualProd),
      db.query(querySemanal),
      db.query(queryGlobal),
      db.query(queryMTD),
    ]);

    const mapMensual = {};
    const meses = [...new Set(resMensual.rows.map((r) => r.periodo))].sort();
    const mesActualIso = new Date().toISOString().slice(0, 7);
    const mesesCerrados = meses.filter((m) => m !== mesActualIso);

    resMensual.rows.forEach((r) => {
      if (r.periodo === mesActualIso) return;
      if (!mapMensual[r.modelo])
        mapMensual[r.modelo] = Array(mesesCerrados.length).fill(0);
      const idx = mesesCerrados.indexOf(r.periodo);
      if (idx >= 0) mapMensual[r.modelo][idx] = Number(r.total);
    });

    const tendencias = Object.keys(mapMensual)
      .map((modelo) => {
        const historia = mapMensual[modelo];
        const total = historia.reduce((a, b) => a + b, 0);
        const ceros = historia.filter((v) => v === 0).length;
        if (ceros > 2 || total < 20) return null;

        return {
          modelo,
          history: historia,
          historia,
          pendiente: calcularPendiente(historia),
          estabilidad: calcularEstabilidad(historia),
          ultimo_valor: historia[historia.length - 1],
          total,
        };
      })
      .filter(Boolean);

    const onFire = tendencias
      .filter((t) => t.pendiente > 2)
      .sort((a, b) => b.pendiente - a.pendiente);
    const coolingDown = tendencias
      .filter((t) => t.pendiente < -1)
      .sort((a, b) => a.pendiente - b.pendiente);
    const estables = tendencias
      .filter((t) => Math.abs(t.pendiente) < 10 && t.estabilidad < 0.4)
      .sort((a, b) => b.total - a.total);

    const mapSemanal = {};
    const semanas = [...new Set(resSemanal.rows.map((r) => r.periodo))].sort();
    const ultimas8Semanas = semanas.slice(-9, -1);

    resSemanal.rows.forEach((r) => {
      if (!ultimas8Semanas.includes(r.periodo)) return;
      if (!mapSemanal[r.modelo])
        mapSemanal[r.modelo] = Array(ultimas8Semanas.length).fill(0);
      const idx = ultimas8Semanas.indexOf(r.periodo);
      mapSemanal[r.modelo][idx] = Number(r.total);
    });

    const aceleracion = Object.keys(mapSemanal)
      .map((modelo) => {
        const h = mapSemanal[modelo];
        const actual = h.slice(4, 8).reduce((a, b) => a + b, 0);
        const anterior = h.slice(0, 4).reduce((a, b) => a + b, 0);
        if (anterior < 5) return null;
        const crec = ((actual - anterior) / anterior) * 100;
        return { modelo, historia: h, crecimiento: Math.round(crec), actual };
      })
      .filter(Boolean)
      .filter((p) => p.crecimiento > 20)
      .sort((a, b) => b.crecimiento - a.crecimiento);

    const graficoGlobal = resGlobal.rows.map((r) => ({
      mes_nombre: r.mes_nombre,
      total: Number(r.total),
      ml: Number(r.ml),
    }));

    const mtdRaw = resMTD.rows[0] || {};
    const actualMTD = Number(mtdRaw.actual_total || 0);
    const hoy = new Date();
    const diaActual = hoy.getDate();
    const diasEnMes = new Date(
      hoy.getFullYear(),
      hoy.getMonth() + 1,
      0,
    ).getDate();

    let proyeccionGlobal = 0;
    if (actualMTD > 0 && diaActual > 0) {
      proyeccionGlobal = Math.round((actualMTD / diaActual) * diasEnMes);
    } else {
      const historiaGlobal = graficoGlobal.slice(0, -1).map((r) => r.total);
      const pendienteGlobal = calcularPendiente(historiaGlobal.slice(-6));
      const ultimoTotal = historiaGlobal[historiaGlobal.length - 1] || 0;
      proyeccionGlobal = Math.max(0, Math.round(ultimoTotal + pendienteGlobal));
    }

    const totalYear = graficoGlobal.reduce((acc, curr) => acc + curr.total, 0);
    const mlYear = graficoGlobal.reduce((acc, curr) => acc + curr.ml, 0);
    const mlShare = totalYear > 0 ? Math.round((mlYear / totalYear) * 100) : 0;

    const anteriorMismoDia = Number(mtdRaw.anterior_mismo_dia || 0);
    let progreso = 0;
    if (anteriorMismoDia > 0) {
      progreso = Math.round(
        ((actualMTD - anteriorMismoDia) / anteriorMismoDia) * 100,
      );
    } else if (actualMTD > 0) {
      progreso = 100;
    }

    res.json({
      on_fire: onFire,
      estables: estables,
      aceleracion: aceleracion,
      cooling_down: coolingDown,
      grafico_global: graficoGlobal,
      proyeccion_global: proyeccionGlobal,
      ml_share: mlShare,
      mtd: {
        actual: actualMTD,
        anterior_mismo_dia: anteriorMismoDia,
        anterior_total: Number(mtdRaw.anterior_total_final || 0),
        progreso_porcentaje: progreso,
      },
    });
  } catch (e) {
    console.error("Error Análisis:", e);
    res.status(500).send(e.message);
  }
});

// ====================================================================
// ⏳ RUNWAY DE INSUMOS MANTENIDA INTACTA (RELOJ DE ARENA)
// ====================================================================
router.get("/insumos-runway", async (req, res) => {
  try {
    const diasAnalisis = 90;
    const { rows: mps } = await db.query(
      "SELECT id, codigo, nombre, stock_actual, stock_minimo FROM materias_primas",
    );

    const ventasRes = await db.query(`
        SELECT UPPER(modelo) as modelo, SUM(REGEXP_REPLACE(cantidad, '[^0-9.]', '', 'g')::NUMERIC) as total_vendido
        FROM pedidos_clientes
        WHERE fecha::DATE >= NOW() - INTERVAL '${diasAnalisis} days'
          AND (estado IS NULL OR UPPER(estado) NOT LIKE '%CANCELADO%')
        GROUP BY UPPER(modelo)
    `);

    const recipesRes = await db.query(`
        SELECT UPPER(s.nombre) as modelo, mp.id as mp_id, rs.cantidad
        FROM recetas_semielaborados rs
        JOIN semielaborados s ON rs.semielaborado_id = s.id
        JOIN materias_primas mp ON rs.materia_prima_id = mp.id
    `);

    const consumoDiarioMap = {};

    ventasRes.rows.forEach((venta) => {
      const recipesDelModelo = recipesRes.rows.filter(
        (r) => r.modelo === venta.modelo,
      );
      recipesDelModelo.forEach((ingrediente) => {
        const consumoTotalPeriodo = ingrediente.cantidad * venta.total_vendido;
        const consumoDiario = consumoTotalPeriodo / diasAnalisis;

        if (!consumoDiarioMap[ingrediente.mp_id])
          consumoDiarioMap[ingrediente.mp_id] = 0;
        consumoDiarioMap[ingrediente.mp_id] += consumoDiario;
      });
    });

    const reporte = mps.map((mp) => {
      const burnRate = consumoDiarioMap[mp.id] || 0;
      const stock = Number(mp.stock_actual);

      let diasRestantes = 9999;
      let fechaAgotamiento = null;

      if (burnRate > 0) {
        diasRestantes = Math.floor(stock / burnRate);
        const fecha = new Date();
        fecha.setDate(fecha.getDate() + diasRestantes);
        fechaAgotamiento = fecha.toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "short",
        });
      }

      let status = "SAFE";
      if (diasRestantes <= 7) status = "CRITICAL";
      else if (diasRestantes <= 30) status = "WARNING";

      return {
        id: mp.id,
        nombre: mp.nombre,
        codigo: mp.codigo,
        stock_actual: stock,
        stock_minimo: Number(mp.stock_minimo),
        burn_rate: Number(burnRate.toFixed(2)),
        dias_restantes: diasRestantes,
        fecha_agotamiento: fechaAgotamiento,
        status,
      };
    });

    const reporteOrdenado = reporte.sort(
      (a, b) => a.dias_restantes - b.dias_restantes,
    );
    res.json(reporteOrdenado);
  } catch (e) {
    console.error("Error Runway:", e);
    res.status(500).send(e.message);
  }
});

module.exports = router;
