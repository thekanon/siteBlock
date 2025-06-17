export class PopupManager {
  constructor() {
    this.currentDomain = "";
    this.init();
  }

  async init() {

    // Chrome API 확인
    if (typeof chrome === "undefined") {
      document.getElementById("current-domain").textContent = "Chrome API 없음";
      return;
    }

    try {
      await this.loadCurrentDomain();
      await this.loadBlockedSites();
      await this.loadTodayStats();
      this.bindEvents();
    } catch (error) {
      document.getElementById("current-domain").textContent = "초기화 오류";
    }
  }

  async loadCurrentDomain() {
    try {
      // Chrome API 사용 가능 여부 확인
      if (typeof chrome === "undefined" || !chrome.tabs) {
        throw new Error("Chrome API not available");
      }

      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (
        tab &&
        tab.url &&
        !tab.url.startsWith("chrome://") &&
        !tab.url.startsWith("chrome-extension://") &&
        !tab.url.startsWith("about:")
      ) {
        const url = new URL(tab.url);
        this.currentDomain = url.hostname;
        document.getElementById("current-domain").textContent =
          this.currentDomain;

        // 현재 사이트 버튼 활성화
        const addCurrentBtn = document.getElementById("add-current-site");
        if (addCurrentBtn) {
          addCurrentBtn.disabled = false;
        }
      } else {
        this.currentDomain = "";
        document.getElementById("current-domain").textContent =
          "특수 페이지 (차단 불가)";
        const addCurrentBtn = document.getElementById("add-current-site");
        if (addCurrentBtn) {
          addCurrentBtn.disabled = true;
        }
      }
    } catch (error) {
      this.currentDomain = "";
      document.getElementById("current-domain").textContent = "알 수 없음";
      const addCurrentBtn = document.getElementById("add-current-site");
      if (addCurrentBtn) {
        addCurrentBtn.disabled = true;
      }
    }
  }

  async loadBlockedSites() {
    try {
      const result = await chrome.storage.sync.get(["blockedSites"]);
      const blockedSites = result.blockedSites || [];

      const siteList = document.getElementById("site-list");
      if (!siteList) return;

      if (blockedSites.length === 0) {
        siteList.innerHTML =
          '<div class="no-sites">차단된 사이트가 없습니다</div>';
        return;
      }

      siteList.innerHTML = "";
      blockedSites.forEach((site) => {
        const siteItem = document.createElement("div");
        siteItem.className = "site-item";
        siteItem.innerHTML = `
          <span>${site}</span>
          <button class="remove-btn" data-site="${site}">제거</button>
        `;
        siteList.appendChild(siteItem);
      });

      // 제거 버튼 이벤트 바인딩
      siteList.querySelectorAll(".remove-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          this.removeSite(e.target.dataset.site);
        });
      });
    } catch (error) {
    }
  }

  async loadTodayStats() {
    try {
      const today = new Date().toISOString().split("T")[0];
      const result = await chrome.storage.sync.get(["blockedSites"]);
      const blockedSites = result.blockedSites || [];

      const statsElement = document.getElementById("today-stats");
      if (!statsElement) return;

      if (blockedSites.length === 0) {
        statsElement.innerHTML = "차단된 사이트가 없습니다";
        return;
      }

      let statsHtml = "";
      let totalVisits = 0;
      let totalTime = 0;

      for (const site of blockedSites) {
        const visitKey = `visits_${site}_${today}`;
        const timeKey = `time_${site}_${today}`;
        const tempAllowKey = `temp_allow_${site}`;

        const siteResult = await chrome.storage.local.get([
          visitKey,
          timeKey,
          tempAllowKey,
        ]);
        const visits = siteResult[visitKey] || 0;
        const timeMs = siteResult[timeKey] || 0;
        const timeMinutes = Math.floor(timeMs / 1000 / 60);
        const allowData = siteResult[tempAllowKey];

        // 임시 허용 상태 확인
        let tempStatus = "";
        if (allowData) {
          let remaining = 0;
          if (typeof allowData === "number") {
            remaining = allowData - Date.now();
          } else if (typeof allowData.remaining === "number") {
            remaining = allowData.remaining;
          }
          if (remaining > 0) {
            const remainingMinutes = Math.ceil(remaining / (1000 * 60));
            tempStatus = `<br><small style="color: #ff9800;">⚠️ 임시 허용 중 (${remainingMinutes}분 남음)</small>`;
          }
        }

        if (visits > 0 || timeMinutes > 0 || tempStatus) {
          statsHtml += `
            <div style="margin: 5px 0; padding: 5px; background: rgba(255,255,255,0.1); border-radius: 3px;">
              <strong>${site}</strong><br>
              <small>접속: ${visits}회, 시간: ${timeMinutes}분</small>
              ${tempStatus}
            </div>
          `;
        }

        totalVisits += visits;
        totalTime += timeMinutes;
      }

      if (statsHtml === "") {
        statsHtml = "오늘 차단된 접속이 없습니다";
      } else {
        statsHtml = `
          <div style="margin-bottom: 10px; font-weight: bold;">
            총 접속 차단: ${totalVisits}회, 절약된 시간: ${totalTime}분
          </div>
          ${statsHtml}
        `;
      }

      statsElement.innerHTML = statsHtml;
    } catch (error) {
    }
  }

  bindEvents() {
    // 현재 사이트 추가
    const addCurrentBtn = document.getElementById("add-current-site");
    if (addCurrentBtn) {
      addCurrentBtn.addEventListener("click", () => {
        if (this.currentDomain) {
          this.addSite(this.currentDomain);
        } else {
          this.showMessage("현재 사이트 정보를 가져올 수 없습니다.", "error");
        }
      });
    }

    // 사이트 직접 추가
    const addSiteBtn = document.getElementById("add-site");
    if (addSiteBtn) {
      addSiteBtn.addEventListener("click", () => {
        const input = document.getElementById("site-input");
        const site = input.value.trim();
        if (site) {
          this.addSite(site);
          input.value = "";
        } else {
          this.showMessage("사이트 주소를 입력해주세요.", "warning");
        }
      });
    }

    // Enter 키로 사이트 추가
    const siteInput = document.getElementById("site-input");
    if (siteInput) {
      siteInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          const addBtn = document.getElementById("add-site");
          if (addBtn) addBtn.click();
        }
      });
    }

    // 디버그 토글 버튼
    const debugToggleBtn = document.getElementById("debug-toggle");
    if (debugToggleBtn) {
      debugToggleBtn.addEventListener("click", () => {
        this.toggleDebug();
      });
    }
  }

  async addSite(site) {
    try {
      // 도메인 정규화
      site = site
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0]
        .toLowerCase();

      if (!site || site.length === 0) {
        this.showMessage("유효한 도메인을 입력해주세요.", "warning");
        return;
      }


      const result = await chrome.storage.sync.get(["blockedSites"]);
      const blockedSites = result.blockedSites || [];

      if (!blockedSites.includes(site)) {
        blockedSites.push(site);
        await chrome.storage.sync.set({ blockedSites });

        await this.loadBlockedSites();
        await this.loadTodayStats();

        // 성공 메시지 표시
        this.showMessage(
          `${site} 사이트가 차단 목록에 추가되었습니다.`,
          "success"
        );

        // 백그라운드 스크립트에 알림 (선택사항)
        try {
          chrome.runtime.sendMessage({ action: "siteAdded", site: site });
        } catch (e) {
        }
      } else {
        this.showMessage(
          `${site} 사이트는 이미 차단 목록에 있습니다.`,
          "warning"
        );
      }
    } catch (error) {
      this.showMessage("사이트 추가 중 오류가 발생했습니다.", "error");
    }
  }

  async removeSite(site) {
    try {
      const result = await chrome.storage.sync.get(["blockedSites"]);
      const blockedSites = result.blockedSites || [];

      const index = blockedSites.indexOf(site);
      if (index > -1) {
        blockedSites.splice(index, 1);
        await chrome.storage.sync.set({ blockedSites });

        await this.loadBlockedSites();
        await this.loadTodayStats();

        this.showMessage(
          `${site} 사이트가 차단 목록에서 제거되었습니다.`,
          "success"
        );
      }
    } catch (error) {
      this.showMessage("사이트 제거 중 오류가 발생했습니다.", "error");
    }
  }

  showMessage(message, type = "info") {
    // 기존 메시지 제거
    const existingMessage = document.querySelector(".message-popup");
    if (existingMessage) {
      existingMessage.remove();
    }

    // 새 메시지 생성
    const messageDiv = document.createElement("div");
    messageDiv.className = "message-popup";
    messageDiv.textContent = message;

    const colors = {
      success: "#4caf50",
      warning: "#ff9800",
      error: "#f44336",
      info: "#2196f3",
    };

    messageDiv.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: ${colors[type] || colors.info};
      color: white;
      padding: 10px 20px;
      border-radius: 5px;
      font-size: 12px;
      z-index: 1000;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;

    document.body.appendChild(messageDiv);

    // 3초 후 자동 제거
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.remove();
      }
    }, 3000);
  }

  toggleDebug() {
    const debugSection = document.getElementById("debug-section");
    if (debugSection) {
      debugSection.style.display =
        debugSection.style.display === "none" ? "block" : "none";
      this.updateDebugInfo();
    }
  }

  async updateDebugInfo() {
    const debugInfo = document.getElementById("debug-info");
    if (!debugInfo) return;

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const blockedSites = await chrome.storage.sync.get(["blockedSites"]);

      debugInfo.innerHTML = `
        <strong>Chrome API:</strong> ${
          typeof chrome !== "undefined" ? "사용 가능" : "사용 불가"
        }<br>
        <strong>현재 URL:</strong> ${tab ? tab.url : "없음"}<br>
        <strong>도메인:</strong> ${this.currentDomain || "없음"}<br>
        <strong>차단 사이트 수:</strong> ${
          (blockedSites.blockedSites || []).length
        }<br>
        <strong>Storage API:</strong> ${
          typeof chrome.storage !== "undefined" ? "사용 가능" : "사용 불가"
        }<br>
        <strong>Tabs API:</strong> ${
          typeof chrome.tabs !== "undefined" ? "사용 가능" : "사용 불가"
        }
      `;
    } catch (error) {
      debugInfo.innerHTML = `<strong>오류:</strong> ${error.message}`;
    }
  }
}
