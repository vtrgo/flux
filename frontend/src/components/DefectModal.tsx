"use client";

import { useState, useEffect } from "react";
import { fetchApi } from "../lib/api";
import { Defect } from "../types";
import { formatDepartmentName } from "../lib/departments";
import styles from "../app/page.module.css";
import { useAppHotkeys } from "../hooks/useAppHotkeys";
import { IssueCard } from "./IssueCard";

interface DefectModalProps {
  machineId: string;
  department: string;
  machineName?: string;
  onClose: () => void;
}

export function DefectModal({ machineId, department, machineName, onClose }: DefectModalProps) {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);

  useAppHotkeys('escape', () => onClose(), { enableOnFormTags: true }, [onClose]);

  useEffect(() => {
    fetchApi<Defect[]>(`machines/${machineId}/defects`)
      .then((data) => {
        // Filter out defects just for this department
        const filtered = (data || []).filter(
          (d) =>
            d.assigned_department === department ||
            (department === "electrical_controls" && d.assigned_department === "controls")
        );
        setDefects(filtered);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [machineId, department]);

  const handleMarkFixed = async (defectId: string) => {
    try {
      await fetchApi(`defects/${defectId}`, {
        method: "PUT",
        body: JSON.stringify({ status: "fixed" }),
      });
      // Optionally update local state immediately instead of waiting for SSE
      setDefects((prev) =>
        prev.map((d) => (d.id === defectId ? { ...d, status: "fixed" } : d))
      );
    } catch (err) {
      console.error("Failed to mark defect as fixed", err);
    }
  };

  const handleSignOff = async (defectId: string) => {
    try {
      await fetchApi(`defects/${defectId}`, {
        method: "PUT",
        body: JSON.stringify({ status: "verified" }),
      });
      setDefects((prev) =>
        prev.map((d) => (d.id === defectId ? { ...d, status: "verified" } : d))
      );
    } catch (err) {
      console.error("Failed to sign off defect", err);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--background-secondary, #1a1a1a)",
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
          width: "90%",
          maxWidth: "600px",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          padding: "1.5rem",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()} // Prevent close on modal click
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "1rem",
            right: "1rem",
            background: "transparent",
            border: "none",
            color: "var(--text-secondary)",
            cursor: "pointer",
            fontSize: "1.5rem",
          }}
        >
          &times;
        </button>

        <h2 style={{ marginTop: 0, color: "var(--vtr-theme-primary)", marginBottom: "1rem" }}>
          {formatDepartmentName(department)} Deficiencies {machineName ? `- ${machineName}` : ''}
        </h2>

        {loading ? (
          <div style={{ color: "var(--text-secondary)" }}>Loading defects...</div>
        ) : (
          <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
            {defects.length === 0 ? (
              <div style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>
                No defects found.
              </div>
            ) : (
              defects.map((d) => (
                <IssueCard
                  key={d.id}
                  issue={d}
                  onClick={() => {}}
                  cardStyle={{ cursor: 'default', borderLeft: `4px solid ${d.severity === "critical" ? "var(--accent-red)" : d.severity === "moderate" ? "var(--accent-amber)" : "var(--vtr-theme-primary)"}` }}
                  actions={
                    <>
                      {d.status === "open" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMarkFixed(d.id); }}
                          className="vtr-btn"
                          style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                        >
                          Mark Fixed
                        </button>
                      )}
                      {d.status === "fixed" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSignOff(d.id); }}
                          className="vtr-btn"
                          style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", background: "var(--vtr-theme-primary)", color: "white", border: "none" }}
                        >
                          Sign Off
                        </button>
                      )}
                    </>
                  }
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
