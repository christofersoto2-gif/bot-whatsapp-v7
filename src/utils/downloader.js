const yts = require('yt-search');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const MUSIC_CACHE_DIR = path.join(__dirname, '../../cache/music');
const MUSIC_INDEX_PATH = path.join(__dirname, '../../cache/music_index.json');

// Asegurar directorios de caché
fs.ensureDirSync(MUSIC_CACHE_DIR);

function getCacheIndex() {
  try {
    if (fs.existsSync(MUSIC_INDEX_PATH)) {
      return fs.readJsonSync(MUSIC_INDEX_PATH);
    }
  } catch (e) {}
  return {};
}

function saveCacheIndex(index) {
  try {
    fs.writeJsonSync(MUSIC_INDEX_PATH, index, { spaces: 2 });
  } catch (e) {}
}

/**
 * Busca en YouTube y descarga el audio MP3 usando caché ultrarrápida + adonix-scraper + yt-search
 * @param {string} query Nombre de la canción o cantante
 * @returns {Promise<{ filePath: string, title: string, duration: string, author: string, thumbnail: string, url: string, cached?: boolean }>}
 */
async function searchAndDownloadAudio(query) {
  try {
    const cleanKey = query.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const cacheIndex = getCacheIndex();

    // 1. Verificar si la canción ya existe en el Sistema de Caché local
    if (cleanKey && cacheIndex[cleanKey]) {
      const cachedData = cacheIndex[cleanKey];
      if (fs.existsSync(cachedData.filePath)) {
        console.log(`[Caché de Música] ¡Canción Servida Instantáneamente desde Caché!: "${query}"`);
        return {
          ...cachedData,
          cached: true
        };
      }
    }

    const adonix = await import('adonix-scraper');
    let videoUrl = query;
    let videoInfo = null;

    if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
      const searchResult = await yts(query);
      if (!searchResult || !searchResult.videos || searchResult.videos.length === 0) {
        throw new Error('No se encontraron canciones en YouTube con ese nombre.');
      }
      videoInfo = searchResult.videos[0];
      videoUrl = videoInfo.url;
    }

    // Obtener enlace directo de descarga MP3 vía adonix-scraper o servidores de respaldo
    let dlData = null;
    try {
      dlData = await adonix.adonixytdl(videoUrl);
    } catch (e) {}

    let dlUrl = dlData?.mp3;

    if (!dlUrl) {
      // Servidor de respaldo 1 (Vreden)
      try {
        const res2 = await fetch(`https://api.vreden.web.id/api/ytmp3?url=${encodeURIComponent(videoUrl)}`);
        const data2 = await res2.json();
        if (data2?.result?.download?.url) dlUrl = data2.result.download.url;
      } catch (e) {}
    }

    if (!dlUrl) {
      // Servidor de respaldo 2 (Siputzx)
      try {
        const res3 = await fetch(`https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(videoUrl)}`);
        const data3 = await res3.json();
        if (data3?.data?.dl) dlUrl = data3.data.dl;
      } catch (e) {}
    }

    if (!dlUrl) {
      throw new Error('No se pudo obtener el enlace de descarga de audio desde los servidores de música.');
    }

    const title = videoInfo ? videoInfo.title : (dlData?.title || 'Audio de YouTube');
    const duration = videoInfo ? videoInfo.timestamp : 'Audio';
    const author = videoInfo ? videoInfo.author.name : 'YouTube';
    const thumbnail = videoInfo ? videoInfo.thumbnail : '';

    // Guardar el archivo MP3 en el directorio de caché local
    const fileName = `song_${Date.now()}_${cleanKey.slice(0, 15)}.mp3`;
    const filePath = path.join(MUSIC_CACHE_DIR, fileName);

    const response = await fetch(dlUrl);
    if (!response.ok) {
      throw new Error(`Error en el servidor de música (Código HTTP ${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(filePath, buffer);

    const resultObj = {
      filePath,
      title,
      duration,
      author,
      thumbnail,
      url: videoUrl
    };

    // Guardar en el índice de caché
    if (cleanKey) {
      cacheIndex[cleanKey] = resultObj;
      saveCacheIndex(cacheIndex);
    }

    return {
      ...resultObj,
      cached: false
    };
  } catch (err) {
    console.error('Error en downloader.js:', err);
    throw err;
  }
}

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Convierte cualquier archivo de audio (MP3) al formato nativo Opus OGG de WhatsApp
 * (Garantiza reproducción directa en iPhone iOS, Xiaomi, Motorola, Samsung y Web como nota/reproductor nativo)
 */
async function convertToOpusOgg(inputPath) {
  if (!inputPath || !fs.existsSync(inputPath)) return inputPath;
  const outputPath = inputPath.replace(/\.mp3$/i, '.opus');
  if (fs.existsSync(outputPath)) return outputPath;

  return new Promise((resolve) => {
    ffmpeg(inputPath)
      .toFormat('ogg')
      .audioCodec('libopus')
      .audioChannels(2)
      .audioFrequency(48000)
      .on('end', () => {
        console.log(`[FFmpeg] Audio convertido nativamente a Opus OGG para WhatsApp: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('Error en conversión de audio Opus OGG:', err.message);
        resolve(inputPath);
      })
      .save(outputPath);
  });
}

/**
 * Sube el archivo de audio a un CDN público de alta velocidad (tmpfiles.org)
 * para generar un enlace de descarga directa reconocido por los servidores de WhatsApp de todo el mundo.
 */
async function uploadToCdn(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const fileBuffer = await fs.readFile(filePath);
    const fileName = path.basename(filePath);
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), fileName);

    const res = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: formData
    });

    const json = await res.json();
    if (json?.data?.url) {
      const directUrl = json.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
      console.log(`[CDN Uplink] ¡Audio alojado con éxito en CDN de alta velocidad!: ${directUrl}`);
      return directUrl;
    }
  } catch (err) {
    console.error('Error subiendo audio a CDN:', err.message);
  }
  return null;
}

/**
 * Convierte el audio descargado a un MP3 limpio codificado con libmp3lame (FFmpeg)
 * (Truco nativo de Baileys con mimetype audio/mp4 para reproduccion directa en iPhones iOS)
 */
async function convertToMp3(inputPath) {
  if (!inputPath || !fs.existsSync(inputPath)) return inputPath;
  const outputPath = inputPath.replace(/\.[a-z0-9]+$/i, '_clean.mp3');
  if (fs.existsSync(outputPath)) return outputPath;

  return new Promise((resolve) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioQuality(2)
      .on('end', () => {
        console.log(`[FFmpeg] MP3 limpio generado con éxito para iOS (libmp3lame): ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('Error en conversión MP3 libmp3lame:', err.message);
        resolve(inputPath);
      })
      .save(outputPath);
  });
}

/**
 * Convierte el audio descargado a M4A / AAC limpio con FFmpeg (-c:a aac -b:a 128k -map_metadata -1 -movflags +faststart)
 * (Fórmula mágica definitiva para reproducir instantáneamente en iPhones iOS, Android y Web sin congelarse)
 */
async function convertToM4a(inputPath) {
  if (!inputPath || !fs.existsSync(inputPath)) return inputPath;
  const outputPath = inputPath.replace(/\.[a-z0-9]+$/i, '_final.m4a');
  if (fs.existsSync(outputPath)) return outputPath;

  return new Promise((resolve) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('aac')
      .audioBitrate('128k')
      .outputOptions([
        '-map_metadata', '-1',
        '-movflags', '+faststart'
      ])
      .on('end', () => {
        console.log(`[FFmpeg] M4A AAC faststart generado con éxito para iOS/Android: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('Error en conversión M4A AAC:', err.message);
        resolve(inputPath);
      })
      .save(outputPath);
  });
}

module.exports = {
  searchAndDownloadAudio,
  convertToOpusOgg,
  convertToMp3,
  convertToM4a,
  uploadToCdn
};
