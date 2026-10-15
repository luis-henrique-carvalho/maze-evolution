# Labirinto Evolutivo — Python + React (100 agentes)

Este projeto demonstra um **algoritmo genético** evoluindo sequências de ações para encontrar a saída de um labirinto.

- **Backend Python (FastAPI + WebSocket)** executa a simulação e o algoritmo genético.
- **Frontend React + TypeScript (Vite)** desenha o labirinto e os 100 agentes em `<canvas>` e controla a simulação.
- **Pygame opcional** oferece uma janela nativa que reutiliza `backend/engine.py`; não é executado dentro do React.

## Requisitos

- Python 3.10+
- Node.js 22.12+ ou 20.19+ (compatível com Vite 8)
- npm

## Como executar a versão React (recomendado)

**Opção A: Backend TypeScript (Node.js)**

```bash
cd backend-ts
npm install
npm run dev
```

**Opção B: Backend Python**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

**Terminal 2: React**

```bash
cd frontend
npm install
npm run dev
```

Abra **http://localhost:5173** e clique em **Iniciar evolução**.

> Os caminhos são calculados no servidor. O React recebe as coordenadas dos 100 agentes via WebSocket (`ws://localhost:8001/ws`) e desenha o frame na tela.

## Versão desktop com Pygame (opcional)

Depois de ativar o ambiente virtual Python:

```bash
cd backend
pip install -r requirements-pygame.txt
python pygame_viewer.py
```

Atalhos: `Espaço` iniciar/pausar, `N` avançar uma geração, `R` reiniciar.

## Entenda o treino

1. A população começa com **100 cromossomos**, cada um contendo **72 genes** (movimentos `cima`, `baixo`, `esquerda`, `direita`).
2. A cada `tick` os 100 agentes executam o gene correspondente, simultaneamente. Tentativas de atravessar paredes não alteram a posição.
3. A função de fitness recompensa aproximação da saída (distância real calculada por **BFS**) e penaliza colisões/revisitas. Encontrar a saída concede bônus elevado.
4. Após 72 ações, os indivíduos são classificados; os 6 melhores são preservados (elitismo).
5. Novos indivíduos são formados por seleção por torneio, crossover de 1 ponto e mutação por gene (7,5%).
6. Uma nova geração começa na posição inicial.

**Importante:** usar BFS para *avaliar* a distância até a saída é uma forma de recompensa modelada. O algoritmo genético não executa BFS para escolher cada movimento. Isso simplifica o problema e facilita a evolução; sem essa orientação, podem ser necessárias muitas gerações.

**Limitação:** os cromossomos representam sequências fixas de ações; não há uma rede neural aprendendo uma estratégia generalizável. Para isso, um próximo passo é substituir cada cromossomo por pesos de uma rede neural (neuroevolução/NEAT).

## Estrutura

```text
maze-evolution/
├── backend/
│   ├── engine.py                 # Algoritmo genético e labirinto
│   ├── main.py                   # FastAPI + WebSocket
│   ├── pygame_viewer.py          # Visualizador desktop opcional
│   ├── requirements.txt
│   └── requirements-pygame.txt
└── frontend/
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx
        └── styles.css
```

## Testes do motor

Na pasta `backend`:

```bash
python -m unittest discover -s tests -v
```

## Configuração

- `POPULATION_SIZE`, `GENOME_LENGTH`, `MUTATION_RATE`, `ELITE_SIZE` — `backend/engine.py`.
- O mapa está na variável `MAZE`. Para modificá-lo, mantenha todos os corredores dentro das bordas de `#` e atualize `START`/`GOAL`.
- `frontend` aceita `VITE_WS_URL` se o backend rodar em outro endereço.

## Próximas melhorias

- Mapas aleatórios resolúveis com diferentes dificuldades.
- Salvar/reproduzir o melhor cromossomo.
- Comparar taxas de mutação e fitness.
- Evoluir redes neurais, em vez de sequências fixas de ações.
