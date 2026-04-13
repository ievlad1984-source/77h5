const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});
const path = require('path');

const PORT = process.env.PORT || 3000;
const boardsData = {}; 

// Раздача статических файлов из папки public
app.use(express.static(path.join(__dirname, 'public')));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Динамические комнаты (доски)
app.get('/:boardId', (req, res) => {
    if (req.params.boardId.includes('.')) {
        return res.status(404).send('Not found');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    const boardId = socket.handshake.query.boardId || 'main';
    socket.join(boardId);

    if (!boardsData[boardId]) boardsData[boardId] = [];
    
    // Отправляем историю при подключении
    socket.emit('init-history', boardsData[boardId]);

    // Получение нового объекта
    socket.on('new-object', (obj) => {
        if (!boardsData[boardId]) boardsData[boardId] = [];
        boardsData[boardId].push(obj);
        socket.to(boardId).emit('new-object', obj);
    });

    // Очистка доски
    socket.on('delete-board', (id) => {
        boardsData[id] = [];
        io.in(id).emit('board-deleted');
    });

    // Отмена действия
    socket.on('undo', () => {
        if (boardsData[boardId] && boardsData[boardId].length > 0) {
            boardsData[boardId].pop();
            io.in(boardId).emit('init-history', boardsData[boardId]);
        }
    });
});

http.listen(PORT, () => {
    console.log(`Сервер работает на порту ${PORT}`);
});
