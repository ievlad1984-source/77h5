const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;
const boardsData = {}; 

// 1. Вказуємо, що статичні файли (картинки, стилі) лежать у папці public
app.use(express.static(path.join(__dirname, 'public')));

// 2. Головна сторінка — тепер шлях веде в public/index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 3. Динамічні дошки — теж шлях у public/index.html
app.get('/:boardId', (req, res) => {
    if (req.params.boardId.includes('.')) {
        res.status(404).send('File not found');
    } else {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

http.listen(PORT, () => {
    console.log(`Сервер працює на порту ${PORT}`);
});
