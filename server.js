const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { 
    cors: { 
        origin: "*", // Дозволяє підключення з будь-якого джерела
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 1e8 // 100MB для великих зображень
});
const path = require('path');

const PORT = process.env.PORT || 3000;
const boardsData = {}; // Зберігає стан дошок в пам'яті

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
    // Захист від спроб доступу до файлів через параметр шляху
    if (req.params.boardId.includes('.')) {
        return res.status(404).send('Not found');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Обробка підключень Socket.IO
io.on('connection', (socket) => {
    // Отримуємо ID дошки з параметрів підключення або використовуємо 'main'
    const boardId = socket.handshake.query.boardId || 'main';
    
    // Підключаємо сокет до конкретної кімнати
    socket.join(boardId);
    
    // Ініціалізуємо масив для дошки, якщо його ще немає
    if (!boardsData[boardId]) {
        boardsData[boardId] = [];
        console.log(`[SERVER] Створено нову дошку: ${boardId}`);
    }

    console.log(`[SERVER] Користувач ${socket.id} підключився до кімнати: ${boardId}`);
    console.log(`[SERVER] В кімнаті ${boardId} зараз ${io.sockets.adapter.rooms.get(boardId)?.size || 0} користувачів`);

    // Надсилаємо поточну історію об'єктів новому користувачу
    socket.emit('init-history', boardsData[boardId]);

    // Отримання нового об'єкта (малювання, фігури)
    socket.on('new-object', (obj) => {
        // Додаємо об'єкт в масив дошки
        boardsData[boardId].push(obj);
        // Розсилаємо всім ІНШИМ користувачам в кімнаті
        socket.to(boardId).emit('new-object', obj);
        console.log(`[SERVER] Новий об'єкт в ${boardId}. Всього об'єктів: ${boardsData[boardId].length}`);
    });

    // Оновлення всього стану дошки (переміщення, редагування тексту)
    socket.on('update-all', (data) => {
        boardsData[boardId] = data;
        // Розсилаємо оновлений стан всім ІНШИМ користувачам
        socket.to(boardId).emit('init-history', data);
    });

    // Скасування дії (Undo)
    socket.on('undo', () => {
        if (boardsData[boardId]?.length > 0) {
            boardsData[boardId].pop();
            // Розсилаємо оновлений стан всім в кімнаті (включаючи того, хто натиснув)
            io.in(boardId).emit('init-history', boardsData[boardId]);
        }
    });

    // Видалення всієї дошки
    socket.on('delete-board', () => {
        boardsData[boardId] = [];
        io.in(boardId).emit('board-deleted');
        console.log(`[SERVER] Дошку ${boardId} очищено`);
    });
    
    // Відключення користувача
    socket.on('disconnect', () => {
        console.log(`[SERVER] Користувач ${socket.id} відключився від кімнати: ${boardId}`);
        console.log(`[SERVER] В кімнаті ${boardId} залишилось ${io.sockets.adapter.rooms.get(boardId)?.size || 0} користувачів`);
    });
});

// Запуск сервера
http.listen(PORT, () => {
    console.log('========================================');
    console.log(`СЕРВЕР ЗАПУЩЕНО: http://localhost:${PORT}`);
    console.log(`Для створення нової кімнати додайте /назва в кінець URL`);
    console.log(`Наприклад: http://localhost:${PORT}/room123`);
    console.log('========================================');
});
