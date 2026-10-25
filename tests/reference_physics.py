"""Educational Belle II PID models. Units: GeV/c, GeV/c^2, metres, ns.

These models explain mechanisms; they are not calibrated Belle II response or
efficiency predictions. No experimental events or external packages are used.
"""
import math

C_M_NS = 0.299792458
MASSES = {'pi': 0.13957039, 'K': 0.493677, 'p': 0.938272088, 'mu': 0.105658376}


def beta(momentum, mass):
    return momentum / math.hypot(momentum, mass)


def cherenkov(momentum, mass, index):
    b = beta(momentum, mass)
    threshold = mass / math.sqrt(index * index - 1.0)
    angle = math.acos(1.0 / (index * b)) if index * b > 1.0 else None
    return {'beta': b, 'theta': angle, 'threshold': threshold}


def fold(value, width):
    value %= 2.0 * width
    return value if value <= width else 2.0 * width - value


def arich_ray(momentum, mass, layer, gap=0.20, index2=1.055, dual=True):
    """Normal incidence, midpoint emission, refraction at flat interfaces.

    gap is measured from the downstream radiator face to the sensor plane.
    For dual=False both 20-mm layers have n=1.045 (a 40-mm single-index slab).
    """
    indices = [1.045, index2 if dual else 1.045]
    depths = [0.01, 0.03]
    n = indices[layer]
    info = cherenkov(momentum, mass, n)
    if info['theta'] is None:
        return {**info, 'points': [], 'radius_mm': None, 'layer': layer}
    # n sin(theta) is preserved at parallel interfaces (Snell's law).
    transverse = n * math.sin(info['theta'])
    if transverse >= 1.0:
        return {**info, 'points': [], 'radius_mm': None, 'layer': layer}
    z = depths[layer]
    radius = 0.0
    points = [[z, radius]]
    distance = 0.02 * (layer + 1) - z
    radius += distance * math.tan(info['theta'])
    z += distance
    points.append([z, radius])
    if layer == 0:
        radius += 0.02 * math.tan(math.asin(transverse / indices[1]))
        z = 0.04
        points.append([z, radius])
    radius += gap * math.tan(math.asin(transverse))
    points.append([0.04 + gap, radius])
    return {**info, 'points': points, 'radius_mm': 1000 * radius, 'layer': layer}


def top_ray(momentum, mass, emission_z=1.5, azimuth_deg=-60.0):
    """One direct photon from a 3D Cherenkov cone in a rectangular quartz bar.

    Track direction = +y, bar long axis = z, readout at z=0. Only accepted
    direct photons are shown. Far-end mirror, prism, chromatic dispersion,
    photon statistics and resolution are deliberately excluded.
    """
    n_phase, n_group = 1.47, 1.50
    width, thickness, track_length = 0.45, 0.02, 1.2
    info = cherenkov(momentum, mass, n_phase)
    if info['theta'] is None:
        return {**info, 'points': [], 'accepted': False, 'reason': 'Cherenkov threshold 미만'}
    theta = info['theta']
    phi = math.radians(azimuth_deg)
    ux = math.sin(theta) * math.cos(phi)
    uy = math.cos(theta)
    uz = math.sin(theta) * math.sin(phi)
    tir_limit = math.sqrt(1.0 - 1.0 / n_phase ** 2)
    if uz >= -1e-8 or abs(ux) >= tir_limit or abs(uy) >= tir_limit:
        return {**info, 'points': [], 'accepted': False, 'reason': '선택한 광선이 readout / 전반사 조건을 만족하지 않음'}
    path = emission_z / abs(uz)
    x0, y0 = width / 2, thickness / 2
    tof = track_length / (info['beta'] * C_M_NS)
    propagation = n_group * path / C_M_NS
    points = []
    for i in range(221):
        fraction = i / 220
        optical = path * fraction
        points.append([emission_z + uz * optical, fold(x0 + ux * optical, width)])
    # Count crossings of the unfolded slab boundaries, not artificial delays.
    bounces_x = abs(math.floor((x0 + ux * path) / width) - math.floor(x0 / width))
    bounces_y = abs(math.floor((y0 + uy * path) / thickness) - math.floor(y0 / thickness))
    return {**info, 'accepted': True, 'points': points, 'path_m': path,
            'tof_ns': tof, 'propagation_ns': propagation, 'arrival_ns': tof + propagation,
            'hit_x_mm': 1000 * fold(x0 + ux * path, width),
            'bounces_x': bounces_x, 'bounces_y': bounces_y}


def ionization_relative(momentum, mass):
    """Heavy charged-particle Bethe-like shape; arbitrary MIP normalization.

    I=40 eV is an illustrative material constant, not a Belle II gas fit.
    Density/shell corrections, Landau tails and electronics are excluded.
    Not applicable to electrons.
    """
    electron_mass = 0.00051099895
    excitation = 40e-9
    b = beta(momentum, mass)
    gamma = math.hypot(momentum, mass) / mass
    tmax = 2 * electron_mass * b * b * gamma * gamma / (
        1 + 2 * gamma * electron_mass / mass + (electron_mass / mass) ** 2)
    value = (0.5 * math.log(2 * electron_mass * b * b * gamma * gamma * tmax / excitation ** 2)
             - b * b) / (b * b)
    return value / 10.0


def pi0_decay(energy, costheta):
    """Exact two-body gamma kinematics, pi0 boost along +x; c=1."""
    mass = 0.1349768
    b = math.sqrt(1.0 - (mass / energy) ** 2)
    gamma = energy / mass
    transverse = math.sqrt(1.0 - costheta * costheta)
    e1 = energy / 2 * (1 + b * costheta)
    e2 = energy / 2 * (1 - b * costheta)
    a1 = math.atan2(transverse, gamma * (costheta + b))
    a2 = math.atan2(-transverse, gamma * (-costheta + b))
    opening = math.acos(max(-1, min(1, 1 - mass * mass / (2 * e1 * e2))))
    return {'energy': energy, 'e1': e1, 'e2': e2, 'a1': a1, 'a2': a2,
            'opening': opening, 'mass': math.sqrt(2 * e1 * e2 * (1 - math.cos(opening))),
            'passes_angle': opening < 0.4, 'passes_energy': min(e1, e2) > 0.030}


def pid_ratio(cdc, optical):
    """Lpi/(Lpi+LK) given logLK-logLpi; not a posterior probability."""
    log_ratio = cdc + optical
    return 1 / (1 + math.exp(log_ratio))


def state(parameters):
    def number(key, default, low, high):
        try:
            value = float(parameters.get(key, [default])[0])
        except (ValueError, TypeError):
            value = default
        if not math.isfinite(value):
            value = default
        return max(low, min(high, value))
    p = number('p', 2.6, .4, 4.5)
    z = number('z', 1.5, .4, 2.4)
    phi = number('phi', -60, -130, -50)
    gap = number('gap', .2, .12, .26)
    n2 = number('n2', 1.055, 1.04, 1.07)
    dual = parameters.get('dual', ['1'])[0] == '1'
    energy = number('energy', 2.6, .2, 4.5)
    asymmetry = number('asymmetry', 0, -.95, .95)
    cdc = number('cdc', 1, -5, 5)
    optical = number('optical', 1.5, -5, 5)
    curves = {s: [[.12 * (5 / .12) ** (i / 159),
                  ionization_relative(.12 * (5 / .12) ** (i / 159), m)]
                 for i in range(160)] for s, m in MASSES.items()}
    return {'momentum': p, 'curves': curves,
            'ionization': {s: ionization_relative(p, m) for s, m in MASSES.items()},
            'cherenkov': {s: {medium: cherenkov(p, m, n)
                              for medium, n in [('quartz', 1.47), ('aerogel', 1.045)]}
                          for s, m in MASSES.items() if s in ['pi', 'K']},
            'top': {s: top_ray(p, MASSES[s], z, phi) for s in ['pi', 'K']},
            'top_pattern': {s: [{key: ray[key] for key in
                                ['accepted', 'hit_x_mm', 'arrival_ns', 'propagation_ns']}
                               for i in range(56)
                               for ray in [top_ray(p, MASSES[s], z, -145 + i * 2)]
                               if ray['accepted']] for s in ['pi', 'K']},
            'arich': {s: [arich_ray(p, MASSES[s], j, gap, n2, dual) for j in [0, 1]]
                      for s in ['pi', 'K']},
            'gap': gap, 'n2': n2 if dual else 1.045, 'dual': dual, 'emission_z': z,
            'pi0': pi0_decay(energy, asymmetry),
            'pid': {'cdc': cdc, 'optical': optical, 'ratio': pid_ratio(cdc, optical)}}


def self_test():
    assert abs(beta(2.6, MASSES['pi']) - .9985623) < 1e-7
    assert abs(beta(2.6, MASSES['K']) - .9824468) < 1e-7
    assert cherenkov(.4, MASSES['K'], 1.045)['theta'] is None
    assert cherenkov(2.6, MASSES['pi'], 1.045)['theta'] > cherenkov(2.6, MASSES['K'], 1.045)['theta']
    a1 = arich_ray(2.6, MASSES['pi'], 0)
    a2 = arich_ray(2.6, MASSES['pi'], 1)
    single1 = arich_ray(2.6, MASSES['pi'], 0, dual=False)
    single2 = arich_ray(2.6, MASSES['pi'], 1, dual=False)
    assert abs(a1['radius_mm'] - a2['radius_mm']) < abs(single1['radius_mm'] - single2['radius_mm'])
    for p in [.4, .6, 1.6, 2.6, 4.5]:
        for phi in [-130, -90, -60, -50]:
            for s in ['pi', 'K']:
                ray = top_ray(p, MASSES[s], 1.5, phi)
                if ray['accepted']:
                    assert ray['path_m'] >= 1.5
                    assert abs(ray['points'][-1][0]) < 1e-12
                    assert all(-1e-10 <= pt[1] <= .45 + 1e-10 for pt in ray['points'])
                    assert abs(ray['arrival_ns'] - ray['tof_ns'] - ray['propagation_ns']) < 1e-12
    for energy in [.2, 1, 2.6, 4.5]:
        for asymmetry in [-.95, 0, .95]:
            decay = pi0_decay(energy, asymmetry)
            assert abs(decay['e1'] + decay['e2'] - energy) < 1e-12
            assert abs(decay['mass'] - .1349768) < 1e-12
    assert pid_ratio(1, 2) < .5
    assert pid_ratio(-1, -2) > .5
    assert pid_ratio(0, 0) == .5
    return {'beta_pi': beta(2.6, MASSES['pi']), 'beta_K': beta(2.6, MASSES['K']),
            'arich_pi_radii_mm': [a1['radius_mm'], a2['radius_mm']],
            'top_pi_arrival_ns': top_ray(2.6, MASSES['pi'])['arrival_ns'],
            'top_K_arrival_ns': top_ray(2.6, MASSES['K'])['arrival_ns']}
