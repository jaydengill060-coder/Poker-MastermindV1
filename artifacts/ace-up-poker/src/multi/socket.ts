import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

function getClientId(): string {
  const KEY = "aceUpPokerClientId";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id =
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io({
    path: "/api/socket.io",
    transports: ["websocket", "polling"],
    autoConnect: true,
    auth: { clientId: getClientId() },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function clearClientId() {
  try {
    localStorage.removeItem("aceUpPokerClientId");
  } catch {
    /* ignore */
  }
}
