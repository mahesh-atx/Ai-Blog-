/*
=========================================
 AI News Hub - Category Page Loader
=========================================
This file fetches news for all category pages
(technology.html, politics.html, etc.)
*/
document.addEventListener("DOMContentLoaded", () => {
  const feedGrid = document.getElementById("blog-feed-grid");

  // 1. Detect category from page URL
  const path = window.location.pathname;
  const pageName = path.split("/").pop(); // e.g., "technology.html"
  const category = pageName.split(".")[0]; // e.g., "technology"

  if (!category) {
    feedGrid.innerHTML = "<h4>Could not determine category.</h4>";
    return;
  }

  feedGrid.innerHTML = '<h4 id="loading-indicator">Loading articles...</h4>';

  /**
   * Loads news from our backend
   */
  async function loadNews() {
    try {
      const response = await fetch(
        `http://localhost:3000/api/news?category=${category}`
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to fetch news");
      }
      const articles = await response.json();

      // Clear loading indicator
      feedGrid.innerHTML = "";

      if (!articles || articles.length === 0) {
        feedGrid.innerHTML = "<h4>No articles found for this category.</h4>";
        return;
      }

      // Build article grid
      articles.forEach((article) => {
        const cardHTML = createArticleCardHTML(article);
        feedGrid.innerHTML += cardHTML;
      });
    } catch (error) {
      console.error(error);
      feedGrid.innerHTML = `<h4>Error loading articles: ${error.message}</h4>`;
    }
  }

  // --- Run ---
  loadNews();
});
