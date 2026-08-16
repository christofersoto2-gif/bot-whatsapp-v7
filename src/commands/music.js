const { searchAndDownloadAudio, convertToMp3 } = require('../utils/downloader');
const config = require('../../config');
const fs = require('fs-extra');

// Cola Global de Envío de Música (Evita saturación de socket y corrupción cuando se solicitan varias canciones a la vez)
const musicQueue = [];
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue || musicQueue.length === 0) return;
  isProcessingQueue = true;

  while (musicQueue.length > 0) {
    const task = musicQueue.shift();
    try {
      await task();
    } catch (err) {
      console.error('Error en tarea de cola de música:', err);
    }
    // Pausa de seguridad de 1.5 segundos entre envíos pesados para que el servidor de WhatsApp procese cada paquete limpiamente
    await new Promise(res => setTimeout(res, 1500));
  }

  isProcessingQueue = false;
}

function parseDurationToSeconds(durationStr) {
  if (!durationStr) return 180;
  if (typeof durationStr === 'number') return durationStr;
  const parts = String(durationStr).split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parseInt(durationStr) || 180;
}

module.exports = {
  async handleYtAudio(sock, jid, text) {
    const query = text.replace(new RegExp(`^${config.prefix}(ytaudio|play|musica)`, 'i'), '').trim();
    if (!query) {
      return sock.sendMessage(jid, {
        text: `⚠️ *Uso correcto:* ${config.prefix}ytaudio <Nombre de la canción / cantante>\n*Ejemplo:* ${config.prefix}ytaudio Bad Bunny Monaco`
      });
    }

    // Mensaje de estado buscando en YouTube
    await sock.sendMessage(jid, { text: `🔍 *Buscando exclusivamente en YouTube:* _"${query}"_...` });

    // Agregar la descarga y envío a la cola secuencial sin saturar el canal
    musicQueue.push(async () => {
      try {
        const result = await searchAndDownloadAudio(query);

        // 1. Convertir a MP3 limpio codificado con FFmpeg (libmp3lame -q:a 2)
        const cleanMp3Path = await convertToMp3(result.filePath);
        const mp3Buffer = await fs.readFile(cleanMp3Path);
        const fileSizeMb = (mp3Buffer.length / (1024 * 1024)).toFixed(2);
        const durationSec = parseDurationToSeconds(result.duration);

        const infoCaption = 
          `┌✦」 Descargando <*${result.title}*>\n` +
          `┆ ✏️ Canal: *${result.author}*\n` +
          `┆ ⌛ Duración: *${result.duration}*\n` +
          `┆ ❒ Tamaño: *${fileSizeMb}MB*\n` +
          `┆ 🔗 URL: ${result.url}`;

        // 2. Enviar tarjeta con imagen de miniatura de YouTube (Thumbnail)
        let imgSent = false;
        if (result.thumbnail) {
          try {
            const imgRes = await fetch(result.thumbnail);
            if (imgRes.ok) {
              const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
              await sock.sendMessage(jid, { 
                image: imgBuffer, 
                caption: infoCaption,
                jpegThumbnail: Buffer.alloc(0)
              });
              imgSent = true;
            }
          } catch (e) {}
        }
        
        if (!imgSent) {
          await sock.sendMessage(jid, { text: infoCaption });
        }

        // 3. El Truco Nativo de Baileys para iPhone (iOS) y Android: MP3 limpio con mimetype audio/mp4 y ptt: false
        await sock.sendMessage(jid, {
          audio: mp3Buffer,
          mimetype: 'audio/mp4',
          seconds: durationSec,
          fileLength: mp3Buffer.length,
          ptt: false
        });

      } catch (err) {
        console.error('Error en #ytaudio:', err);
        await sock.sendMessage(jid, { text: `❌ No se pudo procesar la canción en YouTube: ${err.message || 'Error desconocido'}` });
      }
    });

    processQueue();
  }
};
