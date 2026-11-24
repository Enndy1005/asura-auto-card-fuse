'use strict';

const RU = {
    'Card Fusion menu content reloaded.': 'Содержимое меню слияния карт обновлено.',
    'The server did not confirm registration. Check your collection before trying again.': 'Сервер не подтвердил регистрацию. Проверьте коллекцию перед повторной попыткой.',
    'Card collection data has not loaded. Run fuse again after it loads, or use fuse collection to turn off the check.': 'Данные коллекции карт ещё не загружены. Повторите fuse после загрузки или отключите проверку командой fuse collection.',
    'Could not send the card registration request. Registration stopped.': 'Не удалось отправить запрос регистрации карты. Регистрация остановлена.',
    'Card registration complete.': 'Регистрация карт завершена.',
    'Manual card use detected. Automatic registration stopped.': 'Обнаружено ручное использование карты. Автоматическая регистрация остановлена.',
    'Use fusestop before changing the collection check.': 'Перед изменением проверки коллекции остановите слияние командой fusestop.',
    'Card registration is already running.': 'Регистрация карт уже выполняется.',
    'Another card operation is already running.': 'Другая операция с картами уже выполняется.',
    'Wait for your character, collection, and inventory to load.': 'Дождитесь загрузки персонажа, коллекции и инвентаря.',
    'Card registration stopped.': 'Регистрация карт остановлена.',
    'The registered card count did not match the request. Registration stopped.': 'Количество зарегистрированных карт не совпало с ожидаемым. Регистрация остановлена.',
    'Use fuse 1 for common, fuse 2 for uncommon, or fuse 3 for rare. Use fuse collection to toggle the collection check.': 'Используйте fuse 1 для обычных карт, fuse 2 для необычных или fuse 3 для редких. Команда fuse collection переключает проверку коллекции.',
    'Waiting for inventory data.': 'Ожидание данных инвентаря.',
    'Four free inventory slots are required.': 'Требуются четыре свободных слота в инвентаре.',
    'Selected stacks changed during placement.': 'Выбранные стопки изменились во время размещения.',
    'The slot confirmation did not match the request.': 'Подтверждение слота не совпало с запросом.',
    'The server did not confirm the slot clear.': 'Сервер не подтвердил очистку слотов.',
    'Could not close the fusion contract. Re-enter your character.': 'Не удалось закрыть стол слияния. Перезайдите персонажем.',
    'The server did not confirm the result. Check your inventory before restarting.': 'Сервер не подтвердил результат. Проверьте инвентарь перед новым запуском.',
    'The server reports no fusions available for this table.': 'По данным сервера, для этого стола больше нет доступных слияний.',
    'Fewer than four eligible card types remain.': 'Осталось меньше четырёх подходящих типов карт.',
    'The server returned no confirmed reward.': 'Сервер не подтвердил полученную карту.',
    'The server did not grant the fusion contract.': 'Сервер не открыл стол слияния.',
    'Could not request a fusion contract.': 'Не удалось запросить стол слияния.',
    'Another Random Fusion window opened.': 'Открылось другое окно случайного слияния.',
    'The server rejected opening Random Fusion.': 'Сервер отклонил запрос на открытие случайного слияния.',
    'The server rejected the contract action.': 'Сервер отклонил действие со столом слияния.',
    'The server closed Random Fusion.': 'Сервер закрыл стол случайного слияния.',
    'Random Fusion was opened manually.': 'Окно случайного слияния открыто вручную.',
    'Manual fusion input detected.': 'Обнаружено ручное действие слияния.',
    'The server did not confirm closure. Re-enter your character.': 'Сервер не подтвердил закрытие стола. Перезайдите персонажем.',
    'Random Fusion was closed manually.': 'Окно случайного слияния закрыто вручную.',
    'The server changed the fusion mode or tab.': 'Сервер изменил режим или вкладку слияния.',
    'Waiting for the previous contract to finish.': 'Дождитесь завершения предыдущего стола слияния.',
    'Fusion is already running. Use fusestop to stop it.': 'Слияние уже выполняется. Остановить его можно командой fusestop.',
    'Close the Random Fusion window first.': 'Сначала закройте окно случайного слияния.',
    'Your character has not loaded yet.': 'Данные персонажа ещё не загружены.',
    'Stopped by command.': 'Остановлено командой.',
    common: 'обычных',
    uncommon: 'необычных',
    rare: 'редких'
};

function translate(text, language) {
    if (!String(language || '').toLowerCase().startsWith('ru')) return text;

    if (text.startsWith('Fusion ended. ')) {
        return `Слияние завершено. ${translate(text.slice('Fusion ended. '.length), language)}`;
    }
    if (text.startsWith('Could not send ')) return 'Не удалось отправить запрос слияния.';

    let match = text.match(/^The server did not confirm slot (\d+)\.$/);
    if (match) return `Сервер не подтвердил размещение карты в слоте ${match[1]}.`;

    match = text.match(/^Fewer than four eligible (common|uncommon|rare) card types remain\.$/);
    if (match) return `Осталось меньше четырёх подходящих типов ${RU[match[1]]} карт.`;

    match = text.match(/^Fusion needs four eligible (common|uncommon|rare) card types\.$/);
    if (match) return `Для слияния нужны четыре подходящих типа ${RU[match[1]]} карт.`;

    match = text.match(/^Starting fusion for (common|uncommon|rare) cards\.$/);
    if (match) return `Запуск слияния ${RU[match[1]]} карт.`;

    match = text.match(/^Could not register (.+)\. The current hotkey is still (.+)\.$/);
    if (match) return `Не удалось назначить сочетание ${match[1]}. Текущее сочетание клавиш: ${match[2]}.`;

    match = text.match(/^Card Fusion menu hotkey(?::| set to) (.+)\.?$/);
    if (match) return `Горячая клавиша меню слияния карт${text.includes('set to') ? ' установлена' : ''}: ${match[1]}.`;

    match = text.match(/^(.+) \/ cardfusion menu \(open menu\), fuse 1 \(common\), fuse 2 \(uncommon\), fuse 3 \(rare\), fuse collection \(toggle collection check\), fusestop \(stop fusion\), cardfusion register \(register fragments\)\.$/);
    if (match) return `${match[1]} / cardfusion menu — открыть меню; fuse 1 — обычные, fuse 2 — необычные, fuse 3 — редкие; fuse collection — проверка коллекции; fusestop — остановить слияние; cardfusion register — зарегистрировать фрагменты.`;

    if (Object.prototype.hasOwnProperty.call(RU, text)) return RU[text];
    if (text.startsWith('Fusion is unavailable. ')) return `Слияние недоступно. ${text.slice('Fusion is unavailable. '.length)}`;
    if (text.startsWith('Collection check is unavailable. ')) return `Проверка коллекции недоступна. ${text.slice('Collection check is unavailable. '.length)}`;
    if (text.startsWith('Registration is unavailable. ')) return `Регистрация недоступна. ${text.slice('Registration is unavailable. '.length)}`;
    if (text.startsWith('Could not register ')) return `Не удалось зарегистрировать сочетание клавиш: ${text.slice('Could not register '.length)}`;
    return text;
}

module.exports = { translate };
