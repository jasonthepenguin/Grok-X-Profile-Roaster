# CogSec Checker

Get your official CogSec ranking—User or Wojak—by having your X (Twitter) posts ruthlessly roasted and analyzed by AI.

[Live Demo](https://cogseccheck.vercel.app/)

---

## What is this?

**CogSec Checker** is a web app that analyzes a user's recent X (Twitter) posts to assess their "cognitive security" (CogSec) profile. The app uses the Grok API from xAI to generate a brutally honest, witty, and offensive roast, mapping the user on a 2D plane:

- **Y axis:** Gullible (+10) to Skeptical (-10)
- **X axis:** Oversharing (+10) to Paranoid (-10)

All in good fun—this site is for entertainment purposes only!

---

## Features

- 🔥 **Savage AI Roasts:** Get a no-holds-barred, profanity-laced analysis of your X posts.
- 📊 **CogSec Map:** Visualizes your position on the Gullible/Skeptical and Oversharing/Paranoid axes.
- 🖼️ **Profile Image:** Displays your X profile picture (or Wojak if not found).
- ⚡ **Fast & Serverless:** Built with Next.js, deployed on Vercel.
- 🛡️ **Privacy:** No data is stored; all requests are processed anonymously.

---

## How it works

1. Enter an X (Twitter) username (without the `@`).
2. The app fetches the user's latest posts and profile image.
3. Posts are sent to the Grok API for analysis.
4. The AI returns a roast and a coordinate (x, y) for the CogSec map.
5. See your result visualized and get your official CogSec label.

---

## Tech Stack

- [Next.js](https://nextjs.org/) (App Router)
- [React](https://react.dev/)
- [Recharts](https://recharts.org/) (for the CogSec map)
- [Upstash Redis](https://upstash.com/) (for rate limiting)
- [Tailwind CSS](https://tailwindcss.com/) (for styling)
- [Grok API (xAI)](https://x.ai/) (for AI analysis)
- Deployed on [Vercel](https://vercel.com/)

---

## Local Development

1. **Clone the repo:**
   ```bash
   git clone https://github.com/yourusername/grok-x-roaster.git
   cd grok-x-roaster
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**

   Create a `.env.local` file with the following (get your own API keys):

   ```
   BEARER_TOKEN=your_x_api_bearer_token
   GROK_KEY=your_grok_api_key
   UPSTASH_REDIS_REST_URL=your_upstash_redis_url
   UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token
   ```

4. **Run the dev server:**
   ```bash
   npm run dev
   ```

5. Visit [http://localhost:3000](http://localhost:3000)

---

## Deployment

This app is deployed on Vercel:  
👉 [https://cogseccheck.vercel.app/](https://cogseccheck.vercel.app/)

To deploy your own, push to GitHub and connect the repo to Vercel. Set the same environment variables in your Vercel dashboard.

---

## Disclaimer

We do **not** store your data. All requests are processed anonymously.  
Your posts will be analyzed using the Grok API from xAI.  
This site is for entertainment purposes only.
