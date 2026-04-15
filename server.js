const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '11.html'));
});

const boards = new Map();

io.on('connection', (socket) => {
    console.log('Користувач підключився:', socket.id);
    
    socket.on('join-board', (boardId) => {
        socket.join(boardId);
        console.log(`Користувач ${socket.id} приєднався до дошки ${boardId}`);
        
        if (!boards.has(boardId)) {
            boards.set(boardId, []);
        }
        
        socket.emit('init-history', boards.get(boardId));
    });
    
    socket.on('new-object', (obj) => {
        const boardId = socket.handshake.query.boardId || 'default';
        if (boards.has(boardId)) {
            boards.get(boardId).push(obj);
            socket.to(boardId).emit('new-object', obj);
        }
    });
    
    socket.on('update-all', (objects) => {
        const boardId = socket.handshake.query.boardId || 'default';
        if (boards.has(boardId)) {
            boards.set(boardId, objects);
            socket.to(boardId).emit('update-all', objects);
        }
    });
    
    socket.on('delete-board', () => {
        const boardId = socket.handshake.query.boardId || 'default';
        boards.set(boardId, []);
        io.to(boardId).emit('board-deleted');
    });
    
    socket.on('disconnect', () => {
        console.log('Користувач відключився:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущено на http://localhost:${PORT}`);
    console.log(`📝 Відкрийте цю адресу в кількох вкладках для тестування`);
});
