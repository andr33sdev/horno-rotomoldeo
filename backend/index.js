require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");

// --- 1. CONFIGURACIÓN DE FIREBASE ---
const admin = require("firebase-admin");

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require("./firebase-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

console.log("🔥 Firebase Admin inicializado correctamente");

// --- SERVICIOS Y UTILIDADES ---
const { setupAuth } = require("./google-drive");
const { inicializarTablas } = require("./services/dbInit");
const {
  sincronizarBaseDeDatos,
  sincronizarPedidos,
} = require("./services/syncService");
const {
  iniciarBotReceptor,
  getBot,
  checkAlertasMantenimiento,
} = require("./services/telegramBotListener");
const { vigilarCompetencia } = require("./services/competenciaService");
const { protect } = require("./middleware/auth");

// --- IMPORTAR RUTAS ---
const authRoutes = require("./routes/auth");
const generalRoutes = require("./routes/general");
const comprasRoutes = require("./routes/compras");
const produccionRoutes = require("./routes/produccion");
const ingenieriaRoutes = require("./routes/ingenieria");
const planificacionRoutes = require("./routes/planificacion");
const operariosRoutes = require("./routes/operarios");
const logisticaRoutes = require("./routes/logistica");
const analisisRoutes = require("./routes/analisis");
const iaRoutes = require("./routes/ia");
const mantenimientoRoutes = require("./routes/mantenimiento");
const feriadosRoutes = require("./routes/feriados");
const rrhhRoutes = require("./routes/rrhh");
const changelogRoutes = require("./routes/changelog");
const sugerenciasRoutes = require("./routes/sugerencias");
const depositoRoutes = require("./routes/deposito");
const tableroRoutes = require("./routes/tablero");
const solicitudesMlRoutes = require("./routes/solicitudesMl");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ==========================================
// FUNCIÓN GLOBAL DE NOTIFICACIONES
// ==========================================
const enviarNotificacionApp = async (fcmToken, titulo, mensaje) => {
  if (!fcmToken) return;
  const message = {
    notification: { title: titulo, body: mensaje },
    token: fcmToken,
    android: { priority: "high" },
  };
  try {
    await admin.messaging().send(message);
    console.log("🔔 Push enviada con éxito");
  } catch (error) {
    console.error("❌ Error enviando Push:", error);
  }
};

// ==========================================
// RUTAS PÚBLICAS (SIN CANDADO)
// ==========================================
app.use("/api/auth", authRoutes);

app.get("/api/test-push/:token", async (req, res) => {
  const miToken = req.params.token;
  await enviarNotificacionApp(
    miToken,
    "¡Conexión Exitosa! 🏭",
    "Tu servidor Node.js ya tiene línea directa con tu Xiaomi.",
  );
  res.send(`🚀 Notificación enviada al token: ${miToken.substring(0, 10)}...`);
});

// ==========================================
// RUTAS PRIVADAS (CON "protect")
// ==========================================
app.use("/api", protect, generalRoutes);
app.use("/api/compras", protect, comprasRoutes);
app.use("/api/produccion", protect, produccionRoutes);
app.use("/api/ingenieria", protect, ingenieriaRoutes);
app.use("/api/planificacion", protect, planificacionRoutes);
app.use("/api/operarios", protect, operariosRoutes);
app.use("/api/logistica", protect, logisticaRoutes);
app.use("/api/analisis", protect, analisisRoutes);
app.use("/api/ia", protect, iaRoutes);
app.use("/api/mantenimiento", protect, mantenimientoRoutes);
app.use("/api/feriados", protect, feriadosRoutes);
app.use("/api/rrhh", protect, rrhhRoutes);
app.use("/api/changelog", protect, changelogRoutes);
app.use("/api/sugerencias", protect, sugerenciasRoutes);
app.use("/api/deposito", protect, depositoRoutes);
app.use("/api/tablero", protect, tableroRoutes);
app.use("/api/solicitudes-ml", protect, solicitudesMlRoutes);

// ==========================================
// INICIO DE SERVICIOS
// ==========================================
async function iniciarServidor() {
  try {
    await setupAuth();
    await inicializarTablas();

    iniciarBotReceptor();

    sincronizarBaseDeDatos();
    sincronizarPedidos();

    setInterval(sincronizarBaseDeDatos, 2 * 60 * 1000);
    setInterval(sincronizarPedidos, 15 * 60 * 1000);

    setInterval(
      () => {
        const bot = getBot();
        const adminId = process.env.TELEGRAM_ADMIN_ID;
        if (bot && adminId) vigilarCompetencia(bot, adminId);
      },
      30 * 60 * 1000,
    );

    setInterval(
      () => {
        console.log("🔧 Chequeando alertas mantenimiento...");
        checkAlertasMantenimiento();
      },
      60 * 60 * 1000,
    );

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Servidor Express escuchando en http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Error fatal:", error);
  }
}

iniciarServidor();
