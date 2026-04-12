const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let boards = {}; 

app.use(express.static(path.join(__dirname, 'public')));

// Маршрут для открытия конкретной доски
app.get('/board/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Редирект с главной на случайную доску
app.get('/', (req, res) => {
    const randomId = Math.random().toString(36).substr(2, 9);
    res.redirect(`/board/${randomId}`);
});

io.on('connection', (socket) => {
    const boardId = socket.handshake.query.boardId;
    if (!boardId) return;

    socket.join(boardId);
    if (!boards[boardId]) boards[boardId] = [];

    // Отправляем историю новому пользователю
    socket.emit('init-history', boards[boardId]);

    socket.on('new-object', (obj) => {
        if (boards[boardId]) {
            boards[boardId].push(obj);
            socket.to(boardId).emit('new-object', obj);
        }
    });

    socket.on('clear-board', () => {
        boards[boardId] = [];
        socket.to(boardId).emit('clear-board');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен: http://localhost:${PORT}`));
