// 백그라운드 스크립트
class SiteTracker {
  constructor() {
    this.visitStartTime = {};
    this.init();
  }

  init() {
    console.log("SiteTracker initializing...");

    // 만료된 임시 허용 정리
    this.cleanupExpiredTempAllows();

    // 주기적으로 정리 작업 실행 (5분마다)
    setInterval(() => {
      this.cleanupExpiredTempAllows();
    }, 5 * 60 * 1000);

    // 웹 네비게이션 이벤트 리스너 (가장 중요)
    chrome.webNavigation.onBeforeNavigate.addListener((details) => {
      if (details.frameId === 0) {
        // 메인 프레임만
        this.handleBeforeNavigation(details.tabId, details.url);
      }
    });

    chrome.webNavigation.onCompleted.addListener((details) => {
      if (details.frameId === 0) {
        // 메인 프레임만
        this.handleNavigation(details.tabId, details.url);
      }
    });

    // 탭 업데이트 이벤트 리스너
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === "loading" && tab.url) {
        this.handleBeforeNavigation(tabId, tab.url);
      }
      if (changeInfo.status === "complete" && tab.url) {
        this.handleNavigation(tabId, tab.url);
      }
    });

    // 탭 제거 이벤트 리스너
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.recordVisitEnd(tabId);
    });

    // 활성 탭 변경 이벤트 리스너
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.recordVisitEnd(activeInfo.tabId);
    });
  }

  async handleBeforeNavigation(tabId, url) {
    try {
      const domain = this.extractDomain(url);
      console.log("Before navigation to:", domain);

      const blockedSites = await this.getBlockedSites();
      console.log("Blocked sites:", blockedSites);

      if (blockedSites.includes(domain)) {
        // 임시 허용 상태 확인
        const isTemporarilyAllowed = await this.checkTemporaryAllow(domain);

        if (isTemporarilyAllowed) {
          console.log("Site temporarily allowed:", domain);
          // 방문 시작 시간 기록 (임시 허용된 경우)
          this.visitStartTime[tabId] = { domain, startTime: Date.now() };
          return;
        }

        console.log("Blocking site:", domain);
        await this.recordVisit(domain);
        const stats = await this.getTodayStats(domain);

        // 즉시 차단 페이지로 리다이렉트
        const blockPageUrl = chrome.runtime.getURL(
          `block-page.html?domain=${encodeURIComponent(domain)}&visits=${
            stats.visits
          }&time=${stats.time}`
        );
        console.log("Redirecting to:", blockPageUrl);

        chrome.tabs.update(tabId, { url: blockPageUrl });
        return;
      }
    } catch (error) {
      console.error("Before navigation handling error:", error);
    }
  }

  async handleNavigation(tabId, url) {
    try {
      const domain = this.extractDomain(url);
      console.log("Navigation completed to:", domain);

      // 차단 페이지가 아닌 경우에만 방문 시간 기록 시작
      if (!url.includes("block-page.html")) {
        this.visitStartTime[tabId] = { domain, startTime: Date.now() };
        console.log("Started timing for:", domain);
      }
    } catch (error) {
      console.error("Navigation handling error:", error);
    }
  }

  recordVisitEnd(tabId) {
    if (this.visitStartTime[tabId]) {
      const { domain, startTime } = this.visitStartTime[tabId];
      const duration = Date.now() - startTime;
      console.log("Recording visit end for:", domain, "Duration:", duration);
      this.recordVisitDuration(domain, duration);
      delete this.visitStartTime[tabId];
    }
  }

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      let hostname = urlObj.hostname;

      // www. 제거
      if (hostname.startsWith("www.")) {
        hostname = hostname.substring(4);
      }

      return hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  async getBlockedSites() {
    try {
      const result = await chrome.storage.sync.get(["blockedSites"]);
      return result.blockedSites || [];
    } catch (error) {
      console.error("Error getting blocked sites:", error);
      return [];
    }
  }

  async recordVisit(domain) {
    try {
      const today = this.getTodayString();
      const key = `visits_${domain}_${today}`;

      const result = await chrome.storage.local.get([key]);
      const currentVisits = result[key] || 0;

      await chrome.storage.local.set({
        [key]: currentVisits + 1,
      });

      console.log("Recorded visit for:", domain, "Total:", currentVisits + 1);
    } catch (error) {
      console.error("Error recording visit:", error);
    }
  }

  async recordVisitDuration(domain, duration) {
    try {
      const today = this.getTodayString();
      const key = `time_${domain}_${today}`;

      const result = await chrome.storage.local.get([key]);
      const currentTime = result[key] || 0;

      await chrome.storage.local.set({
        [key]: currentTime + duration,
      });

      console.log("Recorded time for:", domain, "Duration:", duration);
    } catch (error) {
      console.error("Error recording visit duration:", error);
    }
  }

  async getTodayStats(domain) {
    try {
      const today = this.getTodayString();
      const visitKey = `visits_${domain}_${today}`;
      const timeKey = `time_${domain}_${today}`;

      const result = await chrome.storage.local.get([visitKey, timeKey]);

      return {
        visits: result[visitKey] || 0,
        time: Math.round((result[timeKey] || 0) / 1000 / 60), // 분 단위로 변환
      };
    } catch (error) {
      console.error("Error getting today stats:", error);
      return { visits: 0, time: 0 };
    }
  }

  async checkTemporaryAllow(domain) {
    try {
      const tempAllowKey = `temp_allow_${domain}`;
      const result = await chrome.storage.local.get([tempAllowKey]);
      const allowUntil = result[tempAllowKey];

      if (allowUntil && Date.now() < allowUntil) {
        const remainingMinutes = Math.ceil(
          (allowUntil - Date.now()) / (1000 * 60)
        );
        console.log(
          `Site ${domain} temporarily allowed for ${remainingMinutes} more minutes`
        );
        return true;
      } else if (allowUntil) {
        // 시간이 만료된 경우 정리
        await chrome.storage.local.remove([tempAllowKey]);
        console.log(`Temporary allow expired for ${domain}`);
      }

      return false;
    } catch (error) {
      console.error("Error checking temporary allow:", error);
      return false;
    }
  }

  async cleanupExpiredTempAllows() {
    try {
      const storage = await chrome.storage.local.get();
      const now = Date.now();
      const keysToRemove = [];

      for (const [key, value] of Object.entries(storage)) {
        if (key.startsWith("temp_allow_") && value < now) {
          keysToRemove.push(key);
        }
      }

      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        console.log("Cleaned up expired temporary allows:", keysToRemove);
      }
    } catch (error) {
      console.error("Error cleaning up expired temp allows:", error);
    }
  }

  getTodayString() {
    const today = new Date();
    return today.toISOString().split("T")[0]; // YYYY-MM-DD 형식
  }
}

// 백그라운드 스크립트 초기화
console.log("Background script loaded");
const siteTracker = new SiteTracker();
