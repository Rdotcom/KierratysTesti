// Owner-run local TTY only. No network, echo, clipboard, secret arguments or logs.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export function serializeHsyCredentials(id, secret) {
  assert(
    typeof id === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id),
    "invalid_client_id",
  );
  assert(
    typeof secret === "string" && /^[A-Za-z0-9._~+/=-]{16,256}$/.test(secret),
    "invalid_client_secret",
  );
  return `HSY_CLIENT_ID=${id}\nHSY_CLIENT_SECRET=${secret}\n`;
}
export function credentialFileName(args) {
  assert(
    Array.isArray(args) && (args.length === 0 || (args.length === 1 && args[0] === "--prod")),
    "use_no_args_or_prod",
  );
  return args.length ? ".env.hsy.prod.local" : ".env.hsy.local";
}
export function saveHsyCredentials(destination, content) {
  // Exclusive create: never read/merge/overwrite an existing provider secret.
  const descriptor = fs.openSync(
    destination,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
    0o600,
  );
  try {
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}
async function readHidden(label) {
  assert(process.stdin.isTTY && process.stdout.isTTY, "private_tty_required");
  const original = process.stdin.isRaw;
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  try {
    return await new Promise((resolve, reject) => {
      const chars = [];
      const finish = (error) => {
        process.stdin.off("data", data);
        if (error) reject(Error("private_input_cancelled"));
        else resolve(chars.join(""));
        chars.fill("");
      };
      const data = (bytes) => {
        for (const code of bytes) {
          if (code === 3 || code === 4 || code === 27) return finish(true);
          if (code === 13 || code === 10) return finish(false);
          if (code === 127 || code === 8) {
            chars.pop();
            continue;
          }
          if (code < 33 || code > 126 || chars.length >= 256) return finish(true);
          chars.push(String.fromCharCode(code));
        }
      };
      process.stdin.on("data", data);
    });
  } finally {
    process.stdin.setRawMode(original);
    process.stdin.pause();
    process.stdout.write("\n");
  }
}
async function main() {
  const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const parent = path.join(root, "backend/api"),
    target = path.join(parent, credentialFileName(process.argv.slice(2)));
  assert.equal(fs.realpathSync(parent), parent, "no_symlink_parent");
  assert(!fs.existsSync(target), "existing_provider_file_not_modified");
  execFileSync("git", ["check-ignore", "-q", "--", target], { cwd: root, stdio: "ignore" });
  console.log(
    process.argv.includes("--prod")
      ? "HSY PROD -sovelluksen yksityinen tallennus. Valitse PROD-sovelluksen tunnukset."
      : "HSY:n turvallinen paikallinen tallennus. Syotto ei nay ruudulla.",
  );
  console.log("Liita yksi arvo kerrallaan ja paina Enter. Ctrl-C peruuttaa.");
  const id = await readHidden("Client ID: ");
  const secret = await readHidden("UUSI client secret: ");
  saveHsyCredentials(target, serializeHsyCredentials(id, secret));
  console.log("Tallennettu palvelimen Gitista poissuljettuun tiedostoon, oikeudet 0600.");
  console.log(
    "Salaisuutta ei lahetetty verkkoon eika kopioitu puhelimeen. Ilmoita keskusteluun vain: tallennettu.",
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error(
      "Tallennus ei valmistunut. Syotto peruutettiin, muoto ei kelpaa tai tiedosto on jo olemassa. Arvoja ei nayteta; ala laheta niita keskusteluun.",
    );
    process.exitCode = 1;
  });
}
