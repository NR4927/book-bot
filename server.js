require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY || "";
const APP_CONTACT_EMAIL = process.env.APP_CONTACT_EMAIL || "student@example.com";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function cleanText(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstAuthor(authors) {
  return Array.isArray(authors) && authors.length ? authors[0] : "Unknown author";
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Accept": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// ---------------- Google Books ----------------

async function searchGoogleBooks(query, maxResults = 8) {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(Math.min(maxResults, 10)),
    printType: "books"
  });

  if (GOOGLE_BOOKS_API_KEY) {
    params.set("key", GOOGLE_BOOKS_API_KEY);
  }

  const data = await fetchJson(
    `https://www.googleapis.com/books/v1/volumes?${params.toString()}`
  );

  return (data.items || []).map((item) => {
    const info = item.volumeInfo || {};
    const id = item.id || "";

    // Build a guaranteed working URL: prefer infoLink > previewLink > canonical > id-based
    const infoLink      = info.infoLink || "";
    const previewLink   = info.previewLink || "";
    const canonicalLink = info.canonicalVolumeLink || "";
    const idBasedLink   = id ? `https://books.google.com/books?id=${id}` : "";
    const bookUrl       = infoLink || previewLink || canonicalLink || idBasedLink;

    return {
      id,
      title: info.title || "Untitled",
      authors: info.authors || ["Unknown author"],
      publisher: info.publisher || "",
      publishedDate: info.publishedDate || "",
      description: cleanText(info.description || ""),
      categories: info.categories || [],
      thumbnail: (info.imageLinks?.thumbnail || "").replace(/^http:/, "https:"),
      previewLink,
      infoLink,
      canonicalLink,
      bookUrl,
      source: "Google Books"
    };
  });
}

async function getGoogleBookByTitle(title) {
  const results = await searchGoogleBooks(`intitle:${title}`, 5);
  return results.find(
    (book) => book.title.toLowerCase() === title.toLowerCase()
  ) || results[0] || null;
}

// ---------------- Open Library ----------------

async function searchOpenLibrary(query, limit = 8) {
  const fields = [
    "key",
    "title",
    "author_name",
    "author_key",
    "first_publish_year",
    "edition_count",
    "cover_i",
    "subject"
  ].join(",");

  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("fields", fields);

  const data = await fetchJson(url.toString(), {
    headers: {
      "User-Agent": `BookRecommendationChatbot/1.0 (${APP_CONTACT_EMAIL})`
    }
  });

  return (data.docs || []).map((doc) => {
    const key = doc.key || "";
    return {
      key,
      title: doc.title || "Untitled",
      authors: doc.author_name || ["Unknown author"],
      authorKeys: doc.author_key || [],
      firstPublishYear: doc.first_publish_year || null,
      editionCount: doc.edition_count || 0,
      cover: doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
        : "",
      subjects: (doc.subject || []).slice(0, 5),
      // Always a valid URL — the work page on Open Library
      bookUrl: key ? `https://openlibrary.org${key}` : "",
      source: "Open Library"
    };
  });
}

// ---------------- Wikipedia / MediaWiki ----------------

async function wikipediaSearch(query, limit = 5) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "opensearch");
  url.searchParams.set("search", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("namespace", "0");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const data = await fetchJson(url.toString());

  return {
    titles: data[1] || [],
    descriptions: data[2] || [],
    urls: data[3] || []
  };
}

async function wikipediaSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;

  try {
    const data = await fetchJson(url);
    return {
      title: data.title || title,
      description: data.description || "",
      extract: data.extract || "",
      url: data.content_urls?.desktop?.page ||
        `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`
    };
  } catch {
    return null;
  }
}

// ---------------- Intent detection ----------------

function extractAfter(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function detectIntent(message) {
  const text = message.trim();
  const lower = text.toLowerCase();

  if (!text) return { type: "help", query: "" };

  const authorQuery = extractAfter(text, [
    /who\s+(?:is|was)\s+(?:the\s+)?author\s+(?:of\s+)?(.+)/i,
    /author\s+(?:of\s+)?(.+)/i,
    /tell\s+me\s+about\s+the\s+author\s+(?:of\s+)?(.+)/i
  ]);

  if (authorQuery) {
    return { type: "author", query: authorQuery.replace(/[?.]+$/, "") };
  }

  const bookQuery = extractAfter(text, [
    /tell\s+me\s+about\s+(.+)/i,
    /details\s+(?:of|about)\s+(.+)/i,
    /information\s+(?:on|about)\s+(.+)/i,
    /what\s+is\s+(.+)/i,
    /about\s+the\s+book\s+(.+)/i
  ]);

  if (bookQuery && !lower.includes("recommend")) {
    return { type: "book", query: bookQuery.replace(/[?.]+$/, "") };
  }

  const recommendationQuery = extractAfter(text, [
    /recommend\s+(?:some\s+)?books?\s+(?:on|about|for)\s+(.+)/i,
    /books?\s+(?:on|about)\s+(.+)/i,
    /find\s+(?:some\s+)?books?\s+(?:on|about|for)\s+(.+)/i,
    /suggest\s+(?:some\s+)?books?\s+(?:on|about|for)\s+(.+)/i
  ]);

  if (recommendationQuery) {
    return { type: "recommend", query: recommendationQuery.replace(/[?.]+$/, "") };
  }

  if (
    lower.includes("recommend") ||
    lower.includes("suggest") ||
    lower.includes("find books") ||
    lower.includes("book recommendation")
  ) {
    return {
      type: "recommend",
      query: text
        .replace(/recommend|suggest|books?|find/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
    };
  }

  if (lower.includes("who is") || lower.includes("author")) {
    return { type: "author", query: text };
  }

  return { type: "search", query: text };
}

// ---------------- Normalise book shape ----------------
// Converts any raw Google Books or Open Library object into a unified
// shape that the frontend can rely on — every book will have bookUrl.

function normaliseBook(book) {
  return {
    title:         book.title || "Untitled",
    authors:       book.authors || ["Unknown author"],
    publisher:     book.publisher || "",
    publishedDate: book.publishedDate || book.firstPublishYear || "",
    description:   book.description || "",
    categories:    book.categories || book.subjects || [],
    thumbnail:     book.thumbnail || book.cover || "",
    // bookUrl is the primary clickable link sent to the frontend.
    // Google Books sets it from infoLink/previewLink/canonicalLink/id-based URL.
    // Open Library sets it from the /works/... key.
    bookUrl:       book.bookUrl || book.previewLink || "",
    source:        book.source || ""
  };
}

// ---------------- API routes ----------------

app.post("/api/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();

  if (!message) {
    return res.status(400).json({ error: "Please enter a message." });
  }

  const intent = detectIntent(message);

  try {
    if (intent.type === "help") {
      return res.json({
        type: "help",
        message:
          'Try: "Recommend books on Python", "Tell me about Python Crash Course", or "Who is the author of The Alchemist?"'
      });
    }

    if (intent.type === "recommend" || intent.type === "search") {
      const query = intent.query || message;

      const [google, openLibrary] = await Promise.all([
        searchGoogleBooks(query, 8).catch(() => []),
        searchOpenLibrary(query, 8).catch(() => [])
      ]);

      const combined = [];
      const seen = new Set();

      for (const book of [...google, ...openLibrary]) {
        const key = book.title.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          combined.push(normaliseBook(book));
        }
      }

      return res.json({
        type: "recommendations",
        query,
        message: combined.length
          ? `I found ${combined.length} book${combined.length === 1 ? "" : "s"} related to "${query}".`
          : `I couldn't find books for "${query}". Try a broader topic.`,
        books: combined.slice(0, 10)
      });
    }

    if (intent.type === "book") {
      const query = intent.query;

      const [google, openLibrary] = await Promise.all([
        getGoogleBookByTitle(query).catch(() => null),
        searchOpenLibrary(query, 5).catch(() => [])
      ]);

      let book = google ? normaliseBook(google) : null;

      if (!book && openLibrary.length) {
        book = normaliseBook(openLibrary[0]);
      }

      if (!book) {
        return res.json({
          type: "text",
          message: `I couldn't find detailed information for "${query}". Try the exact book title.`
        });
      }

      const wiki = await wikipediaSummary(firstAuthor(book.authors)).catch(() => null);

      return res.json({
        type: "book",
        message: `Here are the details I found for "${book.title}".`,
        book,
        authorInfo: wiki
          ? {
              title: wiki.title,
              extract: wiki.extract,
              url: wiki.url
            }
          : null
      });
    }

    if (intent.type === "author") {
      const authorQuery = intent.query
        .replace(/^the\s+/i, "")
        .replace(/[?.]+$/, "")
        .trim();

      const wikiSearchResult = await wikipediaSearch(authorQuery, 5);

      let summary = null;
      for (const title of wikiSearchResult.titles) {
        summary = await wikipediaSummary(title);
        if (summary?.extract) break;
      }

      const openAuthors = await searchOpenLibrary(authorQuery, 5).catch(() => []);

      return res.json({
        type: "author",
        message: summary?.extract
          ? `Here is background information about "${summary.title}".`
          : `I searched for information about "${authorQuery}".`,
        author: authorQuery,
        wiki: summary,
        openLibrary: openAuthors.slice(0, 3).map(normaliseBook)
      });
    }

    return res.json({
      type: "text",
      message: "I can search for books, give book details, and find author information."
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Something went wrong while contacting the book APIs.",
      details: error.message
    });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", service: "Book Recommendation Chatbot" });
});

app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Book Recommendation Chatbot running at http://localhost:${PORT}`);
});