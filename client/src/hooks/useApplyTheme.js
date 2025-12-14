import { useEffect } from "react";

export default function useApplyTheme(theme) {
  useEffect(() => {
    if (!theme) return;

    const root = document.documentElement;

    if (theme.background)
      root.style.setProperty("--bg", theme.background);

    if (theme.text)
      root.style.setProperty("--text", theme.text);

    if (theme.primary)
      root.style.setProperty("--primary", theme.primary);

    // optional but recommended
    root.style.setProperty("--secondary", "#111");
  }, [theme]);
}
