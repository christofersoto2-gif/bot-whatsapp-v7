const db = require('../database/manager');
const config = require('../../config');

/**
 * Envía el mensaje de bienvenida del lobby (con imagen si está configurada en config.js)
 */
async function sendLobbyWelcome(sock, jid, participant) {
  const number = participant.split('@')[0];
  const text = `❀ Bienvenido a 𝗟𝗼𝗯𝗯𝘆 𝗩𝟳 - 𝗕𝗶𝗲𝗻𝘃𝗲𝗻𝗶𝗱𝗼𝘀!\n` +
    `\t@${number}\n\n` +
    `│ 圡 │  𝗕𝗜𝗘𝗡𝗩𝗘𝗡𝗜𝗗𝐗 — 𝗪𝗘𝗟𝗖𝗢𝗠𝗘│ 土 │\n\n` +
    `𐎓  𝟬𝟭 Nombre:\n\n` +
    `𐎓  𝟬𝟮 Edad/Cumpleaños:\n\n` +
    `𐎓  𝟬𝟯 ¿Estuviste en otro clan? Cuáles y motivos de salida:\n\n` +
    `𐎓  𝟬𝟰 Género:\n\n` +
    `𐎓  𝟬𝟱 ¿Quién te reclutó?\n\n` +
    `𐎓  𝟬𝟲 Captura de tu perfil en Roblox:\n` +
    `¿Te comprometes a ser activo en el clan?\n\n` +
    `⸻ 𝗥𝗲𝗾𝘂𝗶𝘀𝗶𝘁𝗼 𝗼𝗯𝗹𝗶𝗴𝗮𝘁𝗼𝗿𝗶𝗼: Al ser agregado al clan deberás utilizar automáticamente las iniciales V7.`;

  if (config.lobbyWelcomeImageUrl) {
    try {
      await sock.sendMessage(jid, {
        image: { url: config.lobbyWelcomeImageUrl },
        caption: text,
        mentions: [participant]
      });
    } catch (imgErr) {
      console.warn('[Welcome] No se pudo cargar la imagen del lobby, enviando solo texto:', imgErr.message);
      await sock.sendMessage(jid, { text, mentions: [participant] });
    }
  } else {
    await sock.sendMessage(jid, { text, mentions: [participant] });
  }
}

/**
 * Envía el mensaje de bienvenida del general (con imagen si está configurada en config.js)
 */
async function sendGeneralWelcome(sock, jid, participant) {
  const number = participant.split('@')[0];
  const text = `❀ Bienvenido a 𝟏• 𝐆𝐄𝐍𝐄𝐑𝐀𝐋 𝐕𝟕' 🕷️🌪️!\n` +
    `\t✰ @${number}\n\n` +
    `Demos la bienvenid@ a un nuev@ integrante. Esperamos que te sientas cómod@ y bienvenid@ en el clan.\n` +
    `Disfruta de tu tiempo aquí y de las actividades que se realizan.\n` +
    `Cualquier duda o consulta que tengas, el staff estará disponible para ayudarte.\n\n` +
    `¡Bienvenid@ a la familia Dynasty V7!`;

  if (config.generalWelcomeImageUrl) {
    try {
      await sock.sendMessage(jid, {
        image: { url: config.generalWelcomeImageUrl },
        caption: text,
        mentions: [participant]
      });
    } catch (imgErr) {
      console.warn('[Welcome] No se pudo cargar la imagen del general, enviando solo texto:', imgErr.message);
      await sock.sendMessage(jid, { text, mentions: [participant] });
    }
  } else {
    await sock.sendMessage(jid, { text, mentions: [participant] });
  }
}

/**
 * Procesa los eventos de entrada de nuevos miembros a los grupos
 */
async function handleParticipantUpdate(sock, update) {
  try {
    const { id: jid, participants, action } = update;
    if (action !== 'add' || !participants || participants.length === 0) return;

    const groupData = db.getGroup(jid);

    // Solo enviar bienvenida si el grupo fue configurado EXPLÍCITAMENTE
    // con #setlobby o #setgeneral. No detectar por nombre del grupo para
    // evitar enviar mensajes en grupos equivocados.
    const type = groupData.groupType || null;
    if (!type) return;

    for (const participant of participants) {
      if (type === 'lobby') {
        await sendLobbyWelcome(sock, jid, participant);
      } else if (type === 'general') {
        await sendGeneralWelcome(sock, jid, participant);
      }
    }
  } catch (err) {
    console.error('Error enviando mensaje de bienvenida:', err);
  }
}

/**
 * Comando #testwelcome — simula el mensaje de bienvenida del grupo actual sin esperar a que entre alguien
 */
async function handleWelcomeTest(sock, jid, sender, isGroup, isAdmin) {
  if (!isGroup) {
    return sock.sendMessage(jid, { text: '❌ Este comando solo funciona dentro del grupo.' });
  }
  if (!isAdmin) {
    return sock.sendMessage(jid, { text: '❌ Solo los administradores pueden probar la bienvenida.' });
  }

  const groupData = db.getGroup(jid);
  const type = groupData.groupType || null;

  if (!type) {
    return sock.sendMessage(jid, {
      text: `⚠️ Este grupo no tiene bienvenida configurada.\n\n• Usa *#setlobby* para configurarlo como Lobby.\n• Usa *#setgeneral* para configurarlo como General.`
    });
  }

  await sock.sendMessage(jid, {
    text: `🧪 *Probando bienvenida de tipo: ${type.toUpperCase()}*\n_(Se usa tu número como si acabaras de entrar)_`
  });

  if (type === 'lobby') {
    await sendLobbyWelcome(sock, jid, sender);
  } else if (type === 'general') {
    await sendGeneralWelcome(sock, jid, sender);
  }
}

module.exports = {
  handleParticipantUpdate,
  handleWelcomeTest,
  sendLobbyWelcome,
  sendGeneralWelcome
};
