(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    PI = "#147f96",
    K = "#d66a2d",
    INK = "#163443",
    MUTED = "#546c77",
    GRID = "#d8e2e6";
  let model = null,
    selectedDevice = "TOP",
    activeTab = "detector",
    animationStart = null,
    animationFrame = null;
  const names = { pi: "π", K: "K", p: "p", mu: "μ" },
    color = (s) =>
      s === "pi" ? PI : s === "K" ? K : s === "p" ? "#7662a5" : "#678c59";
  const fmt = (x, n = 2) => (x == null ? "방출 없음" : Number(x).toFixed(n)),
    rad = (x) => (x * 180) / Math.PI;
  const txt = (x, y, text, extra = "") =>
    `<text x="${x}" y="${y}" ${extra}>${text}</text>`;
  const line = (x1, y1, x2, y2, stroke = GRID, extra = "") =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" ${extra}/>`;
  const path = (points, stroke, width = 2, dash = "") =>
    `<polyline points="${points.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${stroke}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
  const svg = (id, content, height = 360) => {
    $(id).innerHTML =
      `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${$(id).dataset.label || id}" viewBox="0 0 900 ${height}">${content}</svg>`;
  };
  const dot = (x, y, s, r = 4) =>
    s === "K"
      ? `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="${K}"/>`
      : `<circle cx="${x}" cy="${y}" r="${r}" fill="${color(s)}"/>`;
  const legend = (x, y) =>
    `${dot(x, y - 4, "pi")}${txt(x + 12, y, "π")}${dot(x + 55, y - 4, "K")}${txt(x + 67, y, "K")}`;
  const params = () =>
    new URLSearchParams({
      p: $("momentum").value,
      z: $("z").value,
      phi: $("phi").value,
      gap: $("gap").value,
      n2: $("n2").value,
      dual: $("dual").checked ? "1" : "0",
      energy: $("energy").value,
      asymmetry: $("asymmetry").value,
      cdc: $("cdc").value,
      optical: $("optical").value,
    });
  function update() {
    $("n2").disabled = !$("dual").checked;
    $("p-value").textContent = fmt($("momentum").value) + " GeV/c";
    $("z-value").textContent = fmt($("z").value) + " m";
    $("phi-value").textContent = $("phi").value + "°";
    $("n2-value").textContent = $("dual").checked
      ? fmt($("n2").value, 3)
      : "1.045";
    $("gap-value").textContent = fmt(100 * $("gap").value, 1) + " cm";
    $("energy-value").textContent = fmt($("energy").value) + " GeV";
    $("asymmetry-value").textContent = fmt($("asymmetry").value);
    $("cdc-value").textContent = fmt($("cdc").value, 1);
    $("optical-value").textContent = fmt($("optical").value, 1);
    try {
      model = window.Belle2Physics.state(params());
      $("status").textContent = "";
      render();
    } catch (e) {
      $("status").textContent =
        "계산을 표시하지 못했습니다. 페이지를 새로고침해 주세요.";
    }
  }
  const devices = {
    PXD: [
      "정밀 위치·vertex",
      "Pixel 위치 측정으로 track과 vertex를 보강한다. 이번 논문의 PID likelihood에서는 PXD 정보를 사용하지 않는다. 당시 두 번째 PXD 층은 1/6만 설치되어 있었다.",
    ],
    SVD: [
      "track·vertex·dE/dx",
      "4층 silicon strip의 위치 정보로 track·vertex를 측정하고, 에너지 손실도 PID에 보탠다.",
    ],
    CDC: [
      "p와 dE/dx",
      "1.5 T 자기장 속 곡률에서 운동량을, 기체의 전리 전하에서 dE/dx를 얻는다.",
    ],
    TOP: [
      "barrel π/K PID",
      "Quartz 안 Cherenkov 광자의 내부반사 후 위치–시간 패턴을 질량 가설과 비교한다.",
    ],
    ARICH: [
      "forward π/K PID",
      "이중 aerogel을 지난 Cherenkov photon의 위치에서 ring 각도를 복원한다.",
    ],
    ECL: [
      "γ·e·π⁰",
      "CsI(Tl)의 shower cluster로 γ 에너지·방향을 측정한다. 두 γ로 π⁰를, E/p 등으로 e/h를 구분한다.",
    ],
    Solenoid: [
      "1.5 T 자기장",
      "Charged track의 곡률 측정을 가능하게 한다. 자체 PID 센서는 아니다.",
    ],
    KLM: [
      "μ·K_L",
      "Iron 사이의 센서와 투과성·cluster를 사용한다. 이 논문의 Kₛ 재구성 장치는 아니다. Other-B flavor tagging에는 μ 등도 도움이 된다.",
    ],
  };
  const channels = {
    kpi: [
      "K⁺π⁻",
      "K와 π의 charged tracks → tracking + K/π PID. K의 전하로 signal flavor를 구분한다.",
    ],
    kpi0: [
      "K⁺ + (γγ)",
      "K의 charged track + ECL의 γγ → π⁰. Charged B의 전하로 flavor를 구분한다.",
    ],
    kspi: [
      "(π⁺π⁻) + π⁺",
      "Kₛ displaced vertex의 두 daughter와 prompt π track을 재구성한다.",
    ],
    kspi0: [
      "(π⁺π⁻) + (γγ)",
      "Kₛ topology + ECL π⁰. 최종상태만으로 B flavor를 알 수 없어 other-B flavor tag가 필요하다.",
    ],
    pipi: [
      "π⁺π⁻",
      "두 charged track을 재구성한다. Kπ feed-across를 동시 fit하며 이 논문은 분기비만 측정한다.",
    ],
    pipi0: [
      "π⁺ + (γγ)",
      "π track과 ECL π⁰를 결합한다. Kπ⁰와 PID-enriched 표본을 동시 fit한다.",
    ],
  };
  for (const d of Object.keys(devices)) {
    const button = document.createElement("button");
    button.textContent = d;
    button.setAttribute("aria-pressed", d === selectedDevice);
    button.addEventListener("click", () => {
      selectedDevice = d;
      renderDetector();
    });
    $("device-buttons").appendChild(button);
  }
  function renderDetector() {
    const selected = devices[selectedDevice],
      channel = channels[$("channel").value];
    let s = "";
    const cx = 225,
      cy = 180,
      rings = [
        ["KLM", 153],
        ["Solenoid", 137],
        ["ECL", 125],
        ["TOP", 102],
        ["CDC", 91],
        ["SVD", 42],
        ["PXD", 26],
      ];
    for (const [d, r] of rings) {
      s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${d === selectedDevice ? "#bcdde2" : "#edf2f4"}" stroke="${d === selectedDevice ? PI : "#acbec7"}" stroke-width="${d === selectedDevice ? 3 : 1}"/>`;
    }
    s +=
      `<circle cx="${cx}" cy="${cy}" r="10" fill="white"/>` +
      txt(cx - 6, cy + 5, "IP", 'class="minor"');
    rings.forEach(([d, r], i) => {
      const angle = 0.92 - i * 0.22,
        x = cx + r * Math.cos(angle),
        y = cy - r * Math.sin(angle),
        yy = 40 + i * 31;
      s +=
        line(x, y, 465, yy - 5, d === selectedDevice ? PI : GRID) +
        txt(480, yy, d, d === selectedDevice ? 'style="font-weight:600"' : "");
    });
    s +=
      `<rect x="660" y="60" width="175" height="70" rx="7" fill="${selectedDevice === "ARICH" ? "#bcdde2" : "#edf2f4"}"/>` +
      txt(675, 88, "Forward endcap") +
      txt(675, 113, "ARICH");
    s +=
      txt(660, 168, "+z: 전자 빔 방향", 'class="minor"') +
      txt(660, 213, "선택한 붕괴") +
      txt(660, 243, channel[0]) +
      txt(
        76,
        358,
        "Barrel 기능 개념도 · 치수와 acceptance는 배율 생략",
        'class="minor"',
      );
    svg("detector-svg", s, 380);
    $("device-detail").innerHTML =
      `<strong>${selectedDevice} · ${selected[0]}</strong><br>${selected[1]}`;
    $("channel-detail").textContent = channel[1];
    for (const button of $("device-buttons").children)
      button.setAttribute(
        "aria-pressed",
        button.textContent === selectedDevice,
      );
  }
  function renderDedx() {
    const curves = model.curves,
      ys = Object.values(curves)
        .flat()
        .map((a) => a[1]),
      ymin = Math.min(...ys) * 0.93,
      ymax = Math.max(...ys) * 1.05;
    const x = (p) => 80 + (Math.log(p / 0.12) / Math.log(5 / 0.12)) * 740,
      y = (v) => 330 - (Math.log(v / ymin) / Math.log(ymax / ymin)) * 270;
    let s = "";
    for (const p of [0.2, 0.5, 1, 2, 5]) {
      s +=
        line(x(p), 60, x(p), 330) + txt(x(p), 352, p, 'text-anchor="middle"');
    }
    for (const v of [1, 2, 5, 10, 20, 50])
      if (v > ymin && v < ymax)
        s +=
          line(80, y(v), 820, y(v)) + txt(68, y(v) + 5, v, 'text-anchor="end"');
    for (const [species, points] of Object.entries(curves)) {
      s += path(
        points.map(([a, b]) => [x(a), y(b)]),
        color(species),
        2.2,
        species === "mu" ? "5 3" : "",
      );
      s += dot(x(model.momentum), y(model.ionization[species]), species, 4.5);
    }
    s += line(
      x(model.momentum),
      55,
      x(model.momentum),
      330,
      INK,
      'stroke-dasharray="3 4"',
    );
    s +=
      txt(80, 29, "Bethe–Bloch 유사 곡선 · 실제 CDC calibration 아님") +
      txt(455, 385, "운동량 p [GeV/c] · log scale", 'text-anchor="middle"') +
      txt(
        20,
        175,
        "상대 dE/dx",
        'transform="rotate(-90 20 175)" text-anchor="middle"',
      );
    let n = 0;
    for (const species of ["pi", "K", "p", "mu"]) {
      s +=
        line(
          560 + n * 65,
          25,
          577 + n * 65,
          25,
          color(species),
          'stroke-width="3"',
        ) + txt(581 + n * 65, 30, names[species]);
      n++;
    }
    svg("dedx-svg", s, 400);
    $("dedx-values").innerHTML = Object.entries(model.ionization)
      .map(
        ([s, v]) =>
          `<span class="key"><i class="swatch ${s === "K" ? "k" : ""}" style="background:${color(s)}"></i>${names[s]}: ${fmt(v, 3)} a.u.</span>`,
      )
      .join("");
  }
  function renderTOP(progress = null) {
    let s = legend(705, 24);
    const zmax = 2.5,
      xx = (z) => 90 + (z / zmax) * 710,
      yy = (x) => 230 - (x / 0.45) * 160;
    s +=
      `<rect x="90" y="70" width="710" height="160" fill="#f0f7f8" stroke="${GRID}"/>` +
      line(90, 70, 90, 230, INK, 'stroke-width="5"') +
      txt(76, 55, "MCP-PMT") +
      txt(687, 55, "bar long axis z") +
      txt(90, 260, "readout z=0") +
      txt(695, 260, "z=2.5 m") +
      txt(
        450,
        300,
        "폭 x=0.45 m · 두께 y=0.02 m의 반사는 이 투영에서 생략",
        'text-anchor="middle" class="minor"',
      );
    for (const [species, ray] of Object.entries(model.top)) {
      if (!ray.accepted) continue;
      const points = ray.points.map(([z, x]) => [xx(z), yy(x)]);
      s += path(points, color(species), 2.3, species === "K" ? "7 4" : "");
      const useTOF = $("include-tof").checked,
        accepted = Object.values(model.top).filter((r) => r.accepted),
        end = accepted.length
          ? Math.max(
              ...accepted.map((r) =>
                useTOF ? r.arrival_ns : r.propagation_ns,
              ),
            )
          : 1,
        time = progress == null ? 0 : progress * end,
        fraction =
          progress == null
            ? 0
            : Math.max(
                0,
                Math.min(
                  1,
                  (time - (useTOF ? ray.tof_ns : 0)) / ray.propagation_ns,
                ),
              ),
        pt =
          points[
            Math.min(
              points.length - 1,
              Math.floor(fraction * (points.length - 1)),
            )
          ];
      s += dot(pt[0], pt[1], species, 5.5);
    }
    s +=
      txt(xx(model.emission_z), 52, "광자 방출점", 'text-anchor="middle"') +
      line(
        xx(model.emission_z),
        58,
        xx(model.emission_z),
        230,
        GRID,
        'stroke-dasharray="3 4"',
      );
    svg("top-svg", s, 320);
    const include = $("include-tof").checked,
      values = Object.values(model.top_pattern)
        .flat()
        .filter((r) => r.accepted)
        .map((r) => (include ? r.arrival_ns : r.propagation_ns)),
      lo = values.length ? Math.min(...values) - 0.35 : 0,
      hi = values.length ? Math.max(...values) + 0.35 : 1,
      px = (v) => 100 + (v / 450) * 700,
      py = (t) => 225 - ((t - lo) / (hi - lo)) * 170;
    let m =
      txt(100, 25, "여러 방위각에서 온 direct photons의 예상 패턴") +
      legend(720, 25);
    for (let i = 0; i < 5; i++) {
      const val = lo + ((hi - lo) * i) / 4;
      m +=
        line(100, py(val), 800, py(val)) +
        txt(85, py(val) + 4, fmt(val, 1), 'text-anchor="end"');
    }
    for (const x of [0, 100, 200, 300, 400])
      m += txt(px(x), 250, x, 'text-anchor="middle"');
    for (const [species, rays] of Object.entries(model.top_pattern)) {
      for (const ray of rays)
        if (ray.accepted)
          m += dot(
            px(ray.hit_x_mm),
            py(include ? ray.arrival_ns : ray.propagation_ns),
            species,
            3,
          );
    }
    for (const [species, ray] of Object.entries(model.top))
      if (ray.accepted)
        m += `<circle cx="${px(ray.hit_x_mm)}" cy="${py(include ? ray.arrival_ns : ray.propagation_ns)}" r="9" fill="none" stroke="${color(species)}" stroke-width="2"/>`;
    m +=
      txt(450, 280, "sensor의 x 위치 [mm]", 'text-anchor="middle"') +
      txt(
        28,
        142,
        include ? "도착 시간 [ns]" : "광자 전파 시간 [ns]",
        'transform="rotate(-90 28 142)" text-anchor="middle"',
      );
    svg("top-map", m, 295);
    $("top-values").innerHTML =
      "<table><thead><tr><th>가설</th><th>θ_C</th><th>광학 경로</th><th>입자 TOF</th><th>광자 전파</th><th>선택 광선 도착</th></tr></thead><tbody>" +
      Object.entries(model.top)
        .map(([species, r]) =>
          r.accepted
            ? `<tr><td>${names[species]}</td><td>${fmt(rad(r.theta))}°</td><td>${fmt(r.path_m, 3)} m</td><td>${fmt(r.tof_ns, 3)} ns</td><td>${fmt(r.propagation_ns, 3)} ns</td><td>${fmt(r.arrival_ns, 3)} ns</td></tr>`
            : `<tr><td>${names[species]}</td><td colspan="5">${r.reason}</td></tr>`,
        )
        .join("") +
      "</tbody></table>";
  }
  function renderArich() {
    const sideX = (z) => 70 + (z / (0.04 + model.gap)) * 450,
      sideY = (r) => 268 - (r / 0.12) * 210,
      rcx = 745,
      rcy = 182,
      scale = 1.18;
    let s = legend(725, 28);
    s +=
      `<rect x="${sideX(0)}" y="57" width="${sideX(0.02) - sideX(0)}" height="232" fill="#deecee"/><rect x="${sideX(0.02)}" y="57" width="${sideX(0.04) - sideX(0.02)}" height="232" fill="#bddde1"/>` +
      line(
        sideX(0.04 + model.gap),
        57,
        sideX(0.04 + model.gap),
        289,
        INK,
        'stroke-width="4"',
      ) +
      txt(70, 36, "측면: normal-incidence ray") +
      txt(sideX(0.04 + model.gap) - 24, 313, "센서") +
      txt(70, 313, "n₁") +
      txt(sideX(0.02) + 3, 313, "n₂") +
      txt(195, 337, "aerogel → air 굴절 포함", 'class="minor"');
    for (const [species, rays] of Object.entries(model.arich)) {
      for (const r of rays) {
        if (r.radius_mm == null) continue;
        s += path(
          r.points.map(([z, rad]) => [sideX(z), sideY(rad)]),
          color(species),
          2.2,
          r.layer ? "5 4" : "",
        );
        s += `<circle cx="${rcx}" cy="${rcy}" r="${r.radius_mm * scale}" fill="none" stroke="${color(species)}" stroke-width="2.4" ${r.layer ? 'stroke-dasharray="5 4"' : ""}/>`;
      }
    }
    s +=
      line(rcx - 140, rcy, rcx + 140, rcy, GRID) +
      line(rcx, rcy - 140, rcx, rcy + 140, GRID) +
      txt(745, 351, "센서 면 · 대표 광선의 ring", 'text-anchor="middle"') +
      txt(
        450,
        376,
        "실선: 첫 층 / 점선: 둘째 층 · 광자 수와 ring 폭은 표시하지 않음",
        'text-anchor="middle" class="minor"',
      );
    svg("arich-svg", s, 395);
    $("arich-values").innerHTML =
      "<table><thead><tr><th>가설</th><th>β</th><th>1층 θ_C / threshold</th><th>첫 층 R</th><th>둘째 층 R</th></tr></thead><tbody>" +
      ["pi", "K"]
        .map((species) => {
          const c = model.cherenkov[species].aerogel,
            r = model.arich[species];
          return `<tr><td>${names[species]}</td><td>${fmt(c.beta, 6)}</td><td>${c.theta == null ? "방출 없음" : fmt(rad(c.theta)) + "°"} / ${fmt(c.threshold, 3)} GeV/c</td><td>${r[0].radius_mm == null ? "방출 없음" : fmt(r[0].radius_mm) + " mm"}</td><td>${r[1].radius_mm == null ? "방출 없음" : fmt(r[1].radius_mm) + " mm"}</td></tr>`;
        })
        .join("") +
      "</tbody></table>";
  }
  function renderECL() {
    const r = model.pi0,
      points = [
        [0, 0],
        [Math.cos(r.a1), Math.sin(r.a1)],
        [Math.cos(r.a2), Math.sin(r.a2)],
      ],
      xmin = Math.min(...points.map((p) => p[0])),
      xmax = Math.max(...points.map((p) => p[0])),
      ymin = Math.min(...points.map((p) => p[1])),
      ymax = Math.max(...points.map((p) => p[1])),
      scale = Math.min(
        650 / Math.max(0.01, xmax - xmin),
        230 / Math.max(0.01, ymax - ymin),
      ),
      x = (q) => 105 + (q - xmin) * scale,
      y = (q) => 300 - (q - ymin) * scale,
      cx = x(0),
      cy = y(0);
    let s =
      txt(85, 35, "π⁰ → γγ · 정확한 two-body Lorentz boost") +
      line(85, cy, 815, cy, GRID, 'stroke-dasharray="4 4"') +
      txt(500, Math.min(330, cy + 24), "π⁰ boost →");
    s += `<circle cx="${cx}" cy="${cy}" r="5" fill="${INK}"/>`;
    for (const [a, e, label, col] of [
      [r.a1, r.e1, "γ₁", PI],
      [r.a2, r.e2, "γ₂", K],
    ]) {
      const ex = x(Math.cos(a)),
        ey = y(Math.sin(a));
      s +=
        line(cx, cy, ex, ey, col, 'stroke-width="2.5"') +
        `<circle cx="${ex}" cy="${ey}" r="10" fill="${col}" fill-opacity=".22"/>` +
        txt(
          Math.min(780, Math.max(100, ex + 8)),
          Math.max(60, Math.min(338, ey + (a >= 0 ? -15 : 26))),
          `${label}: ${fmt(e, 3)} GeV`,
        );
    }
    s += txt(
      80,
      370,
      "광선 방향은 실제 기하" +
        " · cluster 크기는 도식적이며 실제 ECL acceptance를 적용하지 않음",
      'class="minor"',
    );
    svg("ecl-svg", s, 390);
    $("ecl-values").innerHTML =
      `<span>m_γγ = ${fmt(1000 * r.mass, 3)} MeV/c²</span><span>ψ = ${fmt(r.opening, 4)} rad (${fmt(rad(r.opening))}°)</span><span>${r.passes_energy ? "✓" : "✗"} 각 γ &gt; 30 MeV</span><span>${r.passes_angle ? "✓" : "✗"} ψ &lt; 0.4 rad</span>`;
  }

  function renderPID() {
    const optical = $("region").value === "barrel" ? "TOP" : "ARICH";
    $("optical-label").textContent = optical;
    const r = model.pid,
      boxes = [
        { x: 55, label: "CDC", value: r.cdc },
        { x: 55, label: optical, value: r.optical },
      ];
    let s = "";
    boxes.forEach((b, i) => {
      const yy = 35 + i * 105;
      s +=
        `<rect x="${b.x}" y="${yy}" width="230" height="70" rx="6" fill="#edf5f5"/>` +
        txt(b.x + 18, yy + 27, b.label) +
        txt(b.x + 18, yy + 52, "Δ log L = " + fmt(b.value, 1)) +
        line(b.x + 230, yy + 35, 440, 140, INK);
    });
    s +=
      `<rect x="440" y="100" width="230" height="80" rx="6" fill="#dfecf0"/>` +
      txt(460, 130, "가설별 log likelihood 합") +
      txt(460, 157, "Δ log L 합 = " + fmt(r.cdc + r.optical, 1)) +
      line(670, 140, 765, 140, INK) +
      txt(780, 137, "R_π") +
      txt(780, 160, fmt(r.ratio, 4));
    svg("pid-svg", s, 265);
    $("pid-value").innerHTML =
      `<span>R_π = <strong>${fmt(r.ratio, 4)}</strong></span><span>${r.ratio < 0.5 ? "K 가설을 지지" : r.ratio > 0.5 ? "π 가설을 지지" : "두 가설의 likelihood가 같음"}</span>`;
    $("pid-needle").style.left = 100 * r.ratio + "%";
  }
  function render() {
    if (!model) return;
    renderDetector();
    renderDedx();
    renderTOP();
    renderArich();
    renderECL();
    renderPID();
  }
  const fitFrame = $("fit-frame");
  let fitSizeObserver = null;
  function sizeFitFrame() {
    if (activeTab !== "fit") return;
    const body = fitFrame.contentDocument?.body;
    if (!body) return;
    const height = Math.ceil(body.getBoundingClientRect().height);
    if (height > 0 && height < 10000)
      fitFrame.style.height = Math.max(640, height) + "px";
  }
  fitFrame.addEventListener("load", () => {
    fitSizeObserver?.disconnect();
    const body = fitFrame.contentDocument?.body;
    if (body) {
      fitSizeObserver = new ResizeObserver(sizeFitFrame);
      fitSizeObserver.observe(body);
      sizeFitFrame();
    }
  });
  function activateTab(tab, updateHash = true) {
    const button = Array.from(document.querySelectorAll("[data-tab]")).find(
      (candidate) => candidate.dataset.tab === tab,
    );
    if (!button) return;
    activeTab = tab;
    for (const b of document.querySelectorAll("[data-tab]"))
      b.setAttribute("aria-selected", b === button);
    for (const p of document.querySelectorAll(".panel"))
      p.hidden = p.id !== activeTab;
    $("momentum-controls").hidden = activeTab === "fit";
    if (activeTab === "fit") {
      if (!fitFrame.getAttribute("src")) fitFrame.src = fitFrame.dataset.src;
      sizeFitFrame();
    }
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    if (model && activeTab === "top") renderTOP();
    if (updateHash) history.replaceState(null, "", "#" + activeTab);
  }
  for (const button of document.querySelectorAll("[data-tab]"))
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  window.addEventListener("hashchange", () =>
    activateTab(location.hash.slice(1), false),
  );
  for (const input of document.querySelectorAll("input[type=range],#dual"))
    input.addEventListener("input", update);
  $("channel").addEventListener("change", renderDetector);
  $("region").addEventListener("change", () => model && renderPID());
  $("include-tof").addEventListener("change", () => model && renderTOP());
  $("animate").addEventListener("click", () => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationStart = null;
    const step = (now) => {
      if (animationStart === null) animationStart = now;
      const progress = Math.min(1, (now - animationStart) / 2400);
      renderTOP(progress);
      if (progress < 1 && activeTab === "top")
        animationFrame = requestAnimationFrame(step);
      else animationFrame = null;
    };
    animationFrame = requestAnimationFrame(step);
  });
  update();
  activateTab(location.hash.slice(1) || "detector", false);
})();
