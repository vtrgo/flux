"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import styles from "./ncrs.module.css";
import { fetchApi } from "../../../lib/api";
import { NCR } from "../../../types";
import { useSSE } from "../../../components/SSEProvider";
import { IssueCard } from "../../../components/IssueCard";
import { NCRModal } from "../../../components/NCRModal";
import { FilterButtonGroup } from "../../../components/FilterButtonGroup";
import { useAppHotkeys } from "../../../hooks/useAppHotkeys";
import { toast } from "sonner";

export default function NCRTrackerPage() {
  const [ncrs, setNcrs] = useState<NCR[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStatus, setActiveStatus] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedNCR, setSelectedNCR] = useState<NCR | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchNCRs = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (activeStatus !== "All") params.status = activeStatus.toLowerCase();

      const data = await fetchApi<NCR[]>("ncrs", { params });
      setNcrs(data || []);
    } catch (err) {
      console.error("Failed to fetch NCRs", err);
      toast.error("Failed to load Non-Conformance Reports");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeStatus]);

  useEffect(() => {
    fetchNCRs();
  }, [fetchNCRs]);

  // Real-time updates
  useSSE("defect_added", () => fetchNCRs());
  useSSE("defect_updated", (updated) => {
    setNcrs((prev) =>
      prev.map((ncr) =>
        ncr.id === updated.id ? { ...ncr, ...updated } : ncr
      )
    );
  });
  useSSE("defect_deleted", (deleted: { id: string }) => {
    setNcrs((prev) => prev.filter((ncr) => ncr.id !== deleted.id));
  });

  const openCreateModal = () => {
    setSelectedNCR(null);
    setAutoPrint(false);
    setIsModalOpen(true);
  };

  const openEditModal = (ncr: NCR) => {
    setSelectedNCR(ncr);
    setAutoPrint(false);
    setIsModalOpen(true);
  };

  const handlePrintNCR = (ncr: NCR) => {
    setSelectedNCR(ncr);
    setAutoPrint(true);
    setIsModalOpen(true);
  };

  useAppHotkeys("/", (e) => {
    e.preventDefault();
    searchInputRef.current?.focus();
  });

  useAppHotkeys("c", (e) => {
    e.preventDefault();
    openCreateModal();
  });

  const handleDelete = async (e: React.MouseEvent, ncrId: string) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to permanently delete this Non-Conformance Report?")) return;
    try {
      await fetchApi(`defects/${ncrId}`, { method: "DELETE" });
      toast.success("NCR deleted successfully");
    } catch (err) {
      console.error("Failed to delete NCR", err);
      toast.error("Failed to delete NCR");
    }
  };

  const handleStatusChange = async (e: React.MouseEvent, ncr: NCR, nextStatus: string) => {
    e.stopPropagation();
    try {
      await fetchApi(`ncrs/${ncr.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: nextStatus }),
      });
      toast.success(`NCR marked as ${nextStatus}`);
    } catch (err) {
      console.error("Failed to update status", err);
      toast.error("Failed to update status");
    }
  };

  // Metrics calculation
  const totalCount = ncrs.length;
  const openCount = ncrs.filter((n) => n.status === "open").length;
  const fixedCount = ncrs.filter((n) => n.status === "fixed").length;
  const verifiedCount = ncrs.filter((n) => n.status === "verified").length;

  if (loading) {
    return <div className={styles.loading}>LOADING NCR SYSTEM...</div>;
  }

  return (
    <main className={styles.container}>
      <header className={`${styles.header} no-print`}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>Non-Conformance Reports (NCR)</h1>
          <p className={styles.subtitle}>
            ISO Quality Compliance &amp; Fabricated Component Deficiency Tracking
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/quality" className="vtr-btn vtr-btn-secondary">
            ← Back to Quality Hub
          </Link>
          <button
            type="button"
            className="vtr-btn vtr-btn-secondary"
            onClick={() => setViewMode(viewMode === "cards" ? "table" : "cards")}
          >
            {viewMode === "cards" ? "📊 Table View" : "🗂️ Cards View"}
          </button>
          <button
            type="button"
            className="vtr-btn vtr-btn-primary"
            onClick={openCreateModal}
          >
            + CREATE NCR <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>(Press &apos;C&apos;)</span>
          </button>
        </div>
      </header>

      {/* KPI Metrics */}
      <section className={`${styles.metricsGrid} no-print`}>
        <div className={styles.metricCard}>
          <span className={styles.metricValue}>{totalCount}</span>
          <span className={styles.metricLabel}>Total NCRs Logged</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricValue} style={{ color: "var(--accent-amber)" }}>
            {openCount}
          </span>
          <span className={styles.metricLabel}>Open / In-Progress</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricValue} style={{ color: "#00e5ff" }}>
            {fixedCount}
          </span>
          <span className={styles.metricLabel}>Pending Verification</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricValue} style={{ color: "var(--accent-green)" }}>
            {verifiedCount}
          </span>
          <span className={styles.metricLabel}>Verified &amp; Cleared</span>
        </div>
      </section>

      {/* Filter & Search Bar */}
      <section className={`${styles.controls} no-print`}>
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search NCR #, Machine, Project, Location, Assembler..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSearchQuery("");
          }}
          className={`vtr-input ${styles.searchInput}`}
        />

        <FilterButtonGroup
          options={["All", "Open", "Fixed", "Verified"]}
          activeOption={activeStatus}
          onChange={setActiveStatus}
          label="Status"
        />
      </section>

      {/* Content Rendering: Cards or Table */}
      {ncrs.length === 0 ? (
        <div className={`${styles.empty} no-print`}>
          <p>No Non-Conformance Reports match your search criteria.</p>
          <button
            type="button"
            className="vtr-btn vtr-btn-primary"
            onClick={openCreateModal}
            style={{ marginTop: "1rem" }}
          >
            Create New NCR
          </button>
        </div>
      ) : viewMode === "table" ? (
        <div className={`${styles.tableWrapper} no-print`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>NCR #</th>
                <th>Machine / Project</th>
                <th>Location</th>
                <th>Assembler</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Description</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ncrs.map((ncr) => (
                <tr
                  key={ncr.id}
                  onClick={() => openEditModal(ncr)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <span className={styles.ncrNumber}>
                      {ncr.ncr_number || "NCR"}
                    </span>
                  </td>
                  <td>
                    <span className={styles.orderNumber}>{ncr.order_number}</span>
                    {ncr.internal_project_number && (
                      <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        Proj #{ncr.internal_project_number}
                      </span>
                    )}
                  </td>
                  <td>{ncr.location || "—"}</td>
                  <td>{ncr.assembler || "—"}</td>
                  <td>
                    <span className={`${styles.severity} ${styles[ncr.severity] || ""}`}>
                      {ncr.severity}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles[ncr.status] || ""}`}>
                      {ncr.status}
                    </span>
                  </td>
                  <td style={{ maxWidth: "300px" }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ncr.description}
                    </div>
                  </td>
                  <td>
                    <div className={styles.tableActions}>
                      <button
                        type="button"
                        className="vtr-btn"
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrintNCR(ncr);
                        }}
                        title="Print / Save to PDF"
                      >
                        🖨️ Print Report
                      </button>
                      <button
                        type="button"
                        className="vtr-btn"
                        style={{
                          borderColor: "var(--accent-red)",
                          color: "var(--accent-red)",
                          padding: "0.2rem 0.4rem",
                          fontSize: "0.75rem",
                        }}
                        onClick={(e) => handleDelete(e, ncr.id)}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={`${styles.cardsGrid} no-print`}>
          {ncrs.map((ncr) => (
            <IssueCard
              key={ncr.id}
              issue={ncr}
              onClick={() => openEditModal(ncr)}
              actions={
                <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
                  <button
                    type="button"
                    className="vtr-btn"
                    style={{ flex: 1, padding: "0.35rem 0.5rem", fontSize: "0.75rem" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePrintNCR(ncr);
                    }}
                    title="Print / Save to PDF"
                  >
                    🖨️ Print Report
                  </button>
                  {ncr.status === "open" && (
                    <button
                      type="button"
                      className="vtr-btn"
                      style={{
                        padding: "0.35rem 0.5rem",
                        fontSize: "0.75rem",
                        borderColor: "#00e5ff",
                        color: "#00e5ff",
                      }}
                      onClick={(e) => handleStatusChange(e, ncr, "fixed")}
                    >
                      Fix
                    </button>
                  )}
                  {ncr.status === "fixed" && (
                    <button
                      type="button"
                      className="vtr-btn"
                      style={{
                        padding: "0.35rem 0.5rem",
                        fontSize: "0.75rem",
                        borderColor: "var(--accent-green)",
                        color: "var(--accent-green)",
                      }}
                      onClick={(e) => handleStatusChange(e, ncr, "verified")}
                    >
                      Sign-off
                    </button>
                  )}
                  <button
                    type="button"
                    className="vtr-btn"
                    style={{
                      borderColor: "var(--accent-red)",
                      color: "var(--accent-red)",
                      padding: "0.35rem 0.45rem",
                      fontSize: "0.75rem",
                    }}
                    onClick={(e) => handleDelete(e, ncr.id)}
                  >
                    🗑️
                  </button>
                </div>
              }
            />
          ))}
        </div>
      )}

      {/* NCR Modal */}
      <NCRModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editingNCR={selectedNCR}
        onSaved={fetchNCRs}
        autoPrint={autoPrint}
      />
    </main>
  );
}
