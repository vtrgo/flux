"use client";

import React, { useState, useRef } from "react";
import { fetchApi } from "../../lib/api";
import { toast } from "sonner";
import { BOMValidationReport, ParsedBOMNode } from "../../types";
import { useAppHotkeys } from "../../hooks/useAppHotkeys";

interface BOMImportModalProps {
  isOpen: boolean;
  machineId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function BOMImportModal({
  isOpen,
  machineId,
  onClose,
  onSuccess,
}: BOMImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [report, setReport] = useState<BOMValidationReport | null>(null);
  const [parsedNodes, setParsedNodes] = useState<ParsedBOMNode[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useAppHotkeys(
    "escape",
    () => {
      if (isOpen && !isProcessing) {
        onClose();
      }
    },
    { enableOnFormTags: true },
    [isOpen, isProcessing, onClose]
  );

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setReport(null);
    setParsedNodes([]);

    try {
      setIsProcessing(true);
      const text = await selectedFile.text();

      const res = await fetchApi<{
        report: BOMValidationReport;
        nodes: ParsedBOMNode[];
      }>(`machines/${machineId}/assemblies/import/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "text/csv",
        },
        body: text,
      });

      if (res && res.report) {
        setReport(res.report);
        setParsedNodes(res.nodes || []);
        if (res.report.is_valid) {
          toast.success(
            `Parsed ${res.report.total_nodes} assemblies & ${res.report.total_parts} parts from BOM`
          );
        } else {
          toast.error("BOM validation warnings found. Review below.");
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to preview BOM CSV";
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommit = async () => {
    if (!parsedNodes || parsedNodes.length === 0) return;

    try {
      setIsProcessing(true);
      await fetchApi(`machines/${machineId}/assemblies/import/commit`, {
        method: "POST",
        body: JSON.stringify({ nodes: parsedNodes }),
      });

      toast.success(
        `Successfully imported ${parsedNodes.length} assemblies into machine!`
      );
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to commit BOM";
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--vtr-theme-surface, #1e1e1e)",
          border: "1px solid var(--border-color, #333)",
          borderRadius: "8px",
          width: "100%",
          maxWidth: "700px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.5)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--border-color, #333)",
          }}
        >
          <div>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--vtr-theme-primary, #00e5ff)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Design BOM Ingestion
            </span>
            <h3 style={{ margin: "0.2rem 0 0 0", color: "var(--text-primary, #fff)" }}>
              Import Assembly Hierarchy CSV
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary, #888)",
              fontSize: "1.5rem",
              cursor: "pointer",
            }}
          >
            &times;
          </button>
        </div>

        <div style={{ padding: "1.5rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div
            style={{
              border: "2px dashed var(--border-color, #444)",
              borderRadius: "6px",
              padding: "1.5rem",
              textAlign: "center",
              cursor: "pointer",
              background: "rgba(255, 255, 255, 0.02)",
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <div style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>📄</div>
            <div style={{ fontWeight: 600, color: "var(--text-primary, #fff)" }}>
              {file ? file.name : "Select or drag SolidWorks PDM BOM CSV"}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary, #888)", marginTop: "0.25rem" }}>
              Columns: AssemblyCode, ParentCode, Name, DrawingNumber, Rev, QuotedHours, PartNumber, Qty
            </div>
          </div>

          {isProcessing && (
            <div style={{ textAlign: "center", color: "var(--vtr-theme-primary, #00e5ff)", padding: "1rem" }}>
              Processing BOM hierarchy...
            </div>
          )}

          {report && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  background: report.is_valid ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 68, 68, 0.15)",
                  border: `1px solid ${report.is_valid ? "#10b981" : "#ff4444"}`,
                  borderRadius: "6px",
                  padding: "0.75rem 1rem",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong>{report.is_valid ? "✓ BOM Verified" : "⚠ Validation Issues Found"}</strong>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary, #aaa)", marginTop: "0.2rem" }}>
                    Detected {report.total_nodes} assemblies and {report.total_parts} component parts
                  </div>
                </div>
              </div>

              {report.errors && report.errors.length > 0 && (
                <div style={{ background: "rgba(255, 68, 68, 0.1)", border: "1px solid #ff4444", borderRadius: "6px", padding: "0.75rem" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#ff4444", marginBottom: "0.4rem" }}>
                    Please fix the following rows in the CSV:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.8rem", color: "#ff8888" }}>
                    {report.errors.map((err, i) => (
                      <li key={i}>
                        Row {err.row} ({err.code}): {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.preview_tree && report.preview_tree.length > 0 && (
                <div style={{ border: "1px solid var(--border-color, #333)", borderRadius: "6px", padding: "0.75rem" }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary, #aaa)", marginBottom: "0.5rem" }}>
                    Preview Hierarchy:
                  </div>
                  <div style={{ maxHeight: "200px", overflowY: "auto", fontSize: "0.85rem" }}>
                    {report.preview_tree.map((asm) => (
                      <div key={asm.assembly_code} style={{ marginBottom: "0.5rem" }}>
                        <strong style={{ color: "var(--vtr-theme-primary, #00e5ff)" }}>📦 {asm.assembly_code}</strong>: {asm.name} ({asm.quoted_hours}h quote)
                        {asm.sub_assemblies && asm.sub_assemblies.length > 0 && (
                          <div style={{ marginLeft: "1.2rem", borderLeft: "2px solid #444", paddingLeft: "0.6rem", marginTop: "0.2rem" }}>
                            {asm.sub_assemblies.map((sub) => (
                              <div key={sub.assembly_code} style={{ fontSize: "0.8rem", color: "#ccc" }}>
                                ↳ 🧩 <strong>{sub.assembly_code}</strong>: {sub.name} ({sub.quoted_hours}h)
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid var(--border-color, #333)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.75rem",
            background: "rgba(0, 0, 0, 0.2)",
          }}
        >
          <button type="button" className="vtr-btn" onClick={onClose} disabled={isProcessing}>
            Cancel
          </button>
          <button
            type="button"
            className="vtr-btn vtr-btn-primary"
            onClick={handleCommit}
            disabled={!report || !report.is_valid || isProcessing}
          >
            {isProcessing ? "Importing..." : "Confirm & Import to Machine"}
          </button>
        </div>
      </div>
    </div>
  );
}
