/**
 * printTimesheet.ts
 *
 * Dedicated document printing utilities for Weekly Timesheet.
 * Generates an isolated, self-contained HTML document with complete styling
 * and spools directly to the printer driver via an isolated iframe.
 * Eliminates modal clipping, scroll constraints, dark mode leakage, and blank pages.
 */

import { TimesheetDayCol, TimesheetRowPrintData, TimesheetPrintParams } from '../types';
export type { TimesheetDayCol, TimesheetRowPrintData, TimesheetPrintParams };

export function generateTimesheetHtml(params: TimesheetPrintParams): string {
  const {
    employeeName,
    department,
    weekEndingDate,
    weekDays,
    rows,
    totalTargetRows = 15,
    dayTotals,
    grandTotal,
    isOvertime,
    timesheetId,
    status = 'draft',
    isApproved,
    approverName,
    approvalDate,
    notes,
  } = params;

  // Active rows
  const activeRows = rows.filter(r => r.rowTotal > 0 || r.jobLabel.trim().length > 0);
  const blankRowsCount = Math.max(0, totalTargetRows - activeRows.length);

  // Format hours helper
  const fmt = (num?: number | null): string => {
    if (num == null || isNaN(num) || num === 0) return '';
    const rounded = Math.round((num + Number.EPSILON) * 100) / 100;
    return rounded.toString();
  };

  const fmtTotal = (num?: number | null): string => {
    if (num == null || isNaN(num) || num === 0) return '0';
    const rounded = Math.round((num + Number.EPSILON) * 100) / 100;
    return rounded.toString();
  };

  const grandTotalStr = isOvertime
    ? `(${fmtTotal(grandTotal)})`
    : fmtTotal(grandTotal);

  // Build rows HTML
  let rowsHtml = '';
  activeRows.forEach(row => {
    let dayCells = '';
    weekDays.forEach(day => {
      const h = row.days[day.dateStr];
      dayCells += `<td class="colDay cellHours">${fmt(h)}</td>`;
    });

    const orderNum = row.orderNumber || (row.jobLabel && row.jobLabel.includes(' - ') ? row.jobLabel.split(' - ')[0] : (row.jobLabel || '—'));
    const asmLabel = row.assemblyLabel || '—';
    const taskName = row.taskName || (row.jobLabel && row.jobLabel.includes(' - ') ? row.jobLabel.split(' - ').slice(1).join(' - ') : (row.jobLabel || 'General Task'));

    rowsHtml += `
      <tr class="rowJob">
        <td class="colProject" title="${escapeHtml(orderNum)}">
          <span class="cellText boldText">${escapeHtml(orderNum)}</span>
        </td>
        <td class="colAssembly" title="${escapeHtml(asmLabel)}">
          <span class="cellText">${escapeHtml(asmLabel)}</span>
        </td>
        <td class="colTask" title="${escapeHtml(taskName)}">
          <span class="cellText">${escapeHtml(taskName)}</span>
        </td>
        ${dayCells}
        <td class="colTotal cellRowTotal">${fmtTotal(row.rowTotal)}</td>
      </tr>
    `;
  });

  // Padded blank rows for write-ins
  for (let i = 0; i < blankRowsCount; i++) {
    let blankDayCells = '';
    weekDays.forEach(() => {
      blankDayCells += `<td class="colDay">&nbsp;</td>`;
    });
    rowsHtml += `
      <tr class="rowBlank">
        <td class="colProject">&nbsp;</td>
        <td class="colAssembly">&nbsp;</td>
        <td class="colTask">&nbsp;</td>
        ${blankDayCells}
        <td class="colTotal cellRowTotal">0</td>
      </tr>
    `;
  }

  // Day totals cells
  let dayTotalCells = '';
  weekDays.forEach(day => {
    const tot = dayTotals[day.dateStr] || 0;
    dayTotalCells += `<td class="colDay cellDayTotal">${fmtTotal(tot)}</td>`;
  });

  // Header days cells
  let thDayCells = '';
  let thDateCells = '';
  weekDays.forEach(day => {
    thDayCells += `<th class="colDay thDayName">${day.dayName}</th>`;
    thDateCells += `<th class="colDay thDateValue">${day.mdFormatted}</th>`;
  });

  const digitalSealHtml = isApproved
    ? `
      <div class="digitalApprovalStamp">
        <span>✅</span>
        <span>
          Digitally Approved in Flux by <strong>${escapeHtml(approverName || 'Department Manager')}</strong>
          ${approvalDate ? ` on ${escapeHtml(approvalDate)}` : ''}
        </span>
      </div>
    `
    : '';

  const printTimestamp = new Date().toLocaleDateString('en-US');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Weekly Job Schedule - ${escapeHtml(employeeName)} - Week Ending ${escapeHtml(weekEndingDate)}</title>
  <style>
    @page {
      size: letter landscape;
      margin: 0.35in 0.35in 0.35in 0.35in;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 100%;
      height: 100%;
      background: #ffffff !important;
      color: #000000 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
    }
    .headerTable {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
    }
    .headerTable td {
      padding: 4px 6px;
      vertical-align: middle;
    }
    .employeeNameCell {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #000000;
    }
    .scheduleTitleCell {
      font-size: 18px;
      font-weight: 800;
      text-align: right;
      letter-spacing: 0.5px;
      color: #000000;
    }
    .weekEndingCell {
      font-size: 13px;
      font-weight: 700;
      padding-top: 6px;
      color: #000000;
    }
    .instructionCell {
      font-size: 11.5px;
      font-style: italic;
      color: #333333;
      padding: 4px 6px 10px 6px;
      text-align: left;
    }
    .gridTable {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-bottom: 10px;
    }
    .gridTable th,
    .gridTable td {
      border: 1.5px solid #000000;
      padding: 5px 6px;
      box-sizing: border-box;
      color: #000000;
      vertical-align: middle;
    }
    .colProject {
      width: 14%;
      text-align: left;
    }
    .colAssembly {
      width: 18%;
      text-align: left;
    }
    .colTask {
      width: 22%;
      text-align: left;
    }
    .colDay {
      width: 5.5%;
      text-align: center;
    }
    .colTotal {
      width: 7.5%;
      text-align: right;
    }
    .colJob {
      width: 54%;
      text-align: left;
    }
    .cellText {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
    }
    .boldText {
      font-weight: 700;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .thDayName {
      background-color: #f0f0f0 !important;
      font-weight: 700;
      font-size: 11.5px;
      text-align: center;
      height: 26px;
      letter-spacing: 0.25px;
    }
    .thDateLabel {
      background-color: #f8f8f8 !important;
      font-weight: 700;
      font-size: 11px;
      text-align: left;
      height: 22px;
    }
    .thDateValue {
      background-color: #f8f8f8 !important;
      font-weight: 600;
      font-size: 11px;
      text-align: center;
      height: 22px;
    }
    .rowJob td {
      height: 23px;
      font-size: 11px;
    }
    .jobName {
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
    }
    .cellHours {
      text-align: center;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11.5px;
      font-weight: 500;
    }
    .cellRowTotal {
      text-align: right;
      font-weight: 700;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11.5px;
    }
    .rowBlank td {
      height: 23px;
    }
    .rowTotals td {
      background-color: #e5e5e5 !important;
      font-weight: 800;
      font-size: 12px;
      height: 28px;
      border-top: 2px solid #000000 !important;
      border-bottom: 2px solid #000000 !important;
    }
    .labelTotal {
      text-align: left;
      letter-spacing: 0.5px;
    }
    .cellDayTotal {
      text-align: center;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11.5px;
    }
    .cellGrandTotal {
      text-align: right;
      font-size: 12.5px;
      font-weight: 800;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .overtimeBracket {
      font-weight: 800;
    }
    .commentsBox {
      width: 100%;
      border: 1.5px solid #000000;
      border-radius: 2px;
      margin-top: 6px;
      margin-bottom: 6px;
      background: #ffffff;
      box-sizing: border-box;
      page-break-inside: avoid;
    }
    .commentsHeader {
      background-color: #f0f0f0 !important;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 3px 8px;
      border-bottom: 1px solid #000000;
      color: #000000;
    }
    .commentsBody {
      padding: 6px 10px;
      min-height: 115px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
    }
    .commentsText {
      font-size: 11px;
      color: #111111;
      white-space: pre-wrap;
      margin-bottom: 6px;
      line-height: 1.4;
      font-weight: 500;
    }
    .commentsLines {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-top: 4px;
      width: 100%;
    }
    .commentRule {
      width: 100%;
      border-bottom: 1px dashed #b0b0b0;
      height: 1px;
    }
    .footerContainer {
      margin-top: 10px;
      width: 100%;
    }
    .approvalTable {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
    }
    .approvalTable td {
      vertical-align: top;
      padding: 6px 8px;
    }
    .approvalLabelCell {
      width: 40%;
      font-size: 12px;
      font-weight: 700;
      color: #111111;
      padding-top: 8px;
    }
    .approvalBoxCell {
      width: 60%;
      border: 1.5px solid #000000;
      border-radius: 2px;
      padding: 10px 14px;
      background-color: #fafafa;
    }
    .signatureLines {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .sigRow {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      font-size: 11px;
      color: #111111;
    }
    .sigUnderline {
      flex: 1;
      border-bottom: 1.5px solid #000000;
      height: 16px;
    }
    .digitalApprovalStamp {
      margin-top: 8px;
      padding: 5px 8px;
      background-color: #e8f5e9 !important;
      border: 1px solid #81c784 !important;
      border-radius: 3px;
      font-size: 10px;
      color: #1b5e20;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .deliveryNotice {
      font-size: 11.5px;
      font-weight: 700;
      color: #000000;
      margin-top: 8px;
      text-align: left;
    }
    .systemAuditLine {
      font-size: 9px;
      color: #666666;
      margin-top: 10px;
      display: flex;
      justify-content: space-between;
      border-top: 1px dotted #ccc;
      padding-top: 4px;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <table class="headerTable">
      <tbody>
        <tr>
          <td class="employeeNameCell">
            EMPLOYEE NAME:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${escapeHtml(employeeName)}
            ${department ? `<span style="font-size:11px;font-weight:normal;color:#555;margin-left:12px;">(${escapeHtml(department)})</span>` : ''}
          </td>
          <td class="scheduleTitleCell">
            Weekly Job Schedule
          </td>
        </tr>
        <tr>
          <td colspan="2" class="weekEndingCell">
            Week Ending:&nbsp;&nbsp;<strong>${escapeHtml(weekEndingDate)}</strong>
          </td>
        </tr>
      </tbody>
    </table>

    <table class="gridTable">
      <thead>
        <tr>
          <th class="colProject thDayName">Project / Order #</th>
          <th class="colAssembly thDayName">Assembly</th>
          <th class="colTask thDayName">Task Description</th>
          ${thDayCells}
          <th class="colTotal thDayName">Total</th>
        </tr>
        <tr>
          <th colspan="3" class="thDateLabel">Date</th>
          ${thDateCells}
          <th class="colTotal thDateValue"></th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
      <tfoot>
        <tr class="rowTotals">
          <td colspan="3" class="labelTotal">TOTAL</td>
          ${dayTotalCells}
          <td class="colTotal cellGrandTotal">${grandTotalStr}</td>
        </tr>
      </tfoot>
    </table>

    <div class="commentsBox">
      <div class="commentsHeader">Comments / Notes &amp; Remarks</div>
      <div class="commentsBody">
        ${notes ? `<div class="commentsText">${escapeHtml(notes)}</div>` : ''}
        <div class="commentsLines">
          ${Array.from({ length: notes ? 4 : 7 }).map(() => `<div class="commentRule"></div>`).join('')}
        </div>
      </div>
    </div>

    <div class="footerContainer">
      <div class="deliveryNotice">
        Approved timesheets must be delivered to Lisa every Monday morning
      </div>

      <div class="systemAuditLine">
        <span>
          Flux MES &bull; Timesheet ID: ${timesheetId ? escapeHtml(timesheetId.slice(0, 8)) : 'NEW'} &bull; Status: ${escapeHtml(status.toUpperCase())}
        </span>
        <span>
          Generated: ${printTimestamp}
        </span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function printTimesheetDocument(html: string): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  // Create isolated iframe
  const iframe = document.createElement('iframe');
  iframe.setAttribute('style', 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    if (document.body.contains(iframe)) document.body.removeChild(iframe);
    window.print();
    return true;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow;
  if (!win) {
    if (document.body.contains(iframe)) document.body.removeChild(iframe);
    window.print();
    return true;
  }

  const trigger = () => {
    try {
      win.focus();
      win.print();
    } catch (err) {
      console.error('Isolated print failed, falling back to window.print', err);
      window.print();
    } finally {
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }
  };

  if (doc.readyState === 'complete') {
    setTimeout(trigger, 100);
  } else {
    iframe.onload = () => setTimeout(trigger, 100);
  }

  return true;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
