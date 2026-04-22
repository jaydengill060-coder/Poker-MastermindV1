import { Server as IOServer, type Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import {
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
  updateSettings,
  applyPlayerAction,
  type RoomSettings,
} from "./rooms";
import type { ActionInput } from "./poker";
import { logger } from "../lib/logger";

export function attachSocket(http: HttpServer): IOServer {
  const io = new IOServer(http, {
    path: "/api/socket.io",
    cors: { origin: true, credentials: true },
  });

  io.on("connection", (socket: Socket) => {
    logger.info({ socketId: socket.id }, "socket connected");

    const leaveCurrent = () => {
      const existing = getRoomByPlayerId(socket.id);
      if (!existing) return;
      socket.leave(existing.code);
      const updated = leaveRoom(socket.id);
      if (updated) broadcast(io, updated.code);
    };

    socket.on("create_room", (
      payload: { name: string; settings: RoomSettings },
      cb: (res: { ok: boolean; code?: string; error?: string }) => void,
    ) => {
      try {
        leaveCurrent();
        const room = createRoom({ hostId: socket.id, hostName: (payload.name || "Player").slice(0, 20), settings: payload.settings });
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
      leaveCurrent();
      const { room, error } = joinRoom({
        code: payload.code,
        playerId: socket.id,
        name: (payload.name || "Player").slice(0, 20),
      });
      if (error || !room) return cb({ ok: false, error: error || "join failed" });
      socket.join(room.code);
      broadcast(io, room.code);
      cb({ ok: true, code: room.code });
    });

    socket.on("update_settings", (payload: Partial<RoomSettings>, cb?: (res: { ok: boolean; error?: string }) => void) => {
      const room = getRoomByPlayerId(socket.id);
      if (!room) return cb?.({ ok: false, error: "not in a room" });
      if (room.hostId !== socket.id) return cb?.({ ok: false, error: "only host can change settings" });
      updateSettings(room, payload);
      broadcast(io, room.code);
      cb?.({ ok: true });
    });

    socket.on("start_hand", (_: unknown, cb?: (res: { ok: boolean; error?: string }) => void) => {
      const room = getRoomByPlayerId(socket.id);
      if (!room) return cb?.({ ok: false, error: "not in a room" });
      if (room.hostId !== socket.id) return cb?.({ ok: false, error: "only host can deal" });
      const seated = room.state.players.filter((p) => p.chips > 0 && !p.disconnected);
      if (seated.length < 2) return cb?.({ ok: false, error: "Need at least 2 players with chips" });
      dealNextHand(room);
      broadcast(io, room.code);
      cb?.({ ok: true });
    });

    socket.on("action", (payload: ActionInput, cb?: (res: { ok: boolean; error?: string }) => void) => {
      const room = getRoomByPlayerId(socket.id);
      if (!room) return cb?.({ ok: false, error: "not in a room" });
      const result = applyPlayerAction(room, socket.id, payload);
      broadcast(io, room.code);
      cb?.(result);
    });

    socket.on("rebuy", (_: unknown, cb?: (res: { ok: boolean; error?: string }) => void) => {
      const room = getRoomByPlayerId(socket.id);
      if (!room) return cb?.({ ok: false, error: "not in a room" });
      const result = requestBuyBackIn(room, socket.id);
      if (!result.ok) return cb?.(result);
      broadcast(io, room.code);
      cb?.({ ok: true });
    });

    socket.on("confirm_buy_back_in", (_: unknown, cb?: (res: { ok: boolean; error?: string }) => void) => {
      const room = getRoomByPlayerId(socket.id);
      if (!room) return cb?.({ ok: false, error: "not in a room" });
      const result = confirmBuyBackIn(room, socket.id);
      if (!result.ok) return cb?.(result);
      broadcast(io, room.code);
      cb?.({ ok: true });
    });

    socket.on("leave_room", (_: unknown, cb?: (res: { ok: boolean }) => void) => {
      const room = getRoomByPlayerId(socket.id);
      if (room) {
        socket.leave(room.code);
        const updated = leaveRoom(socket.id);
        if (updated) broadcast(io, updated.code);
      }
      cb?.({ ok: true });
    });

    socket.on("disconnect", () => {
      const room = markDisconnected(socket.id, true);
      if (room) broadcast(io, room.code);
      logger.info({ socketId: socket.id }, "socket disconnected");
      // Give grace period before fully removing
      setTimeout(() => {
        const r = getRoomByPlayerId(socket.id);
        if (!r) return;
        const p = r.state.players.find((pl) => pl.id === socket.id);
        if (p && p.disconnected) {
          const updated = leaveRoom(socket.id);
          if (updated) broadcast(io, updated.code);
        }
      }, 30_000);
    });
  });

  function broadcast(io: IOServer, code: string) {
    const room = getRoom(code);
    if (!room) return;
    const sockets = io.sockets.adapter.rooms.get(code);
    if (!sockets) return;
    for (const sid of sockets) {
      io.to(sid).emit("state", publicView(room, sid));
    }
  }

  return io;
}
