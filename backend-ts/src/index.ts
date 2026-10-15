import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { Evolution } from "./engine.js";
import type { ClientMessage, FullSimState } from "./types.js";

const PORT = Number(process.env.PORT) || 8001;

const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "", `http://${request.headers.host}`);
  if (url.pathname === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws: WebSocket) => {
  let sim = new Evolution();
  let running = false;
  let delayMs = 60;
  let timer: NodeJS.Timeout | null = null;

  const sendState = () => {
    if (ws.readyState === WebSocket.OPEN) {
      const payload: FullSimState = {
        ...sim.state(),
        running,
        delay_ms: delayMs,
      };
      ws.send(JSON.stringify(payload));
    }
  };

  const stopLoop = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const scheduleNextTick = () => {
    stopLoop();
    if (!running) return;

    timer = setTimeout(() => {
      if (!running || ws.readyState !== WebSocket.OPEN) return;
      sim.tick();
      sendState();
      scheduleNextTick();
    }, delayMs);
  };

  // Envia estado inicial da simulação ao conectar
  sendState();

  ws.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as ClientMessage;

      switch (message.type) {
        case "start":
          running = true;
          scheduleNextTick();
          break;

        case "pause":
          running = false;
          stopLoop();
          break;

        case "reset":
          running = false;
          stopLoop();
          sim = new Evolution();
          break;

        case "step":
          running = false;
          stopLoop();
          sim.tick();
          break;

        case "generation":
          running = false;
          stopLoop();
          sim.next_generation();
          break;

        case "speed":
          delayMs = Math.max(15, Math.min(500, Number(message.delay_ms ?? 60)));
          if (running) {
            scheduleNextTick();
          }
          break;

        case "set_params":
          sim.setParams({
            mutation_rate: message.mutation_rate,
            elite_size: message.elite_size,
            tournament_size: message.tournament_size,
          });
          break;

        case "toggle_wall":
          if (typeof message.x === "number" && typeof message.y === "number") {
            sim.toggleWall(message.x, message.y);
          }
          break;

        case "reset_maze":
          running = false;
          stopLoop();
          sim.resetMaze();
          break;
      }

      sendState();
    } catch (err) {
      console.error("Erro ao processar mensagem do WebSocket:", err);
    }
  });

  ws.on("close", () => {
    stopLoop();
  });

  ws.on("error", (err) => {
    console.error("Erro no WebSocket:", err);
    stopLoop();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor TypeScript rodando em http://localhost:${PORT}`);
  console.log(`🔌 WebSocket disponível em ws://localhost:${PORT}/ws`);
});
