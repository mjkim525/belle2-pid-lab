# Belle II · PID Lab

[웹에서 열기](https://mjkim525.github.io/belle2-pid-lab/)

Belle II 검출기와 입자 식별 원리를 한국어로 살펴보는 교육용 도구입니다. Phys. Rev. D **109, 012001 (2024)**의 B → Kπ / ππ 분석에 연결되는 장치를 중심으로 구성했습니다.

## 살펴볼 수 있는 것

- **검출기·채널:** 각 B 붕괴를 어떤 서브 검출기에서 재구성하는지 확인합니다.
- **CDC:** 운동량에 따른 π/K/p/μ의 전리 에너지 손실 모양을 비교합니다.
- **TOP:** quartz 내부반사 광경로와 photon 위치–시간 패턴을 비교합니다.
- **ARICH:** 이중 aerogel의 굴절률·간격·운동량을 바꾸며 ring focusing과 방출 문턱을 봅니다.
- **ECL:** π⁰ → γγ의 에너지·방향·불변질량과 Kₛ vertex 재구성을 구분합니다.
- **PID likelihood:** CDC와 TOP 또는 ARICH 정보가 Lπ/(Lπ+LK)로 합쳐지는 과정을 봅니다.
- **[분기비·CP fit](https://mjkim525.github.io/belle2-pid-lab/#fit):** 분기비와 CP 비대칭을 바꿔 B/B̄ 표본의 기대 수율을 비교하고, 고정된 모의 데이터에 두 파라미터를 동시에 맞춥니다.

모든 계산은 브라우저 안에서 이루어집니다. Python 서버, 계정이나 실험 데이터가 필요하지 않습니다. 검출기·PID 탭은 추가 패키지 없이 작동하며, 분기비·CP fit 탭은 그래프용 D3를 CDN에서 불러오므로 인터넷 연결이 필요합니다. 공식 원자료를 여는 링크에도 인터넷 연결이 필요합니다.

## 이 모델의 범위

실제 Belle II 검출기 시뮬레이션이나 PID 성능 예측이 아닙니다. ARICH는 정상 입사·각 층 중앙 방출·Snell 굴절, TOP는 직육면체 bar에서 전반사 조건을 통과한 direct photon을 사용합니다. ECL은 정확한 π⁰ two-body Lorentz boost이며, CDC는 임의 정규화의 heavy-particle Bethe–Bloch 유사 곡선입니다.

광자 수, noise, detector resolution, prism, 곡면 mirror, chromatic dispersion과 acceptance calibration은 생략했습니다. 화면의 likelihood 비는 보정된 posterior probability가 아닙니다.

분기비·CP fit은 전하별 효율이 같은 경우의 설명용 1차원 binned Poisson 모형입니다. 고정된 모의 데이터와 표본당 고정 배경 300개를 사용합니다. 논문의 실제 데이터나 2차원 unbinned fit을 재현하지 않으며 tagging, mixing, feed-across와 검출기 전하 비대칭은 생략합니다.

## 로컬에서 열기

저장소를 내려받아 `index.html`을 브라우저로 열면 됩니다. 개발용 서버를 쓰려면 저장소 폴더에서 다음과 같이 실행할 수도 있습니다.

```bash
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000/`을 엽니다.

## 계산 검증

`physics.js`는 원래 Python 모델을 JavaScript로 옮긴 것입니다. Python 3.9 이상과 Node.js가 있으면 외부 패키지 없이 두 모델을 대조할 수 있습니다.

```bash
python3 tests/verify_physics.py
```

169개 조건에서 전체 출력 구조와 수치를 비교합니다. 입력 범위, Cherenkov 문턱 양옆, ARICH single/dual, TOP 각도, ECL 에너지·방향 및 PID 부호를 포함합니다. 수학적으로 정확한 문턱에서는 언어별 부동소수 반올림이 분기를 바꿀 수 있어, 테스트는 문턱의 명확한 양옆을 검사합니다.

## 파일

| 파일                         | 역할                         |
| ---------------------------- | ---------------------------- |
| `index.html`                 | 한국어 설명과 조작부         |
| `styles.css`                 | 화면 스타일                  |
| `app.js`                     | 그림과 사용자 조작           |
| `physics.js`                 | 물리 계산                    |
| `fit-lab.html`               | 분기비·CP 비대칭 모의 동시 fit |
| `tests/reference_physics.py` | 비교 기준인 원래 Python 모델 |
| `tests/verify_physics.py`    | Python/JavaScript 계산 대조  |

## 공식 원자료

- [대상 논문](https://doi.org/10.1103/PhysRevD.109.012001)
- [KEK Belle II booklet](https://www2.kek.jp/proffice/Pamphlets/IPNS/BELLEII_E.pdf): PDF 6–7쪽 검출 원리, 8–9쪽 실제 장치 사진
- [Belle II online book](https://software.belle2.org/release-09-00-15/sphinx/online_book/fundamentals/02-datataking.html): 전체 구조와 서브 검출기
- [TOP VCI2022 발표](https://indico.cern.ch/event/1044975/contributions/4663810/attachments/2394825/4094513/TOP_VCI2022_v3.pdf): PDF 4–5쪽 optics·likelihood, 10쪽 실제 위치–시간 패턴
- [ARICH prototype 논문](https://arxiv.org/abs/1603.02503): Fig.2–3 원리·focusing, Fig.10 photon hits
- [Belle II KAON2019 발표](https://docs.belle2.org/files/2716/BELLE2-TALK-CONF-2019-126/1/BELLE2-TALK-CONF-2019-126.pdf): PDF 10쪽 CDC dE/dx, 15쪽 global PID

공식 자료의 성능 수치는 각 자료의 작성 시점에 해당합니다. 이후 개선된 기법을 2024년 대상 분석이 사용했다고 가정하지 않았습니다.

## GitHub Pages

브랜치 `main`의 루트(`/`)를 게시 원본으로 사용합니다. `.nojekyll`이 있으므로 파일을 정적 사이트로 그대로 제공합니다. `index.html`과 두 JavaScript 파일, CSS는 상대 경로로 연결되어 있습니다.
