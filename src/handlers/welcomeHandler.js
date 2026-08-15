const db = require('../database/manager');

/**
 * Procesa los eventos de entrada de nuevos miembros a los grupos
 */
async function handleParticipantUpdate(sock, update) {
  try {
    const { id: jid, participants, action } = update;
    if (action !== 'add' || !participants || participants.length === 0) return;

    // Obtener metadatos del grupo
    const groupMetadata = await sock.groupMetadata(jid).catch(() => null);
    const groupName = groupMetadata ? groupMetadata.subject.toLowerCase() : '';
    const groupData = db.getGroup(jid);

    // Determinar si el grupo es Lobby o General (vía base de datos o por nombre del grupo)
    let type = groupData.groupType || null;

    if (!type) {
      if (groupName.includes('lobby') || groupName.includes('bienvenido')) {
        type = 'lobby';
      } else if (groupName.includes('general')) {
        type = 'general';
      }
    }

    if (!type) return; // Si no es ni lobby ni general, no envía bienvenida automática

    for (const participant of participants) {
      const number = participant.split('@')[0];

      if (type === 'lobby') {
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

        await sock.sendMessage(jid, { text, mentions: [participant] });
      } else if (type === 'general') {
        const text = `❀ Bienvenido a 𝟏• 𝐆𝐄𝐍𝐄𝐑𝐀𝐋 𝐕𝟕’ 🕷️🌪️!\n` +
          `\t✰ @${number}\n\n` +
          `Demos la bienvenid@ a un nuev@ integrante. Esperamos que te sientas cómod@ y bienvenid@ en el clan.\n` +
          `Disfruta de tu tiempo aquí y de las actividades que se realizan.\n` +
          `Cualquier duda o consulta que tengas, el staff estará disponible para ayudarte.\n\n` +
          `¡Bienvenid@ a la familia Dynasty V7!`;

        await sock.sendMessage(jid, { text, mentions: [participant] });
      }
    }
  } catch (err) {
    console.error('Error enviando mensaje de bienvenida:', err);
  }
}

/**
 * Permite probar o forzar la simulación del mensaje de bienvenida
 */
async function handleWelcomeTest(sock, jid, sender, type) {
  const number = sender.split('@')[0];

  if (type === 'lobby') {
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

    await sock.sendMessage(jid, { text, mentions: [sender] });
  } else if (type === 'general') {
    const text = `❀ Bienvenido a 𝟏• 𝐆𝐄𝐍𝐄𝐑𝐀𝐋 𝐕𝟕’ 🕷️🌪️!\n` +
      `\t✰ @${number}\n\n` +
      `Demos la bienvenid@ a un nuev@ integrante. Esperamos que te sientas cómod@ y bienvenid@ en el clan.\n` +
      `Disfruta de tu tiempo aquí y de las actividades que se realizan.\n` +
      `Cualquier duda o consulta que tengas, el staff estará disponible para ayudarte.\n\n` +
      `¡Bienvenid@ a la familia Dynasty V7!`;

    await sock.sendMessage(jid, { text, mentions: [sender] });
  }
}

module.exports = {
  handleParticipantUpdate,
  handleWelcomeTest
};
