// frontend/src/pages/AnalisisProduccionPage.jsx
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import {
  FaFileExcel,
  FaPercentage,
  FaCheckCircle,
  FaTrashAlt,
  FaCloudUploadAlt,
  FaBoxes,
  FaTimes,
  FaFilter,
  FaInfoCircle,
  FaSearch,
  FaShieldAlt,
  FaCalendarAlt,
  FaWeightHanging,
  FaListOl,
  FaChartLine,
} from "react-icons/fa";
import * as XLSX from "xlsx";
import { authFetch, API_BASE_URL } from "../utils";

// Regla maestra de ordenamiento cronológico corporativo
const ORDEN_MESES_MAESTRO = [
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

export default function AnalisisProduccionPage() {
  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mesSeleccionado, setMesSeleccionado] = useState("");

  // Estados de multiselección para tableros BI cruzados
  const [mesesSelec, setMesesSelec] = useState([]);
  const [materialesSelec, setMaterialesSelec] = useState([]);
  const [productosSelec, setProductosSelec] = useState([]);

  // Cajas de búsqueda predictiva para los filtros superiores
  const [busquedaMaterial, setBusquedaMaterial] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");

  // Caja de búsqueda exclusiva para la tabla de materias primas de abajo
  const [busquedaTablaMaterial, setBusquedaTablaMaterial] = useState("");

  // Estado para el modal de auditoría gerencial ampliado
  const [itemModal, setItemModal] = useState(null);

  const handleImportar = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    const lector = new FileReader();
    lector.onload = async (evento) => {
      try {
        const libro = XLSX.read(evento.target.result, { type: "binary" });
        const filas = XLSX.utils.sheet_to_json(
          libro.Sheets[libro.SheetNames[0]],
        );

        const res = await authFetch(
          `${API_BASE_URL}/analisis/procesar-planilla-produccion`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filas }),
          },
        );

        if (res.ok) {
          const json = await res.json();
          setDataset(json);

          // Ordenar los meses iniciales detectados según la regla maestra
          const mesesDetectadosOrdenados = (json.meses || []).sort(
            (a, b) =>
              ORDEN_MESES_MAESTRO.indexOf(a) - ORDEN_MESES_MAESTRO.indexOf(b),
          );

          setMesesSelec(mesesDetectadosOrdenados);
          setMaterialesSelec(json.materiales || []);
          setProductosSelec(json.productos || []);
          if (mesesDetectadosOrdenados.length > 0) {
            setMesSeleccionado(mesesDetectadosOrdenados[0]);
          }
          toast.success("Ecosistema analítico unificado");
        } else {
          toast.error("Error al procesar la planilla de producción.");
        }
      } catch (err) {
        console.error(err);
        toast.error("Formato de archivo no admitido.");
      } finally {
        setLoading(false);
      }
    };
    lector.readAsBinaryString(file);
  };

  const toggleFiltro = (item, estado, setEstado) => {
    if (estado.includes(item)) {
      setEstado(estado.filter((x) => x !== item));
    } else {
      setEstado([...estado, item]);
    }
  };

  // Mapeos predictivos de texto para limpiar la barra de filtros
  const listaMaterialesFiltrados = useMemo(() => {
    if (!dataset || !dataset.materiales) return [];
    return dataset.materiales.filter((m) =>
      m.toLowerCase().includes(busquedaMaterial.toLowerCase()),
    );
  }, [dataset, busquedaMaterial]);

  const listaProductosFiltrados = useMemo(() => {
    if (!dataset || !dataset.productos) return [];
    return dataset.productos.filter((p) =>
      p.toLowerCase().includes(busquedaProducto.toLowerCase()),
    );
  }, [dataset, busquedaProducto]);

  // 🌟 ENGINE BI: Cómputo global enfocado principalmente en UNIDADES / PIEZAS producidas
  const metricasGlobales = useMemo(() => {
    if (!dataset || !dataset.registros) return null;

    let kgTotal = 0,
      kgScrap = 0,
      buenos = 0,
      fallas = 0;
    const resumenArticulos = {};
    const resumenMateriales = {};

    dataset.registros.forEach((reg) => {
      const cumpleMes = mesesSelec.includes(reg.mes);
      const cumpleProd = productosSelec.includes(reg.articulo);
      const cumpleMat =
        reg.materiales.length === 0 ||
        reg.materiales.some((m) => materialesSelec.includes(m));

      if (cumpleMes && cumpleProd && cumpleMat) {
        kgTotal += reg.kgTotal;
        kgScrap += reg.kgScrap;
        buenos += reg.buenos;
        fallas += reg.fallas;

        if (!resumenArticulos[reg.articulo]) {
          resumenArticulos[reg.articulo] = {
            nombre: reg.articulo,
            kg: 0,
            scrap: 0,
            buenos: 0,
            fallas: 0,
            registros: 0,
          };
        }
        resumenArticulos[reg.articulo].kg += reg.kgTotal;
        resumenArticulos[reg.articulo].scrap += reg.kgScrap;
        resumenArticulos[reg.articulo].buenos += reg.buenos;
        resumenArticulos[reg.articulo].fallas += reg.fallas;
        resumenArticulos[reg.articulo].registros += 1;

        reg.materiales.forEach((mat) => {
          if (!resumenMateriales[mat]) {
            resumenMateriales[mat] = {
              nombre: mat,
              kgReferenciado: 0,
              scrap: 0,
              buenos: 0,
              fallas: 0,
              registros: 0,
            };
          }
          resumenMateriales[mat].kgReferenciado += reg.kgTotal;
          resumenMateriales[mat].scrap += reg.kgScrap;
          resumenMateriales[mat].buenos += reg.buenos;
          resumenMateriales[mat].fallas += reg.fallas;
          resumenMateriales[mat].registros += 1;
        });
      }
    });

    const totalPiezas = buenos + fallas;

    return {
      kgTotal,
      kgScrap,
      buenos,
      fallas,
      totalPiezas,
      eficiencia:
        totalPiezas > 0 ? ((buenos / totalPiezas) * 100).toFixed(1) : "100.0",
      porcentajeScrap:
        kgTotal > 0 ? ((kgScrap / kgTotal) * 100).toFixed(1) : "0.0",
      articulos: Object.values(resumenArticulos)
        .sort((a, b) => b.buenos - a.buenos)
        .slice(0, 5),
      materiales: Object.values(resumenMateriales).sort(
        (a, b) => b.buenos - a.buenos,
      ),
    };
  }, [dataset, mesesSelec, materialesSelec, productosSelec]);

  // 🌟 ENGINE GRÁFICO BLINDADO: Fuerza el orden cronológico sin importar la secuencia de selección del usuario
  const datosPorMesGrafico = useMemo(() => {
    if (!dataset || !dataset.registros || mesesSelec.length === 0) return [];

    // Ordenamos el arreglo de entrada según la posición indexada en el calendario maestro
    const mesesFiltradosYOrdenados = [...mesesSelec].sort(
      (a, b) => ORDEN_MESES_MAESTRO.indexOf(a) - ORDEN_MESES_MAESTRO.indexOf(b),
    );

    return mesesFiltradosYOrdenados
      .map((mes) => {
        let kgTotal = 0,
          kgScrap = 0,
          buenos = 0,
          fallas = 0;

        dataset.registros.forEach((reg) => {
          if (reg.mes !== mes) return;

          const cumpleProd = productosSelec.includes(reg.articulo);
          const cumpleMat =
            reg.materiales.length === 0 ||
            reg.materiales.some((m) => materialesSelec.includes(m));

          if (cumpleProd && cumpleMat) {
            kgTotal += reg.kgTotal;
            kgScrap += reg.kgScrap;
            buenos += reg.buenos;
            fallas += reg.fallas;
          }
        });

        const totalPiezas = buenos + fallas;

        return {
          mes,
          kgTotal,
          kgScrap,
          buenos,
          fallas,
          totalPiezas,
          eficiencia:
            totalPiezas > 0
              ? ((buenos / totalPiezas) * 100).toFixed(1)
              : "100.0",
          porcentajeScrap:
            kgTotal > 0 ? ((kgScrap / kgTotal) * 100).toFixed(1) : "0.0",
        };
      })
      .filter((d) => d.totalPiezas > 0);
  }, [dataset, mesesSelec, productosSelec, materialesSelec]);

  // Filtro predictivo para la tabla de materias primas inferior
  const tablaMaterialesFiltrados = useMemo(() => {
    if (!metricasGlobales || !metricasGlobales.materiales) return [];
    return metricasGlobales.materiales.filter((mat) =>
      mat.nombre.toLowerCase().includes(busquedaTablaMaterial.toLowerCase()),
    );
  }, [metricasGlobales, busquedaTablaMaterial]);

  return (
    <div className="p-6 lg:p-10 bg-[#FAF9F5] min-h-screen space-y-8 select-none font-sans">
      {/* HEADER DE CONTROL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-2xl border border-stone-200/60 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-stone-800 tracking-tight">
            Dashboard de Producción
          </h1>
          <p className="text-xs font-semibold text-stone-400 mt-1 uppercase tracking-wider">
            Detalle de semielaborados y materias primas
          </p>
        </div>

        <label className="flex items-center gap-2 px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-semibold shadow-md cursor-pointer transition-all active:scale-95 text-xs whitespace-nowrap group">
          <FaFileExcel className="text-emerald-400 group-hover:scale-110 transition-transform" />
          {loading ? "Calculando Unidades..." : "Importar Planilla Real"}
          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            className="hidden"
            onChange={handleImportar}
            disabled={loading}
          />
        </label>
      </div>

      {/* COMPONENTE VACÍO */}
      {!dataset && (
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-stone-300 bg-white rounded-3xl p-20 text-center shadow-sm">
          <FaCloudUploadAlt
            size={40}
            className="text-stone-300 animate-bounce mb-3"
          />
          <h3 className="font-semibold text-stone-700 text-sm">
            Esperando importación de datos
          </h3>
          <p className="text-xs text-stone-400 max-w-xs mt-1">
            Suba la planilla diaria filtrada para desplegar las comparativas e
            indicadores reactivos de unidades.
          </p>
        </div>
      )}

      {dataset && metricasGlobales && (
        <div className="space-y-6">
          {/* BARRA BI SUPERIOR: COMPACTA Y PREDICTIVA CONTRA EL DESORDEN */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm">
            {/* 1. Conmutador de Meses Consolidados */}
            <div className="space-y-2.5">
              <span className="text-[10px] font-semibold uppercase text-stone-400 tracking-wider flex items-center gap-1.5">
                <FaCalendarAlt /> Evaluación de Períodos
              </span>
              <div className="flex flex-wrap gap-1.5 p-2 bg-stone-50 rounded-xl border border-stone-200/40 min-h-[140px] content-start">
                {(dataset.meses || []).map((m) => {
                  const activo = mesesSelec.includes(m);
                  return (
                    <button
                      key={m}
                      onClick={() => toggleFiltro(m, mesesSelec, setMesesSelec)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${activo ? "bg-blue-600 text-white shadow-sm" : "bg-white text-stone-500 border border-stone-200 hover:bg-stone-100"}`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Buscador Predictivo de Materiales */}
            <div className="space-y-2.5">
              <span className="text-[10px] font-semibold uppercase text-stone-400 tracking-wider flex items-center gap-1.5">
                <FaFilter /> Materias Primas Usadas
              </span>
              <div className="relative">
                <FaSearch className="absolute left-3.5 top-3 text-stone-400 text-xs" />
                <input
                  type="text"
                  placeholder="Buscar material..."
                  value={busquedaMaterial}
                  onChange={(e) => setBusquedaMaterial(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-700 placeholder-stone-400 outline-none focus:border-stone-400 transition-colors"
                />
              </div>

              <div className="space-y-1 max-h-28 overflow-y-auto custom-scrollbar p-2 bg-white border border-stone-100 rounded-xl">
                {listaMaterialesFiltrados.length === 0 ? (
                  <span className="text-[10px] text-stone-400 font-semibold block text-center py-4">
                    Sin materias primas
                  </span>
                ) : (
                  listaMaterialesFiltrados.map((mat) => {
                    const checked = materialesSelec.includes(mat);
                    return (
                      <label
                        key={mat}
                        className="flex items-center gap-2 px-2 py-1 hover:bg-stone-50 rounded-lg cursor-pointer text-[11px] font-semibold text-stone-600 truncate"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            toggleFiltro(
                              mat,
                              materialesSelec,
                              setMaterialesSelec,
                            )
                          }
                          className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                        />
                        {mat}
                      </label>
                    );
                  })
                )}
              </div>
              <div className="flex gap-2 text-[10px] font-semibold text-blue-600">
                <button
                  onClick={() => setMaterialesSelec(dataset.materiales)}
                  className="hover:underline cursor-pointer bg-transparent border-none"
                >
                  Seleccionar Todo
                </button>
                <span className="text-stone-300">|</span>
                <button
                  onClick={() => setMaterialesSelec([])}
                  className="hover:underline cursor-pointer bg-transparent border-none text-stone-400"
                >
                  Limpiar
                </button>
              </div>
            </div>

            {/* 3. Buscador Predictivo de Moldes / Artículos */}
            <div className="space-y-2.5">
              <span className="text-[10px] font-semibold uppercase text-stone-400 tracking-wider flex items-center gap-1.5">
                <FaBoxes /> Artículos Elaborados
              </span>
              <div className="relative">
                <FaSearch className="absolute left-3.5 top-3 text-stone-400 text-xs" />
                <input
                  type="text"
                  placeholder="Buscar modelo..."
                  value={busquedaProducto}
                  onChange={(e) => setBusquedaProducto(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-700 placeholder-stone-400 outline-none focus:border-stone-400 transition-colors"
                />
              </div>

              <div className="space-y-1 max-h-28 overflow-y-auto custom-scrollbar p-2 bg-white border border-stone-100 rounded-xl">
                {listaProductosFiltrados.length === 0 ? (
                  <span className="text-[10px] text-stone-400 font-semibold block text-center py-4">
                    Sin artículos activos
                  </span>
                ) : (
                  listaProductosFiltrados.map((prod) => {
                    const checked = productosSelec.includes(prod);
                    return (
                      <label
                        key={prod}
                        className="flex items-center gap-2 px-2 py-1 hover:bg-stone-50 rounded-lg cursor-pointer text-[11px] font-semibold text-stone-600 truncate"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            toggleFiltro(
                              prod,
                              productosSelec,
                              setProductosSelec,
                            )
                          }
                          className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                        />
                        {prod}
                      </label>
                    );
                  })
                )}
              </div>
              <div className="flex gap-2 text-[10px] font-semibold text-blue-600">
                <button
                  onClick={() => setProductosSelec(dataset.productos)}
                  className="hover:underline cursor-pointer bg-transparent border-none"
                >
                  Seleccionar Todo
                </button>
                <span className="text-stone-300">|</span>
                <button
                  onClick={() => setProductosSelec([])}
                  className="hover:underline cursor-pointer bg-transparent border-none text-stone-400"
                >
                  Limpiar
                </button>
              </div>
            </div>
          </div>

          {/* TARJETAS KPI ENFOCADAS EN UNIDADES PRODUCIDAS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                <span className="w-2 h-2 bg-blue-500 rounded-full" />
                Unidades Aprobadas
              </span>
              <h3 className="text-2xl font-semibold text-stone-800 mt-1">
                {metricasGlobales.buenos.toLocaleString()} u
              </h3>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                <span className="w-2 h-2 bg-amber-500 rounded-full" />
                Unidades Fallas
              </span>
              <h3 className="text-2xl font-semibold text-amber-700 mt-1">
                {metricasGlobales.fallas.toLocaleString()} u
              </h3>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                Efectividad Operativa
              </span>
              <h3 className="text-2xl font-semibold text-emerald-600 mt-1">
                {metricasGlobales.eficiencia}%
              </h3>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                <span className="w-2 h-2 bg-stone-500 rounded-full" />
                Masa Procesada
              </span>
              <h3 className="text-2xl font-semibold text-stone-600 mt-1">
                {Number(metricasGlobales.kgTotal).toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                })}{" "}
                kg
              </h3>
            </div>
          </div>

          {/* CUADRO COMPARATIVO CENTRAL */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* GRÁFICO CRONOLÓGICO SEGURO (BARRAS VERTICALES DE UNIDADES) */}
            <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm lg:col-span-2 flex flex-col justify-between space-y-6">
              <div>
                <h4 className="font-semibold text-stone-800 text-sm">
                  Contraste Volumétrico de Piezas entre Meses
                </h4>
                <p className="text-[11px] text-stone-400 font-medium">
                  Análisis cronológico de piezas aprobadas vs piezas rechazadas
                  en cada período activado.
                </p>
              </div>

              {datosPorMesGrafico.length === 0 ? (
                <p className="text-xs font-semibold text-stone-400 text-center py-20 bg-stone-50 rounded-2xl border border-stone-200/40">
                  No hay información para graficar bajo las fechas y filtros
                  activos.
                </p>
              ) : (
                <div className="h-64 flex items-end justify-around border-b border-stone-200 pb-2 pt-10 px-2 gap-4">
                  {datosPorMesGrafico.map((dataMes, index) => {
                    const maxPiezasTotal =
                      Math.max(
                        ...datosPorMesGrafico.map((m) => m.totalPiezas),
                      ) || 1;
                    const alturaContenedorBarra =
                      (dataMes.totalPiezas / maxPiezasTotal) * 100;
                    const alturaSegmentoFallas =
                      dataMes.totalPiezas > 0
                        ? (dataMes.fallas / dataMes.totalPiezas) * 100
                        : 0;

                    return (
                      <div
                        key={index}
                        className="flex-1 flex flex-col items-center group relative h-full justify-end max-w-[90px]"
                      >
                        {/* TOOLTIP FLOTANTE INTERACTIVO */}
                        <div className="opacity-0 group-hover:opacity-100 transition-all absolute bottom-full mb-3 bg-stone-900 text-white p-3.5 rounded-xl text-[10px] font-semibold z-50 shadow-2xl whitespace-nowrap pointer-events-none space-y-1 transform -translate-y-1">
                          <span className="text-blue-400 block font-semibold border-b border-stone-700 pb-1 mb-1 text-xs">
                            📊 {dataMes.mes}
                          </span>
                          <span>
                            📦 Aprobadas OK: {dataMes.buenos.toLocaleString()} u
                          </span>
                          <span className="text-amber-400 block">
                            🗑️ Rechazadas NC: {dataMes.fallas.toLocaleString()}{" "}
                            u ({dataMes.porcentajeScrap}%)
                          </span>
                          <span>
                            ⚖️ Masa Total:{" "}
                            {Number(dataMes.kgTotal).toLocaleString()} kg
                          </span>
                        </div>

                        {/* Barra Vertical de Piezas */}
                        <div
                          className="w-full bg-blue-600 rounded-t-lg overflow-hidden relative cursor-pointer shadow-sm group-hover:shadow-md group-hover:brightness-105 transition-all flex flex-col justify-end"
                          style={{
                            height: `${Math.max(alturaContenedorBarra, 10)}%`,
                          }}
                        >
                          <div
                            className="bg-gradient-to-b from-rose-500 to-amber-500 w-full absolute top-0"
                            style={{ height: `${alturaSegmentoFallas}%` }}
                          />
                        </div>

                        <span className="text-[10px] font-semibold text-stone-600 mt-2 truncate w-full text-center">
                          {dataMes.mes}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-center gap-6 text-[11px] font-semibold text-stone-500 pt-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 bg-blue-600 rounded-md" /> Unidades
                  OK
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 bg-gradient-to-b from-rose-500 to-amber-500 rounded-md" />{" "}
                  Unidades Fallas (Rechazadas)
                </span>
              </div>
            </div>

            {/* PARETO SLIM: TOP ARTÍCULOS POR UNIDADES */}
            <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
              <div>
                <h4 className="font-semibold text-stone-800 text-sm">
                  Top 5 Artículos Mayor Producidos
                </h4>
                <p className="text-[11px] text-stone-400 font-medium">
                  Volumen acumulado evaluado por unidades totales.
                </p>
              </div>

              <div className="space-y-3.5 pt-1">
                {metricasGlobales.articulos.map((art, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-stone-50 rounded-xl border border-stone-200/60 flex items-center justify-between text-xs font-semibold"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="text-stone-700 block truncate uppercase tracking-tight">
                        {art.nombre}
                      </span>
                      <span className="text-[10px] text-stone-400 font-semibold">
                        {(art.buenos + art.fallas).toLocaleString()} u
                        procesadas
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        setItemModal({ tipo: "Artículo / Molde", ...art })
                      }
                      className="text-stone-400 hover:text-blue-600 p-1.5 bg-white border border-stone-200 rounded-lg transition-colors cursor-pointer outline-none"
                    >
                      <FaInfoCircle size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* TABLA DE MATERIAS PRIMAS CON BUSCADOR DE COINCIDENCIAS DIRECTO */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="p-5 bg-stone-50 border-b border-stone-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <span className="font-semibold text-stone-700 text-xs uppercase tracking-wider">
                Análisis Técnico de Consumo por Materia Prima
              </span>

              <div className="relative w-full sm:w-72">
                <FaSearch className="absolute left-3 top-2.5 text-stone-400 text-xs" />
                <input
                  type="text"
                  placeholder="Filtrar tabla por material..."
                  value={busquedaTablaMaterial}
                  onChange={(e) => setBusquedaTablaMaterial(e.target.value)}
                  className="w-full pl-8 pr-4 py-1.5 bg-white border border-stone-300 rounded-xl text-xs font-semibold text-stone-700 placeholder-stone-400 outline-none focus:border-stone-400 transition-colors shadow-inner"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-stone-50/40 text-stone-400 font-semibold text-[10px] uppercase tracking-wider border-b border-stone-200">
                    <th className="py-4 px-6">Materia Prima</th>
                    <th className="py-4 px-4">Volumen Bruto</th>
                    <th className="py-4 px-4">Scrap del Material</th>
                    <th className="py-4 px-4">Piezas Aprobadas</th>
                    <th className="py-4 px-4">Piezas Fallas</th>
                    <th className="py-4 px-6 text-right">Auditar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-xs font-semibold text-stone-600">
                  {tablaMaterialesFiltrados.length === 0 ? (
                    <tr>
                      <td
                        colSpan="6"
                        className="py-8 text-center font-semibold text-stone-400 bg-stone-50/20"
                      >
                        No hay materias primas que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    tablaMaterialesFiltrados.map((mat, i) => (
                      <tr
                        key={i}
                        className="hover:bg-stone-50/20 transition-colors"
                      >
                        <td className="py-4 px-6 text-stone-800 font-semibold">
                          {mat.nombre}
                        </td>
                        <td className="py-4 px-4">
                          {Number(mat.kgReferenciado).toLocaleString()} kg
                        </td>
                        <td className="py-4 px-4 text-amber-700">
                          {Number(mat.scrap).toLocaleString()} kg
                        </td>
                        <td className="py-4 px-4 text-emerald-600">
                          {mat.buenos.toLocaleString()} u
                        </td>
                        <td className="py-4 px-4 text-rose-500">
                          {mat.fallas.toLocaleString()} u
                        </td>
                        <td className="py-4 px-6 text-right">
                          <button
                            onClick={() =>
                              setItemModal({ tipo: "Materia Prima", ...mat })
                            }
                            className="px-2.5 py-1.5 text-[10px] bg-white text-stone-700 font-semibold rounded-lg border border-stone-200 shadow-sm hover:bg-stone-50 cursor-pointer"
                          >
                            Ver Detalles
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GERENCIAL MAXIMIZADO MULTI-INDICADOR */}
      <AnimatePresence>
        {itemModal && (
          <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-lg w-full p-6 space-y-6 relative max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <button
                onClick={() => setItemModal(null)}
                className="absolute top-4 right-4 text-stone-300 hover:text-stone-600 cursor-pointer bg-transparent border-none outline-none"
              >
                <FaTimes size={16} />
              </button>

              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                  <FaShieldAlt size={18} />
                </div>
                <div>
                  <span className="text-[9px] font-semibold px-2 py-0.5 bg-blue-100 text-blue-700 rounded uppercase tracking-wider">
                    {itemModal.tipo}
                  </span>
                  <h3 className="text-base font-semibold text-stone-800 mt-1 uppercase tracking-tight break-words">
                    {itemModal.nombre || itemModal.articulo}
                  </h3>
                </div>
              </div>

              {/* Grid Gerencial de Auditoría Avanzada */}
              <div className="grid grid-cols-2 gap-4 border-t border-stone-100 pt-4 text-xs font-semibold text-stone-600">
                <div className="bg-stone-50 p-3 rounded-xl flex items-center gap-2.5">
                  <div className="text-stone-400">
                    <FaBoxes size={14} />
                  </div>
                  <div>
                    <span className="text-[10px] block text-stone-400">
                      Unidades OK
                    </span>
                    <span className="text-sm font-semibold text-emerald-600">
                      {(itemModal.buenos || 0).toLocaleString()} u
                    </span>
                  </div>
                </div>
                <div className="bg-stone-50 p-3 rounded-xl flex items-center gap-2.5">
                  <div className="text-stone-400">
                    <FaTrashAlt size={14} />
                  </div>
                  <div>
                    <span className="text-[10px] block text-stone-400">
                      Unidades Fallas
                    </span>
                    <span className="text-sm font-semibold text-rose-600">
                      {(itemModal.fallas || 0).toLocaleString()} u
                    </span>
                  </div>
                </div>
                <div className="bg-stone-50 p-3 rounded-xl flex items-center gap-2.5">
                  <div className="text-stone-400">
                    <FaWeightHanging size={14} />
                  </div>
                  <div>
                    <span className="text-[10px] block text-stone-400">
                      Masa Bruta
                    </span>
                    <span className="text-sm font-semibold text-stone-800">
                      {(
                        itemModal.kg ||
                        itemModal.kgReferenciado ||
                        0
                      ).toLocaleString()}{" "}
                      kg
                    </span>
                  </div>
                </div>
                <div className="bg-stone-50 p-3 rounded-xl flex items-center gap-2.5">
                  <div className="text-stone-400">
                    <FaPercentage size={14} />
                  </div>
                  <div>
                    <span className="text-[10px] block text-stone-400">
                      Masa Scrap
                    </span>
                    <span className="text-sm font-semibold text-amber-700">
                      {(itemModal.scrap || 0).toLocaleString()} kg
                    </span>
                  </div>
                </div>

                {/* Sub-bloque Computado de Eficiencias Específicas */}
                <div className="bg-stone-50 p-3.5 rounded-xl col-span-2 space-y-2 border border-stone-200/30">
                  <span className="text-[9px] font-semibold uppercase text-stone-400 tracking-wider flex items-center gap-1">
                    <FaChartLine /> Análisis de Desempeño Técnico
                  </span>
                  <div className="flex justify-between items-center text-[11px] pt-1">
                    <span className="text-stone-500 font-semibold">
                      Masa Útil Confeccionada:
                    </span>
                    <span className="text-stone-800 font-semibold">
                      {Number(
                        (itemModal.kg || itemModal.kgReferenciado || 0) -
                          (itemModal.scrap || 0),
                      ).toLocaleString()}{" "}
                      kg
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-stone-500 font-semibold">
                      Pérdida por Scrap Absoluto:
                    </span>
                    <span className="text-rose-600 font-semibold">
                      {(
                        ((itemModal.scrap || 0) /
                          (itemModal.kg || itemModal.kgReferenciado || 1)) *
                        100
                      ).toFixed(1)}
                      %
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-stone-500 font-semibold">
                      Peso Promedio Real Unitario:
                    </span>
                    <span className="text-blue-600 font-semibold">
                      {itemModal.buenos + itemModal.fallas > 0
                        ? (
                            (itemModal.kg || itemModal.kgReferenciado || 0) /
                            (itemModal.buenos + itemModal.fallas)
                          ).toFixed(3)
                        : "0.000"}{" "}
                      kg/u
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-stone-500 font-semibold">
                      Registros de Corrida Auditados:
                    </span>
                    <span className="text-stone-700 font-semibold flex items-center gap-1">
                      <FaListOl size={10} /> {itemModal.registros || 0} filas
                    </span>
                  </div>
                </div>
              </div>

              {/* Tasa final de aprobación en el pie del modal */}
              <div className="p-3.5 bg-stone-900 text-white rounded-xl text-xs font-semibold flex justify-between items-center shadow-md">
                <span className="flex items-center gap-1.5">
                  <FaCheckCircle className="text-emerald-400" /> Efectividad
                  Operativa de Calidad
                </span>
                <span className="text-emerald-400 text-sm font-semibold">
                  {(
                    (itemModal.buenos /
                      (itemModal.buenos + itemModal.fallas || 1)) *
                    100
                  ).toFixed(1)}
                  %
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
