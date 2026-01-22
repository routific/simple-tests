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
        className="w-full h-96 px-4 py-3 font-mono text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none bg-muted/30 dark:bg-muted/10 text-foreground placeholder:text-muted-foreground transition-colors"
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
      <div className="text-muted-foreground italic text-sm">
        No scenarios defined
      </div>
    );
  }

  const lines = text.split("\n");

  return (
    <div className="font-mono text-sm bg-muted/30 dark:bg-muted/10 rounded-lg p-4 overflow-auto border border-border">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        let className = "text-foreground";

        if (
          trimmed.startsWith("Feature:") ||
          trimmed.startsWith("Scenario:") ||
          trimmed.startsWith("Scenario Outline:") ||
          trimmed.startsWith("Background:") ||
          trimmed.startsWith("Examples:")
        ) {
          className = "text-brand-600 dark:text-brand-400 font-semibold";
        } else if (
          trimmed.startsWith("Given") ||
          trimmed.startsWith("When") ||
          trimmed.startsWith("Then") ||
          trimmed.startsWith("And") ||
          trimmed.startsWith("But")
        ) {
          className = "text-blue-600 dark:text-blue-400";
        } else if (trimmed.startsWith("@")) {
          className = "text-cyan-600 dark:text-cyan-400";
        } else if (trimmed.startsWith("#")) {
          className = "text-muted-foreground italic";
        } else if (trimmed.startsWith("|")) {
          className = "text-emerald-600 dark:text-emerald-400";
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
