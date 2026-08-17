const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion, 
  makeCacheableSignalKeyStore,
  getAggregateVotesInPollMessage,
  decryptPollVote
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const path = require('path');
const fs = require('fs-extra');
const config = require('./config');
const db = require('./src/database/manager');
const { handleMessage } = require('./src/handlers/messageHandler');
const { handleParticipantUpdate } = require('./src/handlers/welcomeHandler');

const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');

// Si se inicia con flag --clean, limpia la sesión anterior para evitar bucles de reconexión corruptos
if (process.argv.includes('--clean')) {
  console.log('🧹 Limpiando datos de sesión anteriores...');
  fs.removeSync(AUTH_DIR);
}

// Restauración Automática de Sesión Permanente desde Render Environment Variable (SESSION_DATA)
const SESSION_DATA = process.env.SESSION_DATA;
if (SESSION_DATA) {
  try {
    fs.ensureDirSync(AUTH_DIR);
    const credsPath = path.join(AUTH_DIR, 'creds.json');
    const decodedCreds = Buffer.from(SESSION_DATA.trim(), 'base64').toString('utf-8');
    fs.writeFileSync(credsPath, decodedCreds);
    console.log('🔑 ¡Sesión permanente de WhatsApp restaurada automáticamente desde Render SESSION_DATA!');
  } catch (err) {
    console.error('Error restaurando SESSION_DATA:', err.message);
  }
}

let isConnecting = false;

async function startBot() {
  if (isConnecting) return;
  isConnecting = true;

  console.log('----------------------------------------------------');
  console.log(`🚀 Iniciando ${config.botName}...`);
  console.log('----------------------------------------------------');

  // Inicializar la conexión a MongoDB (Persistencia en la nube)
  if (process.env.MONGODB_URI) {
    await db.connectDB(process.env.MONGODB_URI);
  }

  const logger = pino({ level: 'silent' });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`📦 Usando versión de WhatsApp v${version.join('.')}` + (isLatest ? ' (Actualizada)' : ''));

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    syncFullHistory: false,
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    getMessage: async () => undefined
  });

  sock.ev.on('creds.update', async () => {
    await saveCreds();
    try {
      const credsPath = path.join(AUTH_DIR, 'creds.json');
      if (fs.existsSync(credsPath)) {
        const credsContent = fs.readFileSync(credsPath, 'utf-8');
        const base64Creds = Buffer.from(credsContent).toString('base64');
        console.log('\n====================================================');
        console.log('📌 TU CLAVE SESSION_DATA PERMANENTE PARA RENDER:');
        console.log(base64Creds);
        console.log('====================================================\n');
      }
    } catch (e) {}
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📲 ESCANEA EL CÓDIGO QR EN TU WHATSAPP (SÓLO UNA VEZ):\n');
      console.log('1. Abre WhatsApp en tu teléfono.');
      console.log('2. Ve a Configuración / Menú -> Dispositivos vinculados.');
      console.log('3. Presiona Vincular un dispositivo y escanea esta pantalla:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      isConnecting = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || 'Desconocido';

      console.log(`⚠️ Conexión temporalmente interrumpida (Código ${statusCode}). Motivo: ${reason}`);

      // Si fue desvinculado voluntariamente o credenciales 401
      if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
        console.log('❌ Sesión cerrada por WhatsApp. Limpiando credenciales para un nuevo escaneo...');
        fs.removeSync(AUTH_DIR);
        console.log('🔄 Reiniciando en 3 segundos para mostrar nuevo QR...');
        setTimeout(() => startBot(), 3000);
      } else {
        console.log('🔄 Reconectando en 2 segundos...');
        setTimeout(() => startBot(), 2000);
      }
    } else if (connection === 'open') {
      isConnecting = false;
      console.log('\n====================================================');
      console.log('✅ ¡BOT CONECTADO Y VINCULADO CON ÉXITO A WHATSAPP!');
      console.log(`🤖 Nombre: ${config.botName}`);
      console.log(`📌 Prefijo: ${config.prefix}`);
      console.log('💬 El bot está escuchando mensajes y listo para tus grupos de clan.');
      
      try {
        const credsPath = path.join(AUTH_DIR, 'creds.json');
        if (fs.existsSync(credsPath)) {
          const credsContent = fs.readFileSync(credsPath, 'utf-8');
          const base64Creds = Buffer.from(credsContent).toString('base64');
          console.log('\n📌 COPIA ESTA CLAVE PERMANENTE PARA RENDER (SESSION_DATA):');
          console.log(base64Creds);
        }
      } catch (e) {}

      console.log('====================================================\n');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    if (m.type === 'notify' || m.type === 'append') {
      for (const msg of m.messages) {
        setImmediate(() => {
          handleMessage(sock, msg).catch(err => console.error('Error procesando mensaje:', err));
        });
      }
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    // LOG DIAGNÓSTICO: Ver TODOS los eventos messages.update que llegan
    console.log('[Poll Debug] messages.update disparado. Total updates:', updates.length);
    for (const update of updates) {
      console.log('[Poll Debug] update.key:', JSON.stringify(update.key));
      console.log('[Poll Debug] update.pollUpdates:', JSON.stringify(update.pollUpdates));
      console.log('[Poll Debug] update.update?.pollUpdates:', JSON.stringify(update.update?.pollUpdates));
      console.log('[Poll Debug] Claves de update:', Object.keys(update));

      // Buscar pollUpdates en cualquier nivel posible
      const pollUpdates = update.pollUpdates || update.update?.pollUpdates;
      if (!pollUpdates) {
        console.log('[Poll Debug] No hay pollUpdates en este update — omitiendo.');
        continue;
      }

      const pollMsgId = update.key?.id;
      const jid = update.key?.remoteJid;
      if (!pollMsgId || !jid) continue;

      console.log('[Poll Debug] pollUpdates detectados para jid:', jid, 'pollMsgId:', pollMsgId);

      const activePoll = db.getActivePoll(jid);
      if (!activePoll) {
        console.log('[Poll Debug] No hay encuesta activa para este jid.');
        continue;
      }
      if (activePoll.id !== pollMsgId) {
        console.log('[Poll Debug] IDs no coinciden. activePoll.id:', activePoll.id, '!== pollMsgId:', pollMsgId);
        continue;
      }

      const originalMessage = activePoll.pollMessage;
      if (!originalMessage) {
        console.log('[Poll Debug] No se encontró pollMessage en la base de datos.');
        continue;
      }

      console.log('[Poll Debug] pollMessage existe, tipo:', typeof originalMessage, 'claves:', Object.keys(originalMessage || {}));

      db.addPollUpdates(activePoll.sourceGroupId || jid, Array.isArray(pollUpdates) ? pollUpdates : [pollUpdates]);

      try {
        const freshPoll = db.getActivePoll(jid);
        const votesSummary = getAggregateVotesInPollMessage({
          message: freshPoll.pollMessage,
          pollUpdates: freshPoll.pollUpdates
        }, sock.user?.id || '');

        console.log('[Poll Debug] votesSummary resultado:', JSON.stringify(votesSummary));
        db.updatePollVotesSummary(activePoll.sourceGroupId || jid, votesSummary);
      } catch (err) {
        console.error('[Poll Debug] Error en getAggregateVotesInPollMessage:', err.message, err.stack);
      }
    }
  });

  sock.ev.on('group-participants.update', async (update) => {
    try {
      await handleParticipantUpdate(sock, update);
    } catch (err) {
      console.error('Error en evento de nuevos integrantes:', err);
    }
  });
}

// Servidor HTTP básico para Health Check en Koyeb / Render / Cloud (se inicia 1 sola vez)
const http = require('http');
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('⚔️ CLAN BOT DISCORD-STYLE IS ACTIVE 24/7 ⚔️');
}).listen(PORT, () => {
  console.log(`🌐 Servidor de salud Web activo en el puerto ${PORT}`);
});

// Captura de excepciones globales
process.on('uncaughtException', (err) => {
  console.error('⚠️ Excepción del sistema capturada:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Rechazo de promesa no capturado:', reason);
});

startBot().catch(err => console.error('Error fatal al iniciar:', err));
