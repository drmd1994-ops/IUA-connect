'use client';

import { Markdown } from '@tiptap/markdown';
import { type Editor, EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';

type Props = {
  label: string;
  /** Markdown the editor starts with. Later changes come only from typing. */
  initial: string;
  onChange: (markdown: string) => void;
  lang: 'he' | 'en';
  disabled?: boolean;
};

/**
 * The article editor (M3 plan §11): what-you-see editing that saves Markdown. Only the elements
 * the API keeps are offered (headings, lists, bold, italic, quotes, links); the API sanitises
 * every save anyway. Standard keyboard shortcuts work (Ctrl/⌘+B, +I, +Z).
 */
export function MarkdownEditor({ label, initial, onChange, lang, disabled = false }: Props) {
  const labelId = useId();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        strike: false,
        underline: false,
        link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] },
      }),
      Markdown,
    ],
    content: initial,
    contentType: 'markdown',
    editable: !disabled,
    // Rendered after hydration: the server has no document to draw the editor in.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': labelId,
        lang,
        dir: lang === 'he' ? 'rtl' : 'ltr',
        class: 'rich-text min-h-64 px-3 py-2.5 text-base text-text focus:outline-none',
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getMarkdown()),
  });

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="font-semibold text-text">
        {label}
      </span>
      <div className="rounded-md border border-neutral-400 bg-surface focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">
        {editor && !disabled && <Toolbar editor={editor} />}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const t = useTranslations('content.adminNews.editor.toolbar');
  const [linking, setLinking] = useState(false);
  const [url, setUrl] = useState('');
  const urlId = useId();
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  function applyLink() {
    const address = url.trim();
    if (/^(https?:\/\/|mailto:)/i.test(address)) {
      chain().extendMarkRange('link').setLink({ href: address }).run();
    }
    setLinking(false);
    setUrl('');
  }

  return (
    <div className="border-b border-border">
      <div role="toolbar" aria-label={t('label')} className="flex flex-wrap gap-1 p-1.5">
        <Tool pressed={active.bold} onClick={() => chain().toggleBold().run()}>
          {t('bold')}
        </Tool>
        <Tool pressed={active.italic} onClick={() => chain().toggleItalic().run()}>
          {t('italic')}
        </Tool>
        <Tool pressed={active.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
          {t('h2')}
        </Tool>
        <Tool pressed={active.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
          {t('h3')}
        </Tool>
        <Tool pressed={active.bulletList} onClick={() => chain().toggleBulletList().run()}>
          {t('bulletList')}
        </Tool>
        <Tool pressed={active.orderedList} onClick={() => chain().toggleOrderedList().run()}>
          {t('orderedList')}
        </Tool>
        <Tool pressed={active.quote} onClick={() => chain().toggleBlockquote().run()}>
          {t('quote')}
        </Tool>
        <Tool
          pressed={active.link || linking}
          onClick={() => {
            setUrl((editor.getAttributes('link').href as string | undefined) ?? '');
            setLinking((value) => !value);
          }}
        >
          {t('link')}
        </Tool>
        {active.link && (
          <Tool onClick={() => chain().extendMarkRange('link').unsetLink().run()}>
            {t('linkRemove')}
          </Tool>
        )}
        <Tool disabled={!active.undo} onClick={() => chain().undo().run()}>
          {t('undo')}
        </Tool>
        <Tool disabled={!active.redo} onClick={() => chain().redo().run()}>
          {t('redo')}
        </Tool>
      </div>
      {linking && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border p-2">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor={urlId} className="text-sm font-semibold">
              {t('linkUrl')}
            </label>
            <input
              id={urlId}
              type="url"
              dir="ltr"
              value={url}
              placeholder="https://"
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyLink();
                }
              }}
              className="rounded-md border border-neutral-400 bg-surface px-3 py-1.5 text-sm"
            />
          </div>
          <Tool onClick={applyLink}>{t('linkApply')}</Tool>
        </div>
      )}
    </div>
  );
}

function Tool({
  pressed,
  disabled,
  onClick,
  children,
}: {
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-sm font-semibold disabled:opacity-50 ${
        pressed ? 'bg-primary text-on-primary' : 'text-text hover:bg-surface-muted'
      }`}
    >
      {children}
    </button>
  );
}
