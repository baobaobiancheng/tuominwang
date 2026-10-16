// Original readable/main.js lines 20201-20526; only Node import aliases and exports added.
import * as V from 'node:stream';
import * as U from 'node:string_decoder';
import z from 'node:events';
const a = { getDefaultExportFromCjs: (value) => value };
const { Transform: ty } = V, { StringDecoder: ny } = U;
const ry = class extends ty {
  constructor(e5) {
    super(Object.assign({}, e5, { writableObjectMode: false })), this._buffer = "";
  }
  _transform(e5, t2, n2) {
    "string" == typeof e5 ? this._transform = this._transformString : (this._stringDecoder = new ny(), this._transform = this._transformBuffer), this._transform(e5, t2, n2);
  }
  _transformBuffer(e5, t2, n2) {
    this._buffer += this._stringDecoder.write(e5), this._processBuffer(n2);
  }
  _transformString(e5, t2, n2) {
    this._buffer += e5.toString(), this._processBuffer(n2);
  }
  _processBuffer(e5) {
    this._buffer && (this.push(this._buffer, "utf8"), this._buffer = ""), e5(null);
  }
  _flushInput() {
    this._stringDecoder && (this._buffer += this._stringDecoder.end());
  }
  _flush(e5) {
    this._flushInput(), this._processBuffer(e5);
  }
}, ay = { value1: /^(?:[\"\{\[\]\-\d]|true\b|false\b|null\b|\s{1,256})/, string: /^(?:[^\x00-\x1f\"\\]{1,256}|\\[bfnrt\"\\\/]|\\u[\da-fA-F]{4}|\")/, key1: /^(?:[\"\}]|\s{1,256})/, colon: /^(?:\:|\s{1,256})/, comma: /^(?:[\,\]\}]|\s{1,256})/, ws: /^\s{1,256}/, numberStart: /^\d/, numberDigit: /^\d{0,256}/, numberFraction: /^[\.eE]/, numberExponent: /^[eE]/, numberExpSign: /^[-+]/ };
let sy = true;
try {
  new RegExp(".", "y"), sy = false;
} catch (pS) {
}
!sy && Object.keys(ay).forEach((e5) => {
  let t2 = ay[e5].source.slice(1);
  "(?:" === t2.slice(0, 3) && ")" === t2.slice(-1) && (t2 = t2.slice(3, -1)), ay[e5] = new RegExp(t2, "y");
}), ay.numberFracStart = ay.numberExpStart = ay.numberStart, ay.numberFracDigit = ay.numberExpDigit = ay.numberDigit;
const oy = { true: true, false: false, null: null }, iy = { object: "objectStop", array: "arrayStop", "": "done" }, cy = (e5) => String.fromCharCode(parseInt(e5.slice(2), 16)), ly = { b: "\b", f: "\f", n: "\n", r: "\r", t: "	", '"': '"', "\\": "\\", "/": "/" };
let uy = class e2 extends ry {
  static make(t2) {
    return new e2(t2);
  }
  constructor(e5) {
    super(Object.assign({}, e5, { readableObjectMode: true })), this._packKeys = this._packStrings = this._packNumbers = this._streamKeys = this._streamStrings = this._streamNumbers = true, e5 && ("packValues" in e5 && (this._packKeys = this._packStrings = this._packNumbers = e5.packValues), "packKeys" in e5 && (this._packKeys = e5.packKeys), "packStrings" in e5 && (this._packStrings = e5.packStrings), "packNumbers" in e5 && (this._packNumbers = e5.packNumbers), "streamValues" in e5 && (this._streamKeys = this._streamStrings = this._streamNumbers = e5.streamValues), "streamKeys" in e5 && (this._streamKeys = e5.streamKeys), "streamStrings" in e5 && (this._streamStrings = e5.streamStrings), "streamNumbers" in e5 && (this._streamNumbers = e5.streamNumbers), this._jsonStreaming = e5.jsonStreaming), !this._packKeys && (this._streamKeys = true), !this._packStrings && (this._streamStrings = true), !this._packNumbers && (this._streamNumbers = true), this._done = false, this._expect = this._jsonStreaming ? "done" : "value", this._stack = [], this._parent = "", this._open_number = false, this._accumulator = "";
  }
  _flush(e5) {
    this._done = true, super._flush((t2) => {
      if (t2) return e5(t2);
      this._open_number && (this._streamNumbers && this.push({ name: "endNumber" }), this._open_number = false, this._packNumbers && (this.push({ name: "numberValue", value: this._accumulator }), this._accumulator = "")), e5(null);
    });
  }
  _processBuffer(e5) {
    let t2, n2, r2 = 0;
    e: for (; ; ) switch (this._expect) {
      case "value1":
      case "value":
        if (ay.value1.lastIndex = r2, t2 = ay.value1.exec(this._buffer), !t2) {
          if (this._done || r2 + 16 < this._buffer.length) return r2 < this._buffer.length ? e5(new Error("Parser cannot parse input: expected a value")) : e5(new Error("Parser has expected a value"));
          break e;
        }
        switch (n2 = t2[0], n2) {
          case '"':
            this._streamStrings && this.push({ name: "startString" }), this._expect = "string";
            break;
          case "{":
            this.push({ name: "startObject" }), this._stack.push(this._parent), this._parent = "object", this._expect = "key1";
            break;
          case "[":
            this.push({ name: "startArray" }), this._stack.push(this._parent), this._parent = "array", this._expect = "value1";
            break;
          case "]":
            if ("value1" !== this._expect) return e5(new Error("Parser cannot parse input: unexpected token ']'"));
            this._open_number && (this._streamNumbers && this.push({ name: "endNumber" }), this._open_number = false, this._packNumbers && (this.push({ name: "numberValue", value: this._accumulator }), this._accumulator = "")), this.push({ name: "endArray" }), this._parent = this._stack.pop(), this._expect = iy[this._parent];
            break;
          case "-":
            this._open_number = true, this._streamNumbers && (this.push({ name: "startNumber" }), this.push({ name: "numberChunk", value: "-" })), this._packNumbers && (this._accumulator = "-"), this._expect = "numberStart";
            break;
          case "0":
            this._open_number = true, this._streamNumbers && (this.push({ name: "startNumber" }), this.push({ name: "numberChunk", value: "0" })), this._packNumbers && (this._accumulator = "0"), this._expect = "numberFraction";
            break;
          case "1":
          case "2":
          case "3":
          case "4":
          case "5":
          case "6":
          case "7":
          case "8":
          case "9":
            this._open_number = true, this._streamNumbers && (this.push({ name: "startNumber" }), this.push({ name: "numberChunk", value: n2 })), this._packNumbers && (this._accumulator = n2), this._expect = "numberDigit";
            break;
          case "true":
          case "false":
          case "null":
            if (this._buffer.length - r2 === n2.length && !this._done) break e;
            this.push({ name: n2 + "Value", value: oy[n2] }), this._expect = iy[this._parent];
        }
        sy ? this._buffer = this._buffer.slice(n2.length) : r2 += n2.length;
        break;
      case "keyVal":
      case "string":
        if (ay.string.lastIndex = r2, t2 = ay.string.exec(this._buffer), !t2) {
          if (r2 < this._buffer.length && (this._done || this._buffer.length - r2 >= 6)) return e5(new Error("Parser cannot parse input: escaped characters"));
          if (this._done) return e5(new Error("Parser has expected a string value"));
          break e;
        }
        if (n2 = t2[0], '"' === n2) "keyVal" === this._expect ? (this._streamKeys && this.push({ name: "endKey" }), this._packKeys && (this.push({ name: "keyValue", value: this._accumulator }), this._accumulator = ""), this._expect = "colon") : (this._streamStrings && this.push({ name: "endString" }), this._packStrings && (this.push({ name: "stringValue", value: this._accumulator }), this._accumulator = ""), this._expect = iy[this._parent]);
        else if (n2.length > 1 && "\\" === n2.charAt(0)) {
          const e6 = 2 == n2.length ? ly[n2.charAt(1)] : cy(n2);
          ("keyVal" === this._expect ? this._streamKeys : this._streamStrings) && this.push({ name: "stringChunk", value: e6 }), ("keyVal" === this._expect ? this._packKeys : this._packStrings) && (this._accumulator += e6);
        } else ("keyVal" === this._expect ? this._streamKeys : this._streamStrings) && this.push({ name: "stringChunk", value: n2 }), ("keyVal" === this._expect ? this._packKeys : this._packStrings) && (this._accumulator += n2);
        sy ? this._buffer = this._buffer.slice(n2.length) : r2 += n2.length;
        break;
      case "key1":
      case "key":
        if (ay.key1.lastIndex = r2, t2 = ay.key1.exec(this._buffer), !t2) {
          if (r2 < this._buffer.length || this._done) return e5(new Error("Parser cannot parse input: expected an object key"));
          break e;
        }
        if (n2 = t2[0], '"' === n2) this._streamKeys && this.push({ name: "startKey" }), this._expect = "keyVal";
        else if ("}" === n2) {
          if ("key1" !== this._expect) return e5(new Error("Parser cannot parse input: unexpected token '}'"));
          this.push({ name: "endObject" }), this._parent = this._stack.pop(), this._expect = iy[this._parent];
        }
        sy ? this._buffer = this._buffer.slice(n2.length) : r2 += n2.length;
        break;
      case "colon":
        if (ay.colon.lastIndex = r2, t2 = ay.colon.exec(this._buffer), !t2) {
          if (r2 < this._buffer.length || this._done) return e5(new Error("Parser cannot parse input: expected ':'"));
          break e;
        }
        n2 = t2[0], ":" === n2 && (this._expect = "value"), sy ? this._buffer = this._buffer.slice(n2.length) : r2 += n2.length;
        break;
      case "arrayStop":
      case "objectStop":
        if (ay.comma.lastIndex = r2, t2 = ay.comma.exec(this._buffer), !t2) {
          if (r2 < this._buffer.length || this._done) return e5(new Error("Parser cannot parse input: expected ','"));
          break e;
        }
        if (this._open_number && (this._streamNumbers && this.push({ name: "endNumber" }), this._open_number = false, this._packNumbers && (this.push({ name: "numberValue", value: this._accumulator }), this._accumulator = "")), n2 = t2[0], "," === n2) this._expect = "arrayStop" === this._expect ? "value" : "key";
        else if ("}" === n2 || "]" === n2) {
          if ("}" === n2 ? "arrayStop" === this._expect : "arrayStop" !== this._expect) return e5(new Error("Parser cannot parse input: expected '" + ("arrayStop" === this._expect ? "]" : "}") + "'"));
          this.push({ name: "}" === n2 ? "endObject" : "endArray" }), this._parent = this._stack.pop(), this._expect = iy[this._parent];
        }
        sy ? this._buffer = this._buffer.slice(n2.length) : r2 += n2.length;
        break;
      case "numberStart":
        if (ay.numberStart.lastIndex = r2, t2 = ay.numberStart.exec(this._buffer), !t2) {
          if (r2 < this._buffer.length || this._done) return e5(new Error("Parser cannot parse input: expected a starting digit"));
          break e;
        }
        n2 = t2[0], this._streamNumbers && this.push({ name: "numberChunk", value: n2 }), this._packNumbers && (this._accumulator += n2), this._expect = "0" === n2 ? "numberFraction" : "numberDigit", sy ? this._buffer = this._buffer.slice(n2.length) : r2 += n2.length;
        break;
      case "numberDigit":
        if (ay.numberDigit.lastIndex = r2, t2 = ay.numberDigit.exec(this._buffer), !t2) {
          if (r2 < this._buffer.length || this._done) return e5(new Error("Parser cannot parse input: expected a digit"));
          break e;
        }
        if (n2 = t2[0], !n2) {
          if (r2 < this._buffer.length) {
            this._expect = "numberFraction";
            break;
          }
          if (this._done) {
            this._expect = iy[this._parent];
            break;
          }
          break e;
        }
        this._streamNumbers && this.push({ name: "numberChunk", value: n2 }), this._packNumbers && (this._accumulator += n2), sy ? this._buffer = this._buffer.slice(n2.length) : r2 += n2.length;
        break;
      case "numberFraction":
        if (ay.numberFraction.lastIndex = r2, t2 = ay.numberFraction.exec(this._buffer), !t2) {
          if (r2 < this._buffer.length || this._done) {
            this._expect = iy[this._parent];
            break;
          }
          break e;
        }
        n2 = t2[0], this._streamNumbers && this.push({ name: "numberChunk", value: n2 }), this._packNumbers && (this._accumulator += n2), this._expect = "." === n2 ? "numberFracStart" : "numberExpSign", sy ? this._buffer = this._buffer.slice(n2.length) : r2 += n2.length;
        break;
      case "numberFracStart":
        if (ay.numberFracStart.lastIndex = r2, t2 = ay.numberFracStart.exec(this._buffer), !t2) {
          if (r2 < this._buffer.length || this._done) return e5(new Error("Parser cannot parse input: expected a fractional part of a number"));
          break e;
        }
        n2 = t2[0], this._streamNumbers && this.push({ name: "numberChunk", value: n2 }), this._packNumbers && (this._accumulator += n2), this._expect = "numberFracDigit", sy ? this._buffer = this._buffer.slice(n2.length) : r2 += n2.length;
        break;
      case "numberFracDigit":
        if (ay.numberFracDigit.lastIndex = r2, t2 = ay.numberFracDigit.exec(this._buffer), n2 = t2[0], !n2) {
          if (r2 < this._buffer.length) {
            this._expect = "numberExponent";
            break;
          }
          if (this._done) {
            this._expect = iy[this._parent];
            break;
          }
          break e;
        }
        this._streamNumbers && this.push({ name: "numberChunk", value: n2 }), this._packNumbers && (this._accumulator += n2), sy ? this._buffer = this._buffer.slice(n2.length) : r2 += n2.length;
        break;
      case "numberExponent":
        if (ay.numberExponent.lastIndex = r2, t2 = ay.numberExponent.exec(this._buffer), !t2) {
          if (r2 < this._buffer.length) {
            this._expect = iy[this._parent];
            break;
          }
          if (this._done) {
            this._expect = "done";
            break;
          }
          break e;
        }
        n2 = t2[0], this._streamNumbers && this.push({ name: "numberChunk", value: n2 }), this._packNumbers && (this._accumulator += n2), this._expect = "numberExpSign", sy ? this._buffer = this._buffer.slice(n2.length) : r2 += n2.length;
        break;
      case "numberExpSign":
        if (ay.numberExpSign.lastIndex = r2, t2 = ay.numberExpSign.exec(this._buffer), !t2) {
          if (r2 < this._buffer.length) {
            this._expect = "numberExpStart";
            break;
          }
          if (this._done) return e5(new Error("Parser has expected an exponent value of a number"));
          break e;
        }
        n2 = t2[0], this._streamNumbers && this.push({ name: "numberChunk", value: n2 }), this._packNumbers && (this._accumulator += n2), this._expect = "numberExpStart", sy ? this._buffer = this._buffer.slice(n2.length) : r2 += n2.length;
        break;
      case "numberExpStart":
        if (ay.numberExpStart.lastIndex = r2, t2 = ay.numberExpStart.exec(this._buffer), !t2) {
          if (r2 < this._buffer.length || this._done) return e5(new Error("Parser cannot parse input: expected an exponent part of a number"));
          break e;
        }
        n2 = t2[0], this._streamNumbers && this.push({ name: "numberChunk", value: n2 }), this._packNumbers && (this._accumulator += n2), this._expect = "numberExpDigit", sy ? this._buffer = this._buffer.slice(n2.length) : r2 += n2.length;
        break;
      case "numberExpDigit":
        if (ay.numberExpDigit.lastIndex = r2, t2 = ay.numberExpDigit.exec(this._buffer), n2 = t2[0], !n2) {
          if (r2 < this._buffer.length || this._done) {
            this._expect = iy[this._parent];
            break;
          }
          break e;
        }
        this._streamNumbers && this.push({ name: "numberChunk", value: n2 }), this._packNumbers && (this._accumulator += n2), sy ? this._buffer = this._buffer.slice(n2.length) : r2 += n2.length;
        break;
      case "done":
        if (ay.ws.lastIndex = r2, t2 = ay.ws.exec(this._buffer), !t2) {
          if (r2 < this._buffer.length) {
            if (this._jsonStreaming) {
              this._expect = "value";
              break;
            }
            return e5(new Error("Parser cannot parse input: unexpected characters"));
          }
          break e;
        }
        n2 = t2[0], this._open_number && (this._streamNumbers && this.push({ name: "endNumber" }), this._open_number = false, this._packNumbers && (this.push({ name: "numberValue", value: this._accumulator }), this._accumulator = "")), sy ? this._buffer = this._buffer.slice(n2.length) : r2 += n2.length;
    }
    !sy && (this._buffer = this._buffer.slice(r2)), e5(null);
  }
};
uy.parser = uy.make, uy.make.Constructor = uy;
var dy = uy;
const hy = dy, fy = (e5) => e5.on("data", (t2) => e5.emit(t2.name, t2.value)), py = (e5) => fy(new hy(e5));
py.Parser = hy, py.parser = hy.parser;
var my = py;
const gy = a.getDefaultExportFromCjs(my), yy = z, by = (e5) => function() {
  this.done ? this.done = false : this.stack.push(this.current, this.key), this.current = new e5(), this.key = null;
};
let wy = class e3 extends yy {
  static connectTo(t2, n2) {
    return new e3(n2).connectTo(t2);
  }
  constructor(e5) {
    super(), this.stack = [], this.current = this.key = null, this.done = true, e5 && (this.reviver = "function" == typeof e5.reviver && e5.reviver, this.reviver && (this.stringValue = this._saveValue = this._saveValueWithReviver), e5.numberAsString && (this.numberValue = this.stringValue));
  }
  connectTo(e5) {
    return e5.on("data", (e6) => {
      this[e6.name] && (this[e6.name](e6.value), this.done && this.emit("done", this));
    }), this;
  }
  get depth() {
    return (this.stack.length >> 1) + (this.done ? 0 : 1);
  }
  get path() {
    const e5 = [];
    for (let t2 = 0; t2 < this.stack.length; t2 += 2) {
      const n2 = this.stack[t2 + 1];
      e5.push(null === n2 ? this.stack[t2].length : n2);
    }
    return e5;
  }
  dropToLevel(e5) {
    if (e5 < this.depth) if (e5) {
      const t2 = e5 - 1 << 1;
      this.current = this.stack[t2], this.key = this.stack[t2 + 1], this.stack.splice(t2);
    } else this.stack = [], this.current = this.key = null, this.done = true;
    return this;
  }
  consume(e5) {
    return this[e5.name] && this[e5.name](e5.value), this;
  }
  keyValue(e5) {
    this.key = e5;
  }
  numberValue(e5) {
    this._saveValue(parseFloat(e5));
  }
  nullValue() {
    this._saveValue(null);
  }
  trueValue() {
    this._saveValue(true);
  }
  falseValue() {
    this._saveValue(false);
  }
  endObject() {
    if (this.stack.length) {
      const e5 = this.current;
      this.key = this.stack.pop(), this.current = this.stack.pop(), this._saveValue(e5);
    } else this.done = true;
  }
  _saveValue(e5) {
    this.done ? this.current = e5 : this.current instanceof Array ? this.current.push(e5) : (this.current[this.key] = e5, this.key = null);
  }
  _saveValueWithReviver(e5) {
    this.done ? this.current = this.reviver("", e5) : this.current instanceof Array ? (e5 = this.reviver("" + this.current.length, e5), this.current.push(e5), void 0 === e5 && delete this.current[this.current.length - 1]) : (void 0 !== (e5 = this.reviver(this.key, e5)) && (this.current[this.key] = e5), this.key = null);
  }
};
wy.prototype.stringValue = wy.prototype._saveValue, wy.prototype.startObject = by(Object), wy.prototype.startArray = by(Array), wy.prototype.endArray = wy.prototype.endObject;

export const originalV3JsonParser = uy.parser;
export const OriginalV3Assembler = wy;
