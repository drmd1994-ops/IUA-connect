import ReactMarkdown, { type Components } from 'react-markdown';

const link = 'font-semibold text-primary underline underline-offset-4';

const components: Components = {
  // The page title is the only level-1 heading; bodies start at level 2 (the API enforces it).
  h1: ({ children }) => <h2 className="mt-8 text-2xl font-semibold text-brand-900">{children}</h2>,
  h2: ({ children }) => <h2 className="mt-8 text-2xl font-semibold text-brand-900">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-6 text-xl font-semibold text-text">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-4 text-lg font-semibold text-text">{children}</h4>,
  p: ({ children }) => <p className="mt-4 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mt-4 list-disc ps-6">{children}</ul>,
  ol: ({ children }) => <ol className="mt-4 list-decimal ps-6">{children}</ol>,
  li: ({ children }) => <li className="mt-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mt-4 border-s-4 border-border ps-4 text-text-muted">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="mt-6 border-border" />,
  code: ({ children }) => (
    <code dir="ltr" className="rounded-sm bg-surface-muted px-1 py-0.5 text-sm">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre dir="ltr" className="mt-4 overflow-x-auto rounded-md bg-surface-muted p-4 text-sm">
      {children}
    </pre>
  ),
  a: ({ href, children }) => (
    <a href={href} className={link} rel="noopener noreferrer">
      {children}
    </a>
  ),
};

/**
 * Renders an article body. The API stores sanitised Markdown (M3 plan §11); here it becomes
 * React elements, never raw HTML: react-markdown ignores embedded HTML and drops unsafe link
 * schemes, and images are not allowed in bodies.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-text">
      <ReactMarkdown components={components} disallowedElements={['img']} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
