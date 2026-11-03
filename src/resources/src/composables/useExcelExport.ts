export interface ExcelSheetData {
  name: string;
  data: Record<string, unknown>[];
  headers?: string[];
}

export function useExcelExport() {
  /**
   * Export a single sheet of JSON rows to an XLSX workbook file.
   * Lazily imports XLSX to keep the initial client bundle lightweight.
   */
  const exportSingleSheet = async <T extends Record<string, unknown>>(rows: T[], sheetName: string, fileName: string) => {
    if (!rows || rows.length === 0) return;
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(rows);
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
