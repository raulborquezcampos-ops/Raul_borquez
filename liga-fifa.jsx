import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell
} from "recharts";
import { Trophy, Settings, CalendarDays, Table2, BarChart3, Plus, Minus, RotateCcw, Crown, Save } from "lucide-react";

const STORAGE_KEY = "liga-fifa-estado-v1";

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Teko:wght@400;500;600;700&family=Barlow:ital,wght@0,400;0,500;0,600;0,700;1,600&family=Space+Mono:wght@400;700&display=swap');
`;

const PALETTE = {
  pitchDark: "#020B24",
  pitch: "#04124A",
  pitchBright: "#00E676",
  chalk: "#FFFFFF",
  chalkDim: "#9FB4E0",
  gold: "#FFD200",
  red: "#FF3B3B",
  blue: "#00B4FF",
  ink: "#04081A",
  card: "#0A1B4D",
  cardBorder: "#1C3A8A",
};

// ---------- helpers ----------
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function roundRobinRounds(ids) {
  let arr = [...ids];
  const hasBye = arr.length % 2 !== 0;
  if (hasBye) arr.push(null);
  const n = arr.length;
  const roundsCount = n - 1;
  const half = n / 2;
  const rounds = [];
  for (let r = 0; r < roundsCount; r++) {
    const pairs = [];
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== null && b !== null) pairs.push([a, b]);
    }
    rounds.push(pairs);
    const last = arr.pop();
    arr.splice(1, 0, last);
  }
  return rounds;
}

function buildFixtures(players, vueltas) {
  const ids = players.map((p) => p.id);
  if (ids.length < 2) return [];
  const baseRounds = roundRobinRounds(ids);
  const fixtures = [];
  let roundCounter = 0;
  for (let v = 0; v < vueltas; v++) {
    baseRounds.forEach((pairs) => {
      roundCounter += 1;
      pairs.forEach(([a, b]) => {
        const swap = v % 2 === 1;
        fixtures.push({
          id: uid(),
          round: roundCounter,
          home: swap ? b : a,
          away: swap ? a : b,
          scoreHome: "",
          scoreAway: "",
        });
      });
    });
  }
  return fixtures;
}

function emptyStat(id, name) {
  return {
    id, name, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0,
  };
}

function computeStandings(players, fixtures) {
  const map = {};
  players.forEach((p) => (map[p.id] = emptyStat(p.id, p.name)));
  fixtures.forEach((f) => {
    if (f.scoreHome === "" || f.scoreAway === "") return;
    const sh = Number(f.scoreHome);
    const sa = Number(f.scoreAway);
    if (Number.isNaN(sh) || Number.isNaN(sa)) return;
    const home = map[f.home];
    const away = map[f.away];
    if (!home || !away) return;
    home.pj += 1; away.pj += 1;
    home.gf += sh; home.gc += sa;
    away.gf += sa; away.gc += sh;
    if (sh > sa) { home.pg += 1; home.pts += 3; away.pp += 1; }
    else if (sh < sa) { away.pg += 1; away.pts += 3; home.pp += 1; }
    else { home.pe += 1; away.pe += 1; home.pts += 1; away.pts += 1; }
  });
  const list = Object.values(map).map((s) => ({ ...s, dg: s.gf - s.gc }));
  // Criterio FIFA: Puntos -> Diferencia de gol -> Goles a favor -> Nombre
  list.sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.name.localeCompare(b.name));
  return list;
}

function totalMatchesForPlayer(fixtures, playerId) {
  return fixtures.filter((f) => f.home === playerId || f.away === playerId).length;
}

// ---------- UI atoms ----------
function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-t-md border-b-2 transition-colors whitespace-nowrap font-semibold tracking-wide uppercase text-sm ${
        active
          ? "border-[#FFD200] text-[#FFD200] bg-[#0A1B4D]"
          : "border-transparent text-[#9FB4E0] hover:text-[#FFFFFF] hover:bg-[#0A1B4D]/50"
      }`}
      style={{ fontFamily: "Barlow, sans-serif" }}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div
      className="rounded-lg p-4 border"
      style={{ background: PALETTE.card, borderColor: PALETTE.cardBorder }}
    >
      <div className="text-[11px] uppercase tracking-widest" style={{ color: PALETTE.chalkDim, fontFamily: "Barlow, sans-serif" }}>
        {label}
      </div>
      <div
        className="text-3xl mt-1"
        style={{ fontFamily: "Space Mono, monospace", color: accent || PALETTE.chalk }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-1" style={{ color: PALETTE.chalkDim, fontFamily: "Barlow, sans-serif" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ---------- main app ----------
export default function LigaFifa() {
  const [loaded, setLoaded] = useState(false);
  const [leagueName, setLeagueName] = useState("Liga de los Cracks");
  const [players, setPlayers] = useState([
    { id: uid(), name: "Jugador 1" },
    { id: uid(), name: "Jugador 2" },
  ]);
  const [vueltas, setVueltas] = useState(2);
  const [fixtures, setFixtures] = useState([]);
  const [tab, setTab] = useState("config");
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved

  // cargar estado guardado
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, true);
        if (res && res.value) {
          const data = JSON.parse(res.value);
          if (data.leagueName) setLeagueName(data.leagueName);
          if (data.players && data.players.length) setPlayers(data.players);
          if (data.vueltas) setVueltas(data.vueltas);
          if (data.fixtures) setFixtures(data.fixtures);
          if (data.fixtures && data.fixtures.length) setTab("tabla");
        }
      } catch (e) {
        // sin datos guardados aún, se ignora
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setSaveState("saving");
    try {
      await window.storage.set(
        STORAGE_KEY,
        JSON.stringify(next),
        true
      );
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1200);
    } catch (e) {
      setSaveState("idle");
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      persist({ leagueName, players, vueltas, fixtures });
    }, 400);
    return () => clearTimeout(t);
  }, [leagueName, players, vueltas, fixtures, loaded, persist]);

  const standings = useMemo(() => computeStandings(players, fixtures), [players, fixtures]);
  const totalGoalsLeague = useMemo(() => standings.reduce((acc, s) => acc + s.gf, 0), [standings]);
  const matchesPerPlayer = players.length > 1 ? players.length - 1 + (players.length % 2 === 0 ? 0 : 0) : 0;
  const totalRoundsPerPlayer = players.length > 1 ? (players.length - 1) * vueltas : 0;

  const leaderPts = standings[0]?.pts ?? 0;
  const secondPts = standings[1]?.pts ?? 0;

  function addPlayer() {
    if (players.length >= 12) return;
    setPlayers((p) => [...p, { id: uid(), name: `Jugador ${p.length + 1}` }]);
  }
  function removePlayer(id) {
    if (players.length <= 2) return;
    setPlayers((p) => p.filter((x) => x.id !== id));
  }
  function renamePlayer(id, name) {
    setPlayers((p) => p.map((x) => (x.id === id ? { ...x, name } : x)));
  }
  function generarCalendario() {
    if (players.some((p) => !p.name.trim())) {
      alert("Poné un nombre a cada jugador antes de generar el calendario.");
      return;
    }
    const nf = buildFixtures(players, vueltas);
    setFixtures(nf);
    setTab("calendario");
  }
  function resetTodo() {
    if (!window.confirm("Esto borra jugadores, calendario y resultados. ¿Seguro?")) return;
    setPlayers([{ id: uid(), name: "Jugador 1" }, { id: uid(), name: "Jugador 2" }]);
    setVueltas(2);
    setFixtures([]);
    setTab("config");
  }
  function updateScore(fid, field, value) {
    if (value !== "" && !/^\d{0,2}$/.test(value)) return;
    setFixtures((fs) => fs.map((f) => (f.id === fid ? { ...f, [field]: value } : f)));
  }
  function nameOf(id) {
    return players.find((p) => p.id === id)?.name ?? "?";
  }

  const roundsGrouped = useMemo(() => {
    const g = {};
    fixtures.forEach((f) => {
      g[f.round] = g[f.round] || [];
      g[f.round].push(f);
    });
    return Object.entries(g).sort((a, b) => Number(a[0]) - Number(b[0]));
  }, [fixtures]);

  const chartData = standings.map((s) => ({
    name: s.name,
    Puntos: s.pts,
    Victorias: s.pg,
    Empates: s.pe,
    Derrotas: s.pp,
    "Goles a favor": s.gf,
    "Goles en contra": s.gc,
    prom: s.pj ? +(s.gf / s.pj).toFixed(2) : 0,
  }));

  const barColors = ["#FFD200", "#00E676", "#00B4FF", "#FF3B3B", "#B84EFF", "#FF9F1C", "#00E5FF", "#FF4EC4", "#7CFF4E", "#FFF04E", "#4E7CFF", "#FF6B4E"];

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: `radial-gradient(1200px 600px at 50% -10%, ${PALETTE.pitch} 0%, ${PALETTE.pitchDark} 55%, ${PALETTE.ink} 100%)`, fontFamily: "Barlow, sans-serif" }}
    >
      <style>{FONT_IMPORT}</style>

      {/* Franjas de cancha decorativas */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.05]" style={{
        backgroundImage: "repeating-linear-gradient(90deg, #ffffff 0px, #ffffff 2px, transparent 2px, transparent 80px)"
      }} />

      <div className="relative max-w-5xl mx-auto px-4 pb-16">
        {/* HERO */}
        <header className="pt-10 pb-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Trophy size={22} color={PALETTE.gold} />
            <span className="text-xs tracking-[0.35em] uppercase" style={{ color: PALETTE.gold }}>
              Marcador oficial
            </span>
            <Trophy size={22} color={PALETTE.gold} />
          </div>
          <input
            value={leagueName}
            onChange={(e) => setLeagueName(e.target.value)}
            className="bg-transparent text-center w-full outline-none border-b border-transparent focus:border-[#FFD200] transition-colors"
            style={{
              fontFamily: "Teko, sans-serif",
              fontWeight: 600,
              fontSize: "clamp(2.6rem, 8vw, 4.5rem)",
              lineHeight: 1,
              color: PALETTE.chalk,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
            }}
            aria-label="Nombre de la liga"
          />
          <div className="mt-2 text-sm flex items-center justify-center gap-3" style={{ color: PALETTE.chalkDim }}>
            <span>{players.length} jugadores</span>
            <span className="opacity-50">•</span>
            <span>{fixtures.length} partidos programados</span>
            <span className="opacity-50">•</span>
            <span className="flex items-center gap-1">
              <Save size={13} />
              {saveState === "saving" ? "guardando…" : saveState === "saved" ? "guardado" : "sincronizado"}
            </span>
          </div>
        </header>

        {/* TABS */}
        <nav className="flex gap-1 border-b overflow-x-auto" style={{ borderColor: PALETTE.cardBorder }}>
          <TabButton active={tab === "config"} onClick={() => setTab("config")} icon={Settings} label="Configurar" />
          <TabButton active={tab === "calendario"} onClick={() => setTab("calendario")} icon={CalendarDays} label="Calendario" />
          <TabButton active={tab === "tabla"} onClick={() => setTab("tabla")} icon={Table2} label="Tabla" />
          <TabButton active={tab === "stats"} onClick={() => setTab("stats")} icon={BarChart3} label="Estadísticas" />
          <TabButton active={tab === "graficos"} onClick={() => setTab("graficos")} icon={BarChart3} label="Gráficos" />
        </nav>

        <main className="mt-6">
          {/* ---------------- CONFIG ---------------- */}
          {tab === "config" && (
            <div className="space-y-6">
              <div className="rounded-lg p-5 border" style={{ background: PALETTE.card, borderColor: PALETTE.cardBorder }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="uppercase tracking-widest text-sm font-semibold" style={{ color: PALETTE.gold }}>Jugadores</h2>
                  <div className="flex gap-2">
                    <button onClick={addPlayer} disabled={players.length >= 12}
                      className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-md disabled:opacity-40"
                      style={{ background: PALETTE.pitchBright, color: PALETTE.ink }}>
                      <Plus size={14} /> Agregar
                    </button>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {players.map((p, idx) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="w-6 text-right text-xs" style={{ color: PALETTE.chalkDim, fontFamily: "Space Mono, monospace" }}>
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <input
                        value={p.name}
                        onChange={(e) => renamePlayer(p.id, e.target.value)}
                        placeholder={`Jugador ${idx + 1}`}
                        className="flex-1 rounded-md px-3 py-2 text-sm outline-none border focus:border-[#FFD200]"
                        style={{ background: "#0E1F17", borderColor: PALETTE.cardBorder, color: PALETTE.chalk }}
                      />
                      <button onClick={() => removePlayer(p.id)} disabled={players.length <= 2}
                        className="p-2 rounded-md disabled:opacity-30" style={{ background: "#3A1512", color: "#F4A19B" }}>
                        <Minus size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg p-5 border" style={{ background: PALETTE.card, borderColor: PALETTE.cardBorder }}>
                <h2 className="uppercase tracking-widest text-sm font-semibold mb-4" style={{ color: PALETTE.gold }}>Formato del torneo</h2>
                <p className="text-sm mb-3" style={{ color: PALETTE.chalkDim }}>
                  ¿Cuántas veces se enfrenta cada par de jugadores? Cada jugador disputará <b style={{ color: PALETTE.chalk }}>{totalRoundsPerPlayer}</b> partidos en total.
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {[1, 2, 3, 4, 6, 8, 10].map((v) => (
                    <button
                      key={v}
                      onClick={() => setVueltas(v)}
                      className="px-4 py-2 rounded-md text-sm font-semibold border"
                      style={{
                        borderColor: vueltas === v ? PALETTE.gold : PALETTE.cardBorder,
                        background: vueltas === v ? "rgba(255,210,0,0.15)" : "transparent",
                        color: vueltas === v ? PALETTE.gold : PALETTE.chalkDim,
                      }}
                    >
                      {v === 1 ? "1 vuelta" : `${v} vueltas`}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: PALETTE.chalkDim }}>Cantidad exacta de vueltas:</span>
                  <button onClick={() => setVueltas((v) => Math.max(1, v - 1))}
                    className="w-8 h-8 rounded-md border flex items-center justify-center" style={{ borderColor: PALETTE.cardBorder, color: PALETTE.chalkDim }}>
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={vueltas}
                    onChange={(e) => {
                      const n = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                      setVueltas(n);
                    }}
                    className="w-16 text-center rounded-md py-1.5 outline-none border focus:border-[#FFD200]"
                    style={{ background: "#061236", borderColor: PALETTE.cardBorder, color: PALETTE.chalk, fontFamily: "Space Mono, monospace" }}
                  />
                  <button onClick={() => setVueltas((v) => Math.min(50, v + 1))}
                    className="w-8 h-8 rounded-md border flex items-center justify-center" style={{ borderColor: PALETTE.cardBorder, color: PALETTE.chalkDim }}>
                    <Plus size={14} />
                  </button>
                  <span className="text-xs" style={{ color: PALETTE.chalkDim }}>(más vueltas = más partidos)</span>
                </div>
                <p className="text-xs mt-3" style={{ color: PALETTE.chalkDim }}>
                  Criterio de clasificación FIFA: puntos (victoria 3, empate 1, derrota 0) → diferencia de gol → goles a favor.
                </p>
              </div>

              <div className="flex gap-3">
                <button onClick={generarCalendario}
                  className="flex-1 py-3 rounded-md font-semibold uppercase tracking-widest text-sm"
                  style={{ background: PALETTE.gold, color: PALETTE.ink }}>
                  Generar calendario
                </button>
                <button onClick={resetTodo}
                  className="px-4 py-3 rounded-md flex items-center gap-2 text-sm border"
                  style={{ borderColor: PALETTE.cardBorder, color: PALETTE.chalkDim }}>
                  <RotateCcw size={14} /> Reiniciar
                </button>
              </div>
            </div>
          )}

          {/* ---------------- CALENDARIO ---------------- */}
          {tab === "calendario" && (
            fixtures.length === 0 ? (
              <EmptyState onGo={() => setTab("config")} text="Todavía no generaste el calendario. Configurá los jugadores primero." />
            ) : (
              <div className="space-y-5">
                {roundsGrouped.map(([round, list]) => (
                  <div key={round} className="rounded-lg border overflow-hidden" style={{ borderColor: PALETTE.cardBorder }}>
                    <div className="px-4 py-2 text-xs uppercase tracking-widest" style={{ background: "#0E1F17", color: PALETTE.gold }}>
                      Fecha {round}
                    </div>
                    <div className="divide-y" style={{ borderColor: PALETTE.cardBorder }}>
                      {list.map((f) => (
                        <div key={f.id} className="flex items-center justify-between gap-3 px-4 py-3" style={{ background: PALETTE.card }}>
                          <span className="flex-1 text-right text-sm truncate" style={{ color: PALETTE.chalk }}>{nameOf(f.home)}</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              inputMode="numeric"
                              value={f.scoreHome}
                              onChange={(e) => updateScore(f.id, "scoreHome", e.target.value)}
                              className="w-10 text-center rounded-md py-1.5 outline-none border focus:border-[#FFD200]"
                              style={{ background: "#0E1F17", borderColor: PALETTE.cardBorder, color: PALETTE.chalk, fontFamily: "Space Mono, monospace" }}
                              placeholder="-"
                            />
                            <span style={{ color: PALETTE.chalkDim }}>:</span>
                            <input
                              inputMode="numeric"
                              value={f.scoreAway}
                              onChange={(e) => updateScore(f.id, "scoreAway", e.target.value)}
                              className="w-10 text-center rounded-md py-1.5 outline-none border focus:border-[#FFD200]"
                              style={{ background: "#0E1F17", borderColor: PALETTE.cardBorder, color: PALETTE.chalk, fontFamily: "Space Mono, monospace" }}
                              placeholder="-"
                            />
                          </div>
                          <span className="flex-1 text-sm truncate" style={{ color: PALETTE.chalk }}>{nameOf(f.away)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ---------------- TABLA ---------------- */}
          {tab === "tabla" && (
            fixtures.length === 0 ? (
              <EmptyState onGo={() => setTab("config")} text="Generá el calendario para ver la tabla de posiciones." />
            ) : (
              <div className="rounded-lg border overflow-x-auto" style={{ borderColor: PALETTE.cardBorder, background: PALETTE.card }}>
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="text-left" style={{ color: PALETTE.chalkDim, background: "#0E1F17" }}>
                      <th className="px-3 py-2 font-normal uppercase text-xs tracking-widest">#</th>
                      <th className="px-3 py-2 font-normal uppercase text-xs tracking-widest">Jugador</th>
                      <th className="px-2 py-2 font-normal uppercase text-xs tracking-widest text-center">PJ</th>
                      <th className="px-2 py-2 font-normal uppercase text-xs tracking-widest text-center">PG</th>
                      <th className="px-2 py-2 font-normal uppercase text-xs tracking-widest text-center">PE</th>
                      <th className="px-2 py-2 font-normal uppercase text-xs tracking-widest text-center">PP</th>
                      <th className="px-2 py-2 font-normal uppercase text-xs tracking-widest text-center">GF</th>
                      <th className="px-2 py-2 font-normal uppercase text-xs tracking-widest text-center">GC</th>
                      <th className="px-2 py-2 font-normal uppercase text-xs tracking-widest text-center">DG</th>
                      <th className="px-3 py-2 font-normal uppercase text-xs tracking-widest text-center">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((s, i) => (
                      <tr key={s.id} className="border-t" style={{ borderColor: PALETTE.cardBorder, background: i === 0 ? "rgba(255,210,0,0.12)" : "transparent" }}>
                        <td className="px-3 py-2" style={{ color: i === 0 ? PALETTE.gold : PALETTE.chalkDim, fontFamily: "Space Mono, monospace" }}>{i + 1}</td>
                        <td className="px-3 py-2 font-semibold flex items-center gap-1.5" style={{ color: PALETTE.chalk }}>
                          {i === 0 && s.pj > 0 && <Crown size={14} color={PALETTE.gold} />}
                          {s.name}
                        </td>
                        <td className="px-2 py-2 text-center" style={{ color: PALETTE.chalkDim }}>{s.pj}</td>
                        <td className="px-2 py-2 text-center" style={{ color: PALETTE.chalkDim }}>{s.pg}</td>
                        <td className="px-2 py-2 text-center" style={{ color: PALETTE.chalkDim }}>{s.pe}</td>
                        <td className="px-2 py-2 text-center" style={{ color: PALETTE.chalkDim }}>{s.pp}</td>
                        <td className="px-2 py-2 text-center" style={{ color: PALETTE.chalkDim }}>{s.gf}</td>
                        <td className="px-2 py-2 text-center" style={{ color: PALETTE.chalkDim }}>{s.gc}</td>
                        <td className="px-2 py-2 text-center" style={{ color: s.dg > 0 ? PALETTE.pitchBright : s.dg < 0 ? PALETTE.red : PALETTE.chalkDim }}>{s.dg > 0 ? `+${s.dg}` : s.dg}</td>
                        <td className="px-3 py-2 text-center font-bold" style={{ color: PALETTE.gold, fontFamily: "Space Mono, monospace" }}>{s.pts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ---------------- ESTADÍSTICAS ---------------- */}
          {tab === "stats" && (
            fixtures.length === 0 ? (
              <EmptyState onGo={() => setTab("config")} text="Generá el calendario y cargá resultados para ver estadísticas." />
            ) : (
              <div className="space-y-6">
                {leaderPts > 0 && (
                  <div className="rounded-lg p-4 border flex items-center gap-3" style={{ background: "rgba(255,210,0,0.12)", borderColor: PALETTE.gold }}>
                    <Crown color={PALETTE.gold} />
                    <div className="text-sm" style={{ color: PALETTE.chalk }}>
                      <b>{standings[0]?.name}</b> lidera con <b>{leaderPts} pts</b>, {leaderPts - secondPts} pts de ventaja sobre el 2° puesto
                      {standings[1] ? ` (${standings[1].name})` : ""}.
                    </div>
                  </div>
                )}
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {standings.map((s) => {
                    const remaining = totalMatchesForPlayer(fixtures, s.id) - s.pj;
                    const maxPts = s.pts + remaining * 3;
                    const gap = leaderPts - s.pts;
                    const isLeader = s.id === standings[0]?.id;
                    return (
                      <div key={s.id} className="rounded-lg p-4 border" style={{ background: PALETTE.card, borderColor: PALETTE.cardBorder }}>
                        <div className="flex items-center gap-1.5 mb-3">
                          {isLeader && s.pj > 0 && <Crown size={14} color={PALETTE.gold} />}
                          <span className="font-semibold" style={{ color: PALETTE.chalk }}>{s.name}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs" style={{ color: PALETTE.chalkDim }}>
                          <div>
                            <div className="uppercase tracking-wide">% Victorias</div>
                            <div className="text-lg" style={{ fontFamily: "Space Mono, monospace", color: PALETTE.chalk }}>
                              {s.pj ? Math.round((s.pg / s.pj) * 100) : 0}%
                            </div>
                          </div>
                          <div>
                            <div className="uppercase tracking-wide">% Goles de la liga</div>
                            <div className="text-lg" style={{ fontFamily: "Space Mono, monospace", color: PALETTE.chalk }}>
                              {totalGoalsLeague ? Math.round((s.gf / totalGoalsLeague) * 100) : 0}%
                            </div>
                          </div>
                          <div>
                            <div className="uppercase tracking-wide">Prom. goles a favor</div>
                            <div className="text-lg" style={{ fontFamily: "Space Mono, monospace", color: PALETTE.chalk }}>
                              {s.pj ? (s.gf / s.pj).toFixed(2) : "0.00"}
                            </div>
                          </div>
                          <div>
                            <div className="uppercase tracking-wide">Prom. goles en contra</div>
                            <div className="text-lg" style={{ fontFamily: "Space Mono, monospace", color: PALETTE.chalk }}>
                              {s.pj ? (s.gc / s.pj).toFixed(2) : "0.00"}
                            </div>
                          </div>
                          <div>
                            <div className="uppercase tracking-wide">{isLeader ? "Ventaja sobre 2°" : "Diferencia c/ líder"}</div>
                            <div className="text-lg" style={{ fontFamily: "Space Mono, monospace", color: isLeader ? PALETTE.pitchBright : PALETTE.chalk }}>
                              {isLeader ? `+${leaderPts - secondPts}` : `-${gap}`} pts
                            </div>
                          </div>
                          <div>
                            <div className="uppercase tracking-wide">Máx. puntos posibles</div>
                            <div className="text-lg" style={{ fontFamily: "Space Mono, monospace", color: PALETTE.chalk }}>
                              {maxPts}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}

          {/* ---------------- GRAFICOS ---------------- */}
          {tab === "graficos" && (
            fixtures.length === 0 ? (
              <EmptyState onGo={() => setTab("config")} text="Generá el calendario y cargá resultados para ver gráficos." />
            ) : (
              <div className="space-y-8">
                <ChartBlock title="Puntos por jugador">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.cardBorder} />
                    <XAxis dataKey="name" stroke={PALETTE.chalkDim} tick={{ fontSize: 12 }} />
                    <YAxis stroke={PALETTE.chalkDim} tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: PALETTE.card, border: `1px solid ${PALETTE.cardBorder}`, color: PALETTE.chalk }} />
                    <Bar dataKey="Puntos" radius={[4, 4, 0, 0]}>
                      {chartData.map((_, i) => <Cell key={i} fill={barColors[i % barColors.length]} />)}
                    </Bar>
                  </BarChart>
                </ChartBlock>

                <ChartBlock title="Victorias, empates y derrotas">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.cardBorder} />
                    <XAxis dataKey="name" stroke={PALETTE.chalkDim} tick={{ fontSize: 12 }} />
                    <YAxis stroke={PALETTE.chalkDim} tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: PALETTE.card, border: `1px solid ${PALETTE.cardBorder}`, color: PALETTE.chalk }} />
                    <Legend wrapperStyle={{ fontSize: 12, color: PALETTE.chalkDim }} />
                    <Bar dataKey="Victorias" stackId="r" fill={PALETTE.pitchBright} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Empates" stackId="r" fill={PALETTE.gold} />
                    <Bar dataKey="Derrotas" stackId="r" fill={PALETTE.red} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartBlock>

                <ChartBlock title="Goles a favor vs. en contra">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.cardBorder} />
                    <XAxis dataKey="name" stroke={PALETTE.chalkDim} tick={{ fontSize: 12 }} />
                    <YAxis stroke={PALETTE.chalkDim} tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: PALETTE.card, border: `1px solid ${PALETTE.cardBorder}`, color: PALETTE.chalk }} />
                    <Legend wrapperStyle={{ fontSize: 12, color: PALETTE.chalkDim }} />
                    <Bar dataKey="Goles a favor" fill={PALETTE.pitchBright} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Goles en contra" fill={PALETTE.red} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartBlock>
              </div>
            )
          )}
        </main>

        <footer className="mt-10 text-center text-xs" style={{ color: PALETTE.chalkDim }}>
          Los resultados se guardan automáticamente y son compartidos entre quienes abran esta liga.
        </footer>
      </div>
    </div>
  );
}

function ChartBlock({ title, children }) {
  return (
    <div className="rounded-lg p-4 border" style={{ background: PALETTE.card, borderColor: PALETTE.cardBorder }}>
      <h3 className="text-sm uppercase tracking-widest mb-3" style={{ color: PALETTE.gold }}>{title}</h3>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

function EmptyState({ text, onGo }) {
  return (
    <div className="rounded-lg border p-10 text-center" style={{ borderColor: PALETTE.cardBorder, background: PALETTE.card }}>
      <p className="mb-4" style={{ color: PALETTE.chalkDim }}>{text}</p>
      <button onClick={onGo} className="px-4 py-2 rounded-md text-sm font-semibold uppercase tracking-widest"
        style={{ background: PALETTE.gold, color: PALETTE.ink }}>
        Ir a configuración
      </button>
    </div>
  );
}
