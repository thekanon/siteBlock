// 차단 페이지 JavaScript

function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    domain: params.get("domain") || "알 수 없는 사이트",
    visits: parseInt(params.get("visits")) || 0,
    time: parseInt(params.get("time")) || 0,
  };
}

function updateDisplay() {
  const params = getUrlParams();

  const domainElement = document.getElementById("domain-name");
  const visitCountElement = document.getElementById("visit-count");
  const visitTimeElement = document.getElementById("visit-time");

  if (domainElement) {
    domainElement.textContent = params.domain;
  }

  if (visitCountElement) {
    visitCountElement.textContent = params.visits + "회";
  }

  if (visitTimeElement) {
    visitTimeElement.textContent = params.time + "분";
  }
}

function updateTime() {
  const now = new Date();
  const timeString = now.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const timeElement = document.getElementById("current-time");
  if (timeElement) {
    timeElement.textContent = timeString;
  }
}

function goBack() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = "about:blank";
  }
}

function goHome() {
  // 새 탭으로 이동 (Chrome에서는 about:blank가 더 안전)
  window.location.href = "about:blank";
}

function allowTemporaryAccess() {
  const params = getUrlParams();
  const domain = params.domain;

  if (!domain || domain === "알 수 없는 사이트") {
    alert("도메인 정보를 가져올 수 없습니다.");
    return;
  }

  // 임시 허용 시간 설정 (10분)
  const allowUntil = Date.now() + 10 * 60 * 1000; // 10분 후

  // 로컬 스토리지에 임시 허용 정보 저장
  const tempAllowKey = `temp_allow_${domain}`;

  chrome.storage.local.set(
    {
      [tempAllowKey]: allowUntil,
    },
    () => {
      console.log(
        `Temporary access granted for ${domain} until`,
        new Date(allowUntil)
      );

      // 원래 사이트로 리다이렉트
      const originalUrl = `https://${domain}`;
      window.location.href = originalUrl;
    }
  );
}

function bindEvents() {
  const goBackBtn = document.getElementById("go-back-btn");
  const goHomeBtn = document.getElementById("go-home-btn");
  const allowAccessBtn = document.getElementById("allow-access-btn");

  if (goBackBtn) {
    goBackBtn.addEventListener("click", goBack);
  }

  if (goHomeBtn) {
    goHomeBtn.addEventListener("click", goHome);
  }

  if (allowAccessBtn) {
    allowAccessBtn.addEventListener("click", () => {
      // 확인 대화상자
      const confirmMessage =
        "정말로 이 사이트에 접속하시겠습니까?\n\n⚠️ 10분 후에 다시 차단됩니다.\n⏰ 이 시간은 오늘의 접속 시간에 포함됩니다.";

      if (confirm(confirmMessage)) {
        allowTemporaryAccess();
      }
    });
  }

  // ESC 키로 뒤로 가기
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      goBack();
    }
  });
}

// DOM 로드 완료 후 초기화
document.addEventListener("DOMContentLoaded", () => {
  console.log("Block page loaded");

  // 화면 업데이트
  updateDisplay();
  updateTime();

  // 이벤트 바인딩
  bindEvents();

  // 1초마다 시간 업데이트
  setInterval(updateTime, 1000);

  // 선택사항: 5초 후 자동으로 뒤로 가기
  // setTimeout(() => {
  //   goBack();
  // }, 5000);
});
