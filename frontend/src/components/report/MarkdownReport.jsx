import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MarkdownReport({ content }) {
  if (!content) return null;
  return (
    <div className="prose-report max-w-none">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
