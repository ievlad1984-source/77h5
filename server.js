const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { 
    cors: { 
        origin: "*",
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 1e8
});
const path = require('path');

const PORT = process.env.PORT || 3000;
const boardsData = {};

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/:boardId', (req, res) => {
    if (req.params.boardId.includes('.')) {
        return res.status(404).send('Not found');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    const boardId = socket.handshake.query.boardId || 'main';
    socket.join(boardId);
    
    if (!boardsData[boardId]) {
        boardsData[boardId] = [];
        console.log(`[SERVER] Створено нову дошку: ${boardId}`);
    }

    console.log(`[SERVER] Користувач ${socket.id} підключився до кімнати: ${boardId}`);
    console.log(`[SERVER] В кімнаті ${boardId} зараз ${io.sockets.adapter.rooms.get(boardId)?.size || 0} користувачів`);

    // Надсилаємо повну історію новому користувачу
    socket.emit('init-history', boardsData[boardId]);

    // Новий об'єкт (окремий об'єкт)
    socket.on('new-object', (obj) => {
        boardsData[boardId].push(obj);
        socket.to(boardId).emit('new-object', obj);
        console.log(`[SERVER] Новий об'єкт в ${boardId}. Всього об'єктів: ${boardsData[boardId].length}`);
    });

    // Оновлення об'єкта (рух, зміна розміру)
    socket.on('update-object', (updatedObj) => {
        const index = boardsData[boardId].findIndex(o => o.id === updatedObj.id);
        if (index !== -1) {
            boardsData[boardId][index] = updatedObj;
        }
        socket.to(boardId).emit('update-object', updatedObj);
    });

    // Повне оновлення (видалення, очищення)
    socket.on('update-all', (data) => {
        boardsData[boardId] = data;
        socket.to(boardId).emit('update-all', data);
    });

    // Видалення об'єкта
    socket.on('delete-object', (objId) => {
        boardsData[boardId] = boardsData[boardId].filter(o => o.id !== objId);
        socket.to(boardId).emit('delete-object', objId);
    });

    // Очищення дошки
    socket.on('delete-board', () => {
        boardsData[boardId] = [];
        io.in(boardId).emit('board-deleted');
        console.log(`[SERVER] Дошку ${boardId} очищено`);
    });
    
    socket.on('disconnect', () => {
        console.log(`[SERVER] Користувач ${socket.id} відключився від кімнати: ${boardId}`);
        console.log(`[SERVER] В кімнаті ${boardId} залишилось ${io.sockets.adapter.rooms.get(boardId)?.size || 0} користувачів`);
    });
});

http.listen(PORT, () => {
    console.log('========================================');
    console.log(`СЕРВЕР ЗАПУЩЕНО: http://localhost:${PORT}`);
    console.log(`Для створення нової кімнати додайте /назва в кінець URL`);
    console.log(`Наприклад: http://localhost:${PORT}/room123`);
    console.log('========================================');
});
