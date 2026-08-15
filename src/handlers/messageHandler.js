const config = require('../../config');
const db = require('../database/manager');
const clanCmd = require('../commands/clan');
const modCmd = require('../commands/moderation');
const tagCmd = require('../commands/tag');
const casinoCmd = require('../commands/casino');
const musicCmd = require('../commands/music');
const stickerCmd = require('../commands/sticker');
const generalCmd = require('../commands/general');
const welcomeHandler = require('./welcomeHandler');

/**
 * Extrae solo los dígitos telefónicos del JID eliminando el sufijo de dispositivo de Baileys (:xx)
 */
function getCleanNumber(jidOrId) {
  if (!jidOrId) return '';
  const withoutDevice = jidOrId.split(':')[0];
  const userPart = withoutDevice.split('@')[0];
  return userPart.replace(/[^0-9]/g, '');
}

/**
 * Procesa todos los mensajes entrantes de WhatsApp
 */
async function handleMessage(sock, msg) {
  try {
    if (!msg.message) return;

    const messageType = Object.keys(msg.message)[0];
    // Ignorar mensajes de estado o protocolo sin texto
    if (messageType === 'protocolMessage' || messageType === 'senderKeyDistributionMessage') return;

    const jid = msg.key.remoteJid;
    const isGroup = jid.endsWith('@g.us');
    
    // Para mensajes propios (fromMe), el remitente es la cuenta del bot
    const botRawId = sock.user?.id || '';
    const senderRaw = isGroup 
      ? (msg.key.participant || msg.participant || (msg.key.fromMe ? botRawId : null)) 
      : jid;
    
    const senderNumber = getCleanNumber(senderRaw);
    const botNumber = getCleanNumber(botRawId);
    const sender = senderNumber ? `${senderNumber}@s.whatsapp.net` : '';

    // Obtener texto del mensaje
    let body = '';
    if (messageType === 'conversation') {
      body = msg.message.conversation;
    } else if (messageType === 'extendedTextMessage') {
      body = msg.message.extendedTextMessage.text;
    } else if (messageType === 'imageMessage') {
      body = msg.message.imageMessage.caption || '';
    } else if (messageType === 'videoMessage') {
      body = msg.message.videoMessage.caption || '';
    }

    // Registrar actividad en la base de datos para seguimiento de inactivos
    if (isGroup && sender) {
      db.trackActivity(jid, sender);
    }

    if (!body || !body.startsWith(config.prefix)) return;

    // Extracción de comando y argumentos
    const args = body.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const startTime = Date.now();

    // Obtener información del grupo y permisos si aplica
    let groupMetadata = null;
    let isAdmin = false;
    let isBotAdmin = false;

    if (isGroup) {
      try {
        groupMetadata = await sock.groupMetadata(jid);
        const participants = groupMetadata.participants || [];

        const senderParticipant = participants.find(p => {
          const pNum = getCleanNumber(p.id);
          if (!pNum || !senderNumber) return false;
          if (pNum === senderNumber) return true;
          return pNum.length >= 7 && senderNumber.length >= 7 && pNum.slice(-7) === senderNumber.slice(-7);
        });

        const botParticipant = participants.find(p => {
          const pNum = getCleanNumber(p.id);
          if (!pNum) return false;
          if (botNumber && (pNum === botNumber || (pNum.length >= 7 && botNumber.length >= 7 && pNum.slice(-7) === botNumber.slice(-7)))) {
            return true;
          }
          if (msg.key.fromMe && senderNumber && (pNum === senderNumber || (pNum.length >= 7 && senderNumber.length >= 7 && pNum.slice(-7) === senderNumber.slice(-7)))) {
            return true;
          }
          return false;
        });

        isAdmin = senderParticipant ? (senderParticipant.admin === 'admin' || senderParticipant.admin === 'superadmin') : false;
        isBotAdmin = botParticipant ? (botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin') : false;

        // Si la orden viene de la misma cuenta vinculada (fromMe)
        if (msg.key.fromMe) {
          isAdmin = true;
          if (senderParticipant ? (senderParticipant.admin === 'admin' || senderParticipant.admin === 'superadmin') : false) {
            isBotAdmin = true;
          }
        }

        console.log(`[Comando: #${command}] Grupo: ${jid} | Remitente: ${senderNumber} | Bot: ${botNumber} | EsAdmin: ${isAdmin} | BotEsAdmin: ${isBotAdmin}`);
      } catch (err) {
        console.error('Error obteniendo metadatos del grupo:', err);
      }
    }

    // Extraer usuario mencionado si existe
    let targetUser = null;
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    const mentions = contextInfo?.mentionedJid || [];

    if (mentions.length > 0) {
      targetUser = mentions[0];
    } else if (args[0] && args[0].includes('@')) {
      const cleanNum = args[0].replace(/[^0-9]/g, '');
      if (cleanNum) targetUser = `${cleanNum}@s.whatsapp.net`;
    }

    // Enrutamiento de Comandos
    switch (command) {
      // --- GENERAL ---
      case 'help':
      case 'menu':
      case 'comandos':
        await generalCmd.handleHelp(sock, jid);
        break;

      case 'ping':
        await generalCmd.handlePing(sock, jid, startTime);
        break;

      // --- CLAN & VS ---
      case 'vs':
      case 'scrim':
        await clanCmd.handleVS(sock, jid, args, sender, isGroup, isAdmin);
        break;

      case 'anotar':
      case 'joinvs':
        await clanCmd.handleAnotar(sock, jid, sender, isGroup);
        break;

      case 'salirse':
      case 'leavevs':
        await clanCmd.handleSalirse(sock, jid, sender, isGroup);
        break;

      case 'lineup':
      case 'escuadra':
        await clanCmd.handleLineup(sock, jid, isGroup);
        break;

      case 'reglas':
      case 'rules':
        await clanCmd.handleReglas(sock, jid, isGroup);
        break;

      case 'setrules':
        await clanCmd.handleSetRules(sock, jid, body, isGroup, isAdmin);
        break;

      case 'perfil':
      case 'profile':
        await clanCmd.handlePerfil(sock, jid, targetUser || sender, isGroup);
        break;

      case 'topactivos':
      case 'activos':
        await clanCmd.handleTopActive(sock, jid, isGroup, groupMetadata);
        break;

      case 'topinactivos':
      case 'inactivos':
        await clanCmd.handleTopInactive(sock, jid, isGroup, groupMetadata);
        break;

      case 'ghosts':
      case 'fantasmas':
        await clanCmd.handleInactivosList(sock, jid, isGroup, groupMetadata, isAdmin);
        break;

      // --- MODERACIÓN DISCORD ---
      case 'close':
      case 'cerrar':
        await modCmd.handleCloseGroup(sock, jid, isGroup, isAdmin, isBotAdmin);
        break;

      case 'open':
      case 'abrir':
        await modCmd.handleOpenGroup(sock, jid, isGroup, isAdmin, isBotAdmin);
        break;

      case 'warn':
      case 'advertir':
        const reason = args.slice(1).join(' ') || 'Sin motivo especificado';
        await modCmd.handleWarn(sock, jid, targetUser, reason, isGroup, isAdmin, isBotAdmin);
        break;

      case 'delwarn':
      case 'unwarn':
        await modCmd.handleDelWarn(sock, jid, targetUser, isGroup, isAdmin);
        break;

      case 'warns':
        await modCmd.handleWarns(sock, jid, targetUser || sender, isGroup);
        break;

      case 'kick':
      case 'expulsar':
        await modCmd.handleKick(sock, jid, targetUser, isGroup, isAdmin, isBotAdmin);
        break;

      case 'promover':
      case 'promote':
        await modCmd.handlePromote(sock, jid, targetUser, isGroup, isAdmin, isBotAdmin);
        break;

      case 'demote':
      case 'degradar':
        await modCmd.handleDemote(sock, jid, targetUser, isGroup, isAdmin, isBotAdmin);
        break;

      // --- TAG & MENCIONES ---
      case 'tag':
      case 'todos':
      case 'everyone':
        await tagCmd.handleTagAll(sock, jid, body, isGroup, groupMetadata, isAdmin);
        break;

      case 'hidetag':
        await tagCmd.handleHideTag(sock, jid, body, isGroup, groupMetadata, isAdmin);
        break;

      // --- CASINO & ECONOMÍA ---
      case 'balance':
      case 'bal':
      case 'saldo':
        await casinoCmd.handleBalance(sock, jid, targetUser || sender);
        break;

      case 'daily':
      case 'diario':
        await casinoCmd.handleDaily(sock, jid, sender);
        break;

      case 'work':
      case 'trabajar':
        await casinoCmd.handleWork(sock, jid, sender);
        break;

      case 'slot':
      case 'tragamonedas':
        await casinoCmd.handleSlot(sock, jid, sender, args[0]);
        break;

      case 'cf':
      case 'coinflip':
        await casinoCmd.handleCoinflip(sock, jid, sender, args[0], args[1]);
        break;

      case 'roulette':
      case 'ruleta':
        await casinoCmd.handleRoulette(sock, jid, sender, args[0], args[1]);
        break;

      case 'rob':
      case 'robar':
        await casinoCmd.handleRob(sock, jid, sender, targetUser);
        break;

      case 'pay':
      case 'pagar':
        await casinoCmd.handlePay(sock, jid, sender, targetUser, args[1]);
        break;

      case 'top':
      case 'leaderboard':
        await casinoCmd.handleLeaderboard(sock, jid);
        break;

      case 'ship':
        await casinoCmd.handleShip(sock, jid, body, mentions);
        break;

      // --- STICKER ---
      case 's':
      case 'sticker':
        await stickerCmd.handleSticker(sock, jid, msg);
        break;

      // --- BIENVENIDAS Y LOBBY / GENERAL ---
      case 'setlobby':
        if (!isGroup) return sock.sendMessage(jid, { text: '❌ Este comando solo se usa en grupos.' });
        if (!isAdmin) return sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar #setlobby.' });
        db.setGroupType(jid, 'lobby');
        await sock.sendMessage(jid, { text: '✅ *Grupo configurado como LOBBY V7 - BIENVENIDOS.*\n\nCada usuario nuevo que ingrese recibirá automáticamente la Ficha de Postulación.' });
        break;

      case 'setgeneral':
        if (!isGroup) return sock.sendMessage(jid, { text: '❌ Este comando solo se usa en grupos.' });
        if (!isAdmin) return sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar #setgeneral.' });
        db.setGroupType(jid, 'general');
        await sock.sendMessage(jid, { text: '✅ *Grupo configurado como GENERAL V7.*\n\nCada miembro nuevo que ingrese recibirá el mensaje oficial de bienvenida al clan Dynasty V7.' });
        break;

      case 'testlobby':
        if (!isGroup) return sock.sendMessage(jid, { text: '❌ Solo en grupos.' });
        await welcomeHandler.handleWelcomeTest(sock, jid, sender, 'lobby');
        break;

      case 'testgeneral':
        if (!isGroup) return sock.sendMessage(jid, { text: '❌ Solo en grupos.' });
        await welcomeHandler.handleWelcomeTest(sock, jid, sender, 'general');
        break;

      // --- MÚSICA REPRODUCTOR (YOUTUBE AUDIO) ---
      case 'ytaudio':
      case 'play':
      case 'musica':
        await musicCmd.handleYtAudio(sock, jid, body);
        break;

      default:
        break;
    }
  } catch (err) {
    console.error('Error procesando mensaje:', err);
  }
}

module.exports = {
  handleMessage
};
