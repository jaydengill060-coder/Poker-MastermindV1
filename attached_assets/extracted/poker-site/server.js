'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const db = require('./db/database');
const PokerRoom = require('./game/poker-room');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'poker-secret-change-me-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

io.use((socket, next) => { sessionMiddleware(socket.request, {}, next); });

// ── State ──────────────────────────────────────────────────────────────────────
const rooms = new Map();
const socketToUser = new Map();
const globalChat = [];

function broadcastLobby() {
  io.emit('lobby:update', [...rooms.values()].map(r => r.lobbyInfo()));
}

function broadcastRoom(room, event = 'game:state') {
  for (const player of room.players) {
    const s = io.sockets.sockets.get(player.id);
    if (s) s.emit(event, room.publicState(player.id));
  }
  for (const spec of room.spectators) {
    const s = io.sockets.sockets.get(spec.id);
    if (s) s.emit(event, room.publicState(null));
  }
}

function tryStartHand(room) {
  const delay = room.phase === 'showdown' ? 4500 : 1500;
  setTimeout(() => {
    if (room.canStart()) {
      room.phase = 'waiting';
      if (room.startHand()) {
        broadcastRoom(room);
        broadcastLobby();
      }
    }
  }, delay);
}

// ── REST ───────────────────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ error: 'Username and password required' });
  if (username.length < 2 || username.length > 20) return res.json({ error: 'Username must be 2–20 characters' });
  if (password.length < 4) return res.json({ error: 'Password must be at least 4 characters' });
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.json({ error: 'Letters, numbers, underscores only' });

  if (await db.getUser(username)) return res.json({ error: 'Username already taken' });

  const hash = await bcrypt.hash(password, 10);
  try {
    await db.createUser(username, hash);
  } catch (e) {
    return res.json({ error: 'Username already taken' });
  }
  const user = await db.getUser(username);
  req.session.username = user.username;
  res.json({ ok: true, user: { username: user.username, chips: user.chips } });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await db.getUser(username);
  if (!user) return res.json({ error: 'Invalid username or password' });
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.json({ error: 'Invalid username or password' });
  req.session.username = user.username;
  res.json({ ok: true, user: { username: user.username, chips: user.chips } });
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });

app.get('/api/me', async (req, res) => {
  if (!req.session.username) return res.json({ error: 'Not logged in' });
  const user = await db.getUser(req.session.username);
  if (!user) return res.json({ error: 'User not found' });
  res.json({ username: user.username, chips: user.chips, games_played: user.games_played, hands_won: user.hands_won });
});

app.post('/api/addchips', async (req, res) => {
  if (!req.session.username) return res.json({ error: 'Not logged in' });
  const { amount } = req.body;
  if (![100, 500, 1000].includes(Number(amount))) return res.json({ error: 'Invalid amount' });
  await db.addChips(req.session.username, Number(amount));
  const user = await db.getUser(req.session.username);
  res.json({ ok: true, chips: user.chips });
});

app.get('/api/leaderboard', async (req, res) => { res.json(await db.getLeaderboard()); });

// ── Socket.IO ──────────────────────────────────────────────────────────────────
io.on('connection', async (socket) => {
  const username = socket.request.session?.username;
  if (!username) { socket.emit('auth:required'); return; }

  socketToUser.set(socket.id, { username, roomId: null });
  socket.emit('lobby:update', [...rooms.values()].map(r => r.lobbyInfo()));
  socket.emit('chat:global', globalChat.slice(-50));

  // ── Lobby events ──

  socket.on('room:create', async ({ name, smallBlind, maxPlayers }) => {
    const user = await db.getUser(username);
    if (!user) return;
    const id = uuidv4().slice(0, 8);
    const room = new PokerRoom(id, name || `${username}'s Table`, username, Number(smallBlind) || 5, Math.min(6, Math.max(2, Number(maxPlayers) || 6)));
    rooms.set(id, room);
    room.addPlayer(socket.id, username, user.chips);
    socketToUser.get(socket.id).roomId = id;
    socket.join(`room:${id}`);
    socket.emit('room:joined', { roomId: id });
    broadcastRoom(room);
    broadcastLobby();
  });

  socket.on('room:join', async ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) { socket.emit('error', 'Room not found'); return; }

    const user = await db.getUser(username);
    if (!user) return;

    // Already in this room (reconnect scenario)
    const existingSeat = room.players.find(p => p.username === username);
    if (existingSeat && !existingSeat.connected) {
      existingSeat.id = socket.id;
      existingSeat.connected = true;
      socketToUser.get(socket.id).roomId = roomId;
      socket.join(`room:${roomId}`);
      socket.emit('room:joined', { roomId });
      broadcastRoom(room);
      return;
    }

    const check = room.canJoin(socket.id);
    if (!check.ok) {
      room.addSpectator(socket.id, username);
      socketToUser.get(socket.id).roomId = roomId;
      socket.join(`room:${roomId}`);
      socket.emit('room:spectating', { roomId });
      socket.emit('game:state', room.publicState(null));
      return;
    }

    room.addPlayer(socket.id, username, user.chips);
    socketToUser.get(socket.id).roomId = roomId;
    socket.join(`room:${roomId}`);
    socket.emit('room:joined', { roomId });
    broadcastRoom(room);
    broadcastLobby();
    tryStartHand(room);
  });

  socket.on('room:leave', () => leaveCurrentRoom(socket));

  socket.on('room:sitout', ({ sitOut }) => {
    const { roomId } = socketToUser.get(socket.id) || {};
    const room = rooms.get(roomId);
    if (!room) return;
    const p = room.players.find(p => p.id === socket.id);
    if (p) p.sitOut = !!sitOut;
    broadcastRoom(room);
  });

  socket.on('room:addchips', async ({ amount }) => {
    if (![100, 500, 1000].includes(Number(amount))) return;
    await db.addChips(username, Number(amount));
    const { roomId } = socketToUser.get(socket.id) || {};
    const room = rooms.get(roomId);
    if (room) {
      const p = room.players.find(p => p.id === socket.id);
      if (p) p.chips += Number(amount);
      broadcastRoom(room);
    }
    const user = await db.getUser(username);
    socket.emit('chips:updated', { chips: user.chips });
  });

  // ── Game events ──

  socket.on('game:action', async ({ action, amount }) => {
    const { roomId } = socketToUser.get(socket.id) || {};
    const room = rooms.get(roomId);
    if (!room) return;

    const result = room.handleAction(socket.id, action, Number(amount) || 0);
    if (result?.error) { socket.emit('error', result.error); return; }

    // Persist chips
    for (const p of room.players) await db.updateChips(p.username, p.chips);

    if (result?.phase === 'showdown') {
      for (const w of result.winners || []) {
        await db.recordWin(w.username);
        await db.insertHistory(room.name, w.username, result.pot, w.handName || 'unknown');
      }
      for (const p of room.players) await db.recordGame(p.username);
      broadcastRoom(room, 'game:showdown');
      broadcastLobby();
      tryStartHand(room);
    } else {
      broadcastRoom(room);
    }
  });

  // ── Chat ──

  socket.on('chat:send', ({ message, scope }) => {
    if (!message?.trim()) return;
    const msg = message.trim().slice(0, 200);
    if (scope === 'room') {
      const { roomId } = socketToUser.get(socket.id) || {};
      const room = rooms.get(roomId);
      if (!room) return;
      const entry = room.addChat(username, msg);
      io.to(`room:${roomId}`).emit('chat:room', entry);
    } else {
      const entry = { username, message: msg, time: Date.now() };
      globalChat.push(entry);
      if (globalChat.length > 200) globalChat.shift();
      io.emit('chat:global:new', entry);
    }
  });

  // ── Disconnect ──

  socket.on('disconnect', async () => {
    const { roomId } = socketToUser.get(socket.id) || {};
    const room = rooms.get(roomId);
    if (room) {
      room.setConnected(socket.id, false);
      broadcastRoom(room);
      setTimeout(async () => {
        const s = io.sockets.sockets.get(socket.id);
        if (!s) {
          const removed = room.removePlayer(socket.id);
          if (removed) await db.updateChips(removed.username, removed.chips);
          room.removeSpectator(socket.id);
          if (room.players.length === 0) rooms.delete(roomId);
          else tryStartHand(room);
          broadcastLobby();
        }
      }, 60000);
    }
    socketToUser.delete(socket.id);
  });

  function leaveCurrentRoom(socket) {
    const userData = socketToUser.get(socket.id);
    if (!userData?.roomId) return;
    const room = rooms.get(userData.roomId);
    if (!room) return;
    const removed = room.removePlayer(socket.id);
    if (removed) db.updateChips(removed.username, removed.chips);
    room.removeSpectator(socket.id);
    socket.leave(`room:${userData.roomId}`);
    userData.roomId = null;
    if (room.players.length === 0) rooms.delete(room.id);
    else { broadcastRoom(room); tryStartHand(room); }
    broadcastLobby();
  }
});

server.listen(PORT, () => console.log(`\n🃏 Ace Up Poker running → http://localhost:${PORT}\n`));
