const { configure } = require('./protocol');
const createFusion = require('./fusion');
const { translate } = require('./messages');
const globalShortcut = global.TeraProxy?.GUIMode ? require('electron').globalShortcut : null;

const COLLECTION_LIMIT = 20;
const TIMEOUT = 4000;
const REGISTER_DELAY = 100;
const RARITY_NAMES = ['common', 'uncommon', 'rare'];
const INCOMING = { filter: { incoming: true } };
const OUTGOING = { order: 100, filter: { incoming: false } };
const DEFAULT_MENU_HOTKEY = 'Ctrl+Alt+F6';
let toolboxLanguage = 'en';

function loadMenuDefinition() {
    try {
        toolboxLanguage = require('../../bin/config').loadConfig()?.uilanguage || 'en';
    } catch (_) { }

    try {
        const localizedPath = `./menu_${toolboxLanguage}`;
        delete require.cache[require.resolve(localizedPath)];
        return require(localizedPath);
    } catch (_) {
        const defaultPath = './menu';
        delete require.cache[require.resolve(defaultPath)];
        return require(defaultPath);
    }
}

module.exports.NetworkMod = function CardFusion(mod) {
    const { command, game, dispatch } = mod;
    const unavailable = configure(dispatch);
    game.initialize('inventory');
    const { inventory } = game;
    let collection = null;
    let checkCollection = Boolean(mod.settings?.collectionCheck);
    let registration = null;
    let timer = null;
    let menuHotkey = mod.settings?.hotkey || DEFAULT_MENU_HOTKEY;
    let menu = loadMenuDefinition();

    function message(text) {
        command.message(translate(String(text), toolboxLanguage));
    }

    function showMenu() {
        const entries = [];
        Object.keys(menu.categories).forEach(category => {
            entries.push(
                { text: `<font color="#cccccc" size="+22">${category}</font>` },
                { text: '<br>' }
            );
            menu.categories[category].forEach(item => {
                if (!item.command || !item.name) {
                    entries.push({ text: '<br>' });
                    return;
                }
                entries.push(
                    { text: '&nbsp;&nbsp;&nbsp;&nbsp;' },
                    {
                        text: `<font color="${item.color || '#4de19c'}" size="+20">[${item.name}]</font>`,
                        command: item.command
                    }
                );
            });
            entries.push({ text: '<font size="+2"><br><br></font>' });
        });
        renderMenu(entries, '<font>Card Fusion</font>');
    }

    function reloadMenu() {
        menu = loadMenuDefinition();
        showMenu();
        message('Card Fusion menu content reloaded.');
    }

    function renderMenu(entries, title) {
        let body = '';
        entries.forEach(item => {
            if (body.length >= 20000) return;
            if (item.command) body += `<a href="admincommand:/@${item.command};">${item.text}</a>`;
            else body += item.text;
        });
        mod.send('S_ANNOUNCE_UPDATE_NOTIFICATION', 1, { id: 0, title, body });
    }

    function registerMenuHotkey(nextHotkey) {
        if (!globalShortcut) return false;
        try {
            return globalShortcut.register(nextHotkey, showMenu);
        } catch (error) {
            mod.warn(`Could not register ${nextHotkey} for the Card Fusion menu: ${String(error)}`);
            return false;
        }
    }

    function schedule(callback, delay) {
        if (timer !== null) mod.clearTimeout(timer);
        timer = mod.setTimeout(() => {
            timer = null;
            callback();
        }, delay);
    }

    function stopRegistration(text) {
        if (timer !== null) mod.clearTimeout(timer);
        timer = null;
        registration = null;
        if (text) message(text);
    }

    function freeSlots() {
        if (!inventory.pockets?.[0]) return null;
        return inventory.pockets.reduce((total, pocket) =>
            total + Math.max(0, pocket.size - Object.keys(pocket.slots).length), 0);
    }

    function isCard(item) {
        return item?.data?.combatItemType === 'COLLECTION_CARD' && item.amount > 0;
    }

    function registerNext() {
        const { stacks } = registration;
        while (stacks.length) {
            const item = inventory.dbids[stacks.shift()];
            if (!isCard(item) || item.container !== 0) continue;
            const owned = collection.get(item.id) ?? 0;
            const amount = Math.min(COLLECTION_LIMIT - owned, item.amount);
            if (amount <= 0) continue;

            registration.pending = { id: item.id, count: owned + amount };
            schedule(() => stopRegistration('The server did not confirm registration. Check your collection before trying again.'), TIMEOUT);
            try {
                if (mod.toServer('C_USE_ITEM', 3, {
                    gameId: game.me.gameId, id: item.id, dbid: item.dbid, target: 0n, amount,
                    dest: { x: 0, y: 0, z: 0 }, loc: { x: 0, y: 0, z: 0 }, w: 0,
                    unk1: 0, unk2: 0, unk3: 0, unk4: false
                })) return;
            } catch (error) {
                mod.warn(String(error));
            }
            stopRegistration('Could not send the card registration request. Registration stopped.');
            return;
        }
        stopRegistration('Card registration complete.');
    }

    const collectionError = unavailable.protocol || unavailable.collection;
    const fusionError = unavailable.protocol || unavailable.fusion;
    const registerError = collectionError || unavailable.register;
    const fusion = !fusionError && createFusion(mod, () => collection, freeSlots, isCard, COLLECTION_LIMIT, message);

    if (!collectionError) {
        mod.hook('S_CARD_DATA', 'raw', INCOMING, (_opcode, bytes) => {
            try {
                const { gameId, cards } = dispatch.fromRaw('S_CARD_DATA', 1, bytes);
                if (gameId != null && game.me.gameId != null && String(gameId) === String(game.me.gameId) && Array.isArray(cards) &&
                    cards.every(card => Number.isInteger(card.id) && Number.isInteger(card.num))) {
                    collection = new Map(cards.map(({ id, num }) => [id, num]));
                }
            } catch (error) {
                mod.warn('Could not read S_CARD_DATA: ' + String(error));
            }
        });
        mod.hook('S_REGISTER_CARD', 'raw', INCOMING, (_opcode, bytes) => {
            try {
                const { id, num } = dispatch.fromRaw('S_REGISTER_CARD', 1, bytes);
                if (!Number.isInteger(id) || !Number.isInteger(num) || num < 0 || !collection) return;
                collection.set(id, num);
                const pending = registration?.pending;
                if (pending?.id !== id) return;
                if (num !== pending.count) return stopRegistration('The registered card count did not match the request. Registration stopped.');
                registration.pending = null;
                schedule(registerNext, REGISTER_DELAY);
            } catch (error) {
                mod.warn('Could not read S_REGISTER_CARD: ' + String(error));
            }
        });
    }
    if (!registerError) {
        mod.hook('C_USE_ITEM', 3, OUTGOING, ({ id }) => {
            if (registration && inventory.bagOrPocketItems.some(item => item.id === id && isCard(item))) {
                stopRegistration('Manual card use detected. Automatic registration stopped.');
            }
        });
    }

    function leave() {
        stopRegistration();
        if (fusion) fusion.dispose();
        collection = null;
    }

    game.on('leave_game', leave);
    command.add('fuse', (...args) => {
        const [choice = '3', label] = args;
        if (args.length === 1 && choice.toLowerCase() === 'collection') {
            const error = fusionError || collectionError;
            if (error) return message(`Collection check is unavailable. ${error}`);
            if (fusion.busy) return message('Use fusestop before changing the collection check.');
            checkCollection = !checkCollection;
            mod.settings.collectionCheck = checkCollection;
            const russian = String(toolboxLanguage).toLowerCase().startsWith('ru');
            return message(checkCollection
                ? russian
                    ? `Проверка коллекции: <font color="#f04ff1c">ВКЛ</font>. Для слияния нужны ${COLLECTION_LIMIT} зарегистрированных копий каждого типа карты.`
                    : `Collection check is <font color="#f04ff1c">on</font>. Fusion requires ${COLLECTION_LIMIT} registered copies per card type.`
                : russian
                    ? 'Проверка коллекции: <font color="#FF0000">ВЫКЛ</font>. Можно использовать фрагменты незарегистрированных карт.'
                    : 'Collection check is <font color="#FF0000">off</font>. Fusion can use fragments of unregistered cards.');
        }
        const grade = Number(choice) - 1;
        const expectedLabel = label?.toLowerCase() === 'uncommong' ? 'uncommon' : label?.toLowerCase();
        if (args.length > 2 || !/^[1-3]$/.test(choice) || (label && expectedLabel !== RARITY_NAMES[grade])) {
            return message('Use fuse 1 for common, fuse 2 for uncommon, or fuse 3 for rare. Use fuse collection to toggle the collection check.');
        }
        if (fusionError) return message(`Fusion is unavailable. ${fusionError}`);
        if (registration) return message('Card registration is already running.');
        fusion.start(grade, checkCollection);
    });
    command.add('fusestop', () => {
        if (fusion) fusion.stop();
    });
    command.add('cardfusion', {
        $default() { message(`${menuHotkey} / cardfusion menu (open menu), fuse 1 (common), fuse 2 (uncommon), fuse 3 (rare), fuse collection (toggle collection check), fusestop (stop fusion), cardfusion register (register fragments).`); },
        menu() { showMenu(); },
        reloadmenu() { reloadMenu(); },
        hotkey(arg) {
            if (!arg) return message(`Card Fusion menu hotkey: ${menuHotkey}`);
            const nextHotkey = arg.toLowerCase().split('+').map(part => part[0].toUpperCase() + part.slice(1)).join('+');
            if (nextHotkey === menuHotkey) return message(`Card Fusion menu hotkey: ${menuHotkey}`);
            if (!registerMenuHotkey(nextHotkey)) return message(`Could not register ${nextHotkey}. The current hotkey is still ${menuHotkey}.`);
            if (globalShortcut) globalShortcut.unregister(menuHotkey);
            menuHotkey = nextHotkey;
            mod.settings.hotkey = nextHotkey;
            message(`Card Fusion menu hotkey set to ${menuHotkey}.`);
        },
        register() {
            if (registerError) return message(`Registration is unavailable. ${registerError}`);
            if (fusion?.busy || registration) return message('Another card operation is already running.');
            if (!collection || !game.me.gameId || freeSlots() === null) {
                return message('Wait for your character, collection, and inventory to load.');
            }
            registration = { stacks: inventory.bagOrPocketItems.filter(isCard).map(item => item.dbid), pending: null };
            registerNext();
        },
        stop() {
            if (registration) stopRegistration('Card registration stopped.');
            else if (fusion) fusion.stop();
        }
    });

    if (globalShortcut && !registerMenuHotkey(menuHotkey)) {
        mod.warn(`Could not register ${menuHotkey} for the Card Fusion menu; use cardfusion menu instead.`);
    }

    this.destructor = () => {
        if (globalShortcut) globalShortcut.unregister(menuHotkey);
        stopRegistration();
        if (fusion) fusion.destroy();
        collection = null;
        game.off('leave_game', leave);
    };
};
