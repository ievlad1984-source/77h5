const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Хранилище историй для разных досок: { "board1": [...], "my-room": [...] }
let boards = {}; 

app.use(express.static(path.join(__dirname, 'public')));

// Любой путь после /board/ будет открывать файл index.html
app.get('/board/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    // Получаем имя комнаты из URL, который прислал клиент
    const boardId = socket.handshake.query.boardId;
    if (!boardId) return;

    socket.join(boardId); // Пользователь заходит в конкретную комнату

    // Если доски еще нет, создаем пустую историю
    if (!boards[boardId]) boards[boardId] = [];

    // Отправляем историю только этой конкретной доски
    socket.emit('init-history', boards[boardId]);

    socket.on('new-object', (obj) => {
        boards[boardId].push(obj);
        // Рассылаем только участникам этой комнаты
        socket.to(boardId).emit('new-object', obj);
    });

    socket.on('clear-board', () => {
        boards[boardId] = [];
        socket.to(boardId).emit('clear-board');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер: порт ${PORT}`));
