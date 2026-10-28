import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

def build_timesheet():
    wb = openpyxl.Workbook()
    
    # -------------------------------------------------------------
    # STYLES & PALETTE
    # -------------------------------------------------------------
    font_family = "Segoe UI"
    
    font_title = Font(name=font_family, size=15, bold=True, color="1E293B")
    font_emp_header = Font(name=font_family, size=11, bold=True, color="0F172A")
    font_sub = Font(name=font_family, size=9, italic=True, color="64748B")
    font_th = Font(name=font_family, size=9.5, bold=True, color="0F172A")
    font_date_th = Font(name=font_family, size=9, bold=True, color="334155")
    font_body = Font(name=font_family, size=9.5, color="1E293B")
    font_body_mono = Font(name="Consolas", size=9.5, color="0F172A")
    font_body_mono_bold = Font(name="Consolas", size=9.5, bold=True, color="0F172A")
    font_total = Font(name=font_family, size=10, bold=True, color="0F172A")
    font_grand_total = Font(name="Consolas", size=11, bold=True, color="0F172A")
    font_audit = Font(name=font_family, size=8.5, color="64748B")
    font_notice = Font(name=font_family, size=8.5, italic=True, bold=True, color="475569")
    
    fill_header_main = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    fill_header_date = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    fill_total = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")
    fill_weekend = PatternFill(start_color="FBFBFC", end_color="FBFBFC", fill_type="solid")
    fill_box_header = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")
    
    bd_thin = Side(style="thin", color="CBD5E1")
    bd_medium = Side(style="medium", color="475569")
    bd_double = Side(style="double", color="0F172A")
    bd_dark_thin = Side(style="thin", color="64748B")
    
    border_grid = Border(left=bd_thin, right=bd_thin, top=bd_thin, bottom=bd_thin)
    border_grid_th = Border(left=bd_thin, right=bd_thin, top=bd_medium, bottom=bd_thin)
    border_grid_date = Border(left=bd_thin, right=bd_thin, top=bd_thin, bottom=bd_medium)
    border_totals = Border(left=bd_thin, right=bd_thin, top=bd_medium, bottom=bd_double)
    
    align_left = Alignment(horizontal="left", vertical="center")
    align_center = Alignment(horizontal="center", vertical="center")
    align_right = Alignment(horizontal="right", vertical="center")
    
    # =============================================================
    # SHEET 1: FLUX MES TIMESHEET
    # =============================================================
    ws1 = wb.active
    ws1.title = "Flux Timesheet"
    ws1.views.sheetView[0].showGridLines = True
    
    # Page setup for printing
    ws1.page_setup.orientation = ws1.ORIENTATION_LANDSCAPE
    ws1.page_setup.paperSize = ws1.PAPERSIZE_LETTER
    ws1.page_setup.fitToPage = True
    ws1.page_setup.fitToWidth = 1
    ws1.page_setup.fitToHeight = 1
    ws1.sheet_properties.pageSetUpPr.fitToPage = True
    ws1.page_margins.left = 0.35
    ws1.page_margins.right = 0.35
    ws1.page_margins.top = 0.4
    ws1.page_margins.bottom = 0.4
    
    # Column widths (A..K)
    col_widths = {
        'A': 17,  # Project / Order #
        'B': 18,  # Assembly
        'C': 30,  # Task Description
        'D': 9,   # Sun
        'E': 9,   # Mon
        'F': 9,   # Tue
        'G': 9,   # Wed
        'H': 9,   # Thu
        'I': 9,   # Fri
        'J': 9,   # Sat
        'K': 11,  # Total
    }
    for col_letter, w in col_widths.items():
        ws1.column_dimensions[col_letter].width = w

    # --- Header Information (Rows 1-3) ---
    ws1.row_dimensions[1].height = 28
    ws1['A1'] = "EMPLOYEE NAME:   Lucas Sinclair   (Assembly)"
    ws1['A1'].font = font_emp_header
    ws1['A1'].alignment = align_left
    
    ws1.merge_cells('F1:K1')
    ws1['F1'] = "Weekly Job Schedule"
    ws1['F1'].font = font_title
    ws1['F1'].alignment = Alignment(horizontal="right", vertical="center")
    
    ws1.row_dimensions[2].height = 20
    ws1['A2'] = "Week Ending: "
    ws1['A2'].font = Font(name=font_family, size=10, bold=True, color="0F172A")
    ws1['B2'] = "=J5"  # Sat date
    ws1['B2'].font = Font(name=font_family, size=10, bold=True, color="0F172A")
    ws1['B2'].number_format = "mmmm d, yyyy"
    ws1['B2'].alignment = align_left
    
    ws1.row_dimensions[3].height = 18
    ws1.merge_cells('A3:K3')
    ws1['A3'] = "Please add brackets () to time over 40 hours"
    ws1['A3'].font = font_sub
    ws1['A3'].alignment = align_left

    # --- Table Header: Day names (Row 4) ---
    ws1.row_dimensions[4].height = 22
    headers = [
        ("A", "Project / Order #", align_left),
        ("B", "Assembly", align_left),
        ("C", "Task Description", align_left),
        ("D", "Sun", align_center),
        ("E", "Mon", align_center),
        ("F", "Tue", align_center),
        ("G", "Wed", align_center),
        ("H", "Thu", align_center),
        ("I", "Fri", align_center),
        ("J", "Sat", align_center),
        ("K", "Total", align_right),
    ]
    for col_letter, text, align in headers:
        cell = ws1[f"{col_letter}4"]
        cell.value = text
        cell.font = font_th
        cell.fill = fill_header_main
        cell.alignment = align
        cell.border = border_grid_th

    # --- Table Header: Dates (Row 5) ---
    ws1.row_dimensions[5].height = 20
    ws1.merge_cells('A5:C5')
    cell_date_label = ws1['A5']
    cell_date_label.value = "Date"
    cell_date_label.font = font_date_th
    cell_date_label.fill = fill_header_date
    cell_date_label.alignment = align_left
    for col in ['A', 'B', 'C']:
        ws1[f"{col}5"].border = border_grid_date
        ws1[f"{col}5"].fill = fill_header_date
        
    # Dates: Sun is base date, Mon..Sat formula +1
    base_sunday = datetime.date(2026, 10, 25)
    ws1['D5'] = base_sunday
    ws1['D5'].number_format = "m/d"
    ws1['D5'].font = font_date_th
    ws1['D5'].alignment = align_center
    ws1['D5'].fill = fill_header_date
    ws1['D5'].border = border_grid_date
    
    prev_col = 'D'
    for c_idx, col_letter in enumerate(['E', 'F', 'G', 'H', 'I', 'J']):
        cell = ws1[f"{col_letter}5"]
        cell.value = f"={prev_col}5+1"
        cell.number_format = "m/d"
        cell.font = font_date_th
        cell.alignment = align_center
        cell.fill = fill_header_date
        cell.border = border_grid_date
        prev_col = col_letter

    ws1['K5'].value = ""
    ws1['K5'].fill = fill_header_date
    ws1['K5'].border = border_grid_date

    # --- Job Rows (Rows 6-22) ---
    sample_jobs = [
        ("PRJ-22-003A1", "[EP] Main Enclosure", "Electrical Panel Build", [0, 2.25, 4.0, 1.0, 0, 0, 0]),
        ("PRJ-22-045",   "[EP] Enclosure Sub",  "Sub-assembly & Wiring",   [0, 2.0, 2.75, 1.0, 4.0, 1.0, 0]),
        ("PRJ-22-139A2", "[EP] Routing Assembly", "Harness Routing",       [0, 1.0, 0, 1.25, 0.5, 2.0, 0]),
        ("PRJ-23-034B3", "[EP] Main Enclosure", "Rework: Harness Bracket", [0, 0, 0, 0, 1.0, 0, 0]),
        ("Shop / Indirect", "—", "Shop 5S & Maintenance",                 [0, 2.0, 2.5, 3.0, 2.25, 2.0, 3.0]),
        ("Shop / Indirect", "—", "Safety & IPC Training",                  [0, 2.0, 2.0, 2.0, 2.0, 1.0, 0]),
    ]
    
    start_row = 6
    total_data_rows = 17  # Rows 6 to 22
    
    for i in range(total_data_rows):
        r = start_row + i
        ws1.row_dimensions[r].height = 20
        is_sample = i < len(sample_jobs)
        job_data = sample_jobs[i] if is_sample else ("", "", "", [None]*7)
        
        ws1[f"A{r}"] = job_data[0]
        ws1[f"A{r}"].font = font_body_mono_bold if job_data[0] else font_body
        ws1[f"A{r}"].alignment = align_left
        ws1[f"A{r}"].border = border_grid
        
        ws1[f"B{r}"] = job_data[1]
        ws1[f"B{r}"].font = font_body
        ws1[f"B{r}"].alignment = align_left
        ws1[f"B{r}"].border = border_grid
        
        ws1[f"C{r}"] = job_data[2]
        ws1[f"C{r}"].font = font_body
        ws1[f"C{r}"].alignment = align_left
        ws1[f"C{r}"].border = border_grid
        
        # Day hours D..J
        for d_idx, col_letter in enumerate(['D', 'E', 'F', 'G', 'H', 'I', 'J']):
            cell = ws1[f"{col_letter}{r}"]
            val = job_data[3][d_idx]
            if val is not None and val > 0:
                cell.value = val
            cell.number_format = "0.00"
            cell.font = font_body_mono
            cell.alignment = align_center
            cell.border = border_grid
            if col_letter in ('D', 'J'):
                cell.fill = fill_weekend
                
        # Total per row
        total_cell = ws1[f"K{r}"]
        total_cell.value = f"=SUM(D{r}:J{r})"
        total_cell.number_format = "0.00"
        total_cell.font = font_body_mono_bold
        total_cell.alignment = align_right
        total_cell.border = border_grid
        
    last_data_row = start_row + total_data_rows - 1  # 22
    
    # --- TOTALS ROW (Row 23) ---
    tot_row = last_data_row + 1  # 23
    ws1.row_dimensions[tot_row].height = 24
    
    ws1.merge_cells(f"A{tot_row}:C{tot_row}")
    cell_tot_label = ws1[f"A{tot_row}"]
    cell_tot_label.value = "TOTAL HOURS"
    cell_tot_label.font = font_total
    cell_tot_label.alignment = align_left
    for col in ['A', 'B', 'C']:
        ws1[f"{col}{tot_row}"].fill = fill_total
        ws1[f"{col}{tot_row}"].border = border_totals
        
    for col_letter in ['D', 'E', 'F', 'G', 'H', 'I', 'J']:
        cell = ws1[f"{col_letter}{tot_row}"]
        cell.value = f"=SUM({col_letter}{start_row}:{col_letter}{last_data_row})"
        cell.number_format = "0.00"
        cell.font = font_grand_total
        cell.fill = fill_total
        cell.alignment = align_center
        cell.border = border_totals
        
    cell_grand = ws1[f"K{tot_row}"]
    cell_grand.value = f"=SUM(D{tot_row}:J{tot_row})"
    cell_grand.number_format = "0.00"
    cell_grand.font = font_grand_total
    cell_grand.fill = fill_total
    cell_grand.alignment = align_right
    cell_grand.border = border_totals

    # --- Comments / Notes & Remarks Box (Rows 25-28) ---
    ws1.row_dimensions[25].height = 18
    ws1.merge_cells('A25:K25')
    c_hdr = ws1['A25']
    c_hdr.value = "COMMENTS / NOTES & REMARKS"
    c_hdr.font = font_th
    c_hdr.fill = fill_box_header
    c_hdr.alignment = align_left
    for col in ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']:
        ws1[f"{col}25"].border = Border(top=bd_dark_thin, bottom=bd_thin, left=bd_dark_thin if col=='A' else None, right=bd_dark_thin if col=='K' else None)
        ws1[f"{col}25"].fill = fill_box_header
        
    ws1.merge_cells('A26:K28')
    c_body = ws1['A26']
    c_body.value = "Completed rework on harness bracket PRJ-23-034B3 per ECO-1049. Shop 5S completed on Wednesday afternoon."
    c_body.font = font_body
    c_body.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
    for r in range(26, 29):
        ws1.row_dimensions[r].height = 18
        for col in ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']:
            ws1[f"{col}{r}"].border = Border(
                left=bd_dark_thin if col == 'A' else None,
                right=bd_dark_thin if col == 'K' else None,
                bottom=bd_dark_thin if r == 28 else None
            )

    # --- Approval Section (Rows 30-33) ---
    ws1.row_dimensions[30].height = 20
    ws1['A30'] = "Job allocation approved by:"
    ws1['A30'].font = font_total
    ws1['A30'].alignment = align_left
    
    ws1.merge_cells('C30:F30')
    ws1['C30'] = "Signature: ____________________________________"
    ws1['C30'].font = font_body
    ws1['C30'].alignment = align_left
    
    ws1.merge_cells('H30:J30')
    ws1['H30'] = "Date: ____________________"
    ws1['H30'].font = font_body
    ws1['H30'].alignment = align_left

    ws1.row_dimensions[32].height = 16
    ws1.merge_cells('A32:K32')
    ws1['A32'] = "Approved timesheets must be delivered to Lisa every Monday morning"
    ws1['A32'].font = font_notice
    ws1['A32'].alignment = align_left

    ws1.row_dimensions[33].height = 16
    ws1.merge_cells('A33:F33')
    ws1['A33'] = "Flux MES  •  Timesheet ID: FLX-2026-W44  •  Status: SUBMITTED"
    ws1['A33'].font = font_audit
    ws1['A33'].alignment = align_left
    
    ws1.merge_cells('H33:K33')
    ws1['H33'] = f"Generated: {datetime.date.today().strftime('%m/%d/%Y')}"
    ws1['H33'].font = font_audit
    ws1['H33'].alignment = Alignment(horizontal="right", vertical="center")

    # =============================================================
    # SHEET 2: CLASSIC FORMAT (Matching legacy timesheet-example.xlsx)
    # =============================================================
    ws2 = wb.create_sheet(title="Classic Schedule")
    ws2.views.sheetView[0].showGridLines = True
    
    ws2.page_setup.orientation = ws2.ORIENTATION_LANDSCAPE
    ws2.page_setup.paperSize = ws2.PAPERSIZE_LETTER
    ws2.page_setup.fitToPage = True
    ws2.page_setup.fitToWidth = 1
    ws2.page_setup.fitToHeight = 1
    ws2.sheet_properties.pageSetUpPr.fitToPage = True
    ws2.page_margins.left = 0.4
    ws2.page_margins.right = 0.4
    ws2.page_margins.top = 0.4
    ws2.page_margins.bottom = 0.4
    
    c_widths2 = {
        'A': 28,  # Job # & Segment
        'B': 12,  # Sun
        'C': 12,  # Mon
        'D': 12,  # Tue
        'E': 12,  # Wed
        'F': 12,  # Thu
        'G': 12,  # Fri
        'H': 12,  # Sat
        'I': 13,  # Total
    }
    for col_letter, w in c_widths2.items():
        ws2.column_dimensions[col_letter].width = w

    ws2.row_dimensions[1].height = 42
    ws2.merge_cells('A1:C1')
    ws2['A1'] = "EMPLOYEE NAME:      Lucas Sinclair"
    ws2['A1'].font = Font(name="Calibri", size=11, bold=True)
    ws2['A1'].alignment = Alignment(horizontal="left", vertical="center")
    
    ws2.merge_cells('D1:I1')
    ws2['D1'] = "Weekly Job Schedule"
    ws2['D1'].font = Font(name="Calibri", size=14, bold=True)
    ws2['D1'].alignment = Alignment(horizontal="center", vertical="center")
    
    ws2.row_dimensions[2].height = 24
    ws2['A2'] = "Week Ending"
    ws2['A2'].font = Font(name="Calibri", size=10, bold=True)
    ws2['A2'].alignment = Alignment(horizontal="right", vertical="center")
    
    ws2.merge_cells('B2:C2')
    ws2['B2'] = "=H5"
    ws2['B2'].font = Font(name="Calibri", size=10)
    ws2['B2'].number_format = "mmmm d, yyyy"
    ws2['B2'].alignment = Alignment(horizontal="left", vertical="center")
    
    ws2.row_dimensions[3].height = 20
    ws2.merge_cells('B3:H3')
    ws2['B3'] = "Please add brackets () to time over 40 hours"
    ws2['B3'].font = Font(name="Calibri", size=9.5, italic=True)
    ws2['B3'].alignment = Alignment(horizontal="center", vertical="center")
    
    # Header: Sun..Sat, Total
    ws2.row_dimensions[4].height = 22
    for c_idx, (col_letter, text) in enumerate([
        ('B', 'Sun'), ('C', 'Mon'), ('D', 'Tue'), ('E', 'Wed'),
        ('F', 'Thu'), ('G', 'Fri'), ('H', 'Sat'), ('I', 'Total')
    ]):
        cell = ws2[f"{col_letter}4"]
        cell.value = text
        cell.font = Font(name="Calibri", size=10, bold=True)
        cell.alignment = align_center
        cell.border = Border(top=bd_medium, bottom=bd_thin, left=bd_thin, right=bd_thin)
        cell.fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")

    # Date Row
    ws2.row_dimensions[5].height = 20
    ws2['A5'] = "Date"
    ws2['A5'].font = Font(name="Calibri", size=10, bold=True)
    ws2['A5'].border = Border(top=bd_thin, bottom=bd_medium, left=bd_thin, right=bd_thin)
    ws2['A5'].fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")
    
    ws2['B5'] = base_sunday
    ws2['B5'].number_format = "m/d/yy"
    ws2['B5'].font = Font(name="Calibri", size=10, bold=True)
    ws2['B5'].alignment = align_center
    ws2['B5'].border = Border(top=bd_thin, bottom=bd_medium, left=bd_thin, right=bd_thin)
    ws2['B5'].fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")
    
    prev_c = 'B'
    for c_letter in ['C', 'D', 'E', 'F', 'G', 'H']:
        cell = ws2[f"{c_letter}5"]
        cell.value = f"={prev_c}5+1"
        cell.number_format = "m/d/yy"
        cell.font = Font(name="Calibri", size=10, bold=True)
        cell.alignment = align_center
        cell.border = Border(top=bd_thin, bottom=bd_medium, left=bd_thin, right=bd_thin)
        cell.fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")
        prev_c = c_letter
        
    ws2['I5'].border = Border(top=bd_thin, bottom=bd_medium, left=bd_thin, right=bd_thin)
    ws2['I5'].fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")

    # Time in / Time Out / Lunch
    shifts = [
        ("Time In:", [None, "07:00", "07:00", "08:00", "07:15", "07:15", "09:00"]),
        ("Time Out:", [None, "17:45", "19:15", "17:45", "19:10", "15:45", "12:00"]),
        ("Lunch (in minutes)", [None, 30, 30, 30, 30, 30, 0]),
    ]
    for s_idx, (label, vals) in enumerate(shifts):
        row_n = 6 + s_idx
        ws2.row_dimensions[row_n].height = 20
        ws2[f"A{row_n}"] = label
        ws2[f"A{row_n}"].font = Font(name="Calibri", size=10)
        ws2[f"A{row_n}"].alignment = Alignment(horizontal="right", vertical="center")
        ws2[f"A{row_n}"].border = border_grid
        for c_idx, c_letter in enumerate(['B', 'C', 'D', 'E', 'F', 'G', 'H']):
            cell = ws2[f"{c_letter}{row_n}"]
            val = vals[c_idx]
            if val is not None:
                cell.value = val
            cell.font = Font(name="Calibri", size=10)
            cell.alignment = align_center
            cell.border = border_grid
        ws2[f"I{row_n}"].border = border_grid

    # Section Header
    ws2.row_dimensions[9].height = 20
    ws2['A9'] = "Job # & Segment"
    ws2['A9'].font = Font(name="Calibri", size=10, bold=True)
    ws2['A9'].border = border_grid
    for col in ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']:
        ws2[f"{col}9"].border = border_grid

    # Classic rows 10-38
    classic_samples = [
        ("Shop", [None, 2, 2.5, 3, 2.25, 2, 3]),
        ("Training", [None, 2, 2, 2, 2, 1, None]),
        ("22-003A1 - EP", [None, 2.25, 4, 1, None, None, None]),
        ("22-045 EP", [None, 2, 2.75, 1, 4, 1, None]),
        ("22-139A2 - EP", [None, 1, None, 1.25, 0.5, 2, None]),
        ("22-139A1 - EP", [None, 1, None, 1, 0.5, 2, None]),
        ("23-034CD2 - EP", [None, None, None, None, 1, None, None]),
        ("23-034B3 - EP", [None, None, None, None, 1, None, None]),
    ]
    for r_offset in range(29):
        r_n = 10 + r_offset
        ws2.row_dimensions[r_n].height = 20
        has_sample = r_offset < len(classic_samples)
        name, hrs = classic_samples[r_offset] if has_sample else ("", [None]*7)
        ws2[f"A{r_n}"] = name
        ws2[f"A{r_n}"].font = Font(name="Calibri", size=10)
        ws2[f"A{r_n}"].border = border_grid
        for c_idx, c_letter in enumerate(['B', 'C', 'D', 'E', 'F', 'G', 'H']):
            cell = ws2[f"{c_letter}{r_n}"]
            if hrs[c_idx] is not None:
                cell.value = hrs[c_idx]
            cell.font = Font(name="Calibri", size=10)
            cell.alignment = align_center
            cell.border = border_grid
        ws2[f"I{r_n}"] = f"=SUM(B{r_n}:H{r_n})"
        ws2[f"I{r_n}"].font = Font(name="Calibri", size=10)
        ws2[f"I{r_n}"].alignment = align_right
        ws2[f"I{r_n}"].border = border_grid

    # Total row (Row 39)
    ws2.row_dimensions[39].height = 24
    ws2['A39'] = "TOTAL"
    ws2['A39'].font = Font(name="Calibri", size=11, bold=True)
    ws2['A39'].border = Border(top=bd_medium, bottom=bd_double, left=bd_thin, right=bd_thin)
    for c_letter in ['B', 'C', 'D', 'E', 'F', 'G', 'H']:
        cell = ws2[f"{c_letter}39"]
        cell.value = f"=SUM({c_letter}10:{c_letter}38)"
        cell.font = Font(name="Calibri", size=11, bold=True)
        cell.alignment = align_center
        cell.border = Border(top=bd_medium, bottom=bd_double, left=bd_thin, right=bd_thin)
    ws2['I39'] = "=SUM(B39:H39)"
    ws2['I39'].font = Font(name="Calibri", size=11, bold=True)
    ws2['I39'].alignment = align_right
    ws2['I39'].border = Border(top=bd_medium, bottom=bd_double, left=bd_thin, right=bd_thin)

    # Footer
    ws2.row_dimensions[40].height = 36
    ws2['A40'] = "Job allocation approved by: ____________________________________"
    ws2['A40'].font = Font(name="Calibri", size=10)
    ws2['A40'].alignment = Alignment(horizontal="left", vertical="center")

    ws2.row_dimensions[41].height = 20
    ws2['A41'] = "Approved timesheets must be delivered to Lisa every Monday morning"
    ws2['A41'].font = Font(name="Calibri", size=10, italic=True)
    ws2['A41'].alignment = Alignment(horizontal="left", vertical="center")

    # Save workbook
    output_path = "/home/justin/code/vtr/flux/flux-timesheet.xlsx"
    wb.save(output_path)
    print(f"Successfully generated {output_path}")

if __name__ == "__main__":
    build_timesheet()
