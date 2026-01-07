/*
=========================================
 AI News Hub - JS Utilities
=========================================
This file contains shared helper functions 
to avoid repeating code.
*/

// --- API Base URL Configuration ---
// Automatically uses current domain in production, localhost in development
const API_BASE_URL = (() => {
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return "http://localhost:3000";
  }
  // For production (Render, Vercel, etc.), use the current domain
  return `${window.location.protocol}//${window.location.host}`;
})();

/**
 * Creates an HTML string for an article card.
 * @param {object} article - The article object from our API
 * @returns {string} - HTML string for the article card
 */
function createArticleCardHTML(article) {
  // The 'id' from our API is the full article URL.
  // We pass this URL as the 'id' query parameter.
  const articleLink = `article-template.html?id=${encodeURIComponent(
    article.id
  )}`;

  return `
    <a href="${articleLink}" class="article-card">
      <div class="article-card-image" style="background-image: url('${article.imageUrl}')"></div>
      <div class="article-card-content">
        <span class="article-category-tag">${article.category}</span>
        <h3>${article.title}</h3>
        <p>${article.description}</p>
        <div class="article-card-meta">
          <div class="author-avatar">${article.authorInitials}</div>
          <div class="author-info">
            <span class="author-name">${article.author}</span>
            <span class="date">${article.publishedAt}</span>
          </div>
        </div>
      </div>
    </a>
  `;
}

/**
 * Creates an HTML string for a featured slideshow slide.
 * @param {object} article - The article object from our API
 * @param {boolean} isActive - Whether this is the first (active) slide
 * @returns {string} - HTML string for the slide
 */
function createSlideHTML(article, isActive = false) {
  const articleLink = `article-template.html?id=${encodeURIComponent(
    article.id
  )}`;
  const activeClass = isActive ? "active" : "";

  return `
    <a href="${articleLink}" class="featured-article-hero ${activeClass}" style="background-image: url('${article.imageUrl}')">
      <div class="featured-article-hero-content">
        <h4>Featured</h4>
        <h2>${article.title}</h2>
        <p>${article.description}</p>
      </div>
    </a>
  `;
}

