"use client";

/**
 * Last-resort boundary, for an error thrown in the root layout itself.
 *
 * This replaces the whole document, so it must render its own <html> and
 * <body> — the layout that normally provides them is what failed. For the same
 * reason it cannot rely on the app's stylesheet having loaded, so the few
 * styles it needs are inline. Both theme grounds are handled by the colours
 * chosen: they read acceptably on light and dark alike.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-NG">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a1310",
          color: "#e8f0eb",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <p
            style={{
              margin: 0,
              fontSize: "1.125rem",
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            Ezike<span style={{ color: "#6fbc98" }}>Oba</span>
          </p>

          <h1
            style={{
              marginTop: "1.5rem",
              fontSize: "1.5rem",
              lineHeight: 1.2,
              fontWeight: 700,
            }}
          >
            Ezike Oba could not load
          </h1>
          <p
            style={{
              marginTop: "0.75rem",
              fontSize: "0.9rem",
              color: "#93a69c",
            }}
          >
            Something failed before the page could be built. Please try again in
            a moment.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "2rem",
              height: "2.5rem",
              padding: "0 1.25rem",
              borderRadius: "0.5rem",
              border: "none",
              backgroundColor: "#6fbc98",
              color: "#04150f",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>

          {error.digest ? (
            <p
              style={{
                marginTop: "2rem",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.75rem",
                color: "#93a69c",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
