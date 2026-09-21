const menu = document.querySelector("#menu");
menu.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  menu.setAttribute("aria-expanded", String(open));
  document.querySelector("#sidebar").classList.toggle("open", open);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    menu.setAttribute("aria-expanded", "false");
    document.querySelector("#sidebar").classList.remove("open");
  }
});
for (const button of document.querySelectorAll(".copy-code")) {
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(
        button.closest(".code-block").querySelector("code").textContent,
      );
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select code to copy";
    }
    setTimeout(() => (button.textContent = "Copy"), 1800);
  });
}
const search = document.querySelector("#search");
const results = document.querySelector("#results");
let index;
let generation = 0;
search.addEventListener("input", async () => {
  const current = ++generation;
  const query = search.value.trim().toLowerCase();
  results.hidden = !query;
  if (!query) {
    results.replaceChildren();
    return;
  }
  try {
    index ??= fetch("/docs/search.json").then((r) => {
      if (!r.ok) throw new Error();
      return r.json();
    });
    const pages = await index;
    if (current !== generation) return;
    const matches = pages
      .filter((p) => (p.title + " " + p.text).toLowerCase().includes(query))
      .sort(
        (a, b) =>
          Number(b.title.toLowerCase().includes(query)) -
          Number(a.title.toLowerCase().includes(query)),
      )
      .slice(0, 7);
    results.replaceChildren(
      ...matches.map((p) => {
        const a = document.createElement("a");
        a.href = p.url;
        a.textContent = p.title;
        return a;
      }),
    );
    if (!matches.length) results.textContent = "No matching pages.";
  } catch {
    index = undefined;
    if (current === generation)
      results.textContent = "Search unavailable. Use the navigation below.";
  }
});
