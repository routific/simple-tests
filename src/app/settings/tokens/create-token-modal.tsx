"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createApiToken } from "./actions";

interface CreateTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (token: string) => void;
}

export function CreateTokenModal({ isOpen, onClose, onCreated }: CreateTokenModalProps) {
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<"read" | "write" | "admin">("read");
  const [expiration, setExpiration] = useState<string>("never");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Token name is required");
      return;
    }

    setIsCreating(true);
    try {
      const expiresInDays = expiration === "never" ? undefined : parseInt(expiration, 10);
      const result = await createApiToken({
        name: name.trim(),
        permissions,
        expiresInDays,
      });

      if (result.error) {
        setError(result.error);
      } else if (result.success && result.token) {
        // Reset form
        setName("");
        setPermissions("read");
        setExpiration("never");
        onCreated(result.token);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setName("");
    setPermissions("read");
    setExpiration("never");
    setError(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create API Token"
      description="Create a new token for MCP server authentication"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div>
          <label htmlFor="token-name" className="block text-sm font-medium text-foreground mb-1.5">
            Token Name
          </label>
          <Input
            id="token-name"
            type="text"
            placeholder="e.g., MCP Development"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground mt-1">
            A memorable name to identify this token
          </p>
        </div>

        <div>
          <label htmlFor="permissions" className="block text-sm font-medium text-foreground mb-1.5">
            Permissions
          </label>
          <select
            id="permissions"
            value={permissions}
            onChange={(e) => setPermissions(e.target.value as "read" | "write" | "admin")}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="read">Read - View test cases and runs</option>
            <option value="write">Write - Create and update test cases and runs</option>
            <option value="admin">Admin - Full access including token management</option>
          </select>
        </div>

        <div>
          <label htmlFor="expiration" className="block text-sm font-medium text-foreground mb-1.5">
            Expiration
          </label>
          <select
            id="expiration"
            value={expiration}
            onChange={(e) => setExpiration(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="never">Never expires</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
          </select>
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isCreating}>
            {isCreating ? "Creating..." : "Create Token"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
