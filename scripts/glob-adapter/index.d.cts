declare function createMatcher(
  patterns: string | readonly string[],
  options?: createMatcher.Options,
  returnState?: boolean,
): createMatcher.Matcher;
declare namespace createMatcher {
  interface Options {
    dot?: boolean;
    nocase?: boolean;
    basename?: boolean;
    matchBase?: boolean;
    windows?: boolean;
    nobrace?: boolean;
    noextglob?: boolean;
    noext?: boolean;
    noglobstar?: boolean;
    nonegate?: boolean;
    posix?: boolean;
    ignore?: string | readonly string[];
    parts?: boolean;
    tokens?: boolean;
    unescape?: boolean;
    capture?: boolean;
    contains?: boolean;
    bash?: boolean;
    returnIndex?: boolean;
  }
  interface Matcher {
    (input: string): boolean;
    state: { negated: boolean; negatedExtglob: boolean };
  }
  interface ScanResult {
    input: string;
    prefix: string;
    start: number;
    base: string;
    glob: string;
    parts: string[];
    isGlob: boolean;
    negated: boolean;
    negatedExtglob: boolean;
  }
  function isMatch(input: string, patterns: string | readonly string[], options?: Options): boolean;
  function some(
    input: string | readonly string[],
    patterns: string | readonly string[],
    options?: Options,
  ): boolean;
  function scan(pattern: string, options?: Options): ScanResult;
}
export = createMatcher;
