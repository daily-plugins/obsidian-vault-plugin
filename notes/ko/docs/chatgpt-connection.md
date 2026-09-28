# 로컬 Vault를 ChatGPT에 연결하기

이 가이드는 비공개 터널 연결을 설명합니다. 방식별 설정과 구동 방법은 [터널](tunnel-connection.md) 또는 [HTTP](http-connection.md)를 참고하세요.

## 연결 모델

```text
ChatGPT → OpenAI Secure MCP Tunnel → tunnel-client on your Mac
                                      → local stdio MCP server → selected Vault
```

로컬 프로세스가 계속 실행 중이어야 합니다. 파일 작업은 사용자 컴퓨터에서 실행되며, 요청한 노트 내용과 도구 결과는 ChatGPT로 전달됩니다. 로컬 HTTP 서버, 공유기 포트 포워딩, 공개 인바운드 리스너는 필요하지 않습니다.

[Desktop Commander Remote MCP](https://github.com/wonderwhy-er/DesktopCommanderMCP#chatgpt--claude-web-remote-mcp)의 로컬 기기 사용 방식과 유사합니다. Desktop Commander는 자체 원격 서비스와 브라우저 인증을 사용합니다. 이 프로젝트는 OpenAI 터널 서비스와 런타임 키를 사용합니다. Desktop Commander 서비스에 등록하거나 해당 기기 페어링·OAuth 흐름을 구현하지 않습니다. 이 프로젝트의 Vault 도구만 노출하며 임의 셸 도구는 없습니다.

## 1. 계정과 터널 클라이언트 준비

공식 [Secure MCP Tunnel 가이드](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)를 따르세요.

1. [Platform 터널 설정](https://platform.openai.com/settings/organization/tunnels)을 엽니다.
2. 터널을 만들고 사용할 Platform 조직과 ChatGPT 워크스페이스를 연결합니다. `tunnel_id`를 로컬에 저장합니다.
3. 해당 터널을 사용할 권한이 있는 런타임 API 키를 발급받습니다. 터널 생성에는 Tunnels Read + Manage, 실행·선택에는 Read + Use 권한이 필요합니다.
4. Platform 설정의 다운로드 링크 또는 공식 가이드의 최신 릴리스 링크에서 macOS 클라이언트를 다운로드합니다. 실행 파일을 PATH에 설치하거나 아래의 `TUNNEL_CLIENT_PATH`를 설정합니다. `tunnel-client help quickstart`로 확인합니다.
5. ChatGPT에서 Settings → Security and login → Developer mode를 활성화합니다. 사용 가능 여부는 계정·워크스페이스 정책에 따라 달라지며 Platform 권한과는 별개입니다.

실행기는 macOS/Linux를 지원합니다. 소프트웨어 설치, 원격 터널 생성, 권한 부여, 계정 인증을 자동 수행하지 않습니다.

## 2. 로컬 저장소 설정

의존성을 설치하고 `.env`가 Vault를 가리키도록 설정한 상태에서 저장소 루트에서 실행합니다.

```sh
npm run build
cp .env.tunnel.example .env.tunnel
chmod 600 .env.tunnel
```

예제 파일은 최초 설정 때만 복사하고 기존 `.env.tunnel`은 유지하세요. 로컬에서 편집합니다.

```dotenv
OBSIDIAN_TUNNEL_ID=tunnel_REPLACE_WITH_YOUR_ID
CONTROL_PLANE_API_KEY=REPLACE_WITH_YOUR_RUNTIME_KEY
OBSIDIAN_TUNNEL_PROFILE=obsidian-vault
# TUNNEL_CLIENT_PATH=/absolute/path/to/tunnel-client
```

런타임 키는 MCP Inspector 세션 토큰과 다릅니다. 대화에 붙여 넣거나 커밋하지 마세요. `.env.tunnel`은 Git에서 제외됩니다. 셸 환경 변수가 파일 값보다 우선합니다. Vault 설정은 계속 `.env`에 둡니다.

## 3. 초기화와 실행

```sh
npm run tunnel:init
npm run tunnel:doctor
npm run remote
```

`tunnel:init`은 터널 ID, 현재 Node 실행 파일, `.env` 및 서버의 절대 경로로 공식 `sample_mcp_stdio_local` 프로필 초기화기를 호출합니다. 공식 클라이언트가 프로젝트 소스 외부에서 프로필을 관리합니다. 키는 명령줄 인수가 아닌 프로세스 환경 변수로 전달합니다.
`tunnel:doctor`는 `--explain`으로 공식 진단 명령을 호출합니다.
`remote`는 클라이언트를 포그라운드에서 실행하며, 클라이언트가 stdio 서버를 시작합니다. 별도 `npm start`는 필요하지 않습니다. Ctrl+C로 종료합니다.

다른 터널과 충돌하지 않도록 전용 프로필 이름을 사용하세요. 저장소 위치, Node 설치 위치, 터널 ID를 바꾸면 프로필을 다시 초기화합니다. Vault 설정을 바꾸려면 클라이언트를 중지하고 `.env`를 편집한 뒤 재시작합니다. 코드 변경 후에는 중지·빌드·재시작합니다. 도구 메타데이터가 바뀌면 ChatGPT 연결도 갱신하고 새 대화를 시작하세요.

## 4. ChatGPT에서 연결

공식 [연결 가이드](https://developers.openai.com/plugins/deploy/connect-chatgpt)에 따라 진행합니다.

1. `npm run remote`를 실행하고 터널이 정상 연결된 상태로 유지합니다.
2. [ChatGPT Plugins](https://chatgpt.com/plugins)를 열고 더하기 버튼을 선택합니다.
3. 이름은 **Vault**, 설명은 **선택한 로컬 Vault를 검색하고 조회합니다.** 등으로 입력합니다.
4. **Connection → Tunnel**을 선택하고 터널을 선택하거나 ID를 입력합니다.
5. 연결을 생성하고 검색된 도구를 확인합니다.
6. 새 대화를 시작하고 도구 메뉴에서 해당 연결을 활성화합니다.

Inspector URL(`localhost:6274`)을 MCP 엔드포인트로 입력하지 마세요. 로컬 테스트 인터페이스이며, 이 연결의 서버는 HTTP가 아닌 stdio를 사용합니다.

## 5. 실제 연결 검증

작은 요청부터 시작하고 표시되는 도구 호출을 확인합니다.

| 요청 | 예상 도구 |
| --- | --- |
| 연결된 Vault와 지원 기능을 알려줘. | `get_vault_context` |
| Vault 트리를 깊이 2, 최대 30개 항목으로 보여줘. | `get_vault_tree` |
| 노트에서 알고 있는 문구를 검색해줘. | `search_notes` |
| 해당 검색 결과 중 하나를 읽어줘. | `read_note` |
| Vault에서 AGENTS.md 지침을 찾아줘. | `list_instruction_files` |
| 조회 가능한 앱 설정 파일 목록을 보여줘. | `list_settings` |

[도구 가이드](tools.md)에 10개 도구를 모두 설명했습니다.

## 문제 해결과 수명 주기

- **클라이언트를 찾지 못함:** 공식 실행 파일을 설치하고 PATH를 확인하거나 `TUNNEL_CLIENT_PATH`를 실행 파일의 절대 경로로 설정합니다.
- **ChatGPT에 터널이 없음:** 워크스페이스 연결과 Tunnels Read + Use 권한을 확인합니다.
- **개발자 모드를 사용할 수 없음:** 계정·워크스페이스 정책을 확인합니다. 로컬 스크립트로 이 권한을 활성화할 수는 없습니다.
- **도구 연결 실패:** Mac을 깨워 두고 `remote`를 유지합니다. 다른 터미널에서 `npm run tunnel:doctor`를 실행합니다. 클라이언트가 출력한 주소에서 로컬 관리 UI를 확인합니다. 관리 UI는 공개하지 마세요.
- **오래된 도구:** 재빌드·재시작하고 연결을 갱신한 뒤 새 대화를 사용합니다.
- **연결 해제:** Ctrl+C로 포그라운드 클라이언트를 중지합니다. 영구적으로 종료할 때는 ChatGPT 연결을 제거하고 Platform에서 터널이나 런타임 키를 폐기·삭제합니다.

이는 비공개 개발자 모드 연결입니다. 공개 디렉터리 배포에는 별도로 설계한 공개 HTTPS MCP 엔드포인트와 인증이 필요합니다. Desktop Commander의 전체 호스팅 기기 서비스는 구현하지 않았습니다.

로컬 실행기 테스트는 가짜 터널 실행 파일과 임시 테스트 파일을 사용합니다. 실제 계정 접근, 공식 클라이언트의 명령 해석, ChatGPT 도구 검색을 입증하지는 않습니다. 전체 연동이 검증됐다고 판단하기 전에 본인의 터널로 위 확인 절차를 완료하세요.
