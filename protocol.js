const { isDeepStrictEqual } = require('util');
const path = require('path');
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

const COLLECTION_DEFINITIONS = {
    S_REGISTER_CARD: [
        ['id', 'uint32'], ['num', 'uint32'], ['collectionScore', 'uint32']
    ],
    S_CARD_DATA: [
        ['cards', 'refArray'], ['presets', 'refArray'], ['unk', 'uint32'], ['name', 'refString'],
        ['gameId', 'uint64'], ['numPresets', 'uint32'], ['currentPreset', 'uint32'],
        ['collectionLevel', 'uint32'], ['collectionScore', 'uint32'], ['name', 'string'],
        ['cards', [['id', 'uint32'], ['num', 'uint32']]],
        ['presets', [
            ['equippedCards', 'refArray'], ['preset', 'uint32'],
            ['equippedCards', [['id', 'uint32']]]
        ]]
    ]
};

function prepareDefinition(fields, type = 'root') {
    const result = fields.map(([name, field]) => [name, Array.isArray(field) ? prepareDefinition(field, 'array') : field]);
    result.type = type;
    if (type === 'array') result.flags = [];
    return result;
}

function installCollectionDefinitions(dispatch) {
    for (const [name, fields] of Object.entries(COLLECTION_DEFINITIONS)) {
        dispatch.addDefinition(name, 1, prepareDefinition(fields), false);
    }
}

function compatible(name, installed, expected) {
    if (!installed.readable || !installed.writeable ||
        installed.hasPadding !== expected.hasPadding || installed.minLength !== expected.minLength ||
        installed.isDynamicLength !== expected.isDynamicLength) return false;

    const sample = expected.reader(
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

    check('collection', () => installCollectionDefinitions(dispatch));
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
