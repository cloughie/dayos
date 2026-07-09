'use client'

import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'

interface MarkdownContentProps {
  content: string
  className?: string
}

export default function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        rehypePlugins={[rehypeSanitize]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          h1: ({ children }) => <h1 className="text-base font-semibold text-white mt-3 mb-1 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-semibold text-white mt-3 mb-1 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-medium text-white mt-2 mb-1 first:mt-0">{children}</h3>,
          ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          hr: () => <hr className="border-zinc-700 my-3" />,
          code: ({ children }) => <code className="bg-zinc-800 text-zinc-300 rounded px-1 py-0.5 text-xs font-mono">{children}</code>,
          pre: ({ children }) => <pre className="bg-zinc-800 text-zinc-300 rounded-lg p-3 mb-2 text-xs font-mono overflow-x-auto">{children}</pre>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-zinc-600 pl-3 text-zinc-400 mb-2">{children}</blockquote>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
