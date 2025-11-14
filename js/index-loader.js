/*
=========================================
 AI News Hub - Index Page Loader
=========================================
This file fetches news for the "Top Stories" page (index.html)
and builds the featured slideshow and the recent posts grid.
*/
document.addEventListener("DOMContentLoaded", () => {
  const feedGrid = document.getElementById("blog-feed-grid");
  const slidesContainer = document.getElementById("slides-container");
  const slidePagination = document.getElementById("slide-pagination");

  // This element will be removed once content loads
  feedGrid.innerHTML = '<h4 id="loading-indicator">Loading articles...</h4>';

  let slideInterval = null;
  let currentSlideIndex = 0;

  /**
   * Loads news from our backend
   */
  async function loadNews() {
    try {
      const response = await fetch(
        "http://localhost:3000/api/news?category=topstories"
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to fetch news");
      }
      const articles = await response.json();

      // Clear loading indicator
      feedGrid.innerHTML = "";

      if (!articles || articles.length === 0) {
        feedGrid.innerHTML = "<h4>No articles found.</h4>";
        document.getElementById("featured-article-slideshow").style.display =
          "none";
        return;
      }

      // --- 1. Build Slideshow ---
      const numFeatured = Math.min(articles.length, 4);
      const featuredArticles = articles.slice(0, numFeatured);
      const recentArticles = articles.slice(numFeatured);

      slidesContainer.innerHTML = ""; // Clear any placeholders
      featuredArticles.forEach((article, index) => {
        const slideHTML = createSlideHTML(article, index === 0);
        slidesContainer.innerHTML += slideHTML;
      });

      // --- 2. Build Recent Posts Grid ---
      recentArticles.forEach((article) => {
        const cardHTML = createArticleCardHTML(article);
        feedGrid.innerHTML += cardHTML;
      });

      // --- 3. Initialize Slideshow ---
      // This logic was moved from script.js
      initializeSlideshow();
    } catch (error) {
      console.error(error);
      feedGrid.innerHTML = `<h4>Error loading articles: ${error.message}</h4>`;
      document.getElementById("featured-article-slideshow").style.display =
        "none";
    }
  }

  // --- Slideshow Logic ---

  function initializeSlideshow() {
    const slides = slidesContainer.querySelectorAll(".featured-article-hero");
    if (slides.length === 0) return;

    // Generate pagination dots
    slidePagination.innerHTML = "";
    slides.forEach((slide, index) => {
      const dot = document.createElement("span");
      dot.className = "pagination-dot";
      if (index === 0) dot.classList.add("active");
      dot.dataset.index = index;
      dot.onclick = () => {
        showSlide(index);
        startSlideShow(slides.length); // Reset interval
      };
      slidePagination.appendChild(dot);
    });

    // Start the slideshow
    currentSlideIndex = 0;
    startSlideShow(slides.length);
  }

  function showSlide(index) {
    const slides = slidesContainer.querySelectorAll(".featured-article-hero");
    const dots = slidePagination.querySelectorAll(".pagination-dot");

    if (!slides[index] || !dots[index]) return;

    slides.forEach((s) => s.classList.remove("active"));
    dots.forEach((d) => d.classList.remove("active"));

    slides[index].classList.add("active");
    dots[index].classList.add("active");

    currentSlideIndex = index;
  }

  function startSlideShow(totalSlides) {
    if (slideInterval) {
      clearInterval(slideInterval);
    }
    slideInterval = setInterval(() => {
      const nextIndex = (currentSlideIndex + 1) % totalSlides;
      showSlide(nextIndex);
    }, 5000);
  }

  // --- Run ---
  loadNews();
});
