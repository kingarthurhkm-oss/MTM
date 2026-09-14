# 실제 DEM 지형과 시각화

기준: `main` 커밋 `8264c0f7eeff40db19dc09b98c6c1cc617432246`의 72×126 odd-r 헥스맵.
육지 2,411타일에 기존 `terrain` 값만 지정한다. 새 지형 타입이나 게임 규칙은 추가하지 않는다.

## 데이터 출처

- [AWS Terrain Tiles 공개 데이터](https://registry.opendata.aws/terrain-tiles/)
- [Tilezen Terrarium 형식](https://github.com/tilezen/joerd/blob/master/docs/formats.md)
- [원자료 및 저작권 고지](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)
- PNG URL: `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png`

Mapzen/Tilezen이 공개 고도 자료를 결합한 DEM 파생 래스터를 사용한다. USGS SRTM/GMTED2010과
NOAA ETOPO1 등의 결합 자료이므로 **원본 30m SRTM을 직접 사용한 것이라고 주장하지 않는다.**
이번 입력은 zoom 8, 256×256 RGB PNG 39개, 총 4,033,493바이트다. 한반도 위도에서
픽셀 간격은 대략 450~510m다. 고도(m)는 `R*256 + G + B/256 - 32768`로 복원한다.

Attribution: SRTM and GMTED2010 data courtesy of the U.S. Geological Survey;
ETOPO1 data courtesy of NOAA. Terrain Tiles processed by Mapzen/Tilezen.
이 프로젝트에서 표본 추출·중앙값 집계·게임용 분류를 수행했으며 원기관이 분류를 승인한 것은 아니다.

`tools/data/terrain-samples.json`에 입력 URL·SHA-256·바이트 수, 수집 실행일,
지도 해시·좌표 변환식, 각 헥스의 중앙값·평균·P90−P10·유효 표본 수·해안 예외 범위를 저장한다.
원본 PNG는 캐시에만 두고 게임이나 배포 HTML에 포함하지 않는다.

## 좌표와 표본 추출

기존 `GEOGRAPHY.georeference`와 `Board.project()`의 역변환을 그대로 쓴다.
`col`, `row`는 0부터 시작하며, 헥스 중심은 다음과 같다.

```text
lon = (col + 0.5*(row%2) - lonIntercept) / lonSlope
lat = (row - latIntercept) / latSlope
lonSlope = 8.382856473504797
lonIntercept = -1033.282631692804
latSlope = -11.51419904983534
latIntercept = 500.92684996671534
```

헥스 반지름 단위의 오프셋 `(x,y)`에는 각각 `x/sqrt(3)`, `y/1.5`를 더한 뒤 역변환한다.
반지름의 0.2 간격인 균일 격자에서 정육각형 내부/경계의 **67개 지점**을 선택한다.
픽셀은 nearest-neighbor로 읽고, 음의 고도(주로 연안 수심)를 제외한 중앙값과 P90−P10을 계산한다.
평균도 검토용으로 보존한다. 중앙값과 분위수는 극단적인 봉우리·수심의 영향을 줄이기 위한 선택이다.

원래 지도는 도시 CSV의 정수 타일 위치에 회귀시킨 근사 좌표다. 회귀에 사용한 도시의
중심 좌표 오차는 RMSE 약 5.26km, 최대 약 10.27km다. 도시/항만이 지정된 타일과
단순화된 해안선은 DEM 해안선과 완전히 일치하지 않는다. 이번 작업은 이를 이동시키지 않는다.

### 해안 예외

2,368타일은 원래 헥스 범위에서 고도를 얻는다. 나머지 **43타일(약 1.8%)**은 원래
범위의 67개 표본이 모두 음수여서 헥스 중심을 유지하고 범위를 1.5배→2배→3배 순서로
확장하여 처음 확보된 비음수 DEM 표본을 사용한다. 각각 23/12/8타일이다.
이는 인근 육지의 대체 표본이며 해당 헥스 내부의 정확한 고도로 취급해서는 안 된다.
3배에서도 표본이 없으면 생성에 실패한다. 무작위 고도나 일괄 0m 대체는 하지 않는다.
해상 타일에는 지형을 적용하지 않는다. 0m 자체는 저지대일 수도 있어 유효하게 취급한다.

예외 tile ID:
`2569, 2640, 2782, 2923, 2991, 3063, 3420, 3493, 4365, 4437, 4510, 4548, 4582,
4655, 4873, 4946, 5091, 5163, 5236, 5452, 5596, 5669, 5740, 5813, 5884, 6028,
6100, 6172, 6246, 6317, 6461, 6533, 6604, 6677, 6748, 6820, 6891, 6963, 7174,
7247, 7318, 7383, 8238`.

## 분류 기준

설정 파일: `tools/terrain-config.json`. 아래 순서로 판정한다.
`H`는 표본 중앙값(m), `R`은 P90−P10(m)이다. R은 경사각이 아니라 헥스 범위의 기복이다.

| terrain | 기준 | 육지 타일 수 |
|---|---|---:|
| mountain | H ≥ 650 또는 (H ≥ 150 이고 R ≥ 450) | 772 |
| hills | 위 조건 제외, H ≥ 150 또는 (H ≥ 40 이고 R ≥ 120) | 1,112 |
| plains | 나머지 | 527 |

해발고도가 높은 개마고원은 비교적 평탄하더라도 기존 `mountain` 타입으로 표현한다.
낙동강 같은 낮은 평야는 헥스 가장자리에 산이 일부 포함돼도 중앙값이 낮으면 평야로 보존한다.
이는 작전급 게임의 세 가지 분류이며 지질학적 지형 구분이나 정밀 경사 모델은 아니다.
좁은 계곡·작은 섬·단일 봉우리는 지도 해상도와 근사 좌표 때문에 정확히 표현되지 않을 수 있다.

## 지역 검증

대표 지점에서 기존 `Board.nearest(lon, lat, land)`로 고른 헥스의 결과다.
모두 확대 표본 없이 원래 헥스 범위를 사용했다. 지역 전체의 완전한 정확도를 증명하는 검사는 아니다.
실제 게임 화면에서도 산지의 연속성과 서부 평야 분포를 확인했다.

| 지역 / 검증 좌표 (경도, 위도) | tile ID | H(m) | R(m) | 결과 |
|---|---:|---:|---:|---|
| 태백산맥 (128.90, 37.15) | 5303 | 975 | 498.4 | mountain |
| 소백산맥 (128.48, 36.95) | 5443 | 638 | 848 | mountain |
| 함경산맥 (129.20, 41.10) | 2066 | 585 | 519.4 | mountain |
| 개마고원 (127.50, 40.90) | 2196 | 1416 | 571.8 | mountain |
| 서해안·아산만 저지대 (126.85, 36.88) | 5502 | 6.5 | 16.3 | plains |
| 호남 평야 (126.85, 35.82) | 6366 | 9 | 14.6 | plains |
| 낙동강 하류·김해 평야 (128.90, 35.15) | 6959 | 2 | 186.5 | plains |
| 평양 평야 (125.65, 38.98) | 3764 | 13 | 39.5 | plains |

## 재생성

```sh
# 임계값만 조정: 네트워크/이미지 라이브러리 불필요
python3 tools/build-terrain.py
python3 tools/build-terrain.py --check

# DEM 재수집 또는 표본/좌표 설정 변경: Python Pillow 필요
python3 tools/build-terrain.py --sample --cache /tmp/mtm-dem-cache

npm test
python3 tools/build-standalone.py
node tests/terrain-ui.cjs
```

브라우저 QA는 Playwright/Chromium이 필요하며 기존 `ui-smoke.cjs`와 같은
`PENINSULA_PLAYWRIGHT_MODULE`, `PENINSULA_CHROMIUM` 환경 변수를 지원한다.
마스크·좌표·표본 설정 변경 시 기존 통계를 재사용하지 못하도록 검증한다.
임계값 변경 후에는 지역 검증 기대값과 실제 화면을 다시 검토한다.

## 런타임 및 검증 결과

- `terrain-data.js` 약 2.9KB: 육지 순서에 대응하는 0/1/2 코드와 지도 식별 정보.
  게임은 이 정적 모듈만 읽는다. 80KB의 통계 파일과 원본 DEM은 런타임에서 읽지 않는다.
- Board 생성 시 `terrain`만 설정한다. 숲·도시화·하천·도로·철도·KTX·시설·부대 위치는
  변경하지 않는다. 기존 산지 이동/전투/보급 계수가 그대로 적용되어 경로 비용과 보급 수치는
  새 산지 데이터에 따라 달라질 수 있다. 계산식은 변경하지 않았다.
- 평지는 기존 국가색, 구릉은 약한 색상 오버레이와 둥근 기호, 산지는 더 뚜렷한 오버레이와
  봉우리 기호를 그린다. 해안선·도로·철도보다 먼저 그려 시설·부대·이동·보급 UI를 가리지 않는다.
  축소 캐시·확대 지도·미니맵·단일 HTML 모두 같은 지형을 사용한다.
- `npm test`: 기존 56개와 신규 5개, 총 61개 통과. 신규 항목 안에서 Python 테스트 3개도 실행.
  지형 외 타일 필드, 도로/철도, 초기 시설과 부대 배치가 평지 기준과 동일한지 비교한다.
- `tests/terrain-ui.cjs`: 실제 Chromium의 PC/모바일·확대/축소·이동/보급 레이어·단일 HTML
  렌더링 확인, 콘솔/페이지 오류 0개. 이미지 출력은 `test-results/terrain-*.png`.
- 기존 선택 실행용 `tests/ui-smoke.cjs`는 `#theater-button`이 열린 사이드바의
  `#panel-close`에 가려져 클릭 타임아웃이 발생한다. 수정 전 `8264c0f`에서도 같은 지점에서
  재현됨을 확인했다. 이번 지형 커밋에서 해당 UI 동작은 변경하지 않는다.
