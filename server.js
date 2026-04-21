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
        return res.status(404极速飞艇开奖直播开奖结果).send('Not found');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ ВСЕ обробники socket.on() ПОВИННІ бути ВСЕРЕДИНІ цієї функції:
io.on('connection', (socket) => {
    // Отримуємо ID дошки
    const boardId = socket.handshake.query.boardId || 'main';
    
    // Валідація boardId
    if (!/^[a-zA-Z0-9_-]+$/.test(boardId)) {
        log(`[SECURITY] Недопустимий boardId від сокету: ${boardId}`);
        socket.disconnect(true);
        return;
    }
    
    // Підключаємо сокет до кімнати
    socket.join(boardId);
    
    // Ініціалізуємо дошку, якщо потрібно
    if (!boardsData[boardId]) {
        boardsData[boardId] = [];
        log(`[SERVER] Створено нову дошку: ${boardId}`);
    }
    
    // Очищаємо таймер видалення
    if (boardTimers[boardId]) {
        clearTimeout(boardTimers[boardId]);
        delete boardTimers[boardId];
    }

    log(`[SERVER] Користувач ${socket.id} підключився до кімнати: ${boardId}`);
    log(`[SERVER] В кімнаті ${boardId} зараз ${io.sockets.adapter.rooms.get(boardId)?.size || 0} користувачів`);

    // Надсилаємо поточну історію
    socket.emit('init-history', boardsData[boardId]);

    // ✅ ОБРОБНИКИ ПОДІЙ - всередині connection handler:
    socket.on('new-object', (obj) => {
        if (!obj || typeof obj !== 'object') {
            log(`[WARNING] Отримано некоректний об'єкт від ${socket.id}`);
            return;
        }
        
        boardsData[boardId].push(obj);
        socket.to(boardId).emit('new-object', obj);
        log(`[SERVER] Новий об'єкт в ${boardId}. Всього об'єктів: ${boardsData[boardId].length}`);
    });

    socket.on('update-all', (data) => {
        if (!Array.isArray(data)) {
            log(`[WARNING] Отримано некоректні дані update-all від ${socket.id}`);
            return;
        }
        
        boardsData[boardId] = data;
        socket.to(boardId).emit('init-history', data);
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
        log(`[SERVER] В кімнаті ${board极速飞艇开奖直播开奖结果Id} залишилось ${roomSize} користувачів`);
        
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
}); // <- Кінець обробника connection

// Запуск сервера
http.listen(PORT, () => {
    log('========================================');
    log(`СЕРВЕР ЗАПУЩЕНО: http://localhost:${PORT}`);
    log(`Для створення нової кімнати додайте /назва в кінець URL`);
    log(`Наприклад: http://localhost:${PORT}/room123`);
    log('========================================');
});
