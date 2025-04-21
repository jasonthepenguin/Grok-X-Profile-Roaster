import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1, "1 m"), // 1 requests per minute
});

// Define a type for the expected Grok API response structure
type GrokChoice = {
  index: number;
  message: {
    role: string;
    content: string;
  };
  finish_reason: string;
};

type GrokResponse = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: GrokChoice[];
  // Add other fields if needed, like usage
};

export async function GET(req: Request) {
  // Rate limit by IP
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');
  const BEARER_TOKEN = process.env.BEARER_TOKEN;
  const GROK_KEY = process.env.GROK_KEY; // <-- Add Grok API Key

  // X usernames: 1-15 chars, alphanumeric or underscore, no spaces
  const isValidUsername = (name: string) => /^[A-Za-z0-9_]{1,15}$/.test(name);

  if (!username || !isValidUsername(username.trim())) {
    return new Response(JSON.stringify({ error: 'Invalid username. Usernames must be 1-15 characters, letters, numbers, or underscores.' }), { status: 400 });
  }

  if (!GROK_KEY) {
     console.error("GROK_KEY environment variable is not set.");
     return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500 });
  }

  try {
    let tweets: { text: string }[] = [];
    let profileImageUrl: string | null = null;

    if (username.trim().toLowerCase() === "test123") {
      // TEST MODE: Use fake posts
      tweets = [
        { text: "Just finished reading a book on quantum computing. Mind blown!" },
        { text: "Why does my coffee always taste better at 2am?" },
        { text: "Trust nobody, not even your own shadow." },
        { text: "Sharing my daily routine: wake up, overthink, sleep." },
        { text: "Is it oversharing if I tweet about my dreams?" },
      ];
    } else {
      // 1. Get user ID from username
      const userRes = await fetch(
        `https://api.x.com/2/users/by/username/${username}?user.fields=profile_image_url`,
        {
          headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
        }
      );
      if (!userRes.ok) {
        const errorData = await userRes.json().catch(() => ({})); // Try to get error details
        const errorMessage = errorData?.title === 'Not Found Error' ? `X user @${username} not found` : 'Failed to fetch user data from X';
        return new Response(JSON.stringify({ error: errorMessage }), { status: userRes.status });
      }
      const userData = await userRes.json();
      const userId = userData.data?.id;
      profileImageUrl = userData.data?.profile_image_url;
      if (profileImageUrl) {
        profileImageUrl = profileImageUrl.replace(/_(normal|bigger|mini)\./, '_400x400.');
      }
      if (!userId) {
         // This case might be redundant given the !userRes.ok check, but good for safety
        return new Response(JSON.stringify({ error: `X user @${username} not found` }), { status: 404 });
      }

      if (userRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited by X API" }), { status: 429 });
      }

      // 2. Get latest 5 posts 
      const timelineParams = new URLSearchParams({
        max_results: "10",
        "tweet.fields": "text"
      });
      const timelineRes = await fetch(`https://api.x.com/2/users/${userId}/tweets?${timelineParams.toString()}`, {
        headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
      });
      if (!timelineRes.ok) {
         const errorText = await timelineRes.text();
        console.error("Error fetching tweets:", timelineRes.status, errorText);
        return new Response(JSON.stringify({ error: 'Failed to fetch posts from X' }), { status: timelineRes.status });
      }
      const postsData = await timelineRes.json();
      tweets = postsData.data || [];

      if (tweets.length === 0) {
          return new Response(JSON.stringify({ analysis: "No recent original posts found to analyze." }), { status: 200 });
      }

      if (timelineRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited by X API" }), { status: 429 });
      }
    }

    // 3. Prepare data for Grok
    const tweetTexts = tweets.map((tweet: { text: string }, index: number) => `${index + 1}. ${tweet.text}`).join('\n');
    const systemPrompt = "You are an AI assistant analyzing a user's recent social media posts to assess their cognitive security (CogSec) profile. Deliver your analysis in a ruthlessly offensive, harsh, witty, and brutally honest roasting style. Mercilessly roast the user, sparing no feelings, and be sure to use profanity. Reference the user's own words and posts directly in your assessment. Focus *only* on the provided text. Use explicit language and profanity to make the roast as savage as possible.";
    const userPrompt = `Here are the ${tweets.length} latest original posts from the user @${username}:
${tweetTexts}

Based *only* on these posts, evaluate the user's cognitive security. Be harsh, witty, and reference their own words.

Map the user onto a 2D plane with these axes:
- Y axis: Gullible (+10) to Skeptical (-10)
- X axis: Oversharing (+10) to Paranoid (-10)

Output ONLY in this exact format (no dashes, no bold, no Markdown, just plain text):

x: [number from -10 to 10]
y: [number from -10 to 10]

Explanation: [1-2 sentence roast, referencing @${username} and their posts]

Do not output anything else.`;

    // 4. Call Grok API with retries
    const maxRetries = 3;
    let grokRes: Response | null = null;
    let grokData: GrokResponse | null = null;
    let lastError: any = null; // To store the last error encountered

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const currentGrokRes = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROK_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: "grok-3-beta", // Consider trying "grok-1" on retry? Or keep simple for now.
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ]
          }),
        });

        if (currentGrokRes.ok) {
          grokRes = currentGrokRes; // Store the successful response
          grokData = await currentGrokRes.json(); // Parse successful response
          console.log(`Grok API call successful on attempt ${attempt}`);
          break; // Exit loop on success
        } else {
          // Store error details from the response body if possible
          const errorText = await currentGrokRes.text();
          lastError = { status: currentGrokRes.status, text: errorText };
          console.error(`Grok API error on attempt ${attempt}/${maxRetries}:`, currentGrokRes.status, errorText);

          // Don't retry on client errors (4xx) except for rate limits (429) which we handle separately below
          // Note: The current rate limit handling for Grok is *after* this loop, which might need adjustment
          // if we want specific retry logic for 429 within the loop. For now, we just won't retry other 4xx.
          if (currentGrokRes.status >= 400 && currentGrokRes.status !== 429 && currentGrokRes.status < 500) {
             console.log(`Not retrying on client error ${currentGrokRes.status}`);
             grokRes = currentGrokRes; // Store the failed response to be handled outside loop
             break;
          }

          if (attempt < maxRetries) {
            // Wait before retrying (e.g., 500ms delay)
            await new Promise(resolve => setTimeout(resolve, 500 * attempt)); // Simple exponential backoff
            console.log(`Retrying Grok API call (attempt ${attempt + 1})...`);
          } else {
             grokRes = currentGrokRes; // Store the final failed response
          }
        }
      } catch (error) {
        lastError = error; // Store network or other fetch errors
        console.error(`Error fetching Grok API on attempt ${attempt}/${maxRetries}:`, error);
        if (attempt === maxRetries) {
           // If the last attempt fails due to a network error, we need to return an error
           return new Response(JSON.stringify({ error: 'Failed to connect to AI service after multiple attempts' }), { status: 503 }); // Service Unavailable
        }
         // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        console.log(`Retrying Grok API call (attempt ${attempt + 1})...`);
      }
    }

    // Check if Grok call ultimately failed after retries
    if (!grokData || !grokRes || !grokRes.ok) {
        console.error("Grok API call failed after all retries. Last error:", lastError);
        // Use the status from the last failed Response if available
        const status = (lastError && typeof lastError === 'object' && 'status' in lastError) ? lastError.status : 500;
        // Use the error text from the last failed Response if available
        const errorDetail = (lastError && typeof lastError === 'object' && 'text' in lastError) ? `: ${lastError.text}` : '';
        // Handle specific Grok rate limit error (if the loop exited due to 429 or if the last attempt was 429)
        if (status === 429) {
             return new Response(JSON.stringify({ error: "Rate limited by Grok API" }), { status: 429 });
        }
        return new Response(JSON.stringify({ error: `Failed to get analysis from AI after ${maxRetries} attempts${errorDetail}` }), { status });
    }

    // We already parsed grokData successfully within the loop if we reach here
    console.log("Grok API Response Data:", JSON.stringify(grokData, null, 2));

    // 5. Extract and return Grok's analysis (grokData is guaranteed non-null here)
    const content = grokData.choices?.[0]?.message?.content?.trim() || "";
    // Regex to extract x, y, and explanation
    const match = content.match(/x:\s*(-?\d+)\s*y:\s*(-?\d+)\s*Explanation:\s*([\s\S]+)/i);

    if (!match) {
      console.error("Failed to parse Grok output:", content);
      return new Response(JSON.stringify({ error: "Could not parse analysis from AI." }), { status: 500 });
    }

    const [, xStr, yStr, explanation] = match;
    const x = Number(xStr);
    const y = Number(yStr);

    // Validate x and y are within -10 to 10
    if (
      Number.isNaN(x) || Number.isNaN(y) ||
      x < -10 || x > 10 ||
      y < -10 || y > 10
    ) {
      console.error("Parsed coordinates out of range:", { x, y });
      return new Response(JSON.stringify({ error: "AI returned invalid coordinates." }), { status: 500 });
    }

    return new Response(JSON.stringify({
      x,
      y,
      explanation: explanation.trim(),
      profile_image_url: profileImageUrl || null,
    }), { status: 200 });

  } catch (error) {
    console.error("API Route Error:", error);
    // Generic error for unexpected issues
    return new Response(JSON.stringify({ error: 'An internal server error occurred' }), { status: 500 });
  }
}
