// Kriky games endpoint.
//
//   GET /games         -> "id|TITLE" per line
//   GET /game?id=<id>  -> the whole game in the format games.py parses
//
// The game data lives in games.data.json. Add a game there, deploy, and it is
// on the machine. Nothing has to be uploaded to the handheld.

const DATA = require("./games.data.json");

const WIDTH = 16;   // characters that fit across the 128px screen

function ascii(s) {
  return String(s == null ? "" : s)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

// Word wrap so the device never has to, and clamp to what the screen can show.
function wrap(text, width) {
  const words = ascii(text).split(" ").filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (cur && cur.length + 1 + w.length <= width) {
      cur += " " + w;
    } else {
      if (cur) lines.push(cur);
      if (w.length <= width) {
        cur = w;
      } else {
        let rest = w;
        while (rest.length > width) {
          lines.push(rest.slice(0, width));
          rest = rest.slice(width);
        }
        cur = rest;
      }
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function findGame(id) {
  const list = Array.isArray(DATA.games) ? DATA.games : [];
  return list.find((g) => g && g.id === id) || null;
}

function listGames() {
  const list = Array.isArray(DATA.games) ? DATA.games : [];
  return list
    .filter((g) => g && g.id)
    .map((g) => g.id + "|" + (ascii(g.title) || g.id).slice(0, 16))
    .join("\n");
}

function renderGame(game) {
  const out = ["#G " + (ascii(game.title) || game.id).slice(0, 16)];
  const scenes = Array.isArray(game.scenes) ? game.scenes : [];
  for (const s of scenes) {
    if (!s || s.id == null) continue;
    out.push("#S " + String(s.id).slice(0, 8) + " " + (ascii(s.title) || "").slice(0, 16));
    for (const t of s.text || []) {
      for (const line of wrap(t, WIDTH)) out.push(line);
    }
    const opts = Array.isArray(s.options) ? s.options : [];
    if (opts.length) {
      out.push("#O");
      for (const o of opts) {
        if (!o || o.to == null) continue;
        out.push(">" + String(o.to).slice(0, 8) + " " + (ascii(o.text) || "go").slice(0, 14));
      }
    }
  }
  return out.join("\n");
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

  const url = new URL(req.url || "/", "http://x");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const id = url.searchParams.get("id") || "";

  let text = "";
  if (path === "/games") {
    text = listGames();
  } else if (path === "/game" || path === "/api/games") {
    if (path === "/game") {
      const game = findGame(id);
      text = game ? renderGame(game) : "";
    } else {
      text = listGames();
    }
  } else {
    text = "games\n/games\n/game?id=<id>";
  }

  res.statusCode = 200;
  res.end(text || "no game");
};
