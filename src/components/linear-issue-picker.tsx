"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  state: { name: string; color: string };
}

interface LinkedIssue {
  id: string;
  identifier: string;
  title: string;
}

interface SingleSelectProps {
  multiple?: false;
  value: LinkedIssue | null;
  onChange: (issue: LinkedIssue | null) => void;
  values?: never;
  onMultiChange?: never;
}

interface MultiSelectProps {
  multiple: true;
  values: LinkedIssue[];
  onMultiChange: (issues: LinkedIssue[]) => void;
  value?: never;
  onChange?: never;
}

type Props = (SingleSelectProps | MultiSelectProps) & {
  placeholder?: string;
  className?: string;
  workspace?: string;
};

export function LinearIssuePicker(props: Props) {
  const { multiple, placeholder = "Search issues...", className, workspace } = props;

  const [search, setSearch] = useState("");
  const [issues, setIssues] = useState<LinearIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle single-select value display
  const singleValue = !multiple ? props.value : null;
  // Handle multi-select values
  const multiValues = multiple ? props.values : [];

  // Debounced search
  const searchIssues = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/linear/issues?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setIssues(data);
      }
    } catch (e) {
      console.error("Failed to fetch issues:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search || isOpen) {
        searchIssues(search);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, isOpen, searchIssues]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = (issue: LinearIssue) => {
    const linkedIssue: LinkedIssue = {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
    };

    if (multiple) {
      // Check if already selected
      const exists = multiValues.some((i) => i.id === issue.id);
      if (!exists) {
        props.onMultiChange([...multiValues, linkedIssue]);
      }
      setSearch("");
    } else {
      props.onChange(linkedIssue);
      setSearch("");
      setIsOpen(false);
    }
  };

  const handleRemove = (issueId: string) => {
    if (multiple) {
      props.onMultiChange(multiValues.filter((i) => i.id !== issueId));
    } else {
      props.onChange(null);
    }
  };

  const handleClear = () => {
    if (!multiple) {
      props.onChange(null);
      setSearch("");
    }
  };

  // Filter out already selected issues in multi-select mode
  const filteredIssues = multiple
    ? issues.filter((issue) => !multiValues.some((v) => v.id === issue.id))
    : issues;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Multi-select chips */}
      {multiple && multiValues.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {multiValues.map((issue) => (
            <a
              key={issue.id}
              href={workspace ? `https://linear.app/${workspace}/issue/${issue.identifier}` : `https://linear.app/issue/${issue.identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-400 rounded-md hover:bg-brand-100 dark:hover:bg-brand-950/70 transition-colors group"
            >
              <LinearIcon className="w-3 h-3" />
              <span>{issue.identifier}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRemove(issue.id);
                }}
                className="ml-0.5 p-0.5 rounded hover:bg-brand-200 dark:hover:bg-brand-800 transition-colors"
              >
                <CloseIcon className="w-3 h-3" />
              </button>
            </a>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="relative">
        <Input
          type="text"
          value={!multiple && singleValue ? `${singleValue.identifier}: ${singleValue.title}` : search}
          onChange={(e) => {
            if (!multiple && singleValue) {
              handleClear();
            }
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="pr-8"
        />
        {loading && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <LoadingIcon className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && !multiple && singleValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && filteredIssues.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-auto">
          {filteredIssues.map((issue) => (
            <button
              key={issue.id}
              type="button"
              onClick={() => handleSelect(issue)}
              className="w-full px-3 py-2 text-left hover:bg-muted transition-colors flex items-center gap-2"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: issue.state.color }}
              />
              <span className="font-medium text-sm">{issue.identifier}</span>
              <span className="text-sm text-muted-foreground truncate">
                {issue.title}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {isOpen && search && !loading && filteredIssues.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-background border border-border rounded-lg shadow-lg p-3 text-center">
          <p className="text-sm text-muted-foreground">No issues found</p>
        </div>
      )}
    </div>
  );
}

// Display component for view mode (non-editable)
export function LinkedIssuesList({ issues, workspace }: { issues: LinkedIssue[]; workspace?: string }) {
  if (issues.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">No linked issues</span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {issues.map((issue) => (
        <a
          key={issue.id}
          href={workspace ? `https://linear.app/${workspace}/issue/${issue.identifier}` : `https://linear.app/issue/${issue.identifier}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-400 rounded-md hover:bg-brand-100 dark:hover:bg-brand-950/70 transition-colors"
          title={issue.title}
        >
          <LinearIcon className="w-3 h-3" />
          <span>{issue.identifier}</span>
          <ExternalLinkIcon className="w-3 h-3 opacity-50" />
        </a>
      ))}
    </div>
  );
}

function LinearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="currentColor">
      <path d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.857L39.3342 97.1782c.6889.6889.0915 1.8189-.857 1.5765C20.0515 94.4522 5.54779 79.9485 1.22541 61.5228ZM.00189135 46.8891c-.01764973.2833.08887215.5599.29649765.7676L52.3441 99.7085c.2077.2076.4843.3141.7676.2965 1.0257-.0638 2.0396-.1591 3.0407-.2849L.264445 43.8485c-.125793 1.0011-.## 2.015-.28444865 3.0406ZM3.69348 26.0978 73.9022 96.3065c1.0024-.225 1.9951-.4823 2.9779-.7698L6.46327 23.12c-.2875.9828-.54481 1.9755-.76979 2.9778ZM11.8596 9.26355l80.8769 80.87705c.7456-.3833 1.4792-.7882 2.2005-1.2145L13.0741 7.06302c-.4263.7213-.8312 1.4549-1.2145 2.20053ZM21.3736 1.31162 98.6884 78.6264c.4588-.7012.8985-1.4165 1.3185-2.1453L23.519-.00203514c-.7288.42002-1.4441.85968-2.1454 1.31365514ZM36.0156.007816 99.9922 63.9844c.003-.763.0039-1.5269-.0019-2.2915L38.3071-.00193414C37.5425.00570386 36.7786.00375386 36.0156.007816ZM54.3777.0050364 99.995 45.6223c-.0185-.7597-.0446-1.5188-.0774-2.2775L56.6551-.00186316c-.7586-.0328-1.5178-.0589-2.2774-.00680076ZM72.579.00259976 99.9974 27.421c-.0407-.75888-.0868-1.51718-.1381-2.27495L74.8539-.136491c-.7578-.0513-1.5161-.09739-2.2749-.13908924ZM90.5044.0242779c-.0714-.74726-.1468-1.49411-.2262-2.24056l-2.2406-.225979c-.7464-.0794-1.4933-.1548-2.2405-.22619-.0014.75041.0014 1.50083.0086 2.25122.7504.0072 1.5008.01 2.2512.00858.0015.75039.0043 1.50078.0043 2.25117.7465.0014 1.4929.0058 2.2393.01C90.3496 1.52463 90.4294.775568 90.5044.0242779Z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function LoadingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}
