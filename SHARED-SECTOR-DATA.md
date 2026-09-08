# 공통 종목 비교 자료

GitHub Actions가 Finnhub 자료를 매시간 17분에 수집하고 `sector-peers-data.json`에 공개 가능한 비교 결과만 저장합니다. 예약 실행은 GitHub 사정에 따라 늦어질 수 있습니다. 브라우저는 공개 저장소의 raw 파일을 읽으므로 Pages 재배포 없이 새 자료를 받습니다. API 키는 결과 파일에 포함하지 않습니다.

## 최초 연결

1. 저장소 Settings → Secrets and variables → Actions에 `FINNHUB_API_KEY`라는 Repository secret을 등록합니다.
2. Actions → Update shared sector comparisons → Run workflow를 실행합니다.
3. 수집 완료 후 다른 기기에서 대시보드를 새로고침합니다.

초기 수집 대상은 양자컴퓨팅 4개, 우주·위성 7개와 LAES입니다. 추가 티커는 Run workflow의 `tickers` 입력란에 쉼표로 구분해 입력합니다. 성공적으로 수집한 티커는 이후 자동 수집에도 포함됩니다. 최대 100개이며 제공처 호출 한도와 실행 제한에 따라 조정해야 합니다. 등록되지 않은 임의 티커의 즉시 서버 조회는 지원하지 않습니다.

공통 자료가 없는 티커는 기존 개인 Finnhub 연결이 있을 때만 직접 조회합니다. 연결이 없는 기기에는 수집 대기 안내를 표시합니다. 수집 실패 시 이전 자료와 원래 조회 시각을 보존하며 지연/실패 상태를 표시합니다. 공통 자료를 받은 기기에는 개인 연결 여부와 무관하게 같은 비교 후보 자료를 제공합니다.
