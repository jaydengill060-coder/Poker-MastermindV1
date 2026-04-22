import { useState } from "react";
import { SetupScreen } from "@/components/SetupScreen";
import { Table } from "@/components/Table";
import type { NewGameOpts } from "@/engine/poker";

export default function App() {
  const [opts, setOpts] = useState<NewGameOpts | null>(null);

  if (!opts) {
    return <SetupScreen onStart={(o) => setOpts(o)} />;
  }
  return <Table opts={opts} onExit={() => setOpts(null)} />;
}
