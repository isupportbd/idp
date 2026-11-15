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
    const ws = XLSX.utils.json_to_sheet(rows);

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

    // Apply alignments and styling across header and data cells
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    const keys = Object.keys(rows[0] || {});

    for (let R = range.s.r; R <= range.e.r; ++R) {
      const isHeader = R === range.s.r;
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
            font: { bold: true, name: "Calibri", sz: 11 },
            alignment: { horizontal: horizontalAlign, vertical: "center" },
            border: {
              top: { style: "thin", color: { rgb: "D1D5DB" } },
              bottom: { style: "thin", color: { rgb: "000000" } },
              left: { style: "thin", color: { rgb: "D1D5DB" } },
              right: { style: "thin", color: { rgb: "D1D5DB" } }
            }
          };
        } else {
          horizontalAlign = options?.alignments?.[colKey] || "left";
          const isTotalRow = String(cell.v).includes("Total =") || (isLastRow && rows[rows.length - 1]?.["Client"] === "Total =");
          
          cell.s = {
            font: {
              bold: isTotalRow,
              name: "Calibri",
              sz: 11
            },
            alignment: { horizontal: horizontalAlign, vertical: "center" },
            border: {
              top: { style: isTotalRow ? "thin" : "hair", color: { rgb: "D1D5DB" } },
              bottom: { style: isTotalRow ? "double" : "hair", color: { rgb: isTotalRow ? "000000" : "D1D5DB" } },
              left: { style: "thin", color: { rgb: "E5E7EB" } },
              right: { style: "thin", color: { rgb: "E5E7EB" } }
            }
          };

          // Format numeric currency columns nicely
          if (typeof cell.v === "number") {
            cell.z = "#,##0.00";
          }
        }
      }
    }

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
