const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// ВАЖЛИВО: Render сам призначає порт. Якщо PORT немає, використовуємо 3000 для локалки.
const PORT = process.env.PORT || 3000;

const boardsData = {}; 

// Раздача статики (текущая папка)
app.use(express.static(__dirname));

// Правило для главной страницы
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Правило для любой доски (динамический ID)
// Используем регулярку, чтобы не перехватывать файлы типа style.css или script.js
app.get('/:boardId', (req, res) => {
    // Если в запросе есть точка (это файл, а не ID доски), пропускаем его
    if (req.params.boardId.includes('.')) {
        res.status(404).send('File not found');
    } else {
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

io.on('connection', (socket) => {
    const boardId = socket.handshake.query.boardId || 'main';
    socket.join(boardId);

    if (!boardsData[boardId]) boardsData[boardId] = [];
    socket.emit('init-history', boardsData[boardId]);

    socket.on('new-object', (obj) => {
        if (!boardsData[boardId]) boardsData[boardId] = [];
        boardsData[boardId].push(obj);
        socket.to(boardId).emit('new-object', obj);
    });

    socket.on('delete-board', (id) => {
        boardsData[id] = [];
        io.in(id).emit('board-deleted');
    });

    socket.on('undo', () => {
        if (boardsData[boardId] && boardsData[boardId].length > 0) {
            boardsData[boardId].pop();
            io.in(boardId).emit('init-history', boardsData[boardId]);
        }
    });
});

// Слушаем динамический PORT
http.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
