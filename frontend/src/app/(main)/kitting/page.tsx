"use client";

import { useState } from "react";
import { DepartmentHub } from "../../../components/DepartmentHub";
import { AssemblyKittingView } from "../../../components/assembly";
import styles from "./kitting.module.css";

export default function KittingHub() {
  const [activeTab, setActiveTab] = useState<"totes" | "issues">("totes");

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Kitting Operations Hub</h1>
          <p className={styles.subtitle}>
            BOM Hierarchy Part Staging, Assembly Totes & Shop Floor Fulfillment
          </p>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Kitting Sections">
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "totes" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("totes")}
        >
          📦 Assembly Totes & Part Staging
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "issues" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("issues")}
        >
          ⚠️ Kitting Quality Issues
        </button>
      </nav>

      {activeTab === "totes" ? (
        <AssemblyKittingView />
      ) : (
        <DepartmentHub title="Kitting Quality Hub" departmentKey="kitting" />
      )}
    </main>
  );
}
