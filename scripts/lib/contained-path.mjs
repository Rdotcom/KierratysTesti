import path from "node:path";
/** Native path semantics; injected win32/posix also allow platform-independent regression tests. */
export function isContainedPath(parent, target, flavor = path) {
  const relative = flavor.relative(parent, target);
  return (
    relative !== "" &&
    !flavor.isAbsolute(relative) &&
    relative !== ".." &&
    !relative.startsWith(`..${flavor.sep}`)
  );
}
