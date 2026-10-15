import unittest
from engine import Evolution, DISTANCES, GOAL, MAZE, POPULATION_SIZE, START


class EvolutionTests(unittest.TestCase):
    def test_maze_connected(self):
        self.assertIn(START, DISTANCES)
        self.assertEqual(DISTANCES[GOAL], 0)
        self.assertEqual(len({len(row) for row in MAZE}), 1)

    def test_one_tick_moves_all(self):
        evo = Evolution(seed=5)
        evo.tick()
        self.assertEqual(evo.step_number, 1)
        self.assertEqual(len(evo.agents), POPULATION_SIZE)
        self.assertTrue(all(len(agent.trail) == 2 for agent in evo.agents))

    def test_evolution_keeps_population(self):
        evo = Evolution(seed=5)
        evo.next_generation()
        self.assertEqual(evo.generation, 2)
        self.assertEqual(evo.step_number, 0)
        self.assertEqual(len(evo.agents), POPULATION_SIZE)
        self.assertEqual(len(evo.history), 1)
        self.assertIsNotNone(evo.best_ever)

    def test_agent_can_follow_known_valid_path(self):
        # Superior: doze movimentos para direita; lateral: oito para baixo.
        genes = [3] * 12 + [1] * 8 + [0] * 52
        evo = Evolution(seed=5)
        agent = evo.new_agent(genes)
        for i in range(20):
            agent.move(i)
        self.assertEqual((agent.x, agent.y), GOAL)
        self.assertEqual(agent.reached_step, 20)


if __name__ == "__main__":
    unittest.main()
