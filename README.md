# jngflame.com

React 19, TypeScript, Vite, Tailwind CSS 4로 구현한 개인 웹사이트입니다.

## 실행

```sh
npm ci
npm run dev
```

## 페이지

| 페이지 | 경로 |
| --- | --- |
| Index | `/` |
| Articles | `/articles` |
| Inventory | `/inventory` |
| Article Detail | `/articles/egypt-to-jordan` |

내비게이션은 새로고침 없이 이동하며, 상세 페이지 직접 접속과 브라우저 뒤로 가기도 지원합니다. 기존 Nginx 설정의 SPA fallback을 사용합니다.

## 디자인과 콘텐츠

- [Figma 원본](https://www.figma.com/design/ou4c7XwgArYcAFkkTuLpPD/jngflame.com?node-id=142-292)의 모바일 디자인을 기준으로 구현했습니다. 기기 상태 표시줄은 웹 페이지에 포함하지 않았습니다.
- 사진, 아이콘과 Inventory 이미지 16개는 `public`의 원본 에셋을 사용합니다. 그림자는 Figma의 점진적 흐림 효과를 포함한 해당 레이어의 PNG export입니다.
- 구름은 Figma가 제공한 셰이더 소스와 설정을 그대로 사용합니다. 연결 도구가 Figma 런타임 리소스를 제공하지 않아 `CloudSky`에서 WebGPU 캔버스를 연결했습니다. WebGPU가 없거나 GPU를 사용할 수 없는 환경에서는 파란색 배경을 표시합니다.
- 다국어는 `react-i18next`를 사용합니다. 소개, 메뉴, 버튼, 이미지 설명과 페이지 제목을 한국어/영어로 전환합니다. 원본 한국어 글은 그대로 유지합니다.
- Figma에 본문이 제공된 첫 번째 글만 상세 페이지로 연결합니다. 나머지 목록 항목은 원본처럼 표시합니다. 상세 본문의 사진 파일명도 Figma 원문을 유지하며, 실제 글 사진은 아직 제공되지 않았습니다.
- Inventory 이미지는 클릭하면 확대되고, Close 또는 Escape로 닫힙니다.

## 3D 캐릭터

- Hero는 Three.js로 `public/outdoor.glb`의 스켈레톤과 텍스처를 렌더링합니다. 기존 PNG 캐릭터 대신 실제 3D 모델을 사용합니다.
- 기본 동작은 `idle`입니다. 오른쪽 위 동작 버튼을 누르면 모델에 들어 있는 모든 애니메이션(현재 79개)을 선택하고 재생·일시정지·다시 재생할 수 있습니다. 소개, 글, 수집함 페이지에서 사용할 수 있습니다.
- 동작 목록은 GLB에서 읽으며, 이름은 한국어/영어로 표시합니다. 동작 사이를 부드럽게 전환하고, 이동 동작은 화면 가운데 유지하며 팔다리가 화면 안에 들어오도록 화면 범위를 조절합니다.
- 캐릭터를 마우스나 손가락으로 좌우로 끌면 360도 회전합니다. 애니메이션 재생·일시정지 중에도 사용할 수 있고, 모바일의 세로 스크롤도 지원합니다. 키보드 좌우 방향키로 회전하고, Home·Enter 또는 두 번 클릭으로 정면을 복원합니다.
- 화면 밖이나 숨겨진 탭에서는 재생을 멈춥니다. 동작 줄이기 설정에서는 초기 애니메이션을 정지하고, 동작을 직접 선택하거나 재생했을 때만 움직입니다.
- 모델 로딩과 오류 안내는 한국어/영어를 지원합니다. 모델을 불러오기 전에는 동작 버튼을 비활성화합니다.
- 구현: `src/components/AvatarModel.tsx`. 모델은 별도로 요청하며 Three.js 코드는 필요할 때 로드합니다.

## 다국어 설정

- 초기화: `src/i18n.ts`
- 번역: `src/locales/en.ts`, `src/locales/ko.ts`
- 언어 감지 순서: 기존 `localStorage.locale` → 브라우저 언어 → 영어 fallback
- `ko-KR`, `en-US` 같은 지역 코드는 `ko`, `en`으로 처리합니다.
- 선택한 언어는 자동 저장되며 새로고침과 페이지 이동 뒤에도 유지됩니다.
- 컴포넌트에서는 `useTranslation()`의 `t("profile.name")`을 사용합니다. 번역 키는 TypeScript로 검사하고, 한국어 번역은 영어와 같은 키 구조를 사용합니다.
- 언어를 추가하려면 번역 파일을 만들고 `src/i18n.ts`의 `resources`, `supportedLanguages`에 등록합니다.

## 검증과 빌드

```sh
npm run check
npm run build
npm run preview
```

빌드 결과는 `dist`에 생성됩니다. Tailwind 크기 클래스는 `max-w-170`, `px-5`처럼 숫자 기반 단위를 사용합니다. Figma 에셋과 제공된 셰이더 소스는 원본 보존을 위해 Biome 검사에서 제외합니다.
