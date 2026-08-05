const WebSocket = require('ws');
const http = require('http');

function getJSON(path) {
  return new Promise((res, rej) => {
    http.get({ host: 'localhost', port: 9222, path }, r => {
      let d = '';
      r.on('data', c => (d += c));
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}

(async () => {
  const targets = await getJSON('/json/list');
  const tab = targets.find(t => t.type === 'page' && !t.url.includes('edge://') && !t.url.includes('ntp.msn'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    ws.on('message', function onMsg(m) {
      const msg = JSON.parse(m);
      if (msg.id === mid) { ws.off('message', onMsg); res(msg.result); }
    });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await new Promise(r => ws.on('open', r));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  await send('Page.navigate', { url: 'http://localhost:3000/' });
  await new Promise(r => setTimeout(r, 6000));
  let res = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      newsRows: document.querySelectorAll('.news-row').length,
      firstNews: document.querySelector('.news-title')?.innerText?.slice(0, 60),
      firstBadge: document.querySelector('.news-badge')?.innerText,
      time: document.querySelector('.news-time')?.innerText,
      err: document.body.innerText.includes('Impossible de charger')
    })`,
    returnByValue: true
  });
  console.log('HOME:', res.result.value);

  await send('Page.navigate', { url: 'http://localhost:3000/explorer' });
  await new Promise(r => setTimeout(r, 4500));
  res = await send('Runtime.evaluate', {
    expression: `(async () => {
      const btns = [...document.querySelectorAll('.tab-btn')];
      const labels = btns.map(b => b.innerText);
      btns[Math.min(2, btns.length - 1)]?.click();
      await new Promise(r => setTimeout(r, 1000));
      return JSON.stringify({
        labels,
        groupTitles: [...document.querySelectorAll('.news-group-title')].map(e => e.innerText),
        items: document.querySelectorAll('.news-item').length,
        official: document.querySelectorAll('.badge-official').length,
        srcs: [...document.querySelectorAll('.news-src')].slice(0, 3).map(e => e.innerText),
        firstTitle: document.querySelector('.news-title')?.innerText?.slice(0, 60)
      });
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('EXPLORER NEWS:', res.result.value);
  ws.close();
})();
