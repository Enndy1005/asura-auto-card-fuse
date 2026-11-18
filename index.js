const { configure } = require('./protocol');
const createFusion = require('./fusion');

const COLLECTION_LIMIT = 20;
const TIMEOUT = 4000;
const REGISTER_DELAY = 100;
const RARITY_NAMES = ['common', 'uncommon', 'rare'];
const INCOMING = { filter: { incoming: true } };
const OUTGOING = { order: 100, filter: { incoming: false } };

module.exports.NetworkMod = function CardFusion(mod) {
    const { command, game, dispatch } = mod;
    const unavailable = configure(dispatch);
    game.initialize('inventory');
    const { inventory } = game;
    let collection = null;
    let registration = null;
    let timer = null;

    function message(text) {
        command.message(text);
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
    const fusionError = collectionError || unavailable.fusion;
    const registerError = collectionError || unavailable.register;
    const fusion = !fusionError && createFusion(mod, () => collection, freeSlots, isCard, COLLECTION_LIMIT, message);

    if (!collectionError) {
        mod.hook('S_CARD_DATA', 1, INCOMING, ({ gameId, cards }) => {
            if (gameId === game.me.gameId) collection = new Map(cards.map(({ cardId, cardCount }) => [cardId, cardCount]));
        });
        mod.hook('S_REGISTER_CARD', 1, INCOMING, ({ cardId, count }) => {
            if (count < 0 || !collection) return;
            collection.set(cardId, count);
            const pending = registration?.pending;
            if (pending?.id !== cardId) return;
            if (count !== pending.count) return stopRegistration('The registered card count did not match the request. Registration stopped.');
            registration.pending = null;
            schedule(registerNext, REGISTER_DELAY);
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
        const grade = Number(choice) - 1;
        const expectedLabel = label?.toLowerCase() === 'uncommong' ? 'uncommon' : label?.toLowerCase();
        if (args.length > 2 || !/^[1-3]$/.test(choice) || (label && expectedLabel !== RARITY_NAMES[grade])) {
            return message('Use fuse 1 for common, fuse 2 for uncommon, or fuse 3 for rare. Plain fuse also selects rare.');
        }
        if (fusionError) return message(`Fusion is unavailable. ${fusionError}`);
        if (registration) return message('Card registration is already running.');
        fusion.start(grade);
    });
    command.add('fusestop', () => {
        if (fusion) fusion.stop();
    });
    command.add('cardfusion', {
        $default() { message('fuse 1 (common), fuse 2 (uncommon), fuse 3 (rare), fusestop (stop fusion), cardfusion register (register fragments).'); },
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

    this.destructor = () => {
        stopRegistration();
        if (fusion) fusion.destroy();
        collection = null;
        game.off('leave_game', leave);
    };
};
