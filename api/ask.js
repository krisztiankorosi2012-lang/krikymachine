const MAX_CHARS = 320;
const UA = "KrikyServer/1.0 (educational; Vercel)";

function ascii(s) {
  return String(s || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/ +/g, " ")
    .trim()
    .slice(0, MAX_CHARS);
}

function tryMath(q) {
  const s = String(q || "").replace(/\s+/g, "");
  if (s.length < 3) return "";
  if (!/^[\d+\-*/().%]+$/.test(s)) return "";
  if (/^\d+$/.test(s)) return "";
  try {
    // digits and math ops only (validated above)
    // eslint-disable-next-line no-new-func
    const v = Function(`"use strict"; return (${s});`)();
    if (typeof v === "number" && Number.isFinite(v)) {
      return String(Number.isInteger(v) ? v : v);
    }
  } catch (_) {}
  return "";
}

function wikiQuery(q) {
  let u = String(q || "").trim();
  const low = u.toLowerCase();
  const prefixes = [
    "what is the ",
    "what is ",
    "what's ",
    "whats ",
    "who is ",
    "who's ",
    "whos ",
    "define ",
    "meaning of ",
    "tell me about ",
    "how many ",
  ];
  for (const p of prefixes) {
    if (low.startsWith(p)) {
      u = u.slice(p.length).trim();
      break;
    }
  }
  return u || String(q || "").trim();
}

async function wikiExtract(q) {
  const term = wikiQuery(q);
  if (!term) return "";

  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: term,
    gsrlimit: "1",
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    exchars: String(MAX_CHARS),
    redirects: "1",
    format: "json",
  });

  const url = "https://en.wikipedia.org/w/api.php?" + params.toString();
  const resp = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      "Accept-Encoding": "identity",
    },
  });
  if (!resp.ok) return "";
  const data = await resp.json();
  const pages = (data && data.query && data.query.pages) || {};
  const page = Object.values(pages)[0];
  if (page && (page.extract || page.title)) {
    return ascii(page.extract || page.title);
  }

  const params2 = new URLSearchParams({
    action: "opensearch",
    search: term,
    limit: "1",
    namespace: "0",
    format: "json",
  });
  const resp2 = await fetch(
    "https://en.wikipedia.org/w/api.php?" + params2.toString(),
    {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
      },
    }
  );
  if (!resp2.ok) return "";
  const data2 = await resp2.json();
  if (Array.isArray(data2) && data2[2] && data2[2][0]) {
    return ascii(data2[2][0]);
  }
  return "";
}

async function answer(q) {
  const query = String(q || "").trim();
  if (!query) return "type a question";
  const math = tryMath(query);
  if (math) return math;
  try {
    const text = await wikiExtract(query);
    if (text) return text;
  } catch (err) {
    console.error("wiki", err);
    return "server error";
  }
  return "no wiki page. try a shorter name";
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const q =
    (req.query && (req.query.q || req.query.query)) ||
    (req.url && new URL(req.url, "http://x").searchParams.get("q")) ||
    "";

  try {
    const text = ascii(await answer(q)) || "?";
    res.statusCode = 200;
    res.end(text);
  } catch (err) {
    console.error(err);
    res.statusCode = 200;
    res.end("server error");
  }
};
