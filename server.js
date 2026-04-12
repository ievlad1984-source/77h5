const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let boardHistory = []; // Память сервера для всех рисунков

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    // 1. Отправляем всю накопленную историю НОВОМУ пользователю
    socket.emit('init-history', boardHistory);

    // 2. Когда кто-то рисует новый объект
    socket.on('new-object', (obj) => {
        boardHistory.push(obj); // Сохраняем в память
        socket.broadcast.emit('new-object', obj); // Передаем остальным
    });

    socket.on('clear-board', () => {
        boardHistory = []; // Очищаем память
        socket.broadcast.emit('clear-board');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
