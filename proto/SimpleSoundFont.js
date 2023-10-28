/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
import * as $protobuf from "protobufjs";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

export const Envelope = $root.Envelope = (() => {

    /**
     * Properties of an Envelope.
     * @exports IEnvelope
     * @interface IEnvelope
     * @property {number|null} [attack] Envelope attack
     * @property {number|null} [decay] Envelope decay
     * @property {number|null} [sustain] Envelope sustain
     * @property {number|null} [release] Envelope release
     */

    /**
     * Constructs a new Envelope.
     * @exports Envelope
     * @classdesc Represents an Envelope.
     * @implements IEnvelope
     * @constructor
     * @param {IEnvelope=} [properties] Properties to set
     */
    function Envelope(properties) {
        if (properties)
            for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null)
                    this[keys[i]] = properties[keys[i]];
    }

    /**
     * Envelope attack.
     * @member {number} attack
     * @memberof Envelope
     * @instance
     */
    Envelope.prototype.attack = 0;

    /**
     * Envelope decay.
     * @member {number} decay
     * @memberof Envelope
     * @instance
     */
    Envelope.prototype.decay = 0;

    /**
     * Envelope sustain.
     * @member {number} sustain
     * @memberof Envelope
     * @instance
     */
    Envelope.prototype.sustain = 0;

    /**
     * Envelope release.
     * @member {number} release
     * @memberof Envelope
     * @instance
     */
    Envelope.prototype.release = 0;

    /**
     * Creates a new Envelope instance using the specified properties.
     * @function create
     * @memberof Envelope
     * @static
     * @param {IEnvelope=} [properties] Properties to set
     * @returns {Envelope} Envelope instance
     */
    Envelope.create = function create(properties) {
        return new Envelope(properties);
    };

    /**
     * Encodes the specified Envelope message. Does not implicitly {@link Envelope.verify|verify} messages.
     * @function encode
     * @memberof Envelope
     * @static
     * @param {IEnvelope} message Envelope message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    Envelope.encode = function encode(message, writer) {
        if (!writer)
            writer = $Writer.create();
        if (message.attack != null && Object.hasOwnProperty.call(message, "attack"))
            writer.uint32(/* id 1, wireType 5 =*/13).float(message.attack);
        if (message.decay != null && Object.hasOwnProperty.call(message, "decay"))
            writer.uint32(/* id 2, wireType 5 =*/21).float(message.decay);
        if (message.sustain != null && Object.hasOwnProperty.call(message, "sustain"))
            writer.uint32(/* id 3, wireType 5 =*/29).float(message.sustain);
        if (message.release != null && Object.hasOwnProperty.call(message, "release"))
            writer.uint32(/* id 4, wireType 5 =*/37).float(message.release);
        return writer;
    };

    /**
     * Encodes the specified Envelope message, length delimited. Does not implicitly {@link Envelope.verify|verify} messages.
     * @function encodeDelimited
     * @memberof Envelope
     * @static
     * @param {IEnvelope} message Envelope message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    Envelope.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
    };

    /**
     * Decodes an Envelope message from the specified reader or buffer.
     * @function decode
     * @memberof Envelope
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {Envelope} Envelope
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    Envelope.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Envelope();
        while (reader.pos < end) {
            let tag = reader.uint32();
            switch (tag >>> 3) {
            case 1: {
                    message.attack = reader.float();
                    break;
                }
            case 2: {
                    message.decay = reader.float();
                    break;
                }
            case 3: {
                    message.sustain = reader.float();
                    break;
                }
            case 4: {
                    message.release = reader.float();
                    break;
                }
            default:
                reader.skipType(tag & 7);
                break;
            }
        }
        return message;
    };

    /**
     * Decodes an Envelope message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof Envelope
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {Envelope} Envelope
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    Envelope.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies an Envelope message.
     * @function verify
     * @memberof Envelope
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    Envelope.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        if (message.attack != null && message.hasOwnProperty("attack"))
            if (typeof message.attack !== "number")
                return "attack: number expected";
        if (message.decay != null && message.hasOwnProperty("decay"))
            if (typeof message.decay !== "number")
                return "decay: number expected";
        if (message.sustain != null && message.hasOwnProperty("sustain"))
            if (typeof message.sustain !== "number")
                return "sustain: number expected";
        if (message.release != null && message.hasOwnProperty("release"))
            if (typeof message.release !== "number")
                return "release: number expected";
        return null;
    };

    /**
     * Creates an Envelope message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof Envelope
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {Envelope} Envelope
     */
    Envelope.fromObject = function fromObject(object) {
        if (object instanceof $root.Envelope)
            return object;
        let message = new $root.Envelope();
        if (object.attack != null)
            message.attack = Number(object.attack);
        if (object.decay != null)
            message.decay = Number(object.decay);
        if (object.sustain != null)
            message.sustain = Number(object.sustain);
        if (object.release != null)
            message.release = Number(object.release);
        return message;
    };

    /**
     * Creates a plain object from an Envelope message. Also converts values to other types if specified.
     * @function toObject
     * @memberof Envelope
     * @static
     * @param {Envelope} message Envelope
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    Envelope.toObject = function toObject(message, options) {
        if (!options)
            options = {};
        let object = {};
        if (options.defaults) {
            object.attack = 0;
            object.decay = 0;
            object.sustain = 0;
            object.release = 0;
        }
        if (message.attack != null && message.hasOwnProperty("attack"))
            object.attack = options.json && !isFinite(message.attack) ? String(message.attack) : message.attack;
        if (message.decay != null && message.hasOwnProperty("decay"))
            object.decay = options.json && !isFinite(message.decay) ? String(message.decay) : message.decay;
        if (message.sustain != null && message.hasOwnProperty("sustain"))
            object.sustain = options.json && !isFinite(message.sustain) ? String(message.sustain) : message.sustain;
        if (message.release != null && message.hasOwnProperty("release"))
            object.release = options.json && !isFinite(message.release) ? String(message.release) : message.release;
        return object;
    };

    /**
     * Converts this Envelope to JSON.
     * @function toJSON
     * @memberof Envelope
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    Envelope.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };

    /**
     * Gets the default type url for Envelope
     * @function getTypeUrl
     * @memberof Envelope
     * @static
     * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns {string} The default type url
     */
    Envelope.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === undefined) {
            typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/Envelope";
    };

    return Envelope;
})();

export const Zone = $root.Zone = (() => {

    /**
     * Properties of a Zone.
     * @exports IZone
     * @interface IZone
     * @property {number|null} [minPitch] Zone minPitch
     * @property {number|null} [maxPitch] Zone maxPitch
     * @property {number|null} [minVelocity] Zone minVelocity
     * @property {number|null} [maxVelocity] Zone maxVelocity
     * @property {IEnvelope|null} [envelope] Zone envelope
     * @property {Uint8Array|null} [sample] Zone sample
     */

    /**
     * Constructs a new Zone.
     * @exports Zone
     * @classdesc Represents a Zone.
     * @implements IZone
     * @constructor
     * @param {IZone=} [properties] Properties to set
     */
    function Zone(properties) {
        if (properties)
            for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null)
                    this[keys[i]] = properties[keys[i]];
    }

    /**
     * Zone minPitch.
     * @member {number} minPitch
     * @memberof Zone
     * @instance
     */
    Zone.prototype.minPitch = 0;

    /**
     * Zone maxPitch.
     * @member {number} maxPitch
     * @memberof Zone
     * @instance
     */
    Zone.prototype.maxPitch = 0;

    /**
     * Zone minVelocity.
     * @member {number} minVelocity
     * @memberof Zone
     * @instance
     */
    Zone.prototype.minVelocity = 0;

    /**
     * Zone maxVelocity.
     * @member {number} maxVelocity
     * @memberof Zone
     * @instance
     */
    Zone.prototype.maxVelocity = 0;

    /**
     * Zone envelope.
     * @member {IEnvelope|null|undefined} envelope
     * @memberof Zone
     * @instance
     */
    Zone.prototype.envelope = null;

    /**
     * Zone sample.
     * @member {Uint8Array} sample
     * @memberof Zone
     * @instance
     */
    Zone.prototype.sample = $util.newBuffer([]);

    /**
     * Creates a new Zone instance using the specified properties.
     * @function create
     * @memberof Zone
     * @static
     * @param {IZone=} [properties] Properties to set
     * @returns {Zone} Zone instance
     */
    Zone.create = function create(properties) {
        return new Zone(properties);
    };

    /**
     * Encodes the specified Zone message. Does not implicitly {@link Zone.verify|verify} messages.
     * @function encode
     * @memberof Zone
     * @static
     * @param {IZone} message Zone message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    Zone.encode = function encode(message, writer) {
        if (!writer)
            writer = $Writer.create();
        if (message.minPitch != null && Object.hasOwnProperty.call(message, "minPitch"))
            writer.uint32(/* id 1, wireType 0 =*/8).int32(message.minPitch);
        if (message.maxPitch != null && Object.hasOwnProperty.call(message, "maxPitch"))
            writer.uint32(/* id 2, wireType 0 =*/16).int32(message.maxPitch);
        if (message.minVelocity != null && Object.hasOwnProperty.call(message, "minVelocity"))
            writer.uint32(/* id 3, wireType 0 =*/24).int32(message.minVelocity);
        if (message.maxVelocity != null && Object.hasOwnProperty.call(message, "maxVelocity"))
            writer.uint32(/* id 4, wireType 0 =*/32).int32(message.maxVelocity);
        if (message.envelope != null && Object.hasOwnProperty.call(message, "envelope"))
            $root.Envelope.encode(message.envelope, writer.uint32(/* id 5, wireType 2 =*/42).fork()).ldelim();
        if (message.sample != null && Object.hasOwnProperty.call(message, "sample"))
            writer.uint32(/* id 6, wireType 2 =*/50).bytes(message.sample);
        return writer;
    };

    /**
     * Encodes the specified Zone message, length delimited. Does not implicitly {@link Zone.verify|verify} messages.
     * @function encodeDelimited
     * @memberof Zone
     * @static
     * @param {IZone} message Zone message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    Zone.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
    };

    /**
     * Decodes a Zone message from the specified reader or buffer.
     * @function decode
     * @memberof Zone
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {Zone} Zone
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    Zone.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Zone();
        while (reader.pos < end) {
            let tag = reader.uint32();
            switch (tag >>> 3) {
            case 1: {
                    message.minPitch = reader.int32();
                    break;
                }
            case 2: {
                    message.maxPitch = reader.int32();
                    break;
                }
            case 3: {
                    message.minVelocity = reader.int32();
                    break;
                }
            case 4: {
                    message.maxVelocity = reader.int32();
                    break;
                }
            case 5: {
                    message.envelope = $root.Envelope.decode(reader, reader.uint32());
                    break;
                }
            case 6: {
                    message.sample = reader.bytes();
                    break;
                }
            default:
                reader.skipType(tag & 7);
                break;
            }
        }
        return message;
    };

    /**
     * Decodes a Zone message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof Zone
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {Zone} Zone
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    Zone.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies a Zone message.
     * @function verify
     * @memberof Zone
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    Zone.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        if (message.minPitch != null && message.hasOwnProperty("minPitch"))
            if (!$util.isInteger(message.minPitch))
                return "minPitch: integer expected";
        if (message.maxPitch != null && message.hasOwnProperty("maxPitch"))
            if (!$util.isInteger(message.maxPitch))
                return "maxPitch: integer expected";
        if (message.minVelocity != null && message.hasOwnProperty("minVelocity"))
            if (!$util.isInteger(message.minVelocity))
                return "minVelocity: integer expected";
        if (message.maxVelocity != null && message.hasOwnProperty("maxVelocity"))
            if (!$util.isInteger(message.maxVelocity))
                return "maxVelocity: integer expected";
        if (message.envelope != null && message.hasOwnProperty("envelope")) {
            let error = $root.Envelope.verify(message.envelope);
            if (error)
                return "envelope." + error;
        }
        if (message.sample != null && message.hasOwnProperty("sample"))
            if (!(message.sample && typeof message.sample.length === "number" || $util.isString(message.sample)))
                return "sample: buffer expected";
        return null;
    };

    /**
     * Creates a Zone message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof Zone
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {Zone} Zone
     */
    Zone.fromObject = function fromObject(object) {
        if (object instanceof $root.Zone)
            return object;
        let message = new $root.Zone();
        if (object.minPitch != null)
            message.minPitch = object.minPitch | 0;
        if (object.maxPitch != null)
            message.maxPitch = object.maxPitch | 0;
        if (object.minVelocity != null)
            message.minVelocity = object.minVelocity | 0;
        if (object.maxVelocity != null)
            message.maxVelocity = object.maxVelocity | 0;
        if (object.envelope != null) {
            if (typeof object.envelope !== "object")
                throw TypeError(".Zone.envelope: object expected");
            message.envelope = $root.Envelope.fromObject(object.envelope);
        }
        if (object.sample != null)
            if (typeof object.sample === "string")
                $util.base64.decode(object.sample, message.sample = $util.newBuffer($util.base64.length(object.sample)), 0);
            else if (object.sample.length >= 0)
                message.sample = object.sample;
        return message;
    };

    /**
     * Creates a plain object from a Zone message. Also converts values to other types if specified.
     * @function toObject
     * @memberof Zone
     * @static
     * @param {Zone} message Zone
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    Zone.toObject = function toObject(message, options) {
        if (!options)
            options = {};
        let object = {};
        if (options.defaults) {
            object.minPitch = 0;
            object.maxPitch = 0;
            object.minVelocity = 0;
            object.maxVelocity = 0;
            object.envelope = null;
            if (options.bytes === String)
                object.sample = "";
            else {
                object.sample = [];
                if (options.bytes !== Array)
                    object.sample = $util.newBuffer(object.sample);
            }
        }
        if (message.minPitch != null && message.hasOwnProperty("minPitch"))
            object.minPitch = message.minPitch;
        if (message.maxPitch != null && message.hasOwnProperty("maxPitch"))
            object.maxPitch = message.maxPitch;
        if (message.minVelocity != null && message.hasOwnProperty("minVelocity"))
            object.minVelocity = message.minVelocity;
        if (message.maxVelocity != null && message.hasOwnProperty("maxVelocity"))
            object.maxVelocity = message.maxVelocity;
        if (message.envelope != null && message.hasOwnProperty("envelope"))
            object.envelope = $root.Envelope.toObject(message.envelope, options);
        if (message.sample != null && message.hasOwnProperty("sample"))
            object.sample = options.bytes === String ? $util.base64.encode(message.sample, 0, message.sample.length) : options.bytes === Array ? Array.prototype.slice.call(message.sample) : message.sample;
        return object;
    };

    /**
     * Converts this Zone to JSON.
     * @function toJSON
     * @memberof Zone
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    Zone.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };

    /**
     * Gets the default type url for Zone
     * @function getTypeUrl
     * @memberof Zone
     * @static
     * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns {string} The default type url
     */
    Zone.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === undefined) {
            typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/Zone";
    };

    return Zone;
})();

export const Instrument = $root.Instrument = (() => {

    /**
     * Properties of an Instrument.
     * @exports IInstrument
     * @interface IInstrument
     * @property {number|null} [midiProgramNum] Instrument midiProgramNum
     * @property {number|null} [bankNum] Instrument bankNum
     * @property {boolean|null} [loop] Instrument loop
     * @property {Array.<IZone>|null} [zones] Instrument zones
     */

    /**
     * Constructs a new Instrument.
     * @exports Instrument
     * @classdesc Represents an Instrument.
     * @implements IInstrument
     * @constructor
     * @param {IInstrument=} [properties] Properties to set
     */
    function Instrument(properties) {
        this.zones = [];
        if (properties)
            for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null)
                    this[keys[i]] = properties[keys[i]];
    }

    /**
     * Instrument midiProgramNum.
     * @member {number} midiProgramNum
     * @memberof Instrument
     * @instance
     */
    Instrument.prototype.midiProgramNum = 0;

    /**
     * Instrument bankNum.
     * @member {number} bankNum
     * @memberof Instrument
     * @instance
     */
    Instrument.prototype.bankNum = 0;

    /**
     * Instrument loop.
     * @member {boolean} loop
     * @memberof Instrument
     * @instance
     */
    Instrument.prototype.loop = false;

    /**
     * Instrument zones.
     * @member {Array.<IZone>} zones
     * @memberof Instrument
     * @instance
     */
    Instrument.prototype.zones = $util.emptyArray;

    /**
     * Creates a new Instrument instance using the specified properties.
     * @function create
     * @memberof Instrument
     * @static
     * @param {IInstrument=} [properties] Properties to set
     * @returns {Instrument} Instrument instance
     */
    Instrument.create = function create(properties) {
        return new Instrument(properties);
    };

    /**
     * Encodes the specified Instrument message. Does not implicitly {@link Instrument.verify|verify} messages.
     * @function encode
     * @memberof Instrument
     * @static
     * @param {IInstrument} message Instrument message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    Instrument.encode = function encode(message, writer) {
        if (!writer)
            writer = $Writer.create();
        if (message.midiProgramNum != null && Object.hasOwnProperty.call(message, "midiProgramNum"))
            writer.uint32(/* id 1, wireType 0 =*/8).int32(message.midiProgramNum);
        if (message.bankNum != null && Object.hasOwnProperty.call(message, "bankNum"))
            writer.uint32(/* id 2, wireType 0 =*/16).int32(message.bankNum);
        if (message.loop != null && Object.hasOwnProperty.call(message, "loop"))
            writer.uint32(/* id 3, wireType 0 =*/24).bool(message.loop);
        if (message.zones != null && message.zones.length)
            for (let i = 0; i < message.zones.length; ++i)
                $root.Zone.encode(message.zones[i], writer.uint32(/* id 4, wireType 2 =*/34).fork()).ldelim();
        return writer;
    };

    /**
     * Encodes the specified Instrument message, length delimited. Does not implicitly {@link Instrument.verify|verify} messages.
     * @function encodeDelimited
     * @memberof Instrument
     * @static
     * @param {IInstrument} message Instrument message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    Instrument.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
    };

    /**
     * Decodes an Instrument message from the specified reader or buffer.
     * @function decode
     * @memberof Instrument
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {Instrument} Instrument
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    Instrument.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Instrument();
        while (reader.pos < end) {
            let tag = reader.uint32();
            switch (tag >>> 3) {
            case 1: {
                    message.midiProgramNum = reader.int32();
                    break;
                }
            case 2: {
                    message.bankNum = reader.int32();
                    break;
                }
            case 3: {
                    message.loop = reader.bool();
                    break;
                }
            case 4: {
                    if (!(message.zones && message.zones.length))
                        message.zones = [];
                    message.zones.push($root.Zone.decode(reader, reader.uint32()));
                    break;
                }
            default:
                reader.skipType(tag & 7);
                break;
            }
        }
        return message;
    };

    /**
     * Decodes an Instrument message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof Instrument
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {Instrument} Instrument
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    Instrument.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies an Instrument message.
     * @function verify
     * @memberof Instrument
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    Instrument.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        if (message.midiProgramNum != null && message.hasOwnProperty("midiProgramNum"))
            if (!$util.isInteger(message.midiProgramNum))
                return "midiProgramNum: integer expected";
        if (message.bankNum != null && message.hasOwnProperty("bankNum"))
            if (!$util.isInteger(message.bankNum))
                return "bankNum: integer expected";
        if (message.loop != null && message.hasOwnProperty("loop"))
            if (typeof message.loop !== "boolean")
                return "loop: boolean expected";
        if (message.zones != null && message.hasOwnProperty("zones")) {
            if (!Array.isArray(message.zones))
                return "zones: array expected";
            for (let i = 0; i < message.zones.length; ++i) {
                let error = $root.Zone.verify(message.zones[i]);
                if (error)
                    return "zones." + error;
            }
        }
        return null;
    };

    /**
     * Creates an Instrument message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof Instrument
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {Instrument} Instrument
     */
    Instrument.fromObject = function fromObject(object) {
        if (object instanceof $root.Instrument)
            return object;
        let message = new $root.Instrument();
        if (object.midiProgramNum != null)
            message.midiProgramNum = object.midiProgramNum | 0;
        if (object.bankNum != null)
            message.bankNum = object.bankNum | 0;
        if (object.loop != null)
            message.loop = Boolean(object.loop);
        if (object.zones) {
            if (!Array.isArray(object.zones))
                throw TypeError(".Instrument.zones: array expected");
            message.zones = [];
            for (let i = 0; i < object.zones.length; ++i) {
                if (typeof object.zones[i] !== "object")
                    throw TypeError(".Instrument.zones: object expected");
                message.zones[i] = $root.Zone.fromObject(object.zones[i]);
            }
        }
        return message;
    };

    /**
     * Creates a plain object from an Instrument message. Also converts values to other types if specified.
     * @function toObject
     * @memberof Instrument
     * @static
     * @param {Instrument} message Instrument
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    Instrument.toObject = function toObject(message, options) {
        if (!options)
            options = {};
        let object = {};
        if (options.arrays || options.defaults)
            object.zones = [];
        if (options.defaults) {
            object.midiProgramNum = 0;
            object.bankNum = 0;
            object.loop = false;
        }
        if (message.midiProgramNum != null && message.hasOwnProperty("midiProgramNum"))
            object.midiProgramNum = message.midiProgramNum;
        if (message.bankNum != null && message.hasOwnProperty("bankNum"))
            object.bankNum = message.bankNum;
        if (message.loop != null && message.hasOwnProperty("loop"))
            object.loop = message.loop;
        if (message.zones && message.zones.length) {
            object.zones = [];
            for (let j = 0; j < message.zones.length; ++j)
                object.zones[j] = $root.Zone.toObject(message.zones[j], options);
        }
        return object;
    };

    /**
     * Converts this Instrument to JSON.
     * @function toJSON
     * @memberof Instrument
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    Instrument.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };

    /**
     * Gets the default type url for Instrument
     * @function getTypeUrl
     * @memberof Instrument
     * @static
     * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns {string} The default type url
     */
    Instrument.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === undefined) {
            typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/Instrument";
    };

    return Instrument;
})();

export const SimpleSoundFont = $root.SimpleSoundFont = (() => {

    /**
     * Properties of a SimpleSoundFont.
     * @exports ISimpleSoundFont
     * @interface ISimpleSoundFont
     * @property {Array.<IInstrument>|null} [instruments] SimpleSoundFont instruments
     */

    /**
     * Constructs a new SimpleSoundFont.
     * @exports SimpleSoundFont
     * @classdesc Represents a SimpleSoundFont.
     * @implements ISimpleSoundFont
     * @constructor
     * @param {ISimpleSoundFont=} [properties] Properties to set
     */
    function SimpleSoundFont(properties) {
        this.instruments = [];
        if (properties)
            for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null)
                    this[keys[i]] = properties[keys[i]];
    }

    /**
     * SimpleSoundFont instruments.
     * @member {Array.<IInstrument>} instruments
     * @memberof SimpleSoundFont
     * @instance
     */
    SimpleSoundFont.prototype.instruments = $util.emptyArray;

    /**
     * Creates a new SimpleSoundFont instance using the specified properties.
     * @function create
     * @memberof SimpleSoundFont
     * @static
     * @param {ISimpleSoundFont=} [properties] Properties to set
     * @returns {SimpleSoundFont} SimpleSoundFont instance
     */
    SimpleSoundFont.create = function create(properties) {
        return new SimpleSoundFont(properties);
    };

    /**
     * Encodes the specified SimpleSoundFont message. Does not implicitly {@link SimpleSoundFont.verify|verify} messages.
     * @function encode
     * @memberof SimpleSoundFont
     * @static
     * @param {ISimpleSoundFont} message SimpleSoundFont message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    SimpleSoundFont.encode = function encode(message, writer) {
        if (!writer)
            writer = $Writer.create();
        if (message.instruments != null && message.instruments.length)
            for (let i = 0; i < message.instruments.length; ++i)
                $root.Instrument.encode(message.instruments[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
        return writer;
    };

    /**
     * Encodes the specified SimpleSoundFont message, length delimited. Does not implicitly {@link SimpleSoundFont.verify|verify} messages.
     * @function encodeDelimited
     * @memberof SimpleSoundFont
     * @static
     * @param {ISimpleSoundFont} message SimpleSoundFont message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    SimpleSoundFont.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
    };

    /**
     * Decodes a SimpleSoundFont message from the specified reader or buffer.
     * @function decode
     * @memberof SimpleSoundFont
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {SimpleSoundFont} SimpleSoundFont
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    SimpleSoundFont.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        let end = length === undefined ? reader.len : reader.pos + length, message = new $root.SimpleSoundFont();
        while (reader.pos < end) {
            let tag = reader.uint32();
            switch (tag >>> 3) {
            case 1: {
                    if (!(message.instruments && message.instruments.length))
                        message.instruments = [];
                    message.instruments.push($root.Instrument.decode(reader, reader.uint32()));
                    break;
                }
            default:
                reader.skipType(tag & 7);
                break;
            }
        }
        return message;
    };

    /**
     * Decodes a SimpleSoundFont message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof SimpleSoundFont
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {SimpleSoundFont} SimpleSoundFont
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    SimpleSoundFont.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies a SimpleSoundFont message.
     * @function verify
     * @memberof SimpleSoundFont
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    SimpleSoundFont.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        if (message.instruments != null && message.hasOwnProperty("instruments")) {
            if (!Array.isArray(message.instruments))
                return "instruments: array expected";
            for (let i = 0; i < message.instruments.length; ++i) {
                let error = $root.Instrument.verify(message.instruments[i]);
                if (error)
                    return "instruments." + error;
            }
        }
        return null;
    };

    /**
     * Creates a SimpleSoundFont message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof SimpleSoundFont
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {SimpleSoundFont} SimpleSoundFont
     */
    SimpleSoundFont.fromObject = function fromObject(object) {
        if (object instanceof $root.SimpleSoundFont)
            return object;
        let message = new $root.SimpleSoundFont();
        if (object.instruments) {
            if (!Array.isArray(object.instruments))
                throw TypeError(".SimpleSoundFont.instruments: array expected");
            message.instruments = [];
            for (let i = 0; i < object.instruments.length; ++i) {
                if (typeof object.instruments[i] !== "object")
                    throw TypeError(".SimpleSoundFont.instruments: object expected");
                message.instruments[i] = $root.Instrument.fromObject(object.instruments[i]);
            }
        }
        return message;
    };

    /**
     * Creates a plain object from a SimpleSoundFont message. Also converts values to other types if specified.
     * @function toObject
     * @memberof SimpleSoundFont
     * @static
     * @param {SimpleSoundFont} message SimpleSoundFont
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    SimpleSoundFont.toObject = function toObject(message, options) {
        if (!options)
            options = {};
        let object = {};
        if (options.arrays || options.defaults)
            object.instruments = [];
        if (message.instruments && message.instruments.length) {
            object.instruments = [];
            for (let j = 0; j < message.instruments.length; ++j)
                object.instruments[j] = $root.Instrument.toObject(message.instruments[j], options);
        }
        return object;
    };

    /**
     * Converts this SimpleSoundFont to JSON.
     * @function toJSON
     * @memberof SimpleSoundFont
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    SimpleSoundFont.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };

    /**
     * Gets the default type url for SimpleSoundFont
     * @function getTypeUrl
     * @memberof SimpleSoundFont
     * @static
     * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns {string} The default type url
     */
    SimpleSoundFont.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === undefined) {
            typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/SimpleSoundFont";
    };

    return SimpleSoundFont;
})();

export { $root as default };
