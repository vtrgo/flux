"use client";

import React, { useState, useEffect, useCallback } from "react";
import { fetchApi } from "../lib/api";
import { ControlsSchematicRework, Machine } from "../types";
import { toast } from "sonner";
import styles from "./ControlsSchematicTracker.module.css";

interface ControlsSchematicTrackerProps {
  salesOrderId?: string;
  machineId?: string;
}

export function ControlsSchematicTracker({ salesOrderId, machineId }: ControlsSchematicTrackerProps) {
  const [items, setItems] = useState<ControlsSchematicRework[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);

  // New schematic form state
  const [newSchematicNumber, setNewSchematicNumber] = useState("");
  const [newMachineId, setNewMachineId] = useState(machineId || "");
  const [newRedlines, setNewRedlines] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (salesOrderId) params.sales_order_id = salesOrderId;
      if (machineId) params.machine_id = machineId;

      const data = await fetchApi<ControlsSchematicRework[]>("rework/controls", { params });
      setItems(data || []);

      const machineList = await fetchApi<Machine[]>("machines");
      setMachines(machineList || []);
    } catch (err) {
      console.error("Failed to load controls schematic data", err);
    } finally {
      setLoading(false);
    }
  }, [salesOrderId, machineId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateSchematic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchematicNumber || !newMachineId) {
      toast.error("Please provide both Schematic Number and select a Machine");
      return;
    }

    try {
      await fetchApi("rework/controls", {
        method: "POST",
        body: JSON.stringify({
          machine_id: newMachineId,
          sales_order_id: salesOrderId || "",
          schematic_number: newSchematicNumber,
          master_copy_redlined: true,
          redlines_description: newRedlines,
        }),
      });
      toast.success("Master Electrical Schematic redline recorded");
      setNewSchematicNumber("");
      setNewRedlines("");
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record schematic redline";
      toast.error(msg);
    }
  };

  const handleSignOff = async (item: ControlsSchematicRework) => {
    try {
      await fetchApi(`rework/controls/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({
          schematics_digitally_updated: true,
          checklist_signed_off: true,
        }),
      });
      toast.success(`Electrical Design Checklist signed off for ${item.schematic_number}`);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sign off checklist";
      toast.error(msg);
    }
  };

  if (loading) return <div style={{ padding: "2rem", color: "var(--text-secondary)" }}>Loading Electrical Schematics...</div>;

  return (
    <div className={styles.container}>
      {/* SOP 1-003 Section 6 Header */}
      <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-default, #333)", borderRadius: "6px", padding: "1rem 1.25rem" }}>
        <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem", color: "var(--vtr-theme-primary)" }}>
          Electrical / Controls Department Procedure (SOP 1-003 Step 6)
        </h3>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          When modifications occur, redlines must be made on individual copies and transferred into the Master Copy.
          Near project completion, schematics are digitally updated and signed off on the Electrical Design Checklist.
        </p>
      </div>

      {/* Quick Add Schematic Form */}
      <form onSubmit={handleCreateSchematic} className={styles.form}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Machine / Station</label>
          <select
            value={newMachineId}
            onChange={(e) => setNewMachineId(e.target.value)}
            className={styles.select}
            required
          >
            <option value="">Select Machine</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>{m.order_number} ({m.model_type})</option>
            ))}
          </select>
        </div>

        <div className={styles.formGroup} style={{ minWidth: "220px" }}>
          <label className={styles.label}>Master Schematic #</label>
          <input
            type="text"
            value={newSchematicNumber}
            onChange={(e) => setNewSchematicNumber(e.target.value)}
            placeholder="e.g. SCH-1024-MAIN-REV-A"
            className={styles.input}
            required
          />
        </div>

        <div className={styles.formGroup} style={{ flex: 1, minWidth: "250px" }}>
          <label className={styles.label}>Redline Description</label>
          <input
            type="text"
            value={newRedlines}
            onChange={(e) => setNewRedlines(e.target.value)}
            placeholder="e.g. Changed air solenoid valve relay to 24VDC"
            className={styles.input}
          />
        </div>

        <button type="submit" className="vtr-btn vtr-btn-primary">
          Log Redline
        </button>
      </form>

      {/* Schematics Table */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Schematic #</th>
              <th>Redlines Description</th>
              <th>Master Redlined By</th>
              <th>Digital Update</th>
              <th>Checklist Sign-off</th>
              <th style={{ textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
                  No master electrical schematics logged for this project yet.
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id} style={{ borderBottom: "1px solid var(--border-color, #222)" }}>
                  <td style={{ padding: "0.75rem 1rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--vtr-theme-primary)" }}>
                    {it.schematic_number}
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    {it.redlines_description || <span style={{ color: "#666" }}>None noted</span>}
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    {it.redlined_by_user_name || "System"}
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    {it.schematics_digitally_updated ? (
                      <span style={{ color: "#00e5ff" }}>Updated</span>
                    ) : (
                      <span style={{ color: "var(--accent-red)" }}>Pending Draft</span>
                    )}
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    {it.checklist_signed_off ? (
                      <span style={{ color: "#00e5ff" }}>Signed by {it.signed_off_by_user_name}</span>
                    ) : (
                      <span style={{ color: "#888" }}>Unsigned</span>
                    )}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                    {!it.checklist_signed_off && (
                      <button
                        className="vtr-btn"
                        style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", borderColor: "var(--vtr-theme-primary)", color: "var(--vtr-theme-primary)" }}
                        onClick={() => handleSignOff(it)}
                      >
                        Sign Off Checklist
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
