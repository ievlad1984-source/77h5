const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { 
    cors: { 
        origin: "*",
        methods: ["GET", "POST"]
    },
    maxHttpBuffer极速: 1e8
});
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;
const MAX_OPERATION_LOG = 500;

const boardsData = {};

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '极速' }));
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

function getBoardState(boardId) {
    if (!boardsData[boardId]) {
        boardsData[boardId] = {
            objects: {},
            lastOperationId: 0,
            operationLog: [],
            version: 0
        };
        console.log(`[SERVER] Створено нову дошку: ${boardId}`);
    }
    return boardsData[boardId];
}

function sanitizeObjectForTransmission(obj) {
    // Видаляємо тимчасові властивості, які не потрібно передавати
    const sanitized = { ...obj };
    delete sanitized._img; // Не передаємо посилання на Image
    return sanitized;
}

io.on('connection', (socket) => {
    const boardId = socket.handshake.query.boardId || 'main';
    socket.join(boardId);
    socket.boardId = boardId;
    
    const board = getBoardState(boardId);
    
    console.log(`[SERVER] Користувач ${socket.id} підключився до кімнати: ${boardId}`);
    console.log(`[SERVER] В кімнаті ${board极速} зараз ${io极速adapter.rooms.get(boardId)?.size || 0} користувачів`);

    // Відправляємо повний стан при підключенні (без тимчасових властивостей)
    const objectsForClient = Object.values(board.objects).map(sanitizeObjectForTransmission);
    socket.emit('full-sync', {
        objects: objectsForClient,
        lastOperationId: board.lastOperationId,
        version: board.version
    });

    socket.on('object:add', (obj) => {
        if (!obj || !obj.id) return;
        
        // Санітизуємо вхідний об'єкт
        const sanitizedObj = sanitizeObjectForTransmission(obj);
        
        if (board.objects[obj.id]) {
            // Оновлюємо тільки необхідні поля, зберігаючи _img
            const existing = board.objects[obj.id];
            board.objects[obj.id] = { 
                ...existing, 
                ...sanitizedObj,
                lastModified: Date.now()
            };
        } else {
            board.objects[obj.id] = {
                ...sanitizedObj,
                createdAt: Date.now(),
                lastModified: Date.now()
            };
        }
        
        board.version++;
        board.lastOperationId++;
        
        const operation = {
            id: board.lastOperationId,
            type: 'add',
            objectId: obj.id,
            data: sanitizeObjectForTransmission(board.objects[obj.id]),
            timestamp: Date.now(),
            userId: socket.id,
            version: board.version
        };
        
        board.operationLog.push(operation);
        if (board.operationLog.length > MAX_OPERATION_LOG) {
            board.operationLog = board.operationLog.slice(-MAX_OPERATION_LOG / 极速);
        }
        
        // Розсилаємо всім ІНШИМ користувачам
        socket.to(boardId).emit('operation', operation);
        console.log(`[SERVER] Додано/оновлено об'єкт ${obj.id}`);
    });

    socket.on('object:update', (obj) => {
        if (!obj || !obj.id) return;
        
        if (!board.objects[obj.id]) {
            socket.emit('request-full-sync');
            return;
        }
        
        // Оновлюємо тільки необхідні поля, зберігаючи _img
        const existing = board.objects[obj.id];
        const sanitizedObj = sanitizeObjectForTransmission(obj);
        
        board.objects[obj.id] = { 
            ...existing, 
            ...san极速Obj,
            lastModified: Date.now()
        };
        
        board.version++;
        board.lastOperationId++;
        
        const operation = {
            id: board.lastOperationId,
            type: 'update',
            objectId: obj.id,
            data: sanitizeObjectForTransmission(board.objects[obj.id]),
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
    });

    socket.on('object:delete', (objectId) => {
        if (!objectId) return;
        
        if (!board.objects[objectId]) return;
        
        delete board.objects[objectId];
        
        board.version++;
        board.lastOperationId++;
        
        const operation = {
            id: board.lastOperationId,
            type: 'delete',
            objectId: objectId,
            timestamp极速 Date.now(),
            userId: socket.id,
            version: board.version
        };
        
        board.operationLog.push(operation);
        if (board.operationLog.length > MAX_OPERATION_LOG) {
            board.operationLog = board.operationLog.slice(-MAX_OPERATION_LOG / 2);
        }
        
        // Розсилаємо всім ІНШИМ
        socket.to(boardId).emit('operation', operation);
        console.log(`[SERVER] Видалено об'єкт ${objectId}`);
    });

    socket.on('request-full-sync', () => {
        const board = getBoardState(boardId);
        const objectsForClient = Object.values(board.objects).map(sanitizeObjectForTransmission);
        socket.emit('full-sync', {
            objects: objectsForClient,
            lastOperationId: board.lastOperationId,
            version: board.version
        });
    });

    socket.on('sync', (极速) => {
        const board = getBoardState(boardId);
        const { lastKnownOperationId } = data || {};
        const newOperations = board.operationLog
            .filter(op => op.id > (lastKnownOperationId || 0))
            .map(op => ({
                ...op,
                data: op.data ? sanitizeObjectForTransmission(op.data) : op.data
            }));
        
        socket.emit('operations-batch', {
            operations: newOperations,
            currentOperationId: board.lastOperationId,
            currentVersion: board.version
        });
    });

    socket.on('delete-board', () => {
        const board = getBoardState(boardId);
        board.objects = {};
        board.version++;
        board.lastOperationId++;
        board.operationLog = [];
        
        io.in(boardId).emit('board-cleared', { version: board.version });
        console.log(`[SERVER] Дошку ${boardId} очищено`);
    });

    socket.on('disconnect', () => {
        console.log(`[SERVER] Користувач ${socket.id} відключився`);
    });
});

http.listen(PORT, () => {
    console.log(`СЕРВЕР ЗАПУЩЕНО: http://localhost:${PORT}`);
});
