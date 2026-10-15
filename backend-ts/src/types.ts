export type Position = [number, number];

export type AgentTuple = [number, number, boolean];

export interface TopAgentInfo {
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
}

export interface GenerationMetric {
  generation: number;
  score: number;
  avg_score: number;
  reached: number;
  distance: number;
  best_steps: number | null;
}

export interface Champion {
  score: number;
  generation: number;
  reached: boolean;
  steps: number | null;
  genes: number[];
  trail: Position[];
}

export interface SimParams {
  mutation_rate: number;
  elite_size: number;
  tournament_size: number;
}

export interface CandidateSummary {
  id: number;
  score: number;
}

export interface ReproductionSample {
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
}

export interface GenerationRecord {
  generation: number;
  best_agent: TopAgentInfo;
  top_agents: TopAgentInfo[];
  reproduction?: ReproductionSample;
  avg_score: number;
  reached_count: number;
}

export interface SimState {
  maze: string[];
  population: number;
  generation: number;
  step: number;
  max_steps: number;
  agents: AgentTuple[];
  leader: number;
  leader_trail: Position[];
  solved_now: number;
  best_distance: number;
  history: GenerationMetric[];
  best_ever: Champion | null;
  top_agents: TopAgentInfo[];
  hall_of_fame: Champion[];
  params: SimParams;
  visit_counts: number[][];
  last_reproduction?: ReproductionSample;
  generation_records?: GenerationRecord[];
}

export interface FullSimState extends SimState {
  running: boolean;
  delay_ms: number;
}

export type ClientMessage =
  | { type: "start" }
  | { type: "pause" }
  | { type: "reset" }
  | { type: "step" }
  | { type: "generation" }
  | { type: "speed"; delay_ms?: number }
  | { type: "set_params"; mutation_rate?: number; elite_size?: number; tournament_size?: number }
  | { type: "toggle_wall"; x: number; y: number }
  | { type: "reset_maze" };
