# Backend TypeScript (Node.js + WebSocket)

Este é o backend reimplementado em **Node.js** e **TypeScript**, mantendo exatamente a mesma lógica do backend Python original:

- **Algoritmo Genético**: 100 agentes com genoma de 72 ações, elitismo, torneio de seleção, crossover de 1 ponto e mutação.
- **Oráculo BFS**: cálculo prévio da menor distância real até a saída respeitando paredes.
- **Comunicação em Tempo Real**: WebSocket compatível com o frontend React existente.

## Estrutura de Arquivos

- `src/types.ts`: Definições de tipos TypeScript (agentes, métricas, mensagens do cliente, estado da simulação).
- `src/engine.ts`: O motor do algoritmo genético (equivalente direto de `backend/engine.py`).
- `src/index.ts`: Servidor HTTP e WebSocket com `node:http` e `ws` (equivalente de `backend/main.py`).
- `src/engine.test.ts`: Testes unitários com `node:test` (equivalente de `backend/tests/test_engine.py`).

## Como Executar

### 1. Instalar dependências
```bash
npm install
```

### 2. Rodar em modo de desenvolvimento (com reload automático)
```bash
npm run dev
```

Por padrão, o servidor roda na porta **8001** (`http://localhost:8001` e `ws://localhost:8001/ws`).

Caso queira usar outra porta:
```bash
PORT=8002 npm run dev
```

### 3. Rodar os testes unitários
```bash
npm test
```

### 4. Compilar para JavaScript de produção
```bash
npm run build
npm start
```
