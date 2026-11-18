import { writeFileSync } from 'node:fs';

const PORT = 9222;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const list = await r.json();
  const pageTarget = list.find(t => t.type === "page");
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise(resolve => ws.onopen = resolve);

  let id = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const curId = id++;
    const handler = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id === curId) {
        ws.removeEventListener('message', handler);
        resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  const evalExpr = async (expr) => {
    const res = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  };

  await send("Page.navigate", { url: "https://ani.pm" });
  await wait(3500);

  const fullHomeLayout = await evalExpr(`(() => {
    const sections = Array.from(document.querySelectorAll('section, main > *')).map(el => {
      return {
        tag: el.tagName,
        className: el.className,
        id: el.id,
        height: el.offsetHeight,
        headings: Array.from(el.querySelectorAll('h1, h2, h3, .title, [class*="title"], [class*="heading"]')).map(h => ({
          tag: h.tagName,
          text: h.innerText.trim(),
          className: h.className
        })),
        buttonsOrFilters: Array.from(el.querySelectorAll('button, [role="tab"], .filter, .tab, .pill')).map(b => ({
          text: b.innerText.trim(),
          className: b.className
        })),
        itemCount: el.querySelectorAll('article, [class*="card"], [class*="item"], [class*="slide"], .poster-clip').length
      };
    });

    const navbar = {
      tag: document.querySelector('header, .sitebar')?.tagName,
      className: document.querySelector('header, .sitebar')?.className,
      items: Array.from(document.querySelectorAll('.sitebar > *, .sitebar__nav > *, .sitebar a, .sitebar button')).map(el => ({
        tag: el.tagName,
        className: el.className,
        text: el.innerText.trim()
      }))
    };

    return {
      navbar,
      sections
    };
  })()`);

  writeFileSync("E:/7ANIME_NEW/docs/full_home_layout_anipm.json", JSON.stringify(fullHomeLayout, null, 2));
  console.log("Written full home layout to docs/full_home_layout_anipm.json");
  ws.close();
}

main().catch(console.error);

