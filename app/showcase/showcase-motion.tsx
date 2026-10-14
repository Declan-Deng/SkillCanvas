"use client";

import { useEffect } from "react";

export function ShowcaseMotion() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(".sc-page [data-sc-reveal]"));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      elements.forEach((element) => element.setAttribute("data-sc-visible", "true"));
      return;
    }

    document.documentElement.classList.add("sc-motion-ready");

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.setAttribute("data-sc-visible", "true");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );

    elements.forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("sc-motion-ready");
    };
  }, []);

  return null;
}
