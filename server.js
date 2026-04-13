const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { 
    cors: { origin: "*" },
    maxHttpBufferSize: 1e7 // Збільшено ліміт до 10МБ для великих картинок
});
const path = require('path');

const PORT = process.env.PORT || 3000;
const boardsData = {}; 

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    const id = Math.random().toString(36).substring(2, 8);
    res.redirect(`/${id}`);
});

app.get('/:boardId', (req, res) => {
    if (req.params.boardId.includes('.')) return res.status(404).send('Not found');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    const boardId = socket.handshake.query.boardId || 'main';
    socket.join(boardId);

    if (!boardsData[boardId]) boardsData[boardId] = [];
    socket.emit('init-history', boardsData[boardId]);

    // Трансляція "процесу" (лінія, що малюється прямо зараз)
    socket.on('drawing-progress', (data) => {
        socket.to(boardId).emit('drawing-progress', { ...data, userId: socket.id });
    });

    // Фіксація готового об'єкта
    socket.on('new-object', (obj) => {
        boardsData[boardId].push(obj);
        socket.to(boardId).emit('new-object', obj);
        socket.to(boardId).emit('clear-progress', socket.id); // Очистити чернетку у інших
    });

    socket.on('undo', () => {
        if (boardsData[boardId]?.length > 0) {
            boardsData[boardId].pop();
            io.in(boardId).emit('init-history', boardsData[boardId]);
        }
    });

    socket.on('disconnect', () => {
        io.in(boardId).emit('clear-progress', socket.id);
    });
});

http.listen(PORT, () => console.log(`Сервер: http://localhost:${PORT}`));
