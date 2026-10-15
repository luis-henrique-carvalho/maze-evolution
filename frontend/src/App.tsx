import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Position = [number, number];
type Agent = [number, number, boolean];

type TopAgent = {
  rank: number;
  id: number;
  score: number;
  distance: number;
  collisions: number;
  revisits: number;
  reached: boolean;
  steps: number | null;
  trail: Position[];
  genes: number[];
};

type Generation = {
  generation: number;
  score: number;
  avg_score?: number;
  reached: number;
  distance: number;
  best_steps: number | null;
};

type Champion = {
  score: number;
  generation: number;
  reached: boolean;
  steps: number | null;
  genes: number[];
  trail: Position[];
};

type CandidateSummary = {
  id: number;
  score: number;
};

type ReproductionSample = {
  parent_a: {
    id: number;
    score: number;
    genes: number[];
  };
  parent_b: {
    id: number;
    score: number;
    genes: number[];
  };
  tournament_a_candidates: CandidateSummary[];
  tournament_b_candidates: CandidateSummary[];
  cut_point: number;
  child_genes: number[];
  mutated_indices: number[];
  total_mutations: number;
  elite_count: number;
  crossover_count: number;
};

type SimParams = {
  mutation_rate: number;
  elite_size: number;
  tournament_size: number;
};

type GenerationRecord = {
  generation: number;
  best_agent: TopAgent;
  top_agents: TopAgent[];
  reproduction?: ReproductionSample;
  avg_score: number;
  reached_count: number;
};

type SimState = {
  maze: string[];
  population: number;
  generation: number;
  step: number;
  max_steps: number;
  agents: Agent[];
  leader: number;
  leader_trail: Position[];
  solved_now: number;
  best_distance: number;
  history: Generation[];
  best_ever: Champion | null;
  top_agents?: TopAgent[];
  hall_of_fame?: Champion[];
  params?: SimParams;
  visit_counts?: number[][];
  last_reproduction?: ReproductionSample;
  generation_records?: GenerationRecord[];
  running: boolean;
  delay_ms: number;
};

const CELL = 48;
const PORT = import.meta.env.VITE_WS_URL as string | undefined;
const WS_URL = PORT || `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:8001/ws`;
const ARROWS = ["↑", "↓", "←", "→"];

function MazeCanvas({
  sim,
  selectedTrail,
  showHeatmap,
  onToggleWall,
}: {
  sim: SimState;
  selectedTrail: Position[] | null;
  showHeatmap: boolean;
  onToggleWall: (x: number, y: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = sim.maze[0].length * CELL;
    const height = sim.maze.length * CELL;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    // 1. Desenha as células base do labirinto
    sim.maze.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        const px = x * CELL;
        const py = y * CELL;
        ctx.fillStyle = cell === "#" ? "#1c2d43" : "#e7edf5";
        if (cell === "S") ctx.fillStyle = "#b9d9ff";
        if (cell === "E") ctx.fillStyle = "#b9f2d0";
        ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);

        // Grade sutil
        ctx.strokeStyle = cell === "#" ? "#152438" : "#d3deec";
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
      });
    });

    // 2. Heatmap de Exploração (se ativado)
    if (showHeatmap && sim.visit_counts) {
      let maxVisits = 1;
      for (const row of sim.visit_counts) {
        for (const v of row) {
          if (v > maxVisits) maxVisits = v;
        }
      }

      sim.visit_counts.forEach((row, y) => {
        row.forEach((visits, x) => {
          if (visits > 0 && sim.maze[y]?.[x] !== "#") {
            const px = x * CELL;
            const py = y * CELL;
            const ratio = Math.min(1, visits / Math.max(6, maxVisits * 0.65));
            // De azul frio (210) passando por amarelo (60) até vermelho fogo (0)
            const hue = Math.round(210 - ratio * 210);
            ctx.fillStyle = `hsla(${hue}, 95%, 46%, ${0.25 + ratio * 0.58})`;
            ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
          }
        });
      });
    }

    // 3. Rótulos de Início 'S' e Saída 'E'
    sim.maze.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell === "S" || cell === "E") {
          const px = x * CELL;
          const py = y * CELL;
          ctx.fillStyle = cell === "S" ? "#115ba7" : "#167442";
          ctx.font = "bold 17px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(cell, px + CELL / 2, py + CELL / 2);
        }
      });
    });

    const line = (trail: Position[], color: string, width: number, dash: number[]) => {
      if (trail.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.setLineDash(dash);
      trail.forEach(([x, y], i) => {
        const px = (x + 0.5) * CELL;
        const py = (y + 0.5) * CELL;
        if (!i) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    };

    // Trajeto do Campeão Geral (Verde)
    if (sim.best_ever?.reached) line(sim.best_ever.trail, "#13b981", 4.5, []);

    // Trajeto do Líder Atual da Geração (Laranja pontilhado)
    line(sim.leader_trail, "#fd9c36", 2.5, [4, 7]);

    // Trajeto do Indivíduo Selecionado pelo usuário (Ciano elétrico sólido)
    if (selectedTrail && selectedTrail.length > 1) {
      line(selectedTrail, "#38bdf8", 4, []);
    }

    // 4. Desenha os 100 agentes
    sim.agents.forEach(([x, y, reached], i) => {
      const ox = ((i % 10) - 4.5) * 3.3;
      const oy = (Math.floor(i / 10) - 4.5) * 3.3;
      const px = (x + 0.5) * CELL + ox;
      const py = (y + 0.5) * CELL + oy;
      ctx.beginPath();
      ctx.arc(px, py, i === sim.leader ? 5 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = reached ? "#10b981" : i === sim.leader ? "#f59e0b" : "#2563eb";
      ctx.fill();
      if (i === sim.leader) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
  }, [sim, selectedTrail, showHeatmap]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor(((e.clientX - rect.left) * scaleX) / CELL);
    const y = Math.floor(((e.clientY - rect.top) * scaleY) / CELL);
    onToggleWall(x, y);
  };

  return (
    <canvas
      className="maze-canvas canvas-interactive"
      ref={canvasRef}
      onClick={handleCanvasClick}
      role="img"
      aria-label={`Labirinto interativo com ${sim.population} agentes evolutivos na geração ${sim.generation}`}
      title="Clique em qualquer célula para alternar entre caminho livre e parede!"
    />
  );
}

function Trend({ history }: { history: Generation[] }) {
  const [hovered, setHovered] = useState<Generation | null>(null);
  const items = history.slice(-40);
  if (items.length === 0) {
    return <div style={{ color: "#64748b", fontSize: "11px", padding: "40px 0", textAlign: "center" }}>O gráfico será preenchido ao concluir a primeira geração.</div>;
  }

  const allScores = [
    ...items.map((row) => row.score),
    ...items.map((row) => row.avg_score ?? row.score),
  ];
  const lo = Math.min(...allScores) - 30;
  const hi = Math.max(...allScores) + 30;
  const range = Math.max(hi - lo, 1);

  const getPoints = (accessor: (r: Generation) => number) => {
    return items
      .map((row, i) => {
        const x = 20 + (i / Math.max(items.length - 1, 1)) * 580;
        const y = 130 - ((accessor(row) - lo) / range) * 105;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  };

  const bestPoints = getPoints((r) => r.score);
  const hasAvg = items.some((r) => r.avg_score !== undefined);
  const avgPoints = hasAvg ? getPoints((r) => r.avg_score ?? r.score) : "";

  return (
    <div>
      <div className="trend-header-sm">
        <div className="trend-legend-sm">
          <span><i className="line-indicator green" /> Melhor</span>
          {hasAvg && <span><i className="line-indicator cyan" /> Média</span>}
        </div>
        <span style={{ fontSize: "10px", color: "#64748b" }}>{history.length} gens</span>
      </div>

      <svg className="trend-svg-sm" viewBox="0 0 620 145" role="img" aria-label="Evolução do fitness por geração">
        {[20, 55, 90, 125].map((y) => (
          <line key={y} x1="16" x2="604" y1={y} y2={y} stroke="#182d46" strokeDasharray="3 4" />
        ))}
        {hasAvg && (
          <polyline
            points={avgPoints}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2"
            strokeDasharray="3 3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        <polyline
          points={bestPoints}
          fill="none"
          stroke="#34d399"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {items.map((item, i) => {
          const x = 20 + (i / Math.max(items.length - 1, 1)) * 580;
          const y = 130 - ((item.score - lo) / range) * 105;
          return (
            <circle
              key={item.generation}
              cx={x}
              cy={y}
              r={hovered?.generation === item.generation ? "5" : "3"}
              fill="#34d399"
              style={{ cursor: "pointer", transition: "r 0.15s" }}
              onMouseEnter={() => setHovered(item)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}
        <text x="20" y="142" fill="#64748b" fontSize="10">Gen {items[0].generation}</text>
        <text x="604" y="142" fill="#64748b" textAnchor="end" fontSize="10">Gen {items[items.length - 1].generation}</text>
      </svg>

      {hovered && (
        <div className="trend-tooltip-sm">
          <span>Gen: <strong>{hovered.generation}</strong></span>
          <span>Melhor: <strong>{hovered.score}</strong></span>
          {hovered.avg_score !== undefined && <span>Média: <strong>{hovered.avg_score}</strong></span>}
          <span>Saída: <strong>{hovered.reached}</strong></span>
          <span>Dist: <strong>{hovered.distance}</strong></span>
        </div>
      )}
    </div>
  );
}

function TopIndividuals({
  topAgents = [],
  hallOfFame = [],
  generationRecords = [],
  currentGen = 1,
  selectedId,
  onSelectTrail,
  onSelectReproductionGen,
  activeReproductionGen,
}: {
  topAgents?: TopAgent[];
  hallOfFame?: Champion[];
  generationRecords?: GenerationRecord[];
  currentGen?: number;
  selectedId: string | null;
  onSelectTrail: (trail: Position[] | null, label: string | null, id: string | null) => void;
  onSelectReproductionGen: (gen: number) => void;
  activeReproductionGen: number | null;
}) {
  const [tab, setTab] = useState<"current" | "all" | "hall">("all");
  const [selectedHistoryGen, setSelectedHistoryGen] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const scrollStrip = (offset: number) => {
    stripRef.current?.scrollBy({ left: offset, behavior: "smooth" });
  };

  // Se o usuário alternar para "all" e ainda não tiver selecionado uma geração específica,
  // pré-seleciona a última geração concluída disponível
  const activeRecord = useMemo(() => {
    if (generationRecords.length === 0) return null;
    if (selectedHistoryGen !== null) {
      return generationRecords.find((r) => r.generation === selectedHistoryGen) ?? generationRecords[generationRecords.length - 1];
    }
    return generationRecords[generationRecords.length - 1];
  }, [generationRecords, selectedHistoryGen]);

  return (
    <section className="panel top-panel-dense">
      <div className="panel-head-compact">
        <div className="tabs-dense">
          <button
            className={`tab-btn-dense ${tab === "current" ? "active" : ""}`}
            onClick={() => setTab("current")}
          >
            <span>⚡ Em Pista (Gen {currentGen})</span>
          </button>
          <button
            className={`tab-btn-dense ${tab === "all" ? "active" : ""}`}
            onClick={() => setTab("all")}
          >
            <span>📜 Todas as Gerações ({generationRecords.length})</span>
          </button>
          <button
            className={`tab-btn-dense ${tab === "hall" ? "active" : ""}`}
            onClick={() => setTab("hall")}
          >
            <span>⭐ Hall da Fama ({hallOfFame.length})</span>
          </button>
        </div>
        <span className="tag-badge">Clique para ver rota</span>
      </div>

      {tab === "all" && generationRecords.length > 0 && (
        <>
          {/* Seletor rápido de gerações passadas com scroll horizontal e setas de navegação */}
          <div className="gen-selector-wrapper">
            <button
              className="gen-scroll-arrow"
              onClick={() => scrollStrip(-220)}
              title="Rolar gerações para a esquerda"
              aria-label="Rolar para a esquerda"
            >
              ‹
            </button>
            <div
              className="gen-selector-strip"
              ref={stripRef}
              onWheel={(e) => {
                if (e.deltaY !== 0) {
                  e.currentTarget.scrollLeft += e.deltaY;
                }
              }}
            >
              {generationRecords.map((rec) => {
                const isSelected = (activeRecord?.generation ?? -1) === rec.generation;
                return (
                  <button
                    key={rec.generation}
                    className={`gen-pill ${isSelected ? "active" : ""}`}
                    onClick={() => setSelectedHistoryGen(rec.generation)}
                    title={`Geração ${rec.generation}: Campeão Agente #${rec.best_agent.id} (${rec.best_agent.score} pts)`}
                  >
                    Gen {rec.generation} ({rec.best_agent.score.toFixed(0)} pts)
                  </button>
                );
              })}
            </div>
            <button
              className="gen-scroll-arrow"
              onClick={() => scrollStrip(220)}
              title="Rolar gerações para a direita"
              aria-label="Rolar para a direita"
            >
              ›
            </button>
          </div>

          {activeRecord && (
            <div className="gen-summary-bar">
              <div className="gen-summary-left">
                <span>🏆 Campeão Gen {activeRecord.generation}: <strong>#{activeRecord.best_agent.id}</strong> ({activeRecord.best_agent.score} pts)</span>
                <span>• Média: <strong>{activeRecord.avg_score}</strong></span>
                <span>• {activeRecord.reached_count > 0 ? `🎯 ${activeRecord.reached_count} chegaram` : `dist: ${activeRecord.best_agent.distance}`}</span>
              </div>
              {activeRecord.reproduction && (
                <button
                  className={`btn-view-rep ${activeReproductionGen === activeRecord.generation ? "active" : ""}`}
                  onClick={() => onSelectReproductionGen(activeRecord.generation)}
                  title="Inspecionar no painel de reprodução como esta geração gerou os filhos da seguinte"
                >
                  {activeReproductionGen === activeRecord.generation ? "✓ Exibindo Reprodução" : `🧬 Ver Reprodução da Gen ${activeRecord.generation}`}
                </button>
              )}
            </div>
          )}
        </>
      )}

      <div className="agent-list-scroll">
        {tab === "current" ? (
          topAgents.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: "11px", padding: "20px 0", textAlign: "center" }}>
              Aguardando agentes na pista...
            </div>
          ) : (
            topAgents.map((agent) => {
              const cardId = `current-${agent.id}`;
              const isSelected = selectedId === cardId;
              return (
                <div
                  key={agent.id}
                  className={`agent-row-compact ${isSelected ? "selected" : ""}`}
                  onClick={() => {
                    if (isSelected) {
                      onSelectTrail(null, null, null);
                    } else {
                      onSelectTrail(agent.trail, `Agente #${agent.id} (Rank #${agent.rank} • Gen ${currentGen})`, cardId);
                    }
                  }}
                  title="Clique para traçar a rota do agente no labirinto"
                >
                  <div className="row-left">
                    <span
                      className={`rank-badge-sm ${
                        agent.rank === 1
                          ? "rank-1"
                          : agent.rank === 2
                          ? "rank-2"
                          : agent.rank === 3
                          ? "rank-3"
                          : "rank-default"
                      }`}
                    >
                      {agent.rank === 1 ? "🥇 #1" : agent.rank === 2 ? "🥈 #2" : agent.rank === 3 ? "🥉 #3" : `#${agent.rank}`}
                    </span>
                    <span className="agent-id-txt">#{agent.id}</span>
                    <span className="agent-score-txt">{agent.score} pts</span>
                  </div>

                  <div className="row-center">
                    {agent.reached ? (
                      <span className="status-pill-sm success">🎯 {agent.steps} passos</span>
                    ) : (
                      <span className="status-pill-sm progress">dist: {agent.distance}</span>
                    )}
                    <div className="mini-gene-strip" title="Ações iniciais">
                      {agent.genes.slice(0, 10).map((g, idx) => (
                        <span key={idx} className={`gene-mini dir-${g}`}>
                          {ARROWS[g]}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button className="row-btn-inspect">
                    {isSelected ? "✕ Ocultar" : "🔍 Rota"}
                  </button>
                </div>
              );
            })
          )
        ) : tab === "all" ? (
          generationRecords.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: "11px", padding: "20px 0", textAlign: "center" }}>
              Nenhuma geração foi concluída ainda. Clique em "+1 Gen" ou "▶ Iniciar" para gerar o histórico!
            </div>
          ) : activeRecord ? (
            activeRecord.top_agents.map((agent) => {
              const cardId = `gen-${activeRecord.generation}-${agent.id}`;
              const isSelected = selectedId === cardId;
              return (
                <div
                  key={cardId}
                  className={`agent-row-compact ${isSelected ? "selected" : ""}`}
                  onClick={() => {
                    if (isSelected) {
                      onSelectTrail(null, null, null);
                    } else {
                      onSelectTrail(
                        agent.trail,
                        `Agente #${agent.id} (Rank #${agent.rank} na Geração ${activeRecord.generation})`,
                        cardId
                      );
                    }
                  }}
                  title="Clique para traçar o caminho deste agente no labirinto"
                >
                  <div className="row-left">
                    <span
                      className={`rank-badge-sm ${
                        agent.rank === 1
                          ? "rank-1"
                          : agent.rank === 2
                          ? "rank-2"
                          : agent.rank === 3
                          ? "rank-3"
                          : "rank-default"
                      }`}
                    >
                      {agent.rank === 1 ? "🥇 #1" : agent.rank === 2 ? "🥈 #2" : agent.rank === 3 ? "🥉 #3" : `#${agent.rank}`}
                    </span>
                    <span className="agent-id-txt">#{agent.id}</span>
                    <span className="agent-score-txt">{agent.score} pts</span>
                  </div>

                  <div className="row-center">
                    {agent.reached ? (
                      <span className="status-pill-sm success">🎯 {agent.steps} passos</span>
                    ) : (
                      <span className="status-pill-sm progress">dist: {agent.distance}</span>
                    )}
                    <div className="mini-gene-strip" title="Ações iniciais">
                      {agent.genes.slice(0, 10).map((g, idx) => (
                        <span key={idx} className={`gene-mini dir-${g}`}>
                          {ARROWS[g]}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button className="row-btn-inspect">
                    {isSelected ? "✕ Ocultar" : "🔍 Rota"}
                  </button>
                </div>
              );
            })
          ) : null
        ) : (
          hallOfFame.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: "11px", padding: "20px 0", textAlign: "center" }}>
              Nenhum recorde consolidado ainda.
            </div>
          ) : (
            hallOfFame.map((champ, idx) => {
              const cardId = `hall-${champ.generation}-${idx}`;
              const isSelected = selectedId === cardId;
              return (
                <div
                  key={cardId}
                  className={`agent-row-compact ${isSelected ? "selected" : ""}`}
                  onClick={() => {
                    if (isSelected) {
                      onSelectTrail(null, null, null);
                    } else {
                      onSelectTrail(champ.trail, `Recordista da Geração ${champ.generation}`, cardId);
                    }
                  }}
                  title="Clique para traçar o caminho deste campeão histórico"
                >
                  <div className="row-left">
                    <span className={`rank-badge-sm ${idx === 0 ? "rank-1" : idx === 1 ? "rank-2" : "rank-3"}`}>
                      {idx === 0 ? "👑 #1" : `#${idx + 1}`}
                    </span>
                    <span className="agent-id-txt">Gen {champ.generation}</span>
                    <span className="agent-score-txt">{champ.score} pts</span>
                  </div>

                  <div className="row-center">
                    {champ.reached ? (
                      <span className="status-pill-sm success">🎯 {champ.steps} passos</span>
                    ) : (
                      <span className="status-pill-sm progress">tamanho: {champ.trail.length}</span>
                    )}
                    <div className="mini-gene-strip" title="Ações iniciais">
                      {champ.genes.slice(0, 10).map((g, i) => (
                        <span key={i} className={`gene-mini dir-${g}`}>
                          {ARROWS[g]}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button className="row-btn-inspect">
                    {isSelected ? "✕ Ocultar" : "🔍 Rota"}
                  </button>
                </div>
              );
            })
          )
        )}
      </div>
    </section>
  );
}

function ReproductionViewer({
  reproduction,
  viewedGen,
  latestGen,
  onResetToLatest,
}: {
  reproduction?: ReproductionSample;
  viewedGen?: number | null;
  latestGen?: number;
  onResetToLatest?: () => void;
}) {
  if (!reproduction) {
    return (
      <section className="panel reproduction-panel">
        <div className="panel-head-compact">
          <h3>🧬 Mecanismo de Reprodução (Torneio, Crossover & Mutação)</h3>
          <span className="tag-badge">Aguardando Geração 1</span>
        </div>
        <div style={{ color: "#64748b", fontSize: "11px", padding: "14px 0", textAlign: "center" }}>
          Inicie a simulação para visualizar a seleção por torneio dos pais, corte de DNA e mutações da nova geração.
        </div>
      </section>
    );
  }

  const {
    parent_a,
    parent_b,
    tournament_a_candidates,
    tournament_b_candidates,
    cut_point,
    child_genes,
    mutated_indices,
    total_mutations,
    elite_count,
    crossover_count,
  } = reproduction;

  const mutatedSet = new Set(mutated_indices);
  const isHistorical = viewedGen !== null && viewedGen !== undefined;

  return (
    <section className="panel reproduction-panel">
      {isHistorical && (
        <div className="rep-pinned-alert">
          <span>🔍 Inspecionando reprodução histórica da <strong>Geração {viewedGen}</strong> (que gerou os filhos da Geração {viewedGen + 1})</span>
          <button className="btn-reset-latest" onClick={onResetToLatest}>
            ↩ Ver Reprodução Mais Recente
          </button>
        </div>
      )}

      <div className="panel-head-compact">
        <h3>
          🧬 Mecanismo de Reprodução {isHistorical ? `(Geração ${viewedGen} ➔ ${viewedGen + 1})` : `(Geração ${(latestGen ?? 1) > 1 ? (latestGen ?? 1) - 1 : 1} ➔ ${latestGen ?? 2})`}
        </h3>
        <span className="tag-badge">✂️ Corte no Gene #{cut_point} / 72</span>
      </div>

      {/* 1. Fita de Resumo das Estratégias */}
      <div className="rep-ribbon">
        <span className="rep-pill">💎 Elitismo: <strong>{elite_count} clones</strong></span>
        <span className="rep-pill purple">🧬 Crossover: <strong>{crossover_count} filhos</strong></span>
        <span className="rep-pill amber">⚡ Mutações: <strong>{total_mutations} genes</strong></span>
        <span className="rep-pill green">✂️ Corte: <strong>Gene #{cut_point}</strong> ({cut_point} Pai A + {72 - cut_point} Pai B)</span>
      </div>

      {/* 2. Torneios A e B Compactos */}
      <div className="tournaments-row">
        <div className="tourn-card">
          <div className="tourn-head">
            <strong>🏆 Torneio A ➔ Pai A (#{parent_a.id})</strong>
            <span style={{ color: "#38bdf8", fontWeight: 700 }}>{parent_a.score} pts</span>
          </div>
          <div className="candidate-chips-sm">
            {tournament_a_candidates.map((cand, idx) => (
              <span
                key={idx}
                className={`cand-chip-sm ${cand.id === parent_a.id ? "winner" : ""}`}
                title={`Fitness: ${cand.score} pts`}
              >
                {cand.id === parent_a.id ? "👑" : "👤"} #{cand.id}: {cand.score}
              </span>
            ))}
          </div>
        </div>

        <div className="tourn-card">
          <div className="tourn-head">
            <strong>🏆 Torneio B ➔ Pai B (#{parent_b.id})</strong>
            <span style={{ color: "#c084fc", fontWeight: 700 }}>{parent_b.score} pts</span>
          </div>
          <div className="candidate-chips-sm">
            {tournament_b_candidates.map((cand, idx) => (
              <span
                key={idx}
                className={`cand-chip-sm ${cand.id === parent_b.id ? "winner winner-b" : ""}`}
                title={`Fitness: ${cand.score} pts`}
              >
                {cand.id === parent_b.id ? "👑" : "👤"} #{cand.id}: {cand.score}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Fitas de DNA Comparativas */}
      <div className="dna-block">
        {/* Pai A */}
        <div className="dna-track-row">
          <div className="dna-track-head">
            <span className="label-a">🟦 Pai A (#{parent_a.id})</span>
            <span className="slice-hint">Genes 1 a {cut_point} herdados ({cut_point} ações)</span>
          </div>
          <div className="chromosome-bar">
            {parent_a.genes.map((gene, idx) => {
              const isInherited = idx < cut_point;
              return (
                <div
                  key={idx}
                  className={`gene-nano from-a ${!isInherited ? "dimmed" : ""}`}
                  title={`Gene #${idx + 1}: ${ARROWS[gene]} ${isInherited ? "(Herdado pelo filho)" : "(Descartado)"}`}
                >
                  {ARROWS[gene]}
                </div>
              );
            })}
          </div>
        </div>

        {/* Pai B */}
        <div className="dna-track-row">
          <div className="dna-track-head">
            <span className="label-b">🟪 Pai B (#{parent_b.id})</span>
            <span className="slice-hint">Genes {cut_point + 1} a 72 herdados ({72 - cut_point} ações)</span>
          </div>
          <div className="chromosome-bar">
            {parent_b.genes.map((gene, idx) => {
              const isInherited = idx >= cut_point;
              return (
                <div
                  key={idx}
                  className={`gene-nano from-b ${!isInherited ? "dimmed" : ""}`}
                  title={`Gene #${idx + 1}: ${ARROWS[gene]} ${isInherited ? "(Herdado pelo filho)" : "(Descartado)"}`}
                >
                  {ARROWS[gene]}
                </div>
              );
            })}
          </div>
        </div>

        {/* Filho */}
        <div className="dna-track-row" style={{ marginTop: "4px" }}>
          <div className="dna-track-head">
            <span className="label-child">🟩 Filho Gerado (Cromossomo Recombinado)</span>
            <span className="slice-hint" style={{ color: mutated_indices.length > 0 ? "#fef08a" : "#86efac" }}>
              {mutated_indices.length > 0 ? `⚡ ${mutated_indices.length} gene(s) mutados!` : "✓ Sem mutações neste filho"}
            </span>
          </div>
          <div className="chromosome-bar">
            {child_genes.map((gene, idx) => {
              const isFromA = idx < cut_point;
              const isMutated = mutatedSet.has(idx);
              return (
                <div
                  key={idx}
                  className={`gene-nano ${isFromA ? "from-a" : "from-b"} ${isMutated ? "mutated" : ""}`}
                  title={`Gene #${idx + 1}: ${ARROWS[gene]} ${isMutated ? "⚡ MUTAÇÃO ALEATÓRIA!" : isFromA ? "(Pai A)" : "(Pai B)"}`}
                >
                  {ARROWS[gene]}
                  {isMutated && <span className="mut-spark">⚡</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function App() {
  const [sim, setSim] = useState<SimState | null>(null);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedTrail, setSelectedTrail] = useState<Position[] | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [selectedReproductionGen, setSelectedReproductionGen] = useState<number | null>(null);
  const socket = useRef<WebSocket | null>(null);

  const displayedReproduction = useMemo(() => {
    if (selectedReproductionGen !== null && sim?.generation_records) {
      const found = sim.generation_records.find((r) => r.generation === selectedReproductionGen);
      if (found?.reproduction) return found.reproduction;
    }
    return sim?.last_reproduction;
  }, [selectedReproductionGen, sim?.generation_records, sim?.last_reproduction]);

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      socket.current = ws;
      ws.onopen = () => {
        if (!cancelled) {
          setConnected(true);
          setMessage(null);
        }
      };
      ws.onmessage = (event: MessageEvent<string>) => {
        if (!cancelled) setSim(JSON.parse(event.data) as SimState);
      };
      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        setMessage("Conexão indisponível. Verifique se o backend está ativo na porta 8001.");
        retry = setTimeout(connect, 2500);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => {
      cancelled = true;
      clearTimeout(retry);
      socket.current?.close();
    };
  }, []);

  const send = useCallback((type: string, extra: Record<string, unknown> = {}) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({ type, ...extra }));
    }
  }, []);

  const handleSelectTrail = (trail: Position[] | null, label: string | null, id: string | null) => {
    setSelectedTrail(trail);
    setSelectedLabel(label);
    setSelectedId(id);
  };

  const handleToggleWall = (x: number, y: number) => {
    send("toggle_wall", { x, y });
  };

  const best = sim?.best_ever;
  const progress = sim ? (sim.step / sim.max_steps) * 100 : 0;

  return (
    <div className="page">
      {/* 1. Header Compacto com Live HUD & Controles Principais */}
      <header className="command-bar">
        <div className="brand">
          <div className="brand-icon">◎</div>
          <div className="brand-text">
            <strong>EVOLAB</strong>
            <small>ALGORITMOS GENÉTICOS</small>
          </div>
        </div>

        {/* Live HUD Metrics */}
        <div className="hud-metrics">
          <div className="hud-chip">
            <small>GEN</small>
            <strong>{sim?.generation ?? "—"}</strong>
          </div>
          <div className="hud-chip">
            <small>PASSO</small>
            <strong>{sim?.step ?? 0}/{sim?.max_steps ?? 72}</strong>
            <div className="hud-step-progress">
              <div style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className={`hud-chip ${(sim?.solved_now ?? 0) > 0 ? "highlight" : ""}`}>
            <small>SAÍDA</small>
            <strong>{sim?.solved_now ?? 0}/100</strong>
          </div>
          <div className="hud-chip">
            <small>MENOR DIST</small>
            <strong>{sim?.best_distance ?? "—"}</strong>
          </div>
          <div className="hud-chip amber">
            <small>RECORDE</small>
            <strong>{best ? best.score.toFixed(1) : "—"} pts</strong>
          </div>
        </div>

        {/* Ações e Conexão */}
        <div className="hud-actions">
          <button
            disabled={!connected}
            className={`btn-cmd ${sim?.running ? "btn-pause" : "btn-play"}`}
            onClick={() => send(sim?.running ? "pause" : "start")}
            title="Iniciar ou pausar a simulação contínua"
          >
            {sim?.running ? "Ⅱ Pausar" : "▶ Iniciar"}
          </button>
          <button
            disabled={!connected}
            className="btn-cmd"
            onClick={() => send("reset")}
            title="Reiniciar a população e voltar à geração 1"
          >
            ↺ Reiniciar
          </button>
          <button
            disabled={!connected}
            className="btn-cmd"
            onClick={() => send("step")}
            title="Avançar exatamente 1 passo no labirinto"
          >
            +1 Passo
          </button>
          <button
            disabled={!connected}
            className="btn-cmd"
            onClick={() => send("generation")}
            title="Avançar imediatamente 1 geração inteira"
          >
            +1 Gen
          </button>

          <div className={`conn-status ${connected ? "online" : "offline"}`}>
            <span className="conn-dot" />
            <span>{connected ? "Online" : "Offline"}</span>
          </div>
        </div>
      </header>

      {message && <div className="alert-sm">{message}</div>}

      {/* 2. Cockpit Grid: Labirinto & Controles (Esquerda) + Reprodução & Métricas (Direita) */}
      <main className="cockpit-grid">
        {/* COLUNA ESQUERDA: Labirinto + Parâmetros em Tempo Real */}
        <aside className="cockpit-left">
          {/* Painel do Labirinto */}
          <section className="panel">
            <div className="panel-head-compact">
              <h3>🗺️ Labirinto Interativo</h3>
              <span className="tag-badge">15 × 11 células</span>
            </div>

            <div className="maze-wrapper">
              {sim ? (
                <MazeCanvas
                  sim={sim}
                  selectedTrail={selectedTrail}
                  showHeatmap={showHeatmap}
                  onToggleWall={handleToggleWall}
                />
              ) : (
                <div style={{ color: "#64748b", padding: "80px 0", textAlign: "center" }}>
                  Aguardando dados da simulação...
                </div>
              )}
            </div>

            {/* Barra de Ferramentas Compacta */}
            <div className="map-toolbar-compact">
              <button
                className={`tool-btn-sm ${showHeatmap ? "active" : ""}`}
                onClick={() => setShowHeatmap(!showHeatmap)}
                title="Alternar visualização do mapa de calor de exploração"
              >
                <span>🔥 Heatmap ({showHeatmap ? "Ligado" : "Desligado"})</span>
              </button>
              <button
                className="tool-btn-sm"
                onClick={() => {
                  handleSelectTrail(null, null, null);
                  send("reset_maze");
                }}
                title="Restaura as paredes padrão do labirinto"
              >
                <span>↺ Restaurar Labirinto</span>
              </button>
              <div className="map-hint">
                <span>✏️ Clique no mapa:</span> abre/fecha paredes
              </div>
            </div>

            {selectedTrail && (
              <div className="trail-banner">
                <span>🔍 Rota destacada: <strong>{selectedLabel}</strong></span>
                <button onClick={() => handleSelectTrail(null, null, null)}>
                  ✕ Limpar
                </button>
              </div>
            )}

            {/* Legenda Inline */}
            <div className="legend-inline">
              <span><i className="dot blue" /> Agentes</span>
              <span><i className="dot amber" /> Líder</span>
              <span><i className="dot green" /> Saída</span>
              <span><i className="line-indicator green" /> Melhor Rota</span>
              {selectedTrail && <span><i className="line-indicator cyan" /> Selecionado</span>}
            </div>
          </section>

          {/* Painel de Parâmetros Genéticos em Tempo Real */}
          <section className="panel">
            <div className="panel-head-compact">
              <h3>🧬 Parâmetros em Tempo Real</h3>
              <span className="tag-badge">Ajuste Dinâmico</span>
            </div>

            <div className="params-grid">
              {/* Mutação */}
              <div className="param-card">
                <div className="param-top">
                  <span>Taxa Mutação</span>
                  <span className="param-val">
                    {((sim?.params?.mutation_rate ?? 0.01) * 100).toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  className="param-range"
                  min="0"
                  max="0.25"
                  step="0.005"
                  value={sim?.params?.mutation_rate ?? 0.01}
                  onChange={(e) =>
                    send("set_params", { mutation_rate: Number(e.target.value) })
                  }
                />
                <div className="param-sub">0% = estagnação; &gt;10% = caótico</div>
              </div>

              {/* Elitismo */}
              <div className="param-card">
                <div className="param-top">
                  <span>Elitismo</span>
                  <span className="param-val">
                    {sim?.params?.elite_size ?? 6} indiv.
                  </span>
                </div>
                <input
                  type="range"
                  className="param-range"
                  min="0"
                  max="20"
                  step="1"
                  value={sim?.params?.elite_size ?? 6}
                  onChange={(e) =>
                    send("set_params", { elite_size: Number(e.target.value) })
                  }
                />
                <div className="param-sub">Clones dos melhores preservados</div>
              </div>

              {/* Torneio */}
              <div className="param-card">
                <div className="param-top">
                  <span>Pressão Torneio</span>
                  <span className="param-val">
                    k = {sim?.params?.tournament_size ?? 4}
                  </span>
                </div>
                <input
                  type="range"
                  className="param-range"
                  min="2"
                  max="10"
                  step="1"
                  value={sim?.params?.tournament_size ?? 4}
                  onChange={(e) =>
                    send("set_params", { tournament_size: Number(e.target.value) })
                  }
                />
                <div className="param-sub">k maior = forte pressão seletiva</div>
              </div>

              {/* Velocidade */}
              <div className="param-card">
                <div className="param-top">
                  <span>Intervalo Passo</span>
                  <span className="param-val">
                    {sim?.delay_ms ?? 60} ms
                  </span>
                </div>
                <input
                  type="range"
                  className="param-range"
                  min="15"
                  max="220"
                  step="5"
                  value={sim?.delay_ms ?? 60}
                  onChange={(e) =>
                    send("speed", { delay_ms: Number(e.target.value) })
                  }
                />
                <div className="param-sub">Menor = mais veloz a evolução</div>
              </div>
            </div>
          </section>

          {/* Mini Recorde Geral */}
          <div className="champion-mini">
            <div className="champ-stat">
              <small>RECORDE FITNESS</small>
              <strong>{best ? best.score.toFixed(1) : "—"}</strong>
            </div>
            <div className="champ-stat">
              <small>PASSOS P/ SAÍDA</small>
              <strong>{best?.steps ?? (best?.reached ? "Sim" : "—")}</strong>
            </div>
            <div className="champ-stat">
              <small>GERAÇÃO RECORDE</small>
              <strong>{best?.generation ?? "—"}</strong>
            </div>
            <div className="champ-stat">
              <small>STATUS</small>
              <strong style={{ color: best?.reached ? "#34d399" : "#38bdf8" }}>
                {best?.reached ? "OBJETIVO!" : "EM BUSCA"}
              </strong>
            </div>
          </div>
        </aside>

        {/* COLUNA DIREITA: Mecanismo de Reprodução (Topo) + Ranking & Gráfico (Base) */}
        <section className="cockpit-right">
          {/* Mecanismo de Reprodução Completo & Compacto (Com suporte a alternar entre gerações) */}
          <ReproductionViewer
            reproduction={displayedReproduction}
            viewedGen={selectedReproductionGen}
            latestGen={sim?.generation}
            onResetToLatest={() => setSelectedReproductionGen(null)}
          />

          {/* Base Dividida: Melhores Indivíduos (Esquerda) + Gráfico de Fitness & Teoria (Direita) */}
          <div className="bottom-split">
            {/* Melhores Indivíduos com suporte a todas as gerações */}
            <TopIndividuals
              topAgents={sim?.top_agents}
              hallOfFame={sim?.hall_of_fame}
              generationRecords={sim?.generation_records}
              currentGen={sim?.generation}
              selectedId={selectedId}
              onSelectTrail={handleSelectTrail}
              onSelectReproductionGen={(gen) => setSelectedReproductionGen(gen)}
              activeReproductionGen={selectedReproductionGen}
            />

            {/* Histórico de Fitness & Guia Rápido */}
            <section className="panel" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div className="panel-head-compact">
                  <h3>📈 Evolução do Fitness</h3>
                  <span className="tag-badge">Curva Histórica</span>
                </div>
                <Trend history={sim?.history ?? []} />
              </div>

              {/* Acordeão de Conceitos Didáticos */}
              <details className="edu-drawer">
                <summary>💡 Guia Rápido: Os 4 Pilares da Evolução</summary>
                <div className="edu-drawer-content">
                  <div>
                    <h6>1. Torneio</h6>
                    Sorteia <strong>k agentes</strong> e escolhe o melhor, equilibrando pressão e diversidade.
                  </div>
                  <div>
                    <h6>2. Crossover</h6>
                    Fatia o cromossomo em um ponto de corte ✂️, unindo partes de trajetórias dos pais.
                  </div>
                  <div>
                    <h6>3. Mutação</h6>
                    Altera direções com probabilidade ⚡, evitando estagnação em becos sem saída.
                  </div>
                  <div>
                    <h6>4. Elitismo</h6>
                    Preserva cópias idênticas dos campeões diretos para a próxima geração.
                  </div>
                </div>
              </details>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
