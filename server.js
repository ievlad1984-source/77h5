const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let boards = {}; 

app.use(express.static(path.join(__dirname, 'public')));

app.get('/board/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API для получения списка досок
app.get('/api/boards', (req, res) => {
    res.json(Object.keys(boards));
});

io.on('connection', (socket) => {
    const boardId = socket.handshake.query.boardId;
    if (!boardId || boardId === 'null') return;

    socket.join(boardId);
    if (!boards[boardId]) {
        boards[boardId] = [];
        io.emit('update-boards-list', Object.keys(boards)); // Сообщаем всем о новой доске
    }

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

    // Удаление конкретной доски
    socket.on('delete-board', (id) => {
        delete boards[id];
        io.emit('update-boards-list', Object.keys(boards));
        io.to(id).emit('board-deleted'); // Выгоняем пользователей из этой доски
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер: http://localhost:${PORT}`));
