> 이전 버전의 검증 기록입니다. 현재 Korea Board 검증은 [KOREA-VALIDATION.md](KOREA-VALIDATION.md)를 보세요.

# 공개 육군 확장 검증 기록

검증일: 2026-09-12. `VALIDATION.md`는 기존 기본 버전의 기록으로 보존하며, 이 문서는 육군 확장 변경분의 결과다.

| 검증 | 결과 |
|---|---|
| 기존 규칙 테스트 | 14개 통과 |
| 육군·지도·저장 통합 테스트 | 11개 통과; 총 25개 통과 |
| 정본 JSON / 생성 ES 모듈 일치 | `build-army-data.py --check` 통과 |
| 참조·계층·출처·스탯 | 중복 ID, 잘못된 부모, 순환, 범위 초과, 출처 미연결, 지원하지 않는 정밀·작전 필드 검증 |
| 실제 엔진 생성 | 카탈로그 67개 중 육군 유닛 55개; 가상 지원 9개와 적군 16개 포함 총 80개 |
| 지도·배치 | 240×480, 115,200타일; 북위 38도 부근 한반도 연속 육지 폭 20타일 이상; 36개 시군·광역시 대표 권역 모두 남한 육지이며 기존 120×240 대표점에서 0.5개 구형 타일 이내 |
| 규칙 통합 | 이동력·공격/방어·정찰·군수 반영, 포병 원거리 공격과 점령 제한, 방공 자동방어 역할 유지 |
| 기본값·기존 시스템 | 공개 육군 55개가 새 게임 기본값; 기존 적군·시설·목표 내용 동일, 가상 편제 34개는 선택형으로 유지 |
| 저장 호환 | 기존 ↔ 육군 시나리오 양방향 불러오기, 다음 턴 결정성, 이동 위치 보존 |
| 손상 저장 | 위조 편제 ID·스탯·이름, 중복 유닛, 잘못된 데이터 버전·시설 변경 거부; 상태 교체 원자성 확인 |
| Chromium UI | 직전 육군 확장 검증에서는 1440×1000, 412×915, 915×412를 통과. 이번 240×480 변경 후 재실행은 설치된 Chromium 실행 파일 부재로 브라우저 시작 전에 중단 |
| 육군 UI | 기본 시작 버튼·가상 편제 호환 버튼·새 시나리오 기본값을 회귀 테스트에 반영; 브라우저 재검증은 위 제한 적용 |
| 오프라인 HTML | 최신 정본으로 재생성하고 240×480 표기·기본 육군 시작 코드를 확인; `file://` 동적 재검증은 위 제한 적용 |
| Android Gradle 빌드·lint 재검증 | 실행 시도했으나 로컬 캐시에 AGP 8.9.2 플러그인이 없어 오프라인 의존성 해석 단계에서 실패. 이번 변경의 APK 빌드·lint 통과를 주장하지 않음 |
| 실제 Android 기기/에뮬레이터 | 이번 작업에서 수행하지 않음 |

브라우저의 모바일 화면 검증은 Android OS 실기기 검증과 다르다. 기존 Android Java·매니페스트·권한·서명 설정은 수정하지 않았다. 기존 `downloads/peninsula-2026-debug.apk`는 보존했다. 구형 HTML과 무버전 육군 HTML은 제거했고, 현재 실행 파일은 `downloads/peninsula-2026-v2.html`이다. 기존 APK에는 이번 데이터 확장이 들어 있지 않으며 정상적인 Gradle 의존성 환경에서 다시 빌드해야 한다.

부대별 공개 사실의 검증 수준과 게임 규칙 검증은 다르다. 테스트 통과는 실제 편제·현행 배치의 진위를 공식 인증하지 않는다. 특히 102기갑여단은 상급 게임 권역으로 임시 배정했고, 다수 항목은 2차 자료에 기반한다. 자세한 범위는 [ARMY-DATA.md](ARMY-DATA.md)를 따른다. 장기 캠페인 난이도 조정은 아직 수행하지 않았다.

재현 명령:

```sh
npm test
npm run standalone
# Playwright 및 Chromium이 있는 환경에서:
node tests/ui-smoke.cjs
# 시스템 Chromium을 지정하려면 PENINSULA_CHROMIUM,
# 설치된 Playwright 모듈을 지정하려면 PENINSULA_PLAYWRIGHT_MODULE 사용.
./gradlew assembleDebug lintDebug
```

## 변경 파일

추가: `data/rok-army.json`, `army-data.js`, `army.js`(모두 `app/src/main/assets/game/` 아래), 같은 경로의 여단·포병 SVG 6개, `tools/build-army-data.py`, `tests/army.test.mjs`, `docs/ARMY-DATA.md`, `docs/ARMY-STATS.md`, 이 검증 기록, `downloads/peninsula-2026-v2.html`.

수정: `app/src/main/assets/game/engine.js`, `ui.js`, `style.css`, `tools/build-standalone.py`, `tests/ui-smoke.cjs`, `package.json`, `README.md`. 기존 단위 테스트와 Android 소스는 유지했다. 변경 전부터 존재하던 `test-engine.log`는 수정하지 않았다.

## v2 HTML 배포 수정

원인: 기본 README 링크가 갱신되지 않은 120×240 HTML을 가리켰고, 생성기는 별도 army HTML만 갱신했다. 배포 파일을 `peninsula-2026-v2.html`로 통일하고 무버전 HTML 두 개를 삭제했다. 제목·상단 표시에도 v2를 넣었다. 최종 번들의 실제 Game을 실행해 240열·480행·115,200타일과 기본 육군 55개를 검사하는 회귀 테스트를 추가했다. 120×240 저장을 현재 맵으로 변환하는 호환 데이터는 실행용 구버전이 아니므로 유지한다.
