const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path'); // Добавили для работы с путями

const app = express(); // 1. Сначала создаем app
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } 
});

// 2. Затем настраиваем статику
// Если index.html лежит в корне, используйте это:
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Если index.html лежит в папке public, раскомментируйте это:
// app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('Пользователь подключился:', socket.id);

    socket.on('new-object', (obj) => {
        // Пересылаем объект всем, кроме отправителя
        socket.broadcast.emit('new-object', obj);
    });

    socket.on('clear-board', () => {
        socket.broadcast.emit('clear-board');
    });

    socket.on('disconnect', () => {
        console.log('Пользователь отключился');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
