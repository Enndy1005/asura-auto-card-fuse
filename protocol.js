const { isDeepStrictEqual } = require('node:util');
const path = require('node:path');
const { parsers } = require('tera-data-parser');
const { compile } = require('tera-data-parser/lib/protocol/compiler');

const VERSION = 376012;
const SLOT = 'CU_ASURA_CARD_FUSION_SLOT';
const START = 'CU_ASURA_CARD_FUSION_START';
const RESULT = 'SU_ASURA_CARD_FUSION_RESULT';
const STATE = 'SU_ASURA_CARD_FUSION_STATE';
const SLOT_ACK = 'SU_ASURA_CARD_FUSION_SLOT_ACK';
const UPDATE = 'SU_ASURA_CARD_FUSION_UPDATE';
const DIRECTORY = path.join(__dirname, 'protocol', String(VERSION));

const COLLECTION_SAMPLES = {
    S_CARD_DATA: {
        gameId: 17n, presetCount: 3, currentPreset: 1, collectionLevel: 5, collectionPoints: 234,
        cards: [{ cardId: 301011, cardCount: 19 }, { cardId: 302014, cardCount: 20 }],
        presets: [{ index: 7, presetCards: [{ cardId: 301011 }, { cardId: 302014 }] }],
        collectionPointsRewards: [{ index: 11 }, { index: 13 }]
    },
    S_REGISTER_CARD: { name: 'Card', cardId: 301011, count: 19, totalCollectionPoints: 234 }
};

function compatible(name, installed, expected) {
    if (!installed.readable || !installed.writeable ||
        installed.hasPadding !== expected.hasPadding || installed.minLength !== expected.minLength ||
        installed.isDynamicLength !== expected.isDynamicLength) return false;

    const sample = COLLECTION_SAMPLES[name] ?? expected.reader(
        new DataView(Uint8Array.from({ length: expected.minLength }, (_, index) => index + 1).buffer));
    const bytes = new Uint8Array(0x10000);
    const view = new DataView(bytes.buffer);
    const size = expected.writer(view, sample);
    const wire = bytes.slice(0, size);
    const wireView = new DataView(wire.buffer);
    const decoded = installed.reader(wireView);
    const reference = expected.reader(wireView);
    bytes.fill(0);
    return isDeepStrictEqual(decoded, reference) &&
        isDeepStrictEqual(installed.cloner(decoded), expected.cloner(reference)) &&
        installed.writer(view, sample) === size &&
        Buffer.compare(bytes.subarray(0, size), wire) === 0;
}

function bindPackets(dispatch, packets) {
    const prepared = packets.map(([name, opcode, builtIn]) => {
        if (!Number.isInteger(opcode) || opcode < 1 || opcode > 0xffff) {
            throw new Error('Invalid opcode for ' + name);
        }
        const { name: names, code: codes, padding } = dispatch.protocolMap;
        const code = names.get(name);
        const owner = codes.get(opcode);
        if ((code !== undefined && code !== opcode) ||
            (owner !== undefined && owner !== name) ||
            (builtIn && (code !== opcode || owner !== name)) ||
            (code !== undefined && owner !== name) || padding[opcode]) {
            throw new Error(`${name} has an incompatible opcode binding`);
        }

        const file = path.join(DIRECTORY, `${name}.1.def`);
        const expected = compile(parsers.Def(file), false);
        const installed = dispatch.protocol.messages.get(name)?.get(1);
        if (installed && !compatible(name, installed, expected)) {
            throw new Error(`${name}.1 has an incompatible installed definition`);
        }
        return { name, opcode, expected, installed, missingOpcode: code === undefined };
    });

    for (const { name, opcode, expected, installed, missingOpcode } of prepared) {
        if (missingOpcode) dispatch.addOpcode(name, opcode);
        if (!installed) dispatch.addDefinition(name, 1, expected);
    }
}

function configure(dispatch) {
    const unavailable = {};
    if (dispatch.protocolVersion !== VERSION) {
        unavailable.protocol = `Requires Asura protocol ${VERSION}. Connected using ${dispatch.protocolVersion}.`;
        return unavailable;
    }

    function check(feature, bind) {
        try {
            bind();
        } catch (error) {
            unavailable[feature] = error.message;
        }
    }

    check('collection', () => bindPackets(dispatch, [
        ['S_CARD_DATA', 20604, true], ['S_REGISTER_CARD', 38933, true]
    ]));
    check('register', () => {
        if (!dispatch.resolve('C_USE_ITEM', 3).definition.writeable) {
            throw new Error('This connection does not support card registration.');
        }
    });
    check('fusion', () => {
        for (const name of ['C_REQUEST_CONTRACT', 'S_REPLY_REQUEST_CONTRACT', 'S_REQUEST_CONTRACT',
            'C_CANCEL_CONTRACT', 'S_CANCEL_CONTRACT', 'S_REJECT_CONTRACT']) {
            if (!dispatch.resolve(name, 1).definition.readable) throw new Error(`${name}.1 is unavailable`);
        }
        for (const name of ['C_REQUEST_CONTRACT', 'C_CANCEL_CONTRACT']) {
            if (!dispatch.resolve(name, 1).definition.writeable) throw new Error(name + '.1 unavailable for sending');
        }
        const map = parsers.Map(path.join(DIRECTORY, `protocol.${VERSION}.map`));
        bindPackets(dispatch, [SLOT, START, RESULT, STATE, SLOT_ACK, UPDATE].map(name => [name, map[name]]));
    });
    return unavailable;
}

module.exports = { configure, SLOT, START, RESULT, STATE, SLOT_ACK, UPDATE };
