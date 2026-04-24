import { fmtCents } from "./types";

interface Props {
  name: string;
  amount: number;
}

export function AllInBurst({ name, amount }: Props) {
  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-black/30 animate-[allin-flash_2.6s_ease-out_forwards]" />
      <div className="absolute inset-0 animate-[allin-rays_2.6s_ease-out_forwards]"
        style={{
          background:
            "radial-gradient(circle at center, rgba(251,191,36,0.55) 0%, rgba(251,191,36,0.15) 25%, rgba(0,0,0,0) 60%)",
        }}
      />
      <div className="relative text-center animate-[allin-pop_2.6s_cubic-bezier(0.2,0.9,0.2,1.2)_forwards]">
        <div className="text-amber-300 font-black uppercase tracking-[0.25em] text-sm sm:text-base mb-1 drop-shadow">
          {name}
        </div>
        <div
          className="font-black uppercase tracking-widest text-7xl sm:text-9xl text-amber-300 drop-shadow-[0_4px_24px_rgba(251,191,36,0.8)] animate-[allin-shake_0.5s_linear_3]"
          style={{ WebkitTextStroke: "2px #1a0d00" }}
        >
          ALL IN
        </div>
        <div className="mt-2 inline-block px-4 py-1 rounded-full bg-black/60 border border-amber-300/60 text-amber-100 font-mono text-lg sm:text-xl">
          {fmtCents(amount)}
        </div>
      </div>
      <style>{`
        @keyframes allin-flash {
          0% { opacity: 0; }
          10% { opacity: 1; }
          80% { opacity: 0.6; }
          100% { opacity: 0; }
        }
        @keyframes allin-rays {
          0% { opacity: 0; transform: scale(0.4) rotate(0deg); }
          25% { opacity: 1; transform: scale(1.1) rotate(20deg); }
          100% { opacity: 0; transform: scale(1.4) rotate(45deg); }
        }
        @keyframes allin-pop {
          0% { transform: scale(0.2) rotate(-8deg); opacity: 0; }
          15% { transform: scale(1.25) rotate(2deg); opacity: 1; }
          25% { transform: scale(1) rotate(0deg); }
          80% { transform: scale(1) rotate(0deg); opacity: 1; }
          100% { transform: scale(1.1) rotate(0deg); opacity: 0; }
        }
        @keyframes allin-shake {
          0%, 100% { transform: translate(0, 0); }
          20% { transform: translate(-6px, 2px); }
          40% { transform: translate(5px, -3px); }
          60% { transform: translate(-4px, 4px); }
          80% { transform: translate(4px, -2px); }
        }
      `}</style>
    </div>
  );
}
