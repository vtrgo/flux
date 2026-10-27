"use client";

import React, { useState, useEffect, useCallback } from "react";
import { fetchApi } from "../../lib/api";
import { toast } from "sonner";
import styles from "./AssemblyTreeBuilder.module.css";
import { MachineAssembly, AssemblyStatus } from "../../types";
import { BOMImportModal } from "./BOMImportModal";

interface AssemblyTreeBuilderProps {
  machineId: string;
  orderNumber?: string;
  readOnly?: boolean;
}

export function AssemblyTreeBuilder({
  machineId,
  orderNumber,
  readOnly = false,
}: AssemblyTreeBuilderProps) {
  const [assemblies, setAssemblies] = useState<MachineAssembly[]>([]);
  const [loading, setLoading] = useState(false);
  const [isBOMModalOpen, setIsBOMModalOpen] = useState(false);

  // New assembly dialog states
  const [isCreating, setIsCreating] = useState(false);
  const [parentAssemblyId, setParentAssemblyId] = useState<string | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newDrawing, setNewDrawing] = useState("");
  const [newQuote, setNewQuote] = useState(0);

  const loadAssemblies = useCallback(async () => {
    if (!machineId) return;
    try {
      setLoading(true);
      const data = await fetchApi<MachineAssembly[]>(`machines/${machineId}/assemblies`);
      setAssemblies(data || []);
    } catch (err: unknown) {
      console.error("Failed to load assemblies:", err);
    } finally {
      setLoading(false);
    }
  }, [machineId]);

  useEffect(() => {
    loadAssemblies();
  }, [loadAssemblies]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode) {
      toast.error("Assembly Code is required (e.g. ASM-01, SUB-01A)");
      return;
    }

    try {
      await fetchApi<MachineAssembly>(`machines/${machineId}/assemblies`, {
        method: "POST",
        body: JSON.stringify({
          assembly_code: newCode,
          name: newName || newCode,
          drawing_number: newDrawing,
          quoted_hours: Number(newQuote) || 0,
          parent_assembly_id: parentAssemblyId || undefined,
        }),
      });

      toast.success(`Assembly ${newCode} created successfully`);
      setIsCreating(false);
      setNewCode("");
      setNewName("");
      setNewDrawing("");
      setNewQuote(0);
      setParentAssemblyId(null);
      loadAssemblies();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create assembly";
      toast.error(msg);
    }
  };

  const handleDelete = async (id: string, code: string) => {
    if (!confirm(`Delete assembly ${code} and all its sub-assemblies?`)) return;
    try {
      await fetchApi(`assemblies/${id}`, { method: "DELETE" });
      toast.success(`Deleted ${code}`);
      loadAssemblies();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete assembly";
      toast.error(msg);
    }
  };

  const getStatusClass = (status: AssemblyStatus) => {
    switch (status) {
      case "assembled":
      case "qc_verified":
        return styles.statusAssembled;
      case "kitted":
        return styles.statusKitted;
      case "in_assembly":
        return styles.statusAssembly;
      case "ready_for_kitting":
      case "kitting_in_progress":
        return styles.statusReady;
      default:
        return styles.statusDraft;
    }
  };

  const renderAssemblyNode = (node: MachineAssembly, isChild = false) => {
    const isOver = node.actual_hours > node.quoted_hours && node.quoted_hours > 0;
    const isUnder = node.actual_hours > 0 && node.actual_hours <= node.quoted_hours;

    return (
      <div key={node.id} className={isChild ? "" : styles.nodeCard}>
        <div className={styles.nodeHeader}>
          <div className={styles.nodeTitleInfo}>
            <span className={styles.nodeCode}>{node.assembly_code}</span>
            <span className={styles.nodeName}>{node.name}</span>
            <span className={`${styles.statusChip} ${getStatusClass(node.status)}`}>
              {node.status.replace(/_/g, " ")}
            </span>
          </div>

          <div className={styles.nodeMeta}>
            {node.drawing_number && (
              <span title="Drawing Number">📐 {node.drawing_number} (Rev {node.revision})</span>
            )}
            <span
              className={`${styles.hoursBadge} ${
                isOver ? styles.hoursOver : isUnder ? styles.hoursUnder : ""
              }`}
            >
              ⏱️ {node.actual_hours.toFixed(1)}h / {node.quoted_hours.toFixed(1)}h
            </span>

            {!readOnly && (
              <div style={{ display: "flex", gap: "0.3rem" }}>
                <button
                  type="button"
                  className="vtr-btn vtr-btn-secondary"
                  style={{ padding: "0.15rem 0.4rem", fontSize: "0.75rem" }}
                  onClick={() => {
                    setParentAssemblyId(node.id);
                    setIsCreating(true);
                  }}
                  title="Add child sub-assembly"
                >
                  + Sub
                </button>
                <button
                  type="button"
                  className="vtr-btn"
                  style={{
                    padding: "0.15rem 0.4rem",
                    fontSize: "0.75rem",
                    color: "var(--accent-red, #ff4444)",
                    borderColor: "var(--accent-red, #ff4444)",
                  }}
                  onClick={() => handleDelete(node.id, node.assembly_code)}
                  title="Delete assembly"
                >
                  &times;
                </button>
              </div>
            )}
          </div>
        </div>

        {node.parts && node.parts.length > 0 && (
          <div className={styles.partsList}>
            {node.parts.map((p) => (
              <span
                key={p.id}
                className={`${styles.partTag} ${
                  p.status === "fulfilled" ? styles.partFulfilled : ""
                }`}
              >
                {p.part_number} ({p.qty_picked}/{p.qty_required})
              </span>
            ))}
          </div>
        )}

        {node.sub_assemblies && node.sub_assemblies.length > 0 && (
          <div className={styles.subTree}>
            {node.sub_assemblies.map((sub) => (
              <div key={sub.id} style={{ background: "rgba(255,255,255,0.02)", padding: "0.5rem 0.75rem", borderRadius: "4px" }}>
                {renderAssemblyNode(sub, true)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h3 className={styles.title}>
            ⚙️ Assemblies &amp; Sub-Units {orderNumber ? `(${orderNumber})` : ""}
          </h3>
          <span className={styles.countBadge}>
            {assemblies.reduce(
              (acc, a) => acc + 1 + (a.sub_assemblies?.length || 0),
              0
            )}{" "}
            Units
          </span>
        </div>

        {!readOnly && (
          <div className={styles.actions}>
            <button
              type="button"
              className="vtr-btn vtr-btn-secondary"
              onClick={() => setIsBOMModalOpen(true)}
            >
              📥 Import BOM CSV
            </button>
            <button
              type="button"
              className="vtr-btn vtr-btn-primary"
              onClick={() => {
                setParentAssemblyId(null);
                setIsCreating(true);
              }}
            >
              + Master Assembly
            </button>
          </div>
        )}
      </div>

      {isCreating && (
        <form
          onSubmit={handleCreate}
          style={{
            background: "rgba(0, 229, 255, 0.04)",
            border: "1px solid var(--vtr-theme-primary, #00e5ff)",
            borderRadius: "6px",
            padding: "1rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "0.75rem",
            alignItems: "end",
          }}
        >
          <div>
            <label
              htmlFor="assembly_code_input"
              style={{ fontSize: "0.75rem", color: "var(--text-secondary, #aaa)", display: "block", marginBottom: "0.2rem" }}
            >
              Assembly Code *
            </label>
            <input
              id="assembly_code_input"
              type="text"
              placeholder="e.g. ASM-01"
              className="vtr-input"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="assembly_name_input"
              style={{ fontSize: "0.75rem", color: "var(--text-secondary, #aaa)", display: "block", marginBottom: "0.2rem" }}
            >
              Assembly Name *
            </label>
            <input
              id="assembly_name_input"
              type="text"
              placeholder="e.g. Bowl Drive Unit"
              className="vtr-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: "0.75rem", color: "var(--text-secondary, #aaa)", display: "block", marginBottom: "0.2rem" }}>
              Drawing Number
            </label>
            <input
              type="text"
              placeholder="e.g. VTR-1024-D01"
              className="vtr-input"
              value={newDrawing}
              onChange={(e) => setNewDrawing(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: "0.75rem", color: "var(--text-secondary, #aaa)", display: "block", marginBottom: "0.2rem" }}>
              Quoted Hours
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              placeholder="0.0"
              className="vtr-input"
              value={newQuote || ""}
              onChange={(e) => setNewQuote(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="submit" className="vtr-btn vtr-btn-primary">
              Save
            </button>
            <button
              type="button"
              className="vtr-btn"
              onClick={() => {
                setIsCreating(false);
                setParentAssemblyId(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className={styles.emptyState}>Loading assemblies...</div>
      ) : assemblies.length === 0 ? (
        <div className={styles.emptyState}>
          No assemblies defined for this machine yet. Click <strong>+ Master Assembly</strong> or <strong>Import BOM CSV</strong> to build the hierarchy.
        </div>
      ) : (
        <div className={styles.treeList}>
          {assemblies.map((root) => renderAssemblyNode(root))}
        </div>
      )}

      <BOMImportModal
        isOpen={isBOMModalOpen}
        machineId={machineId}
        onClose={() => setIsBOMModalOpen(false)}
        onSuccess={loadAssemblies}
      />
    </div>
  );
}
