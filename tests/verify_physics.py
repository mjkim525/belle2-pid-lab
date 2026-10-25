#!/usr/bin/env python3
"""Compare the dependency-free browser model with the original Python model.

Run from any directory:
    python3 tests/verify_physics.py

The JavaScript model runs in Node without a DOM. All query cases are sent in one
stdin batch; every nested key, array entry, null, boolean and number is checked.
No generated result snapshots or third-party test packages are needed. The
bundled reference_physics.py is preferred so the test also works independently
of the original local Python app.

Cherenkov/TIR boundaries are sampled on both sides at a relative distance of
1e-8, not at the mathematically exact boundary: Python and V8 hypot can differ
by one ulp there, changing a zero-angle/null or acceptance branch. Values just
above the Cherenkov boundary use 1e-8 tolerance because acos is ill-conditioned;
all other numeric checks use 1e-9. Nulls, booleans and containers stay strict.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import random
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path


PAGES_DIR = Path(__file__).resolve().parents[1]
LOCAL_REFERENCE = Path(__file__).resolve().with_name("reference_physics.py")
REFERENCE_PATH = (LOCAL_REFERENCE if LOCAL_REFERENCE.is_file() else
                  PAGES_DIR.parent / "belle2_pid_lab" / "physics_core.py")
ABS_TOL = 1e-9
REL_TOL = 1e-9
THRESHOLD_TOL = 1e-8
sys.dont_write_bytecode = True

NODE_RUNNER = r"""
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
vm.runInThisContext(source, {filename: process.argv[1]});
if (!globalThis.Belle2Physics ||
    typeof globalThis.Belle2Physics.state !== 'function') {
  throw new Error('Expected globalThis.Belle2Physics.state(URLSearchParams)');
}
const cases = JSON.parse(fs.readFileSync(0, 'utf8'));
const results = cases.map(test => {
  const state = globalThis.Belle2Physics.state(new URLSearchParams(test.entries));
  return {name: test.name, state};
});
process.stdout.write(JSON.stringify(results));
"""


def load_reference(path):
    spec = importlib.util.spec_from_file_location("belle2_reference", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import the reference model: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def query_string(value):
    if isinstance(value, str):
        return value
    if isinstance(value, float):
        return format(value, ".17g")
    return str(value)


def make_cases(reference):
    cases = []

    def add(group, name, values=None, *, entries=None):
        if entries is None:
            entries = [[key, query_string(value)] for key, value in (values or {}).items()]
        cases.append({"group": group, "name": f"{group}/{name}", "entries": entries})

    add("defaults", "no-parameters")
    add("defaults", "explicit-defaults", {
        "p": 2.6, "z": 1.5, "phi": -60, "gap": .2, "n2": 1.055,
        "dual": "1", "energy": 2.6, "asymmetry": 0, "cdc": 1, "optical": 1.5,
    })
    add("defaults", "unknown-parameter-ignored", {"unrelated": "ignored"})
    add("defaults", "duplicate-uses-first", entries=[
        ["p", "1.7"], ["p", "4.4"], ["dual", "0"], ["dual", "1"],
    ])

    # Exercise all input limits and both defaulting and clamping semantics.
    bounds = {
        "p": (.4, 4.5), "z": (.4, 2.4), "phi": (-130, -50),
        "gap": (.12, .26), "n2": (1.04, 1.07), "energy": (.2, 4.5),
        "asymmetry": (-.95, .95), "cdc": (-5, 5), "optical": (-5, 5),
    }
    for key, (low, high) in bounds.items():
        for label, value in [("low", low), ("high", high),
                             ("below", low - 1000), ("above", high + 1000)]:
            add("limits", f"{key}-{label}", {key: value})
    for invalid in ["", " ", "NaN", "Infinity", "-Infinity", "bad", "1junk", "0x10"]:
        add("parsing", f"invalid-{invalid!r}", {key: invalid for key in bounds})
    add("parsing", "signed-exponent-whitespace", {
        "p": " +2.6e0 ", "cdc": " -1e0 ", "optical": " +1.5E0 ",
    })
    for dual in ["0", "1", "", "true", "false", "2", " 1 "]:
        add("arich", f"dual-string-{dual!r}", {"dual": dual})

    # Thresholds for each displayed species and every available radiator index.
    # Pi/quartz is below the UI momentum range, which also verifies clamping.
    for species in ["pi", "K"]:
        mass = reference.MASSES[species]
        for index in [1.04, 1.045, 1.055, 1.07, 1.47]:
            threshold = mass / math.sqrt(index * index - 1)
            for offset, label in [(-1e-8, "below"), (1e-8, "above")]:
                add("thresholds", f"{species}-n{index}-{label}", {
                    "p": threshold * (1 + offset), "n2": index,
                })

    # A TOP photon can clear the Cherenkov threshold and still fail TIR at a
    # broad bar surface. Include that distinct acceptance boundary for kaons.
    tir_threshold = reference.MASSES["K"] / math.sqrt(1.47 ** 2 - 2)
    for offset, label in [(-1e-8, "below"), (1e-8, "above")]:
        add("top", f"kaon-TIR-{label}", {"p": tir_threshold * (1 + offset)})
    for phi in [-131, -130, -129.999999, -90, -60, -50.000001, -50, -49]:
        for momentum in [.4, 1.6, 4.5]:
            add("top", f"p{momentum}-phi{phi}", {"p": momentum, "phi": phi})
    for dual in ["0", "1"]:
        for gap in [.12, .26]:
            for index in [1.04, 1.07]:
                add("arich", f"dual{dual}-gap{gap}-n{index}", {
                    "p": 1.6, "dual": dual, "gap": gap, "n2": index,
                })

    # Exact two-photon kinematics at both cos(theta*) slider ends and beyond.
    for energy in [.2, 1, 2.6, 4.5]:
        for costheta in [-1, -.95, 0, .95, 1]:
            add("ecl", f"E{energy}-cos{costheta}", {
                "energy": energy, "asymmetry": costheta,
            })
    pi0_mass = .1349768
    angle_cut_energy = pi0_mass / math.sin(.2)
    costheta, photon_cut = .95, .030
    photon_cut_energy = (
        2 * photon_cut + costheta * math.sqrt(
            4 * photon_cut ** 2 - (1 - costheta ** 2) * pi0_mass ** 2)
    ) / (1 - costheta ** 2)
    for offset, label in [(-1e-8, "below"), (0, "at"), (1e-8, "above")]:
        add("ecl", f"opening-cut-{label}", {
            "energy": angle_cut_energy * (1 + offset), "asymmetry": 0,
        })
        add("ecl", f"photon-energy-cut-{label}", {
            "energy": photon_cut_energy * (1 + offset), "asymmetry": costheta,
        })

    for cdc, optical in [(0, 0), (5, 5), (-5, -5), (5, -5), (-5, 5),
                         (1, 2), (-1, -2), (1, -2), (-1, 2)]:
        add("pid", f"cdc{cdc}-optical{optical}", {"cdc": cdc, "optical": optical})

    # Reproducible joint settings expose interactions missed by one-input tests.
    rng = random.Random(109012001)
    for i in range(24):
        values = {key: rng.uniform(low, high) for key, (low, high) in bounds.items()}
        values["dual"] = str(i % 2)
        add("joint", f"seeded-{i:02d}", values)
    return cases


def python_parameters(entries):
    result = {}
    for key, value in entries:
        result.setdefault(key, []).append(value)
    return result


def compare(expected, actual, path, stats):
    """Strict container/null/bool checks and tolerant finite numeric checks."""
    if isinstance(expected, dict):
        if not isinstance(actual, dict) or set(expected) != set(actual):
            raise AssertionError(f"{path}: object keys differ: {set(expected)} vs "
                                 f"{set(actual) if isinstance(actual, dict) else type(actual).__name__}")
        for key in expected:
            compare(expected[key], actual[key], f"{path}.{key}", stats)
    elif isinstance(expected, list):
        if not isinstance(actual, list) or len(expected) != len(actual):
            raise AssertionError(f"{path}: array lengths/types differ: {len(expected)} vs "
                                 f"{len(actual) if isinstance(actual, list) else type(actual).__name__}")
        for index, (left, right) in enumerate(zip(expected, actual)):
            compare(left, right, f"{path}[{index}]", stats)
    elif expected is None or isinstance(expected, (bool, str)):
        if type(expected) is not type(actual) or expected != actual:
            raise AssertionError(f"{path}: {expected!r} != {actual!r}")
        stats["exact_leaves"] += 1
    elif isinstance(expected, (int, float)):
        if isinstance(actual, bool) or not isinstance(actual, (int, float)):
            raise AssertionError(f"{path}: expected a number, got {actual!r}")
        if not math.isfinite(expected) or not math.isfinite(actual):
            raise AssertionError(f"{path}: non-finite number: {expected!r}, {actual!r}")
        difference = abs(expected - actual)
        # Only threshold cases need the larger allowance for the singular acos
        # derivative. No structural or discrete difference is ever tolerated.
        near_threshold = path.startswith("thresholds/")
        absolute_tolerance = THRESHOLD_TOL if near_threshold else ABS_TOL
        relative_tolerance = THRESHOLD_TOL if near_threshold else REL_TOL
        if not math.isclose(expected, actual, abs_tol=absolute_tolerance,
                            rel_tol=relative_tolerance):
            raise AssertionError(f"{path}: Python={expected:.17g}, JS={actual:.17g}, "
                                 f"abs error={difference:.3g}")
        stats["numeric_leaves"] += 1
        stats["max_abs_error"] = max(stats["max_abs_error"], difference)
    else:
        raise AssertionError(f"{path}: unsupported reference type {type(expected).__name__}")


def check_physical_invariants(state, case_name):
    """Conservation/geometry and likelihood-sign checks independent of snapshots."""
    decay = state["pi0"]
    assert math.isclose(decay["e1"] + decay["e2"], decay["energy"], abs_tol=1e-12), case_name
    assert math.isclose(decay["mass"], .1349768, abs_tol=1e-11), case_name
    assert decay["passes_energy"] == (min(decay["e1"], decay["e2"]) > .030), case_name
    assert decay["passes_angle"] == (decay["opening"] < .4), case_name
    pid = state["pid"]
    summed = pid["cdc"] + pid["optical"]
    assert 0 < pid["ratio"] < 1, case_name
    assert ((pid["ratio"] < .5) if summed > 0 else
            (pid["ratio"] > .5) if summed < 0 else pid["ratio"] == .5), case_name
    for ray in state["top"].values():
        if ray["accepted"]:
            assert len(ray["points"]) == 221, case_name
            assert abs(ray["points"][-1][0]) < 1e-12, case_name
            assert all(-1e-12 <= point[1] <= .45 + 1e-12 for point in ray["points"]), case_name
            assert ray["path_m"] >= state["emission_z"], case_name
            assert math.isclose(ray["arrival_ns"], ray["tof_ns"] + ray["propagation_ns"],
                                abs_tol=1e-12), case_name
        else:
            assert ray["points"] == [], case_name
    for layers in state["arich"].values():
        for ray in layers:
            assert (ray["radius_mm"] is None) == (len(ray["points"]) == 0), case_name


def run(node, reference_path, javascript_path):
    reference = load_reference(reference_path)
    reference.self_test()
    cases = make_cases(reference)
    completed = subprocess.run(
        [str(node), "-e", NODE_RUNNER, str(javascript_path)],
        input=json.dumps(cases), text=True, capture_output=True, timeout=60,
    )
    if completed.returncode:
        raise RuntimeError(f"Node model failed ({completed.returncode}):\n{completed.stderr.strip()}")
    try:
        outputs = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Node returned invalid JSON: {error}; "
                           f"stdout starts {completed.stdout[:200]!r}") from error
    assert len(outputs) == len(cases), "Node result count differs from the input batch"
    stats = {"numeric_leaves": 0, "exact_leaves": 0, "max_abs_error": 0.0}
    failures = []
    for case, output in zip(cases, outputs):
        try:
            assert output["name"] == case["name"], "Batch result order differs"
            expected = reference.state(python_parameters(case["entries"]))
            actual = output["state"]
            compare(expected, actual, case["name"], stats)
            check_physical_invariants(actual, case["name"])
        except (AssertionError, KeyError, TypeError) as error:
            failures.append(str(error))
    if failures:
        for failure in failures[:15]:
            print(f"FAIL {failure}", file=sys.stderr)
        if len(failures) > 15:
            print(f"... {len(failures) - 15} additional failures", file=sys.stderr)
        print(f"FAILED: {len(failures)}/{len(cases)} cases", file=sys.stderr)
        return 1
    groups = Counter(case["group"] for case in cases)
    print(f"PASS: {len(cases)} complete Python/JavaScript state comparisons")
    print("Coverage: " + ", ".join(f"{group}={count}" for group, count in groups.items()))
    print(f"Checked {stats['numeric_leaves']:,} numeric leaves and "
          f"{stats['exact_leaves']:,} exact null/bool/string leaves; "
          f"max absolute error {stats['max_abs_error']:.3g} "
          f"(abs/relative tolerance {ABS_TOL:g}/{REL_TOL:g}; "
          f"Cherenkov-edge cases {THRESHOLD_TOL:g}).")
    print("Physical checks: pi0 energy/mass, photon cuts, PID sign, TOP endpoint/"
          "folding/timing, ARICH null geometry; original self-test passed.")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", type=Path, default=REFERENCE_PATH)
    parser.add_argument("--javascript", type=Path, default=PAGES_DIR / "physics.js")
    parser.add_argument("--node", default=shutil.which("node") or "node")
    args = parser.parse_args()
    for path in [args.reference, args.javascript]:
        if not path.is_file():
            parser.error(f"Required model file is missing: {path}")
    try:
        return run(args.node, args.reference, args.javascript)
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
