const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});
const path = require('path');

const PORT = process.env.PORT || 3000;
const boardsData = {}; 

// Раздача статичних файлів з папки public
app.use(express.static(path.join(__dirname, 'public')));

// Головна сторінка
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Динамічні кімнати (дошки)
app.get('/:boardId', (req, res) => {
    // Ігноруємо запити до файлів (наприклад, favicon.ico)
    if (req.params.boardId.includes('.')) {
        return res.status(404).send('Not found');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    // Отримуємо ID дошки з параметрів підключення
    const boardId = socket.handshake.query.boardId || 'main';
    socket.join(boardId);

    // Створюємо історію для нової дошки, якщо її немає
    if (!boardsData[boardId]) boardsData[boardId] = [];
    
    // Відправляємо історію об'єктів тільки клієнту, що підключився
    socket.emit('init-history', boardsData[boardId]);

    // Обробка нового об'єкта (лінія, текст тощо)
    socket.on('new-object', (obj) => {
        boardsData[boardId].push(obj);
        socket.to(boardId).emit('new-object', obj);
    });

    // Очищення дошки
    socket.on('delete-board', (id) => {
        boardsData[id] = [];
        io.in(id).emit('board-deleted');
    });

    // Відміна останньої дії (Undo)
    socket.on('undo', () => {
        if (boardsData[boardId] && boardsData[boardId].length > 0) {
            boardsData[boardId].pop();
            io.in(boardId).emit('init-history', boardsData[boardId]);
        }
    });
});

// Запуск сервера
http.listen(PORT, () => {
    console.log(`Сервер працює на порту ${PORT}`);
});
