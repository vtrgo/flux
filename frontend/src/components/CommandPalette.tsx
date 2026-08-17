"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useAppHotkeys } from "../hooks/useAppHotkeys";
import styles from "./CommandPalette.module.css";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Ensure the application captures keyboard focus on load
  useEffect(() => {
    const focusSink = document.getElementById("vtr-global-focus-sink");
    if (focusSink && document.activeElement === document.body) {
      focusSink.focus();
    }
  }, []);

  // Toggle the menu when ⌘K is pressed
  useAppHotkeys("meta+k, ctrl+k", (e) => {
    e.preventDefault();
    setOpen((open) => !open);
  });

  // Also close on escape, though cmdk handles this internally too
  useAppHotkeys(
    "escape",
    () => {
      setOpen(false);
    },
    { enableOnFormTags: true }
  );

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={() => setOpen(false)}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <Command label="Global Command Menu">
          <Command.Input autoFocus placeholder="Type a command or search..." className={styles.input} />
          <Command.List className={styles.list}>
            <Command.Empty className={styles.empty}>No results found.</Command.Empty>

            <Command.Group heading="Navigation" className={styles.group}>
              <Command.Item
                onSelect={() => {
                  router.push("/");
                  setOpen(false);
                }}
                className={styles.item}
              >
                Go to Dashboard
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  router.push("/kickoff");
                  setOpen(false);
                }}
                className={styles.item}
              >
                Go to Project Kickoff
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  router.push("/quality");
                  setOpen(false);
                }}
                className={styles.item}
              >
                Go to Quality Control
              </Command.Item>
            </Command.Group>
            
            <Command.Group heading="Actions" className={styles.group}>
              <Command.Item
                onSelect={() => {
                  router.push("/kickoff?new=true");
                  setOpen(false);
                }}
                className={styles.item}
              >
                Create New Sales Order
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
