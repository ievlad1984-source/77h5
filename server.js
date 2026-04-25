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
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;

// Зберігаємо повну історію операцій для кожної дошки
// Структура: { objects: Map<id, object>, operations: [{type, objectId, data, timestamp, userId}] }
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
            operationLog: []
        };
        console.log(`[SERVER] Створено нову дошку: ${boardId}`);
    }
    return boardsData[boardId];
}

// Отримання об'єктів у форматі масиву
function getObjectsArray(boardId) {
    const board = getBoardState(boardId);
    return Object.values(board.objects);
}

// Перевірка конфліктів
function checkConflicts(existingObj, newObj) {
    // Перевіряємо чи об'єкт змінився з моменту останньої синхронізації
    if (existingObj.lastModified && newObj.lastModified) {
        return existingObj.lastModified > newObj.lastSyncedAt;
    }
    return false;
}

io.on('connection', (socket) => {
    const boardId = socket.handshake.query.boardId || 'main';
    const userId = uuidv4();
    
    socket.join(boardId);
    socket.boardId = boardId;
    socket.userId = userId;
    
    const board = getBoardState(boardId);
    
    console.log(`[SERVER] Користувач ${userId} підключився до кімнати: ${boardId}`);
    console.log(`[SERVER] В кімнаті ${boardId} зараз ${io.sockets.adapter.rooms.get(boardId)?.size || 0} користувачів`);

    // Відправляємо повний стан при підключенні
    socket.emit('full-sync', {
        objects: getObjectsArray(boardId),
        lastOperationId: board.lastOperationId
    });

    // Обробка інкрементальної синхронізації
    socket.on('sync', (data) => {
        const { lastKnownOperationId } = data;
        
        // Відправляємо тільки операції, які клієнт ще не має
        const newOperations = board.operationLog.filter(op => op.id > lastKnownOperationId);
        
        socket.emit('operations-batch', {
            operations: newOperations,
            currentOperationId: board.lastOperationId
        });
    });

    // Додавання нового об'єкта
    socket.on('object:add', (obj) => {
        if (!obj.id) {
            obj.id = uuidv4();
        }
        obj.createdBy = userId;
        obj.createdAt = Date.now();
        obj.lastModified = obj.createdAt;
        
        board.lastOperationId++;
        const operation = {
            id: board.lastOperationId,
            type: 'add',
            objectId: obj.id,
            data: obj,
            timestamp: Date.now(),
            userId: userId
        };
        board.operationLog.push(operation);
        board.objects[obj.id] = obj;
        
        // Розсилаємо всім іншим
        socket.to(boardId).emit('operation', operation);
        
        console.log(`[SERVER] Додано об'єкт ${obj.id} в ${boardId}. Всього об'єктів: ${Object.keys(board.objects).length}`);
    });

    // Оновлення існуючого об'єкта (інкрементальне)
    socket.on('object:update', (obj) => {
        if (!obj.id) return;
        
        const existingObj = board.objects[obj.id];
        
        // Якщо об'єкта немає - створюємо
        if (!existingObj) {
            board.lastOperationId++;
            obj.createdBy = userId;
            obj.createdAt = Date.now();
            obj.lastModified = Date.now();
            
            const operation = {
                id: board.lastOperationId,
                type: 'add',
                objectId: obj.id,
                data: obj,
                timestamp: Date.now(),
                userId: userId
            };
            board.operationLog.push(operation);
            board.objects[obj.id] = obj;
            
            socket.to(boardId).emit('operation', operation);
            return;
        }
        
        // Оновлюємо об'єкт злиттям полів (не повна заміна)
        const mergedObj = {
            ...existingObj,
            ...obj,
            id: obj.id, // Зберігаємо ID
            lastModified: Date.now()
        };
        
        board.lastOperationId++;
        const operation = {
            id: board.lastOperationId,
            type: 'update',
            objectId: obj.id,
            data: mergedObj,
            timestamp: Date.now(),
            userId: userId,
            changedFields: Object.keys(obj).filter(k => existingObj[k] !== obj[k])
        };
        board.operationLog.push(operation);
        board.objects[obj.id] = mergedObj;
        
        // Розсилаємо всім іншим
        socket.to(boardId).emit('operation', operation);
        
        console.log(`[SERVER] Оновлено об'єкт ${obj.id} в ${boardId}`);
    });

    // Видалення об'єкта
    socket.on('object:delete', (objectId) => {
        if (!objectId) return;
        
        const existingObj = board.objects[objectId];
        if (!existingObj) return;
        
        board.lastOperationId++;
        const operation = {
            id: board.lastOperationId,
            type: 'delete',
            objectId: objectId,
            data: { id: objectId },
            timestamp: Date.now(),
            userId: userId
        };
        board.operationLog.push(operation);
        delete board.objects[objectId];
        
        // Розсилаємо всім іншим
        socket.to(boardId).emit('operation', operation);
        
        console.log(`[SERVER] Видалено об'єкт ${objectId} з ${boardId}`);
    });

    // Пакетне оновлення (для undo/redo та масових операцій)
    socket.on('batch-operation', (batch) => {
        const { operations } = batch;
        const results = [];
        
        operations.forEach(op => {
            board.lastOperationId++;
            const operation = {
                id: board.lastOperationId,
                ...op,
                timestamp: Date.now(),
                userId: userId
            };
            
            switch (op.type) {
                case 'add':
                    if (!board.objects[op.data.id]) {
                        op.data.createdBy = userId;
                        op.data.createdAt = operation.timestamp;
                        op.data.lastModified = operation.timestamp;
                        board.objects[op.data.id] = op.data;
                    }
                    break;
                case 'update':
                    if (board.objects[op.data.id]) {
                        board.objects[op.data.id] = {
                            ...board.objects[op.data.id],
                            ...op.data,
                            lastModified: operation.timestamp
                        };
                    }
                    break;
                case 'delete':
                    delete board.objects[op.data.id];
                    break;
            }
            
            board.operationLog.push(operation);
            results.push(operation);
        });
        
        // Розсилаємо всім іншим
        socket.to(boardId).emit('batch-operation', { operations: results });
    });

    // Запит повної синхронізації
    socket.on('request-full-sync', () => {
        socket.emit('full-sync', {
            objects: getObjectsArray(boardId),
            lastOperationId: board.lastOperationId
        });
    });

    // Видалення всієї дошки
    socket.on('delete-board', () => {
        board.objects = {};
        board.lastOperationId++;
        board.operationLog.push({
            id: board.lastOperationId,
            type: 'clear',
            timestamp: Date.now(),
            userId: userId
        });
        
        io.in(boardId).emit('board-cleared');
        console.log(`[SERVER] Дошку ${boardId} очищено`);
    });

    socket.on('disconnect', () => {
        console.log(`[SERVER] Користувач ${userId} відключився від кімнати: ${boardId}`);
    });
});

http.listen(PORT, () => {
    console.log('========================================');
    console.log(`СЕРВЕР ЗАПУЩЕНО: http://localhost:${PORT}`);
    console.log(`Для створення нової кімнати додайте /назва в кінець URL`);
    console.log(`Наприклад: http://localhost:${PORT}/room123`);
    console.log('========================================');
});
