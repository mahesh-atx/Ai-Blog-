/*
=========================================
 AI News Hub - Article Page Loader
=========================================
This file:
1. Fetches a single article's content based on the URL.
2. Powers the "Chat with this Article" modal.
*/
document.addEventListener("DOMContentLoaded", () => {
  const placeholder = document.getElementById("article-content-placeholder");
  let currentArticle = null; // To store article data for chat

  // --- 1. Article Loading Logic ---

  async function loadArticle() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const articleId = urlParams.get("id"); // This is the article URL

      if (!articleId) {
        throw new Error("No article ID found in URL.");
      }

      // Fetch the single article from our backend
      const response = await fetch(
        `${API_BASE_URL}/api/article?id=${encodeURIComponent(articleId)}`
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Article not found.");
      }

      currentArticle = await response.json();

      if (!currentArticle) {
        throw new Error("Article not found.");
      }

      // Update page title
      document.title = `AI News Hub - ${currentArticle.title}`;

      // Inject article HTML
      placeholder.innerHTML = `
        <div class="article-header">
          <a href="javascript:history.back()" class="back-link" id="back-to-feed-btn">
            <i class="fa-solid fa-arrow-left"></i> Back
          </a>
          <h1>${currentArticle.title}</h1>
          <div class="article-meta">
            <span>By: <strong>${currentArticle.author}</strong></span>
            <span>On: <strong>${currentArticle.publishedAt}</strong></span>
          </div>
          <button class="capsule black-capsule btn-border" id="chat-with-article-btn">
            <i class="fa-solid fa-comments"></i> Chat with this Article
          </button>
        </div>
        
        <div class="article-view-image" style="background-image: url('${currentArticle.imageUrl}')"></div>
        
        <div class="article-view-body">
          ${currentArticle.content}
          <p style="margin-top: 2em; font-style: italic;">
            <a href="${currentArticle.url}" target="_blank" rel="noopener noreferrer">
              Read the full original article at ${currentArticle.source}
            </a>
          </p>
        </div>
      `;

      // --- 2. Wire up Chat Modal (now that we have content) ---
      initializeChat();
    } catch (error) {
      console.error(error);
      placeholder.innerHTML = `<h1 style="text-align: center; color: red;">Error: ${error.message}</h1><p style="text-align: center;">Could not load the article. Please <a href="index.html">return to the homepage</a>.</p>`;
    }
  }

  // --- 2. Chat Modal Logic ---

  function initializeChat() {
    const chatModal = document.getElementById("chat-modal");
    const chatCloseBtn = document.getElementById("chat-close-btn");
    const chatForm = document.getElementById("chat-form");
    const chatInput = document.getElementById("chat-input-text");
    const chatMessagesContainer = document.getElementById(
      "chat-messages-container"
    );
    const chatButton = document.getElementById("chat-with-article-btn");

    if (!chatButton) return;

    chatButton.addEventListener("click", openChatModal);

    function openChatModal() {
      chatModal.style.display = "flex";
      chatMessagesContainer.innerHTML = `
        <div class="chat-message system">
          I am an AI assistant. Ask me anything about "${currentArticle.title}"!
        </div>
      `;
      chatInput.focus();
    }

    chatCloseBtn.addEventListener("click", () => {
      chatModal.style.display = "none";
    });

    chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const query = chatInput.value.trim();
      if (!query) return;

      addChatMessage(query, "user");
      chatInput.value = "";
      fetchAiResponse(query);
    });

    function addChatMessage(message, sender, isLoading = false) {
      const messageEl = document.createElement("div");
      messageEl.classList.add("chat-message", sender);

      if (isLoading) {
        messageEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        messageEl.id = "loading-bubble";
      } else {
        // Simple text escaping
        messageEl.textContent = message;
      }

      chatMessagesContainer.appendChild(messageEl);
      chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
      return messageEl;
    }

    async function fetchAiResponse(query) {
      const loadingBubble = addChatMessage("", "ai", true);

      // Send the query AND the article content to our backend
      try {
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userQuery: query,
            // Send the description, as 'content' is just the description
            articleContent: currentArticle.description,
          }),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || "Failed to get AI response");
        }

        const data = await response.json();
        loadingBubble.textContent = data.response;
        loadingBubble.id = ""; // Remove ID after loading
      } catch (error) {
        console.error("Error fetching AI response:", error);
        loadingBubble.textContent = `Error: ${error.message}`;
        loadingBubble.classList.add("system"); // Make it look like an error
      }
    }
  }

  // --- Run ---
  loadArticle();
});
