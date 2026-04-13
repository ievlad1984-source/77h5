const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = 3000;

// Хранилище данных для досок (в памяти сервера)
const boardsData = {};

// Раздача статических файлов (CSS, JS из папки public, если они есть)
app.use(express.static('public'));

// ГЛАВНОЕ ПРАВИЛО: Любой путь, кроме статики, отдает файл index.html
app.get('/:boardId', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Если зашли просто на корень / , тоже отдаем index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Работа с сокетами
io.on('connection', (socket) => {
    const boardId = socket.handshake.query.boardId || 'main';
    socket.join(boardId);

    // Создаем историю для доски, если её еще нет
    if (!boardsData[boardId]) {
        boardsData[boardId] = [];
    }

    // Отправляем историю новому пользователю
    socket.emit('init-history', boardsData[boardId]);

    // Принимаем новый объект
    socket.on('new-object', (obj) => {
        boardsData[boardId].push(obj);
        // Рассылаем всем в этой комнате, кроме отправителя
        socket.to(boardId).emit('new-object', obj);
    });

    // Удаление доски
    socket.on('delete-board', (id) => {
        boardsData[id] = [];
        io.in(id).emit('board-deleted');
    });

    // Отмена действия (Undo)
    socket.on('undo', () => {
        if (boardsData[boardId].length > 0) {
            boardsData[boardId].pop();
            io.in(boardId).emit('init-history', boardsData[boardId]);
        }
    });
});

http.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
});
