(function () {
  var cv = document.getElementById('chain');
  var ctx = cv.getContext('2d');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 0, H = 0, dpr = 1;
  var HEX = '0123456789abcdef';
  function hash(n) { var s = ''; for (var i = 0; i < n; i++) s += HEX[(Math.random() * 16) | 0]; return s; }
  var counter = 812340;
  // three depth layers: far (small, dim, cyan), mid (lime), near (large, brightest)
  var LAYERS = [
    { y: 0.17, scale: 0.62, speed: 9,  alpha: 0.26, color: '34,229,255', blocks: [] },
    { y: 0.50, scale: 0.92, speed: 15, alpha: 0.30, color: '182,255,26', blocks: [] },
    { y: 0.86, scale: 1.30, speed: 24, alpha: 0.50, color: '182,255,26', blocks: [] }
  ];
  function makeBlock(L, x) {
    counter += 1;
    return { x: x, n: counter, h1: hash(14), h2: hash(14), h3: hash(10), nonce: (Math.random() * 99999) | 0, glow: 0 };
  }
  function bw(L) { return 168 * L.scale; }
  function gap(L) { return 70 * L.scale; }
  function fill(L) {
    L.blocks = [];
    var step = bw(L) + gap(L), x = -step;
    while (x < W + step * 2) { L.blocks.push(makeBlock(L, x)); x += step; }
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    LAYERS.forEach(fill);
  }
  var packets = [];
  function spawnPacket() {
    var L = LAYERS[(Math.random() * LAYERS.length) | 0];
    var bs = L.blocks.filter(function (b) { return b.x > -bw(L) * 0.5 && b.x < W * 0.6; });
    if (bs.length < 2) return;
    var from = bs[(Math.random() * (bs.length - 1)) | 0];
    var i = L.blocks.indexOf(from);
    if (i < 0 || !L.blocks[i + 1]) return;
    packets.push({ L: L, from: from, to: L.blocks[i + 1], t: 0 });
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function drawLayer(L) {
    var w = bw(L), h = 100 * L.scale, cy = L.y * H, top = cy - h / 2;
    var fs = Math.max(8, 10.5 * L.scale);
    ctx.font = '500 ' + fs + 'px "JetBrains Mono", ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < L.blocks.length; i++) {
      var b = L.blocks[i], next = L.blocks[i + 1];
      if (b.x > W + 40 || b.x + w < -40) continue;
      // the link to the next block: a line with a small arrow
      if (next) {
        var x1 = b.x + w, x2 = next.x;
        ctx.strokeStyle = 'rgba(' + L.color + ',' + (L.alpha * 0.9) + ')';
        ctx.lineWidth = 1.4 * L.scale;
        ctx.setLineDash([5 * L.scale, 4 * L.scale]);
        ctx.beginPath(); ctx.moveTo(x1, cy); ctx.lineTo(x2, cy); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(' + L.color + ',' + (L.alpha + 0.15) + ')';
        ctx.beginPath(); ctx.moveTo(x2, cy); ctx.lineTo(x2 - 7 * L.scale, cy - 4 * L.scale); ctx.lineTo(x2 - 7 * L.scale, cy + 4 * L.scale); ctx.fill();
      }
      var a = L.alpha + b.glow * 0.45;
      ctx.fillStyle = 'rgba(8,11,14,' + (0.72 + b.glow * 0.1) + ')';
      rr(b.x, top, w, h, 7 * L.scale); ctx.fill();
      ctx.lineWidth = (1.2 + b.glow * 1.4) * L.scale;
      ctx.strokeStyle = 'rgba(' + L.color + ',' + Math.min(1, a + 0.12) + ')';
      if (b.glow > 0.05) { ctx.shadowColor = 'rgba(' + L.color + ',0.9)'; ctx.shadowBlur = 18 * b.glow; }
      rr(b.x, top, w, h, 7 * L.scale); ctx.stroke();
      ctx.shadowBlur = 0;
      var px = b.x + 11 * L.scale, lh = 15 * L.scale;
      ctx.fillStyle = 'rgba(' + L.color + ',' + Math.min(1, a + 0.3) + ')';
      ctx.fillText('BLOCK #' + b.n, px, top + 15 * L.scale);
      ctx.fillStyle = 'rgba(215,221,227,' + (a * 0.85) + ')';
      ctx.fillText('prev ' + b.h1.slice(0, 8) + '…', px, top + 15 * L.scale + lh * 1.25);
      ctx.fillText('hash ' + b.h2.slice(0, 8) + '…', px, top + 15 * L.scale + lh * 2.25);
      ctx.fillStyle = 'rgba(255,43,214,' + (a * 0.9) + ')';
      ctx.fillText('nonce ' + b.nonce, px, top + 15 * L.scale + lh * 3.25);
    }
  }
  var last = 0, spawnAt = 0;
  function frame(ts) {
    var dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    ctx.clearRect(0, 0, W, H);
    LAYERS.forEach(function (L) {
      if (!reduce) {
        for (var i = 0; i < L.blocks.length; i++) { L.blocks[i].x -= L.speed * dt; L.blocks[i].glow = Math.max(0, L.blocks[i].glow - dt * 0.9); }
        var first = L.blocks[0];
        if (first && first.x + bw(L) < -gap(L)) {
          L.blocks.shift();
          var lastB = L.blocks[L.blocks.length - 1];
          L.blocks.push(makeBlock(L, lastB.x + bw(L) + gap(L)));
        }
      }
      drawLayer(L);
    });
    // a new block's hash travelling along a link, lighting the block it reaches
    if (!reduce) {
      spawnAt -= dt;
      if (spawnAt <= 0) { spawnPacket(); spawnAt = 1.6 + Math.random() * 1.8; }
      for (var p = packets.length - 1; p >= 0; p--) {
        var k = packets[p], L = k.L;
        k.t += dt * 0.7;
        var x1 = k.from.x + bw(L), x2 = k.to.x, cy = L.y * H;
        var x = x1 + (x2 - x1) * Math.min(1, k.t);
        ctx.fillStyle = 'rgba(' + L.color + ',1)';
        ctx.shadowColor = 'rgba(' + L.color + ',1)'; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(x, cy, 3.4 * L.scale, 0, 6.2832); ctx.fill();
        ctx.shadowBlur = 0;
        if (k.t >= 1) { k.to.glow = 1; packets.splice(p, 1); }
      }
      requestAnimationFrame(frame);
    }
  }
  resize();
  window.addEventListener('resize', resize);
  if (reduce) { frame(0); } else { requestAnimationFrame(frame); }
})();
