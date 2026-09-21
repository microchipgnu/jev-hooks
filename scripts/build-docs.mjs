import { readFile, writeFile, mkdir, readdir, cp } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { Marked } from "marked";
import { build } from "esbuild";
const root = resolve(import.meta.dirname, "..");
const out = resolve(root, ".playground-dist/docs");
const pages = [
  [
    "Start",
    [
      ["index", "Introduction"],
      ["release", "Installation"],
      ["agents", "Build with an agent"],
      ["quickstart", "React quickstart"],
      ["concepts", "Composition & ambient"],
      ["backend", "Backend programs"],
    ],
  ],
  [
    "Deploy",
    [
      ["integrations", "Choose a runtime"],
      ["vercel", "Next.js / Vercel"],
      ["cloudflare", "Cloudflare Workers"],
      ["deployment", "Production behavior"],
    ],
  ],
  [
    "Reference",
    [
      ["api", "API overview"],
      ["react", "React API"],
      ["architecture", "Runtime architecture"],
      ["composition", "Composition design"],
      ["providers-and-workers", "Provider compatibility"],
    ],
  ],
  [
    "Examples",
    [
      ["world-monitor", "Worldline monitor"],
      ["semantic-village", "Semantic Village"],
      ["public-demo", "Public endpoint"],
      ["extraction", "Runtime extraction"],
    ],
  ],
];
const escape = (s) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const url = (slug) => `/docs/${slug === "index" ? "" : `${slug}/`}`;
const search = [];
await mkdir(out, { recursive: true });
await cp(resolve(root, "docs/site"), resolve(out, "assets"), {
  recursive: true,
});
await cp(resolve(root, "docs/snippets"), resolve(out, "snippets"), {
  recursive: true,
});
// Only this explicitly public, synthetic fixture is linked from legacy docs.
await cp(
  resolve(root, "output/village-live-trace.json"),
  resolve(out, "village-live-trace.json"),
);
for (const file of (await readdir(resolve(root, "docs"))).filter((f) =>
  f.endsWith(".md"),
)) {
  const slug = file.slice(0, -3);
  let source = await readFile(resolve(root, "docs", file), "utf8");
  for (const match of [
    ...source.matchAll(/<!-- include: (snippets\/[\w.-]+) -->/g),
  ]) {
    const code = await readFile(resolve(root, "docs", match[1]), "utf8");
    source = source.replace(
      match[0],
      `\`\`\`${match[1].endsWith("jsonc") ? "json" : match[1].endsWith("tsx") ? "tsx" : "ts"}\n${code.trim()}\n\`\`\`\n\n[Download this example](/docs/${match[1]})`,
    );
  }
  const title = source.match(/^# (.+)$/m)?.[1] ?? slug;
  const toc = [],
    used = new Map();
  const marked = new Marked({
    renderer: {
      heading({ tokens, depth, text }) {
        const base = text
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-");
        const count = used.get(base) ?? 0;
        used.set(base, count + 1);
        const id = `${base}${count ? `-${count}` : ""}`;
        if (depth === 2) toc.push([id, text]);
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}${depth === 2 ? `<a class="anchor" href="#${id}" aria-label="Link to ${escape(text)}">#</a>` : ""}</h${depth}>`;
      },
      link({ href, title, tokens }) {
        if (/^[\w-]+\.md(?:#.*)?$/.test(href)) {
          const [name, hash] = href.split("#");
          href = url(name.slice(0, -3)) + (hash ? `#${hash}` : "");
        }
        if (href === "../output/village-live-trace.json")
          href = "/docs/village-live-trace.json";
        return `<a href="${escape(href)}"${title ? ` title="${escape(title)}"` : ""}>${this.parser.parseInline(tokens)}</a>`;
      },
      code({ text, lang }) {
        return `<div class="code-block"><div class="code-toolbar"><span>${escape(lang || "text")}</span><button class="copy-code" type="button">Copy</button></div><pre><code>${escape(text)}</code></pre></div>`;
      },
    },
  });
  const body = marked.parse(source);
  search.push({
    title,
    url: url(slug),
    text: source.replace(/<!--.*?-->/g, "").replace(/[`#*]/g, ""),
  });
  const flat = pages.flatMap(([, items]) => items);
  const index = flat.findIndex(([id]) => id === slug);
  const pager = [flat[index - 1], flat[index + 1]]
    .map((item, i) =>
      item
        ? `<a href="${url(item[0])}"><small>${i ? "Next" : "Previous"}</small>${escape(item[1])} ${i ? "→" : ""}</a>`
        : "<span></span>",
    )
    .join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Jev Hooks: typed semantic state for React and backend programs. Composition, batching, ambient scope and deployment guides."><title>${escape(title)} — Jev Hooks</title><link rel="stylesheet" href="/docs/assets/style.css"><script src="/docs/assets/site.js" defer></script></head><body>
  <a class="skip" href="#content">Skip to content</a>
  <header><a class="brand" href="/docs/"><span class="brand-mark">j/</span> Jev Hooks <span class="badge">DOCS</span></a><div class="top-links"><a href="/">Interactive demo ↗</a><a href="https://www.npmjs.com/package/jev-hooks">npm ↗</a><button id="menu" aria-expanded="false" aria-controls="sidebar">Menu</button></div></header>
  <div class="layout"><aside id="sidebar"><label class="search-label" for="search">Search documentation</label><input id="search" type="search" placeholder="Search docs…" autocomplete="off"><div id="results" aria-live="polite" hidden></div><nav aria-label="Documentation">${pages.map(([group, items]) => `<div class="nav-group"><p>${group}</p>${items.map(([id, label]) => `<a href="${url(id)}" ${slug === id ? 'aria-current="page"' : ""}>${label}</a>`).join("")}</div>`).join("")}</nav><div class="sidebar-note">Facts → meaning → consequences.<br><span>0.2 API · Independent library</span></div></aside>
  <main id="content"><div class="eyebrow">JEV HOOKS / ${escape(pages.find(([, items]) => items.some(([id]) => id === slug))?.[0] ?? "GUIDE")}</div><article>${body}</article><nav class="pager" aria-label="Adjacent pages">${pager}</nav><footer>Typed interpretations. Ordinary software.<br><a href="/docs/integrations/">Server-side inference</a> · <a href="/docs/concepts/">Explicit composition</a></footer></main>
  <aside class="toc"><p>On this page</p>${toc.map(([id, text]) => `<a href="#${id}">${escape(text)}</a>`).join("")}</aside></div></body></html>`;
  const target = resolve(
    out,
    slug === "index" ? "index.html" : `${slug}/index.html`,
  );
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, html);
}
await writeFile(resolve(out, "search.json"), JSON.stringify(search));
console.log(`Built ${search.length} documentation pages at ${out}`);

await mkdir(resolve(out, "playground"), { recursive: true });
await build({
  stdin: {
    contents:
      'import { createRoot } from "react-dom/client"; import App from "./docs/snippets/react.tsx"; createRoot(document.getElementById("root")).render(<App />);',
    resolveDir: root,
    loader: "tsx",
  },
  alias: { "jev-hooks/react": resolve(root, "src/react/index.ts") },
  bundle: true,
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  outfile: resolve(out, "playground/app.js"),
});
await writeFile(
  resolve(out, "playground/index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Jev Hooks quickstart playground</title><style>body{font:14px system-ui,sans-serif;padding:16px;color:#28402f;background:#f2f5f1}h1{font-size:20px;letter-spacing:-.6px}button{background:#294f39;border:0;border-radius:5px;padding:11px 16px;color:white;cursor:pointer}p{line-height:1.6}</style></head><body><div id="root"></div><script type="module" src="/docs/playground/app.js"></script></body></html>`,
);
