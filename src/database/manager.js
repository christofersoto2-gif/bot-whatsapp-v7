const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');

const DB_PATH = path.join(__dirname, '../../database.json');

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
        this.data = fs.readJsonSync(DB_PATH);
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
      fs.writeJsonSync(DB_PATH, this.data, { spaces: 2 });
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
    const group = this.getGroup(groupId);
    group.groupType = groupType;
    this.save();
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

  // --- ACTIVIDAD DE GRUPO Y CLAN ---
  trackActivity(groupId, userId) {
    const group = this.getGroup(groupId);
    if (!group.activity) group.activity = {};
    if (!group.activity[userId]) {
      group.activity[userId] = { count: 0, lastSeen: 0 };
    }
    group.activity[userId].count += 1;
    group.activity[userId].lastSeen = Date.now();
    this.save();
  }

  getGroupActivity(groupId, participantsJids = []) {
    const group = this.getGroup(groupId);
    const activityMap = group.activity || {};

    // Asegurar que todos los participantes del grupo estén mapeados
    const list = participantsJids.map(jid => {
      const act = activityMap[jid] || { count: 0, lastSeen: 0 };
      return {
        id: jid,
        count: act.count,
        lastSeen: act.lastSeen
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
    const group = this.getGroup(groupId);
    const activityMap = group.activity || {};
    return activityMap[userId] || { count: 0, lastSeen: 0 };
  }

  resetGroupActivity(groupId) {
    const group = this.getGroup(groupId);
    group.activity = {};
    this.save();
  }

  resetVS(groupId) {
    const group = this.getGroup(groupId);
    group.vs = null;
    this.save();
  }
}

module.exports = new DatabaseManager();
