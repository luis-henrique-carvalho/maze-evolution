"""Servidor de simulação para interface React."""
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from engine import Evolution

app = FastAPI(title="Labirinto Evolutivo")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.websocket("/ws")
async def stream(websocket: WebSocket):
    await websocket.accept()
    sim = Evolution()
    running = False
    delay_ms = 60

    async def respond():
        await websocket.send_json({**sim.state(), "running": running, "delay_ms": delay_ms})

    await respond()
    try:
        while True:
            if running:
                try:
                    message = await asyncio.wait_for(websocket.receive_json(), timeout=delay_ms / 1000)
                except asyncio.TimeoutError:
                    sim.tick()
                    await respond()
                    continue
            else:
                message = await websocket.receive_json()

            command = message.get("type")
            if command == "start":
                running = True
            elif command == "pause":
                running = False
            elif command == "reset":
                sim = Evolution()
                running = False
            elif command == "step":
                running = False
                sim.tick()
            elif command == "generation":
                running = False
                sim.next_generation()
            elif command == "speed":
                delay_ms = max(15, min(500, int(message.get("delay_ms", 60))))
            elif command == "set_params":
                sim.set_params(
                    mutation_rate=message.get("mutation_rate"),
                    elite_size=message.get("elite_size"),
                    tournament_size=message.get("tournament_size"),
                )
            elif command == "toggle_wall":
                if "x" in message and "y" in message:
                    sim.toggle_wall(int(message["x"]), int(message["y"]))
            elif command == "reset_maze":
                sim.reset_maze()
            await respond()
    except WebSocketDisconnect:
        pass
