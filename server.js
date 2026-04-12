const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } // Разрешаем подключения со всех адресов
});

io.on('connection', (socket) => {
    console.log('Пользователь подключился');

    // Когда получаем новый объект от одного клиента
    socket.on('new-object', (obj) => {
        // Рассылаем его всем ОСТАЛЬНЫМ
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
