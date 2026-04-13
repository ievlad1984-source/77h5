const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { 
    cors: { origin: "*" },
    maxHttpBufferSize: 1e7 // 10MB для тяжелых формул и картинок
});
const path = require('path');

// КРИТИЧНО ДЛЯ RENDER: используем process.env.PORT
const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname, 'public')));

// Хранилище данных досок (в оперативной памяти)
const boardsData = {}; 

app.get('/', (req, res) => {
    // Генерация случайного ID при заходе на корень
    const id = Math.random().toString(36).substring(2, 10);
    res.redirect(`/${id}`);
});

app.get('/:boardId', (req, res) => {
    // Игнорируем запросы к файлам (с точкой)
    if (req.params.boardId.includes('.')) return res.status(404).send('Not found');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    const boardId = socket.handshake.query.boardId || 'main';
    socket.join(boardId);

    // Инициализация истории для нового пользователя
    if (!boardsData[boardId]) boardsData[boardId] = [];
    socket.emit('init-history', boardsData[boardId]);

    // Трансляция процесса рисования (черновик)
    socket.on('drawing-progress', (data) => {
        socket.to(boardId).emit('drawing-progress', { ...data, userId: socket.id });
    });

    // Фиксация нового объекта
    socket.on('new-object', (obj) => {
        if (boardsData[boardId]) {
            boardsData[boardId].push(obj);
            socket.to(boardId).emit('new-object', obj);
            socket.to(boardId).emit('clear-progress', socket.id);
        }
    });

    // Синхронизация при изменении всех объектов (удаление, перемещение)
    socket.on('update-all', (data) => {
        boardsData[boardId] = data;
        socket.to(boardId).emit('init-history', data);
    });

    // Отмена действия
    socket.on('undo', () => {
        if (boardsData[boardId] && boardsData[boardId].length > 0) {
            boardsData[boardId].pop();
            io.in(boardId).emit('init-history', boardsData[boardId]);
        }
    });

    socket.on('disconnect', () => {
        io.in(boardId).emit('clear-progress', socket.id);
    });
});

// Запуск на 0.0.0.0 обязателен для многих облачных хостингов
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер live на порту ${PORT}`);
});
