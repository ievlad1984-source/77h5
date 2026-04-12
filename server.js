const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Раздаем статичные файлы (вашу доску)
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    socket.on('draw', (data) => {
        socket.broadcast.emit('draw', data);
    });
    socket.on('clear', () => {
        socket.broadcast.emit('clear');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));