import React, { useEffect, useMemo, useRef, useState } from "react";

const TILE = 28;
const COLS = 19;
const ROWS = 13;
const WIN_SCORE = Number.POSITIVE_INFINITY;

const DIRS = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

const SERVICE_LABELS = [
  "PSA call routed.",
  "Secure partition expanded.",
  "IPC mailbox claimed.",
  "ITS metadata absorbed.",
  "Veneer table grew again.",
  "Crypto service requested more room.",
];

const BIG_SERVICE_LABELS = [
  "Secure boot module absorbed a full flash block.",
  "ITS and crypto just claimed premium flash.",
  "Attestation service expanded aggressively.",
  "A very serious partition resize occurred.",
];

const BOOT_LOG_LINES = [
  "BL2: Image verified successfully.",
  "TF-M: Secure partitions initialized.",
  "SPM: Partition boundaries look decisive.",
  "ITS: definitely not using too much flash.",
  "CRYPTO: one more service should be fine.",
  "NSPE: available space remains theoretically acceptable.",
  "partition_manager: generated consequences.",
  "MCUboot: chain of trust established.",
  "prj.conf: bold choices detected.",
  "west build: completed with emotional warnings.",
];

const mapRows = [
  "###################",
  "#........#........#",
  "#.###.##.#.##.###.#",
  "#F#.............#F#",
  "#.###.#.###.#.###.#",
  "#.....#..T..#.....#",
  "#####.###.###.#####",
  "#.....#.....#.....#",
  "#.###.#.###.#.###.#",
  "#F..#...#.#...#..F#",
  "###.#.#.#.#.#.#.###",
  "#........A........#",
  "###################",
];

function isWall(x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return true;
  return mapRows[y][x] === "#";
}

function findTile(char) {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (mapRows[y][x] === char) return { x, y };
    }
  }
  return { x: 1, y: 1 };
}

function pelletSet() {
  const set = new Set();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cell = mapRows[y][x];
      if (cell === "." || cell === "F") set.add(`${x},${y}`);
    }
  }
  return set;
}

function totalFlashUnits() {
  let total = 0;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cell = mapRows[y][x];
      if (cell === ".") total += 1;
      if (cell === "F") total += 3;
    }
  }
  return total;
}

function validMoves(pos) {
  return Object.values(DIRS)
    .map((d) => ({ x: pos.x + d.x, y: pos.y + d.y }))
    .filter((p) => !isWall(p.x, p.y));
}

function stepToward(from, to) {
  const moves = validMoves(from);
  if (!moves.length) return from;
  const scored = moves.map((m) => ({
    ...m,
    score: Math.abs(m.x - to.x) + Math.abs(m.y - to.y),
  }));
  scored.sort((a, b) => a.score - b.score);
  return scored[0];
}

function randomMove(from, previous) {
  const moves = validMoves(from);
  if (!moves.length) return from;
  const filtered = previous
    ? moves.filter((m) => !(m.x === previous.x && m.y === previous.y))
    : moves;
  const options = filtered.length ? filtered : moves;
  return options[Math.floor(Math.random() * options.length)];
}

function sample(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function partitionLabel(x, y) {
  if (y <= 2) return "BL2 / BOOT";
  if (y <= 4) return x < 9 ? "CRYPTO" : "VENEERS";
  if (y <= 7) return x < 9 ? "ITS" : "PSA IPC";
  if (y <= 9) return x < 9 ? "ATTEST" : "SECURE STG";
  return "NS APP";
}

function mouthPath(direction, open) {
  const angle = open ? 34 : 10;
  const rot = {
    ArrowRight: 0,
    ArrowDown: 90,
    ArrowLeft: 180,
    ArrowUp: 270,
  }[direction] ?? 0;
  return { angle, rot };
}

function panelStyle(dark = false) {
  return {
    border: "2px solid #171717",
    borderRadius: 24,
    background: dark ? "#171717" : "#ffffff",
    color: dark ? "#ffffff" : "#171717",
    boxShadow: "0 16px 40px rgba(0,0,0,0.12)",
  };
}

function buttonStyle(primary = true) {
  return {
    border: "2px solid #171717",
    borderRadius: 16,
    padding: "10px 16px",
    fontWeight: 700,
    background: primary ? "#171717" : "#ffffff",
    color: primary ? "#ffffff" : "#171717",
    cursor: "pointer",
  };
}

export default function App() {
  const startPos = useMemo(() => findTile("T"), []);
  const ghostStart = useMemo(() => findTile("A"), []);

  const [player, setPlayer] = useState(startPos);
  const [ghost, setGhost] = useState(ghostStart);
  const [ghostPrev, setGhostPrev] = useState(null);
  const [dir, setDir] = useState("ArrowRight");
  const [queuedDir, setQueuedDir] = useState("ArrowRight");
  const [pellets, setPellets] = useState(() => pelletSet());
  const [score, setScore] = useState(0);
  const totalUnits = useMemo(() => totalFlashUnits(), []);
  const [flashUnitsEaten, setFlashUnitsEaten] = useState(0);
  const [running, setRunning] = useState(true);
  const [status, setStatus] = useState("BL2 verified image. TF-M is now examining your flash budget.");
  const [powerTicks, setPowerTicks] = useState(0);
  const [tick, setTick] = useState(0);
  const [showAccessFault, setShowAccessFault] = useState(false);
  const [logIndex, setLogIndex] = useState(0);

  const boardRef = useRef(null);
  const stateRef = useRef(null);

  const resetGame = () => {
    setPlayer(startPos);
    setGhost(ghostStart);
    setGhostPrev(null);
    setDir("ArrowRight");
    setQueuedDir("ArrowRight");
    setPellets(pelletSet());
    setScore(0);
    setFlashUnitsEaten(0);
    setRunning(true);
    setStatus("BL2 verified image. TF-M is now examining your flash budget.");
    setPowerTicks(0);
    setTick(0);
    setShowAccessFault(false);
    setLogIndex(0);
    boardRef.current?.focus();
  };

  useEffect(() => {
    boardRef.current?.focus();
  }, []);

  useEffect(() => {
    stateRef.current = {
      player,
      ghost,
      ghostPrev,
      dir,
      queuedDir,
      powerTicks,
      running,
      pellets,
    };
  }, [player, ghost, ghostPrev, dir, queuedDir, powerTicks, running, pellets]);

  useEffect(() => {
    const onKey = (e) => {
      if (DIRS[e.key]) {
        e.preventDefault();
        setQueuedDir(e.key);
      }
      if (e.key === " ") {
        e.preventDefault();
        setRunning((r) => !r);
      }
      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        resetGame();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 220);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    const id = setInterval(() => {
      setLogIndex((i) => (i + 1) % BOOT_LOG_LINES.length);
    }, 1600);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!running) return;
    const current = stateRef.current;
    if (!current) return;

    const currentPlayer = current.player;
    const currentGhost = current.ghost;
    const currentGhostPrev = current.ghostPrev;
    const currentDir = current.dir;
    const currentQueuedDir = current.queuedDir;
    const currentPowerTicks = current.powerTicks;
    const currentPellets = current.pellets;

    let nextDir = currentDir;
    const desired = DIRS[currentQueuedDir];
    if (desired) {
      const qx = currentPlayer.x + desired.x;
      const qy = currentPlayer.y + desired.y;
      if (!isWall(qx, qy)) nextDir = currentQueuedDir;
    }

    let nextPlayer = currentPlayer;
    const move = DIRS[nextDir];
    const nx = currentPlayer.x + move.x;
    const ny = currentPlayer.y + move.y;
    if (!isWall(nx, ny)) {
      nextPlayer = { x: nx, y: ny };
    }

    const nextGhost = currentPowerTicks > 0
      ? randomMove(currentGhost, currentGhostPrev)
      : stepToward(currentGhost, nextPlayer);

    const directCollision = nextPlayer.x === nextGhost.x && nextPlayer.y === nextGhost.y;
    const passThroughCollision =
      nextPlayer.x === currentGhost.x &&
      nextPlayer.y === currentGhost.y &&
      nextGhost.x === currentPlayer.x &&
      nextGhost.y === currentPlayer.y;

    const gotCaught = (directCollision || passThroughCollision) && currentPowerTicks <= 0;
    const ateGhost = (directCollision || passThroughCollision) && currentPowerTicks > 0;
    const collisionTile = nextPlayer;

    setDir(nextDir);
    if (gotCaught) {
      setPlayer(collisionTile);
      setGhostPrev(currentGhost);
      setGhost(collisionTile);
    } else {
      setPlayer(nextPlayer);
      setGhostPrev(ateGhost ? null : currentGhost);
      setGhost(ateGhost ? ghostStart : nextGhost);
    }

    const key = `${nextPlayer.x},${nextPlayer.y}`;
    const cell = currentPellets.has(key) ? mapRows[nextPlayer.y][nextPlayer.x] : null;

    if (cell === "F") {
      setPellets((old) => {
        const updated = new Set(old);
        updated.delete(key);
        return updated;
      });
      setFlashUnitsEaten((u) => u + 3);
      setScore((s) => s + 2);
      setPowerTicks(28);
      setStatus(sample(BIG_SERVICE_LABELS));
      setShowAccessFault(false);
    } else {
      if (cell === ".") {
        setPellets((old) => {
          const updated = new Set(old);
          updated.delete(key);
          return updated;
        });
        setFlashUnitsEaten((u) => u + 1);
        setScore((s) => s + 1);
        setStatus(sample(SERVICE_LABELS));
        setShowAccessFault(false);
      }
      setPowerTicks((p) => Math.max(0, p - 1));
    }

    if (ateGhost) {
      setScore((s) => s + 3);
      setStatus("Non-secure task preempted. Secure world retains flash priority.");
      setShowAccessFault(false);
    }

    if (gotCaught) {
      setRunning(false);
      setStatus("Non-secure image reclaimed the partition budget.");
      setShowAccessFault(true);
    }
  }, [tick, running, ghostStart]);

  useEffect(() => {
    if (flashUnitsEaten >= totalUnits || score >= WIN_SCORE || pellets.size === 0) {
      setRunning(false);
      setStatus("The build is finally secure");
      setShowAccessFault(false);
    }
  }, [flashUnitsEaten, totalUnits, score, pellets]);

  const flashLeft = Math.max(0, Math.round(((totalUnits - flashUnitsEaten) / totalUnits) * 100));
  const flashConsumed = Math.min(100, Math.round((flashUnitsEaten / totalUnits) * 100));
  const { angle, rot } = mouthPath(dir, tick % 2 === 0);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", color: "#171717", padding: 24, fontFamily: "Inter, Arial, sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)", margin: 0, fontWeight: 900 }}>TF-M ate my flash</h1>
          <p style={{ fontSize: "clamp(1rem, 2vw, 1.4rem)", color: "#525252", marginTop: 8 }}>same energy, smaller microcontroller</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 0.9fr)", gap: 24, alignItems: "start" }}>
          <div style={{ ...panelStyle(false), padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 32 }}>Secure world footprint</h2>
                <p style={{ color: "#525252", maxWidth: 720 }}>
                  Guide TF-M through the partition map, claim secure services, and avoid the non-secure app while the flash budget disappears.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => setRunning((r) => !r)} style={buttonStyle(true)}>
                  {running ? "⏸ Pause" : "▶ Resume"}
                </button>
                <button onClick={resetGame} style={buttonStyle(false)}>
                  ↺ Reset
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 20 }}>
              {[
                ["Services claimed", score],
                ["NS flash left", `${flashLeft}%`],
                ["Security state", powerTicks > 0 ? "Isolation Mode" : running ? "Nominal" : "Halted"],
              ].map(([label, value]) => (
                <div key={label} style={{ background: "#f5f5f5", borderRadius: 18, padding: 16 }}>
                  <div style={{ fontSize: 14, color: "#737373" }}>{label}</div>
                  <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 20, borderRadius: 18, border: "1px solid #404040", background: "#171717", color: "#86efac", padding: "12px 16px", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
              <span style={{ color: "#22c55e", marginRight: 8 }}>[boot]</span>
              {BOOT_LOG_LINES[logIndex]}
            </div>

            <div style={{ marginTop: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                <span>Secure world flash occupation</span>
                <span>{flashConsumed}%</span>
              </div>
              <div style={{ width: "100%", height: 16, borderRadius: 999, background: "#d4d4d4", overflow: "hidden" }}>
                <div style={{ width: `${flashConsumed}%`, height: "100%", background: "#171717" }} />
              </div>
            </div>

            <div
              ref={boardRef}
              tabIndex={0}
              style={{
                marginTop: 20,
                outline: "none",
                borderRadius: 28,
                border: "2px solid #171717",
                background: "#171717",
                padding: 12,
                display: "inline-block",
                boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
                width: COLS * TILE + 24,
                maxWidth: "100%",
              }}
            >
              <div
                style={{
                  position: "relative",
                  display: "grid",
                  gridTemplateColumns: `repeat(${COLS}, ${TILE}px)`,
                  width: COLS * TILE,
                  height: ROWS * TILE,
                }}
              >
                {Array.from({ length: ROWS }).flatMap((_, y) =>
                  Array.from({ length: COLS }).map((__, x) => {
                    const cell = mapRows[y][x];
                    const key = `${x},${y}`;
                    const hasPellet = pellets.has(key);
                    const isPlayer = player.x === x && player.y === y;
                    const isGhost = ghost.x === x && ghost.y === y;

                    return (
                      <div key={key} style={{ position: "relative", width: TILE, height: TILE, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {cell === "#" && (
                          <div style={{ position: "absolute", inset: 2, borderRadius: 10, background: "#475569", border: "1px solid rgba(165,243,252,0.2)" }} />
                        )}

                        {!isWall(x, y) && !hasPellet && !isPlayer && !isGhost && (
                          <div style={{ position: "absolute", inset: 0, opacity: 0.2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, color: "#cffafe", textAlign: "center", lineHeight: 1, pointerEvents: "none", padding: 2 }}>
                            {partitionLabel(x, y)}
                          </div>
                        )}

                        {hasPellet && cell === "." && (
                          <div title="RAM module" style={{ position: "relative", width: 16, height: 10 }}>
                            <div style={{ position: "absolute", inset: 0, borderRadius: 2, border: "1px solid rgba(167,243,208,0.8)", background: "#10b981", boxShadow: "0 0 8px rgba(16,185,129,0.35)" }} />
                            {[2, 5, 8, 11].map((left) => (
                              <div key={left} style={{ position: "absolute", left, top: 2, width: 2, height: 2, borderRadius: 1, background: "rgba(236,253,245,0.9)" }} />
                            ))}
                            <div style={{ position: "absolute", left: 1, right: 1, bottom: 0, height: 2, background: "#fcd34d", borderBottomLeftRadius: 2, borderBottomRightRadius: 2 }} />
                            {[2, 5, 8, 11].map((left) => (
                              <div key={`pin-${left}`} style={{ position: "absolute", left, bottom: 0, width: 1, height: 3, background: "#fef3c7" }} />
                            ))}
                          </div>
                        )}

                        {hasPellet && cell === "F" && (
                          <div title="SSD module" style={{ position: "relative", width: 18, height: 14, animation: "pulse 1.2s infinite" }}>
                            <div style={{ position: "absolute", inset: 0, borderRadius: 3, border: "1px solid rgba(226,232,240,0.8)", background: "#cbd5e1", boxShadow: "0 0 10px rgba(226,232,240,0.35)" }} />
                            <div style={{ position: "absolute", left: 2, right: 2, top: 2, height: 3, borderRadius: 2, background: "#f8fafc" }} />
                            <div style={{ position: "absolute", left: 2, top: 6, width: 5, height: 4, borderRadius: 1, background: "#475569" }} />
                            <div style={{ position: "absolute", left: 8, top: 6, width: 5, height: 4, borderRadius: 1, background: "#475569" }} />
                            <div style={{ position: "absolute", right: 2, top: 6, width: 2, height: 4, borderRadius: 1, background: "#34d399" }} />
                            <div style={{ position: "absolute", left: 2, right: 2, bottom: 1, height: 2, borderRadius: 999, background: "rgba(252,211,77,0.9)" }} />
                          </div>
                        )}

                        {isGhost && (
                          <div style={{ position: "absolute", inset: 3, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <div style={{ width: 20, height: 20, borderRadius: 999, background: powerTicks > 0 ? "#7dd3fc" : "#f97316", position: "relative" }}>
                              <div style={{ position: "absolute", top: 4, left: 4, width: 6, height: 6, borderRadius: 999, background: "#fff" }} />
                              <div style={{ position: "absolute", top: 4, right: 4, width: 6, height: 6, borderRadius: 999, background: "#fff" }} />
                              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 8, background: "inherit", clipPath: "polygon(0 0,15% 100%,30% 0,45% 100%,60% 0,75% 100%,90% 0,100% 100%,100% 0)" }} />
                              <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: -12, fontSize: 7, fontWeight: 900, color: "#fff", whiteSpace: "nowrap" }}>NS</div>
                            </div>
                          </div>
                        )}

                        {isPlayer && (
                          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, transform: `rotate(${rot}deg)` }}>
                            <div style={{ position: "relative", width: 24, height: 24 }}>
                              <div
                                style={{
                                  position: "absolute",
                                  left: 1,
                                  top: 3,
                                  width: 22,
                                  height: 22,
                                  borderRadius: 999,
                                  background: "#ffffff",
                                  boxShadow: "0 0 0 2px #111, 0 0 8px rgba(255,255,255,0.35)",
                                }}
                              />
                              <div
                                style={{
                                  position: "absolute",
                                  left: 11,
                                  top: 4,
                                  width: 14,
                                  height: 20,
                                  background: "#171717",
                                  clipPath: `polygon(0 50%, 100% ${50 - angle}%, 100% ${50 + angle}%)`,
                                  zIndex: 2,
                                }}
                              />
                              <div style={{ position: "absolute", width: 4, height: 4, borderRadius: 999, background: "#111", top: 8, left: 10, zIndex: 3 }} />
                              <div style={{ position: "absolute", top: -1, left: 4, width: 16, height: 4, borderRadius: 999, background: "#5b3a29", boxShadow: "0 0 0 1px #111", zIndex: 4 }} />
                              <div style={{ position: "absolute", top: -6, left: 7, width: 10, height: 8, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, background: "#6f4a35", boxShadow: "0 0 0 1px #111", zIndex: 5 }} />
                              <div style={{ position: "absolute", top: -2, left: 8, width: 8, height: 1, background: "#c2410c", zIndex: 6 }} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                {showAccessFault && (
                  <div style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)", pointerEvents: "none" }}>
                    <div style={{ margin: 24, maxWidth: 420, borderRadius: 24, border: "2px solid #fca5a5", background: "#fef2f2", padding: 24, textAlign: "center", boxShadow: "0 20px 40px rgba(0,0,0,0.25)" }}>
                      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.2em", color: "#b91c1c" }}>SECURE FAULT</div>
                      <div style={{ marginTop: 8, fontSize: 32, fontWeight: 900 }}>Access fault</div>
                      <div style={{ marginTop: 12, fontSize: 14, color: "#404040", lineHeight: 1.6 }}>
                        Non-secure access attempted in a protected partition.<br />
                        Execution halted. Press <strong>R</strong> to reboot.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop: 20, fontSize: 18, fontWeight: 700, borderRadius: 18, background: "#171717", color: "#fff", padding: "16px 20px", textAlign: "center" }}>
              {status}
            </div>
          </div>

          <div style={{ display: "grid", gap: 24 }}>
            <div style={{ ...panelStyle(false), padding: 24, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <div style={{ position: "relative", width: 144, height: 144, background: "#000", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ position: "absolute", width: 20, height: 20, background: "#fff", borderRadius: 999, left: 36, top: 64 }} />
                  <div style={{ position: "absolute", width: 20, height: 20, background: "#fff", borderRadius: 999, right: 36, top: 64 }} />
                  <div style={{ position: "absolute", bottom: 48, width: 80, height: 40, borderBottom: "6px solid #fff", borderRadius: "0 0 999px 999px" }} />
                  <div style={{ position: "absolute", right: -40, top: "50%", transform: "translateY(-50%)", background: "#ef4444", color: "#fff", padding: "12px 24px", borderRadius: 18, border: "4px solid #171717", fontWeight: 900, fontSize: 28 }}>
                    flash
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "center", marginTop: 8, fontSize: 30, fontWeight: 900 }}>TF-M secure world</div>
            </div>

            <div style={{ ...panelStyle(false), padding: 24 }}>
              <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>🛡 Secure console</div>
              <div style={{ color: "#525252", fontSize: 14, lineHeight: 1.7 }}>
                <p><strong>Arrow keys:</strong> move TF-M</p>
                <p><strong>Space:</strong> pause or resume</p>
                <p><strong>R:</strong> restart</p>
                <p><strong>Green RAM sticks:</strong> physical memory pickups representing ordinary memory being consumed</p>
                <p><strong>Silver SSD modules:</strong> larger storage pickups representing chunkier pieces of memory</p>
                <p><strong>NS ghost:</strong> the non-secure app image, vulnerable during Isolation Mode</p>
              </div>
            </div>

            <div style={{ ...panelStyle(true), padding: 24 }}>
              <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>💾 Why security matters</div>
              <p style={{ color: "#e5e5e5", lineHeight: 1.7, margin: 0 }}>
                Security matters because secure boot, isolation, and trusted services help stop untrusted code from reading protected data, altering critical firmware, or taking control of the device.
                In embedded systems, those protections are often the difference between a product that is merely functional and one that can actually be trusted.
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }

        @media (max-width: 980px) {
          div[data-layout='main'] {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
