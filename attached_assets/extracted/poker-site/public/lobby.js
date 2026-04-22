'use strict';

let socket = null;
let currentUser = null;

// ─── Utils ────────────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function api(path, body) {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json());
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const which = tab.dataset.tab;
    document.getElementById('login-form').style.display = which === 'login' ? 'flex' : 'none';
    document.getElementById('register-form').style.display = which === 'register' ? 'flex' : 'none';
  });
});

document.getElementById('login-btn').addEventListener('click', async () => {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  const res = await api('/api/login', { username, password });
  if (res.error) { errEl.textContent = res.error; errEl.style.display = 'block'; return; }
  currentUser = res.user;
  enterLobby();
});

document.getElementById('register-btn').addEventListener('click', async () => {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl = document.getElementById('reg-error');
  errEl.style.display = 'none';
  const res = await api('/api/register', { username, password });
  if (res.error) { errEl.textContent = res.error; errEl.style.display = 'block'; return; }
  currentUser = res.user;
  enterLobby();
});

// Enter on input
['login-username','login-password'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-btn').click();
  });
});
['reg-username','reg-password'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('register-btn').click();
  });
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('/api/logout', {});
  location.reload();
});

// ─── Lobby Init ───────────────────────────────────────────────────────────────
async function enterLobby() {
  document.getElementById('auth-page').style.display = 'none';
  document.getElementById('lobby-page').style.display = 'block';
  document.getElementById('header-username').textContent = currentUser.username;
  document.getElementById('header-chips').textContent = currentUser.chips.toLocaleString();

  connectSocket();
  loadLeaderboard();
}

function connectSocket() {
  socket = io();

  socket.on('auth:required', () => {
    document.getElementById('lobby-page').style.display = 'none';
    document.getElementById('auth-page').style.display = 'flex';
  });

  socket.on('lobby:update', renderRooms);

  socket.on('chat:global', msgs => {
    const el = document.getElementById('global-chat-messages');
    el.innerHTML = '';
    msgs.forEach(m => appendGlobalChat(m));
  });

  socket.on('chat:global:new', m => appendGlobalChat(m));

  socket.on('room:joined', ({ roomId }) => {
    sessionStorage.setItem('roomId', roomId);
    window.location.href = '/game.html';
  });

  socket.on('room:spectating', ({ roomId }) => {
    sessionStorage.setItem('roomId', roomId);
    sessionStorage.setItem('spectating', '1');
    window.location.href = '/game.html';
  });

  socket.on('chips:updated', ({ chips }) => {
    document.getElementById('header-chips').textContent = chips.toLocaleString();
    currentUser.chips = chips;
  });

  socket.on('error', msg => toast(msg, 'error'));
}

// ─── Rooms ────────────────────────────────────────────────────────────────────
function renderRooms(rooms) {
  const el = document.getElementById('rooms-list');
  document.getElementById('lobby-room-count').textContent = `${rooms.length} table${rooms.length !== 1 ? 's' : ''} open`;

  if (rooms.length === 0) {
    el.innerHTML = '<div class="empty-rooms"><p>🃏 No tables yet — create one above!</p></div>';
    return;
  }

  el.innerHTML = rooms.map(r => `
    <div class="room-card" onclick="joinRoom('${r.id}')">
      <div class="room-info">
        <h3>${escHtml(r.name)}</h3>
        <div class="room-meta">
          <span>👤 Host: ${escHtml(r.hostUsername)}</span>
          <span>🪑 ${r.playerCount}/${r.maxPlayers} players</span>
          <span>💰 ${r.smallBlind}/${r.bigBlind} blinds</span>
        </div>
      </div>
      <span class="room-status ${r.status === 'Waiting' ? 'waiting' : 'inprogress'}">${r.status}</span>
    </div>
  `).join('');
}

function joinRoom(roomId) {
  if (!socket) return;
  socket.emit('room:join', { roomId });
}

document.getElementById('create-room-btn').addEventListener('click', () => {
  const name = document.getElementById('room-name').value.trim() || `${currentUser.username}'s Table`;
  const smallBlind = document.getElementById('room-blind').value;
  const maxPlayers = document.getElementById('room-maxplayers').value;
  socket.emit('room:create', { name, smallBlind, maxPlayers });
});

document.getElementById('quick-join-btn').addEventListener('click', () => {
  const cards = document.querySelectorAll('.room-card');
  if (cards.length === 0) { toast('No open tables to join!'); return; }
  cards[0].click();
});

// ─── Chips ────────────────────────────────────────────────────────────────────
document.getElementById('add-chips-btn').addEventListener('click', () => {
  document.getElementById('add-chips-modal').classList.add('show');
});
document.getElementById('close-chips-modal').addEventListener('click', () => {
  document.getElementById('add-chips-modal').classList.remove('show');
});

document.querySelectorAll('.chip-amount-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const amount = Number(btn.dataset.amount);
    const res = await api('/api/addchips', { amount });
    if (res.error) { toast(res.error, 'error'); return; }
    document.getElementById('header-chips').textContent = res.chips.toLocaleString();
    document.getElementById('add-chips-modal').classList.remove('show');
    toast(`+${amount} chips added! 🎰`, 'win');
  });
});

// ─── Chat ─────────────────────────────────────────────────────────────────────
function appendGlobalChat(m) {
  const el = document.getElementById('global-chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<span class="chat-user">${escHtml(m.username)}:</span>${escHtml(m.message)}`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

document.getElementById('global-chat-send').addEventListener('click', sendGlobalChat);
document.getElementById('global-chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendGlobalChat();
});
function sendGlobalChat() {
  const input = document.getElementById('global-chat-input');
  const msg = input.value.trim();
  if (!msg || !socket) return;
  socket.emit('chat:send', { message: msg, scope: 'global' });
  input.value = '';
}

// ─── Sidebar Tabs ─────────────────────────────────────────────────────────────
document.querySelectorAll('[data-stab]').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-stab]').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.sidebar-content').forEach(c => {
      c.style.display = 'none';
      c.classList.remove('active');
    });
    const target = document.getElementById(`stab-${tab.dataset.stab}`);
    if (target) { target.style.display = 'flex'; target.classList.add('active'); }
    if (tab.dataset.stab === 'leaderboard') loadLeaderboard();
  });
});

async function loadLeaderboard() {
  const data = await fetch('/api/leaderboard').then(r => r.json());
  const el = document.getElementById('leaderboard-list');
  const medals = ['gold','silver','bronze'];
  el.innerHTML = data.map((u, i) => `
    <div class="lb-row">
      <div class="lb-rank ${medals[i] || ''}">${i + 1}</div>
      <div class="lb-name">${escHtml(u.username)}</div>
      <div class="lb-chips">🪙 ${u.chips.toLocaleString()}</div>
    </div>
  `).join('');
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Auto login if session exists ────────────────────────────────────────────
(async () => {
  const res = await fetch('/api/me').then(r => r.json());
  if (res.username) {
    currentUser = res;
    enterLobby();
  }
})();
