# HTTP 연결: 설정과 구동

## HTTP를 선택할 때

URL에 연결하고 Bearer 토큰을 보낼 수 있는 MCP 클라이언트에는 Streamable HTTP를 사용합니다. 기본 엔드포인트는 `http://127.0.0.1:3000/mcp`입니다. 11개 Vault 도구와 필수 지침 검토를 모두 사용할 수 있습니다. HTTP는 전송 방식이며, 클라이언트가 MCP 이미지 콘텐츠를 표시한다고 보장하지는 않습니다.

## 설정 방법

저장소 루트에서 의존성을 설치하고 `.env.example`을 참고해 공통 `.env`를 설정한 뒤 빌드합니다.

```sh
npm ci
npm run build
cp .env.http.example .env.http
chmod 600 .env.http
openssl rand -hex 32
```

복사는 최초 설정 시에만 수행하세요. 생성된 값을 `.env.http`에 넣습니다.

```dotenv
OBSIDIAN_HTTP_TOKEN=PASTE_GENERATED_TOKEN_HERE
OBSIDIAN_HTTP_HOST=127.0.0.1
OBSIDIAN_HTTP_PORT=3000
OBSIDIAN_HTTP_ALLOWED_HOSTS=127.0.0.1:3000,localhost:3000
OBSIDIAN_HTTP_ALLOWED_ORIGINS=
```

토큰은 공백 없이 최소 32자여야 합니다. 로컬에서 정하는 HTTP 인증 정보이며 OpenAI 런타임 API 키가 아닙니다. 절대 커밋하지 마세요. 실행기는 `.env` 다음 `.env.http`를 읽으며 셸 환경 변수가 우선합니다.
`ALLOWED_HOSTS`에는 수신 Host 값과 정확히 일치하는 값을 넣습니다. 기본 포트가 아니면 포트도 포함합니다. Origin 헤더가 없는 요청은 허용합니다. Origin이 있는 요청은 쉼표로 구분한 허용 목록과 정확히 일치해야 합니다. 브라우저 CORS/preflight는 구현하지 않았으므로 브라우저에서 직접 fetch하지 말고 MCP 클라이언트 백엔드를 사용하세요.

## 구동과 종료 방법

```sh
npm run start:http
```

개발 시에는 `npm run dev:http`를 사용합니다. 프로세스를 계속 실행해 두고 Ctrl+C로 종료합니다. 로컬 프로세스 기반 클라이언트에는 `npm run start:stdio`도 사용할 수 있습니다. HTTP에는 `tunnel-client`나 `.env.tunnel`이 필요하지 않습니다.

## 연결과 확인

MCP 클라이언트를 다음과 같이 설정합니다.

```text
Transport: Streamable HTTP
URL: http://127.0.0.1:3000/mcp
Authorization: Bearer <OBSIDIAN_HTTP_TOKEN>
```

헤더 설정 방식은 클라이언트마다 다릅니다. MCP Inspector의 Streamable HTTP 연결 및 인증 설정에도 같은 값을 사용하세요. 도구 목록을 불러오고 `get_vault_context`를 호출한 뒤 작은 트리 조회로 확인합니다. `/healthz`는 인증된 GET 요청을 받아 최소한의 실행 상태를 반환합니다. 호스트 앱 GUI나 전체 도구 실행을 검증하지는 않습니다.

호출 사이에 `Mcp-Session-Id`를 유지하는 MCP 지원 클라이언트를 사용하세요. 지침 검토 토큰은 세션마다 분리됩니다. 최대 32개 세션을 유지하며 비활성 세션은 30분 후 만료됩니다. 가능하면 MCP 세션 삭제로 연결을 종료하세요. 만료나 재시작 후에는 다시 초기화하고 지침도 다시 검토해야 합니다. POST 본문은 최대 8 MiB이며 개별 노트 제한은 1 MiB입니다.

## 원격 HTTP와 ChatGPT

`127.0.0.1`은 이 컴퓨터에서만 접근할 수 있습니다. 원격 클라이언트에는 접근 가능한 HTTPS 엔드포인트가 필요합니다. 신뢰할 수 있는 사설 네트워크에서는 바인딩 주소, 방화벽, 정확한 Host 허용 목록, TLS 리버스 프록시를 명시적으로 설정하세요. 앱은 전달된 Host/Origin 헤더를 자동 신뢰하지 않습니다. MCP 세션, 프로토콜 버전, Accept, Authorization 헤더를 전달하고 GET/POST/DELETE를 지원해야 합니다.

이 서버는 고정 Bearer 인증을 제공하며 OAuth 인증 서버나 검색 엔드포인트를 제공하지 않습니다. ChatGPT와 호환되는 공개 배포에는 사용자를 인증하고 이 Vault에만 접근을 제한하며 백엔드 Bearer 인증 정보를 전달하는 OAuth 지원 게이트웨이가 필요합니다. 로컬 토큰을 ChatGPT의 OAuth 입력란에 넣으면 된다고 가정하지 마세요. 공유 토큰 HTTP는 신뢰하는 단일 소유자용이며 다중 사용자 Vault 격리 기능이 아닙니다. 이 저장소만으로 공개 배포가 완성되지는 않습니다. ChatGPT의 비공개 직접 연결에는 [터널 가이드](tunnel-connection.md)를 사용하세요.

## 문제 해결

- 시작 실패: `.env`, 토큰 길이, 바인딩 주소, 포트 사용 여부를 확인합니다.
- 401: 세션 삭제를 포함한 모든 요청에 정확한 Bearer 토큰을 전달합니다.
- 403: Host/Origin 허용 목록을 확인합니다. 와일드카드는 넣지 않습니다.
- `/mcp`에서 404: 세션이 만료됐거나 알 수 없는 세션입니다. 다시 초기화합니다. 다른 경로는 제공하지 않습니다.
- 400: JSON 형식이 잘못됐거나 초기화·세션이 누락됐습니다.
- 503: 미사용 세션을 닫거나 비활성 만료를 기다립니다.
- 쓰기 차단: 같은 세션에서 새로 수행한 완전한 지침 검토를 사용합니다.
- 오래된 도구 목록: 다시 빌드하고 재시작·재연결한 뒤 클라이언트 메타데이터를 갱신합니다.

출처: [MCP 전송 방식](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [ChatGPT 연결 요구사항](https://developers.openai.com/plugins/deploy/connect-chatgpt).
