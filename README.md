# Book Recommendation Chatbot

A simple full-stack chatbot using:

- Node.js
- Express.js
- HTML/CSS/JavaScript
- Google Books API
- Open Library API
- Wikipedia MediaWiki API

## 1. Requirements

Install Node.js 18 or newer.

Check:

```bash
node --version
npm --version
```

## 2. Install dependencies

Open this project folder in VS Code and run:

```bash
npm install
```

## 3. Optional environment setup

Copy `.env.example` to `.env`.

For basic public Google Books requests, the project can work without a Google API key. If you have a Google Books API key, put it in:

```text
GOOGLE_BOOKS_API_KEY=your_key_here
```

Set your contact email for Open Library identification:

```text
APP_CONTACT_EMAIL=your-email@example.com
```

Important: this project does not put API keys in frontend JavaScript.

## 4. Start the application

```bash
npm start
```

Open:

```text
http://localhost:3000
```

For development with automatic restart on supported Node versions:

```bash
npm run dev
```

## 5. Test messages

Try:

```text
Recommend books on Python
```

```text
Recommend books on machine learning
```

```text
Tell me about Python Crash Course
```

```text
Who is the author of The Alchemist?
```

```text
Tell me about Atomic Habits
```

## 6. API endpoint

The frontend sends:

```http
POST /api/chat
Content-Type: application/json
```

Example body:

```json
{
  "message": "Recommend books on Python"
}
```

## 7. Architecture

Browser
  |
  v
Express /api/chat
  |
  +--> Google Books API
  |
  +--> Open Library API
  |
  +--> Wikipedia MediaWiki API
  |
  v
Combined response
  |
  v
Chat UI

## 8. Notes

- Google Books is used for primary book details.
- Open Library supplies additional book/author information.
- Wikipedia MediaWiki supplies author/book background.
- The chatbot uses simple rule-based intent detection, so no paid LLM API is required.
- For a college project, this makes the application easy to run and explain.
