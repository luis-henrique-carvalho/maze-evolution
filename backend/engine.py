"""Motor independente de interface para um algoritmo genético em labirinto."""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
import random
from typing import Optional

MAZE = [
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
]

# 0: cima, 1: baixo, 2: esquerda, 3: direita
DELTAS = [(0, -1), (0, 1), (-1, 0), (1, 0)]
START = (1, 1)
GOAL = (13, 9)
POPULATION_SIZE = 100
GENOME_LENGTH = 72
ELITE_SIZE = 6
MUTATION_RATE = 0.010
TOURNAMENT_SIZE = 4


def distances_to_goal(maze: Optional[list[str]] = None) -> dict[tuple[int, int], int]:
    """Distâncias reais até a saída, respeitando as paredes (BFS)."""
    grid = maze if maze is not None else MAZE
    distances = {GOAL: 0}
    queue = deque([GOAL])
    while queue:
        x, y = queue.popleft()
        for dx, dy in DELTAS:
            nx, ny = x + dx, y + dy
            if (nx, ny) in distances or grid[ny][nx] == "#":
                continue
            distances[(nx, ny)] = distances[(x, y)] + 1
            queue.append((nx, ny))
    return distances


DISTANCES = distances_to_goal()
assert START in DISTANCES, "Labirinto deve ter caminho até a saída"


@dataclass
class Agent:
    genes: list[int]
    x: int = START[0]
    y: int = START[1]
    collisions: int = 0
    revisits: int = 0
    reached_step: Optional[int] = None
    min_distance: int = 30
    visited: set[tuple[int, int]] = field(default_factory=lambda: {START})
    trail: list[tuple[int, int]] = field(default_factory=lambda: [START])

    def move(self, step: int, maze: Optional[list[str]] = None, distances: Optional[dict[tuple[int, int], int]] = None, visit_counts: Optional[list[list[int]]] = None) -> None:
        if self.reached_step is not None:
            return
        grid = maze if maze is not None else MAZE
        dists = distances if distances is not None else DISTANCES
        dx, dy = DELTAS[self.genes[step]]
        nx, ny = self.x + dx, self.y + dy
        if grid[ny][nx] == "#":
            self.collisions += 1
        else:
            self.x, self.y = nx, ny
            if (nx, ny) in self.visited:
                self.revisits += 1
            self.visited.add((nx, ny))
        self.trail.append((self.x, self.y))
        if visit_counts is not None and 0 <= self.y < len(visit_counts) and 0 <= self.x < len(visit_counts[0]):
            visit_counts[self.y][self.x] += 1
        cur_dist = dists.get((self.x, self.y), 999)
        self.min_distance = min(self.min_distance, cur_dist)
        if (self.x, self.y) == GOAL:
            self.reached_step = step + 1

    def score(self, start_dist: int = 30) -> float:
        progress = start_dist - self.min_distance
        base = progress * 22 - self.collisions * 1.1 - self.revisits * 0.6
        if self.reached_step is not None:
            return 2000 + (GENOME_LENGTH - self.reached_step) * 5 + base
        return base


class Evolution:
    def __init__(self, seed: Optional[int] = None):
        self.rng = random.Random(seed)
        self.generation = 1
        self.step_number = 0
        self.maze = list(MAZE)
        self.distances = distances_to_goal(self.maze)
        self.mutation_rate = MUTATION_RATE
        self.elite_size = ELITE_SIZE
        self.tournament_size = TOURNAMENT_SIZE
        self.visit_counts = [[0] * len(self.maze[0]) for _ in range(len(self.maze))]
        self.visit_counts[START[1]][START[0]] += POPULATION_SIZE
        start_dist = self.distances.get(START, 30)
        self.agents = [self.new_agent(None, start_dist) for _ in range(POPULATION_SIZE)]
        self.history: list[dict] = []
        self.best_ever: Optional[dict] = None
        self.hall_of_fame: list[dict] = []
        self.generation_records: list[dict] = []

    def set_params(self, mutation_rate: Optional[float] = None, elite_size: Optional[int] = None, tournament_size: Optional[int] = None) -> None:
        if mutation_rate is not None:
            self.mutation_rate = max(0.0, min(0.5, float(mutation_rate)))
        if elite_size is not None:
            self.elite_size = max(0, min(30, int(elite_size)))
        if tournament_size is not None:
            self.tournament_size = max(2, min(20, int(tournament_size)))

    def toggle_wall(self, x: int, y: int) -> bool:
        if y < 0 or y >= len(self.maze) or x < 0 or x >= len(self.maze[0]):
            return False
        if (x, y) == START or (x, y) == GOAL or x == 0 or x == len(self.maze[0]) - 1 or y == 0 or y == len(self.maze) - 1:
            return False
        row = self.maze[y]
        new_char = "." if row[x] == "#" else "#"
        self.maze[y] = row[:x] + new_char + row[x + 1:]
        self.distances = distances_to_goal(self.maze)
        return True

    def reset_maze(self) -> None:
        self.maze = list(MAZE)
        self.distances = distances_to_goal(self.maze)
        self.step_number = 0
        self.best_ever = None
        self.hall_of_fame = []
        self.generation_records = []
        self.visit_counts = [[0] * len(self.maze[0]) for _ in range(len(self.maze))]
        self.visit_counts[START[1]][START[0]] += POPULATION_SIZE
        start_dist = self.get_start_dist()
        self.agents = [Agent(a.genes, min_distance=start_dist) for a in self.agents]

    def get_start_dist(self) -> int:
        return self.distances.get(START, 30)

    def new_agent(self, genes: Optional[list[int]] = None, start_dist: Optional[int] = None) -> Agent:
        dist = start_dist if start_dist is not None else self.get_start_dist()
        g = genes if genes is not None else [self.rng.randrange(4) for _ in range(GENOME_LENGTH)]
        return Agent(g, min_distance=dist)

    def tick(self) -> None:
        """Move os 100 agentes exatamente um passo, simultaneamente."""
        if self.step_number >= GENOME_LENGTH:
            self.evolve()
            return
        for agent in self.agents:
            agent.move(self.step_number, self.maze, self.distances, self.visit_counts)
        self.step_number += 1
        if self.step_number >= GENOME_LENGTH or all(a.reached_step is not None for a in self.agents):
            self.evolve()

    def evolve(self) -> None:
        start_dist = self.get_start_dist()
        ranking = sorted(self.agents, key=lambda agent: agent.score(start_dist), reverse=True)
        best = ranking[0]
        success_count = sum(a.reached_step is not None for a in ranking)
        scores = [a.score(start_dist) for a in ranking]
        avg_score = round(sum(scores) / len(scores), 1)
        metrics = {
            "generation": self.generation,
            "score": round(best.score(start_dist), 2),
            "avg_score": avg_score,
            "reached": success_count,
            "distance": best.min_distance,
            "best_steps": best.reached_step,
        }
        self.history.append(metrics)

        current_champ = {
            "score": round(best.score(start_dist), 2),
            "generation": self.generation,
            "reached": best.reached_step is not None,
            "steps": best.reached_step,
            "genes": best.genes.copy(),
            "trail": best.trail.copy(),
        }

        if self.best_ever is None or best.score(start_dist) > self.best_ever["score"]:
            self.best_ever = current_champ

        self.hall_of_fame.append(current_champ)
        self.hall_of_fame.sort(key=lambda c: c["score"], reverse=True)
        unique_hof = []
        for c in self.hall_of_fame:
            if not any(x["generation"] == c["generation"] for x in unique_hof):
                unique_hof.append(c)
            if len(unique_hof) >= 5:
                break
        self.hall_of_fame = unique_hof

        # Elitismo configurável
        eff_elite = min(self.elite_size, POPULATION_SIZE)
        new_genomes = [a.genes.copy() for a in ranking[:eff_elite]]
        candidates_with_meta = [
            {"agent": a, "id": self.agents.index(a) + 1, "score": round(a.score(start_dist), 1)}
            for a in ranking[:40]
        ]

        def tournament():
            sample_size = min(len(candidates_with_meta), self.tournament_size)
            sampled = self.rng.sample(candidates_with_meta, sample_size)
            winner = max(sampled, key=lambda c: c["agent"].score(start_dist))
            return {
                "winner": winner,
                "candidates": [{"id": c["id"], "score": c["score"]} for c in sampled],
            }

        total_mutations_in_gen = 0
        sample_recorded = None

        while len(new_genomes) < POPULATION_SIZE:
            tour_a = tournament()
            tour_b = tournament()
            parent_a = tour_a["winner"]
            parent_b = tour_b["winner"]
            cut = self.rng.randrange(1, GENOME_LENGTH)
            child = parent_a["agent"].genes[:cut] + parent_b["agent"].genes[cut:]
            mutated_indices = []

            for i in range(GENOME_LENGTH):
                if self.rng.random() < self.mutation_rate:
                    child[i] = self.rng.randrange(4)
                    mutated_indices.append(i)
                    total_mutations_in_gen += 1

            if sample_recorded is None:
                sample_recorded = {
                    "parent_a": {
                        "id": parent_a["id"],
                        "score": parent_a["score"],
                        "genes": parent_a["agent"].genes.copy(),
                    },
                    "parent_b": {
                        "id": parent_b["id"],
                        "score": parent_b["score"],
                        "genes": parent_b["agent"].genes.copy(),
                    },
                    "tournament_a_candidates": tour_a["candidates"],
                    "tournament_b_candidates": tour_b["candidates"],
                    "cut_point": cut,
                    "child_genes": child.copy(),
                    "mutated_indices": mutated_indices,
                    "total_mutations": 0,
                    "elite_count": eff_elite,
                    "crossover_count": POPULATION_SIZE - eff_elite,
                }

            new_genomes.append(child)

        gen_top_agents = [
            {
                "rank": rank + 1,
                "id": self.agents.index(agent) + 1,
                "score": round(agent.score(start_dist), 1),
                "distance": agent.min_distance,
                "collisions": agent.collisions,
                "revisits": agent.revisits,
                "reached": agent.reached_step is not None,
                "steps": agent.reached_step,
                "trail": agent.trail.copy(),
                "genes": agent.genes.copy(),
            }
            for rank, agent in enumerate(ranking[:5])
        ]

        if sample_recorded is not None:
            sample_recorded["total_mutations"] = total_mutations_in_gen
            self.last_reproduction = sample_recorded

        self.generation_records.append({
            "generation": self.generation,
            "best_agent": gen_top_agents[0],
            "top_agents": gen_top_agents,
            "reproduction": sample_recorded,
            "avg_score": avg_score,
            "reached_count": success_count,
        })
        if len(self.generation_records) > 50:
            self.generation_records.pop(0)

        self.agents = [self.new_agent(genes, start_dist) for genes in new_genomes]
        self.generation += 1
        self.step_number = 0
        self.visit_counts = [[0] * len(self.maze[0]) for _ in range(len(self.maze))]
        self.visit_counts[START[1]][START[0]] += POPULATION_SIZE

    def next_generation(self) -> None:
        current = self.generation
        while self.generation == current:
            self.tick()

    def state(self) -> dict:
        start_dist = self.get_start_dist()
        indexed = [(agent, idx) for idx, agent in enumerate(self.agents)]
        indexed.sort(key=lambda pair: pair[0].score(start_dist), reverse=True)
        leader = indexed[0][1]
        current = indexed[0][0]

        top_agents = [
            {
                "rank": rank + 1,
                "id": idx + 1,
                "score": round(agent.score(start_dist), 1),
                "distance": agent.min_distance,
                "collisions": agent.collisions,
                "revisits": agent.revisits,
                "reached": agent.reached_step is not None,
                "steps": agent.reached_step,
                "trail": agent.trail.copy(),
                "genes": agent.genes.copy(),
            }
            for rank, (agent, idx) in enumerate(indexed[:5])
        ]

        return {
            "maze": self.maze,
            "population": POPULATION_SIZE,
            "generation": self.generation,
            "step": self.step_number,
            "max_steps": GENOME_LENGTH,
            "agents": [[agent.x, agent.y, agent.reached_step is not None] for agent in self.agents],
            "leader": leader,
            "leader_trail": current.trail,
            "solved_now": sum(a.reached_step is not None for a in self.agents),
            "best_distance": current.min_distance,
            "history": self.history[-100:],
            "best_ever": self.best_ever,
            "top_agents": top_agents,
            "hall_of_fame": self.hall_of_fame,
            "params": {
                "mutation_rate": self.mutation_rate,
                "elite_size": self.elite_size,
                "tournament_size": self.tournament_size,
            },
            "visit_counts": self.visit_counts,
            "last_reproduction": getattr(self, "last_reproduction", None),
            "generation_records": self.generation_records,
        }
