### 1. Файл `server.js` (Сервер)


const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { 
    cors: { 
        origin: "*", 
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 1e8, 
    pingTimeout: 60000,
    pingInterval: 25000
});
const path = require('path');

const PORT = process.env.PORT || 3000;
const boardsData = {}; 
const boardTimers = {}; 

function log(message) {
    const timestamp = new Date().toLocaleTimeString('uk-UA');
    console.log(`[${timestamp}] ${message}`);
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/:boardId', (req, res) => {
    const boardId = req.params.boardId;
    if (!/^[a-zA-Z0-9_-]+$/.test(boardId)) {
        log(`[SECURITY] Спроба доступу до недопустимого ID: ${boardId}`);
        return res.status(400).send('Invalid board ID');
    }
    if (boardId.includes('.')) {
        log(`[SECURITY] Спроба доступу до файлу через URL: ${boardId}`);
        return res.status(404).send('Not found');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    const boardId = socket.handshake.query.boardId || 'main';
    
    if (!/^[a-zA-Z0-9_-]+$/.test(boardId)) {
        log(`[SECURITY] Недопустимий boardId від сокету: ${boardId}`);
        socket.disconnect(true);
        return;
    }
    
    socket.join(boardId);
    
    if (!boardsData[boardId]) {
        boardsData[boardId] = [];
        log(`[SERVER] Створено нову дошку: ${boardId}`);
    }
    
    if (boardTimers[boardId]) {
        clearTimeout(boardTimers[boardId]);
        delete boardTimers[boardId];
    }

    log(`[SERVER] Користувач ${socket.id} підключився до кімнати: ${boardId}`);
    log(`[SERVER] В кімнаті ${boardId} зараз ${io.sockets.adapter.rooms.get(boardId)?.size || 0} користувачів`);

    // Відправляємо поточний стан новому користувачу
    socket.emit('init-history', boardsData[boardId]);

    // Новий об'єкт (малюнок, фігура)
    socket.on('new-object', (obj) => {
        if (!obj || typeof obj !== 'object') return;
        
        boardsData[boardId].push(obj);
        
        // Розсилаємо ВСІМ в кімнаті (включно з відправником для гарантії синхронізації)
        io.in(boardId).emit('new-object', obj);
        log(`[SERVER] Новий об'єкт в ${boardId}. Всього об'єктів: ${boardsData[boardId].length}`);
    });

    // Оновлення стану (рух, зміна тексту)
    socket.on('update-all', (data) => {
        if (!Array.isArray(data)) return;
        
        boardsData[boardId] = data;
        
        // ВИПРАВЛЕННЯ: Розсилаємо ВСІМ (io.in), а не тільки іншим (socket.to).
        // Це критично, щоб користувач, який рухає об'єкт, отримав підтвердження від сервера
        // і його локальний стан синхронізувався з іншими.
        io.in(boardId).emit('update-all', data);
        log(`[SERVER] Оновлено стан дошки ${boardId}. Об'єктів: ${data.length}`);
    });

    socket.on('undo', () => {
        if (boardsData[boardId]?.length > 0) {
            boardsData[boardId].pop();
            io.in(boardId).emit('init-history', boardsData[boardId]);
            log(`[SERVER] Undo в кімнаті ${boardId}`);
        }
    });

    socket.on('delete-board', () => {
        boardsData[boardId] = [];
        io.in(boardId).emit('board-deleted');
        log(`[SERVER] Дошку ${boardId} очищено`);
    });
    
    socket.on('disconnect', () => {
        log(`[SERVER] Користувач ${socket.id} відключився від кімнати: ${boardId}`);
        
        const room = io.sockets.adapter.rooms.get(boardId);
        const roomSize = room?.size || 0;
        log(`[SERVER] В кімнаті ${boardId} залишилось ${roomSize} користувачів`);
        
        if (roomSize === 0) {
            log(`[SERVER] Кімната ${boardId} пуста. Заплановано видалення через 5 хв`);
            boardTimers[boardId] = setTimeout(() => {
                const currentRoom = io.sockets.adapter.rooms.get(boardId);
                if (!currentRoom || currentRoom.size === 0) {
                    delete boardsData[boardId];
                    delete boardTimers[boardId];
                    log(`[SERVER] Дошку ${boardId} видалено з пам'яті`);
                }
            }, 5 * 60 * 1000);
        }
    });
    
    socket.on('error', (error) => {
        log(`[ERROR] Помилка сокету ${socket.id}: ${error.message}`);
    });
});

http.listen(PORT, () => {
    log('========================================');
    log(`СЕРВЕР ЗАПУЩЕНО: http://localhost:${PORT}`);
    log(`Для створення нової кімнати додайте /назва в кінець URL`);
    log(`Наприклад: http://localhost:${PORT}/room123`);
    log('========================================');
});
