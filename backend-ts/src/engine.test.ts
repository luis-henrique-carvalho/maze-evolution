import test from "node:test";
import assert from "node:assert/strict";
import { Evolution, DISTANCES, GOAL, MAZE, POPULATION_SIZE, START, posKey } from "./engine.js";

test("maze connected and valid", () => {
  assert.ok(DISTANCES.has(posKey(START[0], START[1])));
  assert.equal(DISTANCES.get(posKey(GOAL[0], GOAL[1])), 0);
  const rowLengths = new Set(MAZE.map((row) => row.length));
  assert.equal(rowLengths.size, 1);
});

test("one tick moves all agents", () => {
  const evo = new Evolution(5);
  evo.tick();
  assert.equal(evo.step_number, 1);
  assert.equal(evo.agents.length, POPULATION_SIZE);
  assert.ok(evo.agents.every((agent) => agent.trail.length === 2));
});

test("evolution keeps population and updates generation", () => {
  const evo = new Evolution(5);
  evo.next_generation();
  assert.equal(evo.generation, 2);
  assert.equal(evo.step_number, 0);
  assert.equal(evo.agents.length, POPULATION_SIZE);
  assert.equal(evo.history.length, 1);
  assert.notEqual(evo.best_ever, null);
});

test("agent can follow known valid path to goal", () => {
  // Superior: 12 movimentos para a direita (3); lateral: 8 para baixo (1)
  const genes = [...Array(12).fill(3), ...Array(8).fill(1), ...Array(52).fill(0)];
  const evo = new Evolution(5);
  const agent = evo.newAgent(genes);

  for (let i = 0; i < 20; i++) {
    agent.move(i);
  }

  assert.deepEqual([agent.x, agent.y], GOAL);
  assert.equal(agent.reached_step, 20);
});
