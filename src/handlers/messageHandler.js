const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
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
          if (!senderNumber) return false;
          const pNum = getCleanNumber(p.id);
          if (!pNum) return false;
          if (p.id === senderRaw || pNum === senderNumber) return true;
          if (pNum.endsWith(senderNumber) || senderNumber.endsWith(pNum)) return true;
          if (pNum.length >= 7 && senderNumber.length >= 7 && pNum.slice(-7) === senderNumber.slice(-7)) return true;
          return false;
        });

        // Identificar al bot en los participantes del grupo
        const botTargetNumbers = [botNumber, senderNumber, '56940300538', '5640300538'].filter(Boolean);
        
        const botParticipant = participants.find(p => {
          const pNum = getCleanNumber(p.id);
          if (!pNum) return false;
          return botTargetNumbers.some(target => {
            if (pNum === target || pNum.endsWith(target) || target.endsWith(pNum)) return true;
            return pNum.length >= 7 && target.length >= 7 && pNum.slice(-7) === target.slice(-7);
          });
        });

        const isSenderAdmin = senderParticipant ? (senderParticipant.admin === 'admin' || senderParticipant.admin === 'superadmin') : false;
        const isBotAccountAdmin = botParticipant ? (botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin') : false;

        isAdmin = isSenderAdmin || msg.key.fromMe;
        isBotAdmin = isBotAccountAdmin;

        // Si el mensaje es enviado por el propio dueño/bot desde WhatsApp (fromMe)
        if (msg.key.fromMe) {
          isAdmin = true;
          isBotAdmin = isBotAccountAdmin || true;
        }

        console.log(`[Comando: #${command}] Grupo: ${jid} | Remitente: ${senderNumber} (Admin: ${isAdmin}) | Bot: ${botNumber} (BotAdmin: ${isBotAdmin})`);
      } catch (err) {
        console.error('Error obteniendo metadatos del grupo:', err);
      }
    }

    // Extraer usuario mencionado o por respuesta a mensaje (reply)
    let targetUser = null;
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo || 
                        msg.message?.imageMessage?.contextInfo || 
                        msg.message?.videoMessage?.contextInfo || 
                        msg.message?.stickerMessage?.contextInfo;

    const mentions = contextInfo?.mentionedJid || [];
    const quotedParticipant = contextInfo?.participant;

    if (mentions.length > 0) {
      targetUser = mentions[0];
    } else if (quotedParticipant) {
      targetUser = quotedParticipant;
    } else if (args[0] && args[0].includes('@')) {
      const cleanNum = args[0].replace(/[^0-9]/g, '');
      if (cleanNum) targetUser = `${cleanNum}@s.whatsapp.net`;
    }

    // Extraer texto del mensaje respondido (reply) si existe
    let quotedText = '';
    const quotedMsg = contextInfo?.quotedMessage;
    if (quotedMsg) {
      quotedText = quotedMsg.conversation || 
                   quotedMsg.extendedTextMessage?.text || 
                   quotedMsg.imageMessage?.caption || 
                   quotedMsg.videoMessage?.caption || '';
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

      // --- BIENVENIDAS Y LOBBY / GENERAL / FICHAS ---
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

      case 'setfichas':
        if (!isGroup) return sock.sendMessage(jid, { text: '❌ Este comando solo se usa en grupos.' });
        if (!isAdmin) return sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar #setfichas.' });
        db.setGroupType(jid, 'fichas');
        await sock.sendMessage(jid, { text: '✅ *Grupo configurado como CANAL DE FICHAS V7.*\n\nAquí se enviarán automáticamente las fichas aprobadas con #aprobar o #aceptar.' });
        break;

      case 'aprobar':
      case 'aceptar':
      case 'ficha':
      case 'moverficha':
        if (!isGroup) return sock.sendMessage(jid, { text: '❌ Este comando solo se usa en grupos.' });
        if (!isAdmin) return sock.sendMessage(jid, { text: '❌ Solo los administradores pueden aprobar fichas.' });

        if (!quotedMsg || !quotedParticipant) {
          return sock.sendMessage(jid, { text: '⚠️ *Uso correcto:* Responde a la Ficha o Captura llenada por el postulante y escribe *#aprobar* (o *#aceptar*).' });
        }

        let fichasGroupJid = db.getFichasGroup();

        if (!fichasGroupJid) {
          // Auto-detectar grupo por nombre si no se ha configurado con #setfichas
          try {
            const allGroups = await sock.groupFetchAllParticipating();
            for (const gJid of Object.keys(allGroups)) {
              const name = (allGroups[gJid].subject || '').toLowerCase();
              if (name.includes('ficha')) {
                fichasGroupJid = gJid;
                db.setGroupType(gJid, 'fichas');
                console.log(`[Auto-Detect] Grupo de Fichas detectado automáticamente: ${gJid} (${allGroups[gJid].subject})`);
                break;
              }
            }
          } catch (err) {
            console.error('Error auto-detectando grupo de Fichas:', err);
          }
        }

        if (!fichasGroupJid) {
          return sock.sendMessage(jid, { text: '⚠️ Aún no se ha detectado el grupo de Fichas. Ve al canal de Fichas del clan y escribe *#setfichas*.' });
        }

        const applicantNum = quotedParticipant.split('@')[0];
        const adminNum = senderNumber || 'Admin';
        const dateStr = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });

        const captionHeader = quotedMsg?.imageMessage ? `📷 *CAPTURA / FICHA DE PERFIL - DYNASTY V7* 📷` : `📋 *NUEVA FICHA ACEPTADA - DYNASTY V7* 📋`;

        const formattedFicha = `${captionHeader}\n\n` +
          `👤 *Miembro Aceptado:* @${applicantNum}\n` +
          `⭐ *Aprobado por Admin:* @${adminNum}\n` +
          `📅 *Fecha:* ${dateStr}\n\n` +
          (quotedText ? `─────────── 📄 FICHA REGISTRADA ───────────\n\n${quotedText}` : '');

        try {
          let mediaSent = false;

          if (quotedMsg?.imageMessage) {
            try {
              const stream = await downloadContentFromMessage(quotedMsg.imageMessage, 'image');
              let buffer = Buffer.from([]);
              for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
              }
              if (buffer.length > 0) {
                await sock.sendMessage(fichasGroupJid, { image: buffer, caption: formattedFicha, mentions: [quotedParticipant, sender] });
                mediaSent = true;
              }
            } catch (mediaErr) {
              console.log('No se pudo descargar la imagen citada, enviando tarjeta formateada...');
            }
          } else if (quotedMsg?.videoMessage) {
            try {
              const stream = await downloadContentFromMessage(quotedMsg.videoMessage, 'video');
              let buffer = Buffer.from([]);
              for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
              }
              if (buffer.length > 0) {
                await sock.sendMessage(fichasGroupJid, { video: buffer, caption: formattedFicha, mentions: [quotedParticipant, sender] });
                mediaSent = true;
              }
            } catch (mediaErr) {
              console.log('No se pudo descargar el video citado, enviando tarjeta formateada...');
            }
          }

          if (!mediaSent) {
            await sock.sendMessage(fichasGroupJid, { text: formattedFicha, mentions: [quotedParticipant, sender] });
          }

          await sock.sendMessage(jid, { 
            text: `✅ *¡REGISTRO ENVIADO Y APROBADO CON ÉXITO!*\n\n` +
                  `👤 *Postulante:* @${applicantNum}\n` +
                  `📦 Copiado y archivado en el canal de *FICHAS V7*.`,
            mentions: [quotedParticipant] 
          });
        } catch (err) {
          console.error('Error enviando registro al canal de fichas:', err);
          await sock.sendMessage(jid, { text: '❌ Ocurrió un error al enviar al canal de Fichas. Verifica que el bot esté en el grupo de Fichas.' });
        }
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
