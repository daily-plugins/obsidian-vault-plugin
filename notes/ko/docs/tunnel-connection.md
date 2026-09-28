# 터널 연결: 설정과 구동

## 터널을 선택할 때

이 컴퓨터의 Vault에 ChatGPT에서 비공개로 접근하려면 OpenAI Secure MCP Tunnel을 선택하세요. 외부로 나가는 연결을 통해 로컬 stdio MCP 프로세스에 요청을 전달합니다. 이 프로젝트의 HTTP 서버를 시작하지 않으며 `.env.http`도 필요하지 않습니다.

## 설정 방법

1. `.env.example`을 참고해 `.env`에 Vault를 설정합니다.
2. [OpenAI 가이드](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)의 다운로드 링크에서 공식 `tunnel-client`를 설치합니다.
3. [Platform 설정](https://platform.openai.com/settings/organization/tunnels)에서 터널을 만들고 사용할 ChatGPT 워크스페이스를 연결합니다. Tunnels Read + Use 권한을 가진 런타임 API 키를 준비합니다. 생성에는 Read + Manage 권한이 필요합니다.
4. 저장소 루트에서 실행합니다.

```sh
npm ci
npm run build
cp .env.tunnel.example .env.tunnel
chmod 600 .env.tunnel
```

복사는 최초 설정 시에만 수행하세요. 로컬에서 값을 편집합니다.

```dotenv
OBSIDIAN_TUNNEL_ID=tunnel_REPLACE_WITH_YOUR_ID
CONTROL_PLANE_API_KEY=REPLACE_WITH_RUNTIME_KEY
OBSIDIAN_TUNNEL_PROFILE=obsidian-vault
TUNNEL_CLIENT_PATH=/absolute/path/to/tunnel-client
```

실행 파일이 PATH에 있으면 `TUNNEL_CLIENT_PATH`는 생략할 수 있습니다. 런타임 키는 [Platform API 키](https://platform.openai.com/settings/organization/api-keys)에서 발급합니다. HTTP 토큰 및 Inspector 프록시 토큰과는 다릅니다. 비공개로 보관하세요.

## 최초 초기화

```sh
npm run tunnel:init
npm run tunnel:doctor
```

저장소 위치, Node 설치 위치, 터널 ID를 바꾸면 다시 초기화합니다. 클라이언트는 자체 로컬 실행 프로필을 저장합니다.

## 구동과 종료 방법

```sh
npm run start:tunnel
```

`npm run remote`도 동일한 명령입니다. 프로세스를 계속 실행해 두고 Ctrl+C로 종료합니다. 별도의 `npm start`는 필요하지 않습니다. 코드를 편집한 뒤에는 다시 빌드하고 재시작합니다.

## 연결과 확인

ChatGPT 개발자 모드를 켜고 **Connection → Tunnel**로 연결을 만든 뒤 터널을 선택합니다. 변경 후에는 메타데이터를 갱신하고 새 대화를 시작합니다. 사용 가능 여부는 계정·워크스페이스 권한에 따라 달라집니다. 계정 설정, 검증, 문제 해결, 연결 해제는 상세 [ChatGPT 연결 가이드](chatgpt-connection.md)를 참고하세요. 이 방식은 비공개 연결용이며 플러그인 공개 배포에 필요한 공개 엔드포인트를 대체하지 않습니다.
