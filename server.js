import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const players = new Map();

io.on("connection", (socket) => {
  socket.on("player:join", ({ uid, name }) => {
    players.set(socket.id, {
      id: socket.id,
      uid,
      name,
      x: 0,
      y: 8,
      z: 0,
      yaw: 0,
      pitch: 0
    });

    socket.emit("world:state", Array.from(players.values()));
    socket.broadcast.emit("player:joined", players.get(socket.id));
  });

  socket.on("player:update", (data) => {
    const current = players.get(socket.id);
    if (!current) return;

    const next = {
      ...current,
      x: Number(data.x) || 0,
      y: Number(data.y) || 0,
      z: Number(data.z) || 0,
      yaw: Number(data.yaw) || 0,
      pitch: Number(data.pitch) || 0
    };

    players.set(socket.id, next);
    socket.broadcast.emit("player:moved", next);
  });

  socket.on("disconnect", () => {
    if (!players.has(socket.id)) return;

    players.delete(socket.id);
    socket.broadcast.emit("player:left", socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
