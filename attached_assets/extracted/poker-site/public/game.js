'use strict';

const roomId = sessionStorage.getItem('roomId');
const isSpectating = sessionStorage.getItem('spectating') === '1';
if (!roomId) { window.location.href = '/'; }

let socket;
let myUsername = null;
let gameState = null;
let timerInterval = null;
let sitOut = false;

const SUIT_SYMBOL = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };

// ─── Utils ────────────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function makeCard(card, small = false) {
  if (!card) {
    return `<div class="playing-card face-down ${small ? 'small' : ''}"></div>`;
  }
  const suitClass = card.suit;
  const sym = SUIT_SYMBOL[card.suit] || '?';
  return `<div class="playing-card ${suitClass} ${small ? 'small' : ''}">
    <div class="card-rank">${card.rank}</div>
    <div class="card-suit">${sym}</div>
  </div>`;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
(async () => {
  const res = await fetch('/api/me').then(r => r.json());
  if (res.error) { window.location.href = '/'; return; }
  myUsername = res.username;
  connect();
})();

function connect() {
  socket = io();

  socket.on('connect', () => {
    if (isSpectating) {
      socket.emit('room:join', { roomId }); // re-announce as spectator
    } else {
      socket.emit('room:join', { roomId });
    }
  });

  socket.on('auth:required', () => { window.location.href = '/'; });

  socket.on('game:state', handleState);
  socket.on('game:showdown', handleShowdown);

  socket.on('chat:room', m => appendRoomChat(m));

  socket.on('error', msg => toast(msg, 'error'));
}

// ─── State Rendering ──────────────────────────────────────────────────────────
function handleState(state) {
  gameState = state;
  renderState(state);
}

function handleShowdown(state) {
  gameState = state;
  renderState(state);
  showShowdownBanner(state);
}

function renderState(state) {
  // Header
  document.getElementById('room-name-badge').textContent = state.name;
  document.getElementById('pot-amount').textContent = state.pot.toLocaleString();

  const phaseLabels = { waiting: 'Waiting', preflop: 'Pre-Flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };
  document.getElementById('phase-badge').textContent = phaseLabels[state.phase] || state.phase;

  // Waiting overlay
  const overlay = document.getElementById('waiting-overlay');
  overlay.className = 'waiting-overlay' + (state.phase !== 'waiting' ? ' hidden' : '');

  // Spectator
  if (isSpectating) document.getElementById('spectator-badge').style.display = '';

  // My chips
  const me = state.players.find(p => p.username === myUsername);
  if (me) {
    document.getElementById('my-chips').textContent = me.chips.toLocaleString();
  }

  // Community cards
  const cc = document.getElementById('community-cards');
  cc.innerHTML = state.communityCards.map(c => makeCard(c)).join('');

  // Seats
  for (let i = 0; i < 6; i++) {
    const seat = document.getElementById(`seat-${i}`);
    const player = state.players[i];
    if (!player) { seat.style.display = 'none'; seat.innerHTML = ''; continue; }
    seat.style.display = 'flex';
    renderSeat(seat, player, state);
  }

  // My hand
  renderMyHand(state);

  // Action buttons
  renderActions(state);

  // Turn timer
  renderTimer(state);

  // Log
  renderLog(state.handLog);

  // Players list
  renderPlayersList(state);
}

function renderSeat(el, player, state) {
  const isActive = player.isCurrentPlayer;
  const avatarEmojis = ['🎰','🃏','🎲','♠','♥','🎯'];
  const emoji = avatarEmojis[state.players.indexOf(player) % avatarEmojis.length];

  let statusHtml = '';
  if (!player.connected) statusHtml = '<div class="player-status" style="background:rgba(128,128,128,0.2);color:#888">disconnected</div>';
  else if (player.folded) statusHtml = '<div class="player-status folded">Folded</div>';
  else if (player.allIn) statusHtml = '<div class="player-status allin">All-In</div>';
  else if (player.sitOut) statusHtml = '<div class="player-status sitout">Sitting Out</div>';
  else if (isActive) statusHtml = '<div class="player-status thinking">Thinking...</div>';

  let classes = 'player-seat seat-' + state.players.indexOf(player);
  if (isActive) classes += ' active';
  if (player.folded) classes += ' folded';

  const holeHtml = player.holeCards
    ? player.holeCards.map(c => makeCard(c, true)).join('')
    : player.cardCount > 0
      ? Array(player.cardCount).fill(makeCard(null, true)).join('')
      : '';

  el.className = classes;
  el.innerHTML = `
    <div class="seat-hole-cards">${holeHtml}</div>
    <div class="player-avatar" style="position:relative">
      ${emoji}
      ${player.isDealer ? '<div class="dealer-badge">D</div>' : ''}
    </div>
    <div class="player-name">${escHtml(player.username)}${player.username === myUsername ? ' (you)' : ''}</div>
    <div class="player-chips-label">🪙 ${player.chips.toLocaleString()}</div>
    ${player.bet > 0 ? `<div class="player-bet-label">Bet: ${player.bet}</div>` : ''}
    ${statusHtml}
  `;
}

function renderMyHand(state) {
  const me = state.players.find(p => p.username === myUsername);
  const handEl = document.getElementById('my-hand-cards');
  const hintEl = document.getElementById('hand-hint');
  const hintName = document.getElementById('hint-name');

  if (!me || !me.holeCards || me.holeCards.length === 0 || isSpectating) {
    handEl.innerHTML = '';
    hintEl.style.display = 'none';
    return;
  }

  handEl.innerHTML = me.holeCards.map(c => makeCard(c)).join('');
  hintEl.style.display = 'block';

  // Quick hand hint (simplified)
  const ranks = me.holeCards.map(c => c.rank);
  const suits = me.holeCards.map(c => c.suit);
  let hint = 'High Card';
  if (ranks[0] === ranks[1]) hint = `Pair of ${ranks[0]}s`;
  else if (suits[0] === suits[1]) hint = 'Suited';
  else if (Math.abs(me.holeCards[0].value - me.holeCards[1].value) === 1) hint = 'Connector';
  hintName.textContent = hint;
}

function renderActions(state) {
  const btns = document.getElementById('action-buttons');
  const indicator = document.getElementById('turn-indicator');

  if (isSpectating) { btns.style.display = 'none'; indicator.textContent = '👁 Spectating'; return; }

  const me = state.players.find(p => p.username === myUsername);
  if (!me || me.folded || me.allIn || state.phase === 'waiting' || state.phase === 'showdown') {
    btns.style.display = 'none';
    if (state.phase === 'waiting') indicator.textContent = 'Waiting for players...';
    else if (state.phase === 'showdown') indicator.textContent = 'Hand over';
    else if (me?.folded) indicator.textContent = 'You folded';
    else if (me?.allIn) indicator.textContent = 'You\'re all-in!';
    else indicator.textContent = '';
    return;
  }

  const isMyTurn = state.players[state.currentPlayerIndex]?.username === myUsername;

  if (!isMyTurn) {
    btns.style.display = 'none';
    const cur = state.players[state.currentPlayerIndex];
    indicator.textContent = cur ? `${cur.username}'s turn` : 'Waiting...';
    return;
  }

  btns.style.display = 'flex';
  indicator.textContent = 'Your turn!';

  const callAmount = state.currentBet - (me.bet || 0);
  const checkBtn = document.getElementById('btn-check');
  if (callAmount <= 0) {
    checkBtn.textContent = 'Check  C';
  } else {
    checkBtn.textContent = `Call ${callAmount}  C`;
  }

  const raiseInput = document.getElementById('raise-amount');
  raiseInput.min = state.currentBet * 2;
  raiseInput.placeholder = `Min ${state.currentBet * 2}`;
  if (!raiseInput.value || Number(raiseInput.value) < state.currentBet * 2) {
    raiseInput.value = state.currentBet * 2 || state.bigBlind * 2;
  }
}

function renderTimer(state) {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  const bar = document.getElementById('timer-bar');
  const isMyTurn = gameState && gameState.players[gameState.currentPlayerIndex]?.username === myUsername;

  if (!isMyTurn || state.phase === 'waiting' || state.phase === 'showdown') {
    bar.style.width = '100%';
    return;
  }

  const total = 30000;
  const start = Date.now();
  const remaining = state.timeRemaining || total;

  timerInterval = setInterval(() => {
    const elapsed = Date.now() - start;
    const left = Math.max(0, remaining - elapsed);
    const pct = (left / total) * 100;
    bar.style.width = pct + '%';
    if (left <= 0) clearInterval(timerInterval);
  }, 100);
}

function renderLog(entries) {
  const el = document.getElementById('gtab-log');
  el.innerHTML = [...entries].reverse().map(e => {
    const isSpecial = e.msg.includes('wins') || e.msg.includes('---');
    return `<div class="log-entry ${isSpecial ? 'highlight' : ''}">${escHtml(e.msg)}</div>`;
  }).join('');
}

function renderPlayersList(state) {
  const el = document.getElementById('players-list');
  el.innerHTML = state.players.map(p => `
    <div class="lb-row">
      <div class="lb-name">${escHtml(p.username)}${p.username === myUsername ? ' (you)' : ''}</div>
      <div class="lb-chips">🪙 ${p.chips.toLocaleString()}</div>
      ${p.folded ? '<span style="font-size:10px;color:#e74c3c">Folded</span>' : ''}
      ${p.allIn ? '<span style="font-size:10px;color:var(--gold)">All-in</span>' : ''}
    </div>
  `).join('');
}

// ─── Showdown Banner ──────────────────────────────────────────────────────────
function showShowdownBanner(state) {
  const banner = document.getElementById('showdown-banner');
  const { winners = [] } = state;
  if (winners.length === 0) return;

  const w = winners[0];
  const isMe = w.username === myUsername;
  document.getElementById('sb-title').textContent = isMe ? '🏆 You Win!' : `🏆 ${w.username} Wins!`;
  document.getElementById('sb-desc').textContent = w.handName ? `with ${w.handName}` : '';
  document.getElementById('sb-chips').textContent = `+${w.winAmount?.toLocaleString()} chips`;

  banner.classList.add('show');
  if (isMe) toast(`You win ${w.winAmount} chips! 🎉`, 'win');
  else toast(`${w.username} wins with ${w.handName || 'best hand'}!`);

  setTimeout(() => banner.classList.remove('show'), 4000);
}

// ─── Action Buttons ───────────────────────────────────────────────────────────
document.getElementById('btn-fold').addEventListener('click', () => act('fold'));
document.getElementById('btn-check').addEventListener('click', () => {
  const state = gameState;
  const me = state?.players.find(p => p.username === myUsername);
  const callAmt = (state?.currentBet || 0) - (me?.bet || 0);
  act(callAmt <= 0 ? 'check' : 'call');
});
document.getElementById('btn-raise').addEventListener('click', () => {
  const amount = Number(document.getElementById('raise-amount').value);
  act('raise', amount);
});

function act(action, amount = 0) {
  socket.emit('game:action', { action, amount });
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const btns = document.getElementById('action-buttons');
  if (btns.style.display === 'none') return;
  if (e.key === 'f' || e.key === 'F') document.getElementById('btn-fold').click();
  if (e.key === 'c' || e.key === 'C') document.getElementById('btn-check').click();
  if (e.key === 'r' || e.key === 'R') document.getElementById('raise-amount').focus();
});

// ─── Leave / Sit Out ─────────────────────────────────────────────────────────
document.getElementById('leave-btn').addEventListener('click', () => {
  socket.emit('room:leave');
  sessionStorage.removeItem('roomId');
  sessionStorage.removeItem('spectating');
  window.location.href = '/';
});

document.getElementById('sitout-btn').addEventListener('click', () => {
  sitOut = !sitOut;
  socket.emit('room:sitout', { sitOut });
  document.getElementById('sitout-btn').textContent = sitOut ? 'Sit In' : 'Sit Out';
  document.getElementById('sitout-btn').style.borderColor = sitOut ? 'var(--gold)' : '';
});

// ─── Add chips in-game ───────────────────────────────────────────────────────
document.getElementById('addchips-game-btn').addEventListener('click', () => {
  document.getElementById('game-chips-modal').classList.add('show');
});
document.getElementById('close-game-chips-modal').addEventListener('click', () => {
  document.getElementById('game-chips-modal').classList.remove('show');
});
document.querySelectorAll('[data-gamt]').forEach(btn => {
  btn.addEventListener('click', () => {
    const amount = Number(btn.dataset.gamt);
    socket.emit('room:addchips', { amount });
    document.getElementById('game-chips-modal').classList.remove('show');
    toast(`+${amount} chips added!`, 'win');
  });
});

// ─── Chat ─────────────────────────────────────────────────────────────────────
function appendRoomChat(m) {
  const el = document.getElementById('room-chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<span class="chat-user">${escHtml(m.username)}:</span>${escHtml(m.message)}`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}
document.getElementById('room-chat-send').addEventListener('click', sendRoomChat);
document.getElementById('room-chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendRoomChat();
});
function sendRoomChat() {
  const input = document.getElementById('room-chat-input');
  const msg = input.value.trim();
  if (!msg || !socket) return;
  socket.emit('chat:send', { message: msg, scope: 'room' });
  input.value = '';
}

// ─── Sidebar Tabs ─────────────────────────────────────────────────────────────
document.querySelectorAll('[data-gtab]').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-gtab]').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.sidebar-content').forEach(c => {
      c.style.display = 'none';
      c.classList.remove('active');
    });
    const target = document.getElementById(`gtab-${tab.dataset.gtab}`);
    if (target) {
      target.style.display = 'flex';
      target.classList.add('active');
    }
  });
});
