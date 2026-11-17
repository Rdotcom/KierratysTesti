"use strict";

// Original adapter, not a fork or renamed copy of picomatch. Matching is
// delegated to Minimatch 11's nonrecursive engine. No glob-to-RegExp compiler.
const { Minimatch } = require("minimatch");
const { posix } = require("node:path");

/** @typedef {import("./index.d.cts").Options} Options */
/** @typedef {import("./index.d.cts").Matcher} Matcher */
const limits = Object.freeze({ pattern: 4096, input: 32768, patterns: 1024, depth: 64 });

/** @param {unknown} value @param {number} maximum @param {string} kind */
function boundedString(value, maximum, kind) {
  if (typeof value !== "string") throw new TypeError(`${kind} must be a string`);
  if (value.length > maximum) throw new RangeError(`${kind} exceeds the supported length`);
  if (value.includes("\0")) throw new TypeError(`${kind} must not contain NUL`);
  return value;
}

/** @param {string | readonly string[]} value */
function patternList(value) {
  const list = typeof value === "string" ? [value] : value;
  if (!Array.isArray(list)) throw new TypeError("Patterns must be a string or string array");
  if (list.length > limits.patterns) throw new RangeError("Too many glob patterns");
  const bounded = /** @type {string[]} */ (list).map((p) =>
    boundedString(p, limits.pattern, "Pattern"),
  );
  if (bounded.reduce((total, pattern) => total + pattern.length, 0) > 65536) {
    throw new RangeError("Total glob input exceeds the supported budget");
  }
  return bounded;
}

/** Bound brace expansion before entering a third-party expander (including
 * sequences of otherwise shallow groups). Saturating arithmetic stays small.
 * @param {string} pattern
 */
function boundExpansion(pattern) {
  const frames = [{ product: 1, sum: 0, start: 0, nested: false }];
  let escaped = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    // Bound braces even inside a class: expansion runs before glob parsing.
    const frame = frames[frames.length - 1];
    if (ch === "{") {
      frame.nested = true;
      frames.push({ product: 1, sum: 0, start: i + 1, nested: false });
    } else if (ch === "," && frames.length > 1) {
      frame.sum += frame.product;
      frame.product = 1;
    } else if (ch === "}" && frames.length > 1) {
      let width = frame.sum + frame.product;
      const content = pattern.slice(frame.start, i);
      if (!frame.nested && frame.sum === 0 && content.includes("..")) {
        const [from = "", to = "", step = "1"] = content.split("..");
        const numeric = /^-?\d+$/u.test(from) && /^-?\d+$/u.test(to);
        const alpha = /^[A-Za-z]$/u.test(from) && /^[A-Za-z]$/u.test(to);
        if (numeric || alpha) {
          const first = numeric ? Number(from) : from.charCodeAt(0);
          const last = numeric ? Number(to) : to.charCodeAt(0);
          width = Math.floor(Math.abs(last - first) / Math.max(1, Math.abs(Number(step)))) + 1;
        }
      }
      frames.pop();
      frames[frames.length - 1].product *= width;
    }
    if (frames.some((f) => !Number.isFinite(f.product + f.sum) || f.product + f.sum > 1024)) {
      throw new RangeError("Brace expansion exceeds the supported limit");
    }
  }
  return frames[0].product + frames[0].sum;
}

/** Linear lexer. Slashes inside braces/classes/extglobs do not split a part.
 * It conservatively marks incomplete groups as dynamic, so traversal does not
 * incorrectly prune a directory. It does not evaluate or compile a regexp.
 * @param {string} pattern @param {Options} [options]
 */
function scan(pattern, options = {}) {
  boundedString(pattern, limits.pattern, "Pattern");
  let start = 0;
  while (pattern[start] === "!" && pattern[start + 1] !== "(") start++;
  const negated = start > 0;
  if (pattern.slice(start, start + 2) === "./") start += 2;
  const body = pattern.slice(start);
  const parts = [];
  let segmentStart = 0;
  let firstMagic = -1;
  let braces = 0;
  let brackets = 0;
  let parentheses = 0;
  let syntaxUnits = 0;
  let escaped = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if ("*?[]{}()".includes(ch) && ++syntaxUnits > 256) {
      throw new RangeError("Glob syntax exceeds the supported complexity limit");
    }
    if (ch === "[" && brackets === 0) brackets++;
    else if (ch === "]" && brackets > 0) brackets--;
    else if (brackets === 0) {
      if (ch === "{") braces++;
      else if (ch === "}" && braces > 0) braces--;
      else if (ch === "(") parentheses++;
      else if (ch === ")" && parentheses > 0) parentheses--;
    }
    if (braces + parentheses > limits.depth) throw new RangeError("Glob nesting exceeds the limit");
    if (firstMagic < 0 && ("*?[".includes(ch) || ch === "{" || ch === "(")) {
      firstMagic = segmentStart;
    }
    if (ch === "/" && braces === 0 && brackets === 0 && parentheses === 0) {
      parts.push(body.slice(segmentStart, i));
      segmentStart = i + 1;
    }
  }
  parts.push(body.slice(segmentStart));
  if (parts.length > 256) throw new RangeError("Glob has too many path segments");
  const isGlob = firstMagic >= 0;
  const baseEnd = isGlob ? Math.max(0, firstMagic - 1) : body.length;
  const unescapePath = (/** @type {string} */ value) =>
    options.unescape ? value.replace(/\\(.)/gu, "$1") : value;
  return {
    input: pattern,
    prefix: pattern.slice(0, start),
    start,
    base: unescapePath(body.slice(0, baseEnd)),
    glob: isGlob ? body.slice(firstMagic) : "",
    parts,
    isGlob,
    negated,
    negatedExtglob: body.startsWith("!("),
  };
}

/** @param {string | readonly string[]} patterns @param {Options} [options]
 * @param {boolean} [_returnState] @returns {Matcher}
 */
function createMatcher(patterns, options = {}, _returnState = false) {
  if (options.capture || options.contains || options.bash) {
    throw new TypeError("This build adapter does not implement capture/contains/bash matching");
  }
  const list = patternList(patterns);
  let expandedWork = 0;
  const engines = list.map((pattern) => {
    if (!pattern) throw new TypeError("An individual glob pattern must not be empty");
    const state = scan(pattern);
    const negatedExtglob = state.negatedExtglob && !options.noextglob && !options.noext;
    expandedWork += pattern.length * (options.nobrace ? 1 : boundExpansion(pattern));
    if (expandedWork > 262144) throw new RangeError("Total expanded glob work exceeds the limit");
    let prefix = 0;
    if (!options.nonegate) {
      while (pattern[prefix] === "!" && pattern[prefix + 1] !== "(") prefix++;
    }
    const positive = pattern.slice(prefix);
    // Picomatch's leading negative extglob permits a leading dot. A normal
    // wildcard still excludes dotfiles unless dot:true was requested.
    const engineOptions = {
      nocomment: true,
      nonegate: true,
      dot: options.dot || negatedExtglob,
      nocase: options.nocase,
      nobrace: options.nobrace,
      noext: options.noextglob || options.noext,
      noglobstar: options.noglobstar,
      platform: /** @type {const} */ ("linux"),
      braceExpandMax: 1024,
      maxGlobstarRecursion: 128,
    };
    const engine = new Minimatch(positive, engineOptions);
    let parent = positive;
    while (parent.endsWith("/**")) parent = parent.slice(0, -3);
    const parentEngine =
      !options.noglobstar && parent !== positive && parent
        ? new Minimatch(parent, engineOptions)
        : null;
    return { engine, parentEngine, negated: prefix % 2 === 1, negatedExtglob };
  });
  const ignored =
    options.ignore === undefined
      ? null
      : createMatcher(options.ignore, { ...options, ignore: undefined });
  /** @type {Matcher} */
  const matcher = Object.assign(
    (/** @type {string} */ input) => {
      boundedString(input, limits.input, "Input");
      if (!input) return false;
      const normalized =
        options.windows === true || (options.windows === undefined && process.platform === "win32")
          ? input.replaceAll("\\", "/")
          : input;
      const value = options.basename || options.matchBase ? posix.basename(normalized) : normalized;
      if (ignored?.(normalized)) return false;
      return engines.some(({ engine, parentEngine, negated }) => {
        const matched = engine.match(value) || !!parentEngine?.match(value);
        return negated ? !matched : matched;
      });
    },
    {
      state: {
        negated: engines.length === 1 && engines[0].negated,
        negatedExtglob: engines.length === 1 && engines[0].negatedExtglob,
      },
    },
  );
  return matcher;
}

createMatcher.isMatch = (
  /** @type {string} */ input,
  /** @type {string | readonly string[]} */ patterns,
  /** @type {Options} */ options = {},
) => createMatcher(patterns, options)(input);
createMatcher.some = (
  /** @type {string | readonly string[]} */ input,
  /** @type {string | readonly string[]} */ patterns,
  /** @type {Options} */ options = {},
) => {
  const matches = createMatcher(patterns, options);
  return (typeof input === "string" ? [input] : input).some(matches);
};
createMatcher.scan = scan;
module.exports = createMatcher;
