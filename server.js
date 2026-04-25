const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { 
    cors: { 
        origin: "*",
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 1e8
});
const path = require('path');

const PORT = process.env.PORT || 3000;
const MAX_OPERATION_LOG = 500; // Максимум операцій в журналі

// Зберігаємо повну історію операцій для кожної дошки
const boardsData = {};

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/:boardId', (req, res) => {
    if (req.params.boardId.includes('.')) {
        return res.status(404).send('Not found');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Отримання поточної версії стану дошки
function getBoardState(boardId) {
    if (!boardsData[boardId]) {
        boardsData[boardId] = {
            objects: {},
            lastOperationId: 0,
            operationLog: [],
            version: 0 // Для виявлення конфліктів
        };
        console.log(`[SERVER] Створено нову дошку: ${boardId}`);
    }
    return boardsData[boardId];
}

io.on('connection', (socket) => {
    const boardId = socket.handshake.query.boardId || 'main';
    socket.join(boardId);
    socket.boardId = boardId;
    
    const board = getBoardState(boardId);
    
    console.log(`[SERVER] Користувач ${socket.id} підключився до кімнати: ${boardId}`);
    console.log(`[SERVER] В кімнаті ${boardId} зараз ${io.sockets.adapter.rooms.get(boardId)?.size || 0} користувачів`);

    // Відправляємо повний стан при підключенні
    socket.emit('full-sync', {
        objects: Object.values(board.objects),
        lastOperationId: board.lastOperationId,
        version: board.version
    });

    // Додавання нового об'єкта
    socket.on('object:add', (obj) => {
        if (!obj || !obj.id) {
            console.warn('[SERVER] Спроба додати об\'єкт без ID');
            return;
        }
        
        // Перевіряємо чи об'єкт вже існує
        if (board.objects[obj.id]) {
            console.warn(`[SERVER] Об'єкт ${obj.id} вже існує, оновлюємо`);
            board.objects[obj.id] = { ...board.objects[obj.id], ...obj };
        } else {
            board.objects[obj.id] = obj;
        }
        
        board.version++;
        board.lastOperationId++;
        
        const operation = {
            id: board.lastOperationId,
            type: 'add',
            objectId: obj.id,
            data: board.objects[obj.id],
            timestamp: Date.now(),
            userId: socket.id,
            version: board.version
        };
        
        board.operationLog.push(operation);
        
        // Обмежуємо розмір журналу
        if (board.operationLog.length > MAX_OPERATION_LOG) {
            board.operationLog = board.operationLog.slice(-MAX_OPERATION_LOG / 2);
        }
        
        // Розсилаємо всім ІНШИМ користувачам (НЕ відправнику)
        socket.to(boardId).emit('operation', operation);
        
        console.log(`[SERVER] Додано об'єкт ${obj.id}. Всього: ${Object.keys(board.objects).length}`);
    });

    // Оновлення існуючого об'єкта
    socket.on('object:update', (obj) => {
        if (!obj || !obj.id) return;
        
        // Якщо об'єкта немає - повідомляємо клієнту
        if (!board.objects[obj.id]) {
            console.warn(`[SERVER] Об'єкт ${obj.id} не знайдено для оновлення`);
            // Можливо, клієнт має застарілі дані - відправляємо йому повну синхронізацію
            socket.emit('request-full-sync');
            return;
        }
        
        // Оновлюємо об'єкт
        board.objects[obj.id] = { 
            ...board.objects[obj.id], 
            ...obj,
            lastModified: Date.now()
        };
        
        board.version++;
        board.lastOperationId++;
        
        const operation = {
            id: board.lastOperationId,
            type: 'update',
            objectId: obj.id,
            data: board.objects[obj.id],
            timestamp: Date.now(),
            userId: socket.id,
            version: board.version
        };
        
        board.operationLog.push(operation);
        
        if (board.operationLog.length > MAX_OPERATION_LOG) {
            board.operationLog = board.operationLog.slice(-MAX_OPERATION_LOG / 2);
        }
        
        // Розсилаємо всім ІНШИМ
        socket.to(boardId).emit('operation', operation);
        
        console.log(`[SERVER] Оновлено об'єкт ${obj.id}`);
    });

    // Видалення об'єкта
    socket.on('object:delete', (objectId) => {
        if (!objectId) return;
        
        if (!board.objects[objectId]) {
            console.warn(`[SERVER] Об'єкт ${objectId} не знайдено для видалення`);
            return;
        }
        
        delete board.objects[objectId];
        
        board.version++;
        board.lastOperationId++;
        
        const operation = {
            id: board.lastOperationId,
            type: 'delete',
            objectId: objectId,
            timestamp: Date.now(),
            userId: socket.id,
            version: board.version
        };
        
        board.operationLog.push(operation);
        
        if (board.operationLog.length > MAX_OPERATION_LOG) {
            board.operationLog = board.operationLog.slice(-MAX_OPERATION_LOG / 2);
        }
        
        // Розсилаємо всім ІНШИМ
        socket.to(boardId).emit('operation', operation);
        
        console.log(`[SERVER] Видалено об'єкт ${objectId}. Залишилось: ${Object.keys(board.objects).length}`);
    });

    // Запит повної синхронізації
    socket.on('request-full-sync', () => {
        const board = getBoardState(boardId);
        socket.emit('full-sync', {
            objects: Object.values(board.objects),
            lastOperationId: board.lastOperationId,
            version: board.version
        });
        console.log(`[SERVER] Надіслано повну синхронізацію для ${socket.id}`);
    });

    // Запит інкрементальної синхронізації (тільки нові операції)
    socket.on('sync', (data) => {
        const board = getBoardState(boardId);
        const { lastKnownOperationId } = data || {};
        
        // Відправляємо тільки операції після того, що клієнт знає
        const newOperations = board.operationLog.filter(op => op.id > (lastKnownOperationId || 0));
        
        socket.emit('operations-batch', {
            operations: newOperations,
            currentOperationId: board.lastOperationId,
            currentVersion: board.version
        });
    });

    // Видалення всієї дошки
    socket.on('delete-board', () => {
        const board = getBoardState(boardId);
        board.objects = {};
        board.version++;
        board.lastOperationId++;
        board.operationLog = [];
        
        // Розсилаємо ВСІМ включаючи відправника (щоб він теж очистив)
        io.in(boardId).emit('board-cleared', { version: board.version });
        console.log(`[SERVER] Дошку ${boardId} очищено користувачем ${socket.id}`);
    });

    socket.on('disconnect', () => {
        console.log(`[SERVER] Користувач ${socket.id} відключився від кімнати: ${boardId}`);
    });
});

http.listen(PORT, () => {
    console.log('========================================');
    console.log(`СЕРВЕР ЗАПУЩЕНО: http://localhost:${PORT}`);
    console.log('========================================');
});
