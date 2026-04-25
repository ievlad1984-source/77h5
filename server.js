// server.js - Математична дошка Pro (сервер)
// Автор: AI Assistant
// Версія: 1.0

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Порт сервера
const PORT = process.env.PORT || 3000;

// Папка для зберігання даних
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Створюємо папку public якщо її немає
const PUBLIC_DIR = path.join(__dirname, 'public');
if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

// Зберігання дощок в пам'яті
const boards = new Map();

// Зберігання користувачів на дошках
const boardUsers = new Map();

// Функції для збереження даних
function saveBoard(boardId, data) {
    const filePath = path.join(DATA_DIR, `${boardId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadBoard(boardId) {
    const filePath = path.join(DATA_DIR, `${boardId}.json`);
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    }
    return null;
}

// Статичні файли
app.use(express.static(PUBLIC_DIR));

// Головна сторінка - перенаправлення на нову дошку
app.get('/', (req, res) => {
    const boardId = uuidv4().substring(0, 8);
    res.redirect(`/${boardId}`);
});

// Сторінка дошки
app.get('/:boardId', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// API для отримання даних дошки
app.get('/api/board/:boardId', (req, res) => {
    const boardId = req.params.boardId;
    const data = loadBoard(boardId);
    res.json(data || { objects: [], users: [] });
});

// API для збереження дошки
app.post('/api/board/:boardId', (req, res) => {
    const boardId = req.params.boardId;
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const data = JSON.parse(body);
            saveBoard(boardId, data);
            res.json({ success: true });
        } catch (e) {
            res.json({ success: false, error: e.message });
        }
    });
});

// Socket.io обробка
io.on('connection', (socket) => {
    const boardId = socket.handshake.query.boardId || 'default';
    const userId = uuidv4();
    const userName = `Користувач ${Math.floor(Math.random() * 1000)}`;
    
    console.log(`[${boardId}] Новий користувач підключився: ${userId}`);
    
    // Приєднуємося до кімнати
    socket.join(boardId);
    
    // Ініціалізація користувача
    const user = {
        id: userId,
        name: userName,
        color: getRandomColor(),
        cursor: { x: 0, y: 0 },
        joinedAt: Date.now()
    };
    
    // Додаємо користувача
    if (!boardUsers.has(boardId)) {
        boardUsers.set(boardId, new Map());
    }
    boardUsers.get(boardId).set(userId, user);
    
    // Завантажуємо дошку
    let boardData = loadBoard(boardId);
    if (!boardData) {
        boardData = {
            objects: [],
            settings: {
                gridSize: 20,
                gridColor: '#e0e0e0',
                backgroundColor: '#ffffff'
            },
            createdAt: Date.now(),
                updatedAt: Date.now()
            };
        saveBoard(boardId, boardData);
    }
    
    // Відправляємо ініціалізаційні дані
    socket.emit('init', {
        userId: userId,
        user: user,
        board: boardData,
        users: Array.from(boardUsers.get(boardId).values())
    });
    
    // Сповіщаємо інших користувачів
    socket.to(boardId).emit('user-joined', user);
    
    // Отримуємо історію
    socket.on('get-history', () => {
        socket.emit('init-history', boardData.objects);
    });
    
    // Новий об'єкт
    socket.on('object:add', (obj) => {
        console.log(`[${boardId}] Новий об'єкт: ${obj.type}`);
        boardData.objects.push(obj);
        boardData.updatedAt = Date.now();
        saveBoard(boardId, boardData);
        socket.to(boardId).emit('object:added', obj);
    });
    
    // Оновлення об'єкта
    socket.on('object:update', (updatedObj) => {
        const index = boardData.objects.findIndex(o => o.id === updatedObj.id);
        if (index !== -1) {
            boardData.objects[index] = updatedObj;
            boardData.updatedAt = Date.now();
            saveBoard(boardId, boardData);
        }
        socket.to(boardId).emit('object:updated', updatedObj);
    });
    
    // Видалення об'єкта
    socket.on('object:delete', (objId) => {
        boardData.objects = boardData.objects.filter(o => o.id !== objId);
        boardData.updatedAt = Date.now();
        saveBoard(boardId, boardData);
        socket.to(boardId).emit('object:deleted', objId);
    });
    
    // Очищення дошки
    socket.on('board:clear', () => {
        boardData.objects = [];
        boardData.updatedAt = Date.now();
        saveBoard(boardId, boardData);
        io.to(boardId).emit('board:cleared');
    });
    
    // Курсор користувача
    socket.on('cursor:move', (pos) => {
        const u = boardUsers.get(boardId)?.get(userId);
        if (u) {
            u.cursor = pos;
            socket.to(boardId).emit('cursor:moved', {
                userId: userId,
                cursor: pos
            });
        }
    });
    
    // Малювання в реальному часі
    socket.on('draw:progress', (data) => {
        socket.to(boardId).emit('draw:progress', {
            userId: userId,
            ...data
        });
    });
    
    // Синхронізація
    socket.on('sync', () => {
        socket.emit('sync', boardData);
    });
    
    // Відключення
    socket.on('disconnect', () => {
        console.log(`[${boardId}] Користувач відключився: ${userId}`);
        
        if (boardUsers.has(boardId)) {
            boardUsers.get(boardId).delete(userId);
            if (boardUsers.get(boardId).size === 0) {
                boardUsers.delete(boardId);
            }
        }
        
        socket.to(boardId).emit('user-left', userId);
    });
});

// Випадковий колір для користувача
function getRandomColor() {
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
        '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
        '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Запуск сервера
server.listen(PORT, () => {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                                                           ║');
    console.log('║   🎓 МАТЕМАТИЧНА ДОШКА PRO                                ║');
    console.log('║   Mathematical Board iDroo-style                          ║');
    console.log('║                                                           ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║                                                           ║`);
    console.log(`║   🌐 Сервер запущено на порту: ${PORT}                       ║`);
    console.log(`║                                                           ║`);
    console.log(`║   📝 Відкрийте: http://localhost:${PORT}                     ║`);
    console.log(`║                                                           ║`);
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');
});

// Обробка помилок
process.on('uncaughtException', (err) => {
    console.error('Помилка:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Помилка Promise:', err);
});
