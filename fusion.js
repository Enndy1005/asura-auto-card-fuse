const { randomInt } = require('node:crypto');
const { SLOT, START, RESULT, STATE, SLOT_ACK, UPDATE } = require('./protocol');

const CONTRACT_TYPE = 103;
const MODE = 3;
const TAB = 0;
const GRADES = ['common', 'uncommon', 'rare'];
const NON_FUSIBLE_CARD_IDS = new Set([341034, 340034, 311068, 310068, 311027, 310027]);
const CLEAR = 1;
const ADD = 2;
const OPTION = 5;
const SLOT_COUNT = 4;
const TIMEOUT = 4000;
const INCOMING = { filter: { incoming: true } };
const OUTGOING = { order: 100, filter: { incoming: false } };

module.exports = function createFusion(mod, getCollection, freeSlots, isCard, collectionLimit, message) {
    const { dispatch, game } = mod;
    const { inventory } = game;
    let run = null;
    let manualWindow = null;
    let timer = null;
    let requestId = randomInt(1, 0x80000000);
    let revision = 0;

    function cancelTimer() {
        if (timer !== null) mod.clearTimeout(timer);
        timer = null;
    }

    function wait(callback) {
        cancelTimer();
        timer = mod.setTimeout(() => {
            timer = null;
            callback();
        }, TIMEOUT);
    }

    function finish() {
        cancelTimer();
        run = null;
    }

    function send(name, event) {
        try {
            if (mod.toServer(name, 1, event)) return true;
        } catch (error) {
            mod.warn(String(error));
        }
        return false;
    }

    function close(restart = false) {
        if (run.phase === 'closing') return;
        cancelTimer();
        run.restart = restart;
        run.phase = 'closing';
        run.action = null;
        if (!send('C_CANCEL_CONTRACT', { type: CONTRACT_TYPE, id: run.contractId | 0 })) {
            run.restart = false;
            return message('Fusion ended. Could not close the fusion contract. Re-enter your character.');
        }
        wait(() => {
            run.restart = false;
            message('Fusion ended. The server did not confirm closure. Re-enter your character.');
        });
    }

    function stop(text) {
        if (!run || run.cancelled) return;
        if (run.phase === 'closing' && !run.restart) return;
        run.restart = false;
        if (text) message('Fusion ended. ' + text);
        if (run.phase === 'closing') return;
        if (run.phase === 'restart') return finish();
        if (run.contractId !== null) return close();

        // The opening request cannot be cancelled before an ID is assigned.
        // Keep it pending to close a late grant, unless a manual open supersedes it.
        cancelTimer();
        run.cancelled = true;
    }

    function inventoryProblem() {
        if (!getCollection()) return 'Waiting for card collection data.';
        const free = freeSlots();
        if (free === null) return 'Waiting for inventory data.';
        if (free < SLOT_COUNT) return 'Four free inventory slots are required.';
        return null;
    }

    function isEligible(item, grade) {
        return isCard(item) && !NON_FUSIBLE_CARD_IDS.has(item.id) && String(item.data.rareGrade) === String(grade) &&
            (getCollection()?.get(item.id) ?? 0) >= collectionLimit;
    }

    function selectCards(grade) {
        const selected = new Map();
        for (const item of inventory.bagOrPocketItems.filter(item => isEligible(item, grade)).sort((a, b) => b.amount - a.amount)) {
            if (!selected.has(item.id)) selected.set(item.id, { id: item.id, dbid: item.dbid, balance: item.amount });
            if (selected.size === SLOT_COUNT) break;
        }
        return [...selected.values()];
    }

    function verifyCards() {
        const problem = inventoryProblem();
        if (problem) {
            stop(problem);
            return false;
        }
        const eligible = run.cards.every(({ id, dbid, balance }) => {
            const current = inventory.dbids[dbid];
            return balance > 0 && current?.id === id && current.container === 0 && isEligible(current, run.grade);
        });
        if (!eligible) stop('Selected stacks changed during placement.');
        return eligible;
    }

    function sendAction(phase, name, fields, timeoutMessage) {
        requestId = (requestId + 1) >>> 0;
        const event = { mode: MODE, tab: TAB, contractId: run.contractId, requestId, ...fields };
        run.phase = phase;
        run.action = event;
        wait(() => stop(timeoutMessage));
        if (!send(name, event)) stop(`Could not send ${name}.`);
    }

    function clearSlots() {
        sendAction('clear', SLOT, { operation: CLEAR, slot: 0, cardId: 0, amount: 0, dbid: 0n },
            'The server did not confirm the slot clear.');
    }

    function addCard(slot) {
        if (!verifyCards()) return;
        const { id, dbid } = run.cards[slot];
        sendAction('add', SLOT, { operation: ADD, slot, cardId: id, amount: 1, dbid },
            `The server did not confirm slot ${slot + 1}.`);
    }

    function fuseSelection() {
        if (!verifyCards()) return;
        run.beforeRevision = revision;
        run.before = run.cards.map(card => inventory.dbids[card.dbid].amount);
        sendAction('result', START, { reserved: 0, option: OPTION },
            'The server did not confirm the result. Check your inventory before restarting.');
    }

    function matchesAction(event) {
        return run.action && event.requestId === run.action.requestId && event.mode === MODE && event.tab === TAB;
    }

    function onSlotAck(event) {
        if ((run.phase !== 'clear' && run.phase !== 'add') || !matchesAction(event)) return;
        const { operation, cardId, amount, dbid, slot } = run.action;
        if (event.operation !== operation || event.cardId !== cardId || event.amount !== amount || event.dbid !== dbid) {
            return stop('The slot confirmation did not match the request.');
        }
        if (operation === ADD) {
            if (slot + 1 < SLOT_COUNT) addCard(slot + 1);
            else {
                run.left = Math.min(run.left, event.remaining);
                if (!run.left) return stop('The server reports no fusions available for this table.');
                fuseSelection();
            }
            return;
        }
        const problem = inventoryProblem();
        if (problem) return stop(problem);
        run.cards = selectCards(run.grade);
        if (run.cards.length < SLOT_COUNT) return stop('Fewer than four eligible card types remain.');
        run.left = Math.min(...run.cards.map(card => card.balance));
        addCard(0);
    }

    function onResult(event) {
        if (run.phase !== 'result' || !matchesAction(event) || event.option !== OPTION) return;
        if (event.rewardCardId <= 0 || event.rewardAmount === 0) {
            return stop('The server returned no confirmed reward.');
        }
        for (const card of run.cards) card.balance--;
        run.left = Math.min(run.left - 1, event.remaining);
        if (run.left > 0) fuseSelection();
        else {
            run.rewardId = event.rewardCardId;
            close(true);
        }
    }

    function openTable() {
        run.phase = 'open';
        run.replied = false;
        run.contractId = null;
        wait(() => stop('The server did not grant the fusion contract.'));
        if (!send('C_REQUEST_CONTRACT', { type: CONTRACT_TYPE, unk2: 0, unk3: 0, unk4: MODE, name: '', data: Buffer.alloc(0) })) {
            finish();
            message('Fusion ended. Could not request a fusion contract.');
        }
    }

    function restartWhenReady() {
        if (run?.phase !== 'restart' || revision <= run.beforeRevision) return;
        if (!run.cards.every((card, index) => card.id === run.rewardId ||
            (inventory.dbids[card.dbid]?.amount ?? 0) < run.before[index])) return;
        const problem = inventoryProblem();
        if (problem) return stop(problem);
        if (selectCards(run.grade).length < SLOT_COUNT) return stop('Fewer than four eligible ' + GRADES[run.grade] + ' card types remain.');
        openTable();
    }

    function inventoryUpdated() {
        revision++;
        restartWhenReady();
    }

    function onOpen({ type, id, senderId, recipientId }) {
        if (type !== CONTRACT_TYPE) return;
        const contractId = id >>> 0;
        if (run?.contractId === contractId) return false;
        if (run?.phase === 'open' && run.replied && contractId !== 0 &&
            senderId === game.me.gameId && recipientId === 0n) {
            run.contractId = contractId;
            if (run.cancelled) close();
            else clearSlots();
            return false;
        }

        manualWindow = contractId;
        if (run?.phase === 'open') {
            finish();
            message('Another Random Fusion window opened.');
        } else {
            stop('Another Random Fusion window opened.');
        }
    }

    function onContractEnd({ type, id }, rejected) {
        if (type !== CONTRACT_TYPE) return;
        const contractId = id >>> 0;
        if (!rejected && manualWindow === contractId) manualWindow = null;
        if (run?.phase === 'open' && rejected) {
            finish();
            message('The server rejected opening Random Fusion.');
            return false;
        }
        if (run?.contractId !== contractId) return;
        if (run.phase === 'closing' && run.restart && !rejected) {
            cancelTimer();
            run.contractId = null;
            run.phase = 'restart';
            run.restart = false;
            restartWhenReady();
            return false;
        }
        if (rejected) stop('The server rejected the contract action.');
        else {
            if (run.phase !== 'closing') message('The server closed Random Fusion.');
            finish();
        }
        return false;
    }

    function onManualOpen({ type }) {
        if (type !== CONTRACT_TYPE || !run) return;
        if (run.phase === 'open') {
            // The reply has no client request ID. A manual open makes ownership ambiguous.
            finish();
            message('Random Fusion was opened manually.');
        } else {
            stop('Random Fusion was opened manually.');
        }
    }

    function onManualFusion({ contractId }) {
        if (run?.contractId === contractId) stop('Manual fusion input detected.');
    }

    mod.hook('C_REQUEST_CONTRACT', 1, OUTGOING, onManualOpen);
    mod.hook('S_REPLY_REQUEST_CONTRACT', 1, INCOMING, ({ type }) => {
        if (type !== CONTRACT_TYPE || run?.phase !== 'open') return;
        run.replied = true;
        return false;
    });
    mod.hook('S_REQUEST_CONTRACT', 1, INCOMING, onOpen);
    mod.hook('S_CANCEL_CONTRACT', 1, INCOMING, event => onContractEnd(event, false));
    mod.hook('S_REJECT_CONTRACT', 1, INCOMING, event => onContractEnd(event, true));
    mod.hook('C_CANCEL_CONTRACT', 1, OUTGOING, ({ type, id }) => {
        const contractId = id >>> 0;
        if (type === CONTRACT_TYPE && run?.contractId === contractId) {
            run.restart = false;
            run.phase = 'closing';
            run.action = null;
            wait(() => message('The server did not confirm closure. Re-enter your character.'));
            message('Random Fusion was closed manually.');
        }
    });
    mod.hook(SLOT, 1, OUTGOING, onManualFusion);
    mod.hook(START, 1, OUTGOING, onManualFusion);

    for (const [name, length, receive] of [[SLOT_ACK, 40, onSlotAck], [RESULT, 32, onResult], [STATE, 40], [UPDATE, 24]]) {
        mod.hook(name, 'raw', INCOMING, (_opcode, bytes) => {
            if (bytes.length !== length || bytes.readUInt16LE(0) !== length) return;
            const event = dispatch.fromRaw(name, 1, bytes);
            if (run?.contractId !== event.contractId) return;
            if (name === STATE && run.phase !== 'closing' && (event.mode !== MODE || event.tab !== TAB)) {
                stop('The server changed the fusion mode or tab.');
            } else if (receive) receive(event);
            return false;
        });
    }

    inventory.on('update', inventoryUpdated);
    return {
        get busy() { return run !== null; },
        start(grade) {
            if (run) {
                return message(run.cancelled || run.phase === 'closing'
                    ? 'Waiting for the previous contract to finish.'
                    : 'Fusion is already running. Use fusestop to stop it.');
            }
            if (manualWindow !== null) return message('Close the Random Fusion window first.');
            const problem = inventoryProblem();
            if (problem) return message(problem);
            if (!game.me.gameId) return message('Your character has not loaded yet.');
            if (selectCards(grade).length < SLOT_COUNT) return message('Fusion needs four eligible ' + GRADES[grade] + ' card types.');

            run = { grade, cancelled: false, restart: false, cards: null, action: null };
            message('Starting fusion for ' + GRADES[grade] + ' cards.');
            openTable();
        },
        stop() { stop('Stopped by command.'); },
        dispose() {
            if (run && run.contractId !== null && run.phase !== 'closing') {
                send('C_CANCEL_CONTRACT', { type: CONTRACT_TYPE, id: run.contractId | 0 });
            }
            finish();
            manualWindow = null;
        },
        destroy() {
            this.dispose();
            inventory.off('update', inventoryUpdated);
        }
    };
};
