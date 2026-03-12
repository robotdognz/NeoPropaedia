import { h } from 'preact';

export interface CrossRefLinkProps {
  targetSection: string;
  targetPath?: string;
  baseUrl: string;
}

/**
 * Renders an inline cross-reference link to another Propaedia section.
 * Displays as an arrow followed by the section code (and optional sub-path)
 * in monospace, linking to the section page.
 */
export default function CrossRefLink({ targetSection, targetPath, baseUrl }: CrossRefLinkProps) {
  // Normalize the section code for URLs: slashes become hyphens
  const normalizedCode = targetSection.replace(/\//g, '-');
  const displayCode = targetSection.replace(/-/g, '/');

  const href = `${baseUrl}/section/${normalizedCode}`;

  const label = targetPath
    ? `${displayCode}.${targetPath}`
    : displayCode;

  return (
    <a
      href={href}
      class="inline-flex items-center gap-1 text-sm text-indigo-700 hover:text-indigo-900 hover:underline transition-colors duration-150 focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded"
    >
      <span class="text-gray-400 select-none" aria-hidden="true">&rarr;</span>
      <span class="font-mono text-xs">
        Section {label}
      </span>
    </a>
  );
}
