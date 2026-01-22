"use client";

interface Props {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function GherkinEditor({ value, onChange, readOnly }: Props) {
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder={`Feature: User Authentication

Scenario: Successful login with valid credentials
  Given the user is on the login page
  When the user enters valid credentials
  And clicks the login button
  Then the user should be redirected to the dashboard
  And a welcome message should be displayed`}
        className="w-full h-96 px-4 py-3 font-mono text-sm border border-[hsl(var(--border))] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-slate-50"
        spellCheck={false}
      />
      {readOnly && (
        <div className="absolute inset-0 pointer-events-none">
          <GherkinHighlighted text={value} />
        </div>
      )}
    </div>
  );
}

function GherkinHighlighted({ text }: { text: string }) {
  const highlighted = text
    .split("\n")
    .map((line, i) => {
      let className = "";
      const trimmed = line.trim();

      if (
        trimmed.startsWith("Feature:") ||
        trimmed.startsWith("Scenario:") ||
        trimmed.startsWith("Scenario Outline:") ||
        trimmed.startsWith("Background:") ||
        trimmed.startsWith("Examples:")
      ) {
        className = "gherkin-keyword";
      } else if (
        trimmed.startsWith("Given") ||
        trimmed.startsWith("When") ||
        trimmed.startsWith("Then") ||
        trimmed.startsWith("And") ||
        trimmed.startsWith("But")
      ) {
        className = "gherkin-step";
      } else if (trimmed.startsWith("@")) {
        className = "gherkin-tag";
      } else if (trimmed.startsWith("#")) {
        className = "gherkin-comment";
      }

      return (
        <div key={i} className={className}>
          {line || "\u00A0"}
        </div>
      );
    });

  return (
    <div className="w-full h-96 px-4 py-3 font-mono text-sm overflow-auto whitespace-pre">
      {highlighted}
    </div>
  );
}

export function GherkinDisplay({ text }: { text: string }) {
  if (!text) {
    return (
      <div className="text-[hsl(var(--muted-foreground))] italic">
        No scenarios defined
      </div>
    );
  }

  const lines = text.split("\n");

  return (
    <div className="font-mono text-sm bg-slate-50 rounded-md p-4 overflow-auto">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        let className = "";

        if (
          trimmed.startsWith("Feature:") ||
          trimmed.startsWith("Scenario:") ||
          trimmed.startsWith("Scenario Outline:") ||
          trimmed.startsWith("Background:") ||
          trimmed.startsWith("Examples:")
        ) {
          className = "text-purple-600 font-semibold";
        } else if (
          trimmed.startsWith("Given") ||
          trimmed.startsWith("When") ||
          trimmed.startsWith("Then") ||
          trimmed.startsWith("And") ||
          trimmed.startsWith("But")
        ) {
          className = "text-blue-600";
        } else if (trimmed.startsWith("@")) {
          className = "text-cyan-600";
        } else if (trimmed.startsWith("#")) {
          className = "text-gray-400 italic";
        } else if (trimmed.startsWith("|")) {
          className = "text-green-600";
        }

        return (
          <div key={i} className={className}>
            {line || "\u00A0"}
          </div>
        );
      })}
    </div>
  );
}
