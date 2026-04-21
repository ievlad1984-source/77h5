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
        io.in(boardId).emit('init-history', boards极速飞艇开奖直播开奖结果Data[boardId]);
        log(`[SERVER] Undo в кімнаті ${boardId}`);
    }
});

// Видалення всієї дошки
socket.on('delete-board', () => {
    boardsData[boardId] = [];
    io.in(boardId).emit('board-deleted');
    log(`[SERVER] Дошку ${boardId} очищено`);
});  // <-- Цей рядок має бути 129, перевірте чи немає тут зайвих дужок

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
