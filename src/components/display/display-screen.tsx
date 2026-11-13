"use client";

import { AnimatePresence, motion } from "motion/react";
import { Maximize2, Volume2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RaffleEnv } from "@/lib/domain/types";
import { derivePhase } from "@/lib/display/phase";
import { useDisplayState, type ConnectionStatus } from "@/lib/display/use-display-state";
import { Wheel, BRAND_LOGO_URL } from "@/components/wheel/wheel";
import { useNow, usePrefersReducedMotion, useSpinAnimation } from "@/components/wheel/use-spin-animation";
import { Confetti } from "./confetti";
import { RaffleSound } from "./sound";
import { cn } from "@/lib/utils";

const STAGE_W = 1920;
const STAGE_H = 1080;

/** Renders children on a fixed 1920×1080 stage scaled to fit the window. */
function ScaledStage({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#050b1a]">
      <div
        className="absolute left-1/2 top-1/2"
        style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: "center" }}
      >
        {children}
      </div>
    </div>
  );
}

function nameSize(name: string) {
  const n = name.length;
  if (n <= 14) return 168;
  if (n <= 20) return 140;
  if (n <= 28) return 112;
  if (n <= 40) return 88;
  return 68;
}

const STATUS_STYLE: Record<ConnectionStatus, { label: string; dot: string }> = {
  connecting: { label: "Connecting…", dot: "bg-slate-400" },
  live: { label: "Live", dot: "bg-[#34A853]" },
  reconnecting: { label: "Reconnecting…", dot: "bg-[#FBBC05] animate-pulse" },
  offline: { label: "Offline — will resync", dot: "bg-[#EA4335] animate-pulse" },
};

export function DisplayScreen({ env }: { env: RaffleEnv }) {
  const { state, status, offset } = useDisplayState(env);
  const reduced = usePrefersReducedMotion();
  const now = useNow(200);
  const phase = derivePhase(state, now + offset, reduced);
  const wheelRef = useRef<SVGGElement>(null);
  const sound = useRef<RaffleSound | null>(null);
  const [soundReady, setSoundReady] = useState(false);
  const [chrome, setChrome] = useState(true);
  const celebrated = useRef<Set<string>>(new Set());

  const soundOn = !!state?.soundEnabled;

  useSpinAnimation({
    wheel: wheelRef,
    spin: phase.kind === "spinning" ? phase.spin : null,
    active: phase.kind === "spinning",
    durationMs: phase.kind === "spinning" ? phase.durationMs : 1,
    restRotation: phase.kind === "spinning" ? 0 : phase.rotation,
    serverOffset: offset,
    reducedMotion: reduced,
    onSegmentTick: useCallback(() => {
      if (soundOn) sound.current?.tick();
    }, [soundOn]),
  });

  // Celebrate each reveal exactly once, and never for an old spin on reconnect.
  const revealId = phase.kind === "reveal" ? phase.reveal.drawId : null;
  const celebrate = phase.kind === "reveal" && phase.celebrate;
  // Confetti is keyed by draw, so it fires once per reveal and only inside the
  // celebrate window (a reconnecting projector won't replay it).
  const confettiKey = celebrate ? revealId : null;
  useEffect(() => {
    if (!revealId || !celebrate || celebrated.current.has(revealId)) return;
    celebrated.current.add(revealId);
    if (soundOn) sound.current?.fanfare();
  }, [revealId, celebrate, soundOn]);

  // Hide cursor and operator chrome when the mouse is idle.
  useEffect(() => {
    let t = setTimeout(() => setChrome(false), 3000);
    const show = () => {
      setChrome(true);
      clearTimeout(t);
      t = setTimeout(() => setChrome(false), 3000);
    };
    window.addEventListener("mousemove", show);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", show);
    };
  }, []);

  const enableSound = async () => {
    sound.current ??= new RaffleSound();
    await sound.current.unlock();
    setSoundReady(sound.current.unlocked);
  };

  const prize = state?.currentPrize;
  const spinning = phase.kind === "spinning";
  // While the wheel spins, show the pre-draw numbers so the counters don't
  // change before the winner is revealed.
  const counts = state
    ? spinning
      ? { eligible: state.eligibleCount + 1, winners: Math.max(0, state.winnerCount - 1), remaining: prize ? Math.min(prize.quantity, prize.remainingQuantity + 1) : null }
      : { eligible: state.eligibleCount, winners: state.winnerCount, remaining: prize?.remainingQuantity ?? null }
    : null;
  const st = STATUS_STYLE[status];

  return (
    <ScaledStage>
      <div className={cn("relative h-full w-full overflow-hidden font-display text-white", !chrome && "cursor-none")}>
        {/* Background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,#16306b_0%,#0b1b3a_45%,#050b1a_100%)]" />
        <div className="absolute -left-40 -top-40 h-[620px] w-[620px] rounded-full bg-[#4285F4] opacity-25 blur-[140px]" />
        <div className="absolute -bottom-52 left-[38%] h-[520px] w-[520px] rounded-full bg-[#EA4335] opacity-15 blur-[140px]" />
        <div className="absolute -right-40 top-20 h-[560px] w-[560px] rounded-full bg-[#34A853] opacity-15 blur-[140px]" />
        <div className="absolute bottom-10 right-[20%] h-[380px] w-[380px] rounded-full bg-[#FBBC05] opacity-10 blur-[120px]" />

        {/* Header */}
        <header className="absolute left-16 right-16 top-12 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white p-2 shadow-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={BRAND_LOGO_URL} alt="DevFest Toronto 2026" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-[30px] font-semibold uppercase tracking-[0.3em] text-white/70">DevFest Toronto 2026</p>
              <h1 className="text-[64px] font-extrabold leading-none tracking-tight">
                Spin the Wheel <span className="text-[#FBBC05]">Raffle</span>
              </h1>
            </div>
          </div>
          {state?.isDemo && (
            <div className="rounded-2xl border-4 border-[#FBBC05] bg-[#FBBC05]/15 px-8 py-3 text-[40px] font-extrabold uppercase tracking-widest text-[#FBBC05]">
              Demo mode
            </div>
          )}
        </header>

        {/* Wheel */}
        <div className="absolute left-[100px] top-[215px] h-[790px] w-[790px]">
          <Wheel ref={wheelRef} spinning={spinning} />
        </div>

        {/* Info panel */}
        <section className="absolute right-[100px] top-[195px] w-[800px]">
          <p className="text-[34px] font-semibold uppercase tracking-[0.25em] text-[#8ab4f8]">
            {spinning ? "Drawing now…" : prize ? "Now drawing for" : "Get ready"}
          </p>
          <AnimatePresence mode="wait">
            <motion.div
              key={prize?.prizeId ?? "none"}
              initial={reduced ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -24 }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="mt-4 text-[96px] font-extrabold leading-[1.02] tracking-tight">{prize?.name ?? "Next prize coming up"}</h2>
              {prize?.description && <p className="mt-5 text-[40px] leading-snug text-white/80">{prize.description}</p>}
              {prize && (
                <div className="mt-8 flex items-center gap-4">
                  <span className="rounded-full bg-white/10 px-6 py-2 text-[32px] font-semibold">
                    {counts?.remaining ?? prize.remainingQuantity} of {prize.quantity} left
                  </span>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-12 grid grid-cols-2 gap-6">
            <div className="rounded-3xl bg-white/[0.07] p-8 ring-1 ring-white/10">
              <p className="text-[28px] font-medium text-white/70">Eligible attendees</p>
              <p className="mt-1 text-[88px] font-extrabold leading-none tabular-nums">{counts ? counts.eligible : "—"}</p>
            </div>
            <div className="rounded-3xl bg-white/[0.07] p-8 ring-1 ring-white/10">
              <p className="text-[28px] font-medium text-white/70">Winners so far</p>
              <p className="mt-1 text-[88px] font-extrabold leading-none tabular-nums">{counts ? counts.winners : "—"}</p>
            </div>
          </div>
          <p className="mt-6 text-[24px] leading-snug text-white/55">
            Every eligible attendee has an equal chance. Winners are picked by a secure random draw on the server — the wheel is just for show.
          </p>
        </section>


        {/* Operator chrome (no admin controls) */}
        <div className={cn("absolute bottom-8 right-12 z-50 flex items-center gap-4 transition-opacity duration-500", chrome ? "opacity-100" : "opacity-40")}>
          {soundOn && !soundReady && (
            <button onClick={enableSound} className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-2 text-[22px] ring-1 ring-white/20 hover:bg-white/20">
              <Volume2 className="size-6" /> Click to enable sound
            </button>
          )}
          {chrome && (
            <button
              onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
              className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-2 text-[22px] ring-1 ring-white/20 hover:bg-white/20"
            >
              <Maximize2 className="size-6" /> Fullscreen
            </button>
          )}
          <div className="flex items-center gap-3 rounded-full bg-black/30 px-5 py-2 text-[22px] ring-1 ring-white/10" data-testid="connection-status">
            <span className={cn("size-3.5 rounded-full", st.dot)} />
            {st.label}
          </div>
        </div>

        {/* Winner reveal */}
        <AnimatePresence>
          {phase.kind === "reveal" && (
            <motion.div
              key={phase.reveal.drawId}
              data-testid="winner-reveal"
              className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#050b1a]/80 text-center backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0.2 : 0.5 }}
            >
              <motion.div
                initial={reduced ? false : { scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 160, damping: 16, delay: 0.1 }}
                className="flex flex-col items-center"
              >
                <p className="text-[56px] font-extrabold uppercase tracking-[0.2em]">
                  <span className="text-[#4285F4]">Con</span>
                  <span className="text-[#EA4335]">gra</span>
                  <span className="text-[#FBBC05]">tula</span>
                  <span className="text-[#34A853]">tions!</span>
                </p>
                <h2
                  className="mt-6 max-w-[1700px] font-extrabold leading-[1.05] tracking-tight drop-shadow-[0_8px_30px_rgba(66,133,244,0.45)]"
                  style={{ fontSize: nameSize(phase.reveal.winnerName) }}
                  data-testid="winner-name"
                >
                  {phase.reveal.winnerName}
                </h2>
                {phase.reveal.disambiguator && (
                  <p className="mt-6 rounded-full bg-white/10 px-8 py-2 text-[44px] font-semibold tabular-nums ring-1 ring-white/20">
                    {phase.reveal.disambiguator}
                  </p>
                )}
                <p className="mt-12 text-[40px] text-white/70">wins</p>
                <p className="mt-2 text-[80px] font-extrabold text-[#FBBC05]">{phase.reveal.prizeName}</p>
                <p className="mt-14 text-[30px] font-medium uppercase tracking-[0.3em] text-white/60">
                  Please come to the stage · DevFest Toronto 2026
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Paused / completed */}
        <AnimatePresence>
          {phase.kind !== "reveal" && state && state.raffleStatus !== "ready" && !spinning && (
            <motion.div
              key={state.raffleStatus}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#050b1a]/85 text-center backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {state.raffleStatus === "paused" ? (
                <>
                  <p className="text-[110px] font-extrabold">Short intermission</p>
                  <p className="mt-6 text-[48px] text-white/75">The raffle will resume in a moment.</p>
                </>
              ) : (
                <>
                  <p className="text-[110px] font-extrabold">All prizes awarded!</p>
                  <p className="mt-6 text-[48px] text-white/75">Congratulations to every winner — thanks for joining DevFest Toronto 2026.</p>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <Confetti fireKey={confettiKey} reducedMotion={reduced} />
      </div>
    </ScaledStage>
  );
}
