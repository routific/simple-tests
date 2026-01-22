"use client";

import { useState, useTransition, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GherkinEditor } from "@/components/gherkin-editor";
import {
  saveScenario,
  deleteScenario,
  reorderScenarios,
} from "@/app/cases/scenario-actions";

interface Scenario {
  id: number;
  title: string;
  gherkin: string;
  order: number;
}

interface ScenarioAccordionProps {
  testCaseId: number;
  scenarios: Scenario[];
  isEditing: boolean;
  onChange?: (scenarios: Scenario[]) => void;
}

export function ScenarioAccordion({
  testCaseId,
  scenarios: initialScenarios,
  isEditing,
  onChange,
}: ScenarioAccordionProps) {
  const [scenarios, setScenarios] = useState<Scenario[]>(initialScenarios);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(
    new Set(initialScenarios.length === 1 ? [initialScenarios[0]?.id] : [])
  );
  const [isPending, startTransition] = useTransition();
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [editingScenarioId, setEditingScenarioId] = useState<number | null>(null);
  const pendingChangesRef = useRef<Map<number, { title: string; gherkin: string }>>(new Map());

  useEffect(() => {
    setScenarios(initialScenarios);
  }, [initialScenarios]);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAddScenario = () => {
    const tempId = -Date.now();
    const newScenario: Scenario = {
      id: tempId,
      title: "New Scenario",
      gherkin: "",
      order: scenarios.length,
    };
    const newScenarios = [...scenarios, newScenario];
    setScenarios(newScenarios);
    setExpandedIds((prev) => new Set([...Array.from(prev), tempId]));
    setEditingScenarioId(tempId);
    onChange?.(newScenarios);
  };

  const handleUpdateScenario = useCallback((id: number, updates: Partial<Scenario>) => {
    setScenarios((prev) => {
      const newScenarios = prev.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      );
      onChange?.(newScenarios);
      return newScenarios;
    });

    // Track pending changes
    const existing = pendingChangesRef.current.get(id) || { title: "", gherkin: "" };
    const scenario = scenarios.find((s) => s.id === id);
    if (scenario) {
      pendingChangesRef.current.set(id, {
        title: updates.title ?? (existing.title || scenario.title),
        gherkin: updates.gherkin ?? (existing.gherkin || scenario.gherkin),
      });
    }
  }, [scenarios, onChange]);

  const handleDeleteScenario = (id: number) => {
    if (id < 0) {
      // Temp scenario, just remove from state
      const newScenarios = scenarios.filter((s) => s.id !== id);
      setScenarios(newScenarios);
      onChange?.(newScenarios);
      return;
    }

    startTransition(async () => {
      const result = await deleteScenario(id);
      if (result.success) {
        const newScenarios = scenarios.filter((s) => s.id !== id);
        setScenarios(newScenarios);
        onChange?.(newScenarios);
      }
    });
  };

  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    if (draggedId === null || draggedId === id) return;

    const draggedIndex = scenarios.findIndex((s) => s.id === draggedId);
    const targetIndex = scenarios.findIndex((s) => s.id === id);

    if (draggedIndex === targetIndex) return;

    const newScenarios = [...scenarios];
    const [removed] = newScenarios.splice(draggedIndex, 1);
    newScenarios.splice(targetIndex, 0, removed);

    // Update order values
    newScenarios.forEach((s, i) => {
      s.order = i;
    });

    setScenarios(newScenarios);
    onChange?.(newScenarios);
  };

  const handleDragEnd = () => {
    if (draggedId !== null && isEditing) {
      startTransition(async () => {
        const ids = scenarios.filter((s) => s.id > 0).map((s) => s.id);
        await reorderScenarios(testCaseId, ids);
      });
    }
    setDraggedId(null);
  };

  // Save a single scenario
  const saveScenarioItem = async (scenario: Scenario) => {
    const result = await saveScenario({
      id: scenario.id > 0 ? scenario.id : undefined,
      testCaseId,
      title: scenario.title,
      gherkin: scenario.gherkin,
      order: scenario.order,
    });

    if (result.success && result.id && scenario.id < 0) {
      // Replace temp id with real id
      setScenarios((prev) =>
        prev.map((s) => (s.id === scenario.id ? { ...s, id: result.id! } : s))
      );
    }

    return result;
  };

  // Save all scenarios (called externally)
  const saveAllScenarios = async () => {
    const results = await Promise.all(scenarios.map(saveScenarioItem));
    pendingChangesRef.current.clear();
    return results.every((r) => r.success);
  };

  // Expose save function
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as Window & { __saveScenarios?: () => Promise<boolean> }).__saveScenarios = saveAllScenarios;
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as Window & { __saveScenarios?: () => Promise<boolean> }).__saveScenarios;
      }
    };
  }, [scenarios, testCaseId]);

  if (scenarios.length === 0 && !isEditing) {
    return (
      <div className="text-sm text-muted-foreground italic py-4">
        No scenarios defined
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {scenarios.map((scenario) => (
        <div
          key={scenario.id}
          draggable={isEditing}
          onDragStart={(e) => handleDragStart(e, scenario.id)}
          onDragOver={(e) => handleDragOver(e, scenario.id)}
          onDragEnd={handleDragEnd}
          className={cn(
            "border border-border rounded-lg overflow-hidden bg-background",
            draggedId === scenario.id && "opacity-50",
            isEditing && "cursor-grab active:cursor-grabbing"
          )}
        >
          {/* Scenario Header */}
          <div
            className={cn(
              "flex items-center gap-2 p-3",
              expandedIds.has(scenario.id) && "border-b border-border"
            )}
          >
            {isEditing && (
              <DragHandleIcon className="w-4 h-4 text-muted-foreground/50 shrink-0" />
            )}
            <button
              onClick={() => toggleExpand(scenario.id)}
              className="flex-1 flex items-center gap-2 text-left"
            >
              <ChevronIcon
                className={cn(
                  "w-4 h-4 text-muted-foreground transition-transform",
                  expandedIds.has(scenario.id) && "rotate-90"
                )}
              />
              {isEditing && editingScenarioId === scenario.id ? (
                <Input
                  type="text"
                  value={scenario.title}
                  onChange={(e) => handleUpdateScenario(scenario.id, { title: e.target.value })}
                  onBlur={() => setEditingScenarioId(null)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-7 text-sm font-medium"
                  autoFocus
                />
              ) : (
                <span
                  className="font-medium text-sm text-foreground"
                  onDoubleClick={() => isEditing && setEditingScenarioId(scenario.id)}
                >
                  {scenario.title}
                </span>
              )}
            </button>
            {isEditing && (
              <button
                onClick={() => handleDeleteScenario(scenario.id)}
                disabled={isPending}
                className="p-1 text-muted-foreground hover:text-destructive transition-colors"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Scenario Content */}
          {expandedIds.has(scenario.id) && (
            <div className="p-3 bg-muted/30">
              {isEditing ? (
                <GherkinEditor
                  value={scenario.gherkin}
                  onChange={(value) => handleUpdateScenario(scenario.id, { gherkin: value })}
                />
              ) : (
                <GherkinDisplay text={scenario.gherkin} />
              )}
            </div>
          )}
        </div>
      ))}

      {isEditing && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddScenario}
          className="w-full"
        >
          <PlusIcon className="w-4 h-4" />
          Add Scenario
        </Button>
      )}
    </div>
  );
}

// Simple gherkin display for read-only view
function GherkinDisplay({ text }: { text: string }) {
  if (!text) {
    return (
      <div className="text-sm text-muted-foreground italic">
        No steps defined
      </div>
    );
  }

  return (
    <pre className="text-sm font-mono whitespace-pre-wrap text-foreground">
      {text}
    </pre>
  );
}

// Icons
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function DragHandleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}
