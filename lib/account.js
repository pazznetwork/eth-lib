"use strict";

var Bytes = require("./bytes");
var Nat = require("./nat");
var elliptic = require("elliptic");
var rlp = require("./rlp");
var secp256k1 = new elliptic.ec("secp256k1"); // eslint-disable-line
var hashLib = require("./hash");
var keccak256 = hashLib.keccak256;
var keccak256s = hashLib.keccak256s;

var create = function create(entropy) {
    var innerHex = keccak256(Bytes.concat(Bytes.random(32), entropy || Bytes.random(32)));
    var middleHex = Bytes.concat(Bytes.concat(Bytes.random(32), innerHex), Bytes.random(32));
    var outerHex = keccak256(middleHex);
    return fromPrivate(outerHex);
};

var toChecksum = function toChecksum(address) {
    var addressHash = keccak256s(address.slice(2));
    var checksumAddress = "0x";
    for (var i = 0; i < 40; i++) {
        checksumAddress += parseInt(addressHash[i + 2], 16) > 7 ? address[i + 2].toUpperCase() : address[i + 2];
    }return checksumAddress;
};

var fromPrivate = function fromPrivate(privateKey) {
    var buffer = new Buffer(privateKey.slice(2), "hex");
    var ecKey = secp256k1.keyFromPrivate(buffer);
    var publicKey = "0x" + ecKey.getPublic(false, 'hex').slice(2);
    var publicHash = keccak256(publicKey);
    var address = toChecksum("0x" + publicHash.slice(-40));
    return {
        address: address,
        privateKey: privateKey
    };
};

var encodeSignature = function encodeSignature(arr) {
    var v = arr[0];
    var r = arr[1];
    var s = arr[2];
    Bytes.flatten([r, s, v]);
};

var decodeSignature = function decodeSignature(hex) {
    return [Bytes.slice(64, Bytes.length(hex), hex), Bytes.slice(0, 32, hex), Bytes.slice(32, 64, hex)];
};

var makeSigner = function makeSigner(addToV) {
    return function (hash, privateKey) {
        var signature = secp256k1.keyFromPrivate(new Buffer(privateKey.slice(2), "hex")).sign(new Buffer(hash.slice(2), "hex"), { canonical: true });
        return encodeSignature([Nat.fromString(Bytes.fromNumber(addToV + signature.recoveryParam)), Bytes.pad(32, Bytes.fromNat("0x" + signature.r.toString(16))), Bytes.pad(32, Bytes.fromNat("0x" + signature.s.toString(16)))]);
    };
};

var sign = makeSigner(27); // v=27|28 instead of 0|1...

var recover = function recover(hash, signature) {
    var vals = decodeSignature(signature);
    var vrs = { v: Bytes.toNumber(vals[0]), r: vals[1].slice(2), s: vals[2].slice(2) };
    var ecPublicKey = secp256k1.recoverPubKey(new Buffer(hash.slice(2), "hex"), vrs, vrs.v < 2 ? vrs.v : 1 - vrs.v % 2); // because odd vals mean v=0... sadly that means v=0 means v=1... I hate that
    var publicKey = "0x" + ecPublicKey.encode("hex", false).slice(2);
    var publicHash = keccak256(publicKey);
    var address = toChecksum("0x" + publicHash.slice(-40));
    return address;
};

module.exports = {
    create: create,
    toChecksum: toChecksum,
    fromPrivate: fromPrivate,
    sign: sign,
    makeSigner: makeSigner,
    recover: recover,
    encodeSignature: encodeSignature,
    decodeSignature: decodeSignature
};