import { Server as IOServer, type Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import {
  autoActDisconnected,
  cancelEndGameVote,
  castEndGameVote,
  createRoom,
  dealNextHand,
  confirmBuyBackIn,
  getRoom,
  getRoomByPlayerId,
  joinRoom,
  leaveRoom,
  markDisconnected,
  publicView,
  requestBuyBackIn,
  resolveEndGameVote,
  startEndGameVote,
  updateSettings,
  applyPlayerAction,
  type RoomSettings,
} from "./rooms";
import type { ActionInput } from "./poker";
import { logger } from "../lib/logger";

// 30s grace period — only used after the game has been formally ended.
// While the game is still in progress, players are NEVER auto-evicted, so
// they can reconnect at any time and resume their seat & chips.
const POST_GAME_EVICT_MS = 30_000;

function pidOf(socket: Socket): string {
  return (socket.data?.playerId as string | undefined) ?? socket.id;
}

export function attachSocket(http: HttpServer): IOServer {
  const io = new IOServer(http, {
    path: "/api/socket.io",
    cors: { origin: true, credentials: true },
  });

  io.on("connection", (socket: Socket) => {
    // Stable per-browser identity. Falls back to socket.id if missing
    // (e.g. older client). The player record uses this ID as its key, so
    // reconnections from the same browser always restore the same seat.
    const auth = (socket.handshake.auth ?? {}) as { clientId?: string };
    const playerId = (typeof auth.clientId === "string" && auth.clientId.length > 0) ? auth.clientId : socket.id;
    socket.data.playerId = playerId;

    logger.info({ socketId: socket.id, playerId }, "socket connected");

    // If this player was already in a room, restore them and re-join the
    // socket.io room so they get state updates without any client action.
    const existing = getRoomByPlayerId(playerId);
    if (existing) {
      markDisconnected(playerId, false);
      socket.join(existing.code);
      broadcast(io, existing.code);
    }

    const leaveCurrent = () => {
      const cur = getRoomByPlayerId(playerId);
      if (!cur) return;
      socket.leave(cur.code);
      const updated = leaveRoom(playerId);
      if (updated) broadcast(io, updated.code);
    };

    socket.on("create_room", (
      payload: { name: string; settings: RoomSettings },
      cb: (res: { ok: boolean; code?: string; error?: string }) => void,
    ) => {
      try {
        leaveCurrent();
        const room = createRoom({ hostId: playerId, hostName: (payload.name || "Player").slice(0, 20), settings: payload.settings });
        socket.join(room.code);
        broadcast(io, room.code);
        cb({ ok: true, code: room.code });
      } catch (e) {
        cb({ ok: false, error: (e as Error).message });
      }
    });

    socket.on("join_room", (
      payload: { code: string; name: string },
      cb: (res: { ok: boolean; code?: string; error?: string }) => void,
    ) => {
      // If already seated in the same room, treat as a soft reconnect.
      const cur = getRoomByPlayerId(playerId);
      if (cur && cur.code === (payload.code || "").toUpperCase()) {
        markDisconnected(playerId, false);
        socket.join(cur.code);
        broadcast(io, cur.code);
        return cb({ ok: true, code: cur.code });
      }
      leaveCurrent();
      const { room, error } = joinRoom({
        code: payload.code,
        playerId,
        name: (payload.name || "Player").slice(0, 20),
      });
      if (error || !room) return cb({ ok: false, error: error || "join failed" });
      socket.join(room.code);
      broadcast(io, room.code);
      cb({ ok: true, code: room.code });
    });

    socket.on("update_settings", (payload: Partial<RoomSettings>, cb?: (res: { ok: boolean; error?: string }) => void) => {
      const room = getRoomByPlayerId(playerId);
      if (!room) return cb?.({ ok: false, error: "not in a room" });
      if (room.hostId !== playerId) return cb?.({ ok: false, error: "only host can change settings" });
      updateSettings(room, payload);
      broadcast(io, room.code);
      cb?.({ ok: true });
    });

    socket.on("start_hand", (_: unknown, cb?: (res: { ok: boolean; error?: string }) => void) => {
      const room = getRoomByPlayerId(playerId);
      if (!room) return cb?.({ ok: false, error: "not in a room" });
      if (room.hostId !== playerId) return cb?.({ ok: false, error: "only host can deal" });
      const seated = room.state.players.filter((p) => p.chips > 0 && !p.disconnected);
      if (seated.length < 2) return cb?.({ ok: false, error: "Need at least 2 players with chips" });
      dealNextHand(room);
      // In case any seated-but-disconnected player ends up to-act somehow.
      autoActDisconnected(room);
      broadcast(io, room.code);
      cb?.({ ok: true });
    });

    socket.on("action", (payload: ActionInput, cb?: (res: { ok: boolean; error?: string }) => void) => {
      const room = getRoomByPlayerId(playerId);
      if (!room) return cb?.({ ok: false, error: "not in a room" });
      const result = applyPlayerAction(room, playerId, payload);
      // After your action, advance through any disconnected players.
      autoActDisconnected(room);
      broadcast(io, room.code);
      cb?.(result);
    });

    socket.on("rebuy", (_: unknown, cb?: (res: { ok: boolean; error?: string }) => void) => {
      const room = getRoomByPlayerId(playerId);
      if (!room) return cb?.({ ok: false, error: "not in a room" });
      const result = requestBuyBackIn(room, playerId);
      if (!result.ok) return cb?.(result);
      broadcast(io, room.code);
      cb?.({ ok: true });
    });

    socket.on("start_end_game_vote", (_: unknown, cb?: (res: { ok: boolean; error?: string }) => void) => {
      const room = getRoomByPlayerId(playerId);
      if (!room) return cb?.({ ok: false, error: "not in a room" });
      const result = startEndGameVote(room, playerId);
      if (!result.ok) return cb?.(result);
      resolveEndGameVote(room);
      broadcast(io, room.code);
      cb?.({ ok: true });
    });

    socket.on("cast_end_game_vote", (
      payload: { agree: boolean },
      cb?: (res: { ok: boolean; error?: string }) => void,
    ) => {
      const room = getRoomByPlayerId(playerId);
      if (!room) return cb?.({ ok: false, error: "not in a room" });
      const result = castEndGameVote(room, playerId, !!payload?.agree);
      if (!result.ok) return cb?.(result);
      resolveEndGameVote(room);
      broadcast(io, room.code);
      cb?.({ ok: true });
    });

    socket.on("cancel_end_game_vote", (_: unknown, cb?: (res: { ok: boolean; error?: string }) => void) => {
      const room = getRoomByPlayerId(playerId);
      if (!room) return cb?.({ ok: false, error: "not in a room" });
      const result = cancelEndGameVote(room, playerId);
      if (!result.ok) return cb?.(result);
      broadcast(io, room.code);
      cb?.({ ok: true });
    });

    socket.on("confirm_buy_back_in", (_: unknown, cb?: (res: { ok: boolean; error?: string }) => void) => {
      const room = getRoomByPlayerId(playerId);
      if (!room) return cb?.({ ok: false, error: "not in a room" });
      const result = confirmBuyBackIn(room, playerId);
      if (!result.ok) return cb?.(result);
      broadcast(io, room.code);
      cb?.({ ok: true });
    });

    socket.on("leave_room", (_: unknown, cb?: (res: { ok: boolean }) => void) => {
      const room = getRoomByPlayerId(playerId);
      if (room) {
        socket.leave(room.code);
        const updated = leaveRoom(playerId);
        if (updated) broadcast(io, updated.code);
      }
      cb?.({ ok: true });
    });

    socket.on("disconnect", () => {
      // Only mark disconnected if no OTHER socket for the same playerId is still
      // connected (e.g. a second tab). Check after a short delay so that a
      // reconnecting socket gets a chance to register first.
      logger.info({ socketId: socket.id, playerId }, "socket disconnected");
      setTimeout(() => {
        if (anySocketForPlayer(io, playerId)) return;
        const room = markDisconnected(playerId, true);
        if (room) broadcast(io, room.code);

        // Only auto-evict AFTER the game has been formally ended (so they
        // don't linger in a dead room forever). While the game is still
        // running, never kick — they can come back at any time.
        setTimeout(() => {
          if (anySocketForPlayer(io, playerId)) return;
          const r = getRoomByPlayerId(playerId);
          if (!r || !r.gameEnded) return;
          const p = r.state.players.find((pl) => pl.id === playerId);
          if (p && p.disconnected) {
            const updated = leaveRoom(playerId);
            if (updated) broadcast(io, updated.code);
          }
        }, POST_GAME_EVICT_MS);
      }, 250);
    });
  });

  function anySocketForPlayer(io: IOServer, playerId: string): boolean {
    for (const s of io.sockets.sockets.values()) {
      if (s.connected && (s.data?.playerId as string | undefined) === playerId) return true;
    }
    return false;
  }

  function broadcast(io: IOServer, code: string) {
    const room = getRoom(code);
    if (!room) return;
    const sids = io.sockets.adapter.rooms.get(code);
    if (!sids) return;
    for (const sid of sids) {
      const s = io.sockets.sockets.get(sid);
      if (!s) continue;
      io.to(sid).emit("state", publicView(room, pidOf(s)));
    }
  }

  return io;
}
