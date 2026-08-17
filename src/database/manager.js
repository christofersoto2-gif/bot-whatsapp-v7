const fs = require('fs-extra');
const path = require('path');
const { BufferJSON } = require('@whiskeysockets/baileys');
const config = require('../../config');

const DB_PATH = path.join(__dirname, '../../database.json');

const activePollMessagesMap = new Map();

function rehydrateBuffers(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (obj.type === 'Buffer' && (Array.isArray(obj.data) || typeof obj.data === 'string')) {
    return Buffer.from(obj.data, typeof obj.data === 'string' ? 'base64' : undefined);
  }
  for (const key of Object.keys(obj)) {
    obj[key] = rehydrateBuffers(obj[key]);
  }
  return obj;
}

const normalizarId = (jid) => {
  if (!jid) return '';
  const cleanNumber = jid.split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
  return cleanNumber ? `${cleanNumber}@s.whatsapp.net` : jid;
};

class DatabaseManager {
  constructor() {
    this.data = {
      users: {},
      groups: {}
    };
    this.init();
  }

  init() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        this.data = JSON.parse(raw, BufferJSON.reviver);
        this.data = rehydrateBuffers(this.data);
      } else {
        this.save();
      }
    } catch (err) {
      console.error('Error cargando la base de datos, creando nueva:', err);
      this.save();
    }
  }

  save() {
    try {
      const jsonStr = JSON.stringify(this.data, BufferJSON.replacer, 2);
      fs.writeFileSync(DB_PATH, jsonStr, 'utf-8');
    } catch (err) {
      console.error('Error guardando la base de datos:', err);
    }
  }

  // --- USUARIOS & ECONOMÍA ---
  getUser(userId) {
    if (!this.data.users[userId]) {
      this.data.users[userId] = {
        balance: config.initialBalance || 1000,
        bank: 0,
        warns: {},
        lastDaily: 0,
        lastWork: 0,
        wins: 0,
        losses: 0
      };
      this.save();
    }
    return this.data.users[userId];
  }

  addBalance(userId, amount) {
    const user = this.getUser(userId);
    user.balance += amount;
    this.save();
    return user.balance;
  }

  removeBalance(userId, amount) {
    const user = this.getUser(userId);
    if (user.balance < amount) return false;
    user.balance -= amount;
    this.save();
    return true;
  }

  setLastDaily(userId) {
    const user = this.getUser(userId);
    user.lastDaily = Date.now();
    this.save();
  }

  setLastWork(userId) {
    const user = this.getUser(userId);
    user.lastWork = Date.now();
    this.save();
  }

  addWin(userId) {
    const user = this.getUser(userId);
    user.wins = (user.wins || 0) + 1;
    this.save();
  }

  addLoss(userId) {
    const user = this.getUser(userId);
    user.losses = (user.losses || 0) + 1;
    this.save();
  }

  getLeaderboard(limit = 10) {
    const usersArray = Object.keys(this.data.users).map(id => ({
      id,
      balance: this.data.users[id].balance || 0
    }));
    usersArray.sort((a, b) => b.balance - a.balance);
    return usersArray.slice(0, limit);
  }

  // --- MODERACIÓN (#WARN, #DELWARN) ---
  addWarn(groupId, userId, reason = 'Sin motivo especificado') {
    const user = this.getUser(userId);
    if (!user.warns[groupId]) {
      user.warns[groupId] = { count: 0, reasons: [] };
    }
    user.warns[groupId].count += 1;
    user.warns[groupId].reasons.push({
      reason,
      date: new Date().toISOString()
    });
    this.save();
    return user.warns[groupId];
  }

  removeWarn(groupId, userId) {
    const user = this.getUser(userId);
    if (!user.warns[groupId] || user.warns[groupId].count <= 0) {
      return { count: 0, reasons: [] };
    }
    user.warns[groupId].count -= 1;
    user.warns[groupId].reasons.pop();
    this.save();
    return user.warns[groupId];
  }

  getWarns(groupId, userId) {
    const user = this.getUser(userId);
    return user.warns[groupId] || { count: 0, reasons: [] };
  }

  // --- GRUPOS & CLAN (VS / RULES) ---
  getGroup(groupId) {
    if (!this.data.groups[groupId]) {
      this.data.groups[groupId] = {
        rules: 'Aún no se han definido las reglas del clan. Usa #setrules <reglas> para establecerlas.',
        welcome: true,
        vs: null
      };
      this.save();
    }
    return this.data.groups[groupId];
  }

  setRules(groupId, rulesText) {
    const group = this.getGroup(groupId);
    group.rules = rulesText;
    this.save();
  }

  setGroupType(groupId, groupType) {
    if (groupType === 'fichas') {
      // Remover el rol de fichas de cualquier otro grupo anterior
      for (const id of Object.keys(this.data.groups)) {
        if (this.data.groups[id].groupType === 'fichas') {
          delete this.data.groups[id].groupType;
        }
      }
    }
    const group = this.getGroup(groupId);
    group.groupType = groupType;
    this.save();
  }

  getFichasGroup() {
    for (const groupId of Object.keys(this.data.groups)) {
      if (this.data.groups[groupId].groupType === 'fichas') {
        return groupId;
      }
    }
    return null;
  }

  createVS(groupId, opponent, datetime, slots = 4) {
    const group = this.getGroup(groupId);
    group.vs = {
      opponent,
      datetime,
      slots: parseInt(slots) || 4,
      lineup: []
    };
    this.save();
    return group.vs;
  }

  joinVS(groupId, userId) {
    const group = this.getGroup(groupId);
    if (!group.vs) return { success: false, msg: 'No hay ningún VS/Scrim activo en este momento. Usa #vs para crear uno.' };
    if (group.vs.lineup.includes(userId)) return { success: false, msg: 'Ya estás anotado en el VS del clan.' };
    if (group.vs.lineup.length >= group.vs.slots) return { success: false, msg: 'La escuadra ya está llena.' };

    group.vs.lineup.push(userId);
    this.save();
    return { success: true, vs: group.vs };
  }

  leaveVS(groupId, userId) {
    const group = this.getGroup(groupId);
    if (!group.vs) return false;
    const index = group.vs.lineup.indexOf(userId);
    if (index > -1) {
      group.vs.lineup.splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  // --- ACTIVIDAD DE GRUPO Y CLAN (CALENDARIO SEMANAL: LUNES A DOMINGO) ---
  getMondayTimestamp(d = new Date()) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday.getTime();
  }

  checkWeeklyReset(groupId) {
    const group = this.getGroup(groupId);
    const currentMondayMs = this.getMondayTimestamp();

    if (!group.lastWeeklyReset || group.lastWeeklyReset < currentMondayMs) {
      console.log(`[Auto-Reset Lunes-Domingo] Reiniciando semana de actividad para el grupo: ${groupId}`);
      group.activity = {};
      group.lastWeeklyReset = currentMondayMs;
      this.save();
    }
  }

  getWeeklyResetDateRange(groupId) {
    this.checkWeeklyReset(groupId);
    const group = this.getGroup(groupId);
    const monday = new Date(group.lastWeeklyReset || this.getMondayTimestamp());
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    const formatOpts = { day: '2-digit', month: '2-digit' };
    const mStr = monday.toLocaleDateString('es-CL', formatOpts);
    const sStr = sunday.toLocaleDateString('es-CL', formatOpts);

    return `Lunes ${mStr} al Domingo ${sStr}`;
  }

  trackActivity(groupId, userId, rawSender = null) {
    const group = this.getGroup(groupId);
    if (!group.activity) group.activity = {};
    
    // Auto-reinicio si cambiamos de semana de calendario (Lunes 00:00)
    this.checkWeeklyReset(groupId);

    const keysToUpdate = [userId, rawSender].filter(Boolean);
    for (const key of keysToUpdate) {
      if (!group.activity[key]) {
        group.activity[key] = { count: 0, lastSeen: 0 };
      }
      group.activity[key].count += 1;
      group.activity[key].lastSeen = Date.now();
    }
    this.save();
  }

  getGroupActivity(groupId, participantsJids = []) {
    this.checkWeeklyReset(groupId);
    const group = this.getGroup(groupId);
    const activityMap = group.activity || {};

    const cleanNum = (id) => {
      if (!id) return '';
      return id.split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
    };

    // Mapear participantes agrupando por numero limpio, LID y JID
    const list = participantsJids.map(jid => {
      let count = 0;
      let lastSeen = 0;
      const pNum = cleanNum(jid);

      for (const key of Object.keys(activityMap)) {
        const keyNum = cleanNum(key);
        if (key === jid || (pNum && keyNum && (pNum === keyNum || pNum.endsWith(keyNum) || keyNum.endsWith(pNum)))) {
          count += (activityMap[key].count || 0);
          if ((activityMap[key].lastSeen || 0) > lastSeen) {
            lastSeen = activityMap[key].lastSeen;
          }
        }
      }

      return {
        id: jid,
        count,
        lastSeen
      };
    });

    return list;
  }

  getTopActive(groupId, participantsJids = [], limit = 10) {
    const list = this.getGroupActivity(groupId, participantsJids);
    list.sort((a, b) => b.count - a.count);
    return list.slice(0, limit);
  }

  getTopInactive(groupId, participantsJids = [], limit = 10) {
    const list = this.getGroupActivity(groupId, participantsJids);
    list.sort((a, b) => a.count - b.count);
    return list.slice(0, limit);
  }

  getUserActivity(groupId, userId) {
    this.checkWeeklyReset(groupId);
    const group = this.getGroup(groupId);
    const activityMap = group.activity || {};
    return activityMap[userId] || { count: 0, lastSeen: 0 };
  }

  resetGroupActivity(groupId) {
    const group = this.getGroup(groupId);
    group.activity = {};
    group.lastWeeklyReset = Date.now();
    this.save();
  }

  // --- VOTACIONES & ENCUESTAS DE EVENTO ---
  createPoll(groupId, pollId, title, options, pollMessage = null) {
    const group = this.getGroup(groupId);
    if (pollMessage) {
      activePollMessagesMap.set(pollId, pollMessage);
    }
    group.poll = {
      id: pollId,
      title,
      options,
      pollMessage: pollMessage || null,
      pollUpdates: [],
      votesSummary: options.map(opt => ({ name: opt, voters: [] })),
      createdAt: Date.now()
    };
    this.save();
    return group.poll;
  }

  addPollUpdate(groupId, update) {
    const group = this.getGroup(groupId);
    if (!group.poll) return false;

    if (!group.poll.pollUpdates) group.poll.pollUpdates = [];

    const newSenderJid = update.pollUpdateMessageKey?.participant || update.key?.participant || update.participant;
    const newCleanSender = normalizarId(newSenderJid);

    // Reemplazar voto previo del mismo usuario para evitar acumulacion de parches viejos
    const filteredUpdates = group.poll.pollUpdates.filter(u => {
      const existingSenderJid = u.pollUpdateMessageKey?.participant || u.key?.participant || u.participant;
      const existingClean = normalizarId(existingSenderJid);
      return existingClean !== newCleanSender;
    });

    filteredUpdates.push(update);
    group.poll.pollUpdates = filteredUpdates;
    this.save();
    return true;
  }

  updatePollVotesSummary(groupId, votesSummary) {
    const group = this.getGroup(groupId);
    if (!group.poll) return false;

    // Normalizar todos los JIDs de votantes eliminando sufijos de dispositivo (:xx)
    const cleanSummary = (votesSummary || []).map(opt => ({
      name: opt.name,
      voters: (opt.voters || []).map(normalizarId).filter((v, idx, self) => self.indexOf(v) === idx)
    }));

    group.poll.votesSummary = cleanSummary;
    this.save();
    return true;
  }

  getActivePoll(groupId = null) {
    let poll = null;
    let sourceGroupId = null;

    if (groupId && this.data.groups[groupId] && this.data.groups[groupId].poll) {
      poll = this.data.groups[groupId].poll;
      sourceGroupId = groupId;
    } else {
      for (const gId of Object.keys(this.data.groups)) {
        if (this.data.groups[gId].poll) {
          poll = this.data.groups[gId].poll;
          sourceGroupId = gId;
          break;
        }
      }
    }

    if (!poll) return null;

    // Recuperar pollMessage original de la memoria RAM o rehidratar de la base de datos
    let liveMessage = activePollMessagesMap.get(poll.id);
    if (!liveMessage && poll.pollMessage) {
      liveMessage = rehydrateBuffers(JSON.parse(JSON.stringify(poll.pollMessage)));
      activePollMessagesMap.set(poll.id, liveMessage);
    }

    return {
      ...poll,
      sourceGroupId,
      pollMessage: liveMessage || poll.pollMessage
    };
  }

  closePoll(groupId) {
    const group = this.getGroup(groupId);
    const lastPoll = group.poll;
    group.poll = null;
    this.save();
    return lastPoll;
  }
}

module.exports = new DatabaseManager();
