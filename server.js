const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let boards = {}; // Хранилище объектов для каждой доски

app.use(express.static(path.join(__dirname, 'public')));

app.get('/board/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/', (req, res) => {
    const randomId = Math.random().toString(36).substr(2, 9);
    res.redirect(`/board/${randomId}`);
});

io.on('connection', (socket) => {
    const boardId = socket.handshake.query.boardId;
    if (!boardId) return;

    socket.join(boardId);
    if (!boards[boardId]) boards[boardId] = [];

    // Отправляем историю зашедшему
    socket.emit('init-history', boards[boardId]);

    socket.on('new-object', (obj) => {
        if (boards[boardId]) {
            boards[boardId].push(obj);
            socket.to(boardId).emit('new-object', obj);
        }
    });

    socket.on('undo', () => {
        if (boards[boardId]) {
            boards[boardId].pop();
            io.to(boardId).emit('init-history', boards[boardId]);
        }
    });

    socket.on('delete-board', (id) => {
        delete boards[id];
        io.to(id).emit('board-deleted');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер: http://localhost:${PORT}`));
