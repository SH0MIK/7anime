import { writeFileSync } from 'node:fs';

const PORT = 9222;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.callbacks = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  }

  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }
}

async function main() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const list = await r.json();
  const pageTarget = list.find(t => t.type === "page");
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise(resolve => ws.onopen = resolve);
  const cdp = new CDP(ws);

  await cdp.send("Page.navigate", { url: "https://ani.pm" });
  await wait(4000);

  const heroDetails = await cdp.eval(`(() => {
    // Find the spotlight / carousel container
    const spot = document.querySelector('.spotlight, .spot, [class*="spotlight"], [class*="spot-"]')?.closest('section, div, .hero') || document.querySelector('[class*="spot"]');
    
    // Find all sections on the homepage
    const sections = Array.from(document.querySelectorAll('section, main > div, .home-section')).map(s => ({
      tagName: s.tagName,
      className: s.className,
      id: s.id,
      title: s.querySelector('h2, h3, .section-title, .title')?.innerText || '',
      childrenCount: s.children.length
    }));

    // Find the exact markup of the spotlight hero
    const heroOuter = document.querySelector('.spotlight-wrap, .spotlight, [class*="spotlight"]')?.outerHTML || '';

    // Inspect the logo image in the hero
    const logoEl = document.querySelector('.spot-logo, [class*="spot-logo"], [class*="hero-logo"]');
    const logoStyles = logoEl ? {
      src: logoEl.src,
      alt: logoEl.alt,
      className: logoEl.className,
      style: logoEl.getAttribute('style'),
      width: logoEl.offsetWidth,
      height: logoEl.offsetHeight,
      parentClassName: logoEl.parentElement?.className,
      computed: {
        maxHeight: window.getComputedStyle(logoEl).maxHeight,
        maxWidth: window.getComputedStyle(logoEl).maxWidth,
        objectFit: window.getComputedStyle(logoEl).objectFit
      }
    } : null;

    // Inspect buttons in the hero
    const heroButtons = Array.from(document.querySelectorAll('.spotlight button, .spotlight a, [class*="spot"] button, [class*="spot"] a')).map(b => ({
      text: b.innerText.trim(),
      className: b.className,
      computed: {
        borderRadius: window.getComputedStyle(b).borderRadius,
        padding: window.getComputedStyle(b).padding,
        backgroundColor: window.getComputedStyle(b).backgroundColor,
        color: window.getComputedStyle(b).color,
        backdropFilter: window.getComputedStyle(b).backdropFilter
      }
    }));

    return {
      heroOuterSnippet: heroOuter.slice(0, 4000),
      logoStyles,
      heroButtons,
      sections
    };
  })()`);

  writeFileSync("E:/7ANIME_NEW/docs/hero_structure_inspection.json", JSON.stringify(heroDetails, null, 2));
  console.log("Saved hero details to docs/hero_structure_inspection.json");
  ws.close();
}

main().catch(console.error);

