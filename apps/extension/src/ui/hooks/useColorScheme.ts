import { useEffect, useState } from "react";

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function useColorScheme(): "light" | "dark" {
  const [scheme, setScheme] = useState<"light" | "dark">(() =>
    window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light",
  );

  useEffect(() => {
    const mql = window.matchMedia(MEDIA_QUERY);
    const handler = (e: MediaQueryListEvent) => {
      setScheme(e.matches ? "dark" : "light");
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return scheme;
}
