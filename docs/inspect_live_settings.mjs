import { writeFileSync } from 'node:fs';

const PORT = 9222;
function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

async function main() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const list = await r.json();
  const pageTarget = list.find(t => t.type === "page");
  if (!pageTarget) throw new Error("No Chrome page target");

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  const send = (method, params = {}) => new Promise((resolve) => {
    const id = Math.floor(Math.random() * 100000);
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

  const evalExpr = async (expr) => {
    const res = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    return res.result?.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: "https://ani.pm/" });
  await wait(4000);

  // Find all buttons on the page
  const buttons = await evalExpr(`(() => {
    return Array.from(document.querySelectorAll('button, [role="button"]')).map((b, i) => ({
      index: i,
      text: b.innerText.trim(),
      ariaLabel: b.getAttribute('aria-label'),
      title: b.getAttribute('title'),
      className: String(b.className).slice(0, 80)
    }));
  })()`);
  console.log("Buttons on https://ani.pm/:", JSON.stringify(buttons, null, 2));

  // Find settings or appearance button/icon
  const settingsBtnIndex = await evalExpr(`(() => {
    const all = Array.from(document.querySelectorAll('button, [role="button"], a'));
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const str = (el.innerText + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '')).toLowerCase();
      if (str.includes('setting') || str.includes('appearance') || str.includes('theme') || str.includes('palette') || str.includes('more')) {
        return i;
      }
    }
    return -1;
  })()`);
  console.log("Settings/more element index:", settingsBtnIndex);

  if (settingsBtnIndex >= 0) {
    await evalExpr(`document.querySelectorAll('button, [role="button"], a')[${settingsBtnIndex}].click()`);
    await wait(1500);

    const modalRes = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync("E:/7ANIME_NEW/docs/research-assets/ani-pm/live/live_menu_open.png", Buffer.from(modalRes.data, 'base64'));
    console.log("Saved live_menu_open.png");

    const modalItems = await evalExpr(`(() => {
      return Array.from(document.querySelectorAll('[role="dialog"], [role="menu"], [data-state="open"], .modal, div[class*="menu"], div[class*="dialog"], div[class*="popover"]')).map(el => ({
        tag: el.tagName,
        text: el.innerText.slice(0, 300)
      }));
    })()`);
    console.log("Modal / Popover Items:", JSON.stringify(modalItems, null, 2));
  }

  ws.close();
}

main().catch(console.error);
