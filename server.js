const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { 
    cors: { origin: "*" },
    maxHttpBufferSize: 1e8 // 100MB для великих зображень
});
const path = require('path');

const PORT = process.env.PORT || 3000;
const boardsData = {}; 

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/:boardId', (req, res) => {
    if (req.params.boardId.includes('.')) return res.status(404).send('Not found');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

    socket.on('update-all', (data) => {
        boardsData[boardId] = data;
        socket.to(boardId).emit('init-history', data);
    });

    socket.on('undo', () => {
        if (boardsData[boardId]?.length > 0) {
            boardsData[boardId].pop();
            io.in(boardId).emit('init-history', boardsData[boardId]);
        }
    });

    socket.on('delete-board', () => {
        boardsData[boardId] = [];
        io.in(boardId).emit('board-deleted');
    });
    
    socket.on('disconnect', () => {
        console.log('Користувач відключився');
    });
});

http.listen(PORT, () => console.log(`Сервер запущен: порт ${PORT}`));
