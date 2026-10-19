"use client";

import React, { useState, useEffect, useMemo, useId } from "react";
import { toast } from "sonner";
import { useAuth } from "../../../contexts/AuthContext";
import { useTimesheetData } from "../../../hooks/useTimesheetData";
import { TimesheetLogModal } from "../../../components/TimesheetLogModal";
import { Machine, CreateProjectTaskRequest, CreateDepartmentTaskRequest } from "../../../types";
import { fetchApi } from "../../../lib/api";
import styles from "./timesheet.module.css";

const DEPARTMENTS = [
  { id: "assembly", label: "Assembly" },
  { id: "controls", label: "Electrical / Controls" },
  { id: "machine-shop", label: "Machine Shop" },
  { id: "laser", label: "Laser" },
  { id: "design", label: "Design" },
  { id: "enclosures", label: "Enclosures" },
  { id: "kitting", label: "Kitting" },
  { id: "quality", label: "Quality / FAT" },
];

export default function TimesheetPage() {
  const customTaskNameId = useId();
  const customDeptId = useId();
  const customQuoteId = useId();
  const newDeptId = useId();
  const newCodeId = useId();
  const newNameId = useId();
  const newHoursId = useId();
  const tableFilterId = useId();
  const { user, isAdmin, hasRole } = useAuth();
  const isLeadOrManager = isAdmin || hasRole(["manager", "lead"]);

  const [activeTab, setActiveTab] = useState<"my_time" | "project_variance" | "quoting_review" | "dept_catalog">("my_time");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>("");

  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);

  // Machine Quoting Task Form State
  const [quotingDept, setQuotingDept] = useState<string>("assembly");
  const [tableDeptFilter, setTableDeptFilter] = useState<string>("all");
  const [selectedCatalogTaskId, setSelectedCatalogTaskId] = useState<string>("");
  const [customTaskName, setCustomTaskName] = useState("");
  const [taskQuotedHours, setTaskQuotedHours] = useState<string>("20.0");
  const [addingTask, setAddingTask] = useState(false);

  // Editing existing task quote state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editQuoteVal, setEditQuoteVal] = useState<string>("");

  // Department Catalog Management State
  const [selectedCatalogDept, setSelectedCatalogDept] = useState<string>("assembly");
  const [newDeptTaskCode, setNewDeptTaskCode] = useState("");
  const [newDeptTaskName, setNewDeptTaskName] = useState("");
  const [newDeptDefaultQuote, setNewDeptDefaultQuote] = useState("10.0");
  const [addingDeptTask, setAddingDeptTask] = useState(false);

  const {
    myEntries,
    machineSummary,
    quotingReview,
    departmentTasks,
    loading,
    deleteEntry,
    createOrUpdateTask,
    updateTaskQuote,
    fetchQuotingReview,
    fetchDepartmentTasks,
    createDepartmentTask,
    deleteDepartmentTask,
  } = useTimesheetData(selectedMachineId);

  // Load machines
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
    if (activeTab === "dept_catalog") {
      fetchDepartmentTasks();
    }
  }, [activeTab, fetchQuotingReview, fetchDepartmentTasks]);

  // Sync selected catalog task default quote
  useEffect(() => {
    if (selectedCatalogTaskId && selectedCatalogTaskId !== "custom") {
      const found = departmentTasks.find(t => t.id === selectedCatalogTaskId);
      if (found) {
        setTaskQuotedHours(found.default_quoted_hours.toString());
      }
    }
  }, [selectedCatalogTaskId, departmentTasks]);

  // Hotkey T
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

  // Distilled core tasks for the currently selected quoting department
  const distilledQuotingTasks = useMemo(() => {
    return departmentTasks.filter(t => t.department === quotingDept && t.is_active);
  }, [departmentTasks, quotingDept]);

  // Filtered machine tasks for the active machine's variance table
  const filteredMachineTasks = useMemo(() => {
    if (!machineSummary || !machineSummary.tasks) return [];
    if (tableDeptFilter === "all") return machineSummary.tasks;
    return machineSummary.tasks.filter(t => t.department === tableDeptFilter);
  }, [machineSummary, tableDeptFilter]);

  // Filtered department tasks for catalog view
  const filteredDeptTasks = useMemo(() => {
    return departmentTasks.filter(t => t.department === selectedCatalogDept);
  }, [departmentTasks, selectedCatalogDept]);

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

    let code = "";
    let name = "";
    const dept = quotingDept;

    if (selectedCatalogTaskId === "custom") {
      if (!customTaskName.trim()) {
        toast.error("Please enter a custom task name");
        return;
      }
      name = customTaskName.trim();
      code = name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    } else {
      const item = departmentTasks.find(t => t.id === selectedCatalogTaskId);
      if (item) {
        code = item.task_code;
        name = item.task_name;
      } else {
        toast.error("Please select a task from the distilled catalog or choose custom");
        return;
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
      toast.success(`Task "${name}" added to ${dept} with ${hours} quoted hours!`);
      setIsAddTaskOpen(false);
      setCustomTaskName("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add task";
      toast.error(message);
    } finally {
      setAddingTask(false);
    }
  };

  const handlePopulateDeptDefaults = async (dept: string) => {
    if (!selectedMachineId) {
      toast.error("Please select a machine first");
      return;
    }
    const deptItems = departmentTasks.filter(t => t.department === dept && t.is_active);
    if (deptItems.length === 0) {
      toast.error(`No core tasks found for department ${dept}`);
      return;
    }

    try {
      for (const t of deptItems) {
        await createOrUpdateTask(selectedMachineId, {
          task_code: t.task_code,
          task_name: t.task_name,
          department: t.department,
          quoted_hours: t.default_quoted_hours,
        });
      }
      toast.success(`Populated ${deptItems.length} default tasks for ${dept}!`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to populate default tasks";
      toast.error(message);
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

  const handleAddDeptTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hours = parseFloat(newDeptDefaultQuote);
    if (isNaN(hours) || hours < 0) {
      toast.error("Default quoted hours cannot be negative");
      return;
    }
    if (!newDeptTaskCode.trim() || !newDeptTaskName.trim()) {
      toast.error("Task code and task name are required");
      return;
    }

    try {
      setAddingDeptTask(true);
      const req: CreateDepartmentTaskRequest = {
        department: selectedCatalogDept,
        task_code: newDeptTaskCode.trim().toLowerCase().replace(/[^a-z0-9]/g, "_"),
        task_name: newDeptTaskName.trim(),
        default_quoted_hours: hours,
      };
      await createDepartmentTask(req);
      toast.success(`Core task "${req.task_name}" added to ${selectedCatalogDept}`);
      setNewDeptTaskCode("");
      setNewDeptTaskName("");
      setNewDeptDefaultQuote("10.0");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add department task";
      toast.error(message);
    } finally {
      setAddingDeptTask(false);
    }
  };

  const handleRetireDeptTask = async (id: string, name: string) => {
    if (!window.confirm(`Retire core task "${name}"? It will no longer appear for future quotes, but historical records will be preserved.`)) {
      return;
    }
    try {
      await deleteDepartmentTask(id);
      toast.success(`Task "${name}" retired from catalog`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to retire task";
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
              <>
                <button
                  className={`${styles.toggleBtn} ${activeTab === "dept_catalog" ? styles.toggleBtnActive : ""}`}
                  onClick={() => setActiveTab("dept_catalog")}
                >
                  🏢 Department Tasks
                </button>
                <button
                  className={`${styles.toggleBtn} ${activeTab === "quoting_review" ? styles.toggleBtnActive : ""}`}
                  onClick={() => setActiveTab("quoting_review")}
                >
                  📑 Quoting Audit
                </button>
              </>
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

          {/* Add Quoted Task Sub-panel with Independent Department & Distilled Tasks */}
          {isAddTaskOpen && isLeadOrManager && (
            <div className={styles.contentCard} style={{ border: "1px solid var(--vtr-theme-primary, #00e5ff)", padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h3 style={{ margin: 0, fontSize: "1.1rem", color: "var(--vtr-theme-primary, #00e5ff)" }}>
                  Assign Quoted Tasks to Machine {machineSummary?.order_number}
                </h3>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary, #aaa)" }}>
                  Select department first to distill the core task catalog
                </span>
              </div>

              <form onSubmit={handleAddTaskSubmit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", alignItems: "flex-end" }}>
                {/* 1. Independent Department Dropdown */}
                <div>
                  <label htmlFor={customDeptId} style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem", fontWeight: 700 }}>
                    1. Target Department *
                  </label>
                  <select
                    id={customDeptId}
                    style={{ width: "100%", padding: "0.5rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                    value={quotingDept}
                    onChange={(e) => {
                      const nextDept = e.target.value;
                      setQuotingDept(nextDept);
                      const tasksInNextDept = departmentTasks.filter(t => t.department === nextDept && t.is_active);
                      if (tasksInNextDept.length > 0) {
                        setSelectedCatalogTaskId(tasksInNextDept[0].id);
                        setTaskQuotedHours(tasksInNextDept[0].default_quoted_hours.toString());
                      } else {
                        setSelectedCatalogTaskId("");
                        setTaskQuotedHours("10.0");
                      }
                      setCustomTaskName("");
                    }}
                  >
                    {DEPARTMENTS.map(d => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Distilled Tasks for the Selected Department */}
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem", fontWeight: 700 }}>
                    2. Distilled {DEPARTMENTS.find(d => d.id === quotingDept)?.label} Tasks *
                  </label>
                  <select
                    style={{ width: "100%", padding: "0.5rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                    value={selectedCatalogTaskId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedCatalogTaskId(val);
                      if (val && val !== "custom") {
                        const found = departmentTasks.find(t => t.id === val);
                        if (found) setTaskQuotedHours(found.default_quoted_hours.toString());
                      }
                    }}
                    required
                  >
                    <option value="">-- Choose a {DEPARTMENTS.find(d => d.id === quotingDept)?.label} Task --</option>
                    {distilledQuotingTasks.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.task_name} (Default: {cat.default_quoted_hours}h)
                      </option>
                    ))}
                    <option value="custom">-- Custom One-Off Task --</option>
                  </select>
                </div>

                {selectedCatalogTaskId === "custom" && (
                  <div>
                    <label htmlFor={customTaskNameId} style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem", fontWeight: 700 }}>
                      Custom Task Name *
                    </label>
                    <input
                      id={customTaskNameId}
                      type="text"
                      placeholder="e.g. Special Fitment Operation"
                      style={{ width: "100%", padding: "0.5rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                      value={customTaskName}
                      onChange={(e) => setCustomTaskName(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div>
                  <label htmlFor={customQuoteId} style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem", fontWeight: 700 }}>
                    Quoted Hours *
                  </label>
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

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button type="submit" className="vtr-btn vtr-btn-primary" disabled={addingTask} style={{ flex: 1 }}>
                    {addingTask ? "Saving..." : "Save Quoted Task"}
                  </button>
                  <button
                    type="button"
                    className="vtr-btn vtr-btn-secondary"
                    onClick={() => handlePopulateDeptDefaults(quotingDept)}
                    title={`Add all active core tasks from ${DEPARTMENTS.find(d => d.id === quotingDept)?.label} to machine`}
                  >
                    + Add All {DEPARTMENTS.find(d => d.id === quotingDept)?.label} Tasks
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
            <div className={styles.cardHeader} style={{ flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h2 className={styles.cardTitle}>
                  <span>⚙️</span> Task Allocation & Variance Breakdown: {machineSummary?.order_number}
                </h2>
                <span style={{ fontSize: "0.85rem", color: "var(--text-secondary, #aaa)" }}>
                  Model: <strong>{machineSummary?.model_type}</strong>
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <label htmlFor={tableFilterId} style={{ fontSize: "0.85rem", color: "var(--text-secondary, #aaa)", fontWeight: 600 }}>
                  Department:
                </label>
                <select
                  id={tableFilterId}
                  style={{
                    padding: "0.35rem 0.6rem",
                    background: "#000",
                    border: "1px solid var(--border-color, #444)",
                    borderRadius: "4px",
                    color: "#fff",
                    fontSize: "0.85rem",
                  }}
                  value={tableDeptFilter}
                  onChange={(e) => setTableDeptFilter(e.target.value)}
                >
                  <option value="all">All Departments ({machineSummary?.tasks?.length || 0})</option>
                  {DEPARTMENTS.map((d) => {
                    const count = machineSummary?.tasks?.filter((t) => t.department === d.id).length || 0;
                    return (
                      <option key={d.id} value={d.id}>
                        {d.label} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>
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
              ) : filteredMachineTasks.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No tasks quoted for {DEPARTMENTS.find(d => d.id === tableDeptFilter)?.label || tableDeptFilter}.</p>
                  <button className="vtr-btn vtr-btn-secondary" onClick={() => setTableDeptFilter("all")}>
                    Show All Departments
                  </button>
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
                    {filteredMachineTasks.map((task) => {
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

      {/* TAB 3: DEPARTMENT TASK CATALOG (Lead / Manager View) */}
      {activeTab === "dept_catalog" && isLeadOrManager && (
        <div className={styles.contentCard}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>
                <span>🏢</span> Core Department Tasks Library
              </h2>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary, #aaa)" }}>
                Define core tasks and baseline quoting standards per department. Retiring tasks removes them from future machine quotes while protecting historical data.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 700 }}>Department:</label>
              <select
                style={{ padding: "0.5rem 0.85rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                value={selectedCatalogDept}
                onChange={(e) => setSelectedCatalogDept(e.target.value)}
              >
                {DEPARTMENTS.map(d => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Add New Core Department Task Form */}
          <div style={{ padding: "1.25rem", background: "rgba(0,0,0,0.2)", borderBottom: "1px solid var(--border-color, #333)" }}>
            <h4 style={{ margin: "0 0 0.75rem 0", fontSize: "0.95rem", color: "var(--vtr-theme-primary, #00e5ff)" }}>
              + Add New Core Task to {DEPARTMENTS.find(d => d.id === selectedCatalogDept)?.label}
            </h4>
            <form onSubmit={handleAddDeptTaskSubmit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", alignItems: "flex-end" }}>
              <div>
                <label htmlFor={newDeptId} style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem" }}>Department</label>
                <input
                  id={newDeptId}
                  type="text"
                  value={DEPARTMENTS.find(d => d.id === selectedCatalogDept)?.label || selectedCatalogDept}
                  disabled
                  style={{ width: "100%", padding: "0.5rem", background: "rgba(255,255,255,0.05)", border: "1px solid #333", color: "#888", borderRadius: "4px" }}
                />
              </div>
              <div>
                <label htmlFor={newCodeId} style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem" }}>Task Identifier Code *</label>
                <input
                  id={newCodeId}
                  type="text"
                  placeholder="e.g. sensor_bracket_mount"
                  style={{ width: "100%", padding: "0.5rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                  value={newDeptTaskCode}
                  onChange={(e) => setNewDeptTaskCode(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor={newNameId} style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem" }}>Display Task Name *</label>
                <input
                  id={newNameId}
                  type="text"
                  placeholder="e.g. Sensor Bracket Mount & Test"
                  style={{ width: "100%", padding: "0.5rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                  value={newDeptTaskName}
                  onChange={(e) => setNewDeptTaskName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor={newHoursId} style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem" }}>Default Quoted Hours *</label>
                <input
                  id={newHoursId}
                  type="number"
                  step="0.5"
                  min="0"
                  style={{ width: "100%", padding: "0.5rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                  value={newDeptDefaultQuote}
                  onChange={(e) => setNewDeptDefaultQuote(e.target.value)}
                  required
                />
              </div>
              <div>
                <button type="submit" className="vtr-btn vtr-btn-primary" disabled={addingDeptTask} style={{ width: "100%" }}>
                  {addingDeptTask ? "Adding..." : "+ Add to Catalog"}
                </button>
              </div>
            </form>
          </div>

          {/* Department Tasks Table */}
          <div className={styles.tableWrapper}>
            {filteredDeptTasks.length === 0 ? (
              <div className={styles.emptyState}>No core tasks defined for this department yet.</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Task Code</th>
                    <th>Task Name</th>
                    <th>Department</th>
                    <th>Default Quoted Hours</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeptTasks.map((task) => (
                    <tr key={task.id}>
                      <td>
                        <code>{task.task_code}</code>
                      </td>
                      <td>
                        <strong>{task.task_name}</strong>
                      </td>
                      <td style={{ textTransform: "capitalize" }}>{task.department}</td>
                      <td style={{ fontWeight: 700, fontSize: "1rem" }}>{task.default_quoted_hours.toFixed(1)}h</td>
                      <td>
                        <span className={`${styles.categoryBadge} ${task.is_active ? styles.badgeProduction : styles.badgeIndirect}`}>
                          {task.is_active ? "ACTIVE" : "RETIRED"}
                        </span>
                      </td>
                      <td>
                        {task.is_active && (
                          <button
                            className="vtr-btn vtr-btn-danger"
                            style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                            onClick={() => handleRetireDeptTask(task.id, task.task_name)}
                          >
                            Retire Task
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: QUOTING AUDIT & REVIEW (Management View) */}
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
