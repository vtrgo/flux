"use client";

import React, { useState, useEffect, useMemo, useId } from "react";
import { toast } from "sonner";
import { useAuth } from "../../../contexts/AuthContext";
import { useTimesheetData } from "../../../hooks/useTimesheetData";
import { TimesheetLogModal } from "../../../components/TimesheetLogModal";
import { Machine, CreateProjectTaskRequest } from "../../../types";
import { fetchApi } from "../../../lib/api";
import styles from "./timesheet.module.css";

const STANDARD_TASK_CATALOG = [
  { code: "mech_assembly", name: "Mechanical Assembly", dept: "assembly", defaultQuote: 40.0 },
  { code: "elec_wiring", name: "Panel Build & Machine Wiring", dept: "controls", defaultQuote: 25.0 },
  { code: "machining", name: "Machine Shop / Milling / Turning", dept: "machine-shop", defaultQuote: 30.0 },
  { code: "mech_design", name: "Mechanical CAD & Detailing", dept: "design", defaultQuote: 20.0 },
  { code: "controls_debug", name: "PLC / HMI Programming & Debug", dept: "controls", defaultQuote: 15.0 },
  { code: "laser_cutting", name: "Laser Cutting & Sheet Metal", dept: "laser", defaultQuote: 10.0 },
  { code: "enclosures", name: "Enclosure Fab & Prep", dept: "enclosures", defaultQuote: 12.0 },
  { code: "testing_fat", name: "Quality Inspection & FAT Runoff", dept: "quality", defaultQuote: 8.0 },
];

export default function TimesheetPage() {
  const customTaskNameId = useId();
  const customDeptId = useId();
  const customQuoteId = useId();
  const { user, isAdmin, hasRole } = useAuth();
  const isLeadOrManager = isAdmin || hasRole(["manager", "lead"]);

  const [activeTab, setActiveTab] = useState<"my_time" | "project_variance" | "quoting_review">("my_time");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>("");

  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);

  // New task form state
  const [selectedCatalogTask, setSelectedCatalogTask] = useState<string>(STANDARD_TASK_CATALOG[0].code);
  const [customTaskName, setCustomTaskName] = useState("");
  const [customDept, setCustomDept] = useState("assembly");
  const [taskQuotedHours, setTaskQuotedHours] = useState<string>("20.0");
  const [addingTask, setAddingTask] = useState(false);

  // Editing existing task quote state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editQuoteVal, setEditQuoteVal] = useState<string>("");

  const {
    myEntries,
    machineSummary,
    quotingReview,
    loading,
    deleteEntry,
    createOrUpdateTask,
    updateTaskQuote,
    fetchQuotingReview,
  } = useTimesheetData(selectedMachineId);

  // Load machines for dropdowns
  useEffect(() => {
    fetchApi<Machine[]>("machines")
      .then((data) => {
        setMachines(data || []);
        if (data && data.length > 0 && !selectedMachineId) {
          setSelectedMachineId(data[0].id);
        }
      })
      .catch((err) => console.error("Failed to load machines", err));
  }, [selectedMachineId]);

  // Load quoting review when tab is opened
  useEffect(() => {
    if (activeTab === "quoting_review") {
      fetchQuotingReview();
    }
  }, [activeTab, fetchQuotingReview]);

  // Global hotkey T to open log modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setIsLogModalOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Worker metrics
  const workerMetrics = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const todayHours = myEntries
      .filter((e) => e.work_date === today)
      .reduce((acc, e) => acc + e.hours_spent, 0);

    const totalWeekHours = myEntries.reduce((acc, e) => acc + e.hours_spent, 0);

    const prodHours = myEntries
      .filter((e) => e.entry_type === "production")
      .reduce((acc, e) => acc + e.hours_spent, 0);

    const reworkHours = myEntries
      .filter((e) => e.entry_type === "rework")
      .reduce((acc, e) => acc + e.hours_spent, 0);

    const issueHours = myEntries
      .filter((e) => e.entry_type === "issue_fix")
      .reduce((acc, e) => acc + e.hours_spent, 0);

    return { todayHours, totalWeekHours, prodHours, reworkHours, issueHours };
  }, [myEntries]);

  const handleDeleteEntry = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this time entry?")) return;
    try {
      await deleteEntry(id);
      toast.success("Time entry deleted");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete entry";
      toast.error(message);
    }
  };

  const handleAddTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMachineId) {
      toast.error("Please select a machine first");
      return;
    }

    const hours = parseFloat(taskQuotedHours);
    if (isNaN(hours) || hours < 0) {
      toast.error("Quoted hours cannot be negative");
      return;
    }

    let code = selectedCatalogTask;
    let name = "";
    let dept = customDept;

    if (selectedCatalogTask === "custom") {
      if (!customTaskName.trim()) {
        toast.error("Please enter a custom task name");
        return;
      }
      name = customTaskName.trim();
      code = name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    } else {
      const item = STANDARD_TASK_CATALOG.find((c) => c.code === selectedCatalogTask);
      if (item) {
        name = item.name;
        dept = item.dept;
      }
    }

    try {
      setAddingTask(true);
      const req: CreateProjectTaskRequest = {
        task_code: code,
        task_name: name,
        department: dept,
        quoted_hours: hours,
      };
      await createOrUpdateTask(selectedMachineId, req);
      toast.success(`Task "${name}" added with ${hours} quoted hours!`);
      setIsAddTaskOpen(false);
      setCustomTaskName("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add task";
      toast.error(message);
    } finally {
      setAddingTask(false);
    }
  };

  const handleSaveQuoteEdit = async (taskId: string) => {
    const hours = parseFloat(editQuoteVal);
    if (isNaN(hours) || hours < 0) {
      toast.error("Quoted hours must be 0 or greater");
      return;
    }

    try {
      await updateTaskQuote(taskId, { quoted_hours: hours });
      toast.success("Quoted hours updated");
      setEditingTaskId(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update quote";
      toast.error(message);
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h1>
            <span>⏱️</span> Timesheet & Quoting Hub
          </h1>
          <p>Universal labor tracking connecting Production Quoting, SOP 1-003 Rework, and Defect Resolution</p>
        </div>

        <div className={styles.actions}>
          {/* View Mode Toggle */}
          <div className={styles.viewToggle}>
            <button
              className={`${styles.toggleBtn} ${activeTab === "my_time" ? styles.toggleBtnActive : ""}`}
              onClick={() => setActiveTab("my_time")}
            >
              👤 My Time
            </button>
            <button
              className={`${styles.toggleBtn} ${activeTab === "project_variance" ? styles.toggleBtnActive : ""}`}
              onClick={() => setActiveTab("project_variance")}
            >
              📊 Quoting & Variance
            </button>
            {isLeadOrManager && (
              <button
                className={`${styles.toggleBtn} ${activeTab === "quoting_review" ? styles.toggleBtnActive : ""}`}
                onClick={() => setActiveTab("quoting_review")}
              >
                📑 Quoting Audit
              </button>
            )}
          </div>

          <button
            className="vtr-btn vtr-btn-primary"
            onClick={() => setIsLogModalOpen(true)}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <span>+ LOG TIME</span>
            <kbd style={{ background: "rgba(0,0,0,0.3)", padding: "2px 6px", borderRadius: "3px", fontSize: "0.75rem" }}>T</kbd>
          </button>
        </div>
      </div>

      {/* TAB 1: MY TIME (Worker View) */}
      {activeTab === "my_time" && (
        <>
          {/* Worker KPIs */}
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Today&apos;s Hours</div>
              <div className={styles.kpiValue}>{workerMetrics.todayHours.toFixed(2)}h</div>
              <div className={styles.kpiSub}>Logged for today</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Total Recent Hours</div>
              <div className={styles.kpiValue}>{workerMetrics.totalWeekHours.toFixed(2)}h</div>
              <div className={styles.kpiSub}>Active pay period entries</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Production Build</div>
              <div className={styles.kpiValue} style={{ color: "var(--vtr-theme-primary, #00e5ff)" }}>
                {workerMetrics.prodHours.toFixed(2)}h
              </div>
              <div className={styles.kpiSub}>Allocated to standard tasks</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Rework & Issues</div>
              <div className={styles.kpiValue} style={{ color: "#ff7043" }}>
                {(workerMetrics.reworkHours + workerMetrics.issueHours).toFixed(2)}h
              </div>
              <div className={styles.kpiSub}>
                Rework: {workerMetrics.reworkHours.toFixed(1)}h | Issues: {workerMetrics.issueHours.toFixed(1)}h
              </div>
            </div>
          </div>

          {/* Time Ledger Table */}
          <div className={styles.contentCard}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>
                <span>📋</span> Your Logged Time Entries
              </h2>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary, #888)" }}>
                Logged as: <strong>{user?.username || "Worker"}</strong>
              </span>
            </div>

            <div className={styles.tableWrapper}>
              {loading ? (
                <div className={styles.emptyState}>Loading your time logs...</div>
              ) : myEntries.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No time entries recorded for this period.</p>
                  <button className="vtr-btn vtr-btn-primary" onClick={() => setIsLogModalOpen(true)}>
                    + Record Your First Entry (Press T)
                  </button>
                </div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Machine / Order</th>
                      <th>Allocation Target</th>
                      <th>Hours</th>
                      <th>Work Notes</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myEntries.map((e) => {
                      let badgeClass = styles.badgeProduction;
                      let badgeText = "PRODUCTION";
                      let targetText = e.task_name || "Task";

                      if (e.entry_type === "rework") {
                        badgeClass = styles.badgeRework;
                        badgeText = "REWORK";
                        targetText = e.rework_part_number ? `Traveler: ${e.rework_part_number}` : "Rework Item";
                      } else if (e.entry_type === "issue_fix") {
                        badgeClass = styles.badgeIssueFix;
                        badgeText = "ISSUE FIX";
                        targetText = "Defect Repair";
                      } else if (e.entry_type === "indirect") {
                        badgeClass = styles.badgeIndirect;
                        badgeText = "INDIRECT";
                        targetText = "General Shop";
                      }

                      return (
                        <tr key={e.id}>
                          <td style={{ fontWeight: 600 }}>{e.work_date}</td>
                          <td>
                            <span className={`${styles.categoryBadge} ${badgeClass}`}>{badgeText}</span>
                          </td>
                          <td>
                            <strong>{e.order_number || "—"}</strong>
                          </td>
                          <td>{targetText}</td>
                          <td style={{ fontWeight: 700, fontSize: "1rem" }}>{e.hours_spent.toFixed(2)}h</td>
                          <td style={{ maxWidth: "350px", color: "var(--text-secondary, #ccc)" }}>
                            {e.work_description || "—"}
                          </td>
                          <td>
                            <button
                              className="vtr-btn vtr-btn-danger"
                              style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                              onClick={() => handleDeleteEntry(e.id)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* TAB 2: PROJECT QUOTING & VARIANCE (Lead / PM View) */}
      {activeTab === "project_variance" && (
        <>
          {/* Machine Selector Bar */}
          <div className={styles.cardHeader} style={{ background: "var(--vtr-theme-surface, #1e1e1e)", borderRadius: "8px", border: "1px solid var(--border-color, #333)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", flex: 1 }}>
              <label style={{ fontWeight: 700, fontSize: "0.95rem" }}>Active Machine:</label>
              <select
                style={{ padding: "0.5rem 0.85rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff", minWidth: "260px" }}
                value={selectedMachineId}
                onChange={(e) => setSelectedMachineId(e.target.value)}
              >
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.order_number} ({m.model_type}) - {m.status.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {isLeadOrManager && (
              <button
                className="vtr-btn vtr-btn-secondary"
                onClick={() => setIsAddTaskOpen(!isAddTaskOpen)}
              >
                {isAddTaskOpen ? "Close Task Form" : "+ Define Quoted Task"}
              </button>
            )}
          </div>

          {/* Add Quoted Task Sub-panel */}
          {isAddTaskOpen && isLeadOrManager && (
            <div className={styles.contentCard} style={{ border: "1px solid var(--vtr-theme-primary, #00e5ff)", padding: "1.25rem" }}>
              <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", color: "var(--vtr-theme-primary, #00e5ff)" }}>
                Establish Quoted Task for Machine {machineSummary?.order_number}
              </h3>
              <form onSubmit={handleAddTaskSubmit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", alignItems: "flex-end" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem" }}>Task Template</label>
                  <select
                    style={{ width: "100%", padding: "0.5rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                    value={selectedCatalogTask}
                    onChange={(e) => {
                      setSelectedCatalogTask(e.target.value);
                      const item = STANDARD_TASK_CATALOG.find((c) => c.code === e.target.value);
                      if (item) setTaskQuotedHours(item.defaultQuote.toString());
                    }}
                  >
                    {STANDARD_TASK_CATALOG.map((cat) => (
                      <option key={cat.code} value={cat.code}>
                        {cat.name} ({cat.dept})
                      </option>
                    ))}
                    <option value="custom">-- Custom Task --</option>
                  </select>
                </div>

                {selectedCatalogTask === "custom" && (
                  <>
                    <div>
                      <label htmlFor={customTaskNameId} style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem" }}>Task Name *</label>
                      <input
                        id={customTaskNameId}
                        type="text"
                        placeholder="e.g. Special Tooling Alignment"
                        style={{ width: "100%", padding: "0.5rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                        value={customTaskName}
                        onChange={(e) => setCustomTaskName(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor={customDeptId} style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem" }}>Department *</label>
                      <select
                        id={customDeptId}
                        style={{ width: "100%", padding: "0.5rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                        value={customDept}
                        onChange={(e) => setCustomDept(e.target.value)}
                      >
                        <option value="assembly">Assembly</option>
                        <option value="controls">Electrical / Controls</option>
                        <option value="machine-shop">Machine Shop</option>
                        <option value="laser">Laser</option>
                        <option value="design">Design</option>
                        <option value="enclosures">Enclosures</option>
                        <option value="quality">Quality</option>
                      </select>
                    </div>
                  </>
                )}

                <div>
                  <label htmlFor={customQuoteId} style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem" }}>Quoted Hours *</label>
                  <input
                    id={customQuoteId}
                    type="number"
                    step="0.5"
                    min="0"
                    style={{ width: "100%", padding: "0.5rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                    value={taskQuotedHours}
                    onChange={(e) => setTaskQuotedHours(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <button type="submit" className="vtr-btn vtr-btn-primary" disabled={addingTask} style={{ width: "100%" }}>
                    {addingTask ? "Saving..." : "Save Quoted Task"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Machine Telemetry KPIs */}
          {machineSummary && (
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <div className={styles.kpiLabel}>Total Quoted Hours</div>
                <div className={styles.kpiValue}>{machineSummary.total_quoted_hours.toFixed(1)}h</div>
                <div className={styles.kpiSub}>Baseline quote estimate</div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiLabel}>Actual Production</div>
                <div className={styles.kpiValue} style={{ color: "var(--vtr-theme-primary, #00e5ff)" }}>
                  {machineSummary.total_production_hours.toFixed(1)}h
                </div>
                <div className={styles.kpiSub}>Standard build time</div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiLabel}>Production Variance</div>
                <div className={`${styles.kpiValue} ${machineSummary.production_variance > 0 ? styles.variancePositive : styles.varianceNegative}`}>
                  {machineSummary.production_variance > 0 ? `+${machineSummary.production_variance.toFixed(1)}h` : `${machineSummary.production_variance.toFixed(1)}h`}
                </div>
                <div className={styles.kpiSub}>
                  {machineSummary.total_quoted_hours > 0
                    ? `${((machineSummary.total_production_hours / machineSummary.total_quoted_hours) * 100).toFixed(0)}% budget consumed`
                    : "No quote established"}
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiLabel}>Rework Hours (SOP 1-003)</div>
                <div className={styles.kpiValue} style={{ color: "#ff7043" }}>
                  {machineSummary.total_rework_hours.toFixed(1)}h
                </div>
                <div className={styles.kpiSub}>Traveler rework labor</div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiLabel}>Defect Repair Hours</div>
                <div className={styles.kpiValue} style={{ color: "#ffca28" }}>
                  {machineSummary.total_issue_fix_hours.toFixed(1)}h
                </div>
                <div className={styles.kpiSub}>Cost of quality impact</div>
              </div>
            </div>
          )}

          {/* Quoted Tasks vs Actuals Table */}
          <div className={styles.contentCard}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>
                <span>⚙️</span> Task Allocation & Variance Breakdown: {machineSummary?.order_number}
              </h2>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary, #aaa)" }}>
                Model: <strong>{machineSummary?.model_type}</strong>
              </span>
            </div>

            <div className={styles.tableWrapper}>
              {!machineSummary || !machineSummary.tasks || machineSummary.tasks.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No tasks quoted for this machine yet.</p>
                  {isLeadOrManager && (
                    <button className="vtr-btn vtr-btn-primary" onClick={() => setIsAddTaskOpen(true)}>
                      + Establish Quoted Tasks for this Machine
                    </button>
                  )}
                </div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Task Name</th>
                      <th>Department</th>
                      <th>Quoted Hours</th>
                      <th>Actual Hours</th>
                      <th>Variance (+/-)</th>
                      <th>Budget Progress</th>
                      <th>Status</th>
                      {isLeadOrManager && <th>Quote Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {machineSummary.tasks.map((task) => {
                      const pct = task.quoted_hours > 0 ? (task.actual_hours / task.quoted_hours) * 100 : 0;
                      let progressClass = styles.progressGreen;
                      if (pct >= 100) progressClass = styles.progressRed;
                      else if (pct >= 85) progressClass = styles.progressYellow;

                      const isEditing = editingTaskId === task.id;

                      return (
                        <tr key={task.id}>
                          <td>
                            <strong>{task.task_name}</strong>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary, #888)" }}>{task.task_code}</div>
                          </td>
                          <td style={{ textTransform: "capitalize" }}>{task.department}</td>
                          <td>
                            {isEditing ? (
                              <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  style={{ width: "80px", padding: "0.25rem", background: "#000", border: "1px solid #00e5ff", color: "#fff" }}
                                  value={editQuoteVal}
                                  onChange={(e) => setEditQuoteVal(e.target.value)}
                                  autoFocus
                                />
                                <button
                                  className="vtr-btn vtr-btn-primary"
                                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                  onClick={() => handleSaveQuoteEdit(task.id)}
                                >
                                  Save
                                </button>
                                <button
                                  className="vtr-btn"
                                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                  onClick={() => setEditingTaskId(null)}
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontWeight: 700, fontSize: "1rem" }}>{task.quoted_hours.toFixed(1)}h</span>
                            )}
                          </td>
                          <td style={{ fontWeight: 700, fontSize: "1rem", color: "var(--vtr-theme-primary, #00e5ff)" }}>
                            {task.actual_hours.toFixed(2)}h
                          </td>
                          <td style={{ fontWeight: 800 }}>
                            <span className={task.variance > 0 ? styles.variancePositive : styles.varianceNegative}>
                              {task.variance > 0 ? `+${task.variance.toFixed(2)}h` : `${task.variance.toFixed(2)}h`}
                            </span>
                          </td>
                          <td style={{ minWidth: "150px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "2px" }}>
                              <span>{pct.toFixed(0)}%</span>
                              <span>{task.actual_hours.toFixed(1)} / {task.quoted_hours.toFixed(1)}h</span>
                            </div>
                            <div className={styles.progressBarBg}>
                              <div
                                className={`${styles.progressBarFill} ${progressClass}`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                          </td>
                          <td>
                            <span className={`${styles.categoryBadge} ${task.status === "completed" ? styles.badgeProduction : styles.badgeIndirect}`}>
                              {task.status.toUpperCase()}
                            </span>
                          </td>
                          {isLeadOrManager && (
                            <td>
                              {!isEditing && (
                                <button
                                  className="vtr-btn vtr-btn-secondary"
                                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                  onClick={() => {
                                    setEditingTaskId(task.id);
                                    setEditQuoteVal(task.quoted_hours.toString());
                                  }}
                                >
                                  Edit Quote
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* TAB 3: QUOTING AUDIT & REVIEW (Management View) */}
      {activeTab === "quoting_review" && (
        <div className={styles.contentCard}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>
              <span>📑</span> Quoting Calibration Audit: Across All Machines
            </h2>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary, #aaa)" }}>
              Compares initial quoted hours against actual build, rework, and defect containment labor
            </p>
          </div>

          <div className={styles.tableWrapper}>
            {quotingReview.length === 0 ? (
              <div className={styles.emptyState}>No machine data available for quoting review.</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Model Type</th>
                    <th>Status</th>
                    <th>Quoted Hours</th>
                    <th>Production Actual</th>
                    <th>Variance</th>
                    <th>Rework Hours (SOP 1-003)</th>
                    <th>Defect Fix Hours</th>
                    <th>Total Labor Expended</th>
                  </tr>
                </thead>
                <tbody>
                  {quotingReview.map((row) => (
                    <tr key={row.machine_id}>
                      <td>
                        <strong>{row.order_number}</strong>
                      </td>
                      <td>{row.model_type}</td>
                      <td>
                        <span className={`${styles.categoryBadge} ${styles.badgeIndirect}`}>
                          {row.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700 }}>{row.total_quoted_hours.toFixed(1)}h</td>
                      <td style={{ color: "var(--vtr-theme-primary, #00e5ff)", fontWeight: 700 }}>
                        {row.total_production_hours.toFixed(1)}h
                      </td>
                      <td style={{ fontWeight: 800 }}>
                        <span className={row.production_variance > 0 ? styles.variancePositive : styles.varianceNegative}>
                          {row.production_variance > 0 ? `+${row.production_variance.toFixed(1)}h` : `${row.production_variance.toFixed(1)}h`}
                        </span>
                      </td>
                      <td style={{ color: "#ff7043", fontWeight: 700 }}>
                        {row.total_rework_hours.toFixed(1)}h
                      </td>
                      <td style={{ color: "#ffca28", fontWeight: 700 }}>
                        {row.total_issue_fix_hours.toFixed(1)}h
                      </td>
                      <td style={{ fontWeight: 800, fontSize: "1.05rem" }}>
                        {row.total_actual_hours.toFixed(1)}h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Global Time Logging Modal */}
      <TimesheetLogModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        defaultMachineId={selectedMachineId}
      />
    </div>
  );
}
