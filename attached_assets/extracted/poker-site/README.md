# ♠ Ace Up — Online Poker

A full-stack multiplayer Texas Hold'em poker site for you and your friends.

## Features
- ✅ User registration & login (sessions persist 1 week)
- ✅ Lobby with live room list
- ✅ Create / join / spectate tables
- ✅ Full Texas Hold'em rules (preflop → flop → turn → river → showdown)
- ✅ Proper hand evaluation (all hands from High Card to Royal Flush)
- ✅ Side pot support for all-ins
- ✅ Real-time multiplayer via Socket.IO
- ✅ Turn timer (30s, auto-fold on timeout)
- ✅ In-game & global chat
- ✅ Leaderboard
- ✅ Add free chips at any time
- ✅ Sit Out toggle
- ✅ Spectator mode
- ✅ Keyboard shortcuts (F=Fold, C=Check/Call, R=Raise)
- ✅ Dark luxury casino UI
- ✅ SQLite persistence (chips, win stats)
- ✅ Auto-reconnect (60s window)

## Chip Denominations
| Chip | Value | Color  |
|------|-------|--------|
| ⚪   | 1     | White  |
| 🔴   | 5     | Red    |
| 🔵   | 10    | Blue   |
| 🟢   | 20    | Green  |

## Running on Replit

1. Upload all files to your Replit project
2. Click **Run** — Replit will auto-install dependencies
3. Share the `.replit.app` URL with friends

## Running Locally

```bash
npm install
npm start
# Visit http://localhost:3000
```

## Project Structure

```
├── server.js           # Express + Socket.IO server
├── game/
│   ├── deck.js         # Card deck & shuffle
│   ├── hand-evaluator.js  # Hand ranking (all 9 hands)
│   └── poker-room.js   # Game state machine
├── db/
│   └── database.js     # SQLite queries
├── public/
│   ├── index.html      # Auth + Lobby
│   ├── lobby.js        # Lobby client
│   ├── game.html       # Game table
│   ├── game.js         # Game client
│   └── style.css       # Dark casino theme
└── .replit             # Replit config
```
