// 콘텐츠 스크립트 - 페이지와 상호작용
(function () {
  "use strict";


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

      const matched = matchBlockedSite(currentDomain, blockedSites);
      if (matched) {
        baseDomain = matched;
        // 임시 허용 상태 확인
        checkTemporaryAllow(baseDomain).then((remaining) => {
          if (remaining > 0) {
            showTempWarning(baseDomain, remaining);
            return;
          }

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
        const data = result[tempAllowKey];
        if (data) {
          let remaining = 0;
          if (typeof data === "number") {
            remaining = data - Date.now();
          } else if (typeof data.remaining === "number") {
            remaining = data.remaining;
          }

          if (remaining > 0) {
            resolve(remaining);
            return;
          } else {
            chrome.storage.local.remove([tempAllowKey]);
          }
        }
        resolve(0);
      });
    });
  }

  function blockCurrentPage() {

    // 방문 기록
    recordVisit(baseDomain);

    // 페이지 로딩 중단
    try {
      window.stop();
    } catch (e) {
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
    });
  }

  let warningInterval;
  function showTempWarning(domain, remainingMs) {
    if (warningInterval) {
      clearInterval(warningInterval);
    }
    let warningDiv = document.getElementById("siteblock-temp-warning");
    if (!warningDiv) {
      warningDiv = document.createElement("div");
      warningDiv.id = "siteblock-temp-warning";
      warningDiv.style.cssText =
        "position:fixed;bottom:10px;right:10px;background:rgba(0,0,0,0.7);color:white;padding:5px 10px;border-radius:3px;z-index:2147483647;font-size:12px;";
      document.body.appendChild(warningDiv);
    }

    const update = () => {
      const key = `temp_allow_${domain}`;
      chrome.storage.local.get([key], (res) => {
        const data = res[key];
        if (!data) {
          warningDiv.remove();
          clearInterval(warningInterval);
          warningInterval = null;
          return;
        }
        let remain = 0;
        if (typeof data === "number") {
          remain = data - Date.now();
        } else if (typeof data.remaining === "number") {
          remain = data.remaining;
        }
        if (remain <= 0) {
          warningDiv.remove();
          clearInterval(warningInterval);
          warningInterval = null;
          chrome.storage.local.remove([key]);
          return;
        }
        const minutes = Math.ceil(remain / 60000);
        warningDiv.textContent = `⏰ 임시 허용 남은 시간: ${minutes}분`;
      });
    };

    update();
    warningInterval = setInterval(update, 60000);
  }

  function getTodayStats(domain) {
    return new Promise((resolve) => {
      const today = new Date().toISOString().split("T")[0];
      const visitKey = `visits_${domain}_${today}`;
      const timeKey = `time_${domain}_${today}`;

      chrome.storage.local.get([visitKey, timeKey], (result) => {
        const visits = result[visitKey] || 0;
        const timeMs = result[timeKey] || 0;
        const timeMinutes = Math.floor(timeMs / 1000 / 60);

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
