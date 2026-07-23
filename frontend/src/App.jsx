import { useState, useEffect, lazy, Suspense } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  FaChartPie,
  FaSignOutAlt,
  FaClipboardList,
  FaPlus,
  FaUsers,
  FaTruck,
  FaUserTie,
  FaHardHat,
  FaBars,
  FaTimes,
  FaWarehouse,
  FaCalendarAlt,
  FaTools,
  FaChevronRight,
  FaChevronLeft,
  FaClipboardCheck,
  FaChartBar,
  FaUserShield,
  FaUserLock,
  FaShoppingCart,
  FaFire,
  FaHistory,
  FaIndustry,
  FaBell,
} from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import { Toaster } from "react-hot-toast";

// --- IMPORTACIÓN DE PLUGINS NATIVOS Y UTILS ---
import { PushNotifications } from "@capacitor/push-notifications";

// Importación estática inmediata solo para componentes críticos de barrera
import Loader from "./components/Loader.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import { getAuthData, logout } from "./auth/authHelper";
import { API_BASE_URL, authFetch } from "./utils";

// DIVISIÓN DE CÓDIGO INTELIGENTE (Lazy Loading)
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const PanelControl = lazy(() => import("./pages/PanelControl.jsx"));
const IngenieriaProductos = lazy(
  () => import("./pages/IngenieriaProductos.jsx"),
);
const AnalisisPedidos = lazy(() => import("./pages/AnalisisPedidos.jsx"));
const PlanificacionPage = lazy(() => import("./pages/PlanificacionPage.jsx"));
const RegistrarProduccionPage = lazy(
  () => import("./pages/RegistrarProduccionPage.jsx"),
);
const OperariosPage = lazy(() => import("./pages/OperariosPage.jsx"));
const LogisticaPage = lazy(() => import("./pages/LogisticaPage.jsx"));
const SolicitudesPage = lazy(() => import("./pages/SolicitudesPage"));
const HojaDeRutaPage = lazy(() => import("./pages/HojaDeRutaPage.jsx"));
const CentroComando = lazy(() => import("./pages/CentroComando"));
const MantenimientoPage = lazy(() => import("./pages/MantenimientoPage"));
const RRHHPage = lazy(() => import("./pages/RRHHPage"));
const ChangelogPage = lazy(() => import("./pages/ChangelogPage"));
const DetalleProducto = lazy(() => import("./pages/DetalleProducto"));
const SugerenciasPage = lazy(() => import("./pages/SugerenciasPage.jsx"));
const GestorUsuarios = lazy(() => import("./pages/GestorUsuarios.jsx"));
const Home = lazy(() => import("./pages/Home.jsx"));
const TableroPage = lazy(() => import("./pages/TableroPage.jsx"));
const SolicitudesMlPage = lazy(() => import("./pages/SolicitudesMlPage.jsx"));
const AnalisisProduccionPage = lazy(
  () => import("./pages/AnalisisProduccionPage.jsx"),
);

const NAV_LINKS = [
  { path: "/", label: "Inicio", icon: <FaChartPie /> }, // 👈 Al no tener moduloReq, se vuelve visible para TODO el personal automáticamente
  {
    path: "/tablero",
    label: "Proyectos y Tareas",
    icon: <FaClipboardList />,
    moduloReq: "PROYECTOS",
  },
  {
    path: "/solicitudes-ml",
    label: "Stock MercadoLibre",
    icon: <FaShoppingCart />,
    moduloReq: "STOCK_ML",
  },
  {
    path: "/hornos",
    label: "Horno N°2",
    icon: <FaFire />,
    moduloReq: "HORNOS", // 👈 Separado por completo con su propia llave
  },
  {
    path: "/calendario",
    label: "Centro de Datos",
    icon: <FaIndustry />,
    moduloReq: "PLANIFICACION",
  },
  {
    path: "/planificacion",
    label: "Planificación",
    icon: <FaClipboardList />,
    moduloReq: "PLANIFICACION",
  },
  {
    path: "/analisis-pedidos",
    label: "Métricas",
    icon: <FaChartBar />,
    moduloReq: "METRICAS",
  },
  {
    path: "/registrar-produccion",
    label: "Registrar",
    icon: <FaPlus />,
    moduloReq: "REGISTRO",
  },
  {
    path: "/analisis-produccion",
    label: "Análisis Producción",
    icon: <FaIndustry />,
    moduloReq: "METRICAS",
  },
  {
    path: "/logistica",
    label: "Logística",
    icon: <FaTruck />,
    moduloReq: "LOGISTICA",
  },
  {
    path: "/sugerencias",
    label: "Buzón Compras",
    icon: <FaClipboardCheck />,
    moduloReq: "COMPRAS",
  },
  {
    path: "/operarios",
    label: "Equipo",
    icon: <FaUsers />,
    moduloReq: "EQUIPO",
  },
  {
    path: "/hoja-de-ruta",
    label: "Hoja de Ruta",
    icon: <FaCalendarAlt />,
    moduloReq: "HOJA_RUTA",
  },
  {
    path: "/ingenieria",
    label: "Ingeniería",
    icon: <FaTools />,
    moduloReq: "INGENIERIA",
  },
  { path: "/rrhh", label: "RRHH", icon: <FaUserTie />, moduloReq: "RRHH" },
  {
    path: "/mantenimiento",
    label: "Mantenimiento",
    icon: <FaHardHat />,
    moduloReq: "MANTENIMIENTO",
  },
  {
    path: "/compras",
    label: "Compras",
    icon: <FaShoppingCart />,
    moduloReq: "COMPRAS",
  },
  {
    path: "/changelog",
    label: "Cambios Prod.",
    icon: <FaHistory />,
    moduloReq: "INGENIERIA",
  },
  {
    path: "/usuarios",
    label: "Accesos",
    icon: <FaUserShield />,
    moduloReq: "ACCESOS_ADMIN",
  },
];

const ProtectedRoute = ({ children, requiredModule }) => {
  const { token, user } = getAuthData();
  const location = useLocation();

  if (!token || !user) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  if (
    user.rol === "GERENCIA" ||
    user.rol === "JEFE PRODUCCIÓN" ||
    user.rol === "JEFE PRODUCCION"
  )
    return children;

  if (
    requiredModule &&
    (!user.modulos || !user.modulos.includes(requiredModule))
  ) {
    const primerEnlacePermitido = NAV_LINKS.find(
      (link) => link.moduloReq && user.modulos?.includes(link.moduloReq),
    );
    if (
      primerEnlacePermitido &&
      location.pathname !== primerEnlacePermitido.path
    ) {
      return <Navigate to={primerEnlacePermitido.path} replace />;
    }
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#f8fafc] text-slate-500 flex-col gap-4">
        <FaUserLock size={48} className="text-slate-300" />
        <span className="font-bold text-lg text-slate-600">
          Acceso Restringido
        </span>
        <span className="text-sm">
          Tu cuenta no tiene privilegios para este módulo específico.
        </span>
        <button
          onClick={() => {
            logout();
            window.location.href = "/login";
          }}
          className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-xl font-bold shadow-md"
        >
          Cerrar Sesión
        </button>
      </div>
    );
  }
  return children;
};

const GerenciaProtectedRoute = ({ children }) => {
  const { token, user } = getAuthData();
  const location = useLocation();

  if (!token || !user) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  const rolNormalizado = (user.rol || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // 🌟 Ahora permitimos tanto a GERENCIA como a JEFE PRODUCCION
  if (rolNormalizado !== "GERENCIA" && rolNormalizado !== "JEFE PRODUCCION") {
    console.warn(
      "⛔ Acceso denegado a " + location.pathname + ". Rol actual:",
      user.rol,
    );
    return <Navigate to="/" replace />;
  }

  return children;
};

// --- COMPONENTE: CAMPANITA PREMIUM INTERACTIVA ---
const CampanitaNotificaciones = ({ currentUser }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const fetchNotificaciones = async () => {
    if (!currentUser) return;
    try {
      const resCount = await authFetch(
        `${API_BASE_URL}/tablero/notificaciones/unread/count?usuario=${currentUser}`,
      );
      if (resCount.ok) {
        const data = await resCount.json();
        setUnreadCount(data.count);
      }
      if (isOpen) {
        const resList = await authFetch(
          `${API_BASE_URL}/tablero/notificaciones?usuario=${currentUser}`,
        );
        if (resList.ok) setNotifications(await resList.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchNotificaciones();
    const interval = setInterval(fetchNotificaciones, 10000);
    return () => clearInterval(interval);
  }, [currentUser, isOpen]);

  const handleOpenDropdown = async () => {
    setIsOpen(!isOpen);
    if (!isOpen && currentUser) {
      const resList = await authFetch(
        `${API_BASE_URL}/tablero/notificaciones?usuario=${currentUser}`,
      );
      if (resList.ok) setNotifications(await resList.json());

      await authFetch(`${API_BASE_URL}/tablero/notificaciones/read-all`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: currentUser }),
      });
      setUnreadCount(0);
    }
  };

  const handleClearAllNotifs = async (e) => {
    e.stopPropagation();
    try {
      const res = await authFetch(
        `${API_BASE_URL}/tablero/notificaciones/clear-all`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usuario: currentUser }),
        },
      );
      if (res.ok) {
        toast.success("Buzón de alertas limpiado");
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleNotificationClick = (n) => {
    setIsOpen(false);
    if (n.url) {
      navigate(n.url);
    }
  };

  const tieneAlertasUi =
    Array.isArray(notifications) &&
    notifications.some((n) => n && n.id && !n.id.toString().startsWith("ml-"));

  return (
    <div className="relative">
      <button
        onClick={handleOpenDropdown}
        className="relative w-11 h-11 bg-white hover:bg-stone-50 text-slate-700 rounded-xl transition-all active:scale-95 shadow-sm border border-stone-200/80 flex items-center justify-center cursor-pointer group"
      >
        <FaBell
          size={16}
          className={`transition-transform group-hover:rotate-12 ${unreadCount > 0 ? "text-amber-500 animate-pulse" : "text-slate-500"}`}
        />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 bg-rose-500 text-white rounded-lg text-[10px] font-semibold flex items-center justify-center shadow-[0_4px_12px_rgba(244,63,94,0.4)] border-2 border-white animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              className="absolute right-0 mt-3 w-80 bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] border border-stone-200/60 p-4 z-50 max-h-[400px] overflow-y-auto custom-scrollbar origin-top-right"
            >
              <div className="flex items-center justify-between mb-3 border-b border-stone-100 pb-2">
                <h4 className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">
                  Buzón de Notificaciones
                </h4>
                {tieneAlertasUi && (
                  <button
                    onClick={handleClearAllNotifs}
                    className="text-[10px] font-semibold text-rose-500 hover:text-rose-700 transition-colors uppercase tracking-wider cursor-pointer bg-transparent border-none outline-none"
                  >
                    Limpiar Todo
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <p className="text-xs font-semibold text-stone-400 text-center py-8">
                  No hay novedades por aquí.
                </p>
              ) : (
                <div className="space-y-2">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`p-3.5 rounded-xl border text-[11px] font-semibold leading-relaxed transition-all ${n.url ? "hover:bg-stone-50/80 hover:border-stone-300 cursor-pointer" : ""} ${n.leido ? "bg-stone-50/40 border-stone-100 text-slate-400" : "bg-blue-50/50 border-blue-100/70 text-slate-700 shadow-sm"}`}
                    >
                      {n.mensaje}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const Sidebar = ({
  links,
  isCollapsed,
  setIsCollapsed,
  handleLogout,
  userBadge,
  role,
}) => {
  const location = useLocation();
  return (
    <aside
      className={`hidden lg:flex flex-col bg-white border-r border-gray-100 transition-all duration-300 z-50 ${isCollapsed ? "w-20" : "w-64"}`}
    >
      <div className="h-16 flex items-center px-6 border-b border-gray-100">
        <div className="flex items-center gap-2 text-blue-600">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-sm">
            <FaWarehouse />
          </div>
          {!isCollapsed && (
            <span className="font-bold text-xl tracking-tight text-blue-600">
              Gestion<span className="text-gray-800">MRP</span>
            </span>
          )}
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1 custom-scrollbar">
        {links.map((link) => {
          const isActive = location.pathname === link.path;
          return (
            <Link
              key={link.path}
              to={link.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${isActive ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"} ${isCollapsed ? "justify-center" : ""}`}
              title={isCollapsed ? link.label : ""}
            >
              <span
                className={`text-lg ${isActive ? "text-blue-600" : "text-gray-400 group-hover:text-gray-600"}`}
              >
                {link.icon}
              </span>
              {!isCollapsed && <span className="text-sm">{link.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-100">
        <div
          className={`flex items-center gap-3 ${isCollapsed ? "justify-center" : ""}`}
        >
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold shadow-inner border border-blue-200 uppercase">
            {userBadge.text.charAt(0)}
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate tracking-tight">
                {userBadge.text}
              </p>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  {role || "OPERARIO"}
                </span>
                <button
                  onClick={handleLogout}
                  className="text-[10px] font-bold text-rose-500 hover:text-rose-700 transition-colors flex items-center gap-1"
                >
                  Salir
                </button>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="mt-4 w-full flex items-center justify-center text-slate-300 hover:text-slate-500 p-2 rounded-lg hover:bg-slate-50 transition-colors"
        >
          {isCollapsed ? (
            <FaChevronRight size={12} />
          ) : (
            <FaChevronLeft size={12} />
          )}
        </button>
      </div>
    </aside>
  );
};

const Layout = ({ children }) => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user } = getAuthData();
  const role = user?.rol;
  const nombreUsuario = user?.nombre || "Usuario";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  let currentUser = nombreUsuario;
  const r = (role || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    r.includes("GERENCIA") ||
    r.includes("JEFE PRODUCTION") ||
    r.includes("JEFE PRODUCCIÓN")
  ) {
    currentUser = "Andrés";
  } else if (
    r.includes("OPERARIO") ||
    r.includes("PANEL") ||
    r.includes("PLANTAS")
  ) {
    currentUser = "Leonel";
  } else if (r.includes("DEPOSITO") || r.includes("EXPEDICION")) {
    currentUser = "Mauro";
  }

  let userBadge = { icon: <FaHardHat />, text: nombreUsuario };
  if (
    role === "GERENCIA" ||
    role === "JEFE PRODUCCIÓN" ||
    role === "JEFE PRODUCCION"
  )
    userBadge = { icon: <FaUserTie />, text: nombreUsuario };
  if (role === "DEPOSITO" || role === "ENC. EXPEDICIÓN")
    userBadge = { icon: <FaWarehouse />, text: nombreUsuario };
  if (role === "ENC. MANTENIMIENTO")
    userBadge = { icon: <FaTools />, text: nombreUsuario };

  const allowedLinks = NAV_LINKS.filter((link) => {
    if (
      user?.rol === "GERENCIA" ||
      user?.rol === "JEFE PRODUCCIÓN" ||
      user?.rol === "JEFE PRODUCCION"
    )
      return true;
    return !link.moduloReq || user?.modulos?.includes(link.moduloReq);
  });

  return (
    <div className="flex h-screen bg-[#fcfbf9] text-gray-900 font-sans overflow-hidden">
      <Sidebar
        links={allowedLinks}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        handleLogout={handleLogout}
        userBadge={userBadge}
        role={role}
      />

      {/* HEADER EXCLUSIVO MÓVIL */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-stone-100 flex items-center justify-between px-6 z-[40]">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2.5 bg-stone-50 text-slate-600 rounded-xl active:scale-95 transition-all border border-stone-100"
        >
          <FaBars size={20} />
        </button>
        <div className="flex items-center gap-2">
          <span className="font-bold text-xl tracking-tight text-blue-600">
            Gestion<span className="text-gray-800">MRP</span>
          </span>
        </div>
        <CampanitaNotificaciones currentUser={currentUser} />
      </div>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-white z-[101] shadow-2xl lg:hidden flex flex-col"
            >
              <div className="h-20 flex items-center justify-between px-6 border-b border-stone-50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                    <FaWarehouse size={14} />
                  </div>
                  <span className="font-bold text-xl text-slate-800">Menú</span>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="text-slate-300 p-2"
                >
                  <FaTimes size={20} />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-4 space-y-1">
                {allowedLinks.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all ${useLocation().pathname === link.path ? "bg-blue-50 text-blue-700 font-bold" : "text-slate-500 hover:bg-stone-50"}`}
                  >
                    <span
                      className={
                        useLocation().pathname === link.path
                          ? "text-blue-600"
                          : "text-stone-300"
                      }
                    >
                      {link.icon}
                    </span>
                    <span className="text-sm">{link.label}</span>
                  </Link>
                ))}
              </nav>

              <div className="p-4 border-t border-stone-100">
                <div className="flex items-center gap-3 px-4 py-3 mb-2 bg-slate-50 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold uppercase">
                    {userBadge.text.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">
                      {userBadge.text}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {role || "OPERARIO"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSidebarOpen(false);
                    handleLogout();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-rose-600 hover:bg-rose-50 font-bold transition-colors border border-rose-100 shadow-sm"
                >
                  <FaSignOutAlt />
                  Cerrar Sesión
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* COMPONENTE CONTENEDOR PRINCIPAL */}
      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        {/* CAMPANITA EN EL EXTREMO SUPERIOR DERECHO FIJO EN DESKTOP */}
        <div className="hidden lg:flex absolute top-6 right-8 z-[45]">
          <CampanitaNotificaciones currentUser={currentUser} />
        </div>

        <main className="flex-1 overflow-y-auto scroll-smooth pt-20 lg:pt-0">
          <div className="w-full h-full">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default function App() {
  useEffect(() => {
    const inicializarNotificaciones = async () => {
      const { user, token: authToken } = getAuthData();
      if (!user || !authToken) return;

      const isNative =
        window.Capacitor && window.Capacitor.getPlatform() !== "web";
      if (isNative) {
        try {
          await PushNotifications.removeAllListeners();
          PushNotifications.addListener("registration", async (token) => {
            if (user && user.id) {
              try {
                await authFetch(UPDATE_FCM_TOKEN_URL, {
                  method: "PUT",
                  body: JSON.stringify({ fcm_token: token.value }),
                });
              } catch (e) {
                console.error(e);
              }
            }
          });
          const permisos = await PushNotifications.requestPermissions();
          if (permisos.receive === "granted") {
            await PushNotifications.register();
          }
        } catch (error) {
          console.error(error);
        }
      }
    };
    inicializarNotificaciones();
  }, []);

  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            fontSize: "12px",
            fontWeight: "bold",
            borderRadius: "16px",
            color: "#334155",
          },
          success: { iconTheme: { primary: "#10B981", secondary: "#fff" } },
        }}
      />

      <Suspense
        fallback={
          <div className="h-screen w-screen flex items-center justify-center bg-[#fcfbf9]">
            <Loader />
          </div>
        }
      >
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* 👇 Removido requiredModule de Inicio ("/") para que sea un espacio base para todos los logueados */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout>
                  <Home />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* 👇 Módulo Horno N°2 enlazado estrictamente a la nueva llave HORNOS */}
          <Route
            path="/hornos"
            element={
              <ProtectedRoute requiredModule="HORNOS">
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/analisis-pedidos"
            element={
              <ProtectedRoute requiredModule="METRICAS">
                <Layout>
                  <AnalisisPedidos />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/analisis-produccion"
            element={
              <GerenciaProtectedRoute>
                <Layout>
                  <AnalisisProduccionPage />
                </Layout>
              </GerenciaProtectedRoute>
            }
          />
          <Route
            path="/panel-control"
            element={
              <ProtectedRoute requiredModule="PLANIFICACION">
                <Layout>
                  <PanelControl />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/registrar-produccion"
            element={
              <ProtectedRoute requiredModule="REGISTRO">
                <Layout>
                  <RegistrarProduccionPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/mantenimiento"
            element={
              <ProtectedRoute requiredModule="MANTENIMIENTO">
                <Layout>
                  <MantenimientoPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/planificacion"
            element={
              <ProtectedRoute requiredModule="PLANIFICACION">
                <Layout>
                  <PlanificacionPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/operarios"
            element={
              <ProtectedRoute requiredModule="EQUIPO">
                <Layout>
                  <OperariosPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/logistica"
            element={
              <ProtectedRoute requiredModule="LOGISTICA">
                <Layout>
                  <LogisticaPage />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* 👇 Tareas enlazadas a PROYECTOS */}
          <Route
            path="/tablero"
            element={
              <ProtectedRoute requiredModule="PROYECTOS">
                <Layout>
                  <TableroPage />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/modulos-eliminados-3d"
            element={<Navigate to="/" replace />}
          />
          <Route
            path="/hoja-de-ruta"
            element={
              <ProtectedRoute requiredModule="HOJA_RUTA">
                <Layout>
                  <HojaDeRutaPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/calendario"
            element={
              <ProtectedRoute requiredModule="PLANIFICACION">
                <Layout>
                  <CentroComando />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ingenieria"
            element={
              <ProtectedRoute requiredModule="INGENIERIA">
                <Layout>
                  <IngenieriaProductos />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/changelog/:slug?"
            element={
              <ProtectedRoute requiredModule="INGENIERIA">
                <Layout>
                  <ChangelogPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/producto/:nombre"
            element={
              <ProtectedRoute requiredModule="REGISTRO">
                <Layout>
                  <DetalleProducto />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/compras"
            element={
              <ProtectedRoute requiredModule="COMPRAS">
                <Layout>
                  <SolicitudesPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/rrhh"
            element={
              <ProtectedRoute requiredModule="RRHH">
                <Layout>
                  <RRHHPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/sugerencias"
            element={
              <ProtectedRoute requiredModule="COMPRAS">
                <Layout>
                  <SugerenciasPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/usuarios"
            element={
              <ProtectedRoute requiredModule="ACCESOS_ADMIN">
                <Layout>
                  <GestorUsuarios />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* 👇 MercadoLibre enlazado a STOCK_ML */}
          <Route
            path="/solicitudes-ml"
            element={
              <ProtectedRoute requiredModule="STOCK_ML">
                <Layout>
                  <SolicitudesMlPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
