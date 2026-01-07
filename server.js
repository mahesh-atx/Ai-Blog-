/*
=========================================
 AI News Hub - Backend Server
=========================================
This server handles five things:
1. Serves all static frontend files (HTML, CSS, JS).
2. Securely proxies requests to the News API (now using newsapi.org).
3. Caches News API results in MongoDB to avoid rate limits.
4. Securely proxies requests to the AI Chat Model (Gemini) API.
5. Saves "Suggest a Topic" submissions to your MongoDB database.
6. Provides a secure endpoint to clear the cache.
*/

// --- Dependencies ---
require("dotenv").config(); // Loads .env file variables
const express = require("express");
const cors = require("cors");
const axios = require("axios"); // For making HTTP requests
const { MongoClient } = require("mongodb");
const cheerio = require("cheerio"); // For web scraping

// --- Environment Variables ---
const PORT = process.env.PORT || 3000;
// This key is now for newsapi.org
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const AI_CHAT_API_KEY = process.env.AI_CHAT_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "ai-news-hub";
const CACHE_CLEAR_KEY =
  process.env.CACHE_CLEAR_KEY || "replace-this-with-a-real-secret-key";

if (!NEWS_API_KEY || !AI_CHAT_API_KEY) {
  console.error(
    "FATAL ERROR: API keys (NEWS_API_KEY, AI_CHAT_API_KEY) are not defined in your .env file."
  );
  process.exit(1);
}

if (!MONGODB_URI) {
  console.warn(
    "Warning: MONGODB_URI is not set. 'Suggest a Topic' and caching will not work."
  );
}

// --- Initialize Express App ---
const app = express();
app.use(cors()); // Allow requests from your frontend
app.use(express.json()); // Parse JSON request bodies

// --- Serve Static Files ---
app.use(express.static(__dirname));

// --- Database Connection ---
let db;
let articlesCollection;
let suggestionsCollection;
let cacheCollection;

async function connectToDb() {
  if (!MONGODB_URI) return;
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    articlesCollection = db.collection("articles");
    suggestionsCollection = db.collection("suggestions");
    cacheCollection = db.collection("cache");

    // Create index to auto-delete cache items after 1 hour
    await cacheCollection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 3600 }
    );
    // Create index for fast article lookups
    await articlesCollection.createIndex({ url: 1 }, { unique: true });

    console.log("Successfully connected to MongoDB.");
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
  }
}

// --- Helper Functions ---
function getAuthorInitials(authorName) {
  if (!authorName) return "NN";
  const parts = authorName.split(" ");
  if (parts.length > 1) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (authorName.substring(0, 2) || "NN").toUpperCase();
}

/**
 * Scrapes full article content from the article URL
 * Uses cheerio to parse HTML and extract main content
 */
async function scrapeFullArticle(articleUrl) {
  try {
    const response = await axios.get(articleUrl, {
      timeout: 8000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const $ = cheerio.load(response.data);

    // Try multiple selectors in order until we find content
    const selectors = [
      "article",
      "[role='main']",
      "[role='article']",
      ".article-body",
      ".post-content",
      ".entry-content",
      ".article-content",
      ".news-content",
      "main",
      ".content",
      ".body",
    ];

    let paragraphs = [];

    for (const selector of selectors) {
      const element = $(selector);
      if (element.length > 0) {
        // Extract all paragraphs
        const paras = element
          .find("p")
          .map((_, el) => {
            const text = $(el).text().trim();
            return text.length > 20 ? text : null;
          })
          .get()
          .filter((p) => p !== null);

        if (paras.length > 2) {
          paragraphs = paras;
          break;
        }
      }
    }

    // If no paragraphs found, try alternative extraction
    if (paragraphs.length === 0) {
      paragraphs = $("p")
        .map((_, el) => {
          const text = $(el).text().trim();
          return text.length > 20 ? text : null;
        })
        .get()
        .filter((p) => p !== null);
    }

    // If still no content, use body text split by sentences
    if (paragraphs.length === 0) {
      const bodyText = $("body").text();
      if (bodyText) {
        paragraphs = bodyText
          .split(/(?<=[.!?])\s+/)
          .map((sent) => sent.trim())
          .filter((sent) => sent.length > 50);
      }
    }

    // Clean and format paragraphs
    paragraphs = paragraphs
      .map((para) => para.replace(/\s+/g, " ").substring(0, 1000))
      .slice(0, 25) // Max 25 paragraphs
      .map((para) => `<p>${para}</p>`)
      .join("");

    console.log(
      `Scraped ${paragraphs.length} paragraphs from ${articleUrl.substring(
        0,
        50
      )}...`
    );

    return paragraphs.length > 100 ? paragraphs : null;
  } catch (error) {
    console.error(`Failed to scrape ${articleUrl}:`, error.message);
    return null;
  }
}

/**
 * Extracts keywords from article title and description
 * @param {string} title - Article title
 * @param {string} description - Article description
 * @returns {string[]} - Array of keywords
 */
function extractKeywords(title, description) {
  const text = `${title} ${description || ""}`.toLowerCase();
  const words = text
    .split(/[\s\-_.,!?;:()'"]+/)
    .filter((word) => word.length > 3 && word.length < 25); // Allow shorter keywords

  // Remove common stop words
  const stopWords = new Set([
    "about",
    "after",
    "also",
    "back",
    "been",
    "before",
    "being",
    "between",
    "both",
    "could",
    "during",
    "each",
    "first",
    "from",
    "have",
    "having",
    "here",
    "just",
    "more",
    "most",
    "other",
    "should",
    "since",
    "some",
    "such",
    "than",
    "that",
    "their",
    "there",
    "these",
    "this",
    "those",
    "through",
    "time",
    "under",
    "until",
    "very",
    "what",
    "when",
    "where",
    "which",
    "while",
    "with",
    "would",
    "your",
    "will",
    "has",
    "had",
    "can",
    "the",
    "and",
    "for",
    "are",
    "was",
    "but",
    "not",
    "you",
    "all",
    "our",
  ]);

  const keywords = [...new Set(words.filter((w) => !stopWords.has(w)))].slice(
    0,
    15
  );
  console.log(`[KEYWORDS] Extracted: ${keywords.join(", ")}`);
  return keywords;
}

/**
 * Finds similar articles based on keyword matching
 * @param {string} articleUrl - URL of current article
 * @param {string} title - Article title
 * @param {string} description - Article description
 * @param {object} collection - MongoDB articles collection
 * @returns {Promise<array>} - Array of related articles
 */
async function findRelatedArticles(articleUrl, title, description, collection) {
  try {
    const keywords = extractKeywords(title, description);

    if (keywords.length === 0) {
      console.log("[RELATED] No keywords extracted");
      return [];
    }

    console.log(`[RELATED] Searching for keywords: ${keywords.join(", ")}`);

    // Try to find articles matching ANY of the keywords
    const searchPattern = keywords.join("|");

    const related = await collection
      .find({
        url: { $ne: articleUrl }, // Exclude current article
        $or: [
          { title: { $regex: searchPattern, $options: "i" } },
          { description: { $regex: searchPattern, $options: "i" } },
        ],
      })
      .limit(6)
      .toArray();

    console.log(`[RELATED] Found ${related.length} related articles`);
    return related.slice(0, 3); // Return max 3 related articles
  } catch (error) {
    console.error("Error finding related articles:", error);
    return [];
  }
}

/**
 * [MODIFIED] Formats data from newsapi.org API to match the frontend's expected structure.
 */
function formatArticle(article, category) {
  // Use 'author' if it exists, otherwise 'source.name'
  const author = article.author || article.source.name || "Unknown";

  return {
    // We use the article 'url' as the unique ID
    id: article.url,
    title: article.title,
    description: article.description || "No description available.",
    // newsapi.org 'content' is often partial, fallback to description
    content: `<p>${
      article.content || article.description || "No description available."
    }</p>`,
    // Use 'urlToImage' instead of 'image_url'
    imageUrl:
      article.urlToImage ||
      `https://placehold.co/600x400/efeded/363636?text=${encodeURIComponent(
        article.title.split(" ")[0] || "News"
      )}`,
    // Use 'source.name' instead of 'source_id'
    source: article.source.name || "Unknown Source",
    // Use 'publishedAt' instead of 'pubDate'
    publishedAt: new Date(article.publishedAt).toLocaleDateString(),
    category: category, // Pass through the category we originally requested
    author: author,
    authorInitials: getAuthorInitials(author),
    // The original URL to the article
    url: article.url,
  };
}

// --- API Endpoints ---

/**
 * [MODIFIED] /api/news
 * Fetches news for a specific category from newsapi.org
 * Caches results in MongoDB for 1 hour.
 */
app.get("/api/news", async (req, res) => {
  const category = req.query.category || "general";
  // [MODIFIED] Updated cache key
  const cacheKey = `news_newsapi_${category}`;

  // 1. Try to find a valid cache entry
  if (db) {
    const cachedData = await cacheCollection.findOne({ key: cacheKey });
    if (cachedData) {
      console.log(`[Cache HIT] /api/news?category=${category}`);
      return res.json(cachedData.data);
    }
  }

  console.log(`[Cache MISS] /api/news?category=${category}`);

  // 2. [MODIFIED] Map frontend categories to newsapi.org categories
  // Valid categories: business, entertainment, general, health, science, sports, technology
  let apiCategory;
  if (category === "topstories") {
    apiCategory = "general"; // Map 'topstories' to 'general'
  } else if (category === "jobs") {
    apiCategory = "business"; // Map 'jobs' to 'business'
  } else {
    apiCategory = category;
  }

  // [MODIFIED] Use newsapi.org endpoint
  const newsApiUrl = "https://newsapi.org/v2/top-headlines";

  try {
    // 3. [MODIFIED] Fetch from newsapi.org API
    const response = await axios.get(newsApiUrl, {
      params: {
        apiKey: NEWS_API_KEY, // Parameter name is 'apiKey' (camelCase)
        category: apiCategory,
        country: "us",
        // 'language' is not a param for top-headlines, 'country=us' implies english
      },
    });

    // 4. [MODIFIED] Format the data (response key is 'articles')
    let formattedArticles = [];
    if (response.data.articles) {
      formattedArticles = response.data.articles.map(
        (article) => formatArticle(article, category) // Pass in the original category
      );
    } else {
      console.warn("No 'articles' field in API response:", response.data);
    }

    // 5. Save articles and cache the result
    if (db) {
      // Save individual articles for later lookup
      if (formattedArticles.length > 0) {
        const operations = formattedArticles.map((article) => ({
          updateOne: {
            filter: { url: article.url }, // 'url' is the unique ID
            update: { $set: article },
            upsert: true,
          },
        }));
        await articlesCollection.bulkWrite(operations);
      }

      // Save the entire category response to the cache
      await cacheCollection.insertOne({
        key: cacheKey,
        data: formattedArticles,
        createdAt: new Date(),
      });
    }

    // 6. Send response
    res.json(formattedArticles);
  } catch (error) {
    console.error(
      "Error fetching from News API (newsapi.org):",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

/**
 * [MODIFIED] /api/article
 * Fetches a single article's details from our database.
 * The ID is the article's URL (from 'url' field).
 */
app.get("/api/article", async (req, res) => {
  const articleUrl = req.query.id; // The ID is the non-encoded URL
  if (!articleUrl) {
    return res.status(400).json({ error: "No article ID provided" });
  }

  if (!db) {
    return res.status(503).json({ error: "Database not connected" });
  }

  try {
    // Find article by its 'url' field
    let article = await articlesCollection.findOne({ url: articleUrl });

    if (article) {
      // Always try to scrape if we don't have good content
      if (!article.fullContent || article.fullContent.length < 150) {
        console.log(
          `[SCRAPING] Attempting to get full content for: ${articleUrl}`
        );
        const scrapedContent = await scrapeFullArticle(articleUrl);

        if (scrapedContent && scrapedContent.length > 150) {
          console.log(`[SCRAPING] Success! Got ${scrapedContent.length} chars`);
          article.fullContent = scrapedContent;
          // Update DB with scraped content (for caching)
          await articlesCollection
            .updateOne(
              { url: articleUrl },
              { $set: { fullContent: scrapedContent, updatedAt: new Date() } }
            )
            .catch((err) => console.error("Error updating article:", err));
        } else {
          console.log(`[SCRAPING] Failed or got too little content`);
          // If we still don't have good content, use article description as fallback
          if (!article.fullContent) {
            article.fullContent =
              article.description ||
              article.content ||
              "Article content not available";
          }
        }
      }

      res.json(article);
    } else {
      // If not in DB, try to scrape directly
      console.log(
        `[SCRAPING] Article not in DB, attempting direct scrape: ${articleUrl}`
      );
      const scrapedContent = await scrapeFullArticle(articleUrl);

      if (scrapedContent) {
        res.json({
          id: articleUrl,
          url: articleUrl,
          fullContent: scrapedContent,
          description: scrapedContent.substring(0, 200),
          title: "Article",
          author: "Unknown",
          source: "Direct Scrape",
          imageUrl: "https://placehold.co/600x400",
          category: "general",
          publishedAt: new Date().toLocaleDateString(),
          authorInitials: "UN",
          content: scrapedContent,
        });
      } else {
        res
          .status(404)
          .json({
            error: "Article not found in database or unable to scrape.",
          });
      }
    }
  } catch (error) {
    console.error("Error fetching article from DB:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch article: " + error.message });
  }
});

/**
 * [GET] /api/related-articles
 * Finds similar articles based on keywords
 */
app.get("/api/related-articles", async (req, res) => {
  const articleUrl = req.query.url;
  const title = req.query.title;
  const description = req.query.description;

  console.log(`[RELATED-API] Request - URL: ${articleUrl}, Title: ${title}`);

  if (!articleUrl || !title) {
    return res.status(400).json({ error: "Article URL and title required" });
  }

  if (!db) {
    return res.status(503).json({ error: "Database not connected" });
  }

  try {
    const related = await findRelatedArticles(
      articleUrl,
      title,
      description || "",
      articlesCollection
    );

    console.log(`[RELATED-API] Returning ${related.length} related articles`);
    res.json(related || []);
  } catch (error) {
    console.error("Error finding related articles:", error);
    res
      .status(500)
      .json({ error: "Failed to find related articles: " + error.message });
  }
});

/**
 * [POST] /api/chat
 * Sends a prompt and article content to the AI model.
 */
app.post("/api/chat", async (req, res) => {
  const { userQuery, articleContent } = req.body;

  if (!userQuery || !articleContent) {
    return res
      .status(400)
      .json({ error: "Query and article content are required." });
  }

  const AI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${AI_CHAT_API_KEY}`;

  const systemPrompt = `You are a helpful AI assistant. A user is reading an article. Answer their questions based *only* on the article content provided. Do not use any external knowledge. If the answer is not in the article, say so.

Article Content:
${articleContent}`;

  const payload = {
    contents: [{ parts: [{ text: userQuery }] }],
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
  };

  try {
    const response = await axios.post(AI_API_URL, payload);
    const aiResponse = response.data.candidates[0].content.parts[0].text;
    res.json({ response: aiResponse });
  } catch (error) {
    console.error(
      "Error calling AI Chat API:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: "Failed to get response from AI model." });
  }
});

/**
 * [POST] /api/suggest
 * Saves a user's topic suggestion to the database.
 */
app.post("/api/suggest", async (req, res) => {
  if (!db) {
    return res.status(503).json({ error: "Database not connected" });
  }

  try {
    const { title, details } = req.body;
    if (!title) {
      return res.status(400).json({ error: "Topic title is required." });
    }

    await suggestionsCollection.insertOne({
      title,
      details,
      createdAt: new Date(),
    });

    res.status(201).json({ message: "Suggestion received! Thank you." });
  } catch (error) {
    console.error("Error saving suggestion:", error);
    res.status(500).json({ error: "Failed to save suggestion." });
  }
});

// --- Cache Clear Endpoint ---
/**
 * [GET] /api/clear-cache
 * Deletes all documents from the 'cache' collection.
 * Requires a secret key to be passed as a query parameter.
 */
app.get("/api/clear-cache", async (req, res) => {
  const { key } = req.query;

  // 1. Check for the secret key
  if (key !== CACHE_CLEAR_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // 2. Check for database connection
  if (!db) {
    return res.status(503).json({ error: "Database not connected" });
  }

  // 3. Clear the cache
  try {
    const deleteResult = await cacheCollection.deleteMany({});
    console.log(`[CACHE CLEARED] Deleted ${deleteResult.deletedCount} items.`);
    res.status(200).json({
      message: "Cache cleared successfully.",
      deletedCount: deleteResult.deletedCount,
    });
  } catch (error) {
    console.error("Error clearing cache:", error);
    res.status(500).json({ error: "Failed to clear cache." });
  }
});

/**
 * [GET] /api/clear-articles
 * Removes fullContent from all articles to force re-scraping.
 * Requires a secret key to be passed as a query parameter.
 */
app.get("/api/clear-articles", async (req, res) => {
  const { key } = req.query;

  if (key !== CACHE_CLEAR_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!db) {
    return res.status(503).json({ error: "Database not connected" });
  }

  try {
    const result = await articlesCollection.updateMany(
      {},
      { $unset: { fullContent: "" } }
    );
    console.log(`[ARTICLES CLEARED] Updated ${result.modifiedCount} articles.`);
    res.status(200).json({
      message: "Articles cleared for re-scraping.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error clearing articles:", error);
    res.status(500).json({ error: "Failed to clear articles." });
  }
});

// --- Health Check Endpoint (for Render to verify service is running) ---
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// --- Start Server ---
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[${new Date().toISOString()}] Server listening on port ${PORT}`);
  connectToDb(); // Connect to DB on server start
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});
