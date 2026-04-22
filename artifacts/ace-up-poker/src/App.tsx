import { useEffect, useState } from "react";
import { Home } from "@/multi/Home";
import { Lobby } from "@/multi/Lobby";
import { MultiTable } from "@/multi/MultiTable";
import { getSocket } from "@/multi/socket";
import type { PublicState } from "@/multi/types";

export default function App() {
  const [state, setState] = useState<PublicState | null>(null);
  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    const s = getSocket();
    const onState = (next: PublicState) => setState(next);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    s.on("state", onState);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    if (s.connected) setConnected(true);
    return () => {
      s.off("state", onState);
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
    };
  }, []);

  const handleLeave = () => {
    setJoined(false);
    setState(null);
  };

  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center text-amber-300 bg-[#051a13]">
        <div className="text-center">
          <div className="text-2xl font-bold mb-2">Ace Up Poker</div>
          <div className="text-sm text-zinc-400">Connecting to server...</div>
        </div>
      </div>
    );
  }

  if (!joined || !state) {
    return <Home onJoined={() => setJoined(true)} />;
  }

  if (state.phase === "idle" || (state.phase === "handover" && state.handNumber === 0)) {
    return <Lobby state={state} onLeave={handleLeave} />;
  }

  return <MultiTable state={state} onLeave={handleLeave} />;
}
