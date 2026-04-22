'use strict';

const { freshDeck } = require('./deck');
const { determineWinners } = require('./hand-evaluator');

const PHASES = ['waiting', 'preflop', 'flop', 'turn', 'river', 'showdown'];
const TURN_TIMEOUT = 30000;

class PokerRoom {
  constructor(id, name, hostUsername, smallBlind = 5, maxPlayers = 6) {
    this.id = id;
    this.name = name;
    this.hostUsername = hostUsername;
    this.smallBlind = smallBlind;
    this.bigBlind = smallBlind * 2;
    this.maxPlayers = maxPlayers;
    this.players = []; // { id, username, chips, holeCards, bet, folded, allIn, sitOut, connected }
    this.spectators = [];
    this.phase = 'waiting';
    this.deck = [];
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.currentBet = 0;
    this.dealerIndex = -1;
    this.currentPlayerIndex = -1;
    this.handLog = [];
    this.turnTimer = null;
    this.chat = [];
    this.lastAction = null;
  }

  // ─── Player Management ────────────────────────────────────────────────────

  canJoin(socketId) {
    if (this.players.length >= this.maxPlayers) return { ok: false, reason: 'Table is full' };
    if (this.phase !== 'waiting' && this.phase !== 'preflop') return { ok: false, reason: 'Game in progress — spectate only' };
    if (this.players.find(p => p.id === socketId)) return { ok: false, reason: 'Already seated' };
    return { ok: true };
  }

  addPlayer(socketId, username, chips) {
    this.players.push({
      id: socketId, username, chips,
      holeCards: [], bet: 0, folded: false, allIn: false, sitOut: false, connected: true
    });
    this.log(`${username} joined the table`);
  }

  removePlayer(socketId) {
    const idx = this.players.findIndex(p => p.id === socketId);
    if (idx === -1) return null;
    const [player] = this.players.splice(idx, 1);
    this.log(`${player.username} left the table`);
    // Adjust indices
    if (this.dealerIndex >= this.players.length) this.dealerIndex = 0;
    if (this.currentPlayerIndex >= this.players.length) this.currentPlayerIndex = 0;
    return player;
  }

  setConnected(socketId, connected) {
    const p = this.players.find(p => p.id === socketId);
    if (p) p.connected = connected;
  }

  reconnect(socketId, newSocketId) {
    const p = this.players.find(p => p.id === socketId);
    if (p) { p.id = newSocketId; p.connected = true; }
  }

  addSpectator(socketId, username) {
    if (!this.spectators.find(s => s.id === socketId)) {
      this.spectators.push({ id: socketId, username });
    }
  }

  removeSpectator(socketId) {
    this.spectators = this.spectators.filter(s => s.id !== socketId);
  }

  // ─── Game Flow ────────────────────────────────────────────────────────────

  canStart() {
    return this.players.filter(p => !p.sitOut).length >= 2;
  }

  startHand() {
    if (!this.canStart()) return false;

    // Reset hand state
    this.deck = freshDeck();
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.currentBet = 0;
    this.handLog = [];
    this.lastAction = null;

    const active = this.players.filter(p => !p.sitOut && p.chips > 0);
    for (const p of active) {
      p.holeCards = [];
      p.bet = 0;
      p.folded = false;
      p.allIn = false;
    }

    // Advance dealer
    this.dealerIndex = (this.dealerIndex + 1) % active.length;
    // Map back to full players array
    this.dealerIndex = this.players.indexOf(active[this.dealerIndex % active.length]);

    // Deal hole cards
    const activePlayers = this.activePlayers();
    for (const p of activePlayers) {
      p.holeCards = [this.deck.pop(), this.deck.pop()];
    }

    // Post blinds
    const sbIdx = this.nextActiveFrom(this.dealerIndex, 1);
    const bbIdx = this.nextActiveFrom(this.dealerIndex, 2);
    this.forceBet(sbIdx, this.smallBlind, 'small blind');
    this.forceBet(bbIdx, this.bigBlind, 'big blind');
    this.currentBet = this.bigBlind;

    // First to act preflop: player after BB
    this.currentPlayerIndex = this.nextActiveFrom(bbIdx, 1);
    this.phase = 'preflop';
    this.log(`New hand started. Dealer: ${this.players[this.dealerIndex]?.username}`);
    this.startTurnTimer();
    return true;
  }

  forceBet(playerIndex, amount, label) {
    const p = this.players[playerIndex];
    if (!p) return;
    const actual = Math.min(amount, p.chips);
    p.chips -= actual;
    p.bet += actual;
    this.pot += actual;
    if (p.chips === 0) p.allIn = true;
    this.log(`${p.username} posts ${label} (${actual})`);
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  handleAction(socketId, action, amount = 0) {
    const playerIndex = this.players.findIndex(p => p.id === socketId);
    if (playerIndex !== this.currentPlayerIndex) return { error: 'Not your turn' };
    const player = this.players[playerIndex];
    if (player.folded || player.allIn) return { error: 'Cannot act' };

    this.clearTurnTimer();

    switch (action) {
      case 'fold':
        player.folded = true;
        this.log(`${player.username} folds`);
        break;

      case 'check':
        if (player.bet < this.currentBet) return { error: 'Cannot check, must call or raise' };
        this.log(`${player.username} checks`);
        break;

      case 'call': {
        const toCall = Math.min(this.currentBet - player.bet, player.chips);
        player.chips -= toCall;
        player.bet += toCall;
        this.pot += toCall;
        if (player.chips === 0) player.allIn = true;
        this.log(`${player.username} calls ${toCall}`);
        break;
      }

      case 'raise': {
        const minRaise = this.currentBet * 2;
        const raiseAmount = Math.max(amount, minRaise);
        const toAdd = Math.min(raiseAmount - player.bet, player.chips);
        player.chips -= toAdd;
        player.bet += toAdd;
        this.pot += toAdd;
        this.currentBet = player.bet;
        if (player.chips === 0) player.allIn = true;
        this.log(`${player.username} raises to ${player.bet}`);
        break;
      }

      default:
        return { error: 'Unknown action' };
    }

    this.lastAction = { username: player.username, action, amount };

    // Check if only one active player remains
    const nonFolded = this.activePlayers().filter(p => !p.folded);
    if (nonFolded.length === 1) {
      return this.endHand();
    }

    // Advance turn
    if (this.isBettingComplete()) {
      return this.advancePhase();
    }

    this.currentPlayerIndex = this.nextActiveFrom(this.currentPlayerIndex, 1, true);
    this.startTurnTimer();
    return { ok: true };
  }

  isBettingComplete() {
    const active = this.activePlayers().filter(p => !p.folded && !p.allIn);
    return active.every(p => p.bet === this.currentBet || p.chips === 0);
  }

  advancePhase() {
    // Reset bets for next round
    for (const p of this.players) p.bet = 0;
    this.currentBet = 0;

    const phases = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const idx = phases.indexOf(this.phase);
    this.phase = phases[idx + 1] || 'showdown';

    if (this.phase === 'flop') {
      this.communityCards.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
    } else if (this.phase === 'turn') {
      this.communityCards.push(this.deck.pop());
    } else if (this.phase === 'river') {
      this.communityCards.push(this.deck.pop());
    } else if (this.phase === 'showdown') {
      return this.endHand();
    }

    this.log(`--- ${this.phase.toUpperCase()} ---`);
    // First to act post-flop: first active player after dealer
    this.currentPlayerIndex = this.nextActiveFrom(this.dealerIndex, 1, true);
    this.startTurnTimer();
    return { ok: true, phase: this.phase };
  }

  endHand() {
    this.clearTurnTimer();
    const nonFolded = this.activePlayers().filter(p => !p.folded);
    let winners = [];
    let results = [];

    if (nonFolded.length === 1) {
      // Everyone else folded
      nonFolded[0].chips += this.pot;
      winners = [{ ...nonFolded[0], winAmount: this.pot }];
      this.log(`${nonFolded[0].username} wins ${this.pot} (everyone else folded)`);
    } else {
      const { winners: w, results: r } = determineWinners(nonFolded, this.communityCards);
      results = r;
      const share = Math.floor(this.pot / w.length);
      const remainder = this.pot - share * w.length;
      w.forEach((winner, i) => {
        const amount = share + (i === 0 ? remainder : 0);
        const p = this.players.find(pl => pl.id === winner.id);
        if (p) p.chips += amount;
        winners.push({ ...winner, winAmount: amount, handName: winner.best?.name });
        this.log(`${winner.username} wins ${amount} with ${winner.best?.name}`);
      });
    }

    this.phase = 'showdown';
    return { ok: true, phase: 'showdown', winners, results, pot: this.pot };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  activePlayers() {
    return this.players.filter(p => !p.sitOut && p.chips > 0 || !p.folded);
  }

  nextActiveFrom(fromIndex, steps = 1, skipFolded = false) {
    let idx = fromIndex;
    let found = 0;
    for (let i = 0; i < this.players.length * 2; i++) {
      idx = (idx + 1) % this.players.length;
      const p = this.players[idx];
      if (p && !p.sitOut && (!skipFolded || !p.folded) && !p.allIn) {
        found++;
        if (found === steps) return idx;
      }
    }
    return fromIndex;
  }

  startTurnTimer() {
    this.clearTurnTimer();
    this.turnTimerStart = Date.now();
    this.turnTimer = setTimeout(() => {
      const p = this.players[this.currentPlayerIndex];
      if (p) this.handleAction(p.id, 'fold');
    }, TURN_TIMEOUT);
  }

  clearTurnTimer() {
    if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null; }
    this.turnTimerStart = null;
  }

  timeRemaining() {
    if (!this.turnTimerStart) return TURN_TIMEOUT;
    return Math.max(0, TURN_TIMEOUT - (Date.now() - this.turnTimerStart));
  }

  log(msg) {
    this.handLog.push({ time: Date.now(), msg });
  }

  addChat(username, message) {
    const entry = { username, message, time: Date.now() };
    this.chat.push(entry);
    if (this.chat.length > 100) this.chat.shift();
    return entry;
  }

  // Safe state to broadcast (hide other players' hole cards)
  publicState(forSocketId = null) {
    return {
      id: this.id,
      name: this.name,
      hostUsername: this.hostUsername,
      phase: this.phase,
      communityCards: this.communityCards,
      pot: this.pot,
      currentBet: this.currentBet,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      dealerIndex: this.dealerIndex,
      currentPlayerIndex: this.currentPlayerIndex,
      timeRemaining: this.timeRemaining(),
      handLog: this.handLog.slice(-20),
      lastAction: this.lastAction,
      players: this.players.map((p, i) => ({
        id: p.id,
        username: p.username,
        chips: p.chips,
        bet: p.bet,
        folded: p.folded,
        allIn: p.allIn,
        sitOut: p.sitOut,
        connected: p.connected,
        cardCount: p.holeCards.length,
        // Only reveal hole cards to the owning player, or at showdown
        holeCards: (p.id === forSocketId || this.phase === 'showdown') ? p.holeCards : null,
        isDealer: i === this.dealerIndex,
        isCurrentPlayer: i === this.currentPlayerIndex,
      })),
    };
  }

  lobbyInfo() {
    return {
      id: this.id,
      name: this.name,
      hostUsername: this.hostUsername,
      playerCount: this.players.length,
      maxPlayers: this.maxPlayers,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      phase: this.phase,
      status: this.phase === 'waiting' ? 'Waiting' : 'In Progress',
    };
  }
}

module.exports = PokerRoom;
