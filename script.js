// Character sheet viewer + 3D skin preview
(function () {
  const viewer = document.getElementById("viewer"),
    body = document.getElementById("viewer-body"),
    closeBtn = document.getElementById("viewer-close");
  const stage = document.getElementById("skin-stage"),
    skinLabel = document.getElementById("skin-label");
  const SKINS = {
    aerindaril: { kind: "skin", src: "skins/aerindaril.png" },
    veyn: { kind: "skin", src: "skins/veyn.png" },
    sylvanna: { kind: "model", src: "skins/sylvanna-model.json", base: "skins/" },
    matt: { kind: "model", src: "skins/matt-model.json", base: "skins/" },
    jiuani: { kind: "skin", src: "skins/jiuani.png" },
    lux: { kind: "skin", src: "skins/lux.png" },
    storm: { kind: "skin", src: "skins/storm.png" },
    silas: { kind: "skin", src: "skins/silas.png" },
    vael: { kind: "skin", src: "skins/vael.png" },
    nexus: { kind: "skin", src: "skins/nexus.png" },
    victor: { kind: "skin", src: "skins/victor.png" },
    rayla: { kind: "skin", src: "skins/rayla.png" },
    anari: { kind: "skin", src: "skins/anari.png" },
    natsumi: { kind: "skin", src: "skins/natsumi.png" },
    jack: { kind: "skin", src: "skins/jack.png" },
    elio: { kind: "skin", src: "skins/elio.png" },
  };
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lastFocus = null,
    current = null;

  function stageSize() {
    return { w: Math.max(160, stage.clientWidth), h: Math.max(200, stage.clientHeight) };
  }
  function message(t) {
    const d = document.createElement("div");
    d.className = "skin-msg";
    d.textContent = t;
    stage.replaceChildren(d);
  }

  function mountSkin(cfg) {
    if (!window.skinview3d) {
      message("3D preview could not load.");
      return null;
    }
    const c = document.createElement("canvas");
    stage.replaceChildren(c);
    const { w, h } = stageSize();
    const v = new skinview3d.SkinViewer({ canvas: c, width: w, height: h, skin: cfg.src });
    v.background = null;
    v.zoom = 0.85;
    v.fov = 40;
    v.controls.enableZoom = false;
    v.controls.enablePan = false;
    v.autoRotate = !reduce;
    v.autoRotateSpeed = 0.6;
    v.animation = reduce ? null : new skinview3d.IdleAnimation();
    const ro = new ResizeObserver(() => {
      const s = stageSize();
      v.setSize(s.w, s.h);
    });
    ro.observe(stage);
    return {
      dispose() {
        ro.disconnect();
        v.dispose();
      },
    };
  }

  function mountModel(cfg) {
    if (!window.THREE) {
      message("3D preview could not load.");
      return null;
    }
    const T = THREE,
      c = document.createElement("canvas");
    stage.replaceChildren(c);
    let renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
    } catch (e) {
      message("3D preview needs WebGL.");
      return null;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new T.Scene(),
      cam = new T.PerspectiveCamera(32, 1, 1, 500);
    scene.add(new T.AmbientLight(0xffffff, 0.75));
    const sun = new T.DirectionalLight(0xffffff, 0.45);
    sun.position.set(30, 60, 50);
    scene.add(sun);
    const root = new T.Group(),
      model = new T.Group();
    root.add(model);
    scene.add(root);
    model.rotation.y = Math.PI;
    let alive = true,
      raf = 0,
      rotY = 0.5,
      dragging = false,
      lastX = 0,
      idle = 0;
    const loader = new T.TextureLoader();
    fetch(cfg.src)
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        const box = new T.Box3();
        data.parts.forEach((p) => {
          const g = new T.BufferGeometry();
          g.setAttribute("position", new T.Float32BufferAttribute(p.p, 3));
          g.setAttribute("uv", new T.Float32BufferAttribute(p.uv, 2));
          g.computeVertexNormals();
          const tex = loader.load(cfg.base + p.file);
          tex.magFilter = T.NearestFilter;
          tex.minFilter = T.NearestFilter;
          tex.generateMipmaps = false;
          const mesh = new T.Mesh(
            g,
            new T.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: T.DoubleSide }),
          );
          model.add(mesh);
          g.computeBoundingBox();
          box.union(g.boundingBox);
        });
        const ctr = box.getCenter(new T.Vector3()),
          size = box.getSize(new T.Vector3());
        model.position.set(ctr.x, -ctr.y, ctr.z);
        const dist = (size.y / (2 * Math.tan(T.MathUtils.degToRad(cam.fov / 2)))) * 1.25;
        cam.position.set(0, size.y * 0.08, dist);
        cam.lookAt(0, 0, 0);
        resize();
      })
      .catch(() => message("3D model could not load."));
    function resize() {
      const s = stageSize();
      renderer.setSize(s.w, s.h, false);
      cam.aspect = s.w / s.h;
      cam.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    c.addEventListener("pointerdown", (e) => {
      dragging = true;
      lastX = e.clientX;
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      rotY += (e.clientX - lastX) * 0.01;
      lastX = e.clientX;
      idle = 0;
    });
    c.addEventListener("pointerup", () => {
      dragging = false;
    });
    c.addEventListener("pointercancel", () => {
      dragging = false;
    });
    function frame() {
      if (!alive) return;
      if (!dragging && !reduce) {
        idle++;
        if (idle > 60) rotY += 0.006;
      }
      root.rotation.y = rotY;
      renderer.render(scene, cam);
      raf = requestAnimationFrame(frame);
    }
    frame();
    return {
      dispose() {
        alive = false;
        cancelAnimationFrame(raf);
        ro.disconnect();
        renderer.dispose();
      },
    };
  }

  function mount(id) {
    if (current) {
      current.dispose();
      current = null;
    }
    const cfg = SKINS[id];
    if (!cfg) {
      message("Skin not added yet.");
      skinLabel.textContent = "";
      return;
    }
    skinLabel.textContent = "Drag to turn";
    current = cfg.kind === "skin" ? mountSkin(cfg) : mountModel(cfg);
  }

  const holder = document.getElementById("skin-holder"),
    wrap = document.getElementById("skin-wrap");
  function openSheet(id) {
    const t = document.getElementById("sheet-" + id);
    if (!t) return;
    holder.appendChild(wrap);
    body.replaceChildren(t.content.cloneNode(true));
    const slot = body.querySelector(".skin-slot");
    if (slot) slot.appendChild(wrap);
    document.getElementById("viewer-title").textContent =
      "Adventurer registration · " + (body.querySelector("h2")?.textContent || "");
    viewer.hidden = false;
    document.body.style.overflow = "hidden";
    viewer.querySelector(".viewer-card").scrollTop = 0;
    closeBtn.focus();
    requestAnimationFrame(() => mount(id));
  }
  function closeSheet() {
    viewer.hidden = true;
    document.body.style.overflow = "";
    if (current) {
      current.dispose();
      current = null;
    }
    stage.replaceChildren();
    if (lastFocus) lastFocus.focus();
  }
  document.querySelectorAll("button.seat[data-sheet]").forEach((b) =>
    b.addEventListener("click", () => {
      lastFocus = b;
      openSheet(b.dataset.sheet);
    }),
  );
  closeBtn.addEventListener("click", closeSheet);
  viewer.addEventListener("click", (e) => {
    if (e.target === viewer) closeSheet();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !viewer.hidden) closeSheet();
  });
})();

// Tabs, page turning and hash links
(function () {
  const tabs = [...document.querySelectorAll(".tab")];
  const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")));
  const ids = panels.map((p) => p.id);
  function show(id, focus) {
    tabs.forEach((t, i) => {
      const on = ids[i] === id;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
      if (on && focus) t.focus();
    });
    const k = ids.indexOf(id);
    document.querySelectorAll(".pg[data-to]").forEach((b) => {
      if (b.dataset.to === id) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    const pv = document.getElementById("pg-prev"),
      nx = document.getElementById("pg-next");
    if (pv) pv.disabled = k <= 0;
    if (nx) nx.disabled = k >= ids.length - 1;
    try {
      localStorage.setItem("valeria-tab", id);
    } catch (e) {}
  }
  function turnTo(id) {
    show(id);
    history.replaceState(null, "", "#" + id);
    document.querySelector(".tome").scrollIntoView({ block: "start" });
  }
  document
    .querySelectorAll(".pg[data-to]")
    .forEach((b) => b.addEventListener("click", () => turnTo(b.dataset.to)));
  document.getElementById("pg-prev").addEventListener("click", () => {
    const k = ids.indexOf(
      tabs.find((t) => t.getAttribute("aria-selected") === "true").getAttribute("aria-controls"),
    );
    if (k > 0) turnTo(ids[k - 1]);
  });
  document.getElementById("pg-next").addEventListener("click", () => {
    const k = ids.indexOf(
      tabs.find((t) => t.getAttribute("aria-selected") === "true").getAttribute("aria-controls"),
    );
    if (k < ids.length - 1) turnTo(ids[k + 1]);
  });
  function panelFor(hash) {
    if (!hash) return null;
    const el = document.getElementById(hash);
    if (!el) return null;
    const p = el.closest(".panel");
    return p ? p.id : null;
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => {
      show(ids[i]);
      history.replaceState(null, "", "#" + ids[i]);
      const tm = document.querySelector(".tome");
      if (tm.getBoundingClientRect().top < 0) tm.scrollIntoView({ block: "start" });
    });
    t.addEventListener("keydown", (e) => {
      let j = null;
      if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
      if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
      if (j !== null) {
        e.preventDefault();
        show(ids[j], true);
      }
    });
  });
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href").slice(1);
    const p = panelFor(id);
    if (p) {
      e.preventDefault();
      show(p);
      const el = document.getElementById(id);
      el.scrollIntoView({ block: "start" });
      history.replaceState(null, "", "#" + id);
    }
  });
  const h = location.hash.slice(1);
  let start = panelFor(h);
  if (!start) {
    try {
      const s = localStorage.getItem("valeria-tab");
      if (ids.includes(s)) start = s;
    } catch (e) {}
  }
  show(start || "guild");
  if (h && !ids.includes(h) && panelFor(h)) {
    document.getElementById(h).scrollIntoView();
  }

  const btn = document.getElementById("copy-sheet"),
    pre = document.getElementById("sheet-text");
  btn.addEventListener("click", () => {
    const text = pre.textContent;
    const done = () => {
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Copy sheet"), 1600);
    };
    const fallback = () => {
      const r = document.createRange();
      r.selectNodeContents(pre);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      btn.textContent = "Selected · press Ctrl+C";
      setTimeout(() => (btn.textContent = "Copy sheet"), 2400);
    };
    try {
      navigator.clipboard.writeText(text).then(done, fallback);
    } catch (e) {
      fallback();
    }
  });
})();

// Cover page / enter button
(function () {
  const body = document.documentElement,
    hero = document.querySelector("header.hero"),
    tome = document.getElementById("tome");
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function openBoard(animate) {
    body.classList.remove("gate");
    body.classList.add("board");
    hero.classList.remove("closing");
    if (animate && !reduce) {
      tome.classList.add("rising");
      setTimeout(() => tome.classList.remove("rising"), 800);
    }
    window.scrollTo(0, 0);
    const sel = document.querySelector('.tab[aria-selected="true"]');
    if (sel && animate) sel.focus({ preventScroll: true });
  }
  function showBook() {
    body.classList.remove("board");
    body.classList.add("gate");
    if (!reduce) {
      hero.classList.add("opening");
      setTimeout(() => hero.classList.remove("opening"), 700);
    }
    window.scrollTo(0, 0);
    document.getElementById("enter-btn").focus({ preventScroll: true });
  }
  document.getElementById("enter-btn").addEventListener("click", () => {
    if (reduce) {
      openBoard(false);
      return;
    }
    hero.classList.add("closing");
    setTimeout(() => openBoard(true), 500);
  });
  document.getElementById("return-btn").addEventListener("click", showBook);
  const h = location.hash.slice(1);
  if (h && document.getElementById(h) && document.getElementById(h).closest("#tome"))
    openBoard(false);
  window.addEventListener("hashchange", () => {
    const k = location.hash.slice(1);
    if (k && document.getElementById(k) && body.classList.contains("gate")) openBoard(false);
  });
})();
