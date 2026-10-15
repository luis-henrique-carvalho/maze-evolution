"""Visualizador desktop opcional, reutiliza o mesmo motor do React."""
import pygame
from engine import Evolution, MAZE

CELL = 50
TOP = 74
WIDTH = CELL * len(MAZE[0])
HEIGHT = TOP + CELL * len(MAZE)


def main():
    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    pygame.display.set_caption("Labirinto Evolutivo — Pygame")
    font = pygame.font.SysFont("sans", 22)
    clock = pygame.time.Clock()
    sim = Evolution()
    running = False
    alive = True

    while alive:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                alive = False
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_SPACE:
                    running = not running
                elif event.key == pygame.K_r:
                    sim = Evolution()
                    running = False
                elif event.key == pygame.K_n:
                    sim.next_generation()
                    running = False

        if running:
            sim.tick()
        screen.fill((14, 23, 38))
        title = f"Geracao {sim.generation}  |  Passo {sim.step_number}/72  |  Resolvidos: {sum(a.reached_step is not None for a in sim.agents)}"
        screen.blit(font.render(title, True, (240, 245, 255)), (12, 10))
        screen.blit(font.render("Espaco: iniciar/pausar     N: proxima geracao     R: reiniciar", True, (180, 190, 208)), (12, 38))

        for y, line in enumerate(MAZE):
            for x, cell in enumerate(line):
                rect = pygame.Rect(x * CELL, TOP + y * CELL, CELL - 1, CELL - 1)
                color = (43, 60, 80) if cell == '#' else (225, 233, 241)
                if cell == 'S':
                    color = (110, 160, 240)
                elif cell == 'E':
                    color = (68, 183, 116)
                pygame.draw.rect(screen, color, rect, border_radius=3)

        for index, agent in enumerate(sim.agents):
            # Jitter determinístico para distinguir agentes na mesma célula.
            ox, oy = ((index % 10) - 4.5) * 2.6, ((index // 10) - 4.5) * 2.6
            center = (int((agent.x + 0.5) * CELL + ox), int(TOP + (agent.y + 0.5) * CELL + oy))
            color = (25, 170, 90) if agent.reached_step else (243, 125, 45)
            pygame.draw.circle(screen, color, center, 4)

        pygame.display.flip()
        clock.tick(25)
    pygame.quit()


if __name__ == "__main__":
    main()
