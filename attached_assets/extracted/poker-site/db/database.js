'use strict';

const Datastore = require('nedb-promises');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const users = Datastore.create({ filename: path.join(dataDir, 'users.db'), autoload: true });
const history = Datastore.create({ filename: path.join(dataDir, 'history.db'), autoload: true });

users.ensureIndex({ fieldName: 'username', unique: true });

module.exports = {
  async getUser(username) {
    return users.findOne({ username });
  },
  async createUser(username, hash) {
    return users.insert({ username, password_hash: hash, chips: 1000, games_played: 0, hands_won: 0, created_at: new Date() });
  },
  async updateChips(username, chips) {
    return users.update({ username }, { $set: { chips } });
  },
  async addChips(username, amount) {
    return users.update({ username }, { $inc: { chips: amount } });
  },
  async recordWin(username) {
    return users.update({ username }, { $inc: { hands_won: 1 } });
  },
  async recordGame(username) {
    return users.update({ username }, { $inc: { games_played: 1 } });
  },
  async insertHistory(roomName, winner, pot, handType) {
    return history.insert({ room_name: roomName, winner_username: winner, pot_size: pot, hand_type: handType, played_at: new Date() });
  },
  async getLeaderboard() {
    const all = await users.find({}).sort({ chips: -1 }).limit(10);
    return all.map(u => ({ username: u.username, chips: u.chips, hands_won: u.hands_won, games_played: u.games_played }));
  },
};
