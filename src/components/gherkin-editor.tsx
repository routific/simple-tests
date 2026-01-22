"use client";

import { useRef, useEffect } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

// Tokenize a line into segments with their types
function tokenizeLine(line: string): { text: string; type: string }[] {
  const trimmed = line.trim();
  const leadingSpace = line.match(/^(\s*)/)?.[1] || "";
  const tokens: { text: string; type: string }[] = [];

  if (leadingSpace) {
    tokens.push({ text: leadingSpace, type: "whitespace" });
  }

  const content = line.slice(leadingSpace.length);

  // Comments
  if (trimmed.startsWith("#")) {
    tokens.push({ text: content, type: "comment" });
    return tokens;
  }

  // Tags
  if (trimmed.startsWith("@")) {
    // Split by spaces to handle multiple tags
    const parts = content.split(/(\s+)/);
    parts.forEach((part) => {
      if (part.startsWith("@")) {
        tokens.push({ text: part, type: "tag" });
      } else if (part.trim()) {
        tokens.push({ text: part, type: "tag" });
      } else {
        tokens.push({ text: part, type: "whitespace" });
      }
    });
    return tokens;
  }

  // Keywords (Feature, Scenario, etc.)
  const keywordMatch = content.match(
    /^(Feature|Scenario Outline|Scenario|Background|Examples|Rule)(:)/
  );
  if (keywordMatch) {
    tokens.push({ text: keywordMatch[1], type: "keyword" });
    tokens.push({ text: ":", type: "punctuation" });
    const rest = content.slice(keywordMatch[0].length);
    if (rest) {
      tokens.push({ text: rest, type: "string" });
    }
    return tokens;
  }

  // Steps (Given, When, Then, And, But)
  const stepMatch = content.match(/^(Given|When|Then|And|But)(\s+)/);
  if (stepMatch) {
    tokens.push({ text: stepMatch[1], type: "step" });
    tokens.push({ text: stepMatch[2], type: "whitespace" });
    const rest = content.slice(stepMatch[0].length);
    // Highlight quoted strings and <placeholders> in steps
    const restTokens = tokenizeStepContent(rest);
    tokens.push(...restTokens);
    return tokens;
  }

  // Data tables
  if (trimmed.startsWith("|")) {
    const parts = content.split(/(\|)/);
    parts.forEach((part) => {
      if (part === "|") {
        tokens.push({ text: part, type: "table-border" });
      } else if (part.trim()) {
        tokens.push({ text: part, type: "table-cell" });
      } else {
        tokens.push({ text: part, type: "whitespace" });
      }
    });
    return tokens;
  }

  // Doc strings
  if (trimmed.startsWith('"""') || trimmed.startsWith("```")) {
    tokens.push({ text: content, type: "docstring" });
    return tokens;
  }

  // Default
  if (content) {
    tokens.push({ text: content, type: "text" });
  }

  return tokens;
}

// Tokenize step content to highlight strings and placeholders
function tokenizeStepContent(content: string): { text: string; type: string }[] {
  const tokens: { text: string; type: string }[] = [];
  // Match quoted strings and <placeholders>
  const regex = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|<[^>]+>)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      tokens.push({ text: content.slice(lastIndex, match.index), type: "text" });
    }
    // The match itself
    if (match[0].startsWith("<")) {
      tokens.push({ text: match[0], type: "placeholder" });
    } else {
      tokens.push({ text: match[0], type: "string" });
    }
    lastIndex = regex.lastIndex;
  }

  // Remaining text
  if (lastIndex < content.length) {
    tokens.push({ text: content.slice(lastIndex), type: "text" });
  }

  return tokens;
}

// Get CSS class for token type
function getTokenClass(type: string): string {
  switch (type) {
    case "keyword":
      return "text-purple-600 dark:text-purple-400 font-semibold";
    case "step":
      return "text-blue-600 dark:text-blue-400 font-medium";
    case "tag":
      return "text-cyan-600 dark:text-cyan-400";
    case "comment":
      return "text-gray-500 dark:text-gray-500 italic";
    case "string":
      return "text-amber-600 dark:text-amber-400";
    case "placeholder":
      return "text-orange-500 dark:text-orange-400";
    case "table-border":
      return "text-emerald-600 dark:text-emerald-400";
    case "table-cell":
      return "text-emerald-700 dark:text-emerald-300";
    case "docstring":
      return "text-gray-600 dark:text-gray-400";
    case "punctuation":
      return "text-gray-500 dark:text-gray-400";
    default:
      return "text-foreground";
  }
}

// Render a highlighted line
function HighlightedLine({ line, lineNumber }: { line: string; lineNumber: number }) {
  const tokens = tokenizeLine(line);

  return (
    <div className="flex">
      <span className="w-10 shrink-0 text-right pr-4 text-muted-foreground/50 select-none text-xs leading-6">
        {lineNumber}
      </span>
      <span className="flex-1 leading-6">
        {tokens.length === 0 ? (
          <span>&nbsp;</span>
        ) : (
          tokens.map((token, i) => (
            <span key={i} className={getTokenClass(token.type)}>
              {token.text}
            </span>
          ))
        )}
      </span>
    </div>
  );
}

export function GherkinEditor({ value, onChange, readOnly }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Sync scroll between textarea and highlight div
  useEffect(() => {
    const textarea = textareaRef.current;
    const highlight = highlightRef.current;
    if (!textarea || !highlight) return;

    const handleScroll = () => {
      highlight.scrollTop = textarea.scrollTop;
      highlight.scrollLeft = textarea.scrollLeft;
    };

    textarea.addEventListener("scroll", handleScroll);
    return () => textarea.removeEventListener("scroll", handleScroll);
  }, []);

  const lines = value.split("\n");

  return (
    <div className="relative rounded-lg border border-border bg-[#1e1e2e] dark:bg-[#0d1117] overflow-hidden">
      {/* Highlighted background layer */}
      <div
        ref={highlightRef}
        className="absolute inset-0 overflow-hidden pointer-events-none font-mono text-sm p-3"
        aria-hidden="true"
      >
        <div className="whitespace-pre">
          {lines.map((line, i) => (
            <HighlightedLine key={i} line={line} lineNumber={i + 1} />
          ))}
        </div>
      </div>

      {/* Transparent textarea for input */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder={`Feature: User Authentication

Scenario: Successful login with valid credentials
  Given the user is on the login page
  When the user enters valid credentials
  And clicks the login button
  Then the user should be redirected to the dashboard`}
        className="relative w-full h-96 font-mono text-sm p-3 pl-[3.5rem] resize-none bg-transparent text-transparent caret-white selection:bg-blue-500/30 focus:outline-none focus:ring-2 focus:ring-brand-500/30 placeholder:text-gray-600"
        spellCheck={false}
        style={{ caretColor: "white" }}
      />
    </div>
  );
}

export function GherkinDisplay({ text }: { text: string }) {
  if (!text) {
    return (
      <div className="text-muted-foreground italic text-sm py-8 text-center">
        No scenarios defined
      </div>
    );
  }

  const lines = text.split("\n");

  return (
    <div className="rounded-lg border border-border bg-[#1e1e2e] dark:bg-[#0d1117] overflow-auto p-3">
      <div className="whitespace-pre font-mono text-sm">
        {lines.map((line, i) => (
          <HighlightedLine key={i} line={line} lineNumber={i + 1} />
        ))}
      </div>
    </div>
  );
}
