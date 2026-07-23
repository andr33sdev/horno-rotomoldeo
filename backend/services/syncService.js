const db = require("../db");
const {
  leerArchivoHorno,
  leerArchivoPedidos,
  leerStockSemielaborados,
  leerMateriasPrimas,
} = require("../google-drive");
const { parsearLog } = require("../parser");
const format = require("pg-format");
const XLSX = require("xlsx");

// --- HELPER DE FECHAS SEGURO ---
function parsearFechaExcel(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;

  if (typeof valor === "number") {
    const fechaBase = new Date(1899, 11, 30);
    const dias = Math.floor(valor);
    const ms = (valor - dias) * 86400 * 1000;
    const fecha = new Date(fechaBase.getTime() + dias * 86400000 + ms);
    return isNaN(fecha.getTime()) ? null : fecha;
  }

  if (typeof valor === "string") {
    const partes = valor.trim().split("/");
    if (partes.length === 3) {
      let dia = parseInt(partes[0], 10);
      let mes = parseInt(partes[1], 10) - 1;
      let anio = parseInt(partes[2], 10);
      if (anio < 100) anio += 2000;
      const fecha = new Date(anio, mes, dia);
      return isNaN(fecha.getTime()) ? null : fecha;
    }
    const fechaStd = new Date(valor);
    return isNaN(fechaStd.getTime()) ? null : fechaStd;
  }
  return null;
}

// --- HELPER FORMATO ISO ---
function formatearParaDB(fechaObj) {
  if (!fechaObj) return null;
  const y = fechaObj.getFullYear();
  const m = String(fechaObj.getMonth() + 1).padStart(2, "0");
  const d = String(fechaObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}T12:00:00`;
}

function normalizarEncabezado(txt) {
  if (!txt) return "";
  return txt
    .toString()
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function limpiarCodigo(cod) {
  if (!cod) return null;
  return cod.toString().trim().toUpperCase();
}

function limpiarNumero(val) {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") return val;

  let limpio = val
    .toString()
    .trim()
    .replace(/[$A-Za-z\s]/g, "");

  if (limpio.includes(",") && limpio.includes(".")) {
    limpio = limpio.replace(/\./g, "").replace(",", ".");
  } else if (limpio.includes(",")) {
    limpio = limpio.replace(",", ".");
  }

  const numero = parseFloat(limpio);
  return isNaN(numero) ? 0 : numero;
}

// =====================================================
// 1. SYNC LOGS HORNO
// =====================================================
async function sincronizarBaseDeDatos() {
  console.log("[TIMER] Sincronizando Logs Horno...");
  const client = await db.connect();
  try {
    const textoCrudo = await leerArchivoHorno();
    const registrosOriginales = parsearLog(textoCrudo);

    await client.query("BEGIN");

    const { rows: currentProdRows } = await client.query(
      "SELECT * FROM estado_produccion FOR UPDATE",
    );
    const currentProduccion = currentProdRows.reduce((acc, row) => {
      try {
        acc[row.estacion_id] = {
          json: row.producto_actual || "[]",
          accion: `Estacion ${row.estacion_id}`,
        };
      } catch (e) {
        acc[row.estacion_id] = {
          json: "[]",
          accion: `Estacion ${row.estacion_id}`,
        };
      }
      return acc;
    }, {});
    const { rows: dbTriggers } = await client.query(
      `SELECT fecha, hora, accion FROM registros WHERE tipo = 'EVENTO' AND accion LIKE 'Se inicio ciclo%'`,
    );
    const dbTriggerSet = new Set(
      dbTriggers.map(
        (r) => `${r.fecha.toISOString().split("T")[0]}T${r.hora}_${r.accion}`,
      ),
    );
    const newArchiveRecords = [];
    for (const reg of registrosOriginales) {
      let stationId = null;
      if (reg.accion.includes("Estacion 1")) stationId = 1;
      else if (reg.accion.includes("Estacion 2")) stationId = 2;
      if (stationId && reg.accion.includes("Se inicio ciclo")) {
        const key = `${reg.fecha}T${reg.hora}_${reg.accion}`;
        if (!dbTriggerSet.has(key)) {
          const products = currentProduccion[stationId];
          const triggerDateTime = new Date(`${reg.fecha}T${reg.hora}`);
          const archiveDateTime = new Date(triggerDateTime.getTime() - 5000);
          newArchiveRecords.push({
            fecha: archiveDateTime.toISOString().split("T")[0],
            hora: archiveDateTime
              .toTimeString()
              .split(" ")[0]
              .split("(")[0]
              .trim(),
            accion: products.accion,
            tipo: "PRODUCCION",
            productos_json: products.json,
          });
        }
      }
    }
    const allRecordsToInsert = [...registrosOriginales, ...newArchiveRecords];
    if (allRecordsToInsert.length === 0) {
      await client.query("COMMIT");
      return { success: true, msg: "Sin registros nuevos." };
    }
    await client.query("DELETE FROM registros WHERE tipo != 'PRODUCCION'");
    const LOTE_SIZE = 1000;
    for (let i = 0; i < allRecordsToInsert.length; i += LOTE_SIZE) {
      const lote = allRecordsToInsert.slice(i, i + LOTE_SIZE);
      const valores = lote.map((r) => [
        r.fecha,
        r.hora,
        r.accion,
        r.tipo,
        r.productos_json || null,
      ]);
      await client.query(
        format(
          "INSERT INTO registros (fecha, hora, accion, tipo, productos_json) VALUES %L",
          valores,
        ),
      );
    }
    await client.query("COMMIT");
    return { success: true, msg: "Sincronización completa." };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "ETIMEDOUT" || err.code === "ECONNRESET") {
      console.warn("⚠️ Timeout Logs Horno (reintentando luego).");
      return { success: false, msg: "Timeout" };
    }
    console.error("[TIMER] Error:", err);
    return { success: false, msg: "Error server." };
  } finally {
    client.release();
  }
}

// =====================================================
// 2. SINCRONIZAR PEDIDOS
// =====================================================
async function sincronizarPedidos() {
  console.log("↻ Iniciando sincronización de Pedidos...");
  try {
    const filas = await leerArchivoPedidos();

    if (!Array.isArray(filas) || filas.length < 2) {
      console.warn("⚠️ Excel de Pedidos vacío.");
      return;
    }

    const datos = filas.slice(1);
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      await client.query("TRUNCATE TABLE pedidos_clientes RESTART IDENTITY");

      const valoresTotales = [];

      for (const fila of datos) {
        if (!fila[2]) continue;

        const p_fecha = fila[0] ? fila[0].toString() : null;
        const p_periodo = fila[1] ? fila[1].toString() : "";
        const p_op = fila[2] ? fila[2].toString() : "";
        const p_cliente = fila[3]
          ? fila[3].toString().trim()
          : "Cliente Desconocido";
        const p_modelo = fila[4] ? fila[4].toString() : "";
        const p_detalles = fila[5] ? fila[5].toString() : "";

        const rawOC = fila[6];
        const p_oc_cliente =
          rawOC !== undefined && rawOC !== null && rawOC !== ""
            ? rawOC.toString().trim()
            : "-";

        const rawCant = fila[7] ? fila[7].toString() : "0";
        const p_cantidad = rawCant.replace(/\./g, "");

        const p_estado = fila[8]
          ? fila[8].toString().toUpperCase()
          : "PENDIENTE";
        const p_programado = fila[9] ? fila[9].toString() : "";
        const p_punisiva = fila[19] ? limpiarNumero(fila[19]) : 0;

        valoresTotales.push([
          p_fecha,
          p_periodo,
          p_op,
          p_cliente,
          p_modelo,
          p_detalles,
          p_oc_cliente,
          p_cantidad,
          p_estado,
          p_programado,
          p_punisiva,
        ]);
      }

      if (valoresTotales.length > 0) {
        const TAMAÑO_LOTE = 2000;
        for (let i = 0; i < valoresTotales.length; i += TAMAÑO_LOTE) {
          const lote = valoresTotales.slice(i, i + TAMAÑO_LOTE);
          const query = format(
            `INSERT INTO pedidos_clientes (fecha, periodo, op, cliente, modelo, detalles, oc_cliente, cantidad, estado, programado, punisiva)
             VALUES %L`,
            lote,
          );
          await client.query(query);
        }
      }

      await client.query("COMMIT");
      console.log(
        `✅ Sync Pedidos: ${valoresTotales.length} filas insertadas correctamente.`,
      );
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.code === "ETIMEDOUT" || error.code === "ECONNRESET") {
      console.warn("⚠️ Timeout en Sync Pedidos (se reintentará).");
    } else {
      console.error("❌ Error Sync Pedidos:", error.message);
    }
  }
}

// =====================================================
// 3. SYNC STOCK + ALERTAS
// =====================================================
async function sincronizarStockSemielaborados() {
  const client = await db.connect();
  try {
    console.log("\n📥 [SYNC] Stock...");
    const buffer = await leerStockSemielaborados();
    const workbook = XLSX.read(Buffer.from(buffer), { type: "buffer" });
    await client.query("BEGIN");

    const sheetGeneral = workbook.Sheets[workbook.SheetNames[0]];
    const rawGeneral = XLSX.utils.sheet_to_json(sheetGeneral, { header: 1 });
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(rawGeneral.length, 10); i++) {
      if (JSON.stringify(rawGeneral[i]).toUpperCase().includes("ALERTA")) {
        headerRowIdx = i;
        break;
      }
    }
    const dataAlerta = XLSX.utils.sheet_to_json(sheetGeneral, {
      range: headerRowIdx,
    });
    const mapaAlertas = new Map();
    for (const row of dataAlerta) {
      let codigo = null,
        nombre = null,
        a1 = 0,
        a2 = 0,
        a3 = 0;
      for (const key of Object.keys(row)) {
        const kSinEspacios = normalizarEncabezado(key).replace(/\s+/g, "");
        if (kSinEspacios === "CODIGO" || kSinEspacios === "COD")
          codigo = limpiarCodigo(row[key]);
        else if (kSinEspacios === "ARTICULO" || kSinEspacios === "DESCRIPCION")
          nombre = row[key];
        else if (kSinEspacios.includes("ALERTA1") || kSinEspacios === "MINIMO")
          a1 = limpiarNumero(row[key]);
        else if (kSinEspacios.includes("ALERTA2") || kSinEspacios === "MEDIO")
          a2 = limpiarNumero(row[key]);
        else if (kSinEspacios.includes("ALERTA3") || kSinEspacios === "MAXIMO")
          a3 = limpiarNumero(row[key]);
      }
      if (codigo && nombre && nombre.trim() !== "") {
        mapaAlertas.set(codigo, [codigo, nombre, a1, a2, a3]);
      }
    }
    const alertasArr = Array.from(mapaAlertas.values());
    if (alertasArr.length > 0) {
      await client.query(
        format(
          `INSERT INTO semielaborados (codigo, nombre, alerta_1, alerta_2, alerta_3) VALUES %L ON CONFLICT (codigo) DO UPDATE SET alerta_1=EXCLUDED.alerta_1, alerta_2=EXCLUDED.alerta_2, alerta_3=EXCLUDED.alerta_3, nombre=COALESCE(EXCLUDED.nombre, semielaborados.nombre), ultima_actualizacion=NOW()`,
          alertasArr,
        ),
      );
    }

    const sheetMapping = {
      "STOCK 26": "stock_planta_26",
      "STOCK 37": "stock_planta_37",
      "STOCK AYOLAS": "stock_deposito_ayolas",
      "STOCK 33": "stock_deposito_quintana",
    };
    let totalUpdates = 0;
    for (const [sheetNameKey, dbColumn] of Object.entries(sheetMapping)) {
      const realSheetName = workbook.SheetNames.find(
        (s) => s.toUpperCase().trim() === sheetNameKey,
      );
      if (!realSheetName) continue;
      await client.query(`UPDATE semielaborados SET ${dbColumn} = 0`);
      const sheet = workbook.Sheets[realSheetName];
      const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      let hIdx = 0;
      for (let i = 0; i < Math.min(rawMatrix.length, 20); i++) {
        if (
          JSON.stringify(rawMatrix[i]).toUpperCase().includes("CODIGO") &&
          JSON.stringify(rawMatrix[i]).toUpperCase().includes("STOCK")
        ) {
          hIdx = i;
          break;
        }
      }
      const data = XLSX.utils.sheet_to_json(sheet, { range: hIdx });
      const mapaStock = new Map();
      for (const row of data) {
        let codigo = null,
          nombre = null,
          stock = 0;
        for (const key of Object.keys(row)) {
          const kSin = normalizarEncabezado(key).replace(/\s+/g, "");
          if (kSin === "CODIGO" || kSin === "COD")
            codigo = limpiarCodigo(row[key]);
          else if (kSin === "ARTICULO" || kSin === "DESCRIPCION")
            nombre = row[key];
          else if (kSin === "STOCK" || kSin === "SALDO")
            stock = limpiarNumero(row[key]);
        }
        if (codigo && nombre && nombre.trim() !== "") {
          mapaStock.set(codigo, [codigo, nombre, stock]);
        }
      }
      const vals = Array.from(mapaStock.values());
      if (vals.length > 0) {
        await client.query(
          format(
            `INSERT INTO semielaborados (codigo, nombre, %I) VALUES %L ON CONFLICT (codigo) DO UPDATE SET %I=EXCLUDED.%I, nombre=COALESCE(EXCLUDED.nombre, semielaborados.nombre), ultima_actualizacion=NOW()`,
            dbColumn,
            vals,
            dbColumn,
            dbColumn,
          ),
        );
        totalUpdates += vals.length;
      }
    }
    await client.query("COMMIT");
    console.log(`✅ Sync Stock: ${totalUpdates} registros.`);
    return { success: true };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error Sync Stock:", err);
    return { success: false };
  } finally {
    client.release();
  }
}

// =====================================================
// 4. SYNC MATERIAS PRIMAS (CON PRECIO)
// =====================================================
async function sincronizarMateriasPrimas() {
  const client = await db.connect();
  try {
    console.log("⏳ [SYNC] Materias Primas...");
    const buffer = await leerMateriasPrimas();
    const workbook = XLSX.read(Buffer.from(buffer), { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    let hIdx = 0;
    for (let i = 0; i < Math.min(rawMatrix.length, 20); i++) {
      if (
        JSON.stringify(rawMatrix[i]).toUpperCase().includes("CODIGO") &&
        JSON.stringify(rawMatrix[i]).toUpperCase().includes("STOCK")
      ) {
        hIdx = i;
        break;
      }
    }

    const data = XLSX.utils.sheet_to_json(sheet, { range: hIdx });
    const mapaMP = new Map();

    for (const row of data) {
      let codigo = null,
        nombre = null,
        stock = 0,
        minimo = 0,
        precio = 0;

      for (const key of Object.keys(row)) {
        const kSin = normalizarEncabezado(key).replace(/\s+/g, "");

        if (kSin.includes("CODIGO") || kSin === "ID") {
          codigo = limpiarCodigo(row[key]);
        } else if (kSin.includes("ARTICULO") || kSin.includes("MATERIAL")) {
          nombre = row[key];
        } else if (
          kSin === "STOCK" ||
          kSin === "CANTIDAD" ||
          kSin === "EXISTENCIA"
        ) {
          stock = limpiarNumero(row[key]);
        } else if (kSin.includes("STOCKMIN") || kSin.includes("MINIMO")) {
          minimo = limpiarNumero(row[key]);
        } else if (
          kSin.includes("PUNI") ||
          kSin.includes("PRECIO") ||
          kSin.includes("VALOR")
        ) {
          precio = limpiarNumero(row[key]);
        }
      }

      if (codigo && nombre && nombre.trim() !== "" && codigo.length < 30) {
        mapaMP.set(codigo, [codigo, nombre, stock, minimo, precio, new Date()]);
      }
    }

    const vals = Array.from(mapaMP.values());
    if (vals.length > 0) {
      await client.query("BEGIN");

      await client.query(
        format(
          `INSERT INTO materias_primas (codigo, nombre, stock_actual, stock_minimo, precio, ultima_actualizacion) 
           VALUES %L 
           ON CONFLICT (codigo) DO UPDATE SET 
             stock_actual=EXCLUDED.stock_actual, 
             stock_minimo=EXCLUDED.stock_minimo, 
             precio=EXCLUDED.precio,
             nombre=COALESCE(EXCLUDED.nombre, materias_primas.nombre), 
             ultima_actualizacion=NOW()`,
          vals,
        ),
      );
      await client.query("COMMIT");
      console.log(`✅ [SYNC MP] ${vals.length} MPs actualizadas (Con precio).`);
    }
    return { success: true };
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("❌ Error Sync MP:", err.message);
    return { success: false };
  } finally {
    client.release();
  }
}

module.exports = {
  sincronizarBaseDeDatos,
  sincronizarPedidos,
  sincronizarStockSemielaborados,
  sincronizarMateriasPrimas,
};
