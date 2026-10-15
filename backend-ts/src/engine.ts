import type {
  Position,
  GenerationMetric,
  Champion,
  SimState,
  TopAgentInfo,
  SimParams,
  ReproductionSample,
  GenerationRecord,
} from "./types.js";

export const DEFAULT_MAZE: string[] = [
  "###############",
  "#S............#",
  "#.#####.#####.#",
  "#.....#.....#.#",
  "###.#.###.#.#.#",
  "#...#.....#...#",
  "#.###########.#",
  "#.............#",
  "#.###########.#",
  "#............E#",
  "###############",
];

export const MAZE = DEFAULT_MAZE;

// 0: cima, 1: baixo, 2: esquerda, 3: direita
export const DELTAS: [number, number][] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

export const START: Position = [1, 1];
export const GOAL: Position = [13, 9];
export const POPULATION_SIZE = 100;
export const GENOME_LENGTH = 72;
export const ELITE_SIZE = 6;
export const MUTATION_RATE = 0.010;
export const TOURNAMENT_SIZE = 4;

export const posKey = (x: number, y: number): string => `${x},${y}`;

/**
 * Distâncias reais até a saída, respeitando as paredes (BFS).
 */
export function distancesToGoal(maze: string[] = MAZE): Map<string, number> {
  const distances = new Map<string, number>();
  distances.set(posKey(GOAL[0], GOAL[1]), 0);

  const queue: Position[] = [[GOAL[0], GOAL[1]]];
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    const currentDist = distances.get(posKey(x, y))!;

    for (const [dx, dy] of DELTAS) {
      const nx = x + dx;
      const ny = y + dy;
      const k = posKey(nx, ny);

      if (distances.has(k) || maze[ny]?.[nx] === "#") {
        continue;
      }

      distances.set(k, currentDist + 1);
      queue.push([nx, ny]);
    }
  }

  return distances;
}

export const DISTANCES: Map<string, number> = distancesToGoal(MAZE);

export class Agent {
  genes: number[];
  x: number = START[0];
  y: number = START[1];
  collisions: number = 0;
  revisits: number = 0;
  reached_step: number | null = null;
  min_distance: number = 30;
  visited: Set<string> = new Set([posKey(START[0], START[1])]);
  trail: Position[] = [[START[0], START[1]]];

  constructor(genes: number[], initialDist: number = 30) {
    this.genes = genes;
    this.min_distance = initialDist;
  }

  move(
    step: number,
    maze: string[] = MAZE,
    distances: Map<string, number> = DISTANCES,
    visitCounts?: number[][]
  ): void {
    if (this.reached_step !== null) {
      return;
    }

    const [dx, dy] = DELTAS[this.genes[step]];
    const nx = this.x + dx;
    const ny = this.y + dy;

    if (maze[ny]?.[nx] === "#") {
      this.collisions += 1;
    } else {
      this.x = nx;
      this.y = ny;
      const k = posKey(nx, ny);
      if (this.visited.has(k)) {
        this.revisits += 1;
      }
      this.visited.add(k);
    }

    this.trail.push([this.x, this.y]);

    if (visitCounts && visitCounts[this.y]?.[this.x] !== undefined) {
      visitCounts[this.y][this.x] += 1;
    }

    const currentDist = distances.get(posKey(this.x, this.y)) ?? 999;
    this.min_distance = Math.min(this.min_distance, currentDist);

    if (this.x === GOAL[0] && this.y === GOAL[1]) {
      this.reached_step = step + 1;
    }
  }

  score(startDist: number = 30): number {
    const progress = startDist - this.min_distance;
    const base = progress * 22 - this.collisions * 1.1 - this.revisits * 0.6;

    if (this.reached_step !== null) {
      return 2000 + (GENOME_LENGTH - this.reached_step) * 5 + base;
    }
    return base;
  }
}

export class PRNG {
  private seed: number;

  constructor(seed?: number) {
    this.seed = seed ?? Math.floor(Math.random() * 2147483647);
  }

  random(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  randrange(minOrMax: number, max?: number): number {
    if (max === undefined) {
      return Math.floor(this.random() * minOrMax);
    }
    return Math.floor(this.random() * (max - minOrMax)) + minOrMax;
  }

  sample<T>(items: T[], k: number): T[] {
    const pool = [...items];
    const result: T[] = [];
    const count = Math.min(k, pool.length);
    for (let i = 0; i < count; i++) {
      const idx = this.randrange(pool.length);
      result.push(pool.splice(idx, 1)[0]);
    }
    return result;
  }
}

export class Evolution {
  rng: PRNG;
  generation: number = 1;
  step_number: number = 0;
  agents: Agent[];
  history: GenerationMetric[] = [];
  best_ever: Champion | null = null;
  hall_of_fame: Champion[] = [];

  // Parâmetros configuráveis em tempo real
  mutation_rate: number = MUTATION_RATE;
  elite_size: number = ELITE_SIZE;
  tournament_size: number = TOURNAMENT_SIZE;

  // Labirinto dinâmico editável
  maze: string[];
  distances: Map<string, number>;

  // Heatmap de exploração (visitas na geração atual)
  visit_counts: number[][];

  // Amostra detalhada do processo de reprodução (Torneio, Crossover e Mutações)
  last_reproduction?: ReproductionSample;

  // Registro histórico das top agentes e reprodução de cada geração
  generation_records: GenerationRecord[] = [];

  constructor(seed?: number) {
    this.rng = new PRNG(seed);
    this.maze = [...DEFAULT_MAZE];
    this.distances = distancesToGoal(this.maze);
    this.visit_counts = this.createEmptyVisitCounts();

    const startDist = this.distances.get(posKey(START[0], START[1])) ?? 30;
    this.agents = Array.from({ length: POPULATION_SIZE }, () => this.newAgent(undefined, startDist));
    this.recordInitialVisits();
  }

  private createEmptyVisitCounts(): number[][] {
    return Array.from({ length: this.maze.length }, () => Array(this.maze[0].length).fill(0));
  }

  private recordInitialVisits(): void {
    if (this.visit_counts[START[1]]?.[START[0]] !== undefined) {
      this.visit_counts[START[1]][START[0]] += POPULATION_SIZE;
    }
  }

  getStartDist(): number {
    return this.distances.get(posKey(START[0], START[1])) ?? 30;
  }

  setParams(params: Partial<SimParams>): void {
    if (params.mutation_rate !== undefined) {
      this.mutation_rate = Math.max(0, Math.min(0.5, Number(params.mutation_rate)));
    }
    if (params.elite_size !== undefined) {
      this.elite_size = Math.max(0, Math.min(30, Math.floor(Number(params.elite_size))));
    }
    if (params.tournament_size !== undefined) {
      this.tournament_size = Math.max(2, Math.min(20, Math.floor(Number(params.tournament_size))));
    }
  }

  toggleWall(x: number, y: number): boolean {
    if (y < 0 || y >= this.maze.length || x < 0 || x >= this.maze[0].length) {
      return false;
    }
    // Não permite alterar Início (S), Saída (E) ou bordas externas
    if (
      (x === START[0] && y === START[1]) ||
      (x === GOAL[0] && y === GOAL[1]) ||
      x === 0 ||
      x === this.maze[0].length - 1 ||
      y === 0 ||
      y === this.maze.length - 1
    ) {
      return false;
    }

    const row = this.maze[y];
    const current = row[x];
    const newCell = current === "#" ? "." : "#";
    this.maze[y] = row.substring(0, x) + newCell + row.substring(x + 1);

    this.distances = distancesToGoal(this.maze);
    return true;
  }

  resetMaze(): void {
    this.maze = [...DEFAULT_MAZE];
    this.distances = distancesToGoal(this.maze);
    this.step_number = 0;
    this.best_ever = null;
    this.hall_of_fame = [];
    this.visit_counts = this.createEmptyVisitCounts();
    this.recordInitialVisits();
    const startDist = this.getStartDist();
    this.agents = this.agents.map((a) => new Agent(a.genes, startDist));
  }

  newAgent(genes?: number[], startDist?: number): Agent {
    const dist = startDist ?? this.getStartDist();
    const g = genes ?? Array.from({ length: GENOME_LENGTH }, () => this.rng.randrange(4));
    return new Agent(g, dist);
  }

  tick(): void {
    if (this.step_number >= GENOME_LENGTH) {
      this.evolve();
      return;
    }

    for (const agent of this.agents) {
      agent.move(this.step_number, this.maze, this.distances, this.visit_counts);
    }

    this.step_number += 1;

    if (this.step_number >= GENOME_LENGTH || this.agents.every((a) => a.reached_step !== null)) {
      this.evolve();
    }
  }

  evolve(): void {
    const startDist = this.getStartDist();
    const ranking = [...this.agents].sort((a, b) => b.score(startDist) - a.score(startDist));
    const best = ranking[0];
    const successCount = ranking.filter((a) => a.reached_step !== null).length;
    const scores = ranking.map((a) => a.score(startDist));
    const avgScore = Number((scores.reduce((acc, v) => acc + v, 0) / scores.length).toFixed(1));

    const metrics: GenerationMetric = {
      generation: this.generation,
      score: Number(best.score(startDist).toFixed(2)),
      avg_score: avgScore,
      reached: successCount,
      distance: best.min_distance,
      best_steps: best.reached_step,
    };
    this.history.push(metrics);

    const currentBestChamp: Champion = {
      score: Number(best.score(startDist).toFixed(2)),
      generation: this.generation,
      reached: best.reached_step !== null,
      steps: best.reached_step,
      genes: [...best.genes],
      trail: [...best.trail],
    };

    if (this.best_ever === null || best.score(startDist) > this.best_ever.score) {
      this.best_ever = currentBestChamp;
    }

    this.hall_of_fame.push(currentBestChamp);
    this.hall_of_fame.sort((a, b) => b.score - a.score);
    const uniqueHof: Champion[] = [];
    for (const champ of this.hall_of_fame) {
      if (!uniqueHof.some((c) => c.generation === champ.generation)) {
        uniqueHof.push(champ);
      }
      if (uniqueHof.length >= 5) break;
    }
    this.hall_of_fame = uniqueHof;

    // Elitismo configurável
    const effectiveEliteSize = Math.min(this.elite_size, POPULATION_SIZE);
    const newGenomes: number[][] = ranking.slice(0, effectiveEliteSize).map((a) => [...a.genes]);
    
    // Candidatos aos torneios com ID (1 a 100)
    const candidatesWithMeta = ranking.slice(0, 40).map((agent) => ({
      agent,
      id: this.agents.indexOf(agent) + 1,
      score: Number(agent.score(startDist).toFixed(1)),
    }));

    const tournament = () => {
      const sampled = this.rng.sample(candidatesWithMeta, this.tournament_size);
      const winner = sampled.reduce((prev, curr) =>
        curr.agent.score(startDist) > prev.agent.score(startDist) ? curr : prev
      );
      return {
        winner,
        candidates: sampled.map((c) => ({ id: c.id, score: c.score })),
      };
    };

    let totalMutationsInGen = 0;
    let sampleRecorded: ReproductionSample | undefined = undefined;

    while (newGenomes.length < POPULATION_SIZE) {
      const tourA = tournament();
      const tourB = tournament();
      const parentA = tourA.winner;
      const parentB = tourB.winner;
      const cut = this.rng.randrange(1, GENOME_LENGTH);
      const child = [...parentA.agent.genes.slice(0, cut), ...parentB.agent.genes.slice(cut)];
      const mutatedIndices: number[] = [];

      for (let i = 0; i < GENOME_LENGTH; i++) {
        if (this.rng.random() < this.mutation_rate) {
          child[i] = this.rng.randrange(4);
          mutatedIndices.push(i);
          totalMutationsInGen += 1;
        }
      }

      if (!sampleRecorded) {
        sampleRecorded = {
          parent_a: {
            id: parentA.id,
            score: parentA.score,
            genes: [...parentA.agent.genes],
          },
          parent_b: {
            id: parentB.id,
            score: parentB.score,
            genes: [...parentB.agent.genes],
          },
          tournament_a_candidates: tourA.candidates,
          tournament_b_candidates: tourB.candidates,
          cut_point: cut,
          child_genes: [...child],
          mutated_indices: mutatedIndices,
          total_mutations: 0,
          elite_count: effectiveEliteSize,
          crossover_count: POPULATION_SIZE - effectiveEliteSize,
        };
      }

      newGenomes.push(child);
    }

    const genTopAgents: TopAgentInfo[] = ranking.slice(0, 5).map((agent, rank) => ({
      rank: rank + 1,
      id: this.agents.indexOf(agent) + 1,
      score: Number(agent.score(startDist).toFixed(1)),
      distance: agent.min_distance,
      collisions: agent.collisions,
      revisits: agent.revisits,
      reached: agent.reached_step !== null,
      steps: agent.reached_step,
      trail: [...agent.trail],
      genes: [...agent.genes],
    }));

    if (sampleRecorded) {
      sampleRecorded.total_mutations = totalMutationsInGen;
      this.last_reproduction = sampleRecorded;
    }

    this.generation_records.push({
      generation: this.generation,
      best_agent: genTopAgents[0],
      top_agents: genTopAgents,
      reproduction: sampleRecorded ? { ...sampleRecorded } : undefined,
      avg_score: avgScore,
      reached_count: successCount,
    });
    if (this.generation_records.length > 50) {
      this.generation_records.shift();
    }

    this.agents = newGenomes.map((genes) => this.newAgent(genes, startDist));
    this.generation += 1;
    this.step_number = 0;

    // Reseta o mapa de calor para a nova geração
    this.visit_counts = this.createEmptyVisitCounts();
    this.recordInitialVisits();
  }

  next_generation(): void {
    const current = this.generation;
    while (this.generation === current) {
      this.tick();
    }
  }

  state(): SimState {
    const startDist = this.getStartDist();
    const indexed = this.agents.map((agent, index) => ({ agent, index }));
    indexed.sort((a, b) => b.agent.score(startDist) - a.agent.score(startDist));

    const leaderIdx = indexed[0].index;
    const current = indexed[0].agent;

    const topAgents: TopAgentInfo[] = indexed.slice(0, 5).map(({ agent, index }, rank) => ({
      rank: rank + 1,
      id: index + 1,
      score: Number(agent.score(startDist).toFixed(1)),
      distance: agent.min_distance,
      collisions: agent.collisions,
      revisits: agent.revisits,
      reached: agent.reached_step !== null,
      steps: agent.reached_step,
      trail: [...agent.trail],
      genes: [...agent.genes],
    }));

    return {
      maze: this.maze,
      population: POPULATION_SIZE,
      generation: this.generation,
      step: this.step_number,
      max_steps: GENOME_LENGTH,
      agents: this.agents.map((a) => [a.x, a.y, a.reached_step !== null]),
      leader: leaderIdx,
      leader_trail: current.trail,
      solved_now: this.agents.filter((a) => a.reached_step !== null).length,
      best_distance: current.min_distance,
      history: this.history.slice(-100),
      best_ever: this.best_ever,
      top_agents: topAgents,
      hall_of_fame: this.hall_of_fame,
      params: {
        mutation_rate: this.mutation_rate,
        elite_size: this.elite_size,
        tournament_size: this.tournament_size,
      },
      visit_counts: this.visit_counts,
      last_reproduction: this.last_reproduction,
      generation_records: this.generation_records,
    };
  }
}
