// 콘텐츠 스크립트 - 페이지와 상호작용
(function () {
  "use strict";

  console.log("Content script loaded for:", window.location.hostname);

  // 페이지 로드 시점 기록
  const pageLoadTime = Date.now();
  let isBlocked = false;
  let checkTimeout;

  // 현재 도메인 확인
  let currentDomain = window.location.hostname.toLowerCase();
  if (currentDomain.startsWith("www.")) {
    currentDomain = currentDomain.substring(4);
  }

  // 차단 목록에서 매칭된 도메인 (기본값은 현재 도메인)
  let baseDomain = currentDomain;

  function matchBlockedSite(domain, blockedSites) {
    for (const site of blockedSites) {
      if (domain === site || domain.endsWith("." + site)) {
        return site;
      }
    }
    return null;
  }

  console.log("Checking domain:", currentDomain);

  // 차단된 사이트인지 즉시 확인
  checkBlockedSite();

  // 주기적으로 차단 상태 확인 (네트워크 지연 대비)
  function recheckBlocking() {
    if (!isBlocked) {
      checkBlockedSite();
      checkTimeout = setTimeout(recheckBlocking, 500);
    }
  }

  setTimeout(recheckBlocking, 100);

  function checkBlockedSite() {
    chrome.storage.sync.get(["blockedSites"], (result) => {
      const blockedSites = result.blockedSites || [];
      console.log("Blocked sites from storage:", blockedSites);
      console.log("Current domain:", currentDomain);

      const matched = matchBlockedSite(currentDomain, blockedSites);
      if (matched) {
        baseDomain = matched;
        // 임시 허용 상태 확인
        checkTemporaryAllow(baseDomain).then((isAllowed) => {
          if (isAllowed) {
            console.log("Site temporarily allowed:", currentDomain);
            return;
          }

          console.log("Site is blocked!");
          isBlocked = true;

          // 타이머 정리
          if (checkTimeout) {
            clearTimeout(checkTimeout);
          }

          // 이미 차단 페이지가 아닌 경우에만 처리
          if (!window.location.href.includes("block-page.html")) {
            blockCurrentPage();
          }
        });
      }
    });
  }

  function checkTemporaryAllow(domain) {
    return new Promise((resolve) => {
      const tempAllowKey = `temp_allow_${domain}`;

      chrome.storage.local.get([tempAllowKey], (result) => {
        const allowUntil = result[tempAllowKey];

        if (allowUntil && Date.now() < allowUntil) {
          const remainingMinutes = Math.ceil(
            (allowUntil - Date.now()) / (1000 * 60)
          );
          console.log(
            `Content script: Site ${currentDomain} temporarily allowed for ${remainingMinutes} more minutes`
          );
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }

  function blockCurrentPage() {
    console.log("Blocking current page...");

    // 방문 기록
    recordVisit(baseDomain);

    // 페이지 로딩 중단
    try {
      window.stop();
    } catch (e) {
      console.log("Could not stop page loading:", e);
    }

    // 즉시 차단 페이지로 리다이렉트
    redirectToBlockPage();
  }

  function redirectToBlockPage() {
    // 통계 가져오기
    getTodayStats(baseDomain).then((stats) => {
      const blockPageUrl = chrome.runtime.getURL(
        `block-page.html?domain=${encodeURIComponent(currentDomain)}&visits=${
          stats.visits
        }&time=${stats.time}`
      );

      console.log("Redirecting to block page:", blockPageUrl);

      // 즉시 리다이렉트
      window.location.replace(blockPageUrl);
    });
  }

  function recordVisit(domain) {
    const today = new Date().toISOString().split("T")[0];
    const visitKey = `visits_${domain}_${today}`;

    chrome.storage.local.get([visitKey], (result) => {
      const currentVisits = result[visitKey] || 0;
      chrome.storage.local.set({
        [visitKey]: currentVisits + 1,
      });
      console.log("Recorded visit for:", domain);
    });
  }

  function getTodayStats(domain) {
    return new Promise((resolve) => {
      const today = new Date().toISOString().split("T")[0];
      const visitKey = `visits_${domain}_${today}`;
      const timeKey = `time_${domain}_${today}`;

      chrome.storage.local.get([visitKey, timeKey], (result) => {
        const visits = result[visitKey] || 0;
        const timeMs = result[timeKey] || 0;
        const timeMinutes = Math.round(timeMs / 1000 / 60);

        resolve({ visits, time: timeMinutes });
      });
    });
  }

  // 페이지 언로드 시 시간 기록 (차단되지 않은 경우만)
  window.addEventListener("beforeunload", () => {
    if (!isBlocked) {
      const timeSpent = Date.now() - pageLoadTime;
      const today = new Date().toISOString().split("T")[0];
      const timeKey = `time_${currentDomain}_${today}`;

      chrome.storage.local.get([timeKey], (result) => {
        const currentTime = result[timeKey] || 0;
        chrome.storage.local.set({
          [timeKey]: currentTime + timeSpent,
        });
      });
    }
  });

  // DOM 변경 감지 (동적 로딩 대비)
  const observer = new MutationObserver(() => {
    if (!isBlocked) {
      checkBlockedSite();
    }
  });

  // DOM이 로드되면 관찰 시작
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  } else {
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
