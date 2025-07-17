const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);

  socket.on('join-room', (roomID) => {
    socket.join(roomID);
    socket.to(roomID).emit('user-connected', socket.id);

    socket.on('offer', (data) => {
      socket.to(roomID).emit('offer', data);
    });

    socket.on('answer', (data) => {
      socket.to(roomID).emit('answer', data);
    });

    socket.on('ice-candidate', (data) => {
      socket.to(roomID).emit('ice-candidate', data);
    });

    socket.on('leave-room', (roomID) => {
      socket.leave(roomID);
      socket.to(roomID).emit('user-left', socket.id);
    });

    socket.on('disconnect', () => {
      socket.rooms.forEach(room => {
        if (room !== socket.id) socket.to(room).emit('user-disconnected', socket.id);
      });
      console.log('🔌 Client disconnected:', socket.id);
    });
  });
});

server.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});