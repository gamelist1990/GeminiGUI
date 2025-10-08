import React, { useEffect, useState } from "react";

type Props = React.ComponentProps<any> & { children?: React.ReactNode };

export default function DynamicSyntaxHighlighter(props: Props) {
  const [Highlighter, setHighlighter] = useState<any>(null);
  const [theme, setTheme] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    // Import specific ESM entry points to reduce cross-chunk initialization order issues
    Promise.all([
      import("react-syntax-highlighter/dist/esm/prism").then((m: any) => m.default ?? m.Prism ?? m),
      import("react-syntax-highlighter/dist/esm/styles/prism/one-dark").then((m: any) => m.default ?? m.oneDark ?? m),
    ])
      .then(([PrismComp, oneDarkTheme]) => {
        if (!mounted) return;
        setHighlighter(() => PrismComp);
        setTheme(oneDarkTheme);
      })
      .catch((e) => {
        console.error("Failed to load syntax highlighter:", e);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!Highlighter || !theme) {
    return <pre className="code-loading">Loading code…</pre>;
  }

  // Highlighter is the Prism component, theme is the oneDark object
  const Component = Highlighter as any;
  return <Component style={theme} {...props} />;
}
