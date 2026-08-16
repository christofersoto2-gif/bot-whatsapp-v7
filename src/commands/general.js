const config = require('../../config');

module.exports = {
  async handleHelp(sock, jid) {
    const helpMsg = `═══════════════════════\n` +
      `⚔️ *${config.botName}* ⚔️\n` +
      `═══════════════════════\n\n` +
      `📌 *Prefijo activo:* \`${config.prefix}\` \n\n` +

      `🛡️ *ORGANIZACIÓN Y CLAN*\n` +
      `▸ \`${config.prefix}vs <Clan> <Hora> [Cupos]\` : Crear aviso de VS\n` +
      `▸ \`${config.prefix}anotar\` : Inscribirte a la alineación del VS\n` +
      `▸ \`${config.prefix}salirse\` : Salir de la alineación\n` +
      `▸ \`${config.prefix}lineup\` : Ver la escuadra anotada para el VS\n` +
      `▸ \`${config.prefix}topactivos\` : Ver los 10 miembros con más mensajes\n` +
      `▸ \`${config.prefix}topinactivos\` : Ver los 10 miembros menos activos\n` +
      `▸ \`${config.prefix}fantasmas\` : Lista completa de inactivos (Admin)\n` +
      `▸ \`${config.prefix}reglas\` : Ver el reglamento del clan\n` +
      `▸ \`${config.prefix}setrules <texto>\` : Establecer reglas (Admin)\n` +
      `▸ \`${config.prefix}setlobby\` : Configurar grupo como Lobby de bienvenida (Admin)\n` +
      `▸ \`${config.prefix}setgeneral\` : Configurar grupo como General del clan (Admin)\n` +
      `▸ \`${config.prefix}setfichas\` : Configurar grupo como Canal de Fichas (Admin)\n` +
      `▸ \`${config.prefix}aprobar\` : Copiar y trasladar Ficha al canal de Fichas (Respondiendo al mensaje)\n` +
      `▸ \`${config.prefix}testlobby\` : Probar mensaje de Ficha de Lobby\n` +
      `▸ \`${config.prefix}testgeneral\` : Probar mensaje de Bienvenida General\n` +
      `▸ \`${config.prefix}perfil [@user]\` : Ver perfil de jugador\n\n` +

      `👮 *MODERACIÓN (DISCORD STYLE)*\n` +
      `▸ \`${config.prefix}close\` : Cerrar el chat solo para Admins\n` +
      `▸ \`${config.prefix}open\` : Abrir el chat para todo el clan\n` +
      `▸ \`${config.prefix}warn @user [motivo]\` : Advertir (3 warns = KICK automático)\n` +
      `▸ \`${config.prefix}delwarn @user\` : Quitar 1 advertencia\n` +
      `▸ \`${config.prefix}warns @user\` : Ver historial de advertencias\n` +
      `▸ \`${config.prefix}kick @user\` : Expulsar directamente\n` +
      `▸ \`${config.prefix}promover @user\` : Dar Administrador\n` +
      `▸ \`${config.prefix}demote @user\` : Quitar Administrador\n\n` +

      `📢 *MENCIONES Y COMUNICADOS*\n` +
      `▸ \`${config.prefix}tag <mensaje>\` : Mencionar a todo el clan\n` +
      `▸ \`${config.prefix}todos <mensaje>\` : Mencion masiva (@everyone)\n` +
      `▸ \`${config.prefix}hidetag <mensaje>\` : Notificación oculta\n\n` +

      `🎰 *CASINO Y ECONOMÍA*\n` +
      `▸ \`${config.prefix}balance\` : Ver saldo y estadísticas\n` +
      `▸ \`${config.prefix}daily\` : Reclamar premio diario (500 🪙)\n` +
      `▸ \`${config.prefix}work\` : Trabajar para el clan\n` +
      `▸ \`${config.prefix}slot <apuesta>\` : Tragamonedas de casino\n` +
      `▸ \`${config.prefix}cf <cara/cruz> <apuesta>\` : Cara o cruz\n` +
      `▸ \`${config.prefix}roulette <rojo/negro/1-36> <apuesta>\` : Ruleta\n` +
      `▸ \`${config.prefix}rob @user\` : Intentar robar monedas\n` +
      `▸ \`${config.prefix}pay @user <monto>\` : Transferir monedas\n` +
      `▸ \`${config.prefix}top\` : Ranking de los más ricos del clan\n` +
      `▸ \`${config.prefix}ship @user1 @user2\` : Compatibilidad amorosa\n\n` +

      `🎨 *STICKERS*\n` +
      `▸ \`${config.prefix}s\` : Convertir imagen/video en sticker (respondiendo a una imagen)\n\n` +

      `🎵 *MÚSICA REPRODUCTOR*\n` +
      `▸ \`${config.prefix}ytaudio <canción / artista>\` : Descargar audio de YouTube al instante\n` +
      `▸ \`${config.prefix}play <canción / artista>\` : Descargar audio de YouTube al instante\n\n` +

      `═══════════════════════\n` +
      `💡 _Usa los comandos escribiendo ${config.prefix} al inicio._`;

    await sock.sendMessage(jid, { text: helpMsg });
  },

  async handlePing(sock, jid, startTime) {
    const latency = Date.now() - startTime;
    await sock.sendMessage(jid, { text: `🏓 *Pong!* Latencia de respuesta: *${latency}ms*` });
  }
};
