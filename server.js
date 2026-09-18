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

// Глобальное хранилище состояния досок
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

// Инициализация или получение структуры доски
function getBoardState(boardId) {
    if (!boardsData[boardId]) {
        boardsData[boardId] = {
            objects: {}, // Храним в виде ключ-значение (id -> object) для исключения дубликатов
            lastOperationId: 0,
            operationLog: []
        };
        console.log(`[SERVER] Создана новая доска: ${boardId}`);
    }
    return boardsData[boardId];
}

function getObjectsArray(boardId) {
    const board = getBoardState(boardId);
    return Object.values(board.objects);
}

io.on('connection', (socket) => {
    const boardId = socket.handshake.query.boardId || 'main';
    const userId = uuidv4();
    
    socket.join(boardId);
    socket.boardId = boardId;
    socket.userId = userId;
    
    const board = getBoardState(boardId);
    
    console.log(`[SERVER] Пользователь ${userId} подключился к комнате: ${boardId}`);

    // Отправляем текущее состояние новому пользователю
    socket.emit('full-sync', {
        objects: getObjectsArray(boardId),
        lastOperationId: board.lastOperationId
    });

    // Обновление объекта с проверкой по времени (предотвращает пропадание рисунков)
    socket.on('object:update', (obj) => {
        if (!obj || !obj.id) return;
        
        const existingObj = board.objects[obj.id];
        
        if (!existingObj) {
            board.lastOperationId++;
            obj.createdBy = userId;
            obj.createdAt = Date.now();
            obj.lastModified = Date.now();
            const operation = { id: board.lastOperationId, type: 'add', objectId: obj.id, data: obj, timestamp: Date.now(), userId: userId };
            board.operationLog.push(operation);
            board.objects[obj.id] = obj;
            socket.to(boardId).emit('operation', operation);
            return;
        }
        
        // ПРОВЕРКА: Обновляем только если входящие данные свежее существующих
        if (obj.lastModified && existingObj.lastModified && obj.lastModified < existingObj.lastModified) {
            return; // Игнорируем устаревшее обновление
        }
        
        const mergedObj = {
            ...existingObj,
            ...obj,
            lastModified: Date.now()
        };
        
        board.lastOperationId++;
        const operation = {
            id: board.lastOperationId,
            type: 'update',
            objectId: obj.id,
            data: mergedObj,
            timestamp: Date.now(),
            userId: userId
        };
        
        board.operationLog.push(operation);
        board.objects[obj.id] = mergedObj;
        socket.to(boardId).emit('operation', operation);
    });

    // Создание нового объекта на холсте
    socket.on('object:add', (obj) => {
        if (!obj || !obj.id) return;
        
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
        
        socket.to(boardId).emit('operation', operation);
    });

    // Удаление объекта
    socket.on('object:delete', (objectId) => {
        if (!objectId) return;
        if (!board.objects[objectId]) return;
        
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
        socket.to(boardId).emit('operation', operation);
    });

    // Пакетные транзакции
    socket.on('batch-operation', (batch) => {
        if (!batch || !Array.isArray(batch.operations)) return;
        const results = [];
        
        batch.operations.forEach(op => {
            board.lastOperationId++;
            const operation = {
                id: board.lastOperationId,
                ...op,
                timestamp: Date.now(),
                userId: userId
            };
            
            switch (op.type) {
                case 'add':
                    if (op.data && op.data.id && !board.objects[op.data.id]) {
                        op.data.createdBy = userId;
                        op.data.createdAt = operation.timestamp;
                        op.data.lastModified = operation.timestamp;
                        board.objects[op.data.id] = op.data;
                    }
                    break;
                case 'update':
                    if (op.data && op.data.id && board.objects[op.data.id]) {
                        board.objects[op.data.id] = {
                            ...board.objects[op.data.id],
                            ...op.data,
                            lastModified: operation.timestamp
                        };
                    }
                    break;
                case 'delete':
                    if (op.data && op.data.id) {
                        delete board.objects[op.data.id];
                    }
                    break;
            }
            board.operationLog.push(operation);
            results.push(operation);
        });
        socket.to(boardId).emit('batch-operation', { operations: results });
    });

    socket.on('request-full-sync', () => {
        socket.emit('full-sync', {
            objects: getObjectsArray(boardId),
            lastOperationId: board.lastOperationId
        });
    });

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
    });

    socket.on('disconnect', () => {
        console.log(`[SERVER] Пользователь ${userId} отключился`);
    });
});

http.listen(PORT, () => {
    console.log(`СЕРВЕР ОНЛАЙН-ДОСКИ УСПЕШНО ЗАПУЩЕН НА ПОРТУ: ${PORT}`);
});
