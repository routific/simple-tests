"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { revokeApiToken } from "./actions";
import { CreateTokenModal } from "./create-token-modal";
import { TokenCreatedModal } from "./token-created-modal";

interface Token {
  id: string;
  name: string;
  permissions: "read" | "write" | "admin";
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
  userId: string;
}

interface TokenListProps {
  tokens: Token[];
}

export function TokenList({ tokens }: TokenListProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);

  const activeTokens = tokens.filter((t) => !t.revokedAt);
  const revokedTokens = tokens.filter((t) => t.revokedAt);

  const handleTokenCreated = (token: string) => {
    setIsCreateModalOpen(false);
    setCreatedToken(token);
  };

  const handleRevoke = async (tokenId: string) => {
    if (!confirm("Are you sure you want to revoke this token? This action cannot be undone.")) {
      return;
    }

    setRevokingId(tokenId);
    try {
      const result = await revokeApiToken(tokenId);
      if (result.error) {
        alert(result.error);
      }
    } finally {
      setRevokingId(null);
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "Never";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getPermissionBadgeVariant = (permission: string) => {
    switch (permission) {
      case "admin":
        return "destructive";
      case "write":
        return "warning";
      default:
        return "default";
    }
  };

  const isExpired = (expiresAt: Date | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Active Tokens</CardTitle>
          <Button onClick={() => setIsCreateModalOpen(true)} size="sm">
            <PlusIcon className="w-4 h-4 mr-1.5" />
            Create Token
          </Button>
        </CardHeader>
        <CardContent>
          {activeTokens.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No active tokens. Create one to authenticate with the MCP server.
            </p>
          ) : (
            <div className="space-y-3">
              {activeTokens.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border bg-background"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">
                        {token.name}
                      </span>
                      <Badge variant={getPermissionBadgeVariant(token.permissions)}>
                        {token.permissions}
                      </Badge>
                      {isExpired(token.expiresAt) && (
                        <Badge variant="destructive">Expired</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {token.id}
                        </code>
                      </span>
                      <span>Created {formatDate(token.createdAt)}</span>
                      {token.lastUsedAt && (
                        <span>Last used {formatDate(token.lastUsedAt)}</span>
                      )}
                      {token.expiresAt && !isExpired(token.expiresAt) && (
                        <span>Expires {formatDate(token.expiresAt)}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(token.id)}
                    disabled={revokingId === token.id}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    {revokingId === token.id ? "Revoking..." : "Revoke"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {revokedTokens.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowRevoked(!showRevoked)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronIcon
              className={`w-4 h-4 transition-transform ${showRevoked ? "rotate-90" : ""}`}
            />
            {revokedTokens.length} revoked token{revokedTokens.length !== 1 ? "s" : ""}
          </button>

          {showRevoked && (
            <div className="mt-3 space-y-2">
              {revokedTokens.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30 opacity-60"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate line-through">
                        {token.name}
                      </span>
                      <Badge variant="secondary">{token.permissions}</Badge>
                      <Badge variant="destructive">Revoked</Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {token.id}
                        </code>
                      </span>
                      <span>Created {formatDate(token.createdAt)}</span>
                      <span>Revoked {formatDate(token.revokedAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <CreateTokenModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handleTokenCreated}
      />

      <TokenCreatedModal
        isOpen={!!createdToken}
        onClose={() => setCreatedToken(null)}
        token={createdToken || ""}
      />
    </>
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

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
