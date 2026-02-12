declare global {
  interface Window {
    MathJax?: {
      typesetPromise?: (elements?: (HTMLElement | string)[]) => Promise<void>;
    };
  }
}

let mathJaxLoading: Promise<void> | null = null;

function ensureLoader(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.MathJax) return Promise.resolve();
  if (!window.MathJax) {
    (window as any).MathJax = {
      tex: { inlineMath: [["\\(", "\\)"], ["$", "$"]] },
      options: { skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"] },
    };
  }
  if (mathJaxLoading) return mathJaxLoading;

  mathJaxLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("MathJax failed to load"));
    document.head.appendChild(script);
  });

  return mathJaxLoading;
}

export async function typesetMath(target?: HTMLElement | null) {
  await ensureLoader();
  if (typeof window === "undefined") return;
  if (window.MathJax?.typesetPromise) {
    await window.MathJax.typesetPromise(target ? [target] : undefined);
  }
}

export async function useMathJaxTypeset(target?: HTMLElement | null) {
  await typesetMath(target);
}
