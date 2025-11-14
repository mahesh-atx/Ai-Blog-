/*
=========================================
 AI News Hub - Global Scripts
=========================================
This file handles global UI elements:
1. Dark Mode Toggle
2. Mobile Menu Toggle
3. "Suggest a Topic" Modal (including API call)
4. Notification Message Box

NOTE: All page-specific content loading (news, articles)
is handled by separate files in the /js/ folder.
*/
document.addEventListener("DOMContentLoaded", () => {
  // === STATE MANAGEMENT ===
  const appState = {
    isDarkMode: false,
  };

  // === DOM SELECTORS ===
  const main = document.getElementById("main");
  const themeToggle = document.querySelector(".theme-toggle");

  // Suggest Modal
  const suggestModal = document.getElementById("suggest-modal");
  const suggestOpenBtnNav = document.getElementById("suggest-topic-btn-nav");
  const suggestOpenBtnMobile = document.getElementById(
    "suggest-topic-btn-mobile"
  );
  const suggestCloseBtn = document.getElementById("suggest-close-btn");
  const suggestForm = document.getElementById("suggest-form");

  // Mobile Menu
  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const mobileMenuOverlay = document.getElementById("mobile-menu-overlay");
  const mobileMenuCloseBtn = document.getElementById("mobile-menu-close-btn");
  const mobileThemeToggle = document.querySelector(".theme-toggle-mobile");
  const mobileMenuLinks = document.querySelector(".mobile-menu-links");

  // Message Box
  const messageBox = document.getElementById("message-box");

  // === DARK MODE LOGIC ===
  function setDarkMode(isDark) {
    appState.isDarkMode = isDark;
    const icon = isDark ? "fa-sun" : "fa-moon";
    if (isDark) {
      main.classList.add("dark-mode");
      localStorage.setItem("theme", "dark");
    } else {
      main.classList.remove("dark-mode");
      localStorage.setItem("theme", "light");
    }
    if (themeToggle) {
      themeToggle.innerHTML = `<i class="fa-solid ${icon}"></i>`;
    }
    if (mobileThemeToggle) {
      mobileThemeToggle.innerHTML = `<i class="fa-solid ${icon}"></i> <span>Toggle Theme</span>`;
    }
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      setDarkMode(!appState.isDarkMode);
    });
  }
  if (mobileThemeToggle) {
    mobileThemeToggle.addEventListener("click", () => {
      setDarkMode(!appState.isDarkMode);
    });
  }

  const savedTheme = localStorage.getItem("theme");
  setDarkMode(savedTheme === "dark"); // Initialize theme

  // === NOTIFICATION MESSAGE BOX ===
  // Make this function global so other scripts can use it
  window.showMessage = function (text, isError = false) {
    if (!messageBox) return;
    messageBox.textContent = text;
    // You can add an error class style in your CSS if you want
    // messageBox.classList.toggle("error", isError);
    messageBox.classList.add("show");
    setTimeout(() => {
      messageBox.classList.remove("show");
    }, 3000);
  };

  // === MOBILE MENU LOGIC ===
  function openMobileMenu() {
    if (mobileMenuOverlay) mobileMenuOverlay.classList.add("show");
  }

  function closeMobileMenu() {
    if (mobileMenuOverlay) mobileMenuOverlay.classList.remove("show");
  }

  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener("click", openMobileMenu);
  }
  if (mobileMenuCloseBtn) {
    mobileMenuCloseBtn.addEventListener("click", closeMobileMenu);
  }
  if (mobileMenuLinks) {
    mobileMenuLinks.addEventListener("click", (e) => {
      if (e.target.tagName === "A" || e.target.tagName === "BUTTON") {
        closeMobileMenu();
      }
    });
  }

  // === SUGGEST TOPIC MODAL LOGIC (NOW WITH API CALL) ===
  function openSuggestModal() {
    if (suggestModal) suggestModal.style.display = "flex";
  }

  function closeSuggestModal() {
    if (suggestModal) suggestModal.style.display = "none";
  }

  if (suggestOpenBtnNav) {
    suggestOpenBtnNav.addEventListener("click", openSuggestModal);
  }
  if (suggestOpenBtnMobile) {
    suggestOpenBtnMobile.addEventListener("click", openSuggestModal);
  }
  if (suggestCloseBtn) {
    suggestCloseBtn.addEventListener("click", closeSuggestModal);
  }

  if (suggestForm) {
    suggestForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = document.getElementById("suggest-topic-title").value;
      const details = document.getElementById("suggest-topic-details").value;
      const submitButton = suggestForm.querySelector('button[type="submit"]');

      submitButton.disabled = true;
      submitButton.textContent = "Sending...";

      try {
        // Fetch to our backend server (relative URL)
        const response = await fetch("/api/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, details }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Network response was not ok");
        }

        suggestForm.reset();
        closeSuggestModal();
        showMessage(result.message || "Suggestion sent. Thank you!");
      } catch (error) {
        console.error("Error submitting suggestion:", error);
        showMessage(`Error: ${error.message}`, true);
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Send Suggestion";
      }
    });
  }

  // NO slideshow logic here. It's now in js/index-loader.js
});
