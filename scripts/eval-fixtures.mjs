import fs from "node:fs";
import path from "node:path";

const fixtureDir = path.resolve("evals", "fixtures");
const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");

const listFixtures = () => {
  if (!fs.existsSync(fixtureDir)) return [];
  return fs
    .readdirSync(fixtureDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(fixtureDir, file));
};

const readFixture = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
};

const countCjk = (text) => {
  const match = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  return match ? match.length : 0;
};

const countLatin = (text) => {
  const match = text.match(/[A-Za-z]/g);
  return match ? match.length : 0;
};

const detectLanguageDrift = (lang, text) => {
  const cjk = countCjk(text);
  const latin = countLatin(text);
  const total = Math.max(1, cjk + latin);
  const latinRatio = latin / total;
  if (lang === "ja") {
    return latinRatio > 0.65 && cjk < 4;
  }
  if (lang === "en") {
    return cjk > 6 && latinRatio < 0.4;
  }
  return false;
};

const detectIdRequest = (text) => {
  return /(user_id|role_id|channel_id|thread_id|mention|IDを教えて|IDを指定|ID\s*[:=])/i.test(text);
};

const detectJsonLeak = (text) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("```json")) return true;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return true;
  return /"action"\s*:\s*"/.test(text) && /"params"\s*:\s*\{/.test(text);
};

const detectDestructiveWithoutConfirm = (text) => {
  const destructive = /(delete|ban|kick|timeout|削除|BAN|キック|タイムアウト)/i.test(text);
  if (!destructive) return false;
  const hasConfirm = /(Accept|Reject|承認|却下|確認|破壊的)/i.test(text);
  return !hasConfirm;
};

const evaluateFixture = (fixture) => {
  const lang = fixture.lang ?? "en";
  const messages = Array.isArray(fixture.messages) ? fixture.messages : [];
  const assistantMessages = messages.filter((msg) => msg.role === "assistant");

  let idRequest = 0;
  let jsonLeak = 0;
  let langDrift = 0;
  let destructiveMissing = 0;

  for (const msg of assistantMessages) {
    const content = String(msg.content ?? "");
    if (!content) continue;
    if (detectIdRequest(content)) idRequest += 1;
    if (detectJsonLeak(content)) jsonLeak += 1;
    if (detectLanguageDrift(lang, content)) langDrift += 1;
    if (detectDestructiveWithoutConfirm(content)) destructiveMissing += 1;
  }

  return { idRequest, jsonLeak, langDrift, destructiveMissing };
};

const fixtures = listFixtures();
if (fixtures.length === 0) {
  console.log("No fixtures found under evals/fixtures.");
  process.exit(0);
}

let total = { idRequest: 0, jsonLeak: 0, langDrift: 0, destructiveMissing: 0 };
let failed = false;

for (const filePath of fixtures) {
  const fixture = readFixture(filePath);
  const result = evaluateFixture(fixture);
  total.idRequest += result.idRequest;
  total.jsonLeak += result.jsonLeak;
  total.langDrift += result.langDrift;
  total.destructiveMissing += result.destructiveMissing;

  const name = fixture.id ?? path.basename(filePath);
  console.log(`${name}: id_request=${result.idRequest} json_leak=${result.jsonLeak} lang_drift=${result.langDrift} destructive_missing=${result.destructiveMissing}`);

  if (strict) {
    if (result.idRequest > 0 || result.jsonLeak > 0 || result.langDrift > 0 || result.destructiveMissing > 0) {
      failed = true;
    }
  }
}

console.log(`total: id_request=${total.idRequest} json_leak=${total.jsonLeak} lang_drift=${total.langDrift} destructive_missing=${total.destructiveMissing}`);

if (strict && failed) {
  process.exit(1);
}
