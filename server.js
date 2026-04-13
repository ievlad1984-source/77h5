const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = 3000;
const boardsData = {}; // Тут зберігаються малюнки

// 1. Цей рядок дозволяє серверу бачити картинки або стилі, якщо вони у вас в окремих файлах
app.use(express.static(__dirname));

// 2. ГОЛОВНЕ: Обробка будь-якого ID дошки
// Коли ви переходите на /some-id, сервер просто віддає ваш файл index.html
app.get('/:boardId', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Обробка головної сторінки
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    const boardId = socket.handshake.query.boardId || 'main';
    socket.join(boardId);

    if (!boardsData[boardId]) boardsData[boardId] = [];
    socket.emit('init-history', boardsData[boardId]);

    socket.on('new-object', (obj) => {
        boardsData[boardId].push(obj);
        socket.to(boardId).emit('new-object', obj);
    });

    socket.on('delete-board', (id) => {
        boardsData[id] = [];
        io.in(id).emit('board-deleted');
    });

    socket.on('undo', () => {
        if (boardsData[boardId].length > 0) {
            boardsData[boardId].pop();
            io.in(boardId).emit('init-history', boardsData[boardId]);
        }
    });
});

http.listen(PORT, () => {
    console.log(`Сервер працює: http://localhost:${PORT}`);
});
