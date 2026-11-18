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
    ws.send(JSON.stringify({ id, method, params }));
  });

  const evalExpr = async (expr) => {
    const res = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  };

  await send("Page.navigate", { url: "https://ani.pm" });
  await wait(3000);

  // Scroll down progressively to load lazy sections
  for (let i = 0; i < 5; i++) {
    await evalExpr(`window.scrollBy(0, 1000)`);
    await wait(600);
  }

  const sectionsAfterScroll = await evalExpr(`(() => {
    return Array.from(document.querySelectorAll('section, [class*="row"], .feed, .carousel')).map(s => ({
      tagName: s.tagName,
      className: s.className,
      textPreview: s.innerText.slice(0, 120).replace(/\\n/g, ' '),
      height: s.offsetHeight
    }));
  })()`);

  writeFileSync("E:/7ANIME_NEW/docs/scrolled_sections_anipm.json", JSON.stringify(sectionsAfterScroll, null, 2));
  console.log("Saved scrolled sections");
  ws.close();
}

main().catch(console.error);

