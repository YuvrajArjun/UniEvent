/* ============================================================
   effects.js — subtle ambient background + celebratory confetti.
   Replaces the old always-on fireworks show with something calmer
   and more "professional academic platform", while keeping a canvas
   particle burst (window.fireConfettiBurst) for celebratory moments
   like a confirmed registration or a freshly published event.
   ============================================================ */

(function initEffects() {
  let particles = [];
  let canvasRef = null;

  function mount() {
    if (qs("#bg-layer")) return;

    const layer = el("div", { id: "bg-layer" });
    const mesh = el("div", { id: "bg-mesh" });
    const video = el("video", { id: "bg-video", autoplay: "true", muted: "true", loop: "true", playsinline: "true" });
    const source = el("source", { src: "/static/assets/bg-video.mp4", type: "video/mp4" });
    video.appendChild(source);
    video.addEventListener("error", () => video.remove());
    video.addEventListener("stalled", () => video.remove());

    const canvas = el("canvas", { id: "bg-fireworks" });

    layer.appendChild(mesh);
    layer.appendChild(video);
    layer.appendChild(canvas);
    document.body.insertBefore(layer, document.body.firstChild);

    runScene(canvas);
  }

  function runScene(canvas) {
    canvasRef = canvas;
    const ctx = canvas.getContext("2d");
    let w, h;
    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function tick() {
      ctx.clearRect(0, 0, w, h);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity ?? 0.02;
        p.life -= p.decay;
        if (p.life > 0) {
          ctx.globalAlpha = Math.max(p.life, 0);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;
      particles = particles.filter((p) => p.life > 0);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* Celebratory burst — used when a registration/receipt/publish is
     confirmed. Kept from the old fireworks.js since it's a nice, cheap
     micro-interaction that doesn't clutter the page the rest of the time. */
  window.fireConfettiBurst = function fireConfettiBurst() {
    if (!canvasRef) return;
    const w = canvasRef.width, h = canvasRef.height;
    const palette = ["#D9A45C", "#F2C888", "#B3823E", "#8C1F35", "#B22F49"];
    for (let burst = 0; burst < 3; burst++) {
      const x = w * (0.25 + burst * 0.25) + (Math.random() - 0.5) * 60;
      const y = h * 0.18;
      const color = palette[Math.floor(Math.random() * palette.length)];
      const count = 50;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
        const speed = 2 + Math.random() * 3.4;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.2,
          life: 1,
          decay: 0.006 + Math.random() * 0.01,
          color,
          size: 1.6 + Math.random() * 2,
          gravity: 0.045,
        });
      }
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
