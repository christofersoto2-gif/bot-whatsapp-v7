const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const crypto = require('crypto');
const config = require('../../config');
const db = require('../database/manager');
const clanCmd = require('../commands/clan');
const modCmd = require('../commands/moderation');
const tagCmd = require('../commands/tag');
const casinoCmd = require('../commands/casino');
const musicCmd = require('../commands/music');
const stickerCmd = require('../commands/sticker');
const generalCmd = require('../commands/general');
const pollCmd = require('../commands/poll');
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
 * Descarga contenido multimedia de Baileys de forma ultra-segura evitando fallos C++ (Status 139 / Segfault)
 */
async function safeDownloadMedia(mediaMsg, mediaType) {
  if (!mediaMsg) return null;

  // IMPORTANTE: Prevenir fallo C++ Segfault (Status 139) si el mensaje citado es un stub de WhatsApp sin llaves de cifrado
  if (!mediaMsg.mediaKey || (!mediaMsg.url && !mediaMsg.directPath)) {
    console.log('El mensaje multimedia citado es un stub sin llaves directas, omitiendo descarga...');
    return null;
  }

  try {
    const stream = await downloadContentFromMessage(mediaMsg, mediaType);
    let buffer = Buffer.from([]);

    return await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('Timeout de 4s alcanzado en descarga de media.');
        resolve(null);
      }, 4000);

      stream.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
      });

      stream.on('end', () => {
        clearTimeout(timeout);
        resolve(buffer.length > 0 ? buffer : null);
      });

      stream.on('error', (err) => {
        clearTimeout(timeout);
        console.log('Error en stream de media:', err.message);
        resolve(null);
      });
    });
  } catch (err) {
    console.log('Error en safeDownloadMedia:', err.message);
    return null;
  }
}

/**
 * Normaliza textos convirtiendo estilos tipográficos especiales (negritas Unicode 𝗙𝗜𝗖𝗛𝗔𝗦, cursivas 𝑭𝒊𝒄𝒉𝒂𝒔, acentos) a letras normales
 */
function normalizeText(str) {
  if (!str) return '';
  return str
    .normalize('NFKD')
    .replace(/[\u1D400-\u1D7FF]/g, (char) => {
      const code = char.codePointAt(0);
      if (code >= 0x1D400 && code <= 0x1D419) return String.fromCharCode(code - 0x1D400 + 65); // Bold A-Z
      if (code >= 0x1D41A && code <= 0x1D433) return String.fromCharCode(code - 0x1D41A + 97); // Bold a-z
      if (code >= 0x1D434 && code <= 0x1D44D) return String.fromCharCode(code - 0x1D434 + 65); // Italic A-Z
      if (code >= 0x1D44E && code <= 0x1D467) return String.fromCharCode(code - 0x1D44E + 97); // Italic a-z
      if (code >= 0x1D468 && code <= 0x1D481) return String.fromCharCode(code - 0x1D468 + 65); // Bold Italic A-Z (ej: 𝑭)
      if (code >= 0x1D482 && code <= 0x1D49B) return String.fromCharCode(code - 0x1D482 + 97); // Bold Italic a-z (ej: 𝒊𝒄𝒉𝒂𝒔)
      if (code >= 0x1D49C && code <= 0x1D4B5) return String.fromCharCode(code - 0x1D49C + 65); // Script A-Z
      if (code >= 0x1D4B6 && code <= 0x1D4CF) return String.fromCharCode(code - 0x1D4B6 + 97); // Script a-z
      if (code >= 0x1D4D0 && code <= 0x1D4E9) return String.fromCharCode(code - 0x1D4D0 + 65); // Bold Script A-Z
      if (code >= 0x1D4EA && code <= 0x1D503) return String.fromCharCode(code - 0x1D4EA + 97); // Bold Script a-z
      if (code >= 0x1D5D4 && code <= 0x1D5ED) return String.fromCharCode(code - 0x1D5D4 + 65); // Sans-Serif Bold A-Z (ej: 𝗙)
      if (code >= 0x1D5EE && code <= 0x1D607) return String.fromCharCode(code - 0x1D5EE + 97); // Sans-Serif Bold a-z (ej: 𝗜𝗖𝗛𝗔𝗦)
      if (code >= 0x1D608 && code <= 0x1D621) return String.fromCharCode(code - 0x1D608 + 65); // Sans-Serif Italic A-Z
      if (code >= 0x1D622 && code <= 0x1D63B) return String.fromCharCode(code - 0x1D622 + 97); // Sans-Serif Italic a-z
      return char;
    })
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const groupMetadataCache = new Map();

async function getCachedGroupMetadata(sock, jid) {
  const now = Date.now();
  const cached = groupMetadataCache.get(jid);
  if (cached && (now - cached.timestamp < 5 * 60 * 1000)) {
    return cached.data;
  }
  const fresh = await sock.groupMetadata(jid);
  groupMetadataCache.set(jid, { data: fresh, timestamp: now });
  return fresh;
}

function tryDecryptPollVote(vote, pollMsgId, pollEncKey, creatorCandidates, voterCandidates) {
  for (const cJid of creatorCandidates) {
    if (!cJid) continue;
    for (const vJid of voterCandidates) {
      if (!vJid) continue;
      try {
        const decrypted = decryptPollVote(vote, {
          pollCreatorJid: cJid,
          pollMsgId: pollMsgId,
          pollEncKey: pollEncKey,
          voterJid: vJid
        });
        if (decrypted) return decrypted;
      } catch (e) {
        // Intentar siguiente combinación de candidatos JID
      }
    }
  }
  return null;
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


    // Votos de encuestas nativas: llegan como messages.upsert con tipo pollUpdateMessage
    // El vote.encPayload + vote.encIv están encriptados → necesitamos decryptPollVote primero
    if (messageType === 'pollUpdateMessage') {
      const { decryptPollVote, getAggregateVotesInPollMessage } = require('@whiskeysockets/baileys');

      const pollUpdateMsg = msg.message.pollUpdateMessage;
      const pollCreationMsgId = pollUpdateMsg?.pollCreationMessageKey?.id;

      // Normalizar JID: quitar sufijo de dispositivo (:X) pero conservar @s.whatsapp.net
      const normalizeJid = (j) => {
        if (!j) return '';
        const parts = j.split('@');
        return parts[0].split(':')[0] + '@' + (parts[1] || 's.whatsapp.net');
      };

      const voterJidRaw = msg.key?.participant || senderRaw;
      const voterJid = normalizeJid(voterJidRaw);

      console.log('[Poll] Voto recibido — pollCreationMsgId:', pollCreationMsgId, '| voterJid:', voterJid);

      const activePoll = db.getActivePoll(jid);
      if (!activePoll) { console.log('[Poll] Sin encuesta activa para:', jid); return; }
      if (activePoll.id !== pollCreationMsgId) {
        console.log('[Poll] ID no coincide. activo:', activePoll.id, ' voto:', pollCreationMsgId); return;
      }

      // Obtener la clave de encriptación del poll (desde pollCreationMessage o messageContextInfo)
      const rawKey = activePoll.pollMessage?.pollCreationMessage?.encKey
        || activePoll.pollMessage?.messageContextInfo?.messageSecret;

      if (!rawKey) {
        console.log('[Poll] No se encontró encKey en pollMessage guardado.');
        return;
      }
      const pollEncKey = Buffer.isBuffer(rawKey) ? rawKey : Buffer.from(Object.values(rawKey));

      const pollCreatorJid = normalizeJid(sock.user?.id || '');
      const pollMsgId = activePoll.id;

      console.log('[Poll] pollEncKey length:', pollEncKey.length, '| pollCreatorJid:', pollCreatorJid);

      let decryptedVote;
      try {
        decryptedVote = decryptPollVote(pollUpdateMsg.vote, {
          pollCreatorJid,
          pollMsgId,
          pollEncKey,
          voterJid
        });
        console.log('[Poll] Voto desencriptado OK — selectedOptions count:', decryptedVote?.selectedOptions?.length);
      } catch (err) {
        console.error('[Poll] Error en decryptPollVote:', err.message);
        return;
      }

      // Guardar el pollUpdate con los selectedOptions YA desencriptados
      const pollUpdate = {
        pollUpdateMessageKey: {
          ...msg.key,
          participant: voterJid  // usar JID normalizado
        },
        vote: decryptedVote,   // selectedOptions = SHA256 hashes de opciones votadas
        senderTimestampMs: pollUpdateMsg.senderTimestampMs
      };

      db.addPollUpdate(activePoll.sourceGroupId || jid, pollUpdate);

      try {
        const freshPoll = db.getActivePoll(jid);
        const votesSummary = getAggregateVotesInPollMessage({
          message: freshPoll.pollMessage,
          pollUpdates: freshPoll.pollUpdates
        }, sock.user?.id || '');

        console.log('[Poll] votesSummary:', JSON.stringify(votesSummary));
        db.updatePollVotesSummary(activePoll.sourceGroupId || jid, votesSummary);
      } catch (err) {
        console.error('[Poll] Error en getAggregateVotesInPollMessage:', err.message);
      }
      return;
    }

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
    if (isGroup && (sender || senderRaw)) {
      db.trackActivity(jid, sender, senderRaw);
    }

    if (!body || !body.startsWith(config.prefix)) return;

    // Extracción de comando y argumentos
    const args = body.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const startTime = Date.now();

    // Obtener información del grupo y permisos usando caché ultrarrápida de 5 min (Evita lag de red)
    let groupMetadata = null;
    let isAdmin = false;
    let isBotAdmin = false;

    if (isGroup) {
      try {
        groupMetadata = await getCachedGroupMetadata(sock, jid);
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

      case 'resetsemana':
      case 'resetactividad':
      case 'resetactivos':
        await clanCmd.handleResetActivity(sock, jid, isGroup, isAdmin);
        break;

      // --- VOTACIONES Y EVENTOS DE CLAN ---
      case 'votacion':
      case 'poll':
      case 'encuesta':
        await pollCmd.handleCreatePoll(sock, jid, body, isGroup, isAdmin);
        break;

      case 'resultados':
      case 'vervotacion':
      case 'vervotos':
        await pollCmd.handlePollResults(sock, jid, isGroup, groupMetadata);
        break;

      case 'cerrarvotacion':
      case 'cerrarpoll':
        await pollCmd.handleClosePoll(sock, jid, isGroup, isAdmin);
        break;

      case 'votar':
        await pollCmd.handleVotarText(sock, jid, args, sender, isGroup);
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
        console.log(`[APROBAR] Ejecutado por ${senderNumber} en ${jid}`);
        if (!isGroup) return sock.sendMessage(jid, { text: '❌ Este comando solo se usa en grupos.' });
        if (!isAdmin) {
          console.log(`[APROBAR] Remitente ${senderNumber} no es admin.`);
          return sock.sendMessage(jid, { text: '❌ Solo los administradores pueden aprobar fichas.' });
        }

        const quotedUserJid = contextInfo?.participant || contextInfo?.quotedParticipant || targetUser;
        console.log(`[APROBAR] quotedMsg: ${!!quotedMsg}, quotedUserJid: ${quotedUserJid}, quotedText: ${!!quotedText}`);

        if (!quotedMsg && !quotedUserJid && !quotedText) {
          return sock.sendMessage(jid, { text: '⚠️ *Uso correcto:* Responde a la Ficha o Captura llenada por el postulante y escribe *#aprobar* (o *#aceptar*).' });
        }

        let fichasGroupJid = db.getFichasGroup();
        console.log(`[APROBAR] db.getFichasGroup(): ${fichasGroupJid}`);

        if (!fichasGroupJid) {
          try {
            const allGroups = await sock.groupFetchAllParticipating();
            console.log(`[APROBAR] Buscando en ${Object.keys(allGroups).length} grupos donde está el bot...`);
            for (const gJid of Object.keys(allGroups)) {
              const rawName = allGroups[gJid].subject || '';
              const normalizedName = normalizeText(rawName);
              if (normalizedName.includes('ficha')) {
                fichasGroupJid = gJid;
                db.setGroupType(gJid, 'fichas');
                console.log(` [Auto-Detect] ¡GRUPO ENCONTRADO! -> ${gJid} (${rawName})`);
                break;
              }
            }
          } catch (err) {
            console.error('Error auto-detectando grupo de Fichas:', err);
          }
        }

        if (!fichasGroupJid) {
          return sock.sendMessage(jid, { text: '⚠️ No se pudo encontrar el grupo de Fichas. Entra al grupo de Fichas del clan y escribe *#setfichas*.' });
        }

        const applicantNum = (quotedUserJid || sender).split('@')[0].split(':')[0];
        const adminNum = senderNumber || 'Admin';
        const dateStr = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });

        const captionHeader = quotedMsg?.imageMessage ? `📷 *CAPTURA / FICHA ACEPTADA - DYNASTY V7* 📷` : `📋 *NUEVA FICHA ACEPTADA - DYNASTY V7* 📋`;

        const formattedFicha = `${captionHeader}\n\n` +
          `👤 *Miembro Aceptado:* @${applicantNum}\n` +
          `⭐ *Aprobado por Admin:* @${adminNum}\n` +
          `📅 *Fecha:* ${dateStr}\n\n` +
          (quotedText ? `─────────── 📄 FICHA REGISTRADA ───────────\n\n${quotedText}` : '');

        try {
          const mentionsList = [quotedUserJid, sender].filter(Boolean);

          // 1. Enviar tarjeta de texto oficial con la Ficha registrada
          try {
            await sock.sendMessage(fichasGroupJid, { text: formattedFicha, mentions: mentionsList });
          } catch (mErr) {
            await sock.sendMessage(fichasGroupJid, { text: formattedFicha });
          }

          // 2. Si el mensaje citado contiene una Foto o Video, reenviar la imagen nativamente por servidor de WhatsApp
          if (quotedMsg?.imageMessage || quotedMsg?.videoMessage) {
            try {
              const forwardObj = {
                key: {
                  remoteJid: jid,
                  id: contextInfo?.stanzaId,
                  participant: quotedUserJid
                },
                message: quotedMsg
              };
              await sock.sendMessage(fichasGroupJid, { forward: forwardObj });
            } catch (fErr) {
              console.log('No se pudo reenviar la imagen citada:', fErr);
            }
          }

          try {
            await sock.sendMessage(jid, { 
              text: `✅ *¡REGISTRO ENVIADO Y APROBADO CON ÉXITO!*\n\n` +
                    `👤 *Postulante:* @${applicantNum}\n` +
                    `📦 Copiado y archivado en el canal de *FICHAS V7*.`,
              mentions: [quotedUserJid].filter(Boolean)
            });
          } catch (mErr) {
            await sock.sendMessage(jid, { 
              text: `✅ *¡REGISTRO ENVIADO Y APROBADO CON ÉXITO!*\n\n` +
                    `👤 *Postulante:* ${applicantNum}\n` +
                    `📦 Copiado y archivado en el canal de *FICHAS V7*.`
            });
          }
        } catch (err) {
          console.error('Error enviando registro al canal de fichas:', err);
          await sock.sendMessage(jid, { text: `❌ Ocurrió un error al enviar al canal de Fichas: ${err.message}` });
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
