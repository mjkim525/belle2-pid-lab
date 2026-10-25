/* Educational Belle II PID models, ported from physics_core.py.
 * Units: GeV/c, GeV/c^2, metres, ns. These models explain mechanisms;
 * they are not calibrated Belle II detector responses or efficiencies.
 * No DOM, network requests, experimental events, or packages are used.
 */
(function (root) {
  "use strict";

  const C_M_NS = 0.299792458;
  const MASSES = Object.freeze({
    pi: 0.13957039,
    K: 0.493677,
    p: 0.938272088,
    mu: 0.105658376,
  });

  function beta(momentum, mass) {
    return momentum / Math.hypot(momentum, mass);
  }

  function cherenkov(momentum, mass, index) {
    const b = beta(momentum, mass);
    const threshold = mass / Math.sqrt(index * index - 1.0);
    const angle = index * b > 1.0 ? Math.acos(1.0 / (index * b)) : null;
    return { beta: b, theta: angle, threshold };
  }

  function fold(value, width) {
    // Python's modulo has the divisor's sign, unlike JavaScript's remainder.
    value %= 2.0 * width;
    if (value < 0) value += 2.0 * width;
    if (value === 0) value = 0;
    return value <= width ? value : 2.0 * width - value;
  }

  function arich_ray(
    momentum,
    mass,
    layer,
    gap = 0.2,
    index2 = 1.055,
    dual = true,
  ) {
    // Normal incidence and midpoint emission; gap starts at the downstream face.
    // Disabling dual gives a 40-mm single-index slab, with the same two depths.
    const indices = [1.045, dual ? index2 : 1.045];
    const depths = [0.01, 0.03];
    const n = indices[layer];
    const info = cherenkov(momentum, mass, n);
    if (info.theta === null) {
      return { ...info, points: [], radius_mm: null, layer };
    }
    // n sin(theta) is preserved at parallel interfaces (Snell's law).
    const transverse = n * Math.sin(info.theta);
    if (transverse >= 1.0) {
      return { ...info, points: [], radius_mm: null, layer };
    }
    let z = depths[layer];
    let radius = 0.0;
    const points = [[z, radius]];
    const distance = 0.02 * (layer + 1) - z;
    radius += distance * Math.tan(info.theta);
    z += distance;
    points.push([z, radius]);
    if (layer === 0) {
      radius += 0.02 * Math.tan(Math.asin(transverse / indices[1]));
      z = 0.04;
      points.push([z, radius]);
    }
    radius += gap * Math.tan(Math.asin(transverse));
    points.push([0.04 + gap, radius]);
    return { ...info, points, radius_mm: 1000 * radius, layer };
  }

  function top_ray(momentum, mass, emission_z = 1.5, azimuth_deg = -60.0) {
    // A 3D Cherenkov cone around a +y track; the bar axis is z, readout is z=0.
    // Only direct, internally reflected photons are accepted. Mirror, prism,
    // chromatic dispersion, photon statistics, and resolution are excluded.
    const n_phase = 1.47;
    const n_group = 1.5;
    const width = 0.45;
    const thickness = 0.02;
    const track_length = 1.2;
    const info = cherenkov(momentum, mass, n_phase);
    if (info.theta === null) {
      return {
        ...info,
        points: [],
        accepted: false,
        reason: "Cherenkov threshold 미만",
      };
    }
    const theta = info.theta;
    const phi = azimuth_deg * (Math.PI / 180);
    const ux = Math.sin(theta) * Math.cos(phi);
    const uy = Math.cos(theta);
    const uz = Math.sin(theta) * Math.sin(phi);
    const tir_limit = Math.sqrt(1.0 - 1.0 / n_phase ** 2);
    if (uz >= -1e-8 || Math.abs(ux) >= tir_limit || Math.abs(uy) >= tir_limit) {
      return {
        ...info,
        points: [],
        accepted: false,
        reason: "선택한 광선이 readout / 전반사 조건을 만족하지 않음",
      };
    }
    const path = emission_z / Math.abs(uz);
    const x0 = width / 2;
    const y0 = thickness / 2;
    const tof = track_length / (info.beta * C_M_NS);
    const propagation = (n_group * path) / C_M_NS;
    const points = [];
    for (let i = 0; i < 221; i += 1) {
      const fraction = i / 220;
      const optical = path * fraction;
      points.push([emission_z + uz * optical, fold(x0 + ux * optical, width)]);
    }
    // Count unfolded boundary crossings; no extra delay is added per reflection.
    const bounces_x = Math.abs(
      Math.floor((x0 + ux * path) / width) - Math.floor(x0 / width),
    );
    const bounces_y = Math.abs(
      Math.floor((y0 + uy * path) / thickness) - Math.floor(y0 / thickness),
    );
    return {
      ...info,
      accepted: true,
      points,
      path_m: path,
      tof_ns: tof,
      propagation_ns: propagation,
      arrival_ns: tof + propagation,
      hit_x_mm: 1000 * fold(x0 + ux * path, width),
      bounces_x,
      bounces_y,
    };
  }

  function ionization_relative(momentum, mass) {
    // Heavy charged-particle Bethe-like shape, with arbitrary MIP normalization.
    // I=40 eV is illustrative, not a Belle II gas calibration. Density/shell
    // corrections, Landau tails, and electronics are excluded; not for electrons.
    const electron_mass = 0.00051099895;
    const excitation = 40e-9;
    const b = beta(momentum, mass);
    const gamma = Math.hypot(momentum, mass) / mass;
    const tmax =
      (2 * electron_mass * b * b * gamma * gamma) /
      (1 + (2 * gamma * electron_mass) / mass + (electron_mass / mass) ** 2);
    const value =
      (0.5 *
        Math.log(
          (2 * electron_mass * b * b * gamma * gamma * tmax) / excitation ** 2,
        ) -
        b * b) /
      (b * b);
    return value / 10.0;
  }

  function pi0_decay(energy, costheta) {
    // Exact two-body gamma kinematics, with the pi0 boost along +x; c=1.
    const mass = 0.1349768;
    const b = Math.sqrt(1.0 - (mass / energy) ** 2);
    const gamma = energy / mass;
    const transverse = Math.sqrt(1.0 - costheta * costheta);
    const e1 = (energy / 2) * (1 + b * costheta);
    const e2 = (energy / 2) * (1 - b * costheta);
    const a1 = Math.atan2(transverse, gamma * (costheta + b));
    const a2 = Math.atan2(-transverse, gamma * (-costheta + b));
    const opening = Math.acos(
      Math.max(-1, Math.min(1, 1 - (mass * mass) / (2 * e1 * e2))),
    );
    return {
      energy,
      e1,
      e2,
      a1,
      a2,
      opening,
      mass: Math.sqrt(2 * e1 * e2 * (1 - Math.cos(opening))),
      passes_angle: opening < 0.4,
      passes_energy: Math.min(e1, e2) > 0.03,
    };
  }

  function pid_ratio(cdc, optical) {
    // Given log(LK)-log(Lpi); this ratio is not a calibrated posterior.
    const log_ratio = cdc + optical;
    return 1 / (1 + Math.exp(log_ratio));
  }

  function state(parameters = {}) {
    // Accept URLSearchParams, scalar-valued objects, and Python-style list values.
    function parameter(key, fallback) {
      let value;
      if (parameters !== null && typeof parameters.get === "function") {
        value = parameters.get(key);
      } else if (
        parameters !== null &&
        typeof parameters === "object" &&
        Object.prototype.hasOwnProperty.call(parameters, key)
      ) {
        value = parameters[key];
      }
      if (Array.isArray(value)) value = value[0];
      return value === undefined || value === null ? fallback : value;
    }

    function number(key, fallback, low, high) {
      const raw = parameter(key, fallback);
      let value = fallback;
      if (typeof raw === "number" || typeof raw === "boolean") {
        value = Number(raw);
      } else if (typeof raw === "string") {
        const text = raw.trim();
        // Empty strings and non-decimal coercions are invalid, as in float().
        if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) {
          value = Number(text);
        }
      }
      if (!Number.isFinite(value)) value = fallback;
      return Math.max(low, Math.min(high, value));
    }

    const p = number("p", 2.6, 0.4, 4.5);
    const z = number("z", 1.5, 0.4, 2.4);
    const phi = number("phi", -60, -130, -50);
    const gap = number("gap", 0.2, 0.12, 0.26);
    const n2 = number("n2", 1.055, 1.04, 1.07);
    const dual_value = parameter("dual", "1");
    const dual = dual_value === "1" || dual_value === 1 || dual_value === true;
    const energy = number("energy", 2.6, 0.2, 4.5);
    const asymmetry = number("asymmetry", 0, -0.95, 0.95);
    const cdc = number("cdc", 1, -5, 5);
    const optical = number("optical", 1.5, -5, 5);

    const curves = {};
    const ionization = {};
    for (const [species, mass] of Object.entries(MASSES)) {
      curves[species] = [];
      for (let i = 0; i < 160; i += 1) {
        const momentum = 0.12 * (5 / 0.12) ** (i / 159);
        curves[species].push([momentum, ionization_relative(momentum, mass)]);
      }
      ionization[species] = ionization_relative(p, mass);
    }

    const cherenkov_values = {};
    const top = {};
    const top_pattern = {};
    const arich = {};
    for (const species of ["pi", "K"]) {
      const mass = MASSES[species];
      cherenkov_values[species] = {
        quartz: cherenkov(p, mass, 1.47),
        aerogel: cherenkov(p, mass, 1.045),
      };
      top[species] = top_ray(p, mass, z, phi);
      top_pattern[species] = [];
      for (let i = 0; i < 56; i += 1) {
        const ray = top_ray(p, mass, z, -145 + i * 2);
        if (ray.accepted) {
          top_pattern[species].push({
            accepted: ray.accepted,
            hit_x_mm: ray.hit_x_mm,
            arrival_ns: ray.arrival_ns,
            propagation_ns: ray.propagation_ns,
          });
        }
      }
      arich[species] = [0, 1].map((layer) =>
        arich_ray(p, mass, layer, gap, n2, dual),
      );
    }
    return {
      momentum: p,
      curves,
      ionization,
      cherenkov: cherenkov_values,
      top,
      top_pattern,
      arich,
      gap,
      n2: dual ? n2 : 1.045,
      dual,
      emission_z: z,
      pi0: pi0_decay(energy, asymmetry),
      pid: { cdc, optical, ratio: pid_ratio(cdc, optical) },
    };
  }

  root.Belle2Physics = Object.freeze({
    beta,
    cherenkov,
    fold,
    arich_ray,
    top_ray,
    ionization_relative,
    pi0_decay,
    pid_ratio,
    state,
  });
})(globalThis);
