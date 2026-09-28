'use strict';

const taskQueue = [];
const queuedUsers = new Set();
let isProcessing = false;

async function processQueue() {
    // Если браузер уже запущен, выходим (очередь обработается позже)
    if (isProcessing) return;
    isProcessing = true;

    while (taskQueue.length > 0) {
        const task = taskQueue.shift(); // Берем первого из очереди
        
        // Если человек ждал, уведомляем, что его очередь пришла
        if (task.wasQueued) {
            await task.ctx.reply('Сервер освободился! Ваша очередь подошла, запускаю браузер...');
        }

        try {
            // Выполняем тяжелую задачу (Playwright) и ЖДЕМ ее завершения
            await task.action();
        } catch (e) {
            console.error('Ошибка в очереди:', e);
        } finally {
            // После окончания теста удаляем юзера из списка занятых
            queuedUsers.delete(task.userId);
        }
    }
    
    // Как только очередь опустеет, освобождаем статус
    isProcessing = false;
}

// Главная функция для добавления задач в очередь
function enqueuePlaywrightTask(ctx, action) {
    const userId = ctx.from.id;

    // ЗАЩИТА ОТ СПАМА: Если юзер уже в очереди, шлем одно сообщение и игнорим спам
    if (queuedUsers.has(userId)) {
        return ctx.reply('Ваш предыдущий тест еще в очереди или уже выполняется. Дождитесь его окончания.');
    }

    queuedUsers.add(userId);
    const isBusy = isProcessing;

    taskQueue.push({
        ctx,
        userId,
        wasQueued: isBusy,
        action
    });

    if (isBusy) {
        ctx.reply(`Сервер сейчас занят другим тестом.\n\nВаш запрос добавлен в очередь (ваша позиция: ${taskQueue.length}). Бот автоматически запустит ваш тест, как только освободится.`);
    }

    // Пробуем запустить очередь
    processQueue();
}

// Функция для очистки юзера при команде "отмена"
function removeUserFromQueue(userId) {
    queuedUsers.delete(userId);
    const index = taskQueue.findIndex(t => t.userId === userId);
    if (index !== -1) {
        taskQueue.splice(index, 1);
    }
}

module.exports = { enqueuePlaywrightTask, removeUserFromQueue };