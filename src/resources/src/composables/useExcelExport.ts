export interface ExcelSheetData {
  name: string;
  data: Record<string, unknown>[];
  headers?: string[];
}

export interface ExcelExportOptions {
  colWidths?: number[];
  fitToWidth?: boolean;
}

export function useExcelExport() {
  /**
   * Export a single sheet of JSON rows to an XLSX workbook file.
   * Lazily imports XLSX to keep the initial client bundle lightweight.
   */
  const exportSingleSheet = async <T extends Record<string, unknown>>(
    rows: T[],
    sheetName: string,
    fileName: string,
    options?: ExcelExportOptions
  ) => {
    if (!rows || rows.length === 0) return;
    const XLSX = await import("xlsx");
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
