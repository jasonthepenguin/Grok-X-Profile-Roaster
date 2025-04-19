"use client";
import { useState } from "react";
import Image from "next/image";

export default function Home() {
  const [username, setUsername] = useState("");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validateUsername = (name: string) => {
    // X usernames: 1-15 chars, alphanumeric or underscore, no spaces
    return /^[A-Za-z0-9_]{1,15}$/.test(name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setAnalysis(null);
    if (!validateUsername(username.trim())) {
      setError("Invalid username. Usernames must be 1-15 characters, letters, numbers, or underscores.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/x-user-posts?username=${username.trim()}`);
      const data = await res.json();
      if (res.ok) {
        setAnalysis(data.analysis);
      } else if (res.status === 429) {
        setError(data.error || "Whoa! Too many requests. Try again in a minute.");
      } else {
        setError(data.error || `Error ${res.status}: Failed to get analysis`);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError("Failed to fetch analysis. Check console for details.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-[#111] font-mono">
      {/* Site Title */}
      <h1 className="text-4xl font-bold mb-1 text-green-400 drop-shadow-[0_0_8px_#00ff00] tracking-tight select-none">
        CogSec Checker
      </h1>
      <p className="mb-4 text-green-200 text-lg italic select-none">
        Get your official CogSec ranking
      </p>
      {/* Wojak Image */}
      <div
        className="w-36 h-36 rounded-full border-4 border-green-400 mb-6 flex items-center justify-center bg-white shadow-[0_0_16px_#00ff00]"
        style={{ display: "inline-flex" }}
      >
        <Image
          src="/wojak.png"
          alt="Wojak"
          width={128}
          height={128}
          className="w-32 h-32 rounded-full object-cover"
          style={{ imageRendering: "pixelated" }}
        />
      </div>
      <div className="bg-[#181f18] border border-green-700 rounded-lg shadow-lg p-6 w-full max-w-xl">
        <form onSubmit={handleSubmit} className="mb-4 flex flex-col sm:flex-row gap-2 w-full">
          <input
            type="text"
            placeholder="Enter X username (without @)"
            value={username}
            onChange={e => setUsername(e.target.value.replace(/^@/, ''))}
            className="border border-green-700 bg-black text-green-300 placeholder-green-600 p-2 rounded flex-1 shadow focus:outline-none focus:ring-2 focus:ring-green-400 font-mono"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading}
            className="p-2 bg-green-700 hover:bg-green-600 text-black font-bold rounded shadow font-mono border border-green-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Analyzing..." : "Get CogSecced"}
          </button>
        </form>
        {loading && <p className="text-green-400 font-medium animate-pulse">Loading CogSec analysis...</p>}
        {error && <p className="text-red-400 font-medium">{error}</p>}

        {analysis && !loading && !error && (
          <div className="w-full mt-4 p-4 bg-[#101510] rounded shadow-sm text-green-200 font-mono whitespace-pre-wrap border border-green-900">
            <h3 className="text-lg font-semibold mb-2 text-green-400">CogSec Analysis for @{username}:</h3>
            {analysis}
          </div>
        )}
      </div>
      {/* Creator Reference */}
      <footer className="mt-24 flex flex-col items-center">
        <a
          href="https://x.com/JasonBotterill3"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 bg-[#181f18] border border-green-700 rounded-full px-4 py-2 shadow-lg hover:shadow-[0_0_16px_#00ff00] transition"
        >
          <Image
            src="/jason.jpg"
            alt="JB"
            width={56}
            height={56}
            className="w-14 h-14 rounded-full border-2 border-green-400 object-cover"
            style={{ imageRendering: "auto" }}
          />
          <span className="text-green-300 font-mono font-semibold text-lg flex items-center">
            Created by <span className="text-green-400 ml-1">JB</span>
            {/* Blue Check */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="ml-2 w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              style={{ color: "#1DA1F2", filter: "drop-shadow(0 0 4px #1DA1F2)" }}
              aria-label="Verified"
            >
              <circle cx="12" cy="12" r="10" fill="#1DA1F2" />
              <path
                d="M9.5 12.5l2 2 4-4"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </a>
      </footer>
      {/* Data Disclaimer */}
      <p className="mt-2 text-xs text-green-700 text-center max-w-xs">
        We do not store your data. All requests are processed anonymously.<br />
        Your posts will be analyzed using the Grok API from xAI.<br />
        <span className="italic">This site is for entertainment purposes only.</span>
      </p>
    </div>
  );
}
