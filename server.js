const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { 
    cors: { 
        origin: "*", // Дозволяє підключення з будь-якого джерела
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 1e8, // 100MB для великих зображень
    pingTimeout: 60000,
    pingInterval: 25000
});
const path = require('path');

const PORT = process.env.PORT || 3000;
const boardsData = {}; // Зберігає стан дошок в пам'яті
const boardTimers = {}; // Таймери для очищення неактивних дошок

// Функція для логування з часом
function log(message) {
    const timestamp = new Date().toLocaleTimeString('uk-UA');
    console.log(`[${timestamp}] ${message}`);
}

// Налаштування статичних файлів та парсерів
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Головна сторінка
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Сторінка конкретної дошки (наприклад, /room123)
app.get('/:boardId', (req, res) => {
    const boardId = req.params.boardId;
    
    // Захист від спроб доступу до файлів через параметр шляху
    // Дозволені тільки букви, цифри, дефіс та підкреслення
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

// Обробка підключень Socket.IO
io.on('connection', (socket) => {
    // Отримуємо ID дошки з параметрів підключення або використовуємо 'main'
    const boardId = socket.handshake.query.boardId || 'main';
    
    // Валідація boardId
    if (!/^[a-zA-Z0-9_-]+$/.test(boardId)) {
        log(`[SECURITY] Недопустимий boardId від сокету: ${boardId}`);
        socket.disconnect(true);
        return;
    }
    
    // Підключаємо сокет до конкретної кімнати
    socket.join(boardId);
    
    // Ініціалізуємо масив для дошки, якщо його ще немає
    if (!boardsData[boardId]) {
        boardsData[boardId] = [];
        log(`[SERVER] Створено нову дошку: ${boardId}`);
    }
    
    // Очищаємо таймер видалення, якщо користувач повернувся
    if (boardTimers[boardId]) {
        clearTimeout(boardTimers[boardId]);
        delete boardTimers[boardId];
    }

    log(`[SERVER] Користувач ${socket.id} підключився до кімнати: ${boardId}`);
    log(`[SERVER] В кімнаті ${boardId} зараз ${io.sockets.adapter.rooms.get(boardId)?.size || 0} користувачів`);

    // Надсилаємо поточну історію об'єктів новому користувачу
    socket.emit('init-history', boardsData[boardId]);

    // Отримання нового об'єкта (малювання, фігури)
    socket.on('new-object', (obj) => {
        // Валідація об'єкта
        if (!obj || typeof obj !== 'object') {
            log(`[WARNING] Отримано некоректний об'єкт від ${socket.id}`);
            return;
        }
        
        // Додаємо об'єкт в масив дошки
        boardsData[boardId].push(obj);
        
        // Розсилаємо всім ІНШИМ користувачам в кімнаті
        socket.to(boardId).emit('new-object', obj);
        log(`[SERVER] Новий об'єкт в ${boardId}. Всього об'єктів: ${boardsData[boardId].length}`);
    });

    // Оновлення всього стану дошки (переміщення, редагування тексту)
    socket.on('update-all', (data) => {
        // Валідація даних - має бути масивом
        if (!Array.isArray(data)) {
            log(`[WARNING] Отримано некоректні дані update-all від ${socket.id}`);
            return;
        }
        
        boardsData[boardId] = data;
        
        // Розсилаємо оновлений стан всім ІНШИМ користувачам
        socket.to(boardId).emit('init-history', data);
        log(`[SERVER] Оновлено стан дошки ${boardId}. Об'єктів: ${data.length}`);
    });

    // Скасування дії (Undo)
    socket.on('undo', () => {
        if (boardsData[boardId]?.length > 0) {
            boardsData[boardId].pop();
            // Розсилаємо оновлений стан всім в кімнаті (включаючи того, хто натиснув)
            io.in(boardId).emit('init-history', boardsData[boardId]);
            log(`[SERVER] Undo в кімнаті ${boardId}`);
        }
    });

    // Видалення всієї дошки
    socket.on('delete-board', () => {
        boardsData[boardId] = [];
        io.in(boardId).emit('board-deleted');
        log(`[SERVER] Дошку ${boardId} очищено`);
    });
    
    // Відключення користувача
    socket.on('disconnect', () => {
        log(`[SERVER] Користувач ${socket.id} відключився від кімнати: ${boardId}`);
        
        const room = io.sockets.adapter.rooms.get(boardId);
        const roomSize = room?.size || 0;
        log(`[SERVER] В кімнаті ${boardId} залишилось ${roomSize} користувачів`);
        
        // Якщо в кімнаті не залишилось користувачів, видаляємо дані через 5 хвилин
        if (roomSize === 0) {
            log(`[SERVER] Кімната ${boardId} пуста. Заплановано видалення через 5 хв`);
            boardTimers[boardId] = setTimeout(() => {
                const currentRoom = io.sockets.adapter.rooms.get(boardId);
                if (!currentRoom || currentRoom.size === 0) {
                    delete boardsData[boardId];
                    delete boardTimers[boardId];
                    log(`[SERVER] Дошку ${boardId} видалено з пам'яті`);
                }
            }, 5 * 60 * 1000); // 5 хвилин
        }
    });
    
    // Обробка помилок
    socket.on('error', (error) => {
        log(`[ERROR] Помилка сокету ${socket.id}: ${error.message}`);
    });
});

// Запуск сервера
http.listen(PORT, () => {
    log('========================================');
    log(`СЕРВЕР ЗАПУЩЕНО: http://localhost:${PORT}`);
    log(`Для створення нової кімнати додайте /назва в кінець URL`);
    log(`Наприклад: http://localhost:${PORT}/room123`);
    log('========================================');
});
