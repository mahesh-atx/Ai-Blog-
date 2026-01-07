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
      timeout: 5000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const $ = cheerio.load(response.data);

    // Try to find article content - common selectors
    let content =
      $("article").text() ||
      $("[role='main']").text() ||
      $(".article-body").text() ||
      $(".post-content").text() ||
      $(".entry-content").text() ||
      $("main").text() ||
      $(".content").text();

    // Clean up whitespace
    content = content
      .trim()
      .replace(/\s+/g, " ")
      .substring(0, 2000); // Limit to 2000 chars

    return content || null;
  } catch (error) {
    console.error(`Failed to scrape ${articleUrl}:`, error.message);
    return null; // Return null if scraping fails, we'll use description
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
      // If content is short (likely just description), try to scrape full article
      if (!article.fullContent || article.fullContent.length < 100) {
        console.log(`Scraping full content for: ${articleUrl}`);
        const scrapedContent = await scrapeFullArticle(articleUrl);
        
        if (scrapedContent) {
          article.fullContent = scrapedContent;
          // Update DB with scraped content (for caching)
          await articlesCollection.updateOne(
            { url: articleUrl },
            { $set: { fullContent: scrapedContent } }
          );
        }
      }
      
      res.json(article);
    } else {
      // If not in DB, it might be a caching issue or old link.
      res.status(404).json({ error: "Article not found in database." });
    }
  } catch (error) {
    console.error("Error fetching article from DB:", error);
    res.status(500).json({ error: "Failed to fetch article" });
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