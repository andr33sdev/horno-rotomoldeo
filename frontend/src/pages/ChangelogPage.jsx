import React, { useState, useEffect, useMemo } from "react";
import {
  FaHistory,
  FaPlus,
  FaPaperPlane,
  FaSearch,
  FaTag,
  FaLink,
  FaExchangeAlt,
  FaBan,
  FaCalendarAlt,
  FaUserCircle,
  FaFilter,
  FaChevronLeft,
  FaChevronRight,
  FaFilePdf,
  FaTimes,
  FaTrash,
  FaCheckSquare,
  FaSquare,
  FaFlask,
  FaArrowLeft,
  FaBox,
  FaBoxOpen,
  FaEdit,
  FaImage,
} from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE_URL, authFetch } from "../utils";
import { getAuthData } from "../auth/authHelper"; // Para saber quién edita
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import logoConoflex from "../assets/LogoConoflex.png";

const configTipo = {
  NUEVO: {
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-600",
    icon: <FaPlus />,
    label: "Lanzamientos",
  },
  MODIFICACION: {
    badgeBg: "bg-blue-50",
    badgeText: "text-blue-600",
    icon: <FaExchangeAlt />,
    label: "Modificaciones",
  },
  RECETA: {
    badgeBg: "bg-purple-50",
    badgeText: "text-purple-600",
    icon: <FaFlask />,
    label: "Cambio de Receta",
  },
  OBSOLETO: {
    badgeBg: "bg-rose-50",
    badgeText: "text-rose-600",
    icon: <FaBan />,
    label: "Obsoletos",
  },
  AJUSTE_RECETA: {
    badgeBg: "bg-indigo-50",
    badgeText: "text-indigo-600",
    icon: <FaFlask />,
    label: "Ajuste Producción",
  },
};

const getBase64ImageFromUrl = async (imageUrl) => {
  const res = await fetch(imageUrl, { mode: "cors" });
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const CompactNoteRow = ({ note, onClick }) => {
  const dateObj = new Date(note.fecha);
  const fechaVisual = new Date(
    dateObj.getTime() + dateObj.getTimezoneOffset() * 60000,
  );

  const conteoTipos = note.items.reduce((acc, item) => {
    acc[item.tipo_cambio] = (acc[item.tipo_cambio] || 0) + 1;
    return acc;
  }, {});

  return (
    <motion.div
      whileHover={{ x: 4 }}
      onClick={onClick}
      className="bg-white border border-slate-200 hover:border-blue-300 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col md:flex-row md:items-center justify-between gap-4"
    >
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-3 mb-1.5">
          <h3 className="text-sm md:text-base font-bold text-slate-800 leading-tight group-hover:text-blue-600 transition-colors truncate">
            {note.titulo}
          </h3>
          <span className="text-[9px] md:text-[10px] font-bold text-slate-400 whitespace-nowrap bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
            {fechaVisual.toLocaleDateString("es-AR")}
          </span>
          {note.editado_por && (
            <span className="text-[8px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
              Editado
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
          <FaUserCircle className="text-slate-400" /> Autoriza:{" "}
          <span className="font-bold text-slate-600">{note.responsable}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center md:justify-end gap-2 shrink-0">
        <span className="text-[10px] font-bold bg-slate-50 text-slate-600 px-2.5 py-1 rounded-md flex items-center gap-1.5 border border-slate-200 shadow-sm">
          <FaBox className="text-slate-400" /> {note.items.length} Prod.
        </span>
        {Object.entries(conteoTipos).map(([tipo, count]) => {
          const st = configTipo[tipo] || configTipo.MODIFICACION;
          return (
            <span
              key={tipo}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 border ${st.badgeBg} ${st.badgeText} border-opacity-60 shadow-sm`}
            >
              {st.icon} {count} {st.label}
            </span>
          );
        })}
        <FaChevronRight className="text-slate-300 group-hover:text-blue-500 ml-2 transition-colors hidden md:block" />
      </div>
    </motion.div>
  );
};

const NoteDetailView = ({ note, onBack, onDelete, onEdit }) => {
  const [generandoPDF, setGenerandoPDF] = useState(false);
  const dateObj = new Date(note.fecha);
  const fechaVisual = new Date(
    dateObj.getTime() + dateObj.getTimezoneOffset() * 60000,
  );

  const itemsByType = note.items.reduce((acc, item) => {
    if (!acc[item.tipo_cambio]) acc[item.tipo_cambio] = [];
    acc[item.tipo_cambio].push(item);
    return acc;
  }, {});

  // =========================================================================
  // GENERADOR DE PDF: ESTILO DOCUMENTO OFICIAL (ALINEACIÓN CORREGIDA)
  // =========================================================================
  const generarPDFElegante = async () => {
    setGenerandoPDF(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      let yPos = 15;

      // 1. CABECERA PRINCIPAL Y LOGO
      try {
        // Asegurate de tener importado tu logo arriba: import logoConoflex from "../assets/LogoConoflex.png";
        doc.addImage(logoConoflex, "PNG", 14, yPos - 2, 40, 12);
      } catch (e) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(15, 23, 42);
        doc.text("CONOFLEX", 14, yPos + 6);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text("DOCUMENTO OFICIAL", pageWidth - 14, yPos + 4, {
        align: "right",
      });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text("NOTA DE CAMBIOS", pageWidth - 14, yPos + 9, { align: "right" });

      yPos += 16;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(14, yPos, pageWidth - 14, yPos);
      yPos += 8;

      // 2. CAJA DE METADATOS
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(148, 163, 184);
      doc.text("TÍTULO", 14, yPos);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(note.titulo, 32, yPos);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(148, 163, 184);
      doc.text("FECHA", pageWidth - 55, yPos);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      doc.text(fechaVisual.toLocaleDateString("es-AR"), pageWidth - 38, yPos);

      yPos += 6;

      // CAMPO DE REVISIÓN / EDICIÓN
      if (note.editado_por) {
        const fechaEdicion = new Date(note.fecha_edicion).toLocaleDateString(
          "es-AR",
        );
        doc.setFont("helvetica", "bold");
        doc.setTextColor(148, 163, 184);
        doc.text("REVISIÓN", 14, yPos);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(15, 23, 42);
        doc.text(
          `Editado por ${note.editado_por} el ${fechaEdicion}`,
          32,
          yPos,
        );
        yPos += 6;
      }

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(14, yPos, pageWidth - 14, yPos);
      yPos += 6;

      // 3. RENDERIZADO MANUAL DE BLOQUES Y FOTOS
      for (const [tipo, items] of Object.entries(itemsByType)) {
        const style = configTipo[tipo];

        if (yPos > 260) {
          doc.addPage();
          yPos = 20;
        }

        // Header del Bloque (Gris suave)
        doc.setFillColor(248, 250, 252);
        doc.rect(14, yPos, pageWidth - 28, 7, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(style.label.toUpperCase(), 16, yPos + 5); // HEADER EMPIEZA EN X=16
        yPos += 7;

        // Items (Columnas Manuales)
        for (const item of items) {
          yPos += 6; // Padding superior

          if (yPos > 250) {
            doc.addPage();
            yPos = 20;
          }

          // Columna Izquierda: Producto
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.setTextColor(71, 85, 105);
          const splitProd = doc.splitTextToSize(item.producto, 50);
          doc.text(splitProd, 16, yPos); // <-- CORRECCIÓN: AHORA EMPIEZA EN X=16 IGUAL QUE EL HEADER

          // Columna Central: Descripción
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 116, 139);
          const descMaxWidth = item.adjuntos_url ? 86 : 124;
          const splitDesc = doc.splitTextToSize(item.descripcion, descMaxWidth);
          doc.text(splitDesc, 68, yPos);

          let itemHeightY =
            yPos + (Math.max(splitProd.length, splitDesc.length) - 1) * 4;

          // Renderizar Specs de Reflectiva debajo de la descripción
          if (item.lleva_reflectiva) {
            itemHeightY += 5;
            doc.setFontSize(8);
            doc.text(
              `Specs: ${item.tipo_reflectiva} | ${item.tipo_protector || "N/A"} | ${item.tipo_aplicacion || "N/A"}`,
              68,
              itemHeightY,
            );
          }

          // Columna Derecha: Fotos y Enlaces
          if (item.adjuntos_url) {
            const urls = item.adjuntos_url.split("|").filter(Boolean);
            if (urls.length > 0) {
              let xImg = 160;
              let currentYImg = yPos - 3;
              let maxImgHeight = 0;

              for (const url of urls) {
                try {
                  if (currentYImg + 16 > 280) {
                    doc.addPage();
                    currentYImg = 20;
                    itemHeightY = 20;
                  }

                  const imgBase64 = await getBase64ImageFromUrl(url);
                  doc.addImage(imgBase64, "JPEG", xImg, currentYImg, 16, 16);
                  doc.link(xImg, currentYImg, 16, 16, { url: url });

                  xImg += 18;
                  maxImgHeight = Math.max(maxImgHeight, 16);
                } catch (e) {
                  doc.setFillColor(239, 246, 255);
                  doc.setDrawColor(191, 219, 254);
                  doc.roundedRect(xImg, currentYImg, 16, 6, 1, 1, "FD");

                  doc.setTextColor(37, 99, 235);
                  doc.setFontSize(7);
                  doc.setFont("helvetica", "bold");
                  doc.text("VER DOC", xImg + 8, currentYImg + 4, {
                    align: "center",
                  });

                  doc.link(xImg, currentYImg, 16, 6, { url: url });

                  xImg += 18;
                  maxImgHeight = Math.max(maxImgHeight, 6);
                }
              }
              itemHeightY = Math.max(itemHeightY, currentYImg + maxImgHeight);
            }
          }

          yPos = itemHeightY + 6; // Padding inferior

          // Línea separadora sutil entre items (la línea sí va de 14 a 14)
          doc.setDrawColor(241, 245, 249);
          doc.setLineWidth(0.3);
          doc.line(14, yPos, pageWidth - 14, yPos);
        }
        yPos += 4;
      }

      // 4. FIRMA Y APROBACIÓN
      if (yPos > 260) {
        doc.addPage();
        yPos = 30;
      }

      yPos += 10;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.4);
      doc.line(14, yPos, 80, yPos);

      yPos += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text("Aprobado por:", 14, yPos);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(note.responsable, 36, yPos);

      doc.save(`NOTA_CAMBIOS_${note.slug.slice(-6).toUpperCase()}.pdf`);
    } catch (error) {
      console.error("Error generando PDF:", error);
      alert("Hubo un error al generar el PDF. Revisa la consola.");
    } finally {
      setGenerandoPDF(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6 md:p-10 max-w-4xl mx-auto relative overflow-hidden"
    >
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-blue-600 transition-colors mb-8"
      >
        <FaArrowLeft /> Volver al listado
      </button>

      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-8 pb-6 border-b border-slate-100">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 leading-tight mb-3">
            {note.titulo}
          </h1>
          <div className="flex items-center gap-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
            <span className="flex items-center gap-1.5">
              <FaCalendarAlt className="text-slate-400" />{" "}
              {fechaVisual.toLocaleDateString("es-AR")}
            </span>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <span className="flex items-center gap-1.5">
              <FaUserCircle className="text-slate-400" /> {note.responsable}
            </span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={generarPDFElegante}
            disabled={generandoPDF}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-600 bg-white border border-slate-200 hover:border-slate-300 px-4 py-2.5 rounded-xl transition-all shadow-sm hover:shadow disabled:opacity-50"
          >
            {generandoPDF ? (
              "Generando..."
            ) : (
              <>
                <FaFilePdf className="text-rose-500" size={14} /> Exportar PDF
              </>
            )}
          </button>
          <button
            onClick={() => onEdit(note)}
            className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 px-3 rounded-xl transition-all border border-transparent hover:border-blue-100"
            title="Editar Nota"
          >
            <FaEdit size={16} />
          </button>
          <button
            onClick={() => onDelete(note.items.map((i) => i.id))}
            className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 px-3 rounded-xl transition-all border border-transparent hover:border-rose-100"
            title="Eliminar Nota"
          >
            <FaTrash size={14} />
          </button>
        </div>
      </div>

      {/* Aviso de Edición en UI */}
      {note.editado_por && (
        <div className="mb-6 p-3 bg-amber-50/50 border border-amber-100 rounded-xl text-xs font-medium text-amber-700 flex items-center gap-2">
          <FaEdit className="text-amber-400" />
          Editado por <b>{note.editado_por}</b> el{" "}
          {new Date(note.fecha_edicion).toLocaleString("es-AR")}
        </div>
      )}

      <div className="space-y-10">
        {Object.entries(itemsByType).map(([tipo, items]) => {
          const style = configTipo[tipo];
          return (
            <div key={tipo}>
              <h3
                className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 mb-4 pb-2 border-b ${style.badgeText} border-slate-100`}
              >
                {style.icon} {style.label}
              </h3>

              <div className="flex flex-col gap-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 hover:bg-white hover:shadow-sm transition-all flex flex-col md:flex-row gap-4 md:gap-6 items-start"
                  >
                    <div className="flex-1 min-w-0 w-full">
                      <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 truncate mb-2">
                        <FaBoxOpen className="text-slate-400 shrink-0" />{" "}
                        {item.producto}
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap pl-0 md:pl-5">
                        {item.descripcion}
                      </p>

                      {/* MINIATURAS PARA TODOS LOS TIPOS DE CAMBIOS */}
                      {item.adjuntos_url && (
                        <div className="flex gap-3 mt-4 pl-0 md:pl-5">
                          {item.adjuntos_url
                            .split("|")
                            .filter(Boolean)
                            .map((url, i) => {
                              const isImg =
                                url.match(/\.(jpeg|jpg|gif|png|webp)$/i) ||
                                url.includes("drive.google") ||
                                url.includes("imgur");
                              return isImg ? (
                                <a
                                  key={i}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <img
                                    src={url}
                                    alt={`Adjunto ${i + 1}`}
                                    className="w-20 h-20 object-cover rounded-xl border border-slate-200 shadow-sm hover:scale-105 transition-transform bg-white"
                                  />
                                </a>
                              ) : (
                                <a
                                  key={i}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] bg-white border border-slate-200 text-blue-600 px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 hover:bg-blue-50 transition-colors w-fit h-fit shadow-sm"
                                >
                                  <FaLink /> Ver Documento {i + 1}
                                </a>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    {item.lleva_reflectiva && (
                      <div className="w-full md:w-64 shrink-0 flex flex-col gap-1.5 border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                          Especificaciones
                        </span>
                        <div className="text-[10px] font-bold bg-amber-50 text-amber-700 px-2.5 py-1.5 rounded-lg border border-amber-100 flex justify-between items-center shadow-sm">
                          <span className="opacity-60 font-semibold uppercase tracking-widest text-[8px]">
                            Lámina
                          </span>{" "}
                          {item.tipo_reflectiva}
                        </div>
                        {item.tipo_protector && (
                          <div className="text-[10px] font-bold bg-white text-slate-600 px-2.5 py-1.5 rounded-lg border border-slate-200 flex justify-between items-center shadow-sm">
                            <span className="opacity-60 font-semibold uppercase tracking-widest text-[8px]">
                              Prot
                            </span>{" "}
                            {item.tipo_protector}
                          </div>
                        )}
                        {item.tipo_aplicacion && (
                          <div className="text-[10px] font-bold bg-purple-50 text-purple-700 px-2.5 py-1.5 rounded-lg border border-purple-100 flex justify-between items-center shadow-sm">
                            <span className="opacity-60 font-semibold uppercase tracking-widest text-[8px]">
                              Apli
                            </span>{" "}
                            {item.tipo_aplicacion}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default function ChangelogPage() {
  const [logs, setLogs] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingNote, setEditingNote] = useState(null); // NUEVO: Saber si estamos editando

  const { slug } = useParams();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 12;
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("TODOS");
  const [selectedMonth, setSelectedMonth] = useState("ALL");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

  const [formGeneral, setFormGeneral] = useState({
    titulo: "",
    responsable: "Ingeniería",
    fecha_manual: new Date().toISOString().split("T")[0],
  });
  const initialItem = {
    producto: "",
    tipo_cambio: "MODIFICACION",
    descripcion: "",
    foto1: "",
    foto2: "",
    lleva_reflectiva: false,
    tipo_reflectiva: "Reflectiva China",
    tipo_protector: "Protector Chino",
    tipo_aplicacion: "Completa",
  };
  const [formItem, setFormItem] = useState(initialItem);
  const [noteItems, setNoteItems] = useState([]);

  // Usuario actual para dejar asentado quién editó
  const { user } = getAuthData();
  const currentUserName = user?.nombre || "Usuario";

  useEffect(() => {
    fetchLogs();
    fetchProductos();
  }, []);

  const fetchLogs = async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/changelog`);
      if (res.ok) setLogs(await res.json());
    } catch (e) {}
    setLoading(false);
  };

  const fetchProductos = async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/ingenieria/semielaborados`);
      if (res.ok) setAllProducts(await res.json());
    } catch (e) {}
  };

  const handleDeleteNote = async (idsArray) => {
    if (!window.confirm(`¿Eliminar definitivamente esta nota?`)) return;
    try {
      await Promise.all(
        idsArray.map((id) =>
          authFetch(`${API_BASE_URL}/changelog/${id}`, { method: "DELETE" }),
        ),
      );
      setLogs((prev) => prev.filter((l) => !idsArray.includes(l.id)));
      navigate("/changelog");
    } catch (e) {
      alert("Error al eliminar");
    }
  };

  // Abrir Modal en Modo Edición
  const handleEditNote = (note) => {
    setEditingNote(note);
    setFormGeneral({
      titulo: note.titulo,
      responsable: note.responsable,
      fecha_manual: new Date(note.fecha).toISOString().split("T")[0],
    });

    // Reconstruir los items para el carrito
    const restoredItems = note.items.map((i) => {
      const urls = (i.adjuntos_url || "").split("|");
      return {
        ...i,
        foto1: urls[0] || "",
        foto2: urls[1] || "",
      };
    });
    setNoteItems(restoredItems);
    setShowModal(true);
  };

  const groupedNotes = useMemo(() => {
    const groups = {};
    logs.forEach((log) => {
      let tituloLimpio = "Actualización de Ingeniería";
      let descLimpia = log.descripcion || "";
      let editadoPor = null;
      let fechaEdicion = null;

      // Extraer titulo
      const titleMatch = descLimpia.match(/\[TITULO\](.*?)\[\/TITULO\]/);
      if (titleMatch) {
        tituloLimpio = titleMatch[1];
        descLimpia = descLimpia.replace(/\[TITULO\].*?\[\/TITULO\]\n?/, "");
      }

      // Extraer marca de edición
      const editMatch = descLimpia.match(
        /\[EDITADO\](.*?)\|(.*?)\[\/EDITADO\]/,
      );
      if (editMatch) {
        editadoPor = editMatch[1];
        fechaEdicion = editMatch[2];
        descLimpia = descLimpia.replace(/\[EDITADO\].*?\[\/EDITADO\]\n?/, "");
      }

      const dateObj = new Date(log.fecha);
      const slugBase =
        tituloLimpio.toLowerCase().replace(/[^a-z0-9]+/g, "-") +
        "-" +
        dateObj.getTime();
      const key = `${log.fecha}_${tituloLimpio}`;

      if (!groups[key]) {
        groups[key] = {
          slug: slugBase,
          fecha: log.fecha,
          titulo: tituloLimpio,
          responsable: log.responsable,
          editado_por: editadoPor,
          fecha_edicion: fechaEdicion,
          items: [],
        };
      }
      groups[key].items.push({
        id: log.id,
        producto: log.producto,
        tipo_cambio: log.tipo_cambio,
        descripcion: descLimpia,
        adjuntos_url: log.adjuntos_url,
        lleva_reflectiva: log.lleva_reflectiva,
        tipo_reflectiva: log.tipo_reflectiva,
        tipo_protector: log.tipo_protector,
        tipo_aplicacion: log.tipo_aplicacion,
      });
    });

    return Object.values(groups)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .filter((note) => {
        const dLocal = new Date(
          new Date(note.fecha).getTime() +
            new Date(note.fecha).getTimezoneOffset() * 60000,
        );
        const matchesSearch =
          note.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
          note.items.some((i) =>
            i.producto.toLowerCase().includes(searchTerm.toLowerCase()),
          );
        const matchesType =
          filterType === "TODOS" ||
          note.items.some((i) => i.tipo_cambio === filterType);
        let matchesDate = true;
        if (selectedMonth !== "ALL")
          matchesDate =
            `${dLocal.getFullYear()}-${String(dLocal.getMonth() + 1).padStart(2, "0")}` ===
            selectedMonth;
        if (dateRange.start && dateRange.end) {
          const start = new Date(dateRange.start);
          const end = new Date(dateRange.end);
          end.setHours(23, 59, 59);
          matchesDate = dLocal >= start && dLocal <= end;
        }
        return matchesSearch && matchesType && matchesDate;
      });
  }, [logs, searchTerm, filterType, selectedMonth, dateRange]);

  const selectedNote = useMemo(
    () => (slug ? groupedNotes.find((n) => n.slug === slug) : null),
    [slug, groupedNotes],
  );

  const availableMonths = useMemo(() => {
    const months = new Set();
    logs.forEach((log) => {
      const d = new Date(
        new Date(log.fecha).getTime() +
          new Date(log.fecha).getTimezoneOffset() * 60000,
      );
      months.add(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      );
    });
    return Array.from(months).sort().reverse();
  }, [logs]);

  const totalPages = Math.ceil(groupedNotes.length / ITEMS_PER_PAGE);
  const currentData = groupedNotes.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE,
  );

  const handleAddItemToNote = () => {
    if (!formItem.producto) return alert("Seleccioná un producto");
    if (!formItem.descripcion) return alert("Detallá el cambio del producto");

    const itemToSave = { ...formItem };
    itemToSave.adjuntos_url = [itemToSave.foto1, itemToSave.foto2]
      .filter(Boolean)
      .join("|");

    setNoteItems([...noteItems, itemToSave]);
    setFormItem(initialItem);
  };

  const handleRemoveItemFromNote = (idx) => {
    setNoteItems(noteItems.filter((_, i) => i !== idx));
  };

  const handleSaveFullNote = async () => {
    if (!formGeneral.titulo || !formGeneral.responsable)
      return alert("Completá Título y Responsable");
    if (noteItems.length === 0) return alert("Agregá al menos un cambio.");

    try {
      if (editingNote) {
        // MODO EDICIÓN (PUT)
        const oldIds = editingNote.items.map((i) => i.id);
        const res = await authFetch(`${API_BASE_URL}/changelog/grupo`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids_to_delete: oldIds,
            items: noteItems,
            titulo: formGeneral.titulo,
            responsable: formGeneral.responsable,
            fecha_original: editingNote.fecha,
            editado_por: currentUserName,
          }),
        });
        if (res.ok) {
          setShowModal(false);
          fetchLogs();
          setNoteItems([]);
          setEditingNote(null);
          setFormGeneral({
            titulo: "",
            responsable: "Ingeniería",
            fecha_manual: new Date().toISOString().split("T")[0],
          });
        }
      } else {
        // MODO CREACIÓN (POST)
        const res = await authFetch(`${API_BASE_URL}/changelog`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...formGeneral, items: noteItems }),
        });
        if (res.ok) {
          setShowModal(false);
          fetchLogs();
          setNoteItems([]);
          setFormGeneral({
            titulo: "",
            responsable: "Ingeniería",
            fecha_manual: new Date().toISOString().split("T")[0],
          });
        }
      }
    } catch (e) {
      alert("Error al guardar");
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] animate-in fade-in duration-500 overflow-hidden">
      {!selectedNote && (
        <header className="bg-white border-b border-slate-100 px-6 py-5 shrink-0 z-20 sticky top-0 shadow-sm">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-500 shadow-inner shrink-0">
                <FaHistory size={18} />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight leading-none">
                  Release Notes
                </h1>
                <p className="text-[11px] font-bold text-slate-400 mt-1.5 tracking-widest uppercase">
                  Historial de Ingeniería
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setEditingNote(null);
                setShowModal(true);
              }}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95 w-full sm:w-auto"
            >
              <FaPlus size={12} /> Nueva Nota
            </button>
          </div>
        </header>
      )}

      <div className="flex-1 overflow-y-auto w-full custom-scrollbar">
        <div className="max-w-6xl mx-auto p-4 md:p-6 min-h-full">
          {selectedNote ? (
            <NoteDetailView
              note={selectedNote}
              onBack={() => navigate("/changelog")}
              onDelete={handleDeleteNote}
              onEdit={handleEditNote}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-1 space-y-5">
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm sticky top-0">
                  <div className="relative mb-5">
                    <FaSearch className="absolute left-3.5 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar nota o producto..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 font-medium focus:border-blue-500 focus:bg-white transition-colors outline-none"
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="mb-6">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <FaFilter /> Por Tipo
                    </h4>
                    <div className="flex flex-col gap-2">
                      {["TODOS", "MODIFICACION", "NUEVO", "RECETA"].map(
                        (type) => (
                          <button
                            key={type}
                            onClick={() => setFilterType(type)}
                            className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wide border text-left transition-all ${filterType === type ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}
                          >
                            {type === "TODOS"
                              ? "Todos los cambios"
                              : configTipo[type]?.label}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-3 flex flex-col h-full">
                {loading && (
                  <div className="text-center text-slate-400 py-10 font-bold uppercase">
                    Cargando...
                  </div>
                )}
                {!loading && currentData.length === 0 && (
                  <div className="text-center text-slate-400 py-20 bg-white rounded-[2rem] shadow-sm">
                    No hay notas encontradas.
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  {currentData.map((note, idx) => (
                    <CompactNoteRow
                      key={idx}
                      note={note}
                      onClick={() => navigate(`/changelog/${note.slug}`)}
                    />
                  ))}
                </div>

                {!loading && totalPages > 1 && (
                  <div className="mt-8 flex justify-center items-center gap-4 py-3 bg-white border border-slate-100 rounded-full shadow-sm w-fit mx-auto px-6 mb-8">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-2 text-slate-400 hover:text-blue-600 disabled:opacity-30"
                    >
                      <FaChevronLeft />
                    </button>
                    <span className="text-xs text-slate-500 font-medium">
                      <span className="text-slate-800 font-bold">{page}</span>{" "}
                      de {totalPages}
                    </span>
                    <button
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page === totalPages}
                      className="p-2 text-slate-400 hover:text-blue-600 disabled:opacity-30"
                    >
                      <FaChevronRight />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-100 w-full max-w-5xl rounded-[2rem] shadow-2xl flex flex-col max-h-[95vh] overflow-hidden"
            >
              <div className="p-5 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <FaTag className="text-blue-600" />
                  {editingNote
                    ? "Editando Nota de Cambio"
                    : "Armar Release Note"}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-slate-400 hover:text-rose-500 bg-slate-50 p-2 rounded-full"
                >
                  <FaTimes size={14} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col md:flex-row">
                <div className="flex-1 p-6 space-y-6">
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 border-b border-slate-100 pb-2">
                      1. Cabecera del Documento
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">
                          Título de la Versión
                        </label>
                        <input
                          type="text"
                          className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:border-blue-500 outline-none"
                          placeholder="Ej: Update de moldes..."
                          value={formGeneral.titulo}
                          onChange={(e) =>
                            setFormGeneral({
                              ...formGeneral,
                              titulo: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">
                          Autoriza
                        </label>
                        <input
                          type="text"
                          className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:border-blue-500 outline-none"
                          value={formGeneral.responsable}
                          onChange={(e) =>
                            setFormGeneral({
                              ...formGeneral,
                              responsable: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">
                          Fecha Efectiva
                        </label>
                        <input
                          type="date"
                          disabled={editingNote}
                          className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:border-blue-500 outline-none disabled:opacity-50"
                          value={formGeneral.fecha_manual}
                          onChange={(e) =>
                            setFormGeneral({
                              ...formGeneral,
                              fecha_manual: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100 shadow-inner relative">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-4 border-b border-blue-100 pb-2 flex items-center gap-2">
                      <FaBox /> 2. Añadir Producto
                    </h4>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">
                            Producto Afectado
                          </label>
                          <input
                            list="lista-productos"
                            className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-blue-900 focus:border-blue-500 outline-none"
                            placeholder="Buscar producto..."
                            value={formItem.producto}
                            onChange={(e) =>
                              setFormItem({
                                ...formItem,
                                producto: e.target.value,
                              })
                            }
                          />
                          <datalist id="lista-productos">
                            {allProducts.map((p) => (
                              <option key={p.id} value={p.nombre}>
                                {p.codigo}
                              </option>
                            ))}
                          </datalist>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">
                            Acción
                          </label>
                          <select
                            className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm focus:border-blue-500 outline-none cursor-pointer"
                            value={formItem.tipo_cambio}
                            onChange={(e) =>
                              setFormItem({
                                ...formItem,
                                tipo_cambio: e.target.value,
                              })
                            }
                          >
                            <option value="MODIFICACION">Modificación</option>
                            <option value="NUEVO">Lanzamiento Nuevo</option>
                            <option value="AJUSTE_RECETA">
                              Ajuste de Receta
                            </option>
                            <option value="OBSOLETO">Baja / Obsoleto</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">
                          Descripción Específica
                        </label>
                        <textarea
                          className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm h-20 resize-none focus:border-blue-500 outline-none"
                          placeholder="Medidas nuevas, detalles de receta, etc..."
                          value={formItem.descripcion}
                          onChange={(e) =>
                            setFormItem({
                              ...formItem,
                              descripcion: e.target.value,
                            })
                          }
                        ></textarea>
                      </div>

                      {/* SIEMPRE PEDIMOS URL DE FOTO 1 Y 2 */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                            <FaImage /> Foto 1 o PDF (URL)
                          </label>
                          <input
                            type="text"
                            className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm focus:border-blue-500 outline-none"
                            placeholder="https://..."
                            value={formItem.foto1}
                            onChange={(e) =>
                              setFormItem({
                                ...formItem,
                                foto1: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">
                            Foto 2 (Opcional)
                          </label>
                          <input
                            type="text"
                            className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm focus:border-blue-500 outline-none"
                            placeholder="https://..."
                            value={formItem.foto2}
                            onChange={(e) =>
                              setFormItem({
                                ...formItem,
                                foto2: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-200">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="chkRef"
                            className="w-4 h-4 cursor-pointer"
                            checked={formItem.lleva_reflectiva}
                            onChange={(e) =>
                              setFormItem({
                                ...formItem,
                                lleva_reflectiva: e.target.checked,
                              })
                            }
                          />
                          <label
                            htmlFor="chkRef"
                            className="text-xs font-bold text-slate-700 cursor-pointer"
                          >
                            Afecta Reflectiva / Protector
                          </label>
                        </div>
                        {formItem.lleva_reflectiva && (
                          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100">
                            <select
                              className="bg-slate-50 border border-slate-200 rounded p-1.5 text-xs"
                              value={formItem.tipo_reflectiva}
                              onChange={(e) =>
                                setFormItem({
                                  ...formItem,
                                  tipo_reflectiva: e.target.value,
                                })
                              }
                            >
                              <option value="Reflectiva China">
                                Reflectiva China
                              </option>
                              <option value="Reflectiva Avery">
                                Reflectiva Avery
                              </option>
                              <option value="Reflectiva Prograf">
                                Reflectiva Prograf
                              </option>
                              <option value="Reflectiva China 3M">
                                Reflectiva China 3M
                              </option>
                            </select>
                            <select
                              className="bg-slate-50 border border-slate-200 rounded p-1.5 text-xs"
                              value={formItem.tipo_protector}
                              onChange={(e) => {
                                const val = e.target.value;
                                const newApp =
                                  val === "Sin Protector"
                                    ? "No Aplica"
                                    : formItem.tipo_aplicacion === "No Aplica"
                                      ? "Completa"
                                      : formItem.tipo_aplicacion;
                                setFormItem({
                                  ...formItem,
                                  tipo_protector: val,
                                  tipo_aplicacion: newApp,
                                });
                              }}
                            >
                              <option value="Protector Chino">
                                Prot. Chino
                              </option>
                              <option value="Protector Orajet">
                                Prot. Orajet
                              </option>
                              <option value="Sin Protector">
                                Sin Protector
                              </option>
                            </select>
                            <select
                              className={`bg-slate-50 border border-slate-200 rounded p-1.5 text-xs ${formItem.tipo_protector === "Sin Protector" ? "opacity-50 cursor-not-allowed text-slate-400" : ""}`}
                              value={formItem.tipo_aplicacion}
                              onChange={(e) =>
                                setFormItem({
                                  ...formItem,
                                  tipo_aplicacion: e.target.value,
                                })
                              }
                              disabled={
                                formItem.tipo_protector === "Sin Protector"
                              }
                            >
                              <option value="Completa">Completa</option>
                              <option value="Solo en la unión">
                                Solo unión
                              </option>
                              <option value="No Aplica">No Aplica</option>
                            </select>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleAddItemToNote}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                      >
                        <FaPlus /> Añadir Item al Carrito
                      </button>
                    </div>
                  </div>
                </div>

                <div className="md:w-80 bg-slate-50 border-l border-slate-200 p-6 flex flex-col">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4 border-b border-slate-200 pb-2">
                    3. Items en la Nota
                  </h4>
                  <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                    {noteItems.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-10 font-medium border-2 border-dashed border-slate-200 rounded-xl">
                        Vacío
                      </p>
                    ) : (
                      noteItems.map((item, i) => {
                        const st =
                          configTipo[item.tipo_cambio] ||
                          configTipo.MODIFICACION;
                        return (
                          <div
                            key={i}
                            className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm relative group"
                          >
                            <span
                              className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded mb-1 inline-block ${st.badgeBg} ${st.badgeText}`}
                            >
                              {st.label}
                            </span>
                            <p className="text-xs font-bold text-slate-700 leading-tight mb-1">
                              {item.producto}
                            </p>
                            <p className="text-[10px] text-slate-500 line-clamp-2">
                              {item.descripcion}
                            </p>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleRemoveItemFromNote(i);
                              }}
                              className="absolute top-2 right-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity bg-white"
                            >
                              <FaTrash size={12} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="pt-4 border-t border-slate-200 mt-4 shrink-0">
                    <button
                      type="button"
                      onClick={handleSaveFullNote}
                      disabled={noteItems.length === 0}
                      className={`w-full py-3.5 rounded-xl font-bold flex justify-center items-center gap-2 transition-all ${noteItems.length === 0 ? "bg-slate-200 text-slate-400 cursor-not-allowed" : editingNote ? "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200" : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-200"} shadow-lg`}
                    >
                      <FaPaperPlane />{" "}
                      {editingNote ? "Actualizar Nota" : "Publicar Nota"} (
                      {noteItems.length})
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
