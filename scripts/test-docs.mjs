import assert from "node:assert/strict";
import { readFile, stat, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { JSDOM } from "jsdom";
const root = resolve(import.meta.dirname, "../.playground-dist");
let pages = 0,
  links = 0;
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (!entry.name.endsWith(".html")) continue;
    pages++;
    const document = new JSDOM(await readFile(path, "utf8")).window.document;
    if (!path.includes("/playground/"))
      assert.equal(document.querySelectorAll("h1").length, 1, path);
    if (!path.includes("/playground/"))
      assert(document.querySelector('nav[aria-label="Documentation"]'));
    assert(!document.body.innerHTML.includes("<!-- include:"), path);
    for (const a of document.querySelectorAll(
      "a[href],link[href],script[src]",
    )) {
      const href = a.getAttribute("href") ?? a.getAttribute("src");
      if (/^(https?:|mailto:)/.test(href) || href === "/") continue;
      const [url, hash] = href.split("#");
      let target = url
        ? url.startsWith("/")
          ? resolve(root, "." + url)
          : resolve(dirname(path), url)
        : path;
      if ((await stat(target)).isDirectory())
        target = resolve(target, "index.html");
      await stat(target);
      links++;
      if (hash && target.endsWith(".html")) {
        const targetDoc =
          target === path
            ? document
            : new JSDOM(await readFile(target, "utf8")).window.document;
        assert(
          targetDoc.getElementById(decodeURIComponent(hash)),
          `${path}: missing ${href}`,
        );
      }
    }
  }
}
await walk(resolve(root, "docs"));
assert(pages >= 17);
console.log(
  `PASS: ${pages} docs pages, ${links} local links/assets/anchors, rendered examples and navigation.`,
);
