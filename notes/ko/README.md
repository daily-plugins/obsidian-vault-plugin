# Vault

Obsidian이나 다른 로컬 기반 파일 저장소에 접근할 수 있는 MCP 호환 플러그인입니다.

핵심 도구는 선택한 폴더 하나의 저장된 Markdown을 검색·읽기·생성·편집합니다.
모든 도구는 로컬 파일시스템을 사용하며 데스크톱 앱, 앱 CLI, 화면 캡처가 필요하지 않습니다.
설정 도구는 로컬에서 지정한 숨김 폴더의 허용된 JSON 파일을 조회합니다. 독립 프로젝트입니다.

저장소: [daily-plugins/Vault](https://github.com/daily-plugins/Vault).

## 현재 상태

- TypeScript와 MCP SDK로 구현한 stdio 및 인증된 Streamable HTTP MCP 전송 방식
- 디렉터리 검증을 포함한 환경 변수 기반 단일 Vault 설정
- `get_vault_context`: Vault ID와 현재 구현된 기능 반환
- `search_notes`: Markdown 경로와 내용에서 대소문자를 구분하지 않는 리터럴 검색
- `read_note`: SHA-256 리비전을 포함한 페이지 단위 UTF-8 Markdown 읽기
- `create_note`, `patch_note`: 미리보기 우선 노트 생성 및 백업을 포함한 리비전 검사 기반 편집
- Vault 상대 경로 검증, 제외 규칙, 링크 거부
- 제한된 파일 트리, 적용 범위별 지침 검색, 허용 목록 기반 설정 조회
- 공식 출처를 포함한 에이전트용 [도구 가이드](docs/tools.md)
- 개발용 플러그인 매니페스트

비공개 ChatGPT 터널 실행 스크립트를 제공합니다. [ChatGPT 연결](docs/chatgpt-connection.md)을 참고하세요.
실제 계정 연결에는 터널 ID, 런타임 키, 개발자 모드 접근 권한이 필요합니다.
패키지에 포함되는 MCP 연결 설정과 공개 배포는 아직 구현하지 않았습니다.
매니페스트는 패키지의 기본 골격이며 완성된 설치형 플러그인은 아닙니다.
서버는 설정한 경로가 접근 가능한 디렉터리인지 확인하지만 Vault인지는 자동 검증하지 않습니다.

## 연결 방식 선택

| 방식 | 실행 명령 | 설정 | 가이드 |
| --- | --- | --- | --- |
| OpenAI 비공개 터널 | `npm run start:tunnel` | `.env` + `.env.tunnel` | [터널 설정](docs/tunnel-connection.md) |
| Streamable HTTP | `npm run start:http` | `.env` + `.env.http` | [HTTP 설정](docs/http-connection.md) |
| 로컬 stdio | `npm run start:stdio` | `.env` | 아래 시작하기 |

클라이언트에서 방식을 선택하고 해당 명령을 실행하세요. 터널과 HTTP는 같은 도구를 제공합니다. HTTP에는 Bearer 인증을 지원하는 클라이언트가 필요하며, 공개 ChatGPT HTTP 접근에는 호환되는 인증 HTTPS 게이트웨이가 추가로 필요합니다.
[English documentation](../../README.md)

## 시작하기

Node.js 20.20 이상이 필요합니다.

```sh
npm ci
cp .env.example .env
# Set VAULT_PATH in .env to your Vault's absolute path
npm run typecheck
npm run build
npm start
```

개발에는 `npm run dev`를 사용합니다. 모든 명령은 프로젝트 루트에서 실행하세요.
`npm start`의 기본 방식은 stdio입니다. stdio 서버는 MCP 클라이언트의 요청을 기다리며 웹 페이지나 HTTP 포트를 열지 않습니다.
표준 출력은 MCP 프로토콜 전용입니다. 진단 로그는 표준 오류로 출력합니다.

로컬 MCP Inspector로 연결하려면 다음을 실행합니다.

```sh
npm run build
npx @modelcontextprotocol/inspector node --env-file=.env dist/index.js
```

터미널에 출력된 Inspector URL 전체를 `MCP_PROXY_AUTH_TOKEN` 쿼리 매개변수까지 포함해 여세요. `http://localhost:6274`만 열면 브라우저 인증이 누락될 수 있습니다. 프록시 세션 토큰 관련 연결 오류가 나오면 Inspector의 **Configuration**을 펼치고 현재 터미널의 **Session token**을 **Proxy Session Token**에 붙여 넣은 뒤 다시 연결하세요. 이는 OpenAI API 키가 아닌 로컬 Inspector 토큰입니다. 비공개로 보관하고 Inspector 재시작 후에는 새 토큰을 사용하세요.

`.env`와 실제 Vault 내용은 Git에 넣지 마세요. 현재 서버 자체에는 OpenAI API 키가 필요하지 않습니다. Secure MCP Tunnel 런타임 키는 Git에서 제외되는 `.env.tunnel`에 별도로 관리합니다.

ChatGPT는 [연결 가이드](docs/chatgpt-connection.md)에 따라 `npm run tunnel:init`, `npm run tunnel:doctor`, `npm run remote`를 사용합니다. remote 명령은 OpenAI 공식 터널 클라이언트를 통해 로컬 에이전트를 계속 실행합니다.

## 구현 방식

파일 도구는 Node.js 파일시스템 API를 직접 사용합니다. 디스크에 저장된 파일만 보이며 저장하지 않은 편집기 버퍼, 해석된 백링크, 플러그인 상태는 제공하지 않습니다. `create_note`와 `patch_note`는 `dryRun=false`일 때만 저장된 Markdown을 수정합니다. 셸, 앱 CLI, 이미지 캡처 도구는 노출하지 않습니다.

## 도구 사용

다시 빌드한 뒤 Inspector 연결을 끊고 재연결한 다음 **Tools → List Tools**를 선택합니다. 실행 중인 서버 프로세스는 새 빌드를 자동으로 읽지 않습니다.

`search_notes`로 검색합니다.

```json
{"query": "OPIC", "folder": "", "limit": 20}
```

`folder`는 선택 사항인 Vault 상대 디렉터리입니다. 유니코드 정규화를 적용한 대소문자 무시 리터럴 검색입니다. 태그와 frontmatter도 일반 텍스트로 검색합니다. 각 결과에는 상대 `path`, 일치하는 한 줄·스니펫, `revision`이 포함됩니다. 결과는 관련도순이 아닌 파일시스템 순회 순서입니다. 내용 일치 시 `line`은 1부터 시작하며 경로만 일치하면 null입니다.

반환된 경로를 `read_note`로 읽습니다. 예제 경로는 실제 결과로 바꾸세요.

```json
{"path": "Study/English.md", "offset": 0, "maxChars": 20000}
```

`nextOffset`이 null이 될 때까지 반환된 값을 전달해 다음 페이지를 읽습니다. 오프셋은 UTF-16 코드 단위이므로 직접 계산하지 마세요. 페이지 사이에 리비전이 바뀌면 서로 다른 버전이 섞이지 않도록 처음부터 다시 읽습니다.

필요하면 `.env`에서 표시되는 폴더나 파일을 제외합니다.

```dotenv
VAULT_EXCLUDED_PATHS='["Private", "Journal/personal.md"]'
```

설정 변경 후 서버를 재시작하세요. 제외 규칙은 읽기와 검색에 적용됩니다. 숨김 경로 요소(`.obsidian`, `.git`, `.trash` 포함), `node_modules`, 심볼릭 링크, 하드 링크된 노트는 항상 거부됩니다. `/` 구분자와 검색에서 반환한 정확한 경로를 사용하세요. 절대 경로, `..`, `.` 경로 요소는 거부됩니다.

## Vault 파일 트리

`{"folder": "", "maxDepth": 4, "maxEntries": 200}`으로 `get_vault_tree`를 호출합니다.
사람이 읽을 수 있는 `tree`와 구조화된 상대 경로 `entries`를 반환합니다. 표시 가능한 첨부 파일 이름은 포함하지만 내용은 읽지 않습니다. 깊이 제한에 도달한 디렉터리는 펼치지 않습니다. 깊이·항목·스캔 제한 중 하나라도 걸리면 `truncated`로 표시합니다. 특정 `folder`로 다시 호출해 하위 트리를 확인하세요. 숨김 경로, 제외 경로, 심볼릭 링크, 하드 링크 파일에는 접근할 수 없습니다.

## 지침 검색과 적용 범위

`list_instruction_files`는 `AGENTS.md`, `CLAUDE.md`, `INSTRUCTIONS.md`를 찾습니다. 대소문자를 구분하지 않으므로 `Agents.md`도 포함합니다. 다른 Markdown 파일 이름을 추적하려면 `filenames`를 전달합니다. 결과에는 디렉터리 적용 범위와 SHA-256 리비전이 포함됩니다. 완전한 스캔끼리 `snapshotRevision`과 파일별 리비전을 비교해 변경을 추적합니다. 지속적인 감시나 자동 실행 기능은 없습니다.

```json
{"folder": "", "filenames": ["AGENTS.md", "CLAUDE.md", "INSTRUCTIONS.md"], "limit": 100}
```

`get_applicable_instructions`는 대상 노트에 대해 루트부터 상위 폴더까지의 지침을 반환합니다.

```json
{"path": "Study/English/new.md", "targetType": "file"}
```

폴더에는 `targetType: "directory"`를 사용합니다. 상위 폴더가 존재하면 생성 예정 파일도 지원합니다. 루트 범위부터 가장 깊은 범위 순으로, 같은 범위 안에서는 이름순으로 반환합니다. 충돌하는 지침을 병합하거나 사용자·호스트 지침보다 우선시키지 않습니다. 이 범위 규칙은 앱 자체 기능이 아닌 프로젝트 규칙입니다.

내용은 파일당 20,000자, 응답당 40,000자로 제한합니다. `read_note`와 반환된 `nextOffset`으로 개별 파일의 나머지를 읽습니다. `truncated`, `skippedFiles`, `incompleteScopes`는 검색·내용이 불완전함을 뜻합니다. 불완전한 결과에서 지침이 없거나 삭제됐다고 추론하지 마세요.

## Vault 설정 조회

`{}`로 `list_settings`를 호출해 지원 설정 파일을 확인하고 `{"file": "settings.json"}`으로 `read_settings`를 호출해 하나를 읽습니다. 선택적 `key`는 민감정보 가림 처리 후 최상위 JSON 속성 또는 배열 인덱스를 선택합니다.

이는 숨김 파일 정책의 제한적인 예외입니다. 설정된 Vault 설정 폴더의 허용된 JSON 파일만 읽습니다. `read_note`와 트리 검색으로는 여전히 숨김 폴더에 접근할 수 없습니다. `VAULT_CONFIG_DIR`에는 선택한 루트 안의 숨김 폴더 하나를 지정합니다. 기본값은 `.vault`입니다.

파일 이름 목록에는 `settings.json`과 `app.json`, `graph.json`, `workspace.json` 같은 호환성 이름이 포함됩니다. 앱 스키마를 가정하지 않습니다. 중첩된 플러그인 데이터와 전역 앱 폴더에는 접근하지 않습니다. 알려진 비밀 키·값, 인증 정보가 들어 있는 URL, 절대 경로를 가립니다. 가림은 최선의 노력 수준이며 임의의 모든 비밀을 확실히 찾을 수는 없습니다.

파일은 1 MiB로 제한하며 중첩 깊이, 컬렉션 크기, 긴 문자열, 응답 크기도 제한합니다. `truncated`인 결과는 불완전합니다. 설정 파일 이름·필드는 버전에 따른 호환성 세부사항이며 안정된 공식 JSON 스키마가 아닙니다. 설정 파일이 없으면 기본값 사용을 뜻할 수도 있고 디스크 상태가 메모리 상태보다 늦을 수도 있습니다.

## 제한과 검증

- 대문자 `.MD`를 포함한 일반 UTF-8 `.md` 파일만 지원합니다.
- 1 MiB보다 큰 파일은 거부합니다. 읽기 페이지는 최대 20,000 UTF-16 코드 단위입니다.
- 검색은 최대 50개 결과(기본 20개), 2,000개 노트, 10,000개 디렉터리 항목을 확인하며 약 20 MiB의 노트 내용을 읽으면 중단합니다.
- `truncated: true`는 결과 또는 스캔 제한으로 검색이 중단됐다는 뜻이며 추가 일치 항목의 존재를 보장하지 않습니다. 폴더나 검색어를 좁혀 재시도하세요.
- `skippedFiles`는 읽을 수 없거나 거부된 노트·디렉터리 수입니다. 의도적으로 필터링한 숨김·제외 경로와 심볼릭 링크 항목은 세지 않습니다.
- 도구 응답에 절대 경로가 노출되지 않도록 파일시스템 오류를 정리합니다.

`npm run typecheck`와 `npm test`를 실행합니다. 테스트는 Vault 바깥을 가리키는 링크를 포함한 임시 테스트 Vault를 사용하며 개인 노트를 읽거나 수정하지 않습니다.

경로 검사와 링크를 따르지 않는 파일 열기는 일반적인 로컬 사용을 보호합니다. 상위 디렉터리를 교체하려고 경합하는 악의적인 로컬 프로세스에 대한 OS 샌드박스는 아닙니다. Vault는 신뢰할 수 있는 로컬 관리 아래에 두고, 신뢰하지 않는 로컬 쓰기 주체나 공개 서비스를 지원하기 전에 OS 격리를 사용하세요. 현재 검증 환경은 macOS입니다.

## 에이전트용 문서

도구 메타데이터는 목적, 입력, 결과, 제한, 부수 효과를 설명합니다. 전체 [도구 가이드](docs/tools.md)는 프로젝트의 파일시스템 규칙과 지침 검토 절차를 설명합니다. MCP 클라이언트는 Resources에서 `vault://docs/tools`로 찾을 수 있습니다.

## 프로젝트 구조

```text
.codex-plugin/plugin.json  Development package metadata
src/config.ts             Local Vault configuration
src/server.ts             MCP tool registration
src/vault.ts              Bounded file reads, search, tree, and path validation
src/instructions.ts       Instruction discovery and ancestor scope
src/settings.ts           Allowlisted JSON settings and redaction
src/settings-files.ts     Supported settings file catalog
tests/vault.test.ts        File access and MCP integration tests
src/index.ts              Stdio entry point
src/http.ts               Authenticated HTTP endpoint and sessions
src/http-index.ts         HTTP entry point
docs/tunnel-connection.md  Tunnel configuration and startup
docs/http-connection.md    HTTP configuration and startup
notes/ko/                 Korean translations mirroring Markdown paths
docs/architecture.md      Architecture and implementation roadmap
docs/tools.md             Agent-facing semantics and official references
.env.example              Example local configuration
```

## 공식 문서

- [MCP 서버 만들기](https://developers.openai.com/plugins/build/mcp-server)
- [플러그인 패키징](https://developers.openai.com/plugins/build/plugins)
- [ChatGPT 연결과 테스트](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [공개 제출](https://developers.openai.com/plugins/deploy/submission)

## 노트 생성과 편집

대상을 편집하기 전에 `get_applicable_instructions`를 사용합니다. `create_note`는 `path`, `content`, `reviewToken`, `dryRun`(기본 true)을 받습니다. `patch_note`는 `path`, `reviewToken`, `read_note`에서 받은 `expectedRevision`, 한 번만 일치하는 리터럴 `oldText`, `newText`, `dryRun`(기본 true)을 받습니다. 사용자 요청을 적용할 때 `dryRun:false`로 설정합니다. 생성은 덮어쓰지 않습니다. 편집은 오래된 리비전과 모호한 일치를 거부하고 나머지 텍스트를 보존하며 같은 폴더에 숨김 백업을 남깁니다. 파일은 UTF-8 기준 1 MiB 이내여야 하며 상위 디렉터리가 존재해야 합니다. 설정은 계속 읽기 전용입니다.

이 도구는 파일시스템 API를 사용하므로 저장하지 않은 앱 버퍼나 외부 편집기와 조정할 수 없습니다. 동시성 제한, 백업 보관, 수동 복구는 [도구 가이드](docs/tools.md#patch_note)를 참고하세요. 업그레이드 후 MCP·터널 프로세스를 재시작하고 클라이언트에서 도구를 갱신한 뒤 새 대화를 사용합니다.

쓰기에는 정확한 대상 파일에 대한 완전한 `get_applicable_instructions` 호출에서 받은 새로운 `reviewToken`이 필요합니다. 서버는 해당 범위의 AGENTS.md/CLAUDE.md/INSTRUCTIONS.md 지침이 바뀌지 않았는지 확인하고 검토 누락·만료를 거부하며 쓰기 적용 후 토큰을 소모합니다. 편집 전 지침 조회를 강제하지만 에이전트가 내용을 이해했는지까지 입증하지는 못합니다.

## 지침 파일 추가

`create_instruction_file`로 `AGENTS.md`, `CLAUDE.md`, `INSTRUCTIONS.md`를 새로 만듭니다. 대상 `path`에 대해 `get_applicable_instructions`를 먼저 호출하고 반환된 `reviewToken`과 전체 `content`를 전달합니다. 기본값은 미리보기이며 `dryRun:false`로 적용합니다. 기존 지침 파일 수정은 `read_note`와 `patch_note`를 사용하세요. 생성 한도와 적용 범위는 [도구 가이드](docs/tools.md#create_instruction_file)를 참고하세요.

## 0.2로 업그레이드

`capture_graph_view`와 CLI 연동을 제거했습니다. 설정 조회에는 `list_settings`, `read_settings`를 사용합니다. 기존 앱 이름이 포함된 도구는 더 이상 등록하지 않습니다. 도구 가이드 리소스는 `vault://docs/tools`입니다. 재빌드 후 stdio·HTTP·터널 프로세스를 재시작하고 클라이언트 메타데이터를 갱신한 뒤 새 세션을 시작하세요.

새 로컬 설정은 `VAULT_PATH`, `VAULT_ID`, `VAULT_EXCLUDED_PATHS`, `VAULT_CONFIG_DIR`(기본 `.vault`)를 사용합니다. 이전 설정 키는 대체값으로 계속 읽습니다. 이전 루트 설정만 사용하는 경우 설정 폴더의 기존 기본값을 유지합니다. 기존 설정을 이전할 때는 설정 폴더를 명시하세요. 숨김 백업·잠금 파일 이름은 이전 프로세스와 같은 쓰기 잠금을 사용하도록 유지합니다. 기존 그래프 CLI 변수는 사용하지 않습니다.

HTTP와 터널 설정도 `VAULT_HTTP_*`, `VAULT_TUNNEL_*`을 사용합니다. 이전 별칭도 인식하며 새 이름이 우선합니다. 터널 프로필 기본값은 `vault`입니다. 기존 프로필 이름을 유지하거나 새 이름으로 `npm run tunnel:init`을 실행하세요. `.env` 파일은 저장소에 올리지 않습니다.
