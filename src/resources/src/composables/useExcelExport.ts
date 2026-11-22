export interface ExcelSheetData {
  name: string;
  data: Record<string, unknown>[];
  headers?: string[];
}

export interface ExcelExportOptions {
  colWidths?: number[];
  fitToWidth?: boolean;
  alignments?: Record<string, "left" | "center" | "right">;
  headerAlignments?: Record<string, "left" | "center" | "right">;
  metaRows?: Array<[string, string]>; // Top informational rows e.g. [["Tax Period:", "2026-10"], ["Reference:", "Mr. Satish"]]
}

export function useExcelExport() {
  /**
   * Export a single sheet of JSON rows to an XLSX workbook file.
   * Uses xlsx-js-style for complete cell styling (alignment, bold headers, borders, page setup).
   */
  const exportSingleSheet = async <T extends Record<string, unknown>>(
    rows: T[],
    sheetName: string,
    fileName: string,
    options?: ExcelExportOptions
  ) => {
    if (!rows || rows.length === 0) return;
    const XLSX = await import("xlsx-js-style");
    
    // Check if metaRows are provided
    const hasMeta = options?.metaRows && options.metaRows.length > 0;
    let ws: any;
    let headerRowIndex = 0;

    if (hasMeta && options?.metaRows) {
      const metaArray: any[][] = [];
      for (const [lbl, val] of options.metaRows) {
        metaArray.push([lbl, val]);
      }
      metaArray.push([]); // blank separator row
      headerRowIndex = metaArray.length;

      // Create sheet starting with metaArray
      ws = XLSX.utils.aoa_to_sheet(metaArray);

      // Append table data (header + rows)
      XLSX.utils.sheet_add_json(ws, rows, { origin: headerRowIndex });
    } else {
      ws = XLSX.utils.json_to_sheet(rows);
    }

    // Apply custom column widths if provided or auto-compute based on content
    if (options?.colWidths) {
      ws["!cols"] = options.colWidths.map((wch) => ({ wch }));
    } else if (rows.length > 0) {
      // Auto-compute column widths nicely fitting A4
      const keys = Object.keys(rows[0]);
      ws["!cols"] = keys.map((key) => {
        let maxLen = key.length;
        for (const row of rows) {
          const val = row[key];
          if (val !== undefined && val !== null) {
            maxLen = Math.max(maxLen, String(val).length);
          }
        }
        return { wch: Math.min(Math.max(maxLen + 3, 10), 45) };
      });
    }

    // Apply alignments and styling across meta, header and data cells
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    const keys = Object.keys(rows[0] || {});

    // Style meta rows if present
    if (hasMeta) {
      for (let R = 0; R < headerRowIndex - 1; ++R) {
        const lblAddress = XLSX.utils.encode_cell({ r: R, c: 0 });
        const valAddress = XLSX.utils.encode_cell({ r: R, c: 1 });
        if (ws[lblAddress]) {
          ws[lblAddress].s = {
            font: { bold: true, name: "Calibri", sz: 11, color: { rgb: "374151" } },
            alignment: { horizontal: "left", vertical: "center" }
          };
        }
        if (ws[valAddress]) {
          ws[valAddress].s = {
            font: { bold: true, name: "Calibri", sz: 11, color: { rgb: "111827" } },
            alignment: { horizontal: "left", vertical: "center" }
          };
        }
      }
    }

    for (let R = headerRowIndex; R <= range.e.r; ++R) {
      const isHeader = R === headerRowIndex;
      const isLastRow = R === range.e.r;

      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellAddress];
        if (!cell) continue;

        const colKey = keys[C];
        let horizontalAlign: "left" | "center" | "right" = "left";

        if (isHeader) {
          horizontalAlign = options?.headerAlignments?.[colKey] || options?.alignments?.[colKey] || "left";
          cell.s = {
            fill: { fgColor: { rgb: "F1F5F9" } },
            font: { bold: true, name: "Calibri", sz: 11, color: { rgb: "1E293B" } },
            alignment: { horizontal: horizontalAlign, vertical: "center", wrapText: true },
            border: {
              top: { style: "thin", color: { rgb: "94A3B8" } },
              bottom: { style: "medium", color: { rgb: "0F172A" } },
              left: { style: "thin", color: { rgb: "CBD5E1" } },
              right: { style: "thin", color: { rgb: "CBD5E1" } }
            }
          };
        } else {
          const rowData = rows[R - headerRowIndex - 1];
          const isTotalRow =
            (rowData &&
              Object.values(rowData).some(
                (val) =>
                  typeof val === "string" &&
                  (val.includes("Total =") || val.includes("Subtotal =") || val.startsWith("Total") || val.startsWith("Subtotal"))
              )) ||
            String(cell.v).includes("Total =") ||
            String(cell.v).includes("Subtotal =");

          horizontalAlign = options?.alignments?.[colKey] || (typeof cell.v === "number" ? "right" : "left");
          const shouldWrap = typeof cell.v === "string" && cell.v.includes("\n");

          cell.s = {
            fill: isTotalRow ? { fgColor: { rgb: "F8FAFC" } } : undefined,
            font: {
              bold: isTotalRow,
              name: "Calibri",
              sz: 11,
              color: isTotalRow ? { rgb: "0F172A" } : { rgb: "1E293B" }
            },
            alignment: {
              horizontal: horizontalAlign,
              vertical: "center",
              wrapText: shouldWrap || isTotalRow
            },
            border: {
              top: { style: isTotalRow ? "thin" : "hair", color: { rgb: isTotalRow ? "0F172A" : "CBD5E1" } },
              bottom: { style: isTotalRow ? "double" : "hair", color: { rgb: isTotalRow ? "0F172A" : "CBD5E1" } },
              left: { style: "thin", color: { rgb: "E2E8F0" } },
              right: { style: "thin", color: { rgb: "E2E8F0" } }
            }
          };

          // Format numeric currency columns nicely with commas and 2 decimals
          if (typeof cell.v === "number") {
            cell.z = "#,##0.00";
          }
        }
      }
    }

    // Set row heights: header row and multi-line rows
    const rowHeights: Array<{ hpt: number }> = [];
    for (let R = 0; R <= range.e.r; ++R) {
      if (R < headerRowIndex) {
        rowHeights.push({ hpt: 20 });
      } else if (R === headerRowIndex) {
        rowHeights.push({ hpt: 26 }); // header height
      } else {
        const rowData = rows[R - headerRowIndex - 1];
        const hasMultiline = rowData && Object.values(rowData).some((val) => typeof val === "string" && val.includes("\n"));
        rowHeights.push({ hpt: hasMultiline ? 32 : 22 });
      }
    }
    ws["!rows"] = rowHeights;

    // Page setup for printing on A4 nicely
    ws["!pageSetup"] = {
      paperSize: 9, // 9 = A4 paper
      orientation: "portrait",
      fitToWidth: 1,
      fitToHeight: 0
    };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    const fullFileName = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
    XLSX.writeFile(wb, fullFileName);
  };

  /**
   * Export multiple sheets to a single XLSX workbook file.
   * Lazily imports XLSX to keep the initial client bundle lightweight.
   */
  const exportMultipleSheets = async (sheets: ExcelSheetData[], fileName: string) => {
    if (!sheets || sheets.length === 0) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    for (const sheet of sheets) {
      const opts = sheet.headers ? { header: sheet.headers } : undefined;
      const ws = XLSX.utils.json_to_sheet(sheet.data, opts);
      XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
    }
    const fullFileName = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
    XLSX.writeFile(wb, fullFileName);
  };

  return {
    exportSingleSheet,
    exportMultipleSheets
  };
}
